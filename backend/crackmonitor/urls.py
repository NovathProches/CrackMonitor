from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, FileResponse


def spa_view(request, *args, **kwargs):
    """Catch-all: serve React SPA index.html for all non-API routes."""
    index = settings.BASE_DIR / 'react_build' / 'index.html'
    if index.exists():
        return FileResponse(open(index, 'rb'), content_type='text/html')
    return HttpResponse(
        '<p style="font-family:monospace">Frontend not built.<br>'
        'Run: <code>cd web &amp;&amp; npm run build</code></p>',
        status=503,
    )


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    re_path(r'^(?!api/|admin/|media/|static/).*$', spa_view),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
