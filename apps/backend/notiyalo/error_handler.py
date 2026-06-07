"""
notiyalo/error_handler.py — Global DRF exception handler.
Catches all unhandled exceptions, logs them, and returns a clean JSON response
without leaking internal stack traces to the client in production.
"""
import logging
import os

from rest_framework.views import exception_handler
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    # Let DRF handle known API exceptions first (ValidationError, NotFound, etc.)
    response = exception_handler(exc, context)
    if response is not None:
        return response

    # Unhandled exception — log with full traceback, return generic error to client
    view_name = getattr(context.get('view'), '__class__', {})
    view_name = getattr(view_name, '__name__', 'unknown view')
    logger.error('Unhandled exception in %s', view_name, exc_info=True)

    is_debug = os.getenv('DEBUG', 'False') == 'True'
    return Response(
        {'error': str(exc) if is_debug else 'An internal error occurred. Please try again.'},
        status=500,
    )
