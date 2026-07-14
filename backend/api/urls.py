from django.urls import path, re_path
from . import views

urlpatterns = [
    # Auth
    path('auth/login/', views.LoginView.as_view()),
    path('auth/logout/', views.LogoutView.as_view()),
    path('auth/me/', views.MeView.as_view()),
    path('auth/me/avatar/', views.AvatarUploadView.as_view()),

    # Detections
    path('detections/', views.DetectionListView.as_view()),
    path('detections/<uuid:pk>/', views.DetectionDetailView.as_view()),

    # Tickets
    path('tickets/', views.TicketListView.as_view()),
    path('tickets/<int:pk>/', views.TicketDetailView.as_view()),

    # Engineers
    path('engineers/', views.EngineerListView.as_view()),
    path('engineers/<uuid:pk>/', views.EngineerDetailView.as_view()),

    # Devices
    path('devices/', views.DeviceListView.as_view()),
    path('devices/<uuid:pk>/', views.DeviceDetailView.as_view()),

    # Stats
    path('stats/dashboard/', views.DashboardStatsView.as_view()),
    re_path(r'^stats/reports/export/$', views.ReportExportView.as_view()),
    path('stats/reports/', views.ReportsView.as_view()),

    # Health
    path('health/', views.HealthView.as_view()),
]
