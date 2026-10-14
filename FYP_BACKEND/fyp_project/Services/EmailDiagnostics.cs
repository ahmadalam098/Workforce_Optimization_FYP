using System.Net.Sockets;

namespace fyp_project.Services
{
    /// <summary>Turns a mail error into a sentence the admin can act on (no secrets are included).</summary>
    public static class EmailDiagnostics
    {
        public static string Explain(Exception exception, string? senderAddress)
        {
            for (var ex = exception; ex != null; ex = ex.InnerException)
            {
                var text = ex.Message;

                if (ex is MailKit.Security.AuthenticationException ||
                    text.Contains("5.7.8") || text.Contains("Username and Password not accepted", StringComparison.OrdinalIgnoreCase))
                {
                    return $"The mail server rejected the saved login for {senderAddress}. Create a new Gmail App Password for that account " +
                           "(Google Account, Security, 2-Step Verification, App passwords), put it in appsettings.json under EmailSettings:Password, and restart the backend.";
                }

                if (ex is SocketException || ex is TimeoutException || ex is OperationCanceledException)
                    return "The mail server could not be reached. Check the internet connection and that port 587 is not blocked.";

                if (ex is FormatException || text.Contains("addr-spec", StringComparison.OrdinalIgnoreCase))
                    return "The recipient email address is not valid.";
            }

            var first = exception.Message.Split('\n')[0].Trim();
            return $"Mail error: {first}";
        }
    }
}
