from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=True)
router.register("workspace/members", views.MemberViewSet, basename="member")
router.register("languages", views.LanguageViewSet, basename="language")
router.register("tags", views.TagViewSet, basename="tag")
router.register("songs", views.SongViewSet, basename="song")
router.register("lineups", views.LineupViewSet, basename="lineup")

urlpatterns = [
    path("health/", views.HealthView.as_view(), name="health"),
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
    path("workspace/", views.WorkspaceView.as_view(), name="workspace"),
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("public/lineups/<str:token>/", views.PublicLineupView.as_view(), name="public-lineup"),
    path(
        "public/lineups/<str:token>/songs/<int:song_id>/file/",
        views.PublicLineupSongFileView.as_view(),
        name="public-lineup-song-file",
    ),
    *router.urls,
]
