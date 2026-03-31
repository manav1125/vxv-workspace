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


def test_publish_investor_room_curates_selected_artifact() -> None:
    bootstrap = client.get("/api/bootstrap").json()
    artifact_id = bootstrap["artifacts"][0]["id"]

    response = client.post(
        "/api/investor-room/publish",
        json={"artifact_id": artifact_id},
    )

    assert response.status_code == 200
    payload = response.json()
    assert artifact_id in payload["investor_room"]["curated_artifact_ids"]
    assert payload["message"] == "Investor room updated and ready to share."


def test_workspace_setup_goal_workflow_and_capital_mutations() -> None:
    workspace_response = client.patch(
        "/api/workspaces/current",
        json={
            "company_name": "VXV Labs",
            "founder_name": "Manav",
            "stage": "Founder OS Beta",
            "mission": "Unify the founder operating stack.",
            "primary_kpi": "Founder throughput",
            "summary": "Beta workspace with richer workflows.",
        },
    )
    assert workspace_response.status_code == 200
    assert workspace_response.json()["company_name"] == "VXV Labs"

    goal_response = client.post(
        "/api/goals",
        json={
            "title": "Stand up founder beta",
            "owner": "ChiefOfStaffAgent",
            "kpi": "Active beta founders",
            "due_date": "2026-07-01",
            "linked_agents": ["agent-chief"],
            "status": "Planned",
        },
    )
    assert goal_response.status_code == 200
    goal_id = goal_response.json()["id"]

    goal_update_response = client.patch(f"/api/goals/{goal_id}", json={"status": "In flight"})
    assert goal_update_response.status_code == 200
    assert goal_update_response.json()["status"] == "In flight"

    source_response = client.post(
        "/api/knowledge-sources",
        json={
            "title": "Founder call notes",
            "source_type": "notes",
            "status": "Connected",
            "freshness": "Today",
        },
    )
    assert source_response.status_code == 200
    assert source_response.json()["title"] == "Founder call notes"

    workflow_response = client.post(
        "/api/workflows/wf-2/launch",
        json={"note": "Prepare the next Monday review with blockers and decisions."},
    )
    assert workflow_response.status_code == 200
    assert workflow_response.json()["task_run"]["title"] == "Weekly founder review"

    investor_response = client.post(
        "/api/fundraise-pipeline/current/investors",
        json={
            "name": "Atlas Ventures",
            "thesis": "Founder tooling",
            "stage_fit": "Seed",
            "relationship_status": "Warm",
            "next_step": "Send investor room",
        },
    )
    assert investor_response.status_code == 200
    investor_id = investor_response.json()["id"]

    investor_update_response = client.patch(
        f"/api/fundraise-pipeline/current/investors/{investor_id}",
        json={"relationship_status": "Meeting", "next_step": "Confirm partner meeting"},
    )
    assert investor_update_response.status_code == 200
    assert investor_update_response.json()["relationship_status"] == "Meeting"
