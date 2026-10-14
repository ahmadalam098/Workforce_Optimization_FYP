namespace fyp_project.DTO
{
    public class UserDTO
    {
        public int UserId { get; set; }

        public string FullName { get; set; }

        public string Email { get; set; } 
        public string RoleName { get; set; }

    }

public class ForgetPasswordDTO
    {
        public string Email { get; set; }
    }
}


public class VerifyOtpDTO
{
    public string Email { get; set; }
    public string Otp { get; set; }
}
public class ResetPasswordDTO
{
    public string Email { get; set; }
    public string NewPassword { get; set; }
    public string ConfirmPassword { get; set; }
}