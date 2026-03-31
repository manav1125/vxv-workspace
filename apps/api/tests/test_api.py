from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


client = TestClient(app)


def test_bootstrap_includes_apps_and_skills() -> None:
    response = client.get("/api/bootstrap")
    assert response.status_code == 200

    payload = response.json()
    assert "apps" in payload
    assert "skills" in payload
    assert any(item["title"] == "Pitch Deck Reviewer" for item in payload["apps"])


def test_artifact_patch_updates_content() -> None:
    bootstrap = client.get("/api/bootstrap").json()
    artifact_id = bootstrap["artifacts"][0]["id"]

    response = client.patch(
        f"/api/artifacts/{artifact_id}",
        json={"content": "# Updated\n\nFounder-edited artifact body."},
    )

    assert response.status_code == 200
    assert response.json()["content"] == "# Updated\n\nFounder-edited artifact body."


def test_approval_endpoint_transitions_task() -> None:
    bootstrap = client.get("/api/bootstrap").json()
    waiting_task = next(task for task in bootstrap["task_runs"] if task["requires_approval"])

    response = client.post(
        f"/api/task-runs/{waiting_task['id']}/approval",
        json={"decision": "approve"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["task_run"]["status"] == "completed"
    assert payload["task_run"]["requires_approval"] is False


def test_launch_app_creates_run_and_artifact() -> None:
    response = client.post(
        "/api/apps/app-pitch-reviewer/launch",
        json={"prompt": "Review the latest seed deck for investor readiness."},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["task_run"]["module"] == "apps"
    assert payload["artifact"]["module"] == "apps"
    assert payload["artifact"]["title"] == "Pitch Deck Reviewer Output"
