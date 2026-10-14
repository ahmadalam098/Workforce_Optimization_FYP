using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>
    /// The primary keys in this database are plain INT columns (no IDENTITY), so new IDs are
    /// MAX(id) + 1. Hold <see cref="LockAsync"/> for the whole "read next id -> save" operation
    /// so two simultaneous requests can never pick the same id.
    /// </summary>
    public class IdGenerator
    {
        private static readonly SemaphoreSlim Gate = new(1, 1);

        public async Task<IDisposable> LockAsync()
        {
            await Gate.WaitAsync();
            return new Releaser();
        }

        // table/column always come from code constants, never from user input.
        public Task<int> NextAsync(WorkforceManagementDbContext context, string table, string column)
        {
            var sql = $"SELECT ISNULL(MAX([{column}]), 0) + 1 AS [Value] FROM [{table}]";
            return context.Database.SqlQueryRaw<int>(sql).SingleAsync();
        }

        private sealed class Releaser : IDisposable
        {
            private bool _released;

            public void Dispose()
            {
                if (_released) return;
                _released = true;
                Gate.Release();
            }
        }
    }
}
