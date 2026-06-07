"""
accounts/audit.py — Structured audit logging for all authentication events.
Every login, logout, signup, and OTP verification is logged with IP address,
username, and event metadata. Logs are written to the 'accounts.audit' logger.
"""
import logging

logger = logging.getLogger('accounts.audit')


def log_event(event: str, user=None, request=None, extra: dict = None):
    """
    Log an audit event with user and IP context.

    Args:
        event:   Short identifier, e.g. 'user_login', 'user_signup', 'otp_login'
        user:    Django user instance (or None for anonymous events)
        request: Django request (used to extract the real client IP)
        extra:   Any additional context to include in the log line
    """
    ip = 'unknown'
    if request:
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded:
            ip = x_forwarded.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR', 'unknown')

    username = getattr(user, 'username', 'anonymous')

    logger.info(
        '[AUDIT] %s | user=%s | ip=%s | extra=%s',
        event,
        username,
        ip,
        extra or {},
    )
