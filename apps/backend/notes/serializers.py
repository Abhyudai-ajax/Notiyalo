# notes/serializers.py — add is_deleted field to exclude from responses

from rest_framework import serializers
from .models import Note


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ['id', 'title', 'content', 'tags', 'archived', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
