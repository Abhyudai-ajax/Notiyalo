from django.urls import path
from .views import (
    signup, login, logout, refresh_token, me,
    RequestOTPView, VerifyOTPView, PasswordResetConfirmView, UserSettingsView
)

urlpatterns = [
    path('signup/',      signup),
    path('login/',       login),
    path('logout/',      logout),
    path('refresh/',     refresh_token),
    path('me/',          me),
    path('request-otp/', RequestOTPView.as_view()),
    path('verify-otp/',  VerifyOTPView.as_view()),
    path('password-reset/', PasswordResetConfirmView.as_view()),
    path('settings/',    UserSettingsView.as_view()),
]