from django.urls import path
from . import views

urlpatterns = [
    path('', views.get_notes),                        # GET all notes
    path('create/', views.create_note),               # POST create
    path('update/<int:pk>/', views.update_note),      # GET/PUT/PATCH single note
    path('delete/<int:pk>/', views.delete_note),      # DELETE (soft)
    path('archive/<int:pk>/', views.archive_note),    # POST toggle archive
    path('archived/', views.get_archived_notes),      # GET archived list
]
