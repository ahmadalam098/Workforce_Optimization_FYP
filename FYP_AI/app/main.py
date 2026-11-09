"""FYP_AI: the planner service of the Smart Workforce Optimization system.

Run:   uvicorn app.main:app --port 8001
The backend (appsettings.json: Ai:PlannerUrl = http://localhost:8001) sends the facts to POST /plan and gets the advice back.
If AI_SERVICE_KEY is set, the backend must send the same value in the X-AI-Key header (appsettings.json: Ai:ServiceKey).
If this service is not running, the backend uses its built-in planner, so nothing breaks.
"""

import os
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException

from .planner import plan
from .schemas import PlanRequest, PlanResponse

app = FastAPI(title="Workforce AI planner", version="1.0")


def check_key(x_ai_key: Optional[str] = Header(default=None)) -> None:
    expected = os.getenv("AI_SERVICE_KEY", "").strip()
    if expected and x_ai_key != expected:
        raise HTTPException(status_code=401, detail="Wrong or missing X-AI-Key.")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "planner": "weighted-scoring", "version": app.version}


@app.post("/plan", response_model=PlanResponse, dependencies=[Depends(check_key)])
def make_plan(request: PlanRequest) -> PlanResponse:
    return plan(request)
