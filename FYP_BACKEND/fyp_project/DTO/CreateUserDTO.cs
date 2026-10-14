
namespace fyp_project.DTOs
{
    public class CreateUserDto
    {
        public string FullName { get; set; } = null!;

        public string Email { get; set; } = null!;

        public string? Phone { get; set; }

        public string Cnic { get; set; } = null!;

        public string Password { get; set; } = null!;

        public int RoleId { get; set; }
    }
}
