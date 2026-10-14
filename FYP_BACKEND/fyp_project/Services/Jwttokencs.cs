using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

public class TokenService
{
    private readonly IConfiguration _configuration;

    public TokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }


    public string CreateToken(
        int userId,
        string email,
        string roleName)
    {
        // =================================================
        // JWT CLAIMS
        // =================================================

        var claims = new[]
        {
            // User ID
            new Claim(
                ClaimTypes.NameIdentifier,
                userId.ToString()
            ),

            // Email
            new Claim(
                ClaimTypes.Email,
                email
            ),

            // Role
            new Claim(
                ClaimTypes.Role,
                roleName
            )
        };


        // =================================================
        // SECRET KEY
        // =================================================

        var key =
            new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(
                    _configuration["Jwt:Key"]!
                )
            );


        // =================================================
        // SIGNING
        // =================================================

        var credentials =
            new SigningCredentials(
                key,
                SecurityAlgorithms.HmacSha256
            );


        // =================================================
        // CREATE JWT
        // =================================================

        var token =
            new JwtSecurityToken(

                issuer:
                    _configuration["Jwt:Issuer"],

                audience:
                    _configuration["Jwt:Audience"],

                claims: claims,

                expires:
                    DateTime.UtcNow.AddMinutes(
                        Convert.ToDouble(
                            _configuration[
                                "Jwt:ExpiryMinutes"
                            ]
                        )
                    ),

                signingCredentials: credentials
            );


        // JWT ko string mein convert
        return new JwtSecurityTokenHandler()
            .WriteToken(token);
    }
}