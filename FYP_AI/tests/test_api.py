from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PLAN = {
    "tasks": [{"taskId": "M", "orgId": 7, "kind": "Minimum", "needed": 1, "priority": 0, "requiredSkillIds": [], "allowBorrowed": False, "excludeEmpIds": []}],
    "candidates": [
        {"empId": 1, "ownerOrgId": 7, "pool": "Free", "rating": 4.0, "returning": False, "skills": []},
        {"empId": 2, "ownerOrgId": 8, "pool": "Free", "rating": 5.0, "returning": False, "skills": []},
    ],
    "weights": {"skill": 0.4, "rating": 0.25, "ownership": 0.15, "returning": 0.1, "idle": 0.1},
}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_plan_answers_in_the_backend_contract():
    response = client.post("/plan", json=PLAN)
    assert response.status_code == 200
    body = response.json()
    assert [a["empId"] for a in body["assignments"]] == [1]  # employee 2 belongs to another organization and borrowing is not allowed
    assert set(body["assignments"][0]) == {"taskId", "empId", "score", "reason", "breakdown", "alternatives"}
    assert body["unfilled"] == []


def test_key_is_checked_when_set(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "secret")
    assert client.post("/plan", json=PLAN).status_code == 401
    assert client.post("/plan", json=PLAN, headers={"X-AI-Key": "secret"}).status_code == 200
