from django.urls import path
from .views import signup, login, refresh_token, me

urlpatterns = [
    path('signup/', signup),
    path('login/', login),
    path('refresh/', refresh_token),
    path('me/', me),
]
