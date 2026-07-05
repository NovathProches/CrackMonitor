from dataclasses import dataclass

import cv2
import numpy as np

_MIN_CONTOUR_AREA_PX = 200  # contours smaller than this are treated as noise


@dataclass
class CrackMeasurement:
    length_mm: float
    width_mm: float
    area_mm2: float
    overlay_image: np.ndarray  # BGR, ready for JPEG encoding


def measure_crack(image_bytes: bytes, mm_per_px: float) -> CrackMeasurement:
    """
    Detect the dominant crack in image_bytes and return pixel → mm measurements
    plus an annotated overlay image.

    Raises ValueError if the image cannot be decoded or no crack is found.
    """
    # ── Decode ───────────────────────────────────────────────────────────
    arr = np.frombuffer(image_bytes, np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("Could not decode image — unsupported format or corrupt data")

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    # ── Enhance contrast (CLAHE handles uneven field lighting) ───────────
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # ── Threshold ────────────────────────────────────────────────────────
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=11, C=3,
    )

    # ── Morphological cleanup ────────────────────────────────────────────
    # Close small gaps in the crack, then remove isolated speckles
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  kernel, iterations=1)

    # ── Contour detection ────────────────────────────────────────────────
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("No crack detected in image")

    crack = max(contours, key=cv2.contourArea)
    if cv2.contourArea(crack) < _MIN_CONTOUR_AREA_PX:
        raise ValueError("No crack detected — largest region is below noise threshold")

    # ── Measure in pixels ────────────────────────────────────────────────
    rect = cv2.minAreaRect(crack)
    (cx, cy), (dim_a, dim_b), _ = rect
    length_px = max(dim_a, dim_b)
    width_px  = min(dim_a, dim_b)
    area_px   = cv2.contourArea(crack)

    # ── Convert to mm ────────────────────────────────────────────────────
    length_mm = round(length_px * mm_per_px, 2)
    width_mm  = round(width_px  * mm_per_px, 2)
    area_mm2  = round(area_px   * (mm_per_px ** 2), 2)

    # ── Build overlay ────────────────────────────────────────────────────
    overlay = bgr.copy()

    # Semi-transparent green fill
    fill = overlay.copy()
    cv2.drawContours(fill, [crack], -1, (0, 210, 90), thickness=cv2.FILLED)
    cv2.addWeighted(fill, 0.25, overlay, 0.75, 0, overlay)

    # Crack outline
    cv2.drawContours(overlay, [crack], -1, (0, 230, 100), thickness=2)

    # Bounding rectangle
    box = np.int32(cv2.boxPoints(rect))
    cv2.drawContours(overlay, [box], 0, (100, 200, 255), thickness=2)

    # Measurement label — white text, black shadow
    label = f"{length_mm:.1f} x {width_mm:.1f} mm"
    lx, ly = int(cx) + 8, int(cy) - 8
    cv2.putText(overlay, label, (lx + 1, ly + 1),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 2, cv2.LINE_AA)
    cv2.putText(overlay, label, (lx, ly),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)

    return CrackMeasurement(
        length_mm=length_mm,
        width_mm=width_mm,
        area_mm2=area_mm2,
        overlay_image=overlay,
    )
