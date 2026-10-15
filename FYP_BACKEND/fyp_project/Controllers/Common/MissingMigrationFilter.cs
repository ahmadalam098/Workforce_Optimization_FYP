using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Data.SqlClient;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// If a table or column from a FYP_DB/migrations script is missing, return a clear 503 message
    /// instead of a generic 500, so it is obvious which script still has to be run.
    /// </summary>
    public class MissingMigrationFilterAttribute : ExceptionFilterAttribute
    {
        private const int InvalidObjectName = 208;
        private const int InvalidColumnName = 207;

        public override void OnException(ExceptionContext context)
        {
            for (var ex = context.Exception; ex != null; ex = ex.InnerException)
            {
                if (ex is SqlException sql && (sql.Number == InvalidObjectName || sql.Number == InvalidColumnName))
                {
                    context.Result = new ObjectResult(new
                    {
                        message = "The database is missing tables for this feature. Ask the database owner to run all the SQL scripts in FYP_DB/migrations (in file-name order), then try again.",
                    })
                    { StatusCode = StatusCodes.Status503ServiceUnavailable };
                    context.ExceptionHandled = true;
                    return;
                }
            }
        }
    }
}
