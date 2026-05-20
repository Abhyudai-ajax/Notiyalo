# apps/backend/views.py (add these views)
from django.core.mail import send_mail
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from .models import OTPCode

User = get_user_model()


class RequestOTPView(APIView):
    """POST /auth/request-otp/  { "email": "user@example.com" }"""
    permission_classes = []

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response({"error": "Email is required."}, status=400)

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
    """POST /auth/verify-otp/  { "email": "...", "code": "123456" }"""
    permission_classes = []

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        code = request.data.get("code", "").strip()

        if not email or not code:
            return Response({"error": "Email and code are required."}, status=400)

        try:
            otp = OTPCode.objects.filter(
                email=email,
                code=code,
                is_used=False
            ).latest("created_at")
        except OTPCode.DoesNotExist:
            return Response({"error": "Invalid OTP."}, status=400)

        if otp.is_expired():
            return Response({"error": "OTP has expired. Request a new one."}, status=400)

        otp.is_used = True
        otp.save()

        # Get or create user
        user, _ = User.objects.get_or_create(
            email=email,
            defaults={"username": email}
        )

        # Issue JWT
        refresh = RefreshToken.for_user(user)
        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "email": email,
        })