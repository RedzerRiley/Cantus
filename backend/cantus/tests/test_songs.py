import os

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from cantus.models import Lineup, LineupItem, Song

from .utils import TINY_PDF, TINY_PNG, CantusAPITestCase


class SongCrudTests(CantusAPITestCase):
    def setUp(self):
        self.user = self.make_account("ana")
        self.workspace = self.user.membership.workspace
        self.login_as(self.user)
        self.english = self.language(self.user, "English")
        self.latin = self.language(self.user, "Latin")
        self.entrance = self.tag(self.user, "Entrance")
        self.marian = self.tag(self.user, "Marian")
        self.communion = self.tag(self.user, "Communion")

    def create_song(self, **overrides):
        payload = {"title": "Holy God, We Praise Thy Name", "composer": "Trad."}
        payload.update(overrides)
        res = self.client.post("/api/v1/songs/", payload)
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_create_song_json_shape(self):
        data = self.create_song(
            language=self.english.id, key="F", tag_ids=[self.entrance.id, self.marian.id]
        )
        expected_keys = {
            "id", "title", "composer", "language", "language_name", "key", "notes", "color", "tags",
            "file_name", "file_size", "file_type", "has_file", "lineup_count",
            "created_at", "updated_at",
        }
        self.assertEqual(set(data), expected_keys)
        self.assertEqual(data["language"], self.english.id)
        self.assertEqual(data["language_name"], "English")
        self.assertEqual({t["id"] for t in data["tags"]}, {self.entrance.id, self.marian.id})
        self.assertFalse(data["has_file"])
        self.assertIsNone(data["file_name"])
        self.assertIsNone(data["file_type"])
        self.assertEqual(data["lineup_count"], 0)
        song = Song.objects.get(pk=data["id"])
        self.assertEqual(song.workspace, self.workspace)
        self.assertEqual(song.created_by, self.user)

    def test_title_required(self):
        res = self.client.post("/api/v1/songs/", {"composer": "x"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("title", res.data)

    def test_retrieve_update_delete(self):
        data = self.create_song()
        url = f"/api/v1/songs/{data['id']}/"
        res = self.client.patch(url, {"key": "G", "tag_ids": [self.communion.id]})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["key"], "G")
        self.assertEqual([t["id"] for t in res.data["tags"]], [self.communion.id])
        self.assertEqual(res.data["title"], "Holy God, We Praise Thy Name")

        res = self.client.patch(url, {"language": None, "tag_ids": []})
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["language"])
        self.assertEqual(res.data["tags"], [])

        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_delete_song_removes_it_from_lineups(self):
        data = self.create_song()
        lineup = Lineup.objects.create(workspace=self.workspace, name="L")
        LineupItem.objects.create(lineup=lineup, song_id=data["id"], position=0)
        self.client.delete(f"/api/v1/songs/{data['id']}/")
        self.assertFalse(LineupItem.objects.filter(lineup=lineup).exists())

    def test_list_paginated_and_search(self):
        self.create_song(title="Salve Regina", composer="Chant")
        self.create_song(title="Pange Lingua", composer="Aquinas")
        self.create_song(title="Panis Angelicus", composer="César Franck")
        res = self.client.get("/api/v1/songs/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(set(res.data), {"count", "next", "previous", "results"})
        self.assertEqual(res.data["count"], 3)
        self.assertEqual(
            [s["title"] for s in res.data["results"]],
            ["Pange Lingua", "Panis Angelicus", "Salve Regina"],
        )

        res = self.client.get("/api/v1/songs/", {"search": "pan"})
        self.assertEqual({s["title"] for s in res.data["results"]}, {"Pange Lingua", "Panis Angelicus"})
        res = self.client.get("/api/v1/songs/", {"search": "franck"})
        self.assertEqual([s["title"] for s in res.data["results"]], ["Panis Angelicus"])

    def test_pagination_page_size(self):
        for i in range(5):
            self.create_song(title=f"Song {i}")
        res = self.client.get("/api/v1/songs/", {"page_size": 2})
        self.assertEqual(res.data["count"], 5)
        self.assertEqual(len(res.data["results"]), 2)
        self.assertIsNotNone(res.data["next"])
        self.assertIsNone(res.data["previous"])

    def test_ordering(self):
        a = self.create_song(title="A")
        b = self.create_song(title="B")
        res = self.client.get("/api/v1/songs/", {"ordering": "-created_at"})
        self.assertEqual([s["id"] for s in res.data["results"]], [b["id"], a["id"]])
        self.client.patch(f"/api/v1/songs/{a['id']}/", {"key": "D"})
        res = self.client.get("/api/v1/songs/", {"ordering": "-updated_at"})
        self.assertEqual(res.data["results"][0]["id"], a["id"])

    def test_language_and_tags_filters(self):
        s1 = self.create_song(title="One", language=self.english.id,
                              tag_ids=[self.entrance.id, self.marian.id])
        s2 = self.create_song(title="Two", language=self.latin.id, tag_ids=[self.marian.id])
        self.create_song(title="Three", language=self.english.id, tag_ids=[self.communion.id])

        res = self.client.get("/api/v1/songs/", {"language": self.latin.id})
        self.assertEqual([s["id"] for s in res.data["results"]], [s2["id"]])

        res = self.client.get("/api/v1/songs/", {"tags": f"{self.marian.id}"})
        self.assertEqual({s["id"] for s in res.data["results"]}, {s1["id"], s2["id"]})

        # must have ALL tags
        res = self.client.get("/api/v1/songs/", {"tags": f"{self.marian.id},{self.entrance.id}"})
        self.assertEqual([s["id"] for s in res.data["results"]], [s1["id"]])
        self.assertEqual(res.data["count"], 1)

        res = self.client.get("/api/v1/songs/", {"language": "abc"})
        self.assertEqual(res.status_code, 400)

    def test_lineup_count(self):
        data = self.create_song()
        for name in ("L1", "L2"):
            lineup = Lineup.objects.create(workspace=self.workspace, name=name)
            LineupItem.objects.create(lineup=lineup, song_id=data["id"], position=0)
            LineupItem.objects.create(lineup=lineup, song_id=data["id"], position=1)
        res = self.client.get(f"/api/v1/songs/{data['id']}/")
        self.assertEqual(res.data["lineup_count"], 2)

    def test_multipart_tag_ids_repeated_and_comma_string(self):
        res = self.client.post(
            "/api/v1/songs/",
            {"title": "Multi", "tag_ids": [str(self.entrance.id), str(self.marian.id)],
             "language": ""},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(res.data["tags"]), 2)
        self.assertIsNone(res.data["language"])

        res = self.client.post(
            "/api/v1/songs/",
            {"title": "Comma", "tag_ids": f"{self.entrance.id},{self.communion.id}",
             "language": str(self.latin.id)},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual({t["id"] for t in res.data["tags"]}, {self.entrance.id, self.communion.id})
        self.assertEqual(res.data["language"], self.latin.id)

        res = self.client.patch(
            f"/api/v1/songs/{res.data['id']}/", {"language": "null"}, format="multipart"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNone(res.data["language"])
        self.assertEqual(len(res.data["tags"]), 2)  # untouched in partial update


class SongFileTests(CantusAPITestCase):
    def setUp(self):
        self.user = self.make_account("ana")
        self.login_as(self.user)

    def upload(self, name, content, title="With file", content_type="application/octet-stream"):
        return self.client.post(
            "/api/v1/songs/",
            {"title": title, "file": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart",
        )

    def test_valid_pdf_accepted_and_downloadable(self):
        res = self.upload("holy-god.pdf", TINY_PDF, content_type="application/pdf")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["has_file"])
        self.assertEqual(res.data["file_name"], "holy-god.pdf")
        self.assertEqual(res.data["file_size"], len(TINY_PDF))
        self.assertEqual(res.data["file_type"], "pdf")
        self.assertNotIn("file", res.data)

        song = Song.objects.get(pk=res.data["id"])
        self.assertTrue(song.file.name.startswith(f"songs/{song.workspace_id}/"))
        self.assertTrue(song.file.name.endswith(".pdf"))
        self.assertNotIn("holy-god", song.file.name)

        url = f"/api/v1/songs/{song.id}/file/"
        file_res = self.client.get(url, HTTP_ACCEPT="application/pdf")
        self.assertEqual(file_res.status_code, 200)
        self.assertEqual(file_res["Content-Type"], "application/pdf")
        self.assertIn("inline", file_res["Content-Disposition"])
        self.assertIn("holy-god.pdf", file_res["Content-Disposition"])
        self.assertEqual(file_res["X-Content-Type-Options"], "nosniff")
        self.assertEqual(b"".join(file_res.streaming_content), TINY_PDF)
        file_res.close()

        self.logout_client()
        self.assertEqual(self.client.get(url).status_code, 401)

    def test_text_and_images_accepted(self):
        self.assertEqual(self.upload("a.png", TINY_PNG).status_code, 201)
        self.assertEqual(self.upload("a.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 16).status_code, 201)
        res = self.upload("chords.chopro", "{title: Sample}\n[G]Ama [C]namin".encode())
        self.assertEqual(res.status_code, 201, res.data)
        file_res = self.client.get(f"/api/v1/songs/{res.data['id']}/file/")
        self.assertTrue(file_res["Content-Type"].startswith("text/plain"))
        file_res.close()

    def test_pdf_extension_with_png_bytes_rejected(self):
        res = self.upload("fake.pdf", TINY_PNG)
        self.assertEqual(res.status_code, 400)
        self.assertIn("file", res.data)
        self.assertFalse(Song.objects.exists())

    def test_exe_rejected(self):
        res = self.upload("virus.exe", b"MZ\x90\x00" + b"\x00" * 32)
        self.assertEqual(res.status_code, 400)
        self.assertIn("file", res.data)

    def test_non_utf8_text_rejected(self):
        res = self.upload("bad.txt", b"\xff\xfe\x00\x00binary")
        self.assertEqual(res.status_code, 400)
        self.assertIn("file", res.data)

    @override_settings(MAX_UPLOAD_MB=0.001)  # ~1 KB
    def test_oversize_rejected(self):
        res = self.upload("big.pdf", TINY_PDF + b"0" * 4096)
        self.assertEqual(res.status_code, 400)
        self.assertIn("file", res.data)

    def test_download_404_without_file(self):
        res = self.client.post("/api/v1/songs/", {"title": "No file"})
        file_res = self.client.get(f"/api/v1/songs/{res.data['id']}/file/")
        self.assertEqual(file_res.status_code, 404)

    def test_remove_file_deletes_from_storage(self):
        res = self.upload("x.pdf", TINY_PDF)
        song = Song.objects.get(pk=res.data["id"])
        stored_name = song.file.name
        storage = song.file.storage
        self.assertTrue(storage.exists(stored_name))

        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.patch(
                f"/api/v1/songs/{song.id}/", {"remove_file": "true"}, format="multipart"
            )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(res.data["has_file"])
        self.assertIsNone(res.data["file_name"])
        self.assertIsNone(res.data["file_size"])
        self.assertFalse(storage.exists(stored_name))

    def test_replace_file_deletes_old_and_json_remove_file(self):
        res = self.upload("x.pdf", TINY_PDF)
        song = Song.objects.get(pk=res.data["id"])
        old_name = song.file.name
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.patch(
                f"/api/v1/songs/{song.id}/",
                {"file": SimpleUploadedFile("new.png", TINY_PNG)},
                format="multipart",
            )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["file_name"], "new.png")
        self.assertEqual(res.data["file_type"], "png")
        song.refresh_from_db()
        self.assertFalse(song.file.storage.exists(old_name))
        self.assertTrue(song.file.storage.exists(song.file.name))

        # JSON remove_file
        res = self.client.patch(f"/api/v1/songs/{song.id}/", {"remove_file": True})
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["has_file"])

    def test_delete_song_deletes_file(self):
        res = self.upload("x.pdf", TINY_PDF)
        song = Song.objects.get(pk=res.data["id"])
        path = song.file.path
        self.assertTrue(os.path.exists(path))
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"/api/v1/songs/{song.id}/")
        self.assertFalse(os.path.exists(path))
