"""
notiyalo/utils.py — Shared Django utility helpers.
"""
from django.http import JsonResponse


def ratelimit_handler(request, exception):
    """Return a clean 429 JSON response when a rate limit is exceeded."""
    return JsonResponse(
        {'error': 'Too many requests. Please slow down and try again shortly.'},
        status=429,
    )
