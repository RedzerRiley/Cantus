from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile

from cantus.models import Lineup, LineupItem, Song

from .utils import TINY_PNG, CantusAPITestCase


class LineupSharingTests(CantusAPITestCase):
    def setUp(self):
        cache.clear()  # throttle counters
        self.user = self.make_account("ana")
        self.workspace = self.user.membership.workspace
        self.login_as(self.user)
        self.with_file = Song.objects.create(
            workspace=self.workspace,
            title="Pananagutan",
            file=SimpleUploadedFile("sheet.png", TINY_PNG),
            file_name="sheet.png",
        )
        self.not_in_lineup = Song.objects.create(
            workspace=self.workspace,
            title="Other",
            file=SimpleUploadedFile("other.png", TINY_PNG),
            file_name="other.png",
        )
        self.lineup = Lineup.objects.create(workspace=self.workspace, name="Sunday Mass")
        LineupItem.objects.create(
            lineup=self.lineup, song=self.with_file, position=0, label="Entrance",
            key="G", notes="Capo 2", assigned_to="Ben",
        )

    def share(self):
        res = self.client.post(f"/api/v1/lineups/{self.lineup.id}/share/")
        self.assertEqual(res.status_code, 200, res.data)
        return res.data["share_token"]

    def test_not_shared_by_default(self):
        res = self.client.get(f"/api/v1/lineups/{self.lineup.id}/")
        self.assertIsNone(res.data["share_token"])

    def test_share_is_idempotent_and_does_not_bump_updated_at(self):
        before = Lineup.objects.get(pk=self.lineup.pk).updated_at
        token = self.share()
        self.assertGreaterEqual(len(token), 24)
        self.assertEqual(self.share(), token)
        self.assertEqual(Lineup.objects.get(pk=self.lineup.pk).updated_at, before)
        res = self.client.get(f"/api/v1/lineups/{self.lineup.id}/")
        self.assertEqual(res.data["share_token"], token)

    def test_anonymous_can_view_shared_lineup(self):
        token = self.share()
        self.logout_client()
        res = self.client.get(f"/api/v1/public/lineups/{token}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["name"], "Sunday Mass")
        self.assertEqual(res.data["workspace_name"], self.workspace.name)
        item = res.data["items"][0]
        self.assertEqual(item["label"], "Entrance")
        self.assertEqual(item["song_detail"]["title"], "Pananagutan")
        self.assertTrue(item["song_detail"]["has_file"])
        # Internal fields are not exposed.
        self.assertNotIn("assigned_to", item)
        self.assertNotIn("id", res.data)
        self.assertNotIn("share_token", res.data)

    def test_anonymous_can_fetch_file_of_song_in_lineup_only(self):
        token = self.share()
        self.logout_client()
        res = self.client.get(f"/api/v1/public/lineups/{token}/songs/{self.with_file.id}/file/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "image/png")
        self.assertEqual(b"".join(res.streaming_content), TINY_PNG)
        res = self.client.get(f"/api/v1/public/lineups/{token}/songs/{self.not_in_lineup.id}/file/")
        self.assertEqual(res.status_code, 404)

    def test_bad_or_revoked_token_is_404(self):
        self.logout_client()
        self.assertEqual(self.client.get("/api/v1/public/lineups/nope/").status_code, 404)
        self.login_as(self.user)
        token = self.share()
        res = self.client.delete(f"/api/v1/lineups/{self.lineup.id}/share/")
        self.assertEqual(res.status_code, 204)
        self.logout_client()
        self.assertEqual(self.client.get(f"/api/v1/public/lineups/{token}/").status_code, 404)
        res = self.client.get(f"/api/v1/public/lineups/{token}/songs/{self.with_file.id}/file/")
        self.assertEqual(res.status_code, 404)

    def test_reshare_after_revoke_gives_new_token(self):
        first = self.share()
        self.client.delete(f"/api/v1/lineups/{self.lineup.id}/share/")
        self.assertNotEqual(self.share(), first)

    def test_other_workspace_cannot_share(self):
        other = self.make_account("ben", workspace_name="Other Choir")
        self.login_as(other)
        res = self.client.post(f"/api/v1/lineups/{self.lineup.id}/share/")
        self.assertEqual(res.status_code, 404)

    def test_anonymous_cannot_toggle_sharing(self):
        self.logout_client()
        res = self.client.post(f"/api/v1/lineups/{self.lineup.id}/share/")
        self.assertEqual(res.status_code, 401)

    def test_duplicate_is_not_shared(self):
        self.share()
        res = self.client.post(f"/api/v1/lineups/{self.lineup.id}/duplicate/")
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(res.data["share_token"])

    def test_public_view_ignores_bad_auth_header(self):
        token = self.share()
        self.client.credentials(HTTP_AUTHORIZATION="Token not-a-real-token")
        res = self.client.get(f"/api/v1/public/lineups/{token}/")
        self.assertEqual(res.status_code, 200)
