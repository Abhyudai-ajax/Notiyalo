from django.db import models
from django.contrib.auth.models import User


class Note(models.Model):

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notes'
    )

    title = models.CharField(max_length=255, blank=True, default='Untitled')
    content = models.TextField(blank=True, default='')

    tags = models.CharField(max_length=500, blank=True, default='')

    archived = models.BooleanField(default=False)

    # Soft delete — never truly remove data, just hide it
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', 'is_deleted', 'archived']),
            models.Index(fields=['user', 'updated_at']),
        ]

    def __str__(self):
        return f"{self.title} ({self.user.username})"

    def soft_delete(self):
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])
