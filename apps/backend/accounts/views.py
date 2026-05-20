import re
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken


def is_valid_email(email):
    """Basic format check + reject obviously fake domains."""
    try:
        validate_email(email)
    except ValidationError:
        return False
    # Must have a real TLD (at least 2 chars after the last dot)
    pattern = r'^[^@]+@[^@]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


@api_view(['POST'])
def signup(request):
    username = request.data.get('username', '').strip()
    email = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '')

    # --- Validate fields ---
    if not username or not email or not password:
        return Response({"error": "Username, email and password are required"}, status=400)

    if len(username) < 3:
        return Response({"error": "Username must be at least 3 characters"}, status=400)

    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return Response({"error": "Username can only contain letters, numbers and underscores"}, status=400)

    if not is_valid_email(email):
        return Response({"error": "Please enter a valid email address"}, status=400)

    if len(password) < 8:
        return Response({"error": "Password must be at least 8 characters"}, status=400)

    # --- Check uniqueness ---
    if User.objects.filter(username__iexact=username).exists():
        return Response({"error": "Username already taken"}, status=400)

    if User.objects.filter(email__iexact=email).exists():
        return Response({"error": "An account with this email already exists"}, status=400)

    # --- Create user ---
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password
    )

    refresh = RefreshToken.for_user(user)
    return Response({
        "token": str(refresh.access_token),
        "refresh": str(refresh),
        "username": user.username,
        "email": user.email,
    }, status=201)


@api_view(['POST'])
def login(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')

    if not username or not password:
        return Response({"error": "Username and password are required"}, status=400)

    # Allow login with email OR username
    if '@' in username:
        try:
            user_obj = User.objects.get(email__iexact=username)
            username = user_obj.username
        except User.DoesNotExist:
            return Response({"error": "Invalid credentials"}, status=401)

    user = authenticate(username=username, password=password)

    if user is None:
        return Response({"error": "Invalid credentials"}, status=401)

    if not user.is_active:
        return Response({"error": "Account is disabled"}, status=401)

    refresh = RefreshToken.for_user(user)
    return Response({
        "token": str(refresh.access_token),
        "refresh": str(refresh),
        "username": user.username,
        "email": user.email,
    })


@api_view(['POST'])
def refresh_token(request):
    """Allow frontend to silently refresh access token using refresh token."""
    from rest_framework_simplejwt.tokens import RefreshToken as RT
    from rest_framework_simplejwt.exceptions import TokenError

    token = request.data.get('refresh')
    if not token:
        return Response({"error": "Refresh token required"}, status=400)

    try:
        refresh = RT(token)
        return Response({"token": str(refresh.access_token)})
    except TokenError:
        return Response({"error": "Invalid or expired refresh token"}, status=401)


@api_view(['GET'])
def me(request):
    """Return current user info — lets frontend verify token is still valid."""
    from rest_framework.permissions import IsAuthenticated
    from rest_framework.decorators import permission_classes

    if not request.user.is_authenticated:
        return Response({"error": "Not authenticated"}, status=401)

    return Response({
        "username": request.user.username,
        "email": request.user.email,
        "date_joined": request.user.date_joined,
    })
