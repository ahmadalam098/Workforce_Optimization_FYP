"""The planner. It does exactly what the backend's built-in planner (LocalPlanner.cs) does, so the result is the same with or without
this service. This is the place to add a smarter model later (for example OR-Tools for an optimal assignment, or a model that learns
from the managers' feedback): keep the same request and response and the backend does not change.

Every allowed (task, employee) pair gets a score from 0 to 100:
  skill (has the needed skill, how good, how many years) + rating + ownership (own organization first, then a free employee of another
  organization, a spare employee lent by another organization last) + worked for this organization recently + idle.
Then the pairs are taken best first, the most urgent task first; for a task that needs a skill, the employees who have it always come
before the ones who do not (those are taken only when nobody with the skill is free, and the reason says so).
Among equals the organization's own employees come before employees of other organizations, so nobody is borrowed while an own employee fits.
"""

from typing import Dict, List, Set, Tuple

from .schemas import (
    PlanAssignment,
    PlanCandidate,
    PlanRequest,
    PlanResponse,
    PlanScore,
    PlanTask,
    PlanUnfilled,
)

NEUTRAL_SKILL = 0.7
UNKNOWN_RATING = 0.6


def _level_weight(level: int) -> float:
    if level <= 1:
        return 0.4
    if level == 2:
        return 0.6
    if level == 3:
        return 0.8
    return 1.0


def _percent(value: float) -> float:
    return float(round(value * 100))


def _reason(task: PlanTask, candidate: PlanCandidate, skill: float, has_skill: bool) -> str:
    parts: List[str] = []
    if task.requiredSkillIds:
        parts.append(f"skill match {_percent(skill):.0f}%" if has_skill else "does not have the needed skill (nobody free has it)")
    if candidate.rating > 0:
        parts.append(f"rated {candidate.rating:.1f}/5")
    if candidate.ownerOrgId == task.orgId:
        parts.append("works for this organization")
    elif candidate.pool == "Surplus":
        parts.append("spare employee lent by another organization")
    else:
        parts.append("free employee of another organization")
    if candidate.returning:
        parts.append("worked here recently")
    return ", ".join(parts)


def plan(request: PlanRequest) -> PlanResponse:
    w = request.weights
    total = w.skill + w.rating + w.ownership + w.returning + w.idle
    if total <= 0:
        total = 1.0

    # (task, candidate, score, skill, rating, ownership, returning, idle, has_skill)
    pairs: List[Tuple[PlanTask, PlanCandidate, float, float, float, float, float, float, bool]] = []
    for task in request.tasks:
        for c in request.candidates:
            if c.empId in task.excludeEmpIds:
                continue
            if not task.allowBorrowed and c.ownerOrgId != task.orgId:
                continue
            by_skill = {s.skillId: s for s in c.skills}
            # An employee without the needed skill is still allowed, but only taken when nobody with the skill is free.
            has_skill = all(skill_id in by_skill for skill_id in task.requiredSkillIds)

            if not task.requiredSkillIds:
                skill = NEUTRAL_SKILL
            else:
                values = []
                for skill_id in task.requiredSkillIds:
                    s = by_skill.get(skill_id)
                    if s is None:
                        values.append(0.0)
                        continue
                    values.append(_level_weight(s.level) * 0.8 + min(max(s.years, 0), 10) / 10.0 * 0.2)
                skill = sum(values) / len(values)

            rating = min(c.rating, 5) / 5.0 if c.rating > 0 else UNKNOWN_RATING
            own = c.ownerOrgId == task.orgId
            ownership = 1.0 if own else (0.25 if c.pool == "Surplus" else 0.5)
            returning = 1.0 if c.returning else 0.0
            idle = 1.0 if c.pool == "Free" else 0.5

            score = 100 * (w.skill * skill + w.rating * rating + w.ownership * ownership + w.returning * returning + w.idle * idle) / total
            pairs.append((task, c, round(score, 2), skill, rating, ownership, returning, idle, has_skill))

    used: Set[int] = set()
    left: Dict[str, int] = {t.taskId: t.needed for t in request.tasks}
    assignments: List[PlanAssignment] = []

    for task, c, score, skill, rating, ownership, returning, idle, has_skill in sorted(pairs, key=lambda p: (p[0].priority, not p[8], p[1].ownerOrgId != p[0].orgId, -p[2], p[1].empId)):
        if left[task.taskId] <= 0 or c.empId in used:
            continue
        used.add(c.empId)
        left[task.taskId] -= 1

        others = sorted((p for p in pairs if p[0].taskId == task.taskId and p[1].empId != c.empId), key=lambda p: (not p[8], p[1].ownerOrgId != p[0].orgId, -p[2]))[:3]
        assignments.append(
            PlanAssignment(
                taskId=task.taskId,
                empId=c.empId,
                score=score,
                reason=_reason(task, c, skill, has_skill),
                breakdown={
                    "skill": _percent(skill),
                    "rating": _percent(rating),
                    "ownership": _percent(ownership),
                    "returning": _percent(returning),
                    "idle": _percent(idle),
                },
                alternatives=[PlanScore(empId=p[1].empId, score=p[2]) for p in others],
            )
        )

    unfilled: List[PlanUnfilled] = []
    for task in request.tasks:
        if left[task.taskId] > 0:
            if any(p[0].taskId == task.taskId for p in pairs):
                why = "not enough free employees."
            else:
                why = "nobody is free" + ("." if task.allowBorrowed else " (the contract does not allow borrowing).")
            unfilled.append(PlanUnfilled(taskId=task.taskId, missing=left[task.taskId], why=why))

    return PlanResponse(assignments=assignments, unfilled=unfilled)
