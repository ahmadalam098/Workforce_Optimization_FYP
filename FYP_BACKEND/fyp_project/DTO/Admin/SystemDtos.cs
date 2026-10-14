using System.ComponentModel.DataAnnotations;
using fyp_project.Validation;

namespace fyp_project.DTOs.Admin
{
    public class UpdateMyProfileRequest
    {
        [Required, StringLength(100), PersonName]
        public string FullName { get; set; } = string.Empty;

        [Required, EmailAddress, StringLength(150)]
        public string Email { get; set; } = string.Empty;
    }

    public class ChangeMyPasswordRequest
    {
        [Required, StringLength(100)]
        public string CurrentPassword { get; set; } = string.Empty;

        [Required, StringLength(100)]
        public string NewPassword { get; set; } = string.Empty;
    }
}
