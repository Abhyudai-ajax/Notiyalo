from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='otpcode',
            name='attempts',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddIndex(
            model_name='otpcode',
            index=models.Index(fields=['email', 'is_used', 'created_at'], name='accounts_otp_email_used_idx'),
        ),
    ]
