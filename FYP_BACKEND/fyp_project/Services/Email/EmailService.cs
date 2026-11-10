using MailKit.Net.Smtp;
using Microsoft.Extensions.Options;
using MimeKit;
using fyp_project.Models;

namespace fyp_project.Services
{
    public class EmailService
    {
        private readonly EmailSettings _settings;

        public EmailService(IOptions<EmailSettings> settings)
        {
            _settings = settings.Value;
        }

        /// <summary>The address emails are sent from (never the password).</summary>
        public string SenderAddress => _settings.Username;

        public async Task SendEmailAsync(
            string to,
            string subject,
            string body,
            bool isHtml = false)
        {
            var email = new MimeMessage();

            email.From.Add(
                new MailboxAddress(
                    isHtml ? "WorkForce Nexus" : "fyp_project",
                    _settings.Username
                )
            );

            email.To.Add(
                MailboxAddress.Parse(to)
            );

            email.Subject = subject;

            email.Body = new TextPart(isHtml ? "html" : "plain")
            {
                Text = body
            };

            // Development: write the email to a file instead of sending it (EmailSettings:PickupDirectory).
            if (!string.IsNullOrWhiteSpace(_settings.PickupDirectory))
            {
                Directory.CreateDirectory(_settings.PickupDirectory);
                var file = Path.Combine(_settings.PickupDirectory, $"{DateTime.UtcNow:yyyyMMdd-HHmmss-fff}-{Guid.NewGuid():N}.eml");
                await email.WriteToAsync(file);
                return;
            }

            using var smtp = new SmtpClient();

            await smtp.ConnectAsync(
                _settings.Host,
                _settings.Port,
                MailKit.Security.SecureSocketOptions.StartTls
            );

            await smtp.AuthenticateAsync(
                _settings.Username,
                _settings.Password
            );

            await smtp.SendAsync(email);

            await smtp.DisconnectAsync(true);
        }
    }
}