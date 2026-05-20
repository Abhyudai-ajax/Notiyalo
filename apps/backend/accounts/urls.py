from django.urls import path
from .views import signup, login, refresh_token, me, RequestOTPView, VerifyOTPView

urlpatterns = [
    path('signup/', signup),
    path('login/', login),
    path('refresh/', refresh_token),
    path('me/', me),
    path('request-otp/', RequestOTPView.as_view()),
    path('verify-otp/', VerifyOTPView.as_view()),
]