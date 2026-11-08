import os
import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class Workspace(models.Model):
    """A parish / choir group. Every user belongs to exactly one workspace."""

    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="membership",
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    preferred_language = models.ForeignKey(
        "Language",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="preferred_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} @ {self.workspace} ({self.role})"

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN


class Language(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="languages"
    )
    name = models.CharField(max_length=60)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                models.F("workspace"),
                Lower("name"),
                name="cantus_language_unique_name_per_workspace",
            ),
        ]

    def __str__(self):
        return self.name


class Tag(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="tags"
    )
    name = models.CharField(max_length=60)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                models.F("workspace"),
                Lower("name"),
                name="cantus_tag_unique_name_per_workspace",
            ),
        ]

    def __str__(self):
        return self.name


class ItemColor(models.TextChoices):
    """Color label for songs and lineups (rendered by the frontend palette)."""

    RED = "red", "Red"
    ORANGE = "orange", "Orange"
    YELLOW = "yellow", "Yellow"
    GREEN = "green", "Green"
    TEAL = "teal", "Teal"
    BLUE = "blue", "Blue"
    PURPLE = "purple", "Purple"
    PINK = "pink", "Pink"


def color_field():
    # Blank = no color (the default accent is used).
    return models.CharField(max_length=16, blank=True, default="", choices=ItemColor.choices)


def song_upload_to(instance, filename):
    """Store uploads under an unguessable name; the original name is kept in
    ``Song.file_name``."""
    ext = os.path.splitext(filename)[1].lower()
    return f"songs/{instance.workspace_id}/{uuid.uuid4().hex}{ext}"


class Song(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="songs"
    )
    title = models.CharField(max_length=200)
    composer = models.CharField(max_length=200, blank=True)
    language = models.ForeignKey(
        Language,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="songs",
    )
    key = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="songs")
    color = color_field()
    file = models.FileField(upload_to=song_upload_to, blank=True, max_length=255)
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_songs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title", "id"]
        indexes = [
            models.Index(fields=["workspace", "title"], name="cantus_song_ws_title_idx"),
        ]

    def __str__(self):
        return self.title


class Lineup(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="lineups"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    default_language = models.ForeignKey(
        Language,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lineups",
    )
    tags = models.ManyToManyField(Tag, blank=True, related_name="lineups")
    color = color_field()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_lineups",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    # Unguessable token for the public, read-only share link. NULL = not shared.
    share_token = models.CharField(
        max_length=64, unique=True, null=True, blank=True, editable=False
    )

    class Meta:
        ordering = ["-updated_at", "id"]

    def __str__(self):
        return self.name


class LineupItem(models.Model):
    lineup = models.ForeignKey(Lineup, on_delete=models.CASCADE, related_name="items")
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name="lineup_items")
    position = models.PositiveIntegerField(default=0)
    label = models.CharField(max_length=60, blank=True)
    key = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)
    assigned_to = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.lineup} #{self.position}: {self.song}"
