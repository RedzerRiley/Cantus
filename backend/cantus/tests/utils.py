import shutil
import tempfile

from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from cantus.models import Language, Tag
from cantus.services import create_account_with_workspace

STRONG_PASSWORD = "Gregorian-Chant-2026!"

TINY_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
TINY_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class CantusAPITestCase(APITestCase):
    """Base test case: temp MEDIA_ROOT, fast hasher and helpers."""

    @classmethod
    def setUpClass(cls):
        cls._media_root = tempfile.mkdtemp(prefix="cantus-test-media-")
        cls._settings_override = override_settings(
            MEDIA_ROOT=cls._media_root,
            PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
        )
        cls._settings_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._settings_override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)

    # -- helpers ----------------------------------------------------------

    def make_account(self, username="ana", workspace_name="St. Joseph Parish Choir"):
        return create_account_with_workspace(
            username=username, password=STRONG_PASSWORD, workspace_name=workspace_name
        )

    def login_as(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return token

    def logout_client(self):
        self.client.credentials()

    def language(self, user, name):
        return Language.objects.get(workspace=user.membership.workspace, name=name)

    def tag(self, user, name):
        return Tag.objects.get(workspace=user.membership.workspace, name=name)
