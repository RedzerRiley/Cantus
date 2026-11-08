from rest_framework.permissions import BasePermission

from .models import Membership
from .services import get_membership


class IsWorkspaceMember(BasePermission):
    """Authenticated user who belongs to a workspace.

    Anonymous requests return False, which DRF turns into 401 (because an
    authenticator is configured); authenticated users without a membership
    get 403.
    """

    message = "You are not a member of any workspace."

    def has_permission(self, request, view):
        return get_membership(request.user) is not None


class IsWorkspaceAdmin(BasePermission):
    message = "Only workspace admins can do this."

    def has_permission(self, request, view):
        membership = get_membership(request.user)
        return membership is not None and membership.role == Membership.Role.ADMIN
