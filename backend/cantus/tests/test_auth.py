from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

from cantus.models import Language, Membership, Tag
from cantus.services import DEFAULT_LANGUAGES, DEFAULT_TAGS

from .utils import STRONG_PASSWORD, CantusAPITestCase

User = get_user_model()


class RegisterTests(CantusAPITestCase):
    url = "/api/v1/auth/register/"

    def test_register_creates_user_workspace_admin_and_defaults(self):
        res = self.client.post(
            self.url,
            {
                "username": "ana",
                "password": STRONG_PASSWORD,
                "email": "ana@example.com",
                "first_name": "Ana",
                "last_name": "Cruz",
                "workspace_name": "St. Joseph Parish Choir",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertIn("token", res.data)
        user_data = res.data["user"]
        self.assertEqual(user_data["username"], "ana")
        self.assertEqual(user_data["role"], "admin")
        self.assertEqual(user_data["workspace"]["name"], "St. Joseph Parish Choir")
        self.assertIsNone(user_data["preferred_language"])
        self.assertEqual(
            set(user_data), {"id", "username", "email", "first_name", "last_name",
                             "preferred_language", "role", "workspace"}
        )

        user = User.objects.get(username="ana")
        self.assertTrue(user.check_password(STRONG_PASSWORD))
        self.assertEqual(user.membership.role, Membership.Role.ADMIN)
        workspace = user.membership.workspace
        self.assertEqual(
            sorted(Language.objects.filter(workspace=workspace).values_list("name", flat=True)),
            sorted(DEFAULT_LANGUAGES),
        )
        self.assertEqual(
            sorted(Tag.objects.filter(workspace=workspace).values_list("name", flat=True)),
            sorted(DEFAULT_TAGS),
        )
        self.assertEqual(Token.objects.get(user=user).key, res.data["token"])

    def test_register_weak_password_rejected_on_password_field(self):
        res = self.client.post(
            self.url, {"username": "ben", "password": "123", "workspace_name": "X"}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("password", res.data)
        self.assertFalse(User.objects.filter(username="ben").exists())

    def test_register_duplicate_username(self):
        self.make_account("ana")
        res = self.client.post(
            self.url, {"username": "ANA", "password": STRONG_PASSWORD, "workspace_name": "X"}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("username", res.data)

    def test_register_requires_workspace_name(self):
        res = self.client.post(self.url, {"username": "carl", "password": STRONG_PASSWORD})
        self.assertEqual(res.status_code, 400)
        self.assertIn("workspace_name", res.data)


class LoginLogoutTests(CantusAPITestCase):
    def setUp(self):
        self.user = self.make_account("ana")

    def test_login_success(self):
        res = self.client.post(
            "/api/v1/auth/login/", {"username": "ana", "password": STRONG_PASSWORD}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["user"]["id"], self.user.id)
        self.assertTrue(res.data["token"])

    def test_login_bad_credentials(self):
        res = self.client.post("/api/v1/auth/login/", {"username": "ana", "password": "nope"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data, {"non_field_errors": ["Invalid username or password."]})

    def test_logout_deletes_token(self):
        self.login_as(self.user)
        res = self.client.post("/api/v1/auth/logout/")
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Token.objects.filter(user=self.user).exists())
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, 401)

    def test_unauthenticated_is_401(self):
        res = self.client.get("/api/v1/songs/")
        self.assertEqual(res.status_code, 401)
        self.assertIn("detail", res.data)

    def test_user_without_membership_is_forbidden(self):
        loner = User.objects.create_user(username="loner", password=STRONG_PASSWORD)
        self.login_as(loner)
        res = self.client.get("/api/v1/songs/")
        self.assertEqual(res.status_code, 403)

    def test_health_is_public(self):
        res = self.client.get("/api/v1/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {"status": "ok"})


class MeTests(CantusAPITestCase):
    def setUp(self):
        self.user = self.make_account("ana")
        self.login_as(self.user)

    def test_get_me(self):
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["username"], "ana")
        self.assertEqual(res.data["workspace"]["id"], self.user.membership.workspace_id)

    def test_patch_me_profile_and_preferred_language(self):
        tagalog = self.language(self.user, "Tagalog")
        res = self.client.patch(
            "/api/v1/auth/me/",
            {"first_name": "Ana", "email": "ana@example.com", "preferred_language": tagalog.id},
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["preferred_language"], tagalog.id)
        self.assertEqual(res.data["first_name"], "Ana")
        self.user.membership.refresh_from_db()
        self.assertEqual(self.user.membership.preferred_language, tagalog)

        res = self.client.patch("/api/v1/auth/me/", {"preferred_language": None})
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["preferred_language"])

    def test_preferred_language_must_be_in_workspace(self):
        other = self.make_account("ben", "Other Choir")
        foreign = self.language(other, "English")
        res = self.client.patch("/api/v1/auth/me/", {"preferred_language": foreign.id})
        self.assertEqual(res.status_code, 400)
        self.assertIn("preferred_language", res.data)

    def test_username_is_read_only(self):
        res = self.client.patch("/api/v1/auth/me/", {"username": "hacker"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["username"], "ana")


class ChangePasswordTests(CantusAPITestCase):
    url = "/api/v1/auth/change-password/"

    def setUp(self):
        self.user = self.make_account("ana")
        self.token = self.login_as(self.user)

    def test_change_password(self):
        res = self.client.post(
            self.url,
            {"current_password": STRONG_PASSWORD, "new_password": "Another-Strong-Pass-99"},
        )
        self.assertEqual(res.status_code, 204, getattr(res, "data", None))
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Another-Strong-Pass-99"))
        # token still valid
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 200)

    def test_wrong_current_password(self):
        res = self.client.post(
            self.url, {"current_password": "wrong", "new_password": "Another-Strong-Pass-99"}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("current_password", res.data)

    def test_weak_new_password(self):
        res = self.client.post(
            self.url, {"current_password": STRONG_PASSWORD, "new_password": "12345678"}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("new_password", res.data)
