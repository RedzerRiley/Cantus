"""Domain helpers shared by views, the seed command and tests."""

from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Language, Membership, Tag, Workspace

DEFAULT_LANGUAGES = ["English", "Tagalog", "Taglish", "Latin"]

DEFAULT_TAGS = [
    "Entrance",
    "Gloria",
    "Responsorial Psalm",
    "Offertory",
    "Communion",
    "Recessional",
    "Marian",
    "Advent",
    "Christmas",
    "Lent",
    "Easter",
    "Ordinary Time",
    "Wedding",
    "Youth",
]


def create_default_workspace_data(workspace):
    """Create the default languages and tags for a new workspace."""
    Language.objects.bulk_create(
        [Language(workspace=workspace, name=name) for name in DEFAULT_LANGUAGES]
    )
    Tag.objects.bulk_create([Tag(workspace=workspace, name=name) for name in DEFAULT_TAGS])


@transaction.atomic
def create_account_with_workspace(
    *,
    username,
    password,
    workspace_name,
    email="",
    first_name="",
    last_name="",
):
    """Create a user, a brand-new workspace (user is admin) and default data."""
    User = get_user_model()
    user = User.objects.create_user(
        username=username,
        email=email or "",
        password=password,
        first_name=first_name or "",
        last_name=last_name or "",
    )
    workspace = Workspace.objects.create(name=workspace_name)
    Membership.objects.create(user=user, workspace=workspace, role=Membership.Role.ADMIN)
    create_default_workspace_data(workspace)
    return user


def get_membership(user):
    """Return the user's Membership or None (never raises)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    try:
        return user.membership
    except Exception:  # RelatedObjectDoesNotExist
        return None
