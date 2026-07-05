import hashlib
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client

from crack_detector import measure_crack
from storage import upload_images

load_dotenv(override=True)

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)

app = FastAPI(title="Crack Monitor CV Service", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── request schema ────────────────────────────────────────────────────────────

class DetectionMeta(BaseModel):
    device_token: str
    lat: float | None = None
    lng: float | None = None
    gps_accuracy_m: float | None = None
    ir_triggered: bool = False
    ultrasonic_mm: float | None = None
    timestamp: datetime
    image_path: str | None = None


# ── helpers ───────────────────────────────────────────────────────────────────

def classify_severity(length_mm: float, width_mm: float) -> str:
    if width_mm >= 5.0 or length_mm >= 50.0:
        return "critical"
    if width_mm >= 2.0 or length_mm >= 20.0:
        return "high"
    if width_mm >= 0.5 or length_mm >= 5.0:
        return "medium"
    return "low"


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/detections", status_code=201)
async def create_detection(
    image: UploadFile = File(...),
    metadata: str = Form(...),
):
    meta = DetectionMeta.model_validate_json(metadata)

    # 1 ── Authenticate device by hashed token
    token_hash = hashlib.sha256(meta.device_token.encode()).hexdigest()
    res = (
        supabase.table("devices")
        .select("id, mm_per_px, camera_height_mm")
        .eq("device_token_hash", token_hash)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=401, detail="Unknown device token")

    device     = res.data[0]
    device_id  = device["id"]
    mm_per_px  = float(device.get("mm_per_px") or 0.05)  # fallback: 0.05 mm/px

    # 2 ── Update device.last_seen
    supabase.table("devices").update(
        {"last_seen": datetime.now(timezone.utc).isoformat()}
    ).eq("id", device_id).execute()

    # 3 ── Read image bytes
    raw_bytes = await image.read()

    # 4 ── OpenCV crack detection + measurement
    try:
        result = measure_crack(raw_bytes, mm_per_px)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # 5 ── Upload raw + overlay to Supabase Storage
    image_path, overlay_path = upload_images(supabase, device_id, raw_bytes, result.overlay_image, meta.image_path)

    # 6 ── Classify severity
    severity = classify_severity(result.length_mm, result.width_mm)

    # 7 ── Insert detection row
    row = (
        supabase.table("detections")
        .insert({
            "device_id": device_id,
            "captured_at": meta.timestamp.isoformat(),
            "lat": meta.lat,
            "lng": meta.lng,
            "gps_accuracy_m": meta.gps_accuracy_m,
            "ir_triggered": meta.ir_triggered,
            "ultrasonic_mm": meta.ultrasonic_mm,
            "image_path": image_path,
            "overlay_path": overlay_path,
            "crack_length_mm": result.length_mm,
            "crack_width_mm": result.width_mm,
            "crack_area_mm2": result.area_mm2,
            "severity": severity,
            "status": "unreviewed",
            "measurement_source": "auto",
        })
        .execute()
    )

    detection_id = row.data[0]["id"]

    return {
        "detection_id": detection_id,
        "crack_length_mm": result.length_mm,
        "crack_width_mm": result.width_mm,
        "crack_area_mm2": result.area_mm2,
        "severity": severity,
        "image_path": image_path,
        "overlay_path": overlay_path,
    }


class TicketCreate(BaseModel):
    detection_id: str
    assignee_id: str | None = None


@app.post("/tickets", status_code=201)
async def create_ticket(body: TicketCreate):
    det = supabase.table("detections").select("id").eq("id", body.detection_id).limit(1).execute()
    if not det.data:
        raise HTTPException(status_code=404, detail="Detection not found")

    existing = (
        supabase.table("tickets")
        .select("id")
        .eq("detection_id", body.detection_id)
        .in_("status", ["open", "in_progress"])
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="An open ticket already exists for this detection")

    row = supabase.table("tickets").insert({
        "detection_id": body.detection_id,
        "assignee_id": body.assignee_id,
        "status": "open",
    }).execute()

    return row.data[0]
