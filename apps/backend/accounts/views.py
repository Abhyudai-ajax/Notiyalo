import re
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.core.mail import send_mail

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import OTPCode


def is_valid_email(email):
    try:
        validate_email(email)
    except ValidationError:
        return False
    pattern = r'^[^@]+@[^@]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


@api_view(['POST'])
def signup(request):
    username = request.data.get('username', '').strip()
    email = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '')

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
    if User.objects.filter(username__iexact=username).exists():
        return Response({"error": "Username already taken"}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return Response({"error": "An account with this email already exists"}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
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
    if not request.user.is_authenticated:
        return Response({"error": "Not authenticated"}, status=401)
    return Response({
        "username": request.user.username,
        "email": request.user.email,
        "date_joined": request.user.date_joined,
    })


# ─── OTP AUTH ───

class RequestOTPView(APIView):
    permission_classes = []

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email or not is_valid_email(email):
            return Response({"error": "Valid email is required."}, status=400)

        otp = OTPCode.generate_for(email)
        send_mail(
            subject="Your Notiyalo login code",
            message=(
                f"Your one-time login code is: {otp.code}\n\n"
                f"This code expires in 10 minutes. Don't share it with anyone."
            ),
            from_email="Notiyalo <notiyalo.app@gmail.com>",
            recipient_list=[email],
            fail_silently=False,
        )
        return Response({"message": "OTP sent. Check your email."})


class VerifyOTPView(APIView):
    permission_classes = []

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        code = request.data.get("code", "").strip()

        if not email or not code:
            return Response({"error": "Email and code are required."}, status=400)

        try:
            otp = OTPCode.objects.filter(
                email=email, code=code, is_used=False
            ).latest("created_at")
        except OTPCode.DoesNotExist:
            return Response({"error": "Invalid OTP."}, status=400)

        if otp.is_expired():
            return Response({"error": "OTP has expired. Request a new one."}, status=400)

        otp.is_used = True
        otp.save()

        user, _ = User.objects.get_or_create(
            email=email,
            defaults={"username": email}
        )
        refresh = RefreshToken.for_user(user)
        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "email": email,
        })