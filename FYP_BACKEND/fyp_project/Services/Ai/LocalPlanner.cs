namespace fyp_project.Services
{
    /// <summary>
    /// The built-in planner. Every (task, employee) pair that is allowed gets a score from 0 to 100:
    ///   skill (does the employee have the needed skill, how good, how many years) + rating + ownership (own organization first, then a free
    ///   employee of another organization, a spare employee lent by another organization last) + worked on this contract recently + idle.
    /// Then the pairs are taken best first, the most urgent task first; for a task that needs a skill, the employees who have it always come
    /// before the ones who do not (those are taken only when nobody with the skill is free, and the reason says so). The FYP_AI Python service does exactly the same, so the result is
    /// the same with or without it; the service is where a smarter model (OR-Tools, learning from the managers' feedback) can be added.
    /// </summary>
    public static class LocalPlanner
    {
        public const string Name = "Built-in";
        private const double NeutralSkill = 0.7;
        private const double UnknownRating = 0.6;

        private record Pair(PlanTask Task, PlanCandidate Candidate, bool HasSkill, double Score, double Skill, double Rating, double Ownership, double Returning, double Idle);

        public static PlanResponse Plan(PlanRequest request)
        {
            var w = request.Weights ?? PlanWeights.Default;
            var total = w.Skill + w.Rating + w.Ownership + w.Returning + w.Idle;
            if (total <= 0) total = 1;

            var pairs = new List<Pair>();
            foreach (var task in request.Tasks)
            {
                foreach (var c in request.Candidates)
                {
                    if (task.ExcludeEmpIds.Contains(c.EmpId)) continue;
                    if (!task.AllowBorrowed && c.OwnerOrgId != task.OrgId) continue;
                    // An employee without the needed skill is still allowed, but only taken when nobody with the skill is free.
                    var hasSkill = task.RequiredSkillIds.All(id => c.Skills.Any(s => s.SkillId == id));

                    var skill = task.RequiredSkillIds.Count == 0
                        ? NeutralSkill
                        : task.RequiredSkillIds.Average(id =>
                        {
                            var s = c.Skills.FirstOrDefault(x => x.SkillId == id);
                            if (s == null) return 0.0;
                            return LevelWeight(s.Level) * 0.8 + Math.Min(Math.Max(s.Years, 0), 10) / 10.0 * 0.2;
                        });
                    var rating = c.Rating > 0 ? Math.Min(c.Rating, 5) / 5.0 : UnknownRating;
                    var own = c.OwnerOrgId == task.OrgId;
                    var ownership = own ? 1.0 : c.Pool == "Surplus" ? 0.25 : 0.5;
                    var returning = c.Returning ? 1.0 : 0.0;
                    var idle = c.Pool == "Free" ? 1.0 : 0.5;

                    var score = 100 * (w.Skill * skill + w.Rating * rating + w.Ownership * ownership + w.Returning * returning + w.Idle * idle) / total;
                    pairs.Add(new Pair(task, c, hasSkill, Math.Round(score, 2), skill, rating, ownership, returning, idle));
                }
            }

            var used = new HashSet<int>();
            var left = request.Tasks.ToDictionary(t => t.TaskId, t => t.Needed);
            var assignments = new List<PlanAssignment>();

            foreach (var pair in pairs.OrderBy(p => p.Task.Priority).ThenByDescending(p => p.HasSkill).ThenByDescending(p => p.Score).ThenBy(p => p.Candidate.EmpId))
            {
                if (left[pair.Task.TaskId] <= 0 || used.Contains(pair.Candidate.EmpId)) continue;
                used.Add(pair.Candidate.EmpId);
                left[pair.Task.TaskId]--;

                var others = pairs.Where(p => p.Task.TaskId == pair.Task.TaskId && p.Candidate.EmpId != pair.Candidate.EmpId)
                    .OrderByDescending(p => p.HasSkill).ThenByDescending(p => p.Score).Take(3).Select(p => new PlanScore(p.Candidate.EmpId, p.Score)).ToList();

                assignments.Add(new PlanAssignment(pair.Task.TaskId, pair.Candidate.EmpId, pair.Score, Reason(pair), new Dictionary<string, double>
                {
                    ["skill"] = Percent(pair.Skill),
                    ["rating"] = Percent(pair.Rating),
                    ["ownership"] = Percent(pair.Ownership),
                    ["returning"] = Percent(pair.Returning),
                    ["idle"] = Percent(pair.Idle),
                }, others));
            }

            var unfilled = request.Tasks.Where(t => left[t.TaskId] > 0)
                .Select(t => new PlanUnfilled(t.TaskId, left[t.TaskId], pairs.Any(p => p.Task.TaskId == t.TaskId)
                    ? "not enough free employees."
                    : "nobody is free" + (t.AllowBorrowed ? "." : " (the contract does not allow borrowing).")))
                .ToList();

            return new PlanResponse(assignments, unfilled);
        }

        private static double LevelWeight(int level) => level switch { <= 1 => 0.4, 2 => 0.6, 3 => 0.8, _ => 1.0 };

        private static double Percent(double value) => Math.Round(value * 100, 0);

        private static string Reason(Pair p)
        {
            var parts = new List<string>();
            if (p.Task.RequiredSkillIds.Count > 0)
                parts.Add(p.HasSkill ? $"skill match {Percent(p.Skill)}%" : "does not have the needed skill (nobody free has it)");
            if (p.Candidate.Rating > 0) parts.Add($"rated {p.Candidate.Rating:0.0}/5");
            parts.Add(p.Candidate.OwnerOrgId == p.Task.OrgId ? "works for this organization"
                : p.Candidate.Pool == "Surplus" ? "spare employee lent by another organization" : "free employee of another organization");
            if (p.Candidate.Returning) parts.Add("worked here recently");
            return string.Join(", ", parts);
        }
    }
}
