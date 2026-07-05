"""
Simulate an ESP32CAM POST to /detections.

Usage:
    python test_send.py --token <device_token> [--image path/to/crack.jpg]

If --image is omitted, a synthetic crack image is generated with OpenCV.
The device_token must match a row in the `devices` Supabase table.
"""

import argparse
import hashlib
import io
import json
import sys
from datetime import datetime, timezone

import cv2
import numpy as np
import requests


def make_synthetic_crack(width=640, height=480) -> bytes:
    img = np.ones((height, width), dtype=np.uint8) * 220  # light grey surface

    # Draw a jagged diagonal crack
    rng = np.random.default_rng(42)
    x, y = width // 4, height // 4
    pts = [(x, y)]
    for _ in range(80):
        x += int(rng.integers(4, 10))
        y += int(rng.integers(-3, 8))
        pts.append((x, y))

    for i in range(1, len(pts)):
        cv2.line(img, pts[i - 1], pts[i], 30, thickness=rng.integers(2, 5).item())

    # Add slight noise so the pipeline has a realistic signal
    noise = rng.integers(0, 15, img.shape, dtype=np.uint8)
    img = cv2.subtract(img, noise)

    bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    _, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return bytes(buf)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True, help="device_token registered in Supabase")
    parser.add_argument("--image", default=None, help="Path to a real crack JPEG (optional)")
    parser.add_argument("--url", default="http://localhost:8000/detections")
    parser.add_argument("--lat", type=float, default=36.7213)
    parser.add_argument("--lng", type=float, default=3.1562)
    args = parser.parse_args()

    if args.image:
        with open(args.image, "rb") as f:
            image_bytes = f.read()
        print(f"Using image: {args.image}")
    else:
        image_bytes = make_synthetic_crack()
        print("Using synthetic crack image (640×480)")

    now = datetime.now(timezone.utc)
    metadata = {
        "device_token": args.token,
        "lat": args.lat,
        "lng": args.lng,
        "gps_accuracy_m": 3.0,
        "ir_triggered": True,
        "ultrasonic_mm": 12.5,
        "timestamp": now.isoformat(),
        "image_path": f"images/{now.strftime('%Y-%m-%d_%H-%M-%S')}.jpg",
    }

    print(f"POSTing to {args.url} …")
    resp = requests.post(
        args.url,
        files={"image": ("crack.jpg", io.BytesIO(image_bytes), "image/jpeg")},
        data={"metadata": json.dumps(metadata)},
        timeout=30,
    )

    print(f"Status: {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text)

    sys.exit(0 if resp.status_code == 201 else 1)


if __name__ == "__main__":
    main()
