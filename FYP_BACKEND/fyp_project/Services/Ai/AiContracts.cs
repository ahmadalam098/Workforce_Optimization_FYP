namespace fyp_project.Services
{
    // The JSON contract between this backend and the planner (the built-in LocalPlanner or the FYP_AI Python service).
    // The planner only ADVISES: it gets the facts and returns who should go where. The backend checks every choice against the
    // contract rules and writes to the database; the planner never touches it. Field names are camelCase in the JSON.

    /// <summary>One skill of an employee. Level: 1 Beginner, 2 Intermediate, 3 Advanced, 4 Expert.</summary>
    public record PlanSkill(int SkillId, int Level, int Years);

    /// <summary>
    /// An employee who could be placed. Pool: "Free" (not allocated anywhere) or "Surplus" (works for the home organization, which has
    /// more employees than its contract minimum, so this one can be lent).
    /// </summary>
    public record PlanCandidate(int EmpId, int OwnerOrgId, string Pool, double Rating, bool Returning, List<PlanSkill> Skills);

    /// <summary>One thing to staff. Kind: Minimum / Request / Substitute. Priority: 0 is the most urgent.</summary>
    public record PlanTask(string TaskId, int OrgId, string Kind, int Needed, int Priority, List<int> RequiredSkillIds, bool AllowBorrowed, List<int> ExcludeEmpIds);

    /// <summary>How much each part counts in the 0-100 score.</summary>
    public record PlanWeights(double Skill, double Rating, double Ownership, double Returning, double Idle)
    {
        public static PlanWeights Default => new(0.40, 0.25, 0.15, 0.10, 0.10);
    }

    public record PlanRequest(List<PlanTask> Tasks, List<PlanCandidate> Candidates, PlanWeights Weights);

    public record PlanScore(int EmpId, double Score);

    /// <summary>Breakdown: the parts of the score, each 0-100.</summary>
    public record PlanAssignment(string TaskId, int EmpId, double Score, string Reason, Dictionary<string, double> Breakdown, List<PlanScore> Alternatives);

    public record PlanUnfilled(string TaskId, int Missing, string Why);

    public record PlanResponse(List<PlanAssignment> Assignments, List<PlanUnfilled> Unfilled);
}
