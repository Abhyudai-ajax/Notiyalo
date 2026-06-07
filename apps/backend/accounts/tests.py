import pytest
from django.urls import reverse
from django.contrib.auth.models import User
from accounts.models import OTPCode
from rest_framework.test import APIClient

@pytest.fixture
def api_client():
    return APIClient(secure=True)

@pytest.fixture
def setup_user(db):
    return User.objects.create_user(username='testuser', email='test@test.com', password='Password1')

@pytest.mark.django_db
class TestAuthSystem:
    def test_signup_success(self, api_client):
        response = api_client.post('/api/auth/signup/', {
            'username': 'newuser',
            'email': 'new@new.com',
            'password': 'Password1'
        })
        assert response.status_code == 201
        assert 'token' in response.data

    def test_signup_weak_password(self, api_client):
        response = api_client.post('/api/auth/signup/', {
            'username': 'newuser',
            'email': 'new@new.com',
            'password': 'weak'
        })
        assert response.status_code == 400

    def test_login_success(self, api_client, setup_user):
        response = api_client.post('/api/auth/login/', {
            'username': 'test@test.com',
            'password': 'Password1'
        })
        assert response.status_code == 200
        assert 'token' in response.data

    def test_login_failure(self, api_client, setup_user):
        response = api_client.post('/api/auth/login/', {
            'username': 'test@test.com',
            'password': 'WrongPassword1'
        })
        assert response.status_code == 401

    def test_otp_request_and_verify(self, api_client):
        # Request OTP
        res1 = api_client.post('/api/auth/request-otp/', {'email': 'otp@test.com'})
        assert res1.status_code == 200
        
        # Get OTP directly from DB
        otp_obj = OTPCode.objects.filter(email='otp@test.com').latest('created_at')
        
        # Verify
        res2 = api_client.post('/api/auth/verify-otp/', {
            'email': 'otp@test.com',
            'code': otp_obj.code
        })
        assert res2.status_code == 200
        assert 'token' in res2.data

    def test_otp_lockout(self, api_client):
        api_client.post('/api/auth/request-otp/', {'email': 'lock@test.com'})
        
        # Guess wrong 5 times
        for _ in range(5):
            res = api_client.post('/api/auth/verify-otp/', {
                'email': 'lock@test.com',
                'code': '000000'
            })
            assert res.status_code == 400
            
        # 6th attempt should be locked out even if code was somehow guessed (which we don't know, but we use wrong anyway)
        res_locked = api_client.post('/api/auth/verify-otp/', {
            'email': 'lock@test.com',
            'code': '000000'
        })
        assert 'Too many incorrect attempts' in res_locked.data['error']

    def test_logout_blacklist(self, api_client, setup_user):
        # Login
        login_res = api_client.post('/api/auth/login/', {
            'username': 'test@test.com',
            'password': 'Password1'
        })
        refresh = login_res.data['refresh']
        token = login_res.data['token']
        
        # Logout
        api_client.credentials(HTTP_AUTHORIZATION='Bearer ' + token)
        logout_res = api_client.post('/api/auth/logout/', {'refresh': refresh})
        assert logout_res.status_code == 200
        
        # Try to use refresh token
        refresh_res = api_client.post('/api/auth/refresh/', {'refresh': refresh})
        assert refresh_res.status_code == 401 # Blacklisted

    def test_settings_update(self, api_client, setup_user):
        login_res = api_client.post('/api/auth/login/', {
            'username': 'test@test.com',
            'password': 'Password1'
        })
        token = login_res.data['token']
        api_client.credentials(HTTP_AUTHORIZATION='Bearer ' + token)
        
        res = api_client.put('/api/auth/settings/', {
            'email': 'new_email@test.com'
        })
        assert res.status_code == 200
        setup_user.refresh_from_db()
        assert setup_user.email == 'new_email@test.com'

    def test_password_reset(self, api_client, setup_user):
        api_client.post('/api/auth/request-otp/', {'email': 'test@test.com'})
        otp_obj = OTPCode.objects.filter(email='test@test.com').latest('created_at')
        
        res = api_client.post('/api/auth/password-reset/', {
            'email': 'test@test.com',
            'code': otp_obj.code,
            'new_password': 'NewPassword2'
        })
        assert res.status_code == 200
        
        # Login with new password
        login_res = api_client.post('/api/auth/login/', {
            'username': 'test@test.com',
            'password': 'NewPassword2'
        })
        assert login_res.status_code == 200
