"""
notiyalo/sanitize.py — Input sanitization utilities.
Strip dangerous HTML/script content before processing or storing user input.
"""
import html


def sanitize_text(value: str, max_length: int = None) -> str:
    """
    Strip dangerous content and trim whitespace.
    - Escapes HTML entities to prevent XSS if value is ever rendered
    - Removes null bytes
    - Optionally truncates to max_length
    """
    if not isinstance(value, str):
        return ''
    value = value.strip()
    # Remove null bytes (can cause issues in DB and logs)
    value = value.replace('\x00', '')
    # Escape HTML entities
    value = html.escape(value, quote=True)
    if max_length:
        value = value[:max_length]
    return value
