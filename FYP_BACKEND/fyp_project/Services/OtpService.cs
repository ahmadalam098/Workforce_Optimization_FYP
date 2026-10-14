using System.Security.Cryptography;

namespace fyp_project.Services
{
    public class OtpService
    {
        public string GenerateOtp()
        {
            string otp = RandomNumberGenerator
                .GetInt32(100000, 1000000)
                .ToString();

            return otp;
        }
    }
}