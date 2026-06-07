import logging
import requests
import os
from requests.exceptions import Timeout, RequestException

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_ratelimit.decorators import ratelimit

from notes.models import Note
from notiyalo.sanitize import sanitize_text

logger = logging.getLogger(__name__)

API_KEY = os.getenv("GROQ_API_KEY")
URL = "https://api.groq.com/openai/v1/chat/completions"


@ratelimit(key='user', rate='20/m', method='POST', block=True)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_with_notes(request):
    try:
        question = sanitize_text(request.data.get("question", ""), max_length=2000)
        if not question:
            return Response({'error': 'Question is required'}, status=400)

        notes = Note.objects.filter(
            user=request.user,
            archived=False,
            is_deleted=False
        )

        notes_text = ""
        for note in notes:
            notes_text += f"""

Title: {note.title}

Tags: {note.tags}

Content:
{note.content}

"""

        prompt = f"""
You are an AI Notes Assistant.

You can ONLY answer using the notes provided below.

USER NOTES:
{notes_text}

USER QUESTION:
{question}

RULES:
- Answer only from notes
- If answer not found, say:
  "I could not find this in your notes."
- Keep answers clean and concise
- Mention relevant note titles if possible
"""

        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }

        body = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }

        try:
            response = requests.post(
                URL,
                headers=headers,
                json=body,
                timeout=15
            )
            response.raise_for_status()
        except Timeout:
            logger.error('Groq API timeout')
            return Response({"answer": "AI service timed out."})
        except RequestException as e:
            logger.error('Groq API request failed', exc_info=True)
            return Response({"answer": "AI service unavailable."})

        data = response.json()
        logger.info('Groq API response received', extra={'choices_count': len(data.get('choices', []))})

        if "choices" not in data:
            logger.error('Groq API returned invalid response format: %s', data)
            return Response({
                "answer": "AI failed to respond.",
                "error": "Invalid response format"
            })

        answer = data['choices'][0]['message']['content']

        return Response({
            "answer": answer
        })

    except Exception as e:
        logger.error('chat_with_notes failed', exc_info=True)
        return Response({
            "answer": "Something went wrong.",
            "error": "An internal error occurred"
        })