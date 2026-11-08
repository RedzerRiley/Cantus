"""Keep uploaded song files in storage in sync with the database.

* When a Song is deleted, its file is removed from storage.
* When a Song's file is replaced or cleared, the previous file is removed.

Deletions run after the surrounding transaction commits so a rollback never
leaves a row pointing at a missing file.
"""

import logging

from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import Song

logger = logging.getLogger(__name__)


def _delete_from_storage(storage, name):
    if not name:
        return

    def _do_delete():
        try:
            storage.delete(name)
        except Exception:  # pragma: no cover - storage errors must not break requests
            logger.exception("Could not delete song file %s from storage", name)

    transaction.on_commit(_do_delete)


@receiver(pre_save, sender=Song)
def remember_previous_file(sender, instance, **kwargs):
    if instance.pk is None:
        instance._previous_file_name = ""
        return
    previous = (
        Song.objects.filter(pk=instance.pk).values_list("file", flat=True).first()
    )
    instance._previous_file_name = previous or ""


@receiver(post_save, sender=Song)
def delete_replaced_file(sender, instance, created, **kwargs):
    previous = getattr(instance, "_previous_file_name", "")
    current = instance.file.name or ""
    if previous and previous != current:
        _delete_from_storage(instance.file.storage, previous)
    instance._previous_file_name = current


@receiver(post_delete, sender=Song)
def delete_file_with_song(sender, instance, **kwargs):
    if instance.file:
        _delete_from_storage(instance.file.storage, instance.file.name)
