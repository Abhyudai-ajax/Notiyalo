# apps/backend/urls.py
from django.urls import path
from .views import RequestOTPView, VerifyOTPView

urlpatterns = [
    # ... your existing routes ...
    path("auth/request-otp/", RequestOTPView.as_view()),
    path("auth/verify-otp/", VerifyOTPView.as_view()),
]