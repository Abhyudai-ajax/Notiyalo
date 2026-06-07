#!/usr/bin/env bash
set -o errexit

echo "=== Validating environment ==="
: "${DJANGO_SECRET_KEY:?ERROR: DJANGO_SECRET_KEY is not set}"

echo "=== Installing dependencies ==="
pip install -r requirements.txt

echo "=== Collecting static files ==="
python manage.py collectstatic --no-input

echo "=== Running migrations ==="
python manage.py migrate

echo "=== Build complete ==="
