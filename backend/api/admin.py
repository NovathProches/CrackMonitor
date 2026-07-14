from django.contrib import admin
from .models import Engineer, Device, Detection, Ticket

admin.site.register(Engineer)
admin.site.register(Device)
admin.site.register(Detection)
admin.site.register(Ticket)
