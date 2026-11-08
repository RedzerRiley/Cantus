import codecs
import os

from django.conf import settings
from django.core.exceptions import ValidationError

# extension -> content kind
ALLOWED_EXTENSIONS = {
    ".pdf": "pdf",
    ".png": "png",
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".txt": "text",
    ".cho": "text",
    ".chopro": "text",
}

TEXT_SNIFF_BYTES = 64 * 1024

MAGIC = {
    "pdf": (b"%PDF-",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpeg": (b"\xff\xd8\xff",),
}

KIND_LABELS = {
    "pdf": "a PDF",
    "png": "a PNG image",
    "jpeg": "a JPEG image",
    "text": "a UTF-8 text file",
}


def max_upload_bytes():
    return int(float(settings.MAX_UPLOAD_MB) * 1024 * 1024)


def _format_mb(value):
    return f"{float(value):g}"


def _read_head(f, size):
    try:
        f.seek(0)
    except (AttributeError, OSError):
        pass
    head = f.read(size)
    try:
        f.seek(0)
    except (AttributeError, OSError):
        pass
    if isinstance(head, str):  # defensive: text-mode file objects
        head = head.encode("utf-8")
    return head or b""


def _looks_like_utf8_text(head, complete):
    if b"\x00" in head:
        return False
    decoder = codecs.getincrementaldecoder("utf-8")()
    try:
        # When we only read part of the file, a multi-byte character may be
        # cut at the boundary; final=False tolerates that.
        decoder.decode(head, final=complete)
    except UnicodeDecodeError:
        return False
    return True


def validate_song_file(f):
    """Validate an uploaded song file: extension whitelist, size limit and
    content sniffing. Raises django.core.exceptions.ValidationError."""
    name = getattr(f, "name", "") or ""
    ext = os.path.splitext(name)[1].lower()
    kind = ALLOWED_EXTENSIONS.get(ext)
    if kind is None:
        allowed = " ".join(sorted(ALLOWED_EXTENSIONS))
        raise ValidationError(
            f"Unsupported file type. Allowed extensions: {allowed}.",
            code="invalid_extension",
        )

    size = getattr(f, "size", None)
    limit = max_upload_bytes()
    if size is not None and size > limit:
        raise ValidationError(
            f"File is too large. Maximum size is {_format_mb(settings.MAX_UPLOAD_MB)} MB.",
            code="file_too_large",
        )
    if size == 0:
        raise ValidationError("The submitted file is empty.", code="empty")

    if kind == "text":
        head = _read_head(f, TEXT_SNIFF_BYTES)
        complete = size is not None and size <= len(head)
        ok = _looks_like_utf8_text(head, complete)
    else:
        head = _read_head(f, 16)
        ok = any(head.startswith(magic) for magic in MAGIC[kind])

    if not ok:
        raise ValidationError(
            f"File content does not match its extension (expected {KIND_LABELS[kind]}).",
            code="content_mismatch",
        )
