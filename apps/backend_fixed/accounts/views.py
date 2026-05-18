from django.contrib.auth.models import User
from django.contrib.auth import authenticate

from rest_framework.decorators import api_view
from rest_framework.response import Response

from rest_framework_simplejwt.tokens import RefreshToken


@api_view(['POST'])
def signup(request):

    username = request.data.get('username')

    email = request.data.get('email')

    password = request.data.get('password')

    if not username or not password:

        return Response({

            "error": "Username and password are required"

        }, status=400)

    if User.objects.filter(username=username).exists():

        return Response({

            "error": "Username already exists"

        }, status=400)

    user = User.objects.create_user(

        username=username,

        email=email,

        password=password
    )

    refresh = RefreshToken.for_user(user)

    return Response({

        "token": str(refresh.access_token)
    })


@api_view(['POST'])
def login(request):

    username = request.data.get('username')

    password = request.data.get('password')

    user = authenticate(

        username=username,
        password=password
    )

    if user is None:

        return Response({

            "error": "Invalid credentials"

        }, status=401)

    refresh = RefreshToken.for_user(user)

    return Response({

        "token": str(refresh.access_token)
    })