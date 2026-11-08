from django.contrib import admin
from django.urls import include, path

# Uploaded song files are NOT served publicly from MEDIA_URL; they are only
# reachable through the authenticated endpoint GET /api/v1/songs/{id}/file/.
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("cantus.urls")),
]
