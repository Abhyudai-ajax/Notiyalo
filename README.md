# Notiyalo ✦

> AI-powered notes workspace for the modern student — write smarter, not harder.

**Live:** [notiyalo.vercel.app](https://notiyalo.vercel.app) · **Backend:** [notiyalo.onrender.com](https://notiyalo.onrender.com)

---

## What is Notiyalo?

Notiyalo is a full-stack AI notes app where you write notes and Claude AI instantly summarises them, pulls out key insights, and suggests a title. It also has a live AI chat assistant built in.

---

## Features

- **Auth** — signup / login with JWT tokens
- **Smart Note Editor** — write and save notes with tags
- **AI Summaries** — auto-generates summary, key insights, and a suggested title using Groq + Claude
- **AI Chat** — ask your AI assistant anything, anytime
- **Notes Manager** — search, edit, delete, and view all your notes
- **Dashboard** — live stats (total notes, recent activity, tags used, AI runs)
- **Auto-save** — notes auto-save as you type in the editor
- **3D UI** — tilt card effects, animated orbs, glassmorphic design

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS + HTML/CSS (no framework) |
| Styling | Custom CSS with CSS variables |
| Backend | Django + Django REST Framework |
| AI | Groq API (LLaMA / Claude) |
| Auth | JWT tokens |
| Frontend deploy | Vercel |
| Backend deploy | Render |

---

## Project Structure

```
Notiyalo/
├── apps/
│   ├── frontend/
│   │   ├── index.html        ← entire frontend (self-contained)
│   │   └── package.json
│   └── backend/
│       ├── manage.py
│       ├── requirements.txt
│       ├── Procfile
│       └── api/              ← Django app (auth, notes, AI)
├── .env.example
├── vercel.json
└── README.md
```

---

## Local Setup

### Backend

```bash
cd apps/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp ../../.env.example .env
# Add your GROQ_API_KEY to .env

# Run migrations
python manage.py migrate

# Start server
python manage.py runserver
```

Backend runs at `http://localhost:8000`

### Frontend

Just open `apps/frontend/index.html` in your browser, or use Live Server in VS Code.

Make sure to update the `API` constant in `index.html` to point to your local backend:

```js
const API = 'http://localhost:8000';
```

---

## Environment Variables

Create a `.env` file in `apps/backend/`:

```env
GROQ_API_KEY=your_groq_api_key_here
SECRET_KEY=your_django_secret_key
DEBUG=True
ALLOWED_HOSTS=*
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup/` | Register new user |
| POST | `/api/auth/login/` | Login, returns token |
| GET | `/api/notes/` | List all notes |
| POST | `/api/notes/create/` | Create a note |
| PATCH | `/api/notes/:id/` | Update a note |
| DELETE | `/api/notes/:id/` | Delete a note |
| POST | `/api/ai/summary/` | Generate AI summary |
| POST | `/api/ai/chat/` | AI chat response |

---

## Deployment

### Frontend → Vercel

1. Push to GitHub
2. Import repo on [vercel.com](https://vercel.com)
3. Set **Root Directory** to `apps/frontend`
4. Set **Output Directory** to `.`
5. Set **Build Command** to `echo done`
6. Deploy

### Backend → Render

1. Push to GitHub
2. Create a new Web Service on [render.com](https://render.com)
3. Set **Root Directory** to `apps/backend`
4. Set **Build Command** to `pip install -r requirements.txt`
5. Set **Start Command** from `Procfile`
6. Add environment variables in Render dashboard

---

## Screenshots

> Dashboard with AI insights panel, 3D tilt editor, and live stats

---

## Author

Built by [@Abhyudai-ajax](https://github.com/Abhyudai-ajax)

---

## License

MIT