import logging
import requests
import json
import os
from requests.exceptions import Timeout, RequestException

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_ratelimit.decorators import ratelimit

from notiyalo.sanitize import sanitize_text

logger = logging.getLogger(__name__)

API_KEY = os.getenv("GROQ_API_KEY")
URL = "https://api.groq.com/openai/v1/chat/completions"


@ratelimit(key='user', rate='30/m', method='POST', block=True)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_summary(request):
    try:
        content = sanitize_text(request.data.get('content', ''), max_length=10000)

        # Empty note protection
        if not content.strip():
            return Response({
                "summary": "",
                "insights": [],
                "title": ""
            })

        try:
            response = requests.post(
                URL,
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {
                            "role": "system",
                            "content": """
You are an advanced AI note summarizer.

Return ONLY valid JSON.

No markdown.
No explanations.
No headings.
No code blocks.
"""
                        },
                        {
                            "role": "user",
                            "content": f"""
Analyze this note carefully.

NOTE:
{content}

Return ONLY valid JSON in this exact format:

{{
    "summary": "...",
    "insights": [
        "...",
        "..."
    ],
    "title": "..."
}}

Rules:
- summary should be short and professional
- insights should be concise bullet-style points
- title should be clean and meaningful
- do NOT return markdown
- do NOT return headings
- do NOT return extra text
"""
                        }
                    ]
                },
                timeout=15
            )
            response.raise_for_status()
        except Timeout:
            logger.error('Groq API timeout')
            return Response({'summary': '', 'insights': [], 'title': '', 'error': 'AI service timed out'})
        except RequestException as e:
            logger.error('Groq API request failed', exc_info=True)
            return Response({'summary': '', 'insights': [], 'title': '', 'error': 'AI service unavailable'})

        data = response.json()
        logger.info('Groq API response received', extra={'choices_count': len(data.get('choices', []))})

        # API failure protection
        if 'choices' not in data:
            logger.error('Groq API returned invalid response format: %s', data)
            return Response({
                "summary": "",
                "insights": [],
                "title": "",
                "error": "Invalid response from AI"
            })

        text = data['choices'][0]['message']['content']

        # JSON cleaning
        text = text.strip()
        if text.startswith("```json"):
            text = text.replace("```json", "")
            text = text.replace("```", "")

        parsed = json.loads(text)

        return Response({
            "summary": parsed.get("summary", ""),
            "insights": parsed.get("insights", []),
            "title": parsed.get("title", "")
        })

    except Exception as e:
        logger.error('generate_summary failed', exc_info=True)
        return Response({
            "summary": "",
            "insights": [],
            "title": "",
            "error": "An internal error occurred"
        })