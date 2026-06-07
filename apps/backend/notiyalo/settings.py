from pathlib import Path
from dotenv import load_dotenv
from datetime import timedelta
import os
import sys
import dj_database_url

load_dotenv()

# ─── ENVIRONMENT VALIDATION ───
# Fail fast on startup rather than crashing mid-request in production
_REQUIRED_ENV = {
    'DJANGO_SECRET_KEY': 'Django secret key for cryptographic signing',
}
_OPTIONAL_WITH_WARNING = {
    'GROQ_API_KEY': 'AI features (summary, chat) will not work',
    'EMAIL_APP_PASSWORD': 'OTP email login will not work',
}

_missing_required = [k for k in _REQUIRED_ENV if not os.environ.get(k)]
if _missing_required:
    for k in _missing_required:
        print(f'FATAL: Missing required env var {k} — {_REQUIRED_ENV[k]}', file=sys.stderr)
    sys.exit(1)

for k, reason in _OPTIONAL_WITH_WARNING.items():
    if not os.environ.get(k):
        print(f'WARNING: Missing optional env var {k} — {reason}', file=sys.stderr)

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

DEBUG = os.getenv('DEBUG', 'False') == 'True'

# In production, lock this down to your actual domains
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

CORS_ALLOWED_ORIGINS = [
    'https://notiyalo.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
]
CORS_ALLOW_CREDENTIALS = True

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'rest_framework_simplejwt',
    'django_ratelimit',
    'notes',
    'ai',
    'accounts',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'notiyalo.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'notiyalo.wsgi.application'

# ─── DATABASE ───
# On Render: set DATABASE_URL env var to your PostgreSQL connection string
# Locally: falls back to SQLite (fine for dev only)
db_url = os.getenv('DATABASE_URL', '').strip()
if db_url:
    DATABASES = {
        'default': dj_database_url.parse(
            db_url,
            conn_max_age=600,
            conn_health_checks=True,
        )
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# ─── JWT / DRF ───
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    # Deny-by-default: every view requires auth unless explicitly decorated with AllowAny
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Global exception handler — prevents internal tracebacks leaking to clients
    'EXCEPTION_HANDLER': 'notiyalo.error_handler.custom_exception_handler',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS':  True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN':      True,
    'ALGORITHM':              'HS256',
    'AUTH_HEADER_TYPES':      ('Bearer',),
    'SIGNING_KEY':            SECRET_KEY,
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── CACHING & RATE LIMITING ───
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-snowflake',
    }
}
SILENCED_SYSTEM_CHECKS = ['django_ratelimit.E003', 'django_ratelimit.W001']
RATELIMIT_EXCEPTION_HANDLER = 'notiyalo.utils.ratelimit_handler'

# ─── SECURITY HEADERS ───
# Always-on (both dev and prod)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'SAMEORIGIN'

# Production-only (requires HTTPS termination by reverse proxy)
if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000          # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True

# ─── STRUCTURED LOGGING ───
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
        'json_prod': {
            'format': '[{levelname}] {asctime} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose' if DEBUG else 'json_prod',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': os.getenv('LOG_LEVEL', 'INFO'),
    },
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'accounts': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'accounts.audit': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'notes': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'ai': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}

# ─── GROQ AI ───
GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')

# ─── EMAIL (Resend SMTP) ───
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.resend.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', 'resend')
EMAIL_HOST_PASSWORD = os.getenv('RESEND_API_KEY', '')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'Notiyalo <onboarding@resend.dev>')