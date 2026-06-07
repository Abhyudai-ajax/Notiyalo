from django.urls import path

from .views import generate_summary
from .chat_views import chat_with_notes

urlpatterns = [

    path(
        'summary/',
        generate_summary
    ),
    path(
        'chat/',
        chat_with_notes
    ),
]