using System.Net;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public enum PersonEvent
    {
        Activated,
        Deactivated,
        Updated,
        PasswordReset,
        OrganizationsChanged,
    }

    public enum OrganizationEvent
    {
        Approved,
        Rejected,
        Suspended,
        Updated,
        ContractApproved,
        ContractRejected,
        ContractTerminated,
        ContractUpdated,
        StaffRequestApproved,
        StaffRequestRejected,
        StaffRequestCancelled,
    }

    /// <summary>
    /// Every email WorkForce Nexus sends about an account or an organization: welcome, activated, deactivated, updated,
    /// password reset, organization and contract decisions, deletion ...
    /// Passwords are never put in an email. A mail problem never undoes the action itself: the admin is told in the
    /// response, and the result is written to the audit log (and so to the notification bell).
    /// </summary>
    public class AccountMailer
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly EmailService _email;
        private readonly AuditService _audit;

        public AccountMailer(WorkforceManagementDbContext db, EmailService email, AuditService audit)
        {
            _db = db;
            _email = email;
            _audit = audit;
        }

        // ---------------------------------------------------------------- layout

        private static string E(string? text) => WebUtility.HtmlEncode(text ?? string.Empty);

        /// <summary>The common look of every email: navy header, greeting, paragraphs (already HTML), a small facts table.</summary>
        public static string Layout(string name, IEnumerable<string> paragraphs, IEnumerable<(string Label, string Value)>? rows = null)
        {
            var table = string.Empty;
            var list = rows?.Where(r => !string.IsNullOrWhiteSpace(r.Value)).ToList();
            if (list is { Count: > 0 })
            {
                table = @"<table style=""border-collapse:collapse;margin:16px 0"">" +
                        string.Concat(list.Select(r => $@"<tr><td style=""padding:4px 16px 4px 0;color:#6b7280"">{E(r.Label)}</td><td>{E(r.Value)}</td></tr>")) +
                        "</table>";
            }

            return $@"<div style=""font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16233a"">
  <div style=""background:#0b1f3a;color:#f2b705;padding:20px 24px;border-radius:10px 10px 0 0;font-size:20px;font-weight:600"">WorkForce Nexus</div>
  <div style=""border:1px solid #e3dccd;border-top:0;padding:24px;border-radius:0 0 10px 10px;line-height:1.6"">
    <p style=""margin-top:0"">Dear {E(name)},</p>
    {string.Concat(paragraphs.Select(p => $"<p>{p}</p>"))}
    {table}
    <p style=""color:#6b7280;font-size:13px;margin-bottom:0"">If you did not expect this email, please reply to let us know.</p>
  </div>
</div>";
        }

        private static string Note(string? note) =>
            string.IsNullOrWhiteSpace(note) ? string.Empty : $" <br/><strong>Note from the administrator:</strong> {E(note)}";

        // ---------------------------------------------------------------- texts (static, so they can be checked without sending)

        public static (string Subject, string Html) WelcomeMessage(string name, string email, string roleLabel, string? organizations, IEnumerable<(string Label, string Value)>? details = null)
        {
            var html = Layout(name,
                new[]
                {
                    "An account has been created for you on <strong>WorkForce Nexus</strong> by our administrator.",
                    "Your administrator has set your first password and will share it with you. You can also choose your own at any time with <strong>Forgot password</strong> on the sign-in page.",
                },
                new[] { ("Role", roleLabel), ("Sign-in email", email), ("Organizations", organizations ?? string.Empty) }.Concat(details ?? Array.Empty<(string, string)>()));
            return ("Your WorkForce Nexus account has been created", html);
        }

        public static (string Subject, string Html) PersonMessage(PersonEvent kind, string name, string email, string roleLabel, string? note, string? extra, IEnumerable<string>? changes = null)
        {
            var changed = changes?.Where(c => !string.IsNullOrWhiteSpace(c)).ToList();
            var rows = new[] { ("Role", roleLabel), ("Sign-in email", email), ("Organizations", extra ?? string.Empty), ("What changed", changed is { Count: > 0 } ? string.Join("; ", changed) : string.Empty) };
            return kind switch
            {
                PersonEvent.Deactivated => ("Your WorkForce Nexus account has been deactivated",
                    Layout(name, new[] { "Your <strong>WorkForce Nexus</strong> account has been <strong>deactivated</strong> by our administrator. You can no longer sign in until it is activated again." + Note(note), "If you think this is a mistake, please contact your administrator." }, rows)),
                PersonEvent.Activated => ("Your WorkForce Nexus account has been activated",
                    Layout(name, new[] { "Your <strong>WorkForce Nexus</strong> account has been <strong>activated</strong> again. You can sign in as usual." + Note(note) }, rows)),
                PersonEvent.PasswordReset => ("Your WorkForce Nexus password was reset",
                    Layout(name, new[] { "Your <strong>WorkForce Nexus</strong> password was reset by our administrator, who will share the new password with you. You can also choose your own with <strong>Forgot password</strong> on the sign-in page.", "If you did not ask for this, please contact your administrator at once." }, rows)),
                PersonEvent.OrganizationsChanged => ("The organizations you manage have changed",
                    Layout(name, new[] { "The organizations you manage on <strong>WorkForce Nexus</strong> were updated by our administrator." }, rows)),
                _ => ("Your WorkForce Nexus account was updated",
                    Layout(name, new[] { "Your <strong>WorkForce Nexus</strong> account details were updated by our administrator." + Note(note) }, rows)),
            };
        }

        /// <param name="item">The contract number, or other thing the email is about.</param>
        public static (string Subject, string Html) OrganizationMessage(OrganizationEvent kind, string organization, string? item, string? note)
        {
            var org = $"<strong>{E(organization)}</strong>";
            var contract = string.IsNullOrWhiteSpace(item) ? "your contract" : $"contract <strong>{E(item)}</strong>";
            var rows = new[] { ("Organization", organization), ("Contract", kind >= OrganizationEvent.ContractApproved && kind <= OrganizationEvent.ContractUpdated ? item ?? string.Empty : string.Empty) };

            (string subject, string text) = kind switch
            {
                OrganizationEvent.Approved => ("Your organization has been approved", $"{org} has been <strong>approved</strong> on WorkForce Nexus and is now active."),
                OrganizationEvent.Rejected => ("Your organization was not approved", $"{org} has been <strong>rejected</strong> on WorkForce Nexus."),
                OrganizationEvent.Suspended => ("Your organization has been suspended", $"{org} has been <strong>suspended</strong> on WorkForce Nexus."),
                OrganizationEvent.Updated => ("Your organization details were updated", $"The details of {org} were updated by our administrator."),
                OrganizationEvent.ContractApproved => ("Your contract has been approved", $"{contract} for {org} has been <strong>approved</strong> and is now active."),
                OrganizationEvent.ContractRejected => ("Your contract was rejected", $"{contract} for {org} has been <strong>rejected</strong>."),
                OrganizationEvent.ContractTerminated => ("Your contract has been terminated", $"{contract} for {org} has been <strong>terminated</strong>."),
                OrganizationEvent.ContractUpdated => ("Your contract was updated", $"{contract} for {org} was updated by our administrator."),
                OrganizationEvent.StaffRequestApproved => ("Your staff request was approved", $"Your request for staff for {org} has been <strong>approved</strong>. We will allocate employees shortly."),
                OrganizationEvent.StaffRequestRejected => ("Your staff request was rejected", $"Your request for staff for {org} has been <strong>rejected</strong>."),
                _ => ("Your staff request was cancelled", $"Your request for staff for {org} has been <strong>cancelled</strong>."),
            };

            return (subject, Layout(organization, new[] { text + Note(note) }, rows));
        }

        public static (string Subject, string Html) PersonDeletedMessage(string name, string email, string roleLabel) =>
            ("Your WorkForce Nexus account has been deleted",
            Layout(name, new[] { "Your <strong>WorkForce Nexus</strong> account has been <strong>permanently deleted</strong> by our administrator. You can no longer sign in.", "If you think this is a mistake, please contact your administrator." }, new[] { ("Role", roleLabel), ("Sign-in email", email) }));

        /// <summary>Sent to the OLD address when the sign-in email of an account is changed.</summary>
        public static (string Subject, string Html) EmailChangedMessage(string name, string oldEmail, string newEmail) =>
            ("The sign-in email of your WorkForce Nexus account was changed",
                Layout(name, new[] { "The sign-in email of your <strong>WorkForce Nexus</strong> account was changed by our administrator. From now on you sign in with the new address, and emails are sent there.", "If you did not expect this, please contact your administrator at once." },
                    new[] { ("Previous email", oldEmail), ("New email", newEmail) }));

        /// <summary>Sent to an organization (and its managers) when an admin resolves one of its queries.</summary>
        public static (string Subject, string Html) QueryResolvedMessage(string name, string ticketNumber, string subject, string comment, string? resolvedBy, DateTime resolvedAtUtc) =>
            ($"Your query {ticketNumber} has been resolved",
                Layout(name,
                    new[]
                    {
                        $"Your query <strong>{E(ticketNumber)}</strong> (<em>{E(subject)}</em>) has been <strong>resolved</strong> on WorkForce Nexus.",
                        $"<strong>Comment from the administrator:</strong><br/>{E(comment).Replace("\n", "<br/>")}",
                    },
                    new[] { ("Query", $"{ticketNumber} - {subject}"), ("Resolved by", resolvedBy ?? "Administrator"), ("Resolved on", resolvedAtUtc.ToString("dd MMM yyyy")) }));

        public static (string Subject, string Html) OrganizationDeletedMessage(string organization, string email) =>
            ("Your organization was removed from WorkForce Nexus",
                Layout(organization, new[] { $"<strong>{E(organization)}</strong> has been <strong>removed</strong> from WorkForce Nexus by our administrator. It no longer has an account on the platform." },
                    new[] { ("Organization", organization), ("Email", email) }));

        // ---------------------------------------------------------------- sending

        private async Task<string> SendAsync(int? actorUserId, string auditPrefix, string entityType, object entityId, string to, string subject, string html, string kindLabel)
        {
            // Switched off in Settings > Notifications: nothing is sent and the admin is told.
            if (!await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyEmail))
                return " Email notifications are switched off in Settings, so no email was sent.";

            try
            {
                await _email.SendEmailAsync(to, subject, html, isHtml: true);
                await _audit.LogAsync(actorUserId, $"{auditPrefix}_EMAIL_SENT", entityType, entityId, $"{kindLabel} email sent to {to}");
                return $" An email was sent to {to}.";
            }
            catch (Exception ex)
            {
                var reason = EmailDiagnostics.Explain(ex, _email.SenderAddress);
                await _audit.LogAsync(actorUserId, $"{auditPrefix}_EMAIL_FAILED", entityType, entityId, $"{kindLabel} email to {to} could not be sent: {reason}");
                return $" The email to {to} could not be sent. {reason}";
            }
        }

        /// <summary>Welcome email for a new account. Returns a sentence for the admin (starts with a space, ready to append).</summary>
        public async Task<string> SendWelcomeAsync(int? actorUserId, int userId, string name, string email, string roleLabel, string? organizations = null, IEnumerable<(string Label, string Value)>? details = null)
        {
            var (subject, html) = WelcomeMessage(name, email, roleLabel, organizations, details);
            var note = await SendAsync(actorUserId, "ACCOUNT", "User", userId, email, subject, html, "Welcome");
            return note.Replace("An email was sent", "A welcome email was sent").Replace("The email to", "The welcome email to");
        }

        /// <summary>Tells a person that their account was deleted. The account is already gone, so the details are passed in.</summary>
        public async Task<string> SendPersonDeletedAsync(int? actorUserId, int userId, string? name, string? email, string? roleLabel)
        {
            if (string.IsNullOrWhiteSpace(email)) return string.Empty;
            var (subject, html) = PersonDeletedMessage(name ?? "there", email, roleLabel ?? "Staff");
            return await SendAsync(actorUserId, "ACCOUNT", "User", userId, email, subject, html, "Deleted");
        }

        /// <summary>Tells a person (employee, admin, business owner, organization manager) what happened to their account.</summary>
        public async Task<string> SendPersonEventAsync(int? actorUserId, int userId, PersonEvent kind, string? note = null, IEnumerable<string>? changes = null)
        {
            var user = await _db.Users.AsNoTracking().Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null || string.IsNullOrWhiteSpace(user.Email)) return string.Empty;

            string? organizations = null;
            if (kind == PersonEvent.OrganizationsChanged)
            {
                var names = await _db.OrganizationManagers.AsNoTracking()
                    .Where(m => m.UserId == userId && m.Org != null)
                    .Select(m => m.Org!.OrgName)
                    .ToListAsync();
                organizations = names.Count == 0 ? "None" : string.Join(", ", names);
            }

            var (subject, html) = PersonMessage(kind, user.Name ?? "there", user.Email, user.Role?.RoleType ?? "Staff", note, organizations, changes);
            return await SendAsync(actorUserId, "ACCOUNT", "User", userId, user.Email, subject, html, kind.ToString());
        }

        /// <summary>When the sign-in email changes, the PREVIOUS address is told too (the new one gets the normal update email).</summary>
        public async Task<string> SendEmailChangedAsync(int? actorUserId, int userId, string oldEmail)
        {
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null || string.IsNullOrWhiteSpace(oldEmail) || string.Equals(oldEmail, user.Email, StringComparison.OrdinalIgnoreCase)) return string.Empty;

            var (subject, html) = EmailChangedMessage(user.Name ?? "there", oldEmail, user.Email ?? string.Empty);
            return await SendAsync(actorUserId, "ACCOUNT", "User", userId, oldEmail, subject, html, "EmailChanged");
        }

        /// <summary>Tells an organization about a decision or change (its own, its contract's, or its staff request's).</summary>
        public async Task<string> SendOrganizationEventAsync(int? actorUserId, int organizationId, OrganizationEvent kind, string? note = null, string? item = null)
        {
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == organizationId);
            if (org == null || string.IsNullOrWhiteSpace(org.Email)) return string.Empty;

            var (subject, html) = OrganizationMessage(kind, org.OrgName ?? "your organization", item, note);
            return await SendAsync(actorUserId, "ORGANIZATION", "Organization", organizationId, org.Email, subject, html, kind.ToString());
        }

        /// <summary>
        /// Emails the resolution comment of a query to the organization and to every active manager of that organization.
        /// (When the Organization Manager portal exists, the resolved query is also what its notification bell shows.)
        /// </summary>
        public async Task<string> SendQueryResolvedAsync(int? actorUserId, int ticketId, string ticketNumber, string subject, int? organizationId, string comment, string? resolvedBy, DateTime resolvedAtUtc)
        {
            if (organizationId == null) return " The query is not linked to an organization, so no email was sent.";

            var recipients = new List<(string Name, string Email)>();
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == organizationId);
            if (org != null && !string.IsNullOrWhiteSpace(org.Email)) recipients.Add((org.OrgName ?? "your organization", org.Email));

            var managers = await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.OrgId == organizationId && m.User != null && m.User.IsActive == true && m.User.Email != null)
                .Select(m => new { m.User!.Name, m.User.Email })
                .ToListAsync();
            recipients.AddRange(managers.Select(m => (m.Name ?? "Manager", m.Email!)));

            var distinct = recipients.GroupBy(r => r.Email, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
            if (distinct.Count == 0) return " No email address is saved for this organization, so no email was sent.";

            var sent = new List<string>();
            var failed = new List<string>();
            foreach (var (name, email) in distinct)
            {
                var (subjectLine, html) = QueryResolvedMessage(name, ticketNumber, subject, comment, resolvedBy, resolvedAtUtc);
                var note = await SendAsync(actorUserId, "QUERY", "Ticket", ticketId, email, subjectLine, html, "Resolved");
                (note.Contains("could not be sent") ? failed : sent).Add(email);
            }

            var text = string.Empty;
            if (sent.Count > 0) text += $" An email with your comment was sent to {string.Join(", ", sent)}.";
            if (failed.Count > 0) text += $" The email to {string.Join(", ", failed)} could not be sent; check the mail settings in Settings.";
            return text;
        }

        /// <summary>The organization no longer exists, so its details are passed in.</summary>
        public async Task<string> SendOrganizationDeletedAsync(int? actorUserId, int organizationId, string name, string email)
        {
            if (string.IsNullOrWhiteSpace(email)) return string.Empty;
            var (subject, html) = OrganizationDeletedMessage(name, email);
            return await SendAsync(actorUserId, "ORGANIZATION", "Organization", organizationId, email, subject, html, "Deleted");
        }
    }
}
