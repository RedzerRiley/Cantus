from django.contrib.auth import get_user_model

from cantus.models import Language, Lineup, Membership, Song, Tag

from .utils import STRONG_PASSWORD, CantusAPITestCase

User = get_user_model()


class WorkspaceIsolationTests(CantusAPITestCase):
    def setUp(self):
        self.ana = self.make_account("ana", "Choir A")
        self.ben = self.make_account("ben", "Choir B")
        self.ws_a = self.ana.membership.workspace
        self.song_a = Song.objects.create(workspace=self.ws_a, title="A's song")
        self.lineup_a = Lineup.objects.create(workspace=self.ws_a, name="A's lineup")
        self.login_as(self.ben)

    def test_cannot_see_other_workspace_objects(self):
        self.assertEqual(self.client.get(f"/api/v1/songs/{self.song_a.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/songs/{self.song_a.id}/file/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/v1/songs/{self.song_a.id}/", {"key": "C"}).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/v1/songs/{self.song_a.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/lineups/{self.lineup_a.id}/").status_code, 404)
        self.assertEqual(self.client.post(f"/api/v1/lineups/{self.lineup_a.id}/use/").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/songs/").data["count"], 0)
        self.assertEqual(self.client.get("/api/v1/lineups/").data["count"], 0)
        lang_a = Language.objects.filter(workspace=self.ws_a).first()
        self.assertEqual(self.client.delete(f"/api/v1/languages/{lang_a.id}/").status_code, 404)
        names = [lang["id"] for lang in self.client.get("/api/v1/languages/").data]
        self.assertNotIn(lang_a.id, names)

    def test_foreign_ids_in_writes_rejected(self):
        tag_a = Tag.objects.filter(workspace=self.ws_a).first()
        lang_a = Language.objects.filter(workspace=self.ws_a).first()

        res = self.client.post("/api/v1/songs/", {"title": "x", "tag_ids": [tag_a.id]})
        self.assertEqual(res.status_code, 400)
        self.assertIn("tag_ids", res.data)

        res = self.client.post("/api/v1/songs/", {"title": "x", "language": lang_a.id})
        self.assertEqual(res.status_code, 400)
        self.assertIn("language", res.data)

        res = self.client.post(
            "/api/v1/lineups/", {"name": "x", "items": [{"song": self.song_a.id}]}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("items", res.data)

        res = self.client.post("/api/v1/lineups/", {"name": "x", "default_language": lang_a.id})
        self.assertEqual(res.status_code, 400)
        self.assertIn("default_language", res.data)

        self.assertFalse(Song.objects.filter(workspace=self.ben.membership.workspace).exists())


class LanguageTagTests(CantusAPITestCase):
    def setUp(self):
        self.user = self.make_account("ana")
        self.login_as(self.user)

    def test_list_plain_array_with_song_count(self):
        english = self.language(self.user, "English")
        song = Song.objects.create(workspace=self.user.membership.workspace, title="s", language=english)
        song.tags.add(self.tag(self.user, "Marian"))
        res = self.client.get("/api/v1/languages/")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.data, list)
        self.assertEqual([lang["name"] for lang in res.data], ["English", "Latin", "Tagalog", "Taglish"])
        by_name = {lang["name"]: lang for lang in res.data}
        self.assertEqual(by_name["English"]["song_count"], 1)
        self.assertEqual(by_name["Latin"]["song_count"], 0)

        res = self.client.get("/api/v1/tags/")
        self.assertIsInstance(res.data, list)
        self.assertEqual({t["name"]: t["song_count"] for t in res.data}["Marian"], 1)

    def test_create_rename_delete_and_case_insensitive_uniqueness(self):
        res = self.client.post("/api/v1/languages/", {"name": "Cebuano"})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data, {"id": res.data["id"], "name": "Cebuano", "song_count": 0})

        res = self.client.post("/api/v1/languages/", {"name": "english"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("name", res.data)

        res = self.client.post("/api/v1/tags/", {"name": "PENTECOST"})
        self.assertEqual(res.status_code, 201)
        tag_id = res.data["id"]
        res = self.client.patch(f"/api/v1/tags/{tag_id}/", {"name": "Pentecost"})
        self.assertEqual(res.status_code, 200)  # renaming itself is fine
        res = self.client.patch(f"/api/v1/tags/{tag_id}/", {"name": "advent"})
        self.assertEqual(res.status_code, 400)

    def test_delete_language_nulls_song_language_and_tag_removed(self):
        english = self.language(self.user, "English")
        marian = self.tag(self.user, "Marian")
        song = Song.objects.create(workspace=self.user.membership.workspace, title="s", language=english)
        song.tags.add(marian)
        self.assertEqual(self.client.delete(f"/api/v1/languages/{english.id}/").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/v1/tags/{marian.id}/").status_code, 204)
        song.refresh_from_db()
        self.assertIsNone(song.language)
        self.assertEqual(song.tags.count(), 0)


class WorkspaceAndMembersTests(CantusAPITestCase):
    def setUp(self):
        self.admin = self.make_account("ana", "Choir A")
        self.workspace = self.admin.membership.workspace
        self.member = User.objects.create_user(username="ben", password=STRONG_PASSWORD)
        Membership.objects.create(user=self.member, workspace=self.workspace, role="member")
        self.login_as(self.admin)

    def test_get_and_patch_workspace(self):
        res = self.client.get("/api/v1/workspace/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(set(res.data), {"id", "name", "created_at"})
        res = self.client.patch("/api/v1/workspace/", {"name": "St. Joseph Choir"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["name"], "St. Joseph Choir")

        self.login_as(self.member)
        self.assertEqual(self.client.get("/api/v1/workspace/").status_code, 200)
        self.assertEqual(self.client.patch("/api/v1/workspace/", {"name": "Hijack"}).status_code, 403)

    def test_list_members(self):
        res = self.client.get("/api/v1/workspace/members/")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.data, list)
        self.assertEqual([m["username"] for m in res.data], ["ana", "ben"])
        self.assertEqual(
            set(res.data[0]),
            {"id", "username", "first_name", "last_name", "email", "role", "date_joined"},
        )
        self.assertEqual(res.data[0]["id"], self.admin.id)

    def test_admin_can_create_member(self):
        res = self.client.post(
            "/api/v1/workspace/members/",
            {"username": "carla", "password": STRONG_PASSWORD, "first_name": "Carla", "role": "member"},
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["role"], "member")
        carla = User.objects.get(username="carla")
        self.assertEqual(carla.membership.workspace, self.workspace)
        self.assertTrue(carla.check_password(STRONG_PASSWORD))

        res = self.client.post(
            "/api/v1/workspace/members/",
            {"username": "carla", "password": STRONG_PASSWORD, "role": "member"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("username", res.data)

        res = self.client.post(
            "/api/v1/workspace/members/", {"username": "dan", "password": "short", "role": "member"}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("password", res.data)

    def test_member_cannot_manage_members(self):
        self.login_as(self.member)
        res = self.client.post(
            "/api/v1/workspace/members/",
            {"username": "eve", "password": STRONG_PASSWORD, "role": "admin"},
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(
            self.client.patch(f"/api/v1/workspace/members/{self.member.id}/", {"role": "admin"}).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"/api/v1/workspace/members/{self.admin.id}/").status_code, 403)
        # members may still CRUD songs
        self.assertEqual(self.client.post("/api/v1/songs/", {"title": "ok"}).status_code, 201)

    def test_role_change_and_last_admin_protection(self):
        res = self.client.patch(f"/api/v1/workspace/members/{self.admin.id}/", {"role": "member"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("role", res.data)

        res = self.client.patch(f"/api/v1/workspace/members/{self.member.id}/", {"role": "admin"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["role"], "admin")

        # now two admins: demoting self is allowed
        res = self.client.patch(f"/api/v1/workspace/members/{self.admin.id}/", {"role": "member"})
        self.assertEqual(res.status_code, 200)

    def test_delete_member_guards(self):
        res = self.client.delete(f"/api/v1/workspace/members/{self.admin.id}/")
        self.assertEqual(res.status_code, 400)  # self
        self.assertIn("non_field_errors", res.data)

        res = self.client.delete(f"/api/v1/workspace/members/{self.member.id}/")
        self.assertEqual(res.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.member.pk).exists())

    def test_cannot_touch_members_of_other_workspace(self):
        other = self.make_account("zed", "Other")
        self.assertEqual(self.client.delete(f"/api/v1/workspace/members/{other.id}/").status_code, 404)


class DashboardTests(CantusAPITestCase):
    def setUp(self):
        self.user = self.make_account("ana")
        self.workspace = self.user.membership.workspace
        self.login_as(self.user)

    def test_dashboard_shape(self):
        songs = [Song.objects.create(workspace=self.workspace, title=f"S{i}") for i in range(8)]
        for i in range(7):
            res = self.client.post(
                "/api/v1/lineups/", {"name": f"L{i}", "items": [{"song": songs[i].id}]}
            )
            self.assertEqual(res.status_code, 201)
        first_id = Lineup.objects.get(name="L0").id
        self.client.post(f"/api/v1/lineups/{first_id}/use/")

        res = self.client.get("/api/v1/dashboard/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(set(res.data), {"saved_lineups", "recent_lineups", "recent_songs", "counts"})
        self.assertEqual(res.data["counts"], {"songs": 8, "lineups": 7})
        self.assertEqual(len(res.data["saved_lineups"]), 6)
        self.assertEqual(res.data["saved_lineups"][0]["name"], "L6")
        self.assertIn("preview_titles", res.data["saved_lineups"][0])
        self.assertEqual([lu["id"] for lu in res.data["recent_lineups"]], [first_id])
        self.assertEqual(len(res.data["recent_songs"]), 6)
        self.assertEqual(res.data["recent_songs"][0]["title"], "S7")
        self.assertIn("lineup_count", res.data["recent_songs"][0])
