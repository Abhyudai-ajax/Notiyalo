from django.urls import path
from .views import *

urlpatterns = [

    path('', get_notes),

    path('create/', create_note),

    path('update/<int:pk>/', update_note),

    path('delete/<int:pk>/', delete_note),
]