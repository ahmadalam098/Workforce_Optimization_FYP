from app.planner import plan
from app.schemas import PlanCandidate, PlanRequest, PlanSkill, PlanTask


def candidate(emp_id, org, rating, skills=(), pool="Free", returning=False):
    return PlanCandidate(empId=emp_id, ownerOrgId=org, rating=rating, pool=pool, returning=returning,
                         skills=[PlanSkill(skillId=s, level=lvl, years=yrs) for s, lvl, yrs in skills])


def test_own_organization_and_better_skill_win():
    request = PlanRequest(
        tasks=[PlanTask(taskId="R1", orgId=1, kind="Request", needed=1, priority=2, requiredSkillIds=[7], allowBorrowed=True)],
        candidates=[
            candidate(1, 1, 4.0, [(7, 4, 8)]),
            candidate(2, 2, 5.0, [(7, 2, 1)]),
            candidate(3, 1, 5.0),
        ],
    )
    result = plan(request)
    assert [a.empId for a in result.assignments] == [1]
    assert result.assignments[0].alternatives[0].empId == 2  # employees with skill 7 come before employee 3, who lacks it
    assert not result.unfilled


def test_borrowing_not_allowed_leaves_the_task_unfilled():
    request = PlanRequest(
        tasks=[PlanTask(taskId="M", orgId=1, kind="Minimum", needed=2, priority=0, allowBorrowed=False)],
        candidates=[candidate(1, 1, 4.0), candidate(2, 2, 5.0)],
    )
    result = plan(request)
    assert len(result.assignments) == 1
    assert result.unfilled[0].missing == 1


def test_urgent_task_picks_first():
    request = PlanRequest(
        tasks=[
            PlanTask(taskId="low", orgId=1, kind="Request", needed=1, priority=4, allowBorrowed=True),
            PlanTask(taskId="urgent", orgId=1, kind="Request", needed=1, priority=1, allowBorrowed=True),
        ],
        candidates=[candidate(1, 1, 5.0)],
    )
    result = plan(request)
    assert result.assignments[0].taskId == "urgent"


def test_without_the_skill_only_when_nobody_has_it():
    request = PlanRequest(
        tasks=[PlanTask(taskId="R1", orgId=1, kind="Request", needed=1, priority=2, requiredSkillIds=[9], allowBorrowed=False)],
        candidates=[candidate(1, 1, 5.0)],
    )
    result = plan(request)
    assert [a.empId for a in result.assignments] == [1]
    assert "does not have the needed skill" in result.assignments[0].reason
