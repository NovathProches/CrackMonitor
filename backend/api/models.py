import uuid
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class Engineer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='engineer_profile',
    )
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    code = models.CharField(max_length=4, blank=True)
    avatar = models.FileField(upload_to='avatars/', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def avatar_url(self):
        if self.avatar:
            return f'/media/{self.avatar.name}'
        return None


class Device(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    mm_per_px = models.FloatField(null=True, blank=True)
    camera_height_mm = models.FloatField(null=True, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    device_token_hash = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return self.name


class Detection(models.Model):
    STATUS_CHOICES = [
        ('unreviewed', 'unreviewed'), ('reviewed', 'reviewed'),
        ('flagged', 'flagged'), ('closed', 'closed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(
        Device, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='detections',
    )
    captured_at = models.DateTimeField(default=timezone.now)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    image_path = models.CharField(max_length=500, blank=True)
    overlay_path = models.CharField(max_length=500, blank=True)
    crack_length_mm = models.FloatField(null=True, blank=True)
    crack_width_mm = models.FloatField(null=True, blank=True)
    crack_area_mm2 = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='unreviewed')
    measurement_source = models.CharField(max_length=10, default='auto')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-captured_at']

    def __str__(self):
        return f'Detection {self.id}'

    @property
    def image_url(self):
        return f'/media/{self.image_path}' if self.image_path else None

    @property
    def overlay_url(self):
        return f'/media/{self.overlay_path}' if self.overlay_path else None


class Ticket(models.Model):
    STATUS_CHOICES = [
        ('open', 'open'), ('in_progress', 'in_progress'), ('resolved', 'resolved'),
    ]

    # Integer PK doubles as ticket_number (TKT-1, TKT-2, ...)
    detection = models.ForeignKey(
        Detection, on_delete=models.CASCADE, related_name='tickets',
    )
    assignee = models.ForeignKey(
        Engineer, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='assigned_tickets',
    )
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='open')
    scheduled_for = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        Engineer, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='resolved_tickets',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'TKT-{self.pk}'

    @property
    def ticket_number(self):
        return self.pk
