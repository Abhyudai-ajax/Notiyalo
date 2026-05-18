from django.urls import path

from .views import *
from .chat_views import *

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