from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone

from .models import Note
from .serializers import NoteSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_notes(request):
    notes = Note.objects.filter(
        user=request.user,
        archived=False,
        is_deleted=False
    ).order_by('-updated_at')
    serializer = NoteSerializer(notes, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_note(request):
    serializer = NoteSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        return Response(serializer.data, status=201)
    return Response(serializer.errors, status=400)


@api_view(['GET', 'PUT', 'PATCH'])  # Accept both PUT and PATCH from frontend
@permission_classes([IsAuthenticated])
def update_note(request, pk):
    try:
        note = Note.objects.get(id=pk, user=request.user, is_deleted=False)
    except Note.DoesNotExist:
        return Response({'error': 'Note not found'}, status=404)

    if request.method == 'GET':
        return Response(NoteSerializer(note).data)

    # Both PUT and PATCH use partial=True so frontend can send only changed fields
    serializer = NoteSerializer(note, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_note(request, pk):
    try:
        note = Note.objects.get(id=pk, user=request.user, is_deleted=False)
    except Note.DoesNotExist:
        return Response({'error': 'Note not found'}, status=404)

    # Soft delete — data is preserved in DB
    note.soft_delete()
    return Response({'message': 'Note deleted'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def archive_note(request, pk):
    try:
        note = Note.objects.get(id=pk, user=request.user, is_deleted=False)
    except Note.DoesNotExist:
        return Response({'error': 'Note not found'}, status=404)

    note.archived = not note.archived
    note.save(update_fields=['archived'])
    return Response({'archived': note.archived})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_archived_notes(request):
    notes = Note.objects.filter(
        user=request.user,
        archived=True,
        is_deleted=False
    ).order_by('-updated_at')
    return Response(NoteSerializer(notes, many=True).data)
