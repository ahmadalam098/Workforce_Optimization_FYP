using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers
{
    /// <summary>
    /// Profile pictures for every role (admin, manager, organization, employee).
    /// The file is saved in the uploads folder next to the backend; the User table keeps only its location.
    /// Anyone signed in can see a picture; a user changes their own, and an admin can change anyone's.
    /// </summary>
    [ApiController]
    [Authorize]
    [MissingMigrationFilter]
    [Route("api/profile/picture")]
    public class ProfilePictureController : ControllerBase
    {
        private const int MaxBytes = 2 * 1024 * 1024;
        private const string Folder = "profile-pictures";

        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly string _root;

        public ProfilePictureController(WorkforceManagementDbContext db, AuditService audit, IWebHostEnvironment environment)
        {
            _db = db;
            _audit = audit;
            _root = Path.Combine(environment.ContentRootPath, "uploads");
        }

        private int? CurrentUserId
        {
            get
            {
                var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                            ?? User.FindFirst("nameid")?.Value
                            ?? User.FindFirst("sub")?.Value;
                return int.TryParse(value, out var id) ? id : null;
            }
        }

        private async Task<bool> CanChangeAsync(int userId)
        {
            var me = CurrentUserId;
            if (me == null) return false;
            if (me == userId) return true;
            return await _db.Users.AnyAsync(u => u.UserId == me && u.IsActive == true && u.Role != null && u.Role.RoleType == "Admin");
        }

        /// <summary>The file extension for an image, found from its first bytes (the file name and the browser's type are not trusted).</summary>
        private static string? DetectExtension(byte[] bytes)
        {
            if (bytes.Length > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) return ".jpg";
            if (bytes.Length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) return ".png";
            if (bytes.Length > 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F' &&
                bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') return ".webp";
            return null;
        }

        private static string ContentTypeOf(string path) => Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg",
        };

        /// <summary>The full path of a stored picture, only when it really is inside the uploads folder.</summary>
        private string? FullPath(string? stored)
        {
            if (string.IsNullOrWhiteSpace(stored)) return null;
            var full = Path.GetFullPath(Path.Combine(_root, stored));
            return full.StartsWith(Path.GetFullPath(_root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ? full : null;
        }

        private void DeleteFile(string? stored)
        {
            var full = FullPath(stored);
            try
            {
                if (full != null && System.IO.File.Exists(full)) System.IO.File.Delete(full);
            }
            catch (IOException)
            {
                // An old file that cannot be removed right now is harmless; it is no longer referenced.
            }
        }

        // GET api/profile/picture/5   (404 when the user has none)
        [HttpGet("{userId:int}")]
        public async Task<IActionResult> Get(int userId)
        {
            var stored = await _db.Users.AsNoTracking().Where(u => u.UserId == userId).Select(u => u.ProfilePicturePath).FirstOrDefaultAsync();
            var full = FullPath(stored);
            if (full == null || !System.IO.File.Exists(full)) return NotFound();

            // The file name changes with every new picture, so it is a safe cache key.
            var etag = $"\"{Path.GetFileNameWithoutExtension(full)}\"";
            Response.Headers.CacheControl = "private, no-cache";
            Response.Headers.ETag = etag;
            if (Request.Headers.IfNoneMatch.ToString() == etag) return StatusCode(StatusCodes.Status304NotModified);

            return PhysicalFile(full, ContentTypeOf(full));
        }

        // PUT api/profile/picture/5   (multipart form, field "file")
        [HttpPut("{userId:int}")]
        [RequestSizeLimit(MaxBytes + 100_000)]
        public async Task<IActionResult> Put(int userId, IFormFile? file)
        {
            if (!await CanChangeAsync(userId)) return Forbid();
            if (file == null || file.Length == 0) return BadRequest(new { message = "Choose a picture first." });
            if (file.Length > MaxBytes) return BadRequest(new { message = "The picture is too big. Use one under 2 MB." });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null) return NotFound(new { message = "User not found." });

            using var stream = new MemoryStream();
            await file.CopyToAsync(stream);
            var bytes = stream.ToArray();

            var extension = DetectExtension(bytes);
            if (extension == null) return BadRequest(new { message = "Use a JPG, PNG or WebP picture." });

            Directory.CreateDirectory(Path.Combine(_root, Folder));
            var stored = $"{Folder}/{userId}-{Guid.NewGuid():N}{extension}";
            await System.IO.File.WriteAllBytesAsync(Path.Combine(_root, stored), bytes);

            var previous = user.ProfilePicturePath;
            user.ProfilePicturePath = stored;
            await _db.SaveChangesAsync();
            DeleteFile(previous);

            if (CurrentUserId != userId)
                await _audit.LogAsync(CurrentUserId, "PROFILE_PICTURE_CHANGED", "User", userId, "Picture set by an admin");
            return Ok(new { message = "Picture saved.", version = DateTime.UtcNow.Ticks });
        }

        // DELETE api/profile/picture/5
        [HttpDelete("{userId:int}")]
        public async Task<IActionResult> Delete(int userId)
        {
            if (!await CanChangeAsync(userId)) return Forbid();

            var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            if (user?.ProfilePicturePath == null) return Ok(new { message = "There was no picture." });

            var previous = user.ProfilePicturePath;
            user.ProfilePicturePath = null;
            await _db.SaveChangesAsync();
            DeleteFile(previous);

            if (CurrentUserId != userId)
                await _audit.LogAsync(CurrentUserId, "PROFILE_PICTURE_REMOVED", "User", userId, "Picture removed by an admin");
            return Ok(new { message = "Picture removed." });
        }
    }
}
