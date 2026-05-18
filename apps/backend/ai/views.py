import requests
import json

from rest_framework.decorators import api_view
from rest_framework.response import Response

import os

API_KEY = os.getenv("GROQ_API_KEY")

URL = "https://api.groq.com/openai/v1/chat/completions"


@api_view(['POST'])
def generate_summary(request):

    try:

        content = request.data.get('content', '')

        # Empty note protection
        if not content.strip():

            return Response({
                "summary": "",
                "insights": [],
                "title": ""
            })

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
            }
        )

        data = response.json()

        print(data)

        # API failure protection
        if 'choices' not in data:

            return Response({
                "summary": "",
                "insights": [],
                "title": "",
                "error": data
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

        print(e)

        return Response({

            "summary": "",

            "insights": [],

            "title": "",

            "error": str(e)
        })