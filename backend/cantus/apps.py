from django.apps import AppConfig


class CantusConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "cantus"
    verbose_name = "Cantus"

    def ready(self):
        from . import signals  # noqa: F401  (connect signal handlers)
