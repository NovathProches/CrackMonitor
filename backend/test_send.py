"""
Simulate an ESP32CAM POST to /api/detections/.

Usage:
    python test_send.py [--image path/to/crack.jpg] [--url http://localhost:8000/api/detections/]

If --image is omitted, a synthetic crack image is generated with OpenCV.
"""

import argparse
import base64
import json
import sys

import cv2
import numpy as np
import requests


def make_synthetic_crack(width=640, height=480) -> bytes:
    img = np.ones((height, width), dtype=np.uint8) * 220
    rng = np.random.default_rng(42)
    x, y = width // 4, height // 4
    pts = [(x, y)]
    for _ in range(80):
        x += int(rng.integers(4, 10))
        y += int(rng.integers(-3, 8))
        pts.append((x, y))
    for i in range(1, len(pts)):
        cv2.line(img, pts[i - 1], pts[i], 30, thickness=rng.integers(2, 5).item())
    noise = rng.integers(0, 15, img.shape, dtype=np.uint8)
    img = cv2.subtract(img, noise)
    bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    _, buf = cv2.imencode('.jpg', bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return bytes(buf)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', default=None)
    parser.add_argument('--url', default='http://localhost:8000/api/detections/')
    parser.add_argument('--lat', type=float, default=36.7213)
    parser.add_argument('--lng', type=float, default=3.1562)
    parser.add_argument('--device-token', default='', dest='device_token')
    args = parser.parse_args()

    if args.image:
        with open(args.image, 'rb') as f:
            image_bytes = f.read()
        print(f'Using image: {args.image}')
    else:
        image_bytes = make_synthetic_crack()
        print('Using synthetic crack image (640×480)')

    payload = {
        'image': base64.b64encode(image_bytes).decode(),
        'lat': args.lat,
        'lng': args.lng,
    }

    headers = {}
    if args.device_token:
        headers['Device-Token'] = args.device_token

    print(f'POSTing to {args.url} …')
    resp = requests.post(args.url, json=payload, headers=headers, timeout=30)

    print(f'Status: {resp.status_code}')
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text)

    sys.exit(0 if resp.status_code == 201 else 1)


if __name__ == '__main__':
    main()
