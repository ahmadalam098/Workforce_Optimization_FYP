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