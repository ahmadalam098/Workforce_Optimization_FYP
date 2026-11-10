using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using fyp_project.DTO;
using fyp_project.Models;
using fyp_project.Services;

namespace fyp_project.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ForgetPasswordController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _context;
        private readonly EmailService _emailService;
        private readonly RedisService _redisService;
        private readonly AttemptLimiter _limiter;
        private static readonly TimeSpan OtpWindow = TimeSpan.FromMinutes(10);

        public ForgetPasswordController(
           WorkforceManagementDbContext context,
            EmailService emailService,
            RedisService redisService,
            AttemptLimiter limiter)
        {
            _limiter = limiter;
            _context = context;
            _emailService = emailService;
            _redisService = redisService;
        }


        // =========================================
        // 1. SEND OTP
        // =========================================

        [HttpPost("send-otp")]
        public async Task<IActionResult> ForgetPassword(
            ForgetPasswordDTO user)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(user.Email))
                {
                    return BadRequest(new
                    {
                        message = "Email is required."
                    });
                }

                if (!AttemptLimiter.LooksLikeEmail(user.Email.Trim()))
                {
                    return BadRequest(new { message = "Enter a valid email address." });
                }

                // At most 3 codes per e-mail (and 20 per address) every 10 minutes.
                var sendKey = "otp-send:" + user.Email.Trim().ToLowerInvariant();
                var sendIpKey = "otp-send-ip:" + AttemptLimiter.Ip(HttpContext);
                if (_limiter.IsBlocked(sendKey, 3, OtpWindow, out var wait) || _limiter.IsBlocked(sendIpKey, 20, OtpWindow, out wait))
                {
                    Response.Headers["Retry-After"] = wait.ToString();
                    return StatusCode(429, new { message = $"Too many codes requested. Please try again in {Math.Max(1, (wait + 59) / 60)} minute(s)." });
                }
                _limiter.Hit(sendKey, OtpWindow); _limiter.Hit(sendIpKey, OtpWindow);

                var existingUser = await _context.Users
                    .FirstOrDefaultAsync(
                        u => u.Email == user.Email
                    );

                // Same answer whether or not the e-mail is registered, so nobody can use this form to find out who has an account.
                if (existingUser == null)
                {
                    return Ok(new
                    {
                        message = "OTP sent successfully"
                    });
                }


                // Generate OTP

                OtpService otpService = new OtpService();

                string otp = otpService.GenerateOtp();


                // Save OTP in Redis for 5 minutes

                await _redisService.SaveAsync(
                    $"otp:{user.Email}",
                    otp,
                    5
                );


                // Send OTP to email

                await _emailService.SendEmailAsync(
                    user.Email,
                    "OTP for Password Reset",
                    $"Your OTP is: {otp}"
                );


                return Ok(new
                {
                    message = "OTP sent successfully"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(
                    500,
                    "Something went wrong. Please try again."
                );
            }
        }


        // =========================================
        // 2. VERIFY OTP
        // =========================================

        [HttpPost("verify-otp")]
        public async Task<IActionResult> VerifyOtp(
            VerifyOtpDTO verify)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(verify.Email) || string.IsNullOrWhiteSpace(verify.Otp))
                {
                    return BadRequest(new
                    {
                        message = "Email and OTP are required."
                    });
                }

                var guessKey = "otp-guess:" + verify.Email.Trim().ToLowerInvariant();
                if (_limiter.IsBlocked(guessKey, 5, OtpWindow, out var wait))
                {
                    await _redisService.DeleteAsync($"otp:{verify.Email}");
                    Response.Headers["Retry-After"] = wait.ToString();
                    return StatusCode(429, new { message = "Too many wrong codes. Request a new code after a few minutes." });
                }

                // Get OTP from Redis

                var storedOtp = await _redisService.GetAsync(
                    $"otp:{verify.Email}"
                );


                // OTP doesn't exist
                // Means expired or invalid

                if (storedOtp == null)
                {
                    return BadRequest(new
                    {
                        message =
                            "OTP has expired or is invalid."
                    });
                }


                // Compare OTP

                if (storedOtp != verify.Otp)
                {
                    if (_limiter.Hit(guessKey, OtpWindow) >= 5) await _redisService.DeleteAsync($"otp:{verify.Email}");
                    return BadRequest(new
                    {
                        message = "Invalid OTP."
                    });
                }


                // OTP correct
                // Delete OTP
                _limiter.Reset(guessKey);

                await _redisService.DeleteAsync(
                    $"otp:{verify.Email}"
                );


                // Give permission to reset password
                // Expire after 10 minutes

                await _redisService.SaveAsync(
                    $"reset:{verify.Email}",
                    "verified",
                    10
                );


                return Ok(new
                {
                    message =
                        "OTP verified successfully."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(
                    500,
                    "Something went wrong. Please try again."
                );
            }
        }


        // =========================================
        // 3. RESET PASSWORD
        // =========================================

        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword(
            ResetPasswordDTO reset)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(reset.Email) ||
                    string.IsNullOrWhiteSpace(reset.NewPassword) ||
                    string.IsNullOrWhiteSpace(reset.ConfirmPassword))
                {
                    return BadRequest(new
                    {
                        message = "Email, new password, and confirm password are required."
                    });
                }

                // Check whether OTP was verified

                var verified = await _redisService.GetAsync(
                    $"reset:{reset.Email}"
                );


                if (verified == null)
                {
                    return BadRequest(new
                    {
                        message =
                            "OTP verification required."
                    });
                }


                // Check passwords

                if (reset.NewPassword !=
                    reset.ConfirmPassword)
                {
                    return BadRequest(new
                    {
                        message =
                            "Passwords do not match."
                    });
                }


                // Find user

                var user = await _context.Users
                    .FirstOrDefaultAsync(
                        u => u.Email == reset.Email
                    );


                if (user == null)
                {
                    return NotFound(new
                    {
                        message = "User not found."
                    });
                }


                // Hash new password

                user.PasswordHash =
                    BCrypt.Net.BCrypt.HashPassword(
                        reset.NewPassword
                    );


                // Save password

                await _context.SaveChangesAsync();


                // Remove reset permission

                await _redisService.DeleteAsync(
                    $"reset:{reset.Email}"
                );


                return Ok(new
                {
                    message =
                        "Password has been reset successfully."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(
                    500,
                    "Something went wrong. Please try again."
                );
            }
        }
    }
}