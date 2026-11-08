"""Create (idempotently) a demo account with sample songs and lineups.

All demo songs are placeholders: titles are prefixed "[Demo] ", there are no
lyrics, and English/Latin titles are public-domain hymns/chants only. Tagalog
and Taglish entries use generic placeholder titles so no copyrighted works are
bundled.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from cantus.models import Language, Lineup, LineupItem, Membership, Song, Tag, Workspace
from cantus.services import create_default_workspace_data

DEMO_USERNAME = "demo"
DEMO_PASSWORD = "cantus-demo-2026"
DEMO_WORKSPACE = "Demo Parish Choir (demo data)"
DEMO_NOTE = "Demo entry — replace with your parish's licensed materials."

# (title, composer, language, key, tags)
SONGS = [
    ("Holy God, We Praise Thy Name", "Attr. Ignaz Franz (trad.)", "English", "F", ["Entrance", "Ordinary Time"]),
    ("O Come, O Come, Emmanuel", "Trad. (Veni Emmanuel)", "English", "Em", ["Advent", "Entrance"]),
    ("Immaculate Mary", "Trad. (Lourdes hymn)", "English", "D", ["Marian", "Recessional"]),
    ("Come, Holy Ghost", "Attr. Rabanus Maurus (trad.)", "English", "Eb", ["Entrance", "Wedding"]),
    ("Responsorial Psalm (English sample)", "Placeholder", "English", "C", ["Responsorial Psalm"]),
    ("Pange Lingua", "St. Thomas Aquinas (chant)", "Latin", "", ["Communion", "Lent"]),
    ("Salve Regina", "Gregorian chant", "Latin", "", ["Marian", "Recessional"]),
    ("Panis Angelicus", "César Franck", "Latin", "A", ["Communion", "Wedding"]),
    ("Ave Maria (chant)", "Gregorian chant", "Latin", "", ["Marian", "Wedding"]),
    ("Tagalog Entrance Song", "Placeholder", "Tagalog", "G", ["Entrance"]),
    ("Gloria (Tagalog sample)", "Placeholder", "Tagalog", "D", ["Gloria"]),
    ("Tagalog Offertory Song (sample)", "Placeholder", "Tagalog", "C", ["Offertory"]),
    ("Awit sa Komunyon (sample)", "Placeholder", "Tagalog", "F", ["Communion"]),
    ("Taglish Youth Praise Song (sample)", "Placeholder", "Taglish", "E", ["Youth", "Entrance"]),
    ("Taglish Recessional (sample)", "Placeholder", "Taglish", "A", ["Youth", "Recessional"]),
]

# name -> (description, default language, tags, [(song title, label, key, assigned_to)], used_days_ago)
LINEUPS = {
    "Sunday Mass — Tagalog": (
        "Sample Tagalog Sunday lineup (demo data).",
        "Tagalog",
        ["Ordinary Time"],
        [
            ("Tagalog Entrance Song", "Entrance", "", "Choir"),
            ("Gloria (Tagalog sample)", "Gloria", "", "Choir"),
            ("Responsorial Psalm (English sample)", "Responsorial Psalm", "", "Psalmist"),
            ("Tagalog Offertory Song (sample)", "Offertory", "", ""),
            ("Awit sa Komunyon (sample)", "Communion", "E", "Guitar: capo 1"),
            ("Salve Regina", "Recessional", "", ""),
        ],
        1,
    ),
    "Sunday Mass — English": (
        "Sample English Sunday lineup (demo data).",
        "English",
        ["Ordinary Time"],
        [
            ("Holy God, We Praise Thy Name", "Entrance", "", "Organ"),
            ("Responsorial Psalm (English sample)", "Responsorial Psalm", "", "Psalmist"),
            ("Come, Holy Ghost", "Offertory", "D", ""),
            ("Panis Angelicus", "Communion", "", "Soprano solo"),
            ("Immaculate Mary", "Recessional", "", ""),
        ],
        3,
    ),
    "Wedding — English": (
        "Sample wedding lineup (demo data).",
        "English",
        ["Wedding"],
        [
            ("Come, Holy Ghost", "Entrance", "", "Organ"),
            ("Responsorial Psalm (English sample)", "Responsorial Psalm", "", "Psalmist"),
            ("Ave Maria (chant)", "Offertory", "", "Soprano"),
            ("Panis Angelicus", "Communion", "", ""),
            ("Holy God, We Praise Thy Name", "Recessional", "", ""),
        ],
        None,
    ),
    "Youth Mass — Taglish": (
        "Sample youth Mass lineup (demo data).",
        "Taglish",
        ["Youth"],
        [
            ("Taglish Youth Praise Song (sample)", "Entrance", "", "Band"),
            ("Gloria (Tagalog sample)", "Gloria", "", ""),
            ("Tagalog Offertory Song (sample)", "Offertory", "", ""),
            ("Awit sa Komunyon (sample)", "Communion", "", ""),
            ("Taglish Recessional (sample)", "Recessional", "", "Band"),
        ],
        None,
    ),
}


def demo_title(title):
    return f"[Demo] {title}"


class Command(BaseCommand):
    help = "Create (or refresh) the demo account with placeholder songs and lineups."

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        user, user_created = User.objects.get_or_create(
            username=DEMO_USERNAME,
            defaults={"first_name": "Demo", "last_name": "User"},
        )
        user.set_password(DEMO_PASSWORD)
        user.is_active = True
        user.save()

        membership = Membership.objects.filter(user=user).select_related("workspace").first()
        if membership is None:
            workspace = Workspace.objects.create(name=DEMO_WORKSPACE)
            create_default_workspace_data(workspace)
            membership = Membership.objects.create(
                user=user, workspace=workspace, role=Membership.Role.ADMIN
            )
        workspace = membership.workspace

        languages = {}
        for name in {s[2] for s in SONGS}:
            lang = Language.objects.filter(workspace=workspace, name__iexact=name).first()
            if lang is None:
                lang = Language.objects.create(workspace=workspace, name=name)
            languages[name] = lang

        tag_names = {t for s in SONGS for t in s[4]} | {t for lineup in LINEUPS.values() for t in lineup[2]}
        tags = {}
        for name in tag_names:
            tag = Tag.objects.filter(workspace=workspace, name__iexact=name).first()
            if tag is None:
                tag = Tag.objects.create(workspace=workspace, name=name)
            tags[name] = tag

        if membership.preferred_language_id is None:
            membership.preferred_language = languages["English"]
            membership.save(update_fields=["preferred_language"])

        songs = {}
        songs_created = 0
        for title, composer, language, key, song_tags in SONGS:
            song, created = Song.objects.get_or_create(
                workspace=workspace,
                title=demo_title(title),
                defaults={
                    "composer": composer,
                    "language": languages[language],
                    "key": key,
                    "notes": DEMO_NOTE,
                    "created_by": user,
                },
            )
            if created:
                song.tags.set([tags[t] for t in song_tags])
                songs_created += 1
            songs[title] = song

        lineups_created = 0
        now = timezone.now()
        for name, (description, language, lineup_tags, items, used_days_ago) in LINEUPS.items():
            lineup, created = Lineup.objects.get_or_create(
                workspace=workspace,
                name=demo_title(name),
                defaults={
                    "description": description,
                    "default_language": languages[language],
                    "created_by": user,
                },
            )
            if not created:
                continue
            lineups_created += 1
            lineup.tags.set([tags[t] for t in lineup_tags])
            LineupItem.objects.bulk_create(
                [
                    LineupItem(
                        lineup=lineup,
                        song=songs[title],
                        position=index,
                        label=label,
                        key=key,
                        assigned_to=assigned_to,
                    )
                    for index, (title, label, key, assigned_to) in enumerate(items)
                ]
            )
            if used_days_ago is not None:
                Lineup.objects.filter(pk=lineup.pk).update(
                    last_used_at=now - timedelta(days=used_days_ago)
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Demo data ready in workspace '{workspace.name}' "
                f"({songs_created} songs and {lineups_created} lineups created; "
                f"{'new' if user_created else 'existing'} user)."
            )
        )
        self.stdout.write(f"Log in with  username: {DEMO_USERNAME}  password: {DEMO_PASSWORD}")
