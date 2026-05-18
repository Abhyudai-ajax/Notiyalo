import requests
import os

from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from rest_framework.response import Response

from notes.models import Note


API_KEY = os.getenv("GROQ_API_KEY")

URL = "https://api.groq.com/openai/v1/chat/completions"


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_with_notes(request):

    try:

        question = request.data.get("question")

        notes = Note.objects.filter(

            user=request.user,

            archived=False
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

        response = requests.post(

            URL,

            headers=headers,

            json=body
        )

        data = response.json()

        print(data)

        if "choices" not in data:

            return Response({

                "answer": "AI failed to respond.",

                "error": data
            })

        answer = data['choices'][0]['message']['content']

        return Response({

            "answer": answer
        })

    except Exception as e:

        print(e)

        return Response({

            "answer": "Something went wrong.",

            "error": str(e)
        })