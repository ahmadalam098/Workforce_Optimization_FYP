using Microsoft.Data.SqlClient;

namespace fyp_project.Services
{
    /// <summary>
    /// Lets older screens keep working before a newer migration script has been run:
    /// when a table or column from a migration is missing, optional data falls back to an empty value.
    /// </summary>
    public static class SafeQuery
    {
        private const int InvalidObjectName = 208;
        private const int InvalidColumnName = 207;

        public static bool IsMissingSchema(Exception exception)
        {
            for (var ex = exception; ex != null; ex = ex.InnerException)
            {
                if (ex is SqlException sql && (sql.Number == InvalidObjectName || sql.Number == InvalidColumnName))
                    return true;
            }
            return false;
        }

        public static async Task<T> IfSchemaMissing<T>(Func<Task<T>> query, T fallback)
        {
            try
            {
                return await query();
            }
            catch (Exception ex) when (IsMissingSchema(ex))
            {
                return fallback;
            }
        }
    }
}
