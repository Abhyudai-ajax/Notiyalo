# Notiyalo

AI-powered collaborative notes workspace.

## Features

- Authentication
- Notes CRUD
- AI summaries
- AI action items
- Suggested titles
- Tags
- Search & filtering
- Archive notes
- Productivity dashboard
- Multi-user support

## Backend

Django + DRF

## Frontend

React + Tailwind

## Setup Backend

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

## Setup Frontend

Open frontend using Live Server.

## Environment Variables

Create `.env`

Example:

```env
GROQ_API_KEY=your_key
```