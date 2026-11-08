from django.contrib import admin

from .models import Language, Lineup, LineupItem, Membership, Song, Tag, Workspace


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    autocomplete_fields = ["user"]
    fields = ["user", "role", "preferred_language", "created_at"]
    readonly_fields = ["created_at"]


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "created_at"]
    search_fields = ["name"]
    inlines = [MembershipInline]


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "workspace", "role", "preferred_language", "created_at"]
    list_filter = ["role"]
    search_fields = ["user__username", "workspace__name"]
    autocomplete_fields = ["user", "workspace"]


@admin.register(Language)
class LanguageAdmin(admin.ModelAdmin):
    list_display = ["name", "workspace"]
    search_fields = ["name", "workspace__name"]
    list_filter = ["workspace"]


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ["name", "workspace"]
    search_fields = ["name", "workspace__name"]
    list_filter = ["workspace"]


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ["title", "composer", "language", "key", "workspace", "updated_at"]
    search_fields = ["title", "composer"]
    list_filter = ["workspace"]
    filter_horizontal = ["tags"]
    readonly_fields = ["created_at", "updated_at"]


class LineupItemInline(admin.TabularInline):
    model = LineupItem
    extra = 0
    fields = ["position", "song", "label", "key", "assigned_to", "notes"]
    raw_id_fields = ["song"]


@admin.register(Lineup)
class LineupAdmin(admin.ModelAdmin):
    list_display = ["name", "workspace", "default_language", "updated_at", "last_used_at"]
    search_fields = ["name", "description"]
    list_filter = ["workspace"]
    filter_horizontal = ["tags"]
    readonly_fields = ["created_at", "updated_at", "last_used_at"]
    inlines = [LineupItemInline]
