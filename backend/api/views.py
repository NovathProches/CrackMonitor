import base64
import csv
import io
import uuid
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path

import cv2
import numpy as np
from django.conf import settings
from django.contrib.auth import authenticate
from django.http import HttpResponse
from django.db.models import Avg, Count, Q
from django.utils import timezone as dj_tz
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Detection, Device, Engineer, Ticket
from .serializers import (
    DetectionSerializer,
    DeviceSerializer,
    EngineerBriefSerializer,
    EngineerSerializer,
    TicketSerializer,
)

try:
    from crack_detector import measure_crack
    CV_AVAILABLE = True
except ImportError:
    CV_AVAILABLE = False

try:
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    RL_AVAILABLE = True
except ImportError:
    RL_AVAILABLE = False


# ── helpers ───────────────────────────────────────────────────────────────────

def save_images(device_id, raw_bytes: bytes, overlay: np.ndarray) -> tuple[str, str]:
    folder = str(device_id) if device_id else 'unassigned'
    today = datetime.now(timezone.utc).date().isoformat()
    uid = uuid.uuid4().hex
    rel_raw = f'detections/{folder}/{today}/{uid}_raw.jpg'
    rel_overlay = f'detections/{folder}/{today}/{uid}_overlay.jpg'

    raw_path = settings.MEDIA_ROOT / rel_raw
    overlay_path = settings.MEDIA_ROOT / rel_overlay
    raw_path.parent.mkdir(parents=True, exist_ok=True)

    raw_path.write_bytes(raw_bytes)
    _, buf = cv2.imencode('.jpg', overlay, [cv2.IMWRITE_JPEG_QUALITY, 90])
    overlay_path.write_bytes(bytes(buf))

    return rel_raw, rel_overlay


def get_device_from_request(request) -> Device | None:
    token = request.headers.get('Device-Token') or request.data.get('device_token')
    if not token:
        return None
    h = sha256(token.encode()).hexdigest()
    return Device.objects.filter(device_token_hash=h).first()


def _compute_report(period: int) -> dict:
    since = dj_tz.now() - timedelta(days=period)

    dets = list(
        Detection.objects
        .filter(captured_at__gte=since)
        .values('captured_at', 'crack_width_mm')
    )
    tickets = list(
        Ticket.objects
        .filter(created_at__gte=since)
        .values('status', 'created_at', 'resolved_at')
    )

    day_map: dict[str, dict] = {}
    for i in range(period - 1, -1, -1):
        d = (dj_tz.now() - timedelta(days=i)).date().isoformat()
        day_map[d] = {'count': 0, 'widths': []}

    for det in dets:
        key = det['captured_at'].date().isoformat()
        if key in day_map:
            day_map[key]['count'] += 1
            if det['crack_width_mm'] is not None:
                day_map[key]['widths'].append(det['crack_width_mm'])

    daily = []
    for date, info in day_map.items():
        d_obj = datetime.fromisoformat(date + 'T12:00:00')
        try:
            label = d_obj.strftime('%d %b').lstrip('0') or date
        except Exception:
            label = date
        widths = info['widths']
        daily.append({
            'date': date,
            'label': label,
            'count': info['count'],
            'avg_width': round(sum(widths) / len(widths), 2) if widths else None,
        })

    t_counts = {'open': 0, 'in_progress': 0, 'resolved': 0}
    resolved_count = 0
    total_ms = 0

    for t in tickets:
        st = t['status']
        if st == 'open':
            t_counts['open'] += 1
        elif st == 'in_progress':
            t_counts['in_progress'] += 1
        elif st == 'resolved':
            t_counts['resolved'] += 1
            if t['resolved_at']:
                resolved_count += 1
                total_ms += int(
                    (t['resolved_at'] - t['created_at']).total_seconds() * 1000
                )

    total_t = len(tickets)
    resolution_rate = round(t_counts['resolved'] / total_t * 100) if total_t else 0

    mttr = None
    if resolved_count:
        avg_hrs = total_ms / resolved_count / 3_600_000
        mttr = f'{round(avg_hrs)}h' if avg_hrs < 24 else f'{avg_hrs / 24:.1f}d'

    all_widths = [d['crack_width_mm'] for d in dets if d['crack_width_mm'] is not None]
    avg_width = round(sum(all_widths) / len(all_widths), 2) if all_widths else None

    return {
        'daily': daily,
        'summary': {
            'total_detections': len(dets),
            'resolution_rate': resolution_rate,
            'avg_width': avg_width,
            'mttr': mttr,
            'ticket_counts': t_counts,
        },
    }


def _export_csv(data: dict, period: int) -> HttpResponse:
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    summary = data['summary']
    t_counts = summary['ticket_counts']

    buf = io.StringIO()
    w = csv.writer(buf)

    w.writerow(['CrackMonitor Report'])
    w.writerow([f'Period: Last {period} days'])
    w.writerow([f'Generated: {today}'])
    w.writerow([])
    w.writerow(['SUMMARY'])
    w.writerow(['Metric', 'Value'])
    w.writerow(['Total Detections', summary['total_detections']])
    w.writerow(['Resolution Rate', f"{summary['resolution_rate']}%"])
    w.writerow(['Avg Crack Width (mm)', summary['avg_width'] if summary['avg_width'] is not None else ''])
    w.writerow(['MTTR', summary['mttr'] or ''])
    w.writerow(['Open Tickets', t_counts['open']])
    w.writerow(['In Progress Tickets', t_counts['in_progress']])
    w.writerow(['Resolved Tickets', t_counts['resolved']])
    w.writerow([])
    w.writerow(['DAILY BREAKDOWN'])
    w.writerow(['Date', 'Detections', 'Avg Width (mm)'])
    for day in data['daily']:
        w.writerow([
            day['date'],
            day['count'],
            day['avg_width'] if day['avg_width'] is not None else '',
        ])

    resp = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = f'attachment; filename="crack-report-{period}d-{today}.csv"'
    return resp


def _export_pdf(data: dict, period: int) -> HttpResponse:
    if not RL_AVAILABLE:
        return HttpResponse(
            b'{"error":"reportlab not installed"}',
            content_type='application/json',
            status=501,
        )

    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    summary = data['summary']
    t_counts = summary['ticket_counts']

    PRIMARY = rl_colors.HexColor('#7F77DD')
    HEADER_FG = rl_colors.white
    ROW_ALT = rl_colors.HexColor('#f8fafc')
    BORDER = rl_colors.HexColor('#e2e8f0')

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CMTitle', parent=styles['Heading1'],
        fontSize=18, textColor=PRIMARY,
        spaceAfter=0.15 * cm, alignment=TA_CENTER,
    )
    sub_style = ParagraphStyle(
        'CMSub', parent=styles['Normal'],
        fontSize=9, textColor=rl_colors.HexColor('#64748b'),
        spaceAfter=0.8 * cm, alignment=TA_CENTER,
    )
    section_style = ParagraphStyle(
        'CMSection', parent=styles['Heading2'],
        fontSize=11, textColor=PRIMARY,
        spaceBefore=0.5 * cm, spaceAfter=0.3 * cm,
    )

    def styled_table(header, rows, col_widths):
        t = Table([header] + rows, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
            ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_FG),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, ROW_ALT]),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ]))
        return t

    avg_w_str = f"{summary['avg_width']} mm" if summary['avg_width'] is not None else '—'
    W = 17 * cm

    story = [
        Paragraph('CrackMonitor — Crack Detection Report', title_style),
        Paragraph(f'Period: Last {period} days  |  Generated: {today}', sub_style),
        Paragraph('Summary', section_style),
        styled_table(
            ['Metric', 'Value'],
            [
                ['Total Detections', str(summary['total_detections'])],
                ['Resolution Rate', f"{summary['resolution_rate']}%"],
                ['Avg Crack Width', avg_w_str],
                ['Mean Time to Resolve', summary['mttr'] or '—'],
            ],
            [W * 0.6, W * 0.4],
        ),
        Paragraph('Ticket Pipeline', section_style),
        styled_table(
            ['Status', 'Count'],
            [
                ['Open', str(t_counts['open'])],
                ['In Progress', str(t_counts['in_progress'])],
                ['Resolved', str(t_counts['resolved'])],
            ],
            [W * 0.6, W * 0.4],
        ),
        Paragraph('Daily Breakdown', section_style),
        styled_table(
            ['Date', 'Detections', 'Avg Width (mm)'],
            [
                [
                    day['date'],
                    str(day['count']),
                    str(day['avg_width']) if day['avg_width'] is not None else '—',
                ]
                for day in data['daily']
            ],
            [W * 0.4, W * 0.3, W * 0.3],
        ),
    ]

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()

    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="crack-report-{period}d-{today}.pdf"'
    return resp


# ── auth views ────────────────────────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email') or request.data.get('username', '')
        password = request.data.get('password', '')
        user = authenticate(request, username=email, password=password)
        if user is None:
            # Try email lookup (Django username may equal email)
            from django.contrib.auth.models import User as DUser
            try:
                du = DUser.objects.get(email=email)
                user = authenticate(request, username=du.username, password=password)
            except (DUser.DoesNotExist, DUser.MultipleObjectsReturned):
                pass
        if user is None:
            return Response({'detail': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

        token, _ = Token.objects.get_or_create(user=user)
        profile = _engineer_profile(user)
        return Response({'token': token.key, 'user': profile})


class LogoutView(APIView):
    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(_engineer_profile(request.user))

    def patch(self, request):
        eng = _get_or_create_engineer(request.user)
        name = request.data.get('name', eng.name)
        code = request.data.get('code', eng.code)
        eng.name = name.strip()
        eng.code = code.strip().upper()[:4]
        eng.save(update_fields=['name', 'code'])
        return Response(_engineer_profile(request.user))


class AvatarUploadView(APIView):
    def post(self, request):
        file = request.FILES.get('avatar')
        if not file:
            return Response({'detail': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        if file.size > 5 * 1024 * 1024:
            return Response({'detail': 'File too large (max 5 MB)'}, status=status.HTTP_400_BAD_REQUEST)

        eng = _get_or_create_engineer(request.user)
        ext = Path(file.name).suffix.lower() or '.jpg'
        rel = f'avatars/{request.user.pk}{ext}'
        dest = settings.MEDIA_ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, 'wb') as f:
            for chunk in file.chunks():
                f.write(chunk)

        if eng.avatar:
            old = settings.MEDIA_ROOT / eng.avatar.name
            if old.exists() and old != dest:
                old.unlink(missing_ok=True)

        eng.avatar.name = rel
        eng.save(update_fields=['avatar'])
        return Response({'avatar_url': eng.avatar_url})


def _engineer_profile(user) -> dict:
    try:
        eng = user.engineer_profile
        return {
            'id': str(eng.id),
            'email': eng.email or user.email,
            'name': eng.name,
            'code': eng.code,
            'avatar_url': eng.avatar_url,
        }
    except Engineer.DoesNotExist:
        return {
            'id': str(user.pk),
            'email': user.email,
            'name': user.get_full_name() or user.username,
            'code': '',
            'avatar_url': None,
        }


def _get_or_create_engineer(user) -> Engineer:
    try:
        return user.engineer_profile
    except Engineer.DoesNotExist:
        eng, _ = Engineer.objects.get_or_create(
            email=user.email,
            defaults={'name': user.get_full_name() or user.username, 'user': user},
        )
        if eng.user is None:
            eng.user = user
            eng.save(update_fields=['user'])
        return eng


# ── detection views ───────────────────────────────────────────────────────────

class DetectionListView(APIView):
    def get(self, request):
        qs = Detection.objects.prefetch_related('tickets__assignee').all()
        if st := request.query_params.get('status'):
            qs = qs.filter(status=st)

        page = int(request.query_params.get('page', 0))
        page_size = int(request.query_params.get('page_size', 25))
        total = qs.count()
        qs = qs[page * page_size: (page + 1) * page_size]
        return Response({'count': total, 'results': DetectionSerializer(qs, many=True).data})

    def post(self, request):
        # ESP32 endpoint — accepts device token or unauthenticated
        raw_b64 = request.data.get('image')
        if not raw_b64:
            return Response({'detail': 'image field required'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        try:
            raw_bytes = base64.b64decode(raw_b64)
        except Exception:
            return Response({'detail': 'image must be valid base64'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        device = get_device_from_request(request)
        mm_per_px = device.mm_per_px if device and device.mm_per_px else 0.05

        if not CV_AVAILABLE:
            return Response({'detail': 'OpenCV not available'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            result = measure_crack(raw_bytes, mm_per_px)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        image_path, overlay_path = save_images(
            device.id if device else None, raw_bytes, result.overlay_image,
        )

        det = Detection.objects.create(
            device=device,
            captured_at=dj_tz.now(),
            lat=request.data.get('lat'),
            lng=request.data.get('lng'),
            image_path=image_path,
            overlay_path=overlay_path,
            crack_length_mm=result.length_mm,
            crack_width_mm=result.width_mm,
            crack_area_mm2=result.area_mm2,
            status='unreviewed',
        )

        if device:
            device.last_seen = dj_tz.now()
            device.save(update_fields=['last_seen'])

        return Response({
            'detection_id': str(det.id),
            'crack_length_mm': result.length_mm,
            'crack_width_mm': result.width_mm,
            'crack_area_mm2': result.area_mm2,
            'image_url': det.image_url,
            'overlay_url': det.overlay_url,
        }, status=status.HTTP_201_CREATED)

    def get_permissions(self):
        if self.request.method == 'POST':
            return []  # Device token validated in-view; allow ESP32 without user token
        return [IsAuthenticated()]

    def initialize_request(self, request, *args, **kwargs):
        return super().initialize_request(request, *args, **kwargs)


class DetectionDetailView(APIView):
    def get_object(self, pk):
        try:
            return Detection.objects.prefetch_related('tickets__assignee').get(pk=pk)
        except Detection.DoesNotExist:
            return None

    def get(self, request, pk):
        det = self.get_object(pk)
        if det is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(DetectionSerializer(det).data)

    def patch(self, request, pk):
        det = self.get_object(pk)
        if det is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if st := request.data.get('status'):
            det.status = st
            det.save(update_fields=['status'])
        return Response(DetectionSerializer(det).data)


# ── ticket views ──────────────────────────────────────────────────────────────

class TicketListView(APIView):
    def get(self, request):
        qs = Ticket.objects.select_related('assignee', 'detection').all()
        if st := request.query_params.get('status'):
            qs = qs.filter(status=st)
        if aid := request.query_params.get('assignee_id'):
            qs = qs.filter(assignee_id=aid)

        open_c = Ticket.objects.filter(status='open').count()
        inp_c = Ticket.objects.filter(status='in_progress').count()
        res_c = Ticket.objects.filter(status='resolved').count()

        page = int(request.query_params.get('page', 0))
        page_size = int(request.query_params.get('page_size', 25))
        total = qs.count()
        qs = qs[page * page_size: (page + 1) * page_size]

        return Response({
            'count': total,
            'counts': {'open': open_c, 'in_progress': inp_c, 'resolved': res_c},
            'results': TicketSerializer(qs, many=True).data,
        })

    def post(self, request):
        det_id = request.data.get('detection_id')
        if not det_id:
            return Response({'detail': 'detection_id required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            det = Detection.objects.get(pk=det_id)
        except Detection.DoesNotExist:
            return Response({'detail': 'Detection not found'}, status=status.HTTP_404_NOT_FOUND)

        if Ticket.objects.filter(detection=det, status__in=['open', 'in_progress']).exists():
            return Response(
                {'detail': 'An open ticket already exists for this detection'},
                status=status.HTTP_409_CONFLICT,
            )

        assignee = None
        if aid := request.data.get('assignee_id'):
            try:
                assignee = Engineer.objects.get(pk=aid)
            except Engineer.DoesNotExist:
                pass

        ticket = Ticket.objects.create(detection=det, assignee=assignee, status='open')
        return Response(TicketSerializer(ticket).data, status=status.HTTP_201_CREATED)


class TicketDetailView(APIView):
    def get_object(self, pk):
        try:
            return Ticket.objects.select_related('assignee', 'detection').get(pk=pk)
        except Ticket.DoesNotExist:
            return None

    def get(self, request, pk):
        ticket = self.get_object(pk)
        if ticket is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(TicketSerializer(ticket).data)

    def patch(self, request, pk):
        ticket = self.get_object(pk)
        if ticket is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if st := request.data.get('status'):
            ticket.status = st
            if st == 'resolved' and not ticket.resolved_at:
                ticket.resolved_at = dj_tz.now()
                if request.user.is_authenticated:
                    try:
                        ticket.resolved_by = request.user.engineer_profile
                    except Engineer.DoesNotExist:
                        pass

        if 'assignee_id' in request.data:
            aid = request.data['assignee_id']
            if aid:
                try:
                    ticket.assignee = Engineer.objects.get(pk=aid)
                except Engineer.DoesNotExist:
                    pass
            else:
                ticket.assignee = None

        ticket.save()
        return Response(TicketSerializer(ticket).data)


# ── engineer views ────────────────────────────────────────────────────────────

class EngineerListView(APIView):
    def get(self, request):
        engs = Engineer.objects.all()
        return Response(EngineerSerializer(engs, many=True).data)

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        email = (request.data.get('email') or '').strip()
        code = (request.data.get('code') or '').strip().upper()[:4]
        if not name or not email:
            return Response({'detail': 'name and email required'}, status=status.HTTP_400_BAD_REQUEST)
        if Engineer.objects.filter(email=email).exists():
            return Response({'detail': 'Engineer with this email already exists'}, status=status.HTTP_409_CONFLICT)
        eng = Engineer.objects.create(name=name, email=email, code=code)
        return Response(EngineerSerializer(eng).data, status=status.HTTP_201_CREATED)


class EngineerDetailView(APIView):
    def patch(self, request, pk):
        try:
            eng = Engineer.objects.get(pk=pk)
        except Engineer.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if name := request.data.get('name'):
            eng.name = name.strip()
        if 'code' in request.data:
            eng.code = (request.data['code'] or '').strip().upper()[:4]
        eng.save()
        return Response(EngineerSerializer(eng).data)


# ── device views ──────────────────────────────────────────────────────────────

class DeviceListView(APIView):
    def get(self, request):
        devices = Device.objects.all()
        return Response(DeviceSerializer(devices, many=True).data)

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'detail': 'name required'}, status=status.HTTP_400_BAD_REQUEST)

        plain_token = (request.data.get('device_token') or '').strip()
        token_hash = ''
        if plain_token:
            token_hash = sha256(plain_token.encode()).hexdigest()

        device = Device.objects.create(
            name=name,
            mm_per_px=request.data.get('mm_per_px'),
            camera_height_mm=request.data.get('camera_height_mm'),
            device_token_hash=token_hash,
        )
        return Response(DeviceSerializer(device).data, status=status.HTTP_201_CREATED)


class DeviceDetailView(APIView):
    def patch(self, request, pk):
        try:
            device = Device.objects.get(pk=pk)
        except Device.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if 'mm_per_px' in request.data:
            v = request.data['mm_per_px']
            device.mm_per_px = float(v) if v not in (None, '') else None
        if 'camera_height_mm' in request.data:
            v = request.data['camera_height_mm']
            device.camera_height_mm = float(v) if v not in (None, '') else None
        device.save()
        return Response(DeviceSerializer(device).data)


# ── stats views ───────────────────────────────────────────────────────────────

class DashboardStatsView(APIView):
    def get(self, request):
        total_detections = Detection.objects.count()
        open_tickets = Ticket.objects.filter(status='open').count()
        in_progress = Ticket.objects.filter(status='in_progress').count()
        resolved = Ticket.objects.filter(status='resolved').count()
        total_tickets = open_tickets + in_progress + resolved

        latest_det = (
            Detection.objects
            .prefetch_related('tickets__assignee')
            .order_by('-captured_at')
            .first()
        )

        recent_dets = list(
            Detection.objects
            .order_by('-captured_at')
            .values('id', 'captured_at', 'lat', 'lng', 'crack_length_mm', 'crack_width_mm')[1:6]
        )
        # Stringify UUIDs
        for d in recent_dets:
            d['id'] = str(d['id'])

        queue = list(
            Ticket.objects
            .select_related('assignee', 'detection')
            .filter(status__in=['open', 'in_progress'])
            .order_by('-pk')[:10]
        )

        engineers = list(Engineer.objects.values('id', 'name', 'code'))
        for e in engineers:
            e['id'] = str(e['id'])

        from .serializers import DetectionSerializer as DS
        latest_data = DS(latest_det).data if latest_det else None

        queue_data = []
        for t in queue:
            det = t.detection
            queue_data.append({
                'ticket_number': t.pk,
                'status': t.status,
                'detection': {
                    'lat': det.lat if det else None,
                    'lng': det.lng if det else None,
                    'crack_length_mm': det.crack_length_mm if det else None,
                } if det else None,
                'assignee': {
                    'name': t.assignee.name,
                    'code': t.assignee.code,
                } if t.assignee else None,
            })

        return Response({
            'total_detections': total_detections,
            'open_tickets': open_tickets,
            'in_progress_tickets': in_progress,
            'resolved_tickets': resolved,
            'total_tickets': total_tickets,
            'latest_detection': latest_data,
            'recent_detections': recent_dets,
            'queue_tickets': queue_data,
            'engineers': engineers,
        })


class ReportsView(APIView):
    def get(self, request):
        period = int(request.query_params.get('period', 7))
        return Response(_compute_report(period))


class ReportExportView(APIView):
    def get(self, request):
        period = int(request.query_params.get('period', 30))
        fmt = request.query_params.get('output', 'csv').lower()
        data = _compute_report(period)
        if fmt == 'csv':
            return _export_csv(data, period)
        if fmt == 'pdf':
            return _export_pdf(data, period)
        return Response({'error': 'Unsupported format. Use csv or pdf.'}, status=400)


# ── health ────────────────────────────────────────────────────────────────────

class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'status': 'ok'})
