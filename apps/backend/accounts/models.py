import random
import secrets
from django.db import models
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

MAX_OTP_ATTEMPTS = 5          # lock after this many wrong guesses
OTP_EXPIRY_MINUTES = 10       # code expires after this
OTP_COOLDOWN_SECONDS = 60     # minimum gap between new OTP requests


class OTPCode(models.Model):
    email      = models.EmailField(db_index=True)
    code       = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used    = models.BooleanField(default=False)
    attempts   = models.PositiveSmallIntegerField(default=0)  # wrong-guess counter

    class Meta:
        indexes = [
            models.Index(fields=['email', 'is_used', 'created_at'], name='accounts_otp_email_used_idx'),
        ]

    def is_expired(self):
        return timezone.now() > self.created_at + timedelta(minutes=OTP_EXPIRY_MINUTES)

    def is_locked(self):
        """Too many wrong attempts — treat as invalid."""
        return self.attempts >= MAX_OTP_ATTEMPTS

    def record_attempt(self):
        self.attempts += 1
        self.save(update_fields=['attempts'])

    def consume(self):
        self.is_used = True
        self.save(update_fields=['is_used'])

    @classmethod
    def can_request(cls, email):
        """
        Enforce a cooldown: block a new OTP if one was issued
        less than OTP_COOLDOWN_SECONDS ago and hasn't expired yet.
        """
        cutoff = timezone.now() - timedelta(seconds=OTP_COOLDOWN_SECONDS)
        recent = cls.objects.filter(
            email=email,
            is_used=False,
            created_at__gte=cutoff
        ).exists()
        return not recent

    @classmethod
    def generate_for(cls, email):
        # Invalidate all previous unused OTPs for this email
        cls.objects.filter(email=email, is_used=False).update(is_used=True)
        # Use secrets module — NOT random.randint (not cryptographically secure)
        code = str(secrets.randbelow(900000) + 100000)  # 100000–999999
        logger.info('[OTP] Generated new OTP for email hash=%s', hash(email))
        return cls.objects.create(email=email, code=code)

    def __str__(self):
        return f"{self.email} — {'used' if self.is_used else 'active'}"