from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.db import connection
import time

def health(request):
    return JsonResponse({'status': 'ok', 'timestamp': time.time()})

def ready(request):
    try:
        connection.ensure_connection()
        return JsonResponse({'status': 'ready', 'database': 'connected'})
    except Exception:
        return JsonResponse({'status': 'error', 'database': 'disconnected'}, status=503)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health),
    path('ready/', ready),
    path(
        'api/notes/',
        include('notes.urls')
    ),
    path(
        'api/auth/',
         include('accounts.urls')
    ),
    path(
        'api/ai/',
        include('ai.urls')
    ),
]