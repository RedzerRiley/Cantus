import mimetypes
import os
import secrets

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.db.models.functions import Lower
from django.http import FileResponse
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import Language, Lineup, LineupItem, Membership, Song, Tag
from .permissions import IsWorkspaceAdmin, IsWorkspaceMember
from .serializers import (
    ChangePasswordSerializer,
    LanguageSerializer,
    LineupDuplicateSerializer,
    LineupSerializer,
    LineupSummarySerializer,
    LoginSerializer,
    MemberCreateSerializer,
    MemberSerializer,
    MemberUpdateSerializer,
    MeSerializer,
    PublicLineupSerializer,
    RegisterSerializer,
    SongSerializer,
    TagSerializer,
    WorkspaceSerializer,
)
from .services import create_account_with_workspace, get_membership

User = get_user_model()

MEMBER_PERMISSIONS = [IsAuthenticated, IsWorkspaceMember]
ADMIN_PERMISSIONS = [IsAuthenticated, IsWorkspaceMember, IsWorkspaceAdmin]

TEXT_EXTENSIONS = {".txt", ".cho", ".chopro"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_int_param(request, name):
    raw = request.query_params.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        return int(raw)
    except ValueError:
        raise ValidationError({name: ["A valid integer is required."]}) from None


def parse_int_list_param(request, name):
    raw = request.query_params.get(name)
    if raw is None:
        return []
    values = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            value = int(part)
        except ValueError:
            raise ValidationError({name: ["Expected comma-separated integer ids."]}) from None
        if value not in values:
            values.append(value)
    return values


def song_file_response(song):
    """Stream a song's private file inline with a safe, extension-derived type."""
    if not song.file:
        raise NotFound("This song has no file attached.")
    storage = song.file.storage
    try:
        handle = storage.open(song.file.name, "rb")
    except (FileNotFoundError, OSError):
        raise NotFound("The file could not be found.") from None

    download_name = song.file_name or os.path.basename(song.file.name)
    ext = os.path.splitext(download_name)[1].lower() or os.path.splitext(song.file.name)[1].lower()
    if ext in TEXT_EXTENSIONS:
        content_type = "text/plain; charset=utf-8"
    else:
        content_type = mimetypes.guess_type(f"file{ext}")[0] or "application/octet-stream"

    response = FileResponse(
        handle,
        as_attachment=False,
        filename=download_name,
        content_type=content_type,
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response


def iso(dt):
    return serializers.DateTimeField().to_representation(dt)


class WorkspaceScopedMixin:
    """Common bits for views operating inside the user's workspace."""

    permission_classes = MEMBER_PERMISSIONS

    @property
    def membership(self):
        membership = get_membership(self.request.user)
        if membership is None:
            raise PermissionDenied("You are not a member of any workspace.")
        return membership

    @property
    def workspace(self):
        return self.membership.workspace

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = self.workspace
        return context


class RefetchOnWriteMixin:
    """After create/update, re-read the object through get_queryset() so the
    response includes annotations (counts) and prefetched relations."""

    read_serializer_class = None

    def _read_response(self, instance, status_code):
        instance = self.get_queryset().get(pk=instance.pk)
        serializer_class = self.read_serializer_class or self.get_serializer_class()
        data = serializer_class(instance, context=self.get_serializer_context()).data
        return Response(data, status=status_code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return self._read_response(instance, status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return self._read_response(instance, status.HTTP_200_OK)


class IgnoreClientContentNegotiation(BaseContentNegotiation):
    """Used by the file download: never 406 because of the Accept header."""

    def select_parser(self, request, parsers):
        return parsers[0] if parsers else None

    def select_renderer(self, request, renderers, format_suffix=None):
        return (renderers[0], renderers[0].media_type)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def auth_response(user, request, status_code):
    token, _ = Token.objects.get_or_create(user=user)
    user = User.objects.select_related("membership__workspace").get(pk=user.pk)
    return Response(
        {"token": token.key, "user": MeSerializer(user, context={"request": request}).data},
        status=status_code,
    )


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = create_account_with_workspace(
            username=data["username"],
            password=data["password"],
            workspace_name=data["workspace_name"],
            email=data.get("email", ""),
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
        )
        return auth_response(user, request, status.HTTP_201_CREATED)


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        if get_membership(user) is None:
            raise PermissionDenied("This account is not a member of any workspace.")
        return auth_response(user, request, status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = MEMBER_PERMISSIONS

    def _context(self, request):
        return {"request": request, "workspace": get_membership(request.user).workspace}

    def get(self, request):
        return Response(MeSerializer(request.user, context=self._context(request)).data)

    def patch(self, request):
        serializer = MeSerializer(
            request.user, data=request.data, partial=True, context=self._context(request)
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        user = User.objects.select_related("membership__workspace").get(pk=user.pk)
        return Response(MeSerializer(user, context=self._context(request)).data)


class ChangePasswordView(APIView):
    permission_classes = MEMBER_PERMISSIONS

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        # The auth token is left untouched so the current session stays valid.
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Workspace & members
# ---------------------------------------------------------------------------


class WorkspaceView(WorkspaceScopedMixin, APIView):
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [p() for p in MEMBER_PERMISSIONS]
        return [p() for p in ADMIN_PERMISSIONS]

    def get(self, request):
        return Response(WorkspaceSerializer(self.workspace).data)

    def patch(self, request):
        serializer = WorkspaceSerializer(self.workspace, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MemberViewSet(
    WorkspaceScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = MemberSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [p() for p in MEMBER_PERMISSIONS]
        return [p() for p in ADMIN_PERMISSIONS]

    def get_queryset(self):
        return (
            User.objects.filter(membership__workspace=self.workspace)
            .select_related("membership")
            .order_by("date_joined", "id")
        )

    def _admin_count(self):
        return Membership.objects.filter(
            workspace=self.workspace, role=Membership.Role.ADMIN
        ).count()

    def create(self, request, *args, **kwargs):
        serializer = MemberCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        user = self.get_queryset().get(pk=user.pk)
        return Response(MemberSerializer(user).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        target = self.get_object()
        serializer = MemberUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data["role"]
        with transaction.atomic():
            membership = Membership.objects.select_for_update().get(user=target)
            if (
                membership.role == Membership.Role.ADMIN
                and new_role != Membership.Role.ADMIN
            ):
                # Lock the workspace's admin rows to avoid racing demotions.
                admins = list(
                    Membership.objects.select_for_update()
                    .filter(workspace=self.workspace, role=Membership.Role.ADMIN)
                    .values_list("pk", flat=True)
                )
                if len(admins) <= 1:
                    raise ValidationError(
                        {"role": ["A workspace must have at least one admin."]}
                    )
            membership.role = new_role
            membership.save(update_fields=["role"])
        target = self.get_queryset().get(pk=target.pk)
        return Response(MemberSerializer(target).data)

    def destroy(self, request, *args, **kwargs):
        target = self.get_object()
        if target.pk == request.user.pk:
            raise ValidationError({"non_field_errors": ["You cannot delete your own account."]})
        with transaction.atomic():
            if target.membership.role == Membership.Role.ADMIN:
                admins = list(
                    Membership.objects.select_for_update()
                    .filter(workspace=self.workspace, role=Membership.Role.ADMIN)
                    .values_list("pk", flat=True)
                )
                if len(admins) <= 1:
                    raise ValidationError(
                        {"non_field_errors": ["A workspace must have at least one admin."]}
                    )
            target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Languages & tags
# ---------------------------------------------------------------------------


class _NamedWorkspaceObjectViewSet(WorkspaceScopedMixin, viewsets.ModelViewSet):
    pagination_class = None
    model = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return (
            self.model.objects.filter(workspace=self.workspace)
            .annotate(song_count=Count("songs", distinct=True))
            .order_by(Lower("name"), "id")
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.workspace)


class LanguageViewSet(_NamedWorkspaceObjectViewSet):
    model = Language
    serializer_class = LanguageSerializer


class TagViewSet(_NamedWorkspaceObjectViewSet):
    model = Tag
    serializer_class = TagSerializer


# ---------------------------------------------------------------------------
# Songs
# ---------------------------------------------------------------------------

SONG_ORDERINGS = {
    "title": (Lower("title").asc(), "id"),
    "-created_at": ("-created_at", "-id"),
    "-updated_at": ("-updated_at", "-id"),
}


def song_base_queryset(workspace):
    return Song.objects.filter(workspace=workspace)


def annotate_songs(queryset):
    return (
        queryset.select_related("language")
        .prefetch_related("tags")
        .annotate(lineup_count=Count("lineup_items__lineup", distinct=True))
    )


class SongViewSet(WorkspaceScopedMixin, RefetchOnWriteMixin, viewsets.ModelViewSet):
    serializer_class = SongSerializer

    def get_queryset(self):
        qs = song_base_queryset(self.workspace)
        if self.action == "list":
            qs = self.filter_queryset_params(qs)
        ordering = self.request.query_params.get("ordering", "title")
        return annotate_songs(qs).order_by(*SONG_ORDERINGS.get(ordering, SONG_ORDERINGS["title"]))

    def filter_queryset_params(self, qs):
        request = self.request
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(composer__icontains=search))
        language = parse_int_param(request, "language")
        if language is not None:
            qs = qs.filter(language_id=language)
        for tag_id in parse_int_list_param(request, "tags"):
            qs = qs.filter(tags__id=tag_id)
        return qs

    @action(
        detail=True,
        methods=["get"],
        url_path="file",
        content_negotiation_class=IgnoreClientContentNegotiation,
    )
    def file(self, request, pk=None):
        return song_file_response(self.get_object())


# ---------------------------------------------------------------------------
# Lineups
# ---------------------------------------------------------------------------

LINEUP_ORDERINGS = {
    "-updated_at": ("-updated_at", "-id"),
    "name": (Lower("name").asc(), "id"),
    "-last_used_at": ("-last_used_at", "-id"),
    "-created_at": ("-created_at", "-id"),
}


def annotate_lineups(queryset):
    items = LineupItem.objects.select_related("song__language").order_by("position", "id")
    return (
        queryset.select_related("default_language")
        .prefetch_related("tags", Prefetch("items", queryset=items))
        .annotate(item_count=Count("items", distinct=True))
    )


class LineupViewSet(WorkspaceScopedMixin, RefetchOnWriteMixin, viewsets.ModelViewSet):
    read_serializer_class = LineupSerializer

    def get_serializer_class(self):
        if self.action == "list":
            return LineupSummarySerializer
        return LineupSerializer

    def get_queryset(self):
        qs = Lineup.objects.filter(workspace=self.workspace)
        ordering_key = "-updated_at"
        if self.action == "list":
            qs = self.filter_queryset_params(qs)
            requested = self.request.query_params.get("ordering", "-updated_at")
            if requested in LINEUP_ORDERINGS:
                ordering_key = requested
            if ordering_key == "-last_used_at":
                qs = qs.filter(last_used_at__isnull=False)
        return annotate_lineups(qs).order_by(*LINEUP_ORDERINGS[ordering_key])

    def filter_queryset_params(self, qs):
        request = self.request
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        language = parse_int_param(request, "language")
        if language is not None:
            qs = qs.filter(default_language_id=language)
        for tag_id in parse_int_list_param(request, "tags"):
            qs = qs.filter(tags__id=tag_id)
        return qs

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        body = LineupDuplicateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        name = (body.validated_data.get("name") or "").strip() or f"{source.name} (copy)"
        name = name[:200]
        source_items = list(source.items.order_by("position", "id"))
        with transaction.atomic():
            copy = Lineup.objects.create(
                workspace=source.workspace,
                name=name,
                description=source.description,
                default_language=source.default_language,
                color=source.color,
                created_by=request.user,
            )
            copy.tags.set(source.tags.all())
            LineupItem.objects.bulk_create(
                [
                    LineupItem(
                        lineup=copy,
                        song_id=item.song_id,
                        position=index,
                        label=item.label,
                        key=item.key,
                        notes=item.notes,
                        assigned_to=item.assigned_to,
                    )
                    for index, item in enumerate(source_items)
                ]
            )
        return self._read_response(copy, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def use(self, request, pk=None):
        lineup = self.get_object()
        now = timezone.now()
        # queryset.update() so that auto_now updated_at is NOT bumped:
        # opening a lineup must not reorder the "saved" list.
        Lineup.objects.filter(pk=lineup.pk).update(last_used_at=now)
        return Response({"last_used_at": iso(now)})

    @action(detail=True, methods=["post", "delete"], url_path="share")
    def share(self, request, pk=None):
        """POST: turn on the public link (idempotent). DELETE: revoke it.

        queryset.update() keeps updated_at untouched — sharing isn't an edit.
        """
        lineup = self.get_object()
        if request.method == "DELETE":
            Lineup.objects.filter(pk=lineup.pk).update(share_token=None)
            return Response(status=status.HTTP_204_NO_CONTENT)
        token = lineup.share_token
        if not token:
            token = secrets.token_urlsafe(24)
            Lineup.objects.filter(pk=lineup.pk).update(share_token=token)
        return Response({"share_token": token})


# ---------------------------------------------------------------------------
# Public shared lineups (no account needed)
# ---------------------------------------------------------------------------


class PublicShareThrottle(AnonRateThrottle):
    scope = "public_share"


class _PublicLineupMixin:
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicShareThrottle]

    def get_shared_lineup(self, token):
        # Unknown and revoked tokens look identical: 404.
        lineup = annotate_lineups(Lineup.objects.select_related("workspace")).filter(
            share_token=token
        ).first() if token else None
        if lineup is None:
            raise NotFound("This share link is invalid or has been turned off.")
        return lineup


class PublicLineupView(_PublicLineupMixin, APIView):
    def get(self, request, token):
        lineup = self.get_shared_lineup(token)
        response = Response(PublicLineupSerializer(lineup).data)
        response["Cache-Control"] = "private, no-store"
        return response


class PublicLineupSongFileView(_PublicLineupMixin, APIView):
    content_negotiation_class = IgnoreClientContentNegotiation

    def get(self, request, token, song_id):
        lineup = self.get_shared_lineup(token)
        # Only songs that are actually in this lineup are reachable.
        item = next((i for i in lineup.items.all() if i.song_id == song_id), None)
        if item is None:
            raise NotFound("This song is not part of the shared lineup.")
        return song_file_response(item.song)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


class DashboardView(WorkspaceScopedMixin, APIView):
    def get(self, request):
        workspace = self.workspace
        context = {"request": request, "workspace": workspace}
        lineups = annotate_lineups(Lineup.objects.filter(workspace=workspace))
        saved = lineups.order_by(*LINEUP_ORDERINGS["-updated_at"])[:6]
        recent = lineups.filter(last_used_at__isnull=False).order_by(
            *LINEUP_ORDERINGS["-last_used_at"]
        )[:6]
        songs = annotate_songs(song_base_queryset(workspace)).order_by(
            *SONG_ORDERINGS["-created_at"]
        )[:6]
        return Response(
            {
                "saved_lineups": LineupSummarySerializer(saved, many=True, context=context).data,
                "recent_lineups": LineupSummarySerializer(recent, many=True, context=context).data,
                "recent_songs": SongSerializer(songs, many=True, context=context).data,
                "counts": {
                    "songs": Song.objects.filter(workspace=workspace).count(),
                    "lineups": Lineup.objects.filter(workspace=workspace).count(),
                },
            }
        )
