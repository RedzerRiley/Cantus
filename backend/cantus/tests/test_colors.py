from django.core.files.uploadedfile import SimpleUploadedFile

from cantus.models import Song

from .utils import TINY_PNG, CantusAPITestCase


class ColorTests(CantusAPITestCase):
    def setUp(self):
        self.user = self.make_account("ana")
        self.workspace = self.user.membership.workspace
        self.login_as(self.user)

    def test_song_color_defaults_blank_and_round_trips(self):
        res = self.client.post("/api/v1/songs/", {"title": "Pananagutan"})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["color"], "")
        res = self.client.patch(f"/api/v1/songs/{res.data['id']}/", {"color": "blue"})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["color"], "blue")

    def test_song_color_via_multipart(self):
        res = self.client.post(
            "/api/v1/songs/",
            {"title": "With file", "color": "green", "file": SimpleUploadedFile("a.png", TINY_PNG)},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["color"], "green")

    def test_invalid_color_rejected(self):
        res = self.client.post("/api/v1/songs/", {"title": "X", "color": "chartreuse"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("color", res.data)
        res = self.client.post("/api/v1/lineups/", {"name": "X", "color": "#ff0000"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("color", res.data)

    def test_lineup_color_list_detail_duplicate_and_song_brief(self):
        song = Song.objects.create(workspace=self.workspace, title="Ama Namin", color="pink")
        res = self.client.post(
            "/api/v1/lineups/", {"name": "Sunday", "color": "purple", "items": [{"song": song.id}]}
        )
        self.assertEqual(res.status_code, 201, res.data)
        lineup_id = res.data["id"]
        self.assertEqual(res.data["color"], "purple")
        self.assertEqual(res.data["items"][0]["song_detail"]["color"], "pink")
        listing = self.client.get("/api/v1/lineups/")
        self.assertEqual(listing.data["results"][0]["color"], "purple")
        dup = self.client.post(f"/api/v1/lineups/{lineup_id}/duplicate/")
        self.assertEqual(dup.data["color"], "purple")
        # Clearing the color.
        res = self.client.patch(f"/api/v1/lineups/{lineup_id}/", {"color": ""})
        self.assertEqual(res.data["color"], "")
