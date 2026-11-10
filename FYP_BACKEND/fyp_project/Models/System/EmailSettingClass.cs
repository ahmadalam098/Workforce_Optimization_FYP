namespace fyp_project.Models

{
    public class EmailSettings
    {
        public string Host { get; set; }
        public int Port { get; set; }
        public string Username { get; set; }
        public string Password { get; set; }

        /// <summary>Development only: when set, emails are written as .eml files into this folder instead of being sent (nothing leaves the computer).</summary>
        public string? PickupDirectory { get; set; }
    }
}