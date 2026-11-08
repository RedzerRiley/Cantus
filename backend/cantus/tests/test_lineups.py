from cantus.models import Lineup, Song

from .utils import CantusAPITestCase


class LineupTests(CantusAPITestCase):
    def setUp(self):
        self.user = self.make_account("ana")
        self.workspace = self.user.membership.workspace
        self.login_as(self.user)
        self.tagalog = self.language(self.user, "Tagalog")
        self.english = self.language(self.user, "English")
        self.ordinary = self.tag(self.user, "Ordinary Time")
        self.wedding = self.tag(self.user, "Wedding")
        self.songs = [
            Song.objects.create(workspace=self.workspace, title=title)
            for title in ("Alpha", "Bravo", "Charlie", "Delta")
        ]

    def create_lineup(self, **overrides):
        payload = {
            "name": "Sunday Mass — Tagalog",
            "description": "Regular Sunday",
            "default_language": self.tagalog.id,
            "tag_ids": [self.ordinary.id],
            "items": [
                {"song": self.songs[2].id, "label": "Entrance", "key": "G",
                 "notes": "Capo 2", "assigned_to": "Ben (guitar)"},
                {"song": self.songs[0].id, "label": "Communion"},
                {"song": self.songs[2].id, "label": "Recessional"},
            ],
        }
        payload.update(overrides)
        res = self.client.post("/api/v1/lineups/", payload)
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_create_with_ordered_items(self):
        data = self.create_lineup()
        self.assertEqual(data["name"], "Sunday Mass — Tagalog")
        self.assertEqual(data["default_language_name"], "Tagalog")
        self.assertEqual([t["id"] for t in data["tags"]], [self.ordinary.id])
        self.assertEqual(data["item_count"], 3)
        self.assertIsNone(data["last_used_at"])
        self.assertEqual([i["position"] for i in data["items"]], [0, 1, 2])
        self.assertEqual(
            [i["song"] for i in data["items"]],
            [self.songs[2].id, self.songs[0].id, self.songs[2].id],
        )
        first = data["items"][0]
        self.assertEqual(first["assigned_to"], "Ben (guitar)")
        self.assertEqual(first["notes"], "Capo 2")
        self.assertEqual(
            set(first["song_detail"]),
            {"id", "title", "composer", "key", "color", "language_name", "has_file"},
        )
        self.assertEqual(first["song_detail"]["title"], "Charlie")

    def test_name_required(self):
        res = self.client.post("/api/v1/lineups/", {"items": []})
        self.assertEqual(res.status_code, 400)
        self.assertIn("name", res.data)

    def test_item_song_required_even_on_patch(self):
        data = self.create_lineup()
        res = self.client.patch(f"/api/v1/lineups/{data['id']}/", {"items": [{"label": "x"}]})
        self.assertEqual(res.status_code, 400)
        self.assertIn("items", res.data)

    def test_put_reorders_and_replaces_items(self):
        data = self.create_lineup()
        url = f"/api/v1/lineups/{data['id']}/"
        res = self.client.put(
            url,
            {
                "name": "Renamed",
                "items": [
                    {"song": self.songs[3].id, "label": "Entrance"},
                    {"song": self.songs[1].id, "label": "Offertory"},
                ],
            },
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["name"], "Renamed")
        self.assertEqual([i["song"] for i in res.data["items"]],
                         [self.songs[3].id, self.songs[1].id])
        self.assertEqual([i["position"] for i in res.data["items"]], [0, 1])
        self.assertEqual(res.data["item_count"], 2)
        # fetched again, the order persists
        res = self.client.get(url)
        self.assertEqual([i["label"] for i in res.data["items"]], ["Entrance", "Offertory"])

    def test_put_requires_name(self):
        data = self.create_lineup()
        res = self.client.put(f"/api/v1/lineups/{data['id']}/", {"items": []})
        self.assertEqual(res.status_code, 400)
        self.assertIn("name", res.data)

    def test_patch_without_items_keeps_items(self):
        data = self.create_lineup()
        res = self.client.patch(f"/api/v1/lineups/{data['id']}/", {"description": "New"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["item_count"], 3)
        self.assertEqual(res.data["description"], "New")

    def test_duplicate_is_independent_copy(self):
        data = self.create_lineup()
        res = self.client.post(f"/api/v1/lineups/{data['id']}/duplicate/", {})
        self.assertEqual(res.status_code, 201, res.data)
        copy = res.data
        self.assertNotEqual(copy["id"], data["id"])
        self.assertEqual(copy["name"], "Sunday Mass — Tagalog (copy)")
        self.assertEqual(copy["default_language"], self.tagalog.id)
        self.assertEqual(copy["tags"], data["tags"])
        self.assertIsNone(copy["last_used_at"])
        self.assertEqual(
            [(i["song"], i["label"], i["key"]) for i in copy["items"]],
            [(i["song"], i["label"], i["key"]) for i in data["items"]],
        )
        self.assertTrue(set(i["id"] for i in copy["items"]).isdisjoint(i["id"] for i in data["items"]))

        # editing the copy leaves the original intact
        self.client.patch(f"/api/v1/lineups/{copy['id']}/",
                          {"items": [{"song": self.songs[3].id}], "tag_ids": []})
        original = self.client.get(f"/api/v1/lineups/{data['id']}/").data
        self.assertEqual(original["item_count"], 3)
        self.assertEqual(len(original["tags"]), 1)

        named = self.client.post(f"/api/v1/lineups/{data['id']}/duplicate/", {"name": "Custom"})
        self.assertEqual(named.data["name"], "Custom")

        long_name = "x" * 200
        self.client.patch(f"/api/v1/lineups/{data['id']}/", {"name": long_name})
        res = self.client.post(f"/api/v1/lineups/{data['id']}/duplicate/")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(len(res.data["name"]), 200)

    def test_use_sets_last_used_without_touching_updated_at(self):
        data = self.create_lineup()
        before = Lineup.objects.get(pk=data["id"]).updated_at
        res = self.client.post(f"/api/v1/lineups/{data['id']}/use/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("last_used_at", res.data)
        lineup = Lineup.objects.get(pk=data["id"])
        self.assertIsNotNone(lineup.last_used_at)
        self.assertEqual(lineup.updated_at, before)

    def test_last_used_ordering_excludes_never_used(self):
        a = self.create_lineup(name="A")
        b = self.create_lineup(name="B")
        c = self.create_lineup(name="C")
        self.client.post(f"/api/v1/lineups/{b['id']}/use/")
        self.client.post(f"/api/v1/lineups/{a['id']}/use/")
        res = self.client.get("/api/v1/lineups/", {"ordering": "-last_used_at"})
        self.assertEqual([lu["id"] for lu in res.data["results"]], [a["id"], b["id"]])
        self.assertNotIn(c["id"], [lu["id"] for lu in res.data["results"]])

        # default ordering is -updated_at and "use" did not bump it
        res = self.client.get("/api/v1/lineups/")
        self.assertEqual([lu["id"] for lu in res.data["results"]], [c["id"], b["id"], a["id"]])

        res = self.client.get("/api/v1/lineups/", {"ordering": "name"})
        self.assertEqual([lu["name"] for lu in res.data["results"]], ["A", "B", "C"])

    def test_list_summary_shape_and_preview(self):
        self.create_lineup()
        res = self.client.get("/api/v1/lineups/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 1)
        summary = res.data["results"][0]
        self.assertNotIn("items", summary)
        self.assertEqual(summary["preview_titles"], ["Charlie", "Alpha", "Charlie"])
        self.assertEqual(summary["item_count"], 3)

    def test_filters(self):
        self.create_lineup(name="Tagalog one")
        wedding = self.create_lineup(
            name="Wedding", description="Church wedding", default_language=self.english.id,
            tag_ids=[self.wedding.id, self.ordinary.id],
        )
        res = self.client.get("/api/v1/lineups/", {"search": "church"})
        self.assertEqual([lu["id"] for lu in res.data["results"]], [wedding["id"]])
        res = self.client.get("/api/v1/lineups/", {"language": self.english.id})
        self.assertEqual([lu["id"] for lu in res.data["results"]], [wedding["id"]])
        res = self.client.get("/api/v1/lineups/", {"tags": f"{self.ordinary.id}"})
        self.assertEqual(res.data["count"], 2)
        res = self.client.get("/api/v1/lineups/", {"tags": f"{self.ordinary.id},{self.wedding.id}"})
        self.assertEqual([lu["id"] for lu in res.data["results"]], [wedding["id"]])

    def test_delete(self):
        data = self.create_lineup()
        self.assertEqual(self.client.delete(f"/api/v1/lineups/{data['id']}/").status_code, 204)
        self.assertFalse(Lineup.objects.filter(pk=data["id"]).exists())
        self.assertEqual(Song.objects.count(), 4)
