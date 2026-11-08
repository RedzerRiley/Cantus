import os

from django.contrib.auth import authenticate, get_user_model, password_validation
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.fields import empty
from rest_framework.utils import html

from .models import Language, Lineup, LineupItem, Membership, Song, Tag, Workspace
from .services import get_membership
from .validators import validate_song_file

User = get_user_model()

NULL_STRINGS = ("null", "none")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def workspace_from_context(context):
    workspace = context.get("workspace")
    if workspace is not None:
        return workspace
    request = context.get("request")
    membership = get_membership(getattr(request, "user", None))
    if membership is None:
        raise PermissionDenied("You are not a member of any workspace.")
    return membership.workspace


def password_errors(password, user=None):
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as exc:
        return list(exc.messages)
    return []


class WorkspaceScopedPKField(serializers.PrimaryKeyRelatedField):
    """PrimaryKeyRelatedField limited to objects of the requesting user's
    workspace. Ids from other workspaces fail with "object does not exist".
    Multipart-friendly: "" and "null" become None."""

    def __init__(self, model=None, **kwargs):
        self.scoped_model = model
        super().__init__(**kwargs)

    def get_queryset(self):
        return self.scoped_model.objects.filter(
            workspace=workspace_from_context(self.context)
        )

    def run_validation(self, data=empty):
        if isinstance(data, str) and data.strip().lower() in NULL_STRINGS + ("",):
            data = None
        return super().run_validation(data)


class TagIdsField(serializers.Field):
    """Write-only list of tag ids. Accepts a JSON array, a comma-separated
    string, or repeated multipart keys. Returns a list of Tag instances."""

    default_error_messages = {
        "invalid": "Expected a list of tag ids or a comma-separated string.",
        "invalid_id": 'Invalid pk "{value}" - object does not exist.',
        "not_int": "A valid integer is required.",
    }

    def __init__(self, **kwargs):
        kwargs.setdefault("write_only", True)
        super().__init__(**kwargs)

    def get_value(self, dictionary):
        if html.is_html_input(dictionary):
            # multipart / form data: repeated keys and/or "1,2,3"
            if self.field_name not in dictionary:
                return empty
            return dictionary.getlist(self.field_name)
        return dictionary.get(self.field_name, empty)

    def to_internal_value(self, data):
        if isinstance(data, (str, int)):
            raw_items = [data]
        elif isinstance(data, (list, tuple)):
            raw_items = list(data)
        else:
            self.fail("invalid")

        ids = []
        for item in raw_items:
            if isinstance(item, bool):
                self.fail("not_int")
            if isinstance(item, int):
                parts = [item]
            elif isinstance(item, str):
                parts = [p.strip() for p in item.split(",") if p.strip()]
            else:
                self.fail("invalid")
            for part in parts:
                try:
                    value = int(part)
                except (TypeError, ValueError):
                    self.fail("not_int")
                if value not in ids:
                    ids.append(value)

        if not ids:
            return []
        workspace = workspace_from_context(self.context)
        found = {t.id: t for t in Tag.objects.filter(workspace=workspace, id__in=ids)}
        missing = [i for i in ids if i not in found]
        if missing:
            self.fail("invalid_id", value=missing[0])
        return [found[i] for i in ids]

    def to_representation(self, value):  # pragma: no cover - write-only
        return [t.id for t in value.all()] if hasattr(value, "all") else value


class SongFileField(serializers.FileField):
    """FileField where "" / "null" (multipart) mean "no file sent"."""

    def validate_empty_values(self, data):
        if isinstance(data, str) and data.strip().lower() in NULL_STRINGS + ("",):
            data = None
        return super().validate_empty_values(data)


class TagRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name"]


# ---------------------------------------------------------------------------
# Auth / me
# ---------------------------------------------------------------------------


class MeSerializer(serializers.ModelSerializer):
    preferred_language = WorkspaceScopedPKField(
        model=Language,
        source="membership.preferred_language",
        allow_null=True,
        required=False,
    )
    role = serializers.CharField(source="membership.role", read_only=True)
    workspace = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "preferred_language",
            "role",
            "workspace",
        ]
        read_only_fields = ["id", "username"]

    def get_workspace(self, user):
        membership = get_membership(user)
        if membership is None:
            return None
        return {"id": membership.workspace_id, "name": membership.workspace.name}

    def update(self, instance, validated_data):
        membership_data = validated_data.pop("membership", {})
        for attr in ("email", "first_name", "last_name"):
            if attr in validated_data:
                setattr(instance, attr, validated_data[attr])
        with transaction.atomic():
            instance.save()
            if "preferred_language" in membership_data:
                membership = instance.membership
                membership.preferred_language = membership_data["preferred_language"]
                membership.save(update_fields=["preferred_language"])
        return instance


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    workspace_name = serializers.CharField(max_length=120)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with that username already exists.")
        return value

    def validate(self, attrs):
        candidate = User(
            username=attrs.get("username", ""),
            email=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        errors = password_errors(attrs.get("password", ""), candidate)
        if errors:
            raise serializers.ValidationError({"password": errors})
        return attrs


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError("Invalid username or password.", code="authorization")
        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        errors = password_errors(value, self.context["request"].user)
        if errors:
            raise serializers.ValidationError(errors)
        return value


# ---------------------------------------------------------------------------
# Workspace & members
# ---------------------------------------------------------------------------


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "created_at"]
        read_only_fields = ["id", "created_at"]


class MemberSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="membership.role", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "date_joined"]
        read_only_fields = fields


class MemberCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    role = serializers.ChoiceField(choices=Membership.Role.choices, default=Membership.Role.MEMBER)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with that username already exists.")
        return value

    def validate(self, attrs):
        candidate = User(
            username=attrs.get("username", ""),
            email=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        errors = password_errors(attrs.get("password", ""), candidate)
        if errors:
            raise serializers.ValidationError({"password": errors})
        return attrs

    def create(self, validated_data):
        workspace = workspace_from_context(self.context)
        role = validated_data.pop("role")
        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data["username"],
                password=validated_data["password"],
                email=validated_data.get("email", ""),
                first_name=validated_data.get("first_name", ""),
                last_name=validated_data.get("last_name", ""),
            )
            Membership.objects.create(user=user, workspace=workspace, role=role)
        return user


class MemberUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Membership.Role.choices)


# ---------------------------------------------------------------------------
# Languages & tags
# ---------------------------------------------------------------------------


class _NamedWorkspaceObjectSerializer(serializers.ModelSerializer):
    song_count = serializers.SerializerMethodField()
    duplicate_message = "An item with this name already exists."

    def get_song_count(self, obj):
        value = getattr(obj, "song_count", None)
        if value is None:
            value = obj.songs.count()
        return value

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        workspace = workspace_from_context(self.context)
        qs = self.Meta.model.objects.filter(workspace=workspace, name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(self.duplicate_message)
        return value


class LanguageSerializer(_NamedWorkspaceObjectSerializer):
    duplicate_message = "A language with this name already exists."

    class Meta:
        model = Language
        fields = ["id", "name", "song_count"]


class TagSerializer(_NamedWorkspaceObjectSerializer):
    duplicate_message = "A tag with this name already exists."

    class Meta:
        model = Tag
        fields = ["id", "name", "song_count"]


# ---------------------------------------------------------------------------
# Songs
# ---------------------------------------------------------------------------


class SongSerializer(serializers.ModelSerializer):
    language = WorkspaceScopedPKField(model=Language, allow_null=True, required=False)
    language_name = serializers.SerializerMethodField()
    tags = TagRefSerializer(many=True, read_only=True)
    tag_ids = TagIdsField(required=False)
    file = SongFileField(
        write_only=True, required=False, allow_null=True, validators=[validate_song_file]
    )
    remove_file = serializers.BooleanField(write_only=True, required=False)
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    file_type = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()
    lineup_count = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = [
            "id",
            "title",
            "composer",
            "language",
            "language_name",
            "key",
            "notes",
            "color",
            "tags",
            "tag_ids",
            "file",
            "remove_file",
            "file_name",
            "file_size",
            "file_type",
            "has_file",
            "lineup_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    # --- read helpers -----------------------------------------------------

    def get_language_name(self, obj):
        return obj.language.name if obj.language_id else None

    def get_has_file(self, obj):
        return bool(obj.file)

    def get_file_name(self, obj):
        if not obj.file:
            return None
        return obj.file_name or os.path.basename(obj.file.name)

    def get_file_size(self, obj):
        return obj.file_size if obj.file else None

    def get_file_type(self, obj):
        if not obj.file:
            return None
        ext = os.path.splitext(obj.file_name or obj.file.name)[1].lower().lstrip(".")
        return ext or None

    def get_lineup_count(self, obj):
        value = getattr(obj, "lineup_count", None)
        if value is None:
            value = obj.lineup_items.values("lineup_id").distinct().count()
        return value

    # --- write ------------------------------------------------------------

    @staticmethod
    def _apply_upload(song, upload):
        song.file = upload
        song.file_name = os.path.basename(upload.name or "")[:255]
        song.file_size = upload.size

    @staticmethod
    def _clear_file(song):
        song.file = ""
        song.file_name = ""
        song.file_size = None

    def create(self, validated_data):
        tags = validated_data.pop("tag_ids", None)
        validated_data.pop("remove_file", None)
        upload = validated_data.pop("file", None)
        request = self.context.get("request")
        song = Song(
            workspace=workspace_from_context(self.context),
            created_by=getattr(request, "user", None),
            **validated_data,
        )
        if upload:
            self._apply_upload(song, upload)
        with transaction.atomic():
            song.save()
            if tags:
                song.tags.set(tags)
        return song

    def update(self, instance, validated_data):
        tags = validated_data.pop("tag_ids", None)
        remove_file = validated_data.pop("remove_file", False)
        upload = validated_data.pop("file", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if upload:
            self._apply_upload(instance, upload)
        elif remove_file:
            self._clear_file(instance)
        # Old files are deleted from storage by signals after commit.
        with transaction.atomic():
            instance.save()
            if tags is not None:
                instance.tags.set(tags)
        return instance


class SongBriefSerializer(serializers.ModelSerializer):
    language_name = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = ["id", "title", "composer", "key", "color", "language_name", "has_file"]
        read_only_fields = fields

    def get_language_name(self, obj):
        return obj.language.name if obj.language_id else None

    def get_has_file(self, obj):
        return bool(obj.file)


# ---------------------------------------------------------------------------
# Lineups
# ---------------------------------------------------------------------------


class LineupItemSerializer(serializers.ModelSerializer):
    song = WorkspaceScopedPKField(model=Song)
    song_detail = SongBriefSerializer(source="song", read_only=True)

    class Meta:
        model = LineupItem
        fields = ["id", "position", "song", "song_detail", "label", "key", "notes", "assigned_to"]
        read_only_fields = ["id", "position"]

    def validate(self, attrs):
        # In PATCH requests DRF treats nested fields as partial too; an item
        # without a song is never valid because items are fully replaced.
        if attrs.get("song") is None:
            raise serializers.ValidationError({"song": ["This field is required."]})
        return attrs


LINEUP_BASE_FIELDS = [
    "id",
    "name",
    "description",
    "default_language",
    "default_language_name",
    "color",
    "tags",
    "item_count",
    "created_at",
    "updated_at",
    "last_used_at",
]


class LineupBaseSerializer(serializers.ModelSerializer):
    default_language = WorkspaceScopedPKField(model=Language, allow_null=True, required=False)
    default_language_name = serializers.SerializerMethodField()
    tags = TagRefSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Lineup
        fields = LINEUP_BASE_FIELDS
        read_only_fields = ["id", "created_at", "updated_at", "last_used_at"]

    def get_default_language_name(self, obj):
        return obj.default_language.name if obj.default_language_id else None

    def get_item_count(self, obj):
        value = getattr(obj, "item_count", None)
        if value is None:
            value = len(obj.items.all())
        return value


class LineupSummarySerializer(LineupBaseSerializer):
    preview_titles = serializers.SerializerMethodField()

    class Meta(LineupBaseSerializer.Meta):
        fields = LINEUP_BASE_FIELDS + ["preview_titles"]

    def get_preview_titles(self, obj):
        # Uses the prefetched, position-ordered items when available.
        items = list(obj.items.all())[:3]
        return [item.song.title for item in items]


class LineupSerializer(LineupBaseSerializer):
    tag_ids = TagIdsField(required=False)
    items = LineupItemSerializer(many=True, required=False)

    class Meta(LineupBaseSerializer.Meta):
        fields = LINEUP_BASE_FIELDS + ["tag_ids", "items", "share_token"]
        read_only_fields = LineupBaseSerializer.Meta.read_only_fields + ["share_token"]

    @staticmethod
    def _replace_items(lineup, items):
        lineup.items.all().delete()
        LineupItem.objects.bulk_create(
            [
                LineupItem(
                    lineup=lineup,
                    position=index,
                    song=item["song"],
                    label=item.get("label", ""),
                    key=item.get("key", ""),
                    notes=item.get("notes", ""),
                    assigned_to=item.get("assigned_to", ""),
                )
                for index, item in enumerate(items)
            ]
        )

    def create(self, validated_data):
        items = validated_data.pop("items", [])
        tags = validated_data.pop("tag_ids", None)
        request = self.context.get("request")
        with transaction.atomic():
            lineup = Lineup.objects.create(
                workspace=workspace_from_context(self.context),
                created_by=getattr(request, "user", None),
                **validated_data,
            )
            if tags:
                lineup.tags.set(tags)
            if items:
                self._replace_items(lineup, items)
        return lineup

    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        tags = validated_data.pop("tag_ids", None)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()  # bumps updated_at even if only items changed
            if tags is not None:
                instance.tags.set(tags)
            if items is not None:
                self._replace_items(instance, items)
        return instance


class LineupDuplicateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True)


# ---------------------------------------------------------------------------
# Public (shared link) — read-only, no internal/workspace details
# ---------------------------------------------------------------------------


class PublicLineupItemSerializer(serializers.ModelSerializer):
    song_detail = SongBriefSerializer(source="song", read_only=True)

    class Meta:
        model = LineupItem
        fields = ["id", "position", "song", "song_detail", "label", "key", "notes"]
        read_only_fields = fields


class PublicLineupSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    items = PublicLineupItemSerializer(many=True, read_only=True)

    class Meta:
        model = Lineup
        fields = ["name", "description", "color", "workspace_name", "updated_at", "items"]
        read_only_fields = fields
