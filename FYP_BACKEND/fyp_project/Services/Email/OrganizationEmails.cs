using System.Net;

namespace fyp_project.Services
{
    /// <summary>The emails WorkForce Nexus sends to an organization.</summary>
    public static class OrganizationEmails
    {
        /// <summary>Sent to the organization's email address when an admin registers it.</summary>
        public static (string Subject, string Html) Registered(string organizationName, string email, bool approved, DateTime registeredAtUtc)
        {
            var name = WebUtility.HtmlEncode(organizationName);
            var address = WebUtility.HtmlEncode(email);
            var date = registeredAtUtc.ToString("dd MMM yyyy");

            var status = approved
                ? "Your organization is <strong>approved and active</strong>. Our team will contact you shortly to set up your contract."
                : "Your organization is <strong>waiting for approval</strong>. We will email you again as soon as it has been reviewed.";

            var html = $@"<div style=""font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16233a"">
  <div style=""background:#0b1f3a;color:#f2b705;padding:20px 24px;border-radius:10px 10px 0 0;font-size:20px;font-weight:600"">WorkForce Nexus</div>
  <div style=""border:1px solid #e3dccd;border-top:0;padding:24px;border-radius:0 0 10px 10px;line-height:1.6"">
    <p style=""margin-top:0"">Dear {name} team,</p>
    <p><strong>{name}</strong> has been registered on <strong>WorkForce Nexus</strong> by our administrator.</p>
    <table style=""border-collapse:collapse;margin:16px 0"">
      <tr><td style=""padding:4px 16px 4px 0;color:#6b7280"">Organization</td><td>{name}</td></tr>
      <tr><td style=""padding:4px 16px 4px 0;color:#6b7280"">Registered email</td><td>{address}</td></tr>
      <tr><td style=""padding:4px 16px 4px 0;color:#6b7280"">Registered on</td><td>{date}</td></tr>
    </table>
    <p>{status}</p>
    <p style=""color:#6b7280;font-size:13px;margin-bottom:0"">If you did not expect this email, please reply to let us know.</p>
  </div>
</div>";

            return ("Your organization is registered with WorkForce Nexus", html);
        }
    }
}
