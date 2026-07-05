import uuid
from datetime import date

import cv2
import numpy as np
from supabase import Client

BUCKET = "detections"


def upload_images(
    sb: Client,
    device_id: str,
    raw_bytes: bytes,
    overlay: np.ndarray,
    image_path: str | None = None,
) -> tuple[str, str]:
    """
    Upload raw capture + annotated overlay to Supabase Storage.
    Returns (image_path, overlay_path) — relative paths within the bucket.
    """
    if image_path:
        stem = image_path.removesuffix(".jpg")
        overlay_path = f"{stem}_overlay.jpg"
    else:
        prefix = f"{device_id}/{date.today().isoformat()}/{uuid.uuid4()}"
        image_path   = f"{prefix}_raw.jpg"
        overlay_path = f"{prefix}_overlay.jpg"

    _, overlay_buf = cv2.imencode(".jpg", overlay, [cv2.IMWRITE_JPEG_QUALITY, 90])

    sb.storage.from_(BUCKET).upload(
        image_path,
        raw_bytes,
        {"content-type": "image/jpeg"},
    )
    sb.storage.from_(BUCKET).upload(
        overlay_path,
        bytes(overlay_buf),
        {"content-type": "image/jpeg"},
    )

    return image_path, overlay_path
