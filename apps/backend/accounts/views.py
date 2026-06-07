import re
import logging
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from django_ratelimit.decorators import ratelimit
from django_ratelimit.exceptions import Ratelimited

from notiyalo.sanitize import sanitize_text
from .models import OTPCode
from .audit import log_event

logger = logging.getLogger(__name__)


# ─── HELPERS ───────────────────────────────────────────────────────────────

def is_valid_email(email: str) -> bool:
    try:
        validate_email(email)
    except ValidationError:
        return False
    return bool(re.match(r'^[^@]+@[^@]+\.[a-zA-Z]{2,}$', email))


def _issue_tokens(user):
    """Return a consistent token payload for any auth success."""
    refresh = RefreshToken.for_user(user)
    return {
        'token':   str(refresh.access_token),
        'refresh': str(refresh),
        'username': user.username,
        'email':   user.email,
    }


def _send_otp_email(email: str, code: str):
    """
    Send the OTP email. Uses HTML template if available,
    falls back to plain text. Never raises — logs on failure.
    """
    subject = 'Your Notiyalo login code'
    plain_body = (
        f'Your one-time login code is: {code}\n\n'
        f'This code expires in 10 minutes.\n'
        f'Do not share it with anyone.\n\n'
        f'If you did not request this, ignore this email.\n\n'
        f'— The Notiyalo Team'
    )
    try:
        send_mail(
            subject=subject,
            message=plain_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        logger.info('[OTP] Email sent to hash=%s', hash(email))
    except Exception:
        logger.error('[OTP] Failed to send email to hash=%s', hash(email), exc_info=True)
        raise   # re-raise so the view can return 503


# ─── SIGNUP ────────────────────────────────────────────────────────────────

@ratelimit(key='ip', rate='3/h', method='POST', block=True)
@api_view(['POST'])
def signup(request):
    username = sanitize_text(request.data.get('username', ''), max_length=150)
    email    = sanitize_text(request.data.get('email', ''), max_length=254).lower()
    password = request.data.get('password', '')

    # ── Validate ──
    if not username or not email or not password:
        return Response({'error': 'Username, email and password are required'}, status=400)
    if len(username) < 3:
        return Response({'error': 'Username must be at least 3 characters'}, status=400)
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return Response({'error': 'Username can only contain letters, numbers and underscores'}, status=400)
    if not is_valid_email(email):
        return Response({'error': 'Please enter a valid email address'}, status=400)
    if len(password) < 8:
        return Response({'error': 'Password must be at least 8 characters'}, status=400)

    # Password strength: require at least one letter and one digit
    if not re.search(r'[A-Za-z]', password) or not re.search(r'\d', password):
        return Response({'error': 'Password must contain at least one letter and one number'}, status=400)

    # ── Uniqueness — use identical error message to prevent user enumeration ──
    TAKEN_MSG = 'An account with these details already exists'
    if User.objects.filter(username__iexact=username).exists():
        return Response({'error': TAKEN_MSG}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return Response({'error': TAKEN_MSG}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    log_event('user_signup', user=user, request=request, extra={'email': email})
    logger.info('[AUTH] New signup: user_id=%s', user.id)

    return Response(_issue_tokens(user), status=201)


# ─── LOGIN (password) ───────────────────────────────────────────────────────

@ratelimit(key='ip', rate='5/m', method='POST', block=True)
@api_view(['POST'])
def login(request):
    identifier = sanitize_text(request.data.get('username', ''), max_length=254)
    password   = request.data.get('password', '')

    if not identifier or not password:
        return Response({'error': 'Credentials are required'}, status=400)

    # Allow login by email or username
    if '@' in identifier:
        try:
            user_obj = User.objects.get(email__iexact=identifier)
            username = user_obj.username
        except User.DoesNotExist:
            # Generic message — never reveal whether email exists
            return Response({'error': 'Invalid credentials'}, status=401)
    else:
        username = identifier

    user = authenticate(username=username, password=password)
    if user is None or not user.is_active:
        logger.warning('[AUTH] Failed login attempt for identifier=%s', hash(identifier))
        return Response({'error': 'Invalid credentials'}, status=401)

    log_event('user_login', user=user, request=request)
    logger.info('[AUTH] Login: user_id=%s', user.id)
    return Response(_issue_tokens(user))


# ─── TOKEN REFRESH ──────────────────────────────────────────────────────────

@api_view(['POST'])
def refresh_token(request):
    token = request.data.get('refresh', '').strip()
    if not token:
        return Response({'error': 'Refresh token required'}, status=400)
    try:
        refresh = RefreshToken(token)
        # ROTATE: issue new access token only — refresh is handled by SimpleJWT rotation
        return Response({'token': str(refresh.access_token)})
    except TokenError:
        return Response({'error': 'Invalid or expired refresh token'}, status=401)


# ─── CURRENT USER ───────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({
        'username':    request.user.username,
        'email':       request.user.email,
        'date_joined': request.user.date_joined,
    })


# ─── LOGOUT ─────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """
    Blacklist the refresh token so it cannot be reused after logout.
    Requires BLACKLIST_AFTER_ROTATION = True and
    'rest_framework_simplejwt.token_blacklist' in INSTALLED_APPS.
    """
    try:
        refresh_token_str = request.data.get('refresh', '')
        if refresh_token_str:
            token = RefreshToken(refresh_token_str)
            token.blacklist()
        log_event('user_logout', user=request.user, request=request)
        logger.info('[AUTH] Logout: user_id=%s', request.user.id)
    except Exception:
        pass  # Always return 200 — logout should never fail visibly
    return Response({'message': 'Logged out successfully'})


# ─── OTP: REQUEST ───────────────────────────────────────────────────────────

from django.utils.decorators import method_decorator

@method_decorator(ratelimit(key='ip', rate='3/15m', method='POST', block=True), name='post')
class RequestOTPView(APIView):
    permission_classes = []

    def post(self, request):
        email = sanitize_text(request.data.get('email', ''), max_length=254).lower()

        if not email or not is_valid_email(email):
            return Response({'error': 'A valid email address is required'}, status=400)

        # Cooldown check — prevent OTP spam even within rate limit window
        if not OTPCode.can_request(email):
            return Response(
                {'error': 'Please wait 60 seconds before requesting a new code'},
                status=429
            )

        try:
            otp = OTPCode.generate_for(email)
            _send_otp_email(email, otp.code)
        except Exception:
            logger.error('[OTP] Request failed for hash=%s', hash(email), exc_info=True)
            return Response(
                {'error': 'Could not send email. Please try again in a moment.'},
                status=503
            )

        log_event('otp_requested', request=request, extra={'email_hash': hash(email)})
        # Always respond the same — never confirm whether the email is registered
        return Response({'message': 'If that email is valid, a code has been sent.'})


# ─── OTP: VERIFY ────────────────────────────────────────────────────────────

@method_decorator(ratelimit(key='ip', rate='10/15m', method='POST', block=True), name='post')
class VerifyOTPView(APIView):
    permission_classes = []

    def post(self, request):
        email = sanitize_text(request.data.get('email', ''), max_length=254).lower()
        code  = sanitize_text(request.data.get('code', ''), max_length=6)

        if not email or not code:
            return Response({'error': 'Email and code are required'}, status=400)

        # Validate code format before hitting DB
        if not re.match(r'^\d{6}$', code):
            return Response({'error': 'Code must be exactly 6 digits'}, status=400)

        # Fetch the latest unused OTP for this email
        try:
            otp = OTPCode.objects.filter(
                email=email,
                is_used=False
            ).latest('created_at')
        except OTPCode.DoesNotExist:
            logger.warning('[OTP] Verify failed — no active OTP for hash=%s', hash(email))
            return Response({'error': 'Invalid or expired code'}, status=400)

        # Check locked (too many attempts)
        if otp.is_locked():
            return Response({'error': 'Too many incorrect attempts. Request a new code.'}, status=400)

        # Check expiry
        if otp.is_expired():
            return Response({'error': 'This code has expired. Request a new one.'}, status=400)

        # Timing-safe comparison — prevents timing attacks on the code
        import hmac
        if not hmac.compare_digest(otp.code, code):
            otp.record_attempt()
            remaining = max(0, 5 - otp.attempts)
            logger.warning('[OTP] Wrong code for hash=%s, attempts=%s', hash(email), otp.attempts)
            return Response(
                {'error': f'Incorrect code. {remaining} attempt{"s" if remaining != 1 else ""} remaining.'},
                status=400
            )

        # ── Success ──
        otp.consume()

        # Get or create user — OTP login auto-creates accounts for new emails
        user, created = User.objects.get_or_create(
            email__iexact=email,
            defaults={'username': email.split('@')[0][:150], 'email': email}
        )

        # Handle username collision for new users
        if created:
            base = email.split('@')[0][:145]
            if User.objects.filter(username=base).exclude(pk=user.pk).exists():
                import random as _r
                user.username = f'{base}_{_r.randint(1000,9999)}'
                user.save(update_fields=['username'])

        log_event('otp_login', user=user, request=request, extra={'email_hash': hash(email)})
        logger.info('[OTP] Successful login: user_id=%s, new_user=%s', user.id, created)

        refresh = RefreshToken.for_user(user)
        return Response({
            'token':    str(refresh.access_token),
            'refresh':  str(refresh),
            'username': user.username,
            'email':    user.email,
        })


# ─── PASSWORD RESET ─────────────────────────────────────────────────────────

@method_decorator(ratelimit(key='ip', rate='10/15m', method='POST', block=True), name='post')
class PasswordResetConfirmView(APIView):
    permission_classes = []

    def post(self, request):
        email = sanitize_text(request.data.get('email', ''), max_length=254).lower()
        code  = sanitize_text(request.data.get('code', ''), max_length=6)
        new_password = request.data.get('new_password', '')

        if not email or not code or not new_password:
            return Response({'error': 'Email, code, and new password are required'}, status=400)
            
        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters'}, status=400)

        if not re.search(r'[A-Za-z]', new_password) or not re.search(r'\d', new_password):
            return Response({'error': 'Password must contain at least one letter and one number'}, status=400)

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({'error': 'Invalid or expired code'}, status=400)

        try:
            otp = OTPCode.objects.filter(email=email, is_used=False).latest('created_at')
        except OTPCode.DoesNotExist:
            return Response({'error': 'Invalid or expired code'}, status=400)

        if otp.is_locked() or otp.is_expired():
            return Response({'error': 'Code expired or locked. Request a new one.'}, status=400)

        import hmac
        if not hmac.compare_digest(otp.code, code):
            otp.record_attempt()
            return Response({'error': 'Incorrect code'}, status=400)

        otp.consume()
        user.set_password(new_password)
        user.save(update_fields=['password'])
        
        log_event('password_reset', user=user, request=request)
        return Response({'message': 'Password reset successfully'})


# ─── ACCOUNT SETTINGS ───────────────────────────────────────────────────────

class UserSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        user = request.user
        email = request.data.get('email')
        password = request.data.get('password')
        
        changed = False
        if email:
            email = sanitize_text(email, max_length=254).lower()
            if not is_valid_email(email):
                return Response({'error': 'Invalid email address'}, status=400)
            if email != user.email and User.objects.filter(email__iexact=email).exists():
                return Response({'error': 'Email already in use'}, status=400)
            user.email = email
            changed = True
            
        if password:
            if len(password) < 8 or not re.search(r'[A-Za-z]', password) or not re.search(r'\d', password):
                return Response({'error': 'Password must be 8+ chars and contain letter + number'}, status=400)
            user.set_password(password)
            changed = True
            
        if changed:
            user.save()
            log_event('account_settings_updated', user=user, request=request)
            return Response({'message': 'Settings updated successfully'})
            
        return Response({'message': 'No changes made'})