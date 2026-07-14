from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Engineer, Device, Detection, Ticket


class EngineerBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Engineer
        fields = ['id', 'name', 'code']


class EngineerSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    has_login = serializers.SerializerMethodField()

    class Meta:
        model = Engineer
        fields = ['id', 'name', 'email', 'code', 'avatar_url', 'has_login', 'created_at']

    def get_avatar_url(self, obj):
        return obj.avatar_url

    def get_has_login(self, obj):
        return obj.user_id is not None


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ['id', 'name', 'mm_per_px', 'camera_height_mm', 'last_seen', 'created_at']


class TicketBriefSerializer(serializers.ModelSerializer):
    ticket_number = serializers.IntegerField(source='pk', read_only=True)
    assignee = EngineerBriefSerializer(read_only=True)

    class Meta:
        model = Ticket
        fields = ['ticket_number', 'status', 'assignee']


class DetectionSerializer(serializers.ModelSerializer):
    tickets = TicketBriefSerializer(many=True, read_only=True)
    image_url = serializers.SerializerMethodField()
    overlay_url = serializers.SerializerMethodField()

    class Meta:
        model = Detection
        fields = [
            'id', 'captured_at', 'lat', 'lng',
            'crack_length_mm', 'crack_width_mm', 'crack_area_mm2',
            'status', 'image_path', 'overlay_path',
            'image_url', 'overlay_url', 'tickets', 'created_at',
        ]

    def get_image_url(self, obj):
        return obj.image_url

    def get_overlay_url(self, obj):
        return obj.overlay_url


class TicketDetectionSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    overlay_url = serializers.SerializerMethodField()

    class Meta:
        model = Detection
        fields = [
            'id', 'captured_at', 'lat', 'lng',
            'crack_length_mm', 'crack_width_mm', 'crack_area_mm2',
            'image_url', 'overlay_url',
        ]

    def get_image_url(self, obj):
        return obj.image_url

    def get_overlay_url(self, obj):
        return obj.overlay_url


class TicketSerializer(serializers.ModelSerializer):
    ticket_number = serializers.IntegerField(source='pk', read_only=True)
    assignee = EngineerBriefSerializer(read_only=True)
    detection = TicketDetectionSerializer(read_only=True)

    class Meta:
        model = Ticket
        fields = [
            'ticket_number', 'status', 'scheduled_for',
            'created_at', 'resolved_at',
            'assignee', 'detection',
        ]


class UserMeSerializer(serializers.Serializer):
    id = serializers.CharField()
    email = serializers.EmailField()
    name = serializers.CharField()
    code = serializers.CharField(allow_blank=True)
    avatar_url = serializers.CharField(allow_null=True)
