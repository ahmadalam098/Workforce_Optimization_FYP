using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;
using System.Text;
using fyp_project.Models;
using fyp_project.Services;

var builder = WebApplication.CreateBuilder(args);

// =====================================================
// EMAIL SETTINGS
// =====================================================

builder.Services.Configure<EmailSettings>(
    builder.Configuration.GetSection("EmailSettings")
);


// =====================================================
// REDIS
// =====================================================

var redisOptions = new ConfigurationOptions
{
    User = builder.Configuration["Redis:User"],
    Password = builder.Configuration["Redis:Password"],

    // Debug ke liye true rakho
    // Agar connection fail hua to app startup par actual error milega
    AbortOnConnectFail = true,

    ConnectTimeout = 10000,
    SyncTimeout = 10000
};

redisOptions.EndPoints.Add(
    "soda-recess-diaphanous-40743.db.redis.io",
    16619
);

var redis = ConnectionMultiplexer.Connect(redisOptions);

builder.Services.AddSingleton<IConnectionMultiplexer>(redis);

builder.Services.AddSingleton<RedisService>();
// =====================================================
// APPLICATION SERVICES
// =====================================================

builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<AccountMailer>();
builder.Services.AddScoped<ChatService>();
builder.Services.AddScoped<CallService>();
builder.Services.AddScoped<AssignmentOfferService>();

builder.Services.AddScoped<TokenService>();

// Admin portal services
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<IdGenerator>();
builder.Services.AddScoped<RoleService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<ShiftService>();
builder.Services.AddScoped<EmployeeStatusService>();
builder.Services.AddScoped<AllocationService>();
builder.Services.AddScoped<ExchangeRateService>();
builder.Services.AddScoped<PaymentRuleService>();
builder.Services.AddScoped<SalaryReportService>();
builder.Services.AddScoped<DailyStaffingService>();
builder.Services.AddScoped<ContractModificationService>();
builder.Services.AddHostedService<DailyStaffingWorker>();
builder.Services.AddScoped<InvoiceService>();
builder.Services.AddScoped<ReportService>();


// =====================================================
// CONTROLLERS
// =====================================================

builder.Services
    .AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        // Validation errors come back as { message, errors: { field: [messages] } }
        // so the frontend can show them next to the right form field.
        options.InvalidModelStateResponseFactory = context =>
        {
            var errors = context.ModelState
                .Where(entry => entry.Value?.Errors.Count > 0)
                .ToDictionary(
                    entry => char.ToLowerInvariant(entry.Key[0]) + entry.Key[1..],
                    entry => entry.Value!.Errors
                        .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage) ? "Invalid value." : error.ErrorMessage)
                        .ToArray());

            var message = errors.Values.SelectMany(messages => messages).FirstOrDefault()
                          ?? "The request is not valid.";

            return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(new { message, errors });
        };
    });


// =====================================================
// OPEN API
// =====================================================

builder.Services.AddOpenApi();


// =====================================================
// DATABASE
// =====================================================

builder.Services.AddDbContext<WorkforceManagementDbContext>(
    options =>
        options.UseSqlServer(
            builder.Configuration.GetConnectionString(
                "DefaultConnection"
            )
        )
);


// =====================================================
// JWT AUTHENTICATION
// =====================================================

builder.Services
    .AddAuthentication(
        JwtBearerDefaults.AuthenticationScheme
    )
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters =
            new TokenValidationParameters
            {
                // -----------------------------------------
                // ISSUER
                // -----------------------------------------

                ValidateIssuer = true,

                ValidIssuer =
                    builder.Configuration["Jwt:Issuer"],


                // -----------------------------------------
                // AUDIENCE
                // -----------------------------------------

                ValidateAudience = true,

                ValidAudience =
                    builder.Configuration["Jwt:Audience"],


                // -----------------------------------------
                // TOKEN EXPIRATION
                // -----------------------------------------

                ValidateLifetime = true,


                // -----------------------------------------
                // SIGNING KEY
                // -----------------------------------------

                ValidateIssuerSigningKey = true,

                IssuerSigningKey =
                    new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(
                            builder.Configuration["Jwt:Key"]!
                        )
                    )
            };


        // =================================================
        // GET JWT FROM HTTPONLY COOKIE
        // =================================================

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var token =
                    context.Request.Cookies["accessToken"];

                if (!string.IsNullOrEmpty(token))
                {
                    context.Token = token;
                }

                return Task.CompletedTask;
            }
        };
    });


// =====================================================
// AUTHORIZATION
// =====================================================

builder.Services.AddAuthorization(options =>
{
    // Admin-only APIs. Accepts the role claim under either name, so it works
    // whether or not the JWT handler maps "role" to ClaimTypes.Role.
    options.AddPolicy("AdminOnly", policy =>
        policy
            .RequireAuthenticatedUser()
            .RequireAssertion(context => context.User.Claims.Any(claim =>
                (claim.Type == System.Security.Claims.ClaimTypes.Role || claim.Type == "role") &&
                string.Equals(claim.Value, "Admin", StringComparison.OrdinalIgnoreCase))));

    // Organization Manager portal APIs.
    options.AddPolicy("ManagerOnly", policy =>
        policy
            .RequireAuthenticatedUser()
            .RequireAssertion(context => context.User.Claims.Any(claim =>
                (claim.Type == System.Security.Claims.ClaimTypes.Role || claim.Type == "role") &&
                string.Equals(claim.Value, "Organization Manager", StringComparison.OrdinalIgnoreCase))));

    // Organization portal APIs (an organization signs in on its own, apart from the staff accounts).
    options.AddPolicy("OrganizationOnly", policy =>
        policy
            .RequireAuthenticatedUser()
            .RequireAssertion(context => context.User.Claims.Any(claim =>
                (claim.Type == System.Security.Claims.ClaimTypes.Role || claim.Type == "role") &&
                string.Equals(claim.Value, "Organization", StringComparison.OrdinalIgnoreCase))));

    // Business Owner portal APIs.
    options.AddPolicy("BusinessOwnerOnly", policy =>
        policy
            .RequireAuthenticatedUser()
            .RequireAssertion(context => context.User.Claims.Any(claim =>
                (claim.Type == System.Security.Claims.ClaimTypes.Role || claim.Type == "role") &&
                string.Equals(claim.Value, "Business Owner", StringComparison.OrdinalIgnoreCase))));

    // Audio / video calls: an employee, an organization manager or an organization.
    options.AddPolicy("CallParticipant", policy =>
        policy
            .RequireAuthenticatedUser()
            .RequireAssertion(context => context.User.Claims.Any(claim =>
                (claim.Type == System.Security.Claims.ClaimTypes.Role || claim.Type == "role") &&
                (string.Equals(claim.Value, "Employee", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(claim.Value, "Organization Manager", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(claim.Value, "Organization", StringComparison.OrdinalIgnoreCase)))));

    // Employee portal APIs.
    options.AddPolicy("EmployeeOnly", policy =>
        policy
            .RequireAuthenticatedUser()
            .RequireAssertion(context => context.User.Claims.Any(claim =>
                (claim.Type == System.Security.Claims.ClaimTypes.Role || claim.Type == "role") &&
                string.Equals(claim.Value, "Employee", StringComparison.OrdinalIgnoreCase))));
});


// =====================================================
// BUILD APPLICATION
// =====================================================

var app = builder.Build();


// =====================================================
// DEVELOPMENT
// =====================================================

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}


// =====================================================
// HTTPS REDIRECTION
// =====================================================

app.UseHttpsRedirection();


// =====================================================
// AUTHENTICATION
// =====================================================

app.UseAuthentication();


// =====================================================
// AUTHORIZATION
// =====================================================

app.UseAuthorization();


// =====================================================
// CONTROLLERS
// =====================================================

app.MapControllers();


// =====================================================
// RUN
// =====================================================

app.Run();