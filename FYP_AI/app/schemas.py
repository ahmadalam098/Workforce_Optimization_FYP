"""The JSON contract between the .NET backend and this service (field names are camelCase on the wire).

The service only ADVISES: it gets the facts and answers who should go where. The backend checks every choice against the contract
rules and writes to the database; this service never touches the database.
"""

from typing import Dict, List

from pydantic import BaseModel, Field


class PlanSkill(BaseModel):
    skillId: int
    level: int = 2  # 1 Beginner, 2 Intermediate, 3 Advanced, 4 Expert
    years: int = 0


class PlanCandidate(BaseModel):
    empId: int
    ownerOrgId: int
    pool: str = "Free"  # "Free" (not allocated) or "Surplus" (spare employee of an organization that has more than its minimum)
    rating: float = 0
    returning: bool = False  # worked for this organization recently
    skills: List[PlanSkill] = Field(default_factory=list)


class PlanTask(BaseModel):
    taskId: str
    orgId: int
    kind: str  # Minimum / Request / Substitute
    needed: int
    priority: int = 3  # 0 is the most urgent
    requiredSkillIds: List[int] = Field(default_factory=list)
    allowBorrowed: bool = False
    excludeEmpIds: List[int] = Field(default_factory=list)


class PlanWeights(BaseModel):
    skill: float = 0.40
    rating: float = 0.25
    ownership: float = 0.15
    returning: float = 0.10
    idle: float = 0.10


class PlanRequest(BaseModel):
    tasks: List[PlanTask]
    candidates: List[PlanCandidate]
    weights: PlanWeights = Field(default_factory=PlanWeights)


class PlanScore(BaseModel):
    empId: int
    score: float


class PlanAssignment(BaseModel):
    taskId: str
    empId: int
    score: float
    reason: str
    breakdown: Dict[str, float]
    alternatives: List[PlanScore]


class PlanUnfilled(BaseModel):
    taskId: str
    missing: int
    why: str


class PlanResponse(BaseModel):
    assignments: List[PlanAssignment]
    unfilled: List[PlanUnfilled]
