import os
from pathlib import Path
import sys
import tempfile

import jwt
from fastapi.testclient import TestClient

TEST_TMP = Path(tempfile.gettempdir()) / "vxv-workspace-tests"
TEST_TMP.mkdir(parents=True, exist_ok=True)
DB_PATH = TEST_TMP / "test.db"
if DB_PATH.exists():
    DB_PATH.unlink()
os.environ["VXV_DB_PATH"] = str(DB_PATH)
os.environ["VXV_UPLOAD_DIR"] = str(TEST_TMP / "uploads")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.auth import OIDCVerifier


client = TestClient(app)


def auth_headers() -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "founder@vxv.network", "password": "vxv-demo"},
    )
    assert response.status_code == 200
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_bootstrap_includes_apps_and_skills() -> None:
    response = client.get("/api/bootstrap", headers=auth_headers())
    assert response.status_code == 200

    payload = response.json()
    assert "apps" in payload
    assert "skills" in payload
    assert any(item["title"] == "Pitch Deck Reviewer" for item in payload["apps"])


def test_artifact_patch_updates_content() -> None:
    headers = auth_headers()
    bootstrap = client.get("/api/bootstrap", headers=headers).json()
    artifact_id = bootstrap["artifacts"][0]["id"]

    response = client.patch(
        f"/api/artifacts/{artifact_id}",
        json={"content": "# Updated\n\nFounder-edited artifact body."},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["content"] == "# Updated\n\nFounder-edited artifact body."


def test_approval_endpoint_transitions_task() -> None:
    headers = auth_headers()
    bootstrap = client.get("/api/bootstrap", headers=headers).json()
    waiting_task = next(task for task in bootstrap["task_runs"] if task["requires_approval"])

    response = client.post(
        f"/api/task-runs/{waiting_task['id']}/approval",
        json={"decision": "approve"},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["task_run"]["status"] == "completed"
    assert payload["task_run"]["requires_approval"] is False


def test_launch_app_creates_run_and_artifact() -> None:
    headers = auth_headers()
    response = client.post(
        "/api/apps/app-pitch-reviewer/launch",
        json={"prompt": "Review the latest seed deck for investor readiness."},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["task_run"]["module"] == "apps"
    assert payload["artifact"]["module"] == "apps"
    assert payload["artifact"]["title"] == "Pitch Deck Reviewer Output"


def test_publish_investor_room_curates_selected_artifact() -> None:
    headers = auth_headers()
    bootstrap = client.get("/api/bootstrap", headers=headers).json()
    artifact_id = bootstrap["artifacts"][0]["id"]

    response = client.post(
        "/api/investor-room/publish",
        json={"artifact_id": artifact_id},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert artifact_id in payload["investor_room"]["curated_artifact_ids"]
    assert payload["message"] == "Investor room updated and ready to share."


def test_workspace_setup_goal_workflow_and_capital_mutations() -> None:
    headers = auth_headers()
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
        headers=headers,
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
        headers=headers,
    )
    assert goal_response.status_code == 200
    goal_id = goal_response.json()["id"]

    goal_update_response = client.patch(
        f"/api/goals/{goal_id}",
        json={"status": "In flight"},
        headers=headers,
    )
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
        headers=headers,
    )
    assert source_response.status_code == 200
    assert source_response.json()["title"] == "Founder call notes"

    workflow_response = client.post(
        "/api/workflows/wf-2/launch",
        json={"note": "Prepare the next Monday review with blockers and decisions."},
        headers=headers,
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
        headers=headers,
    )
    assert investor_response.status_code == 200
    investor_id = investor_response.json()["id"]

    investor_update_response = client.patch(
        f"/api/fundraise-pipeline/current/investors/{investor_id}",
        json={"relationship_status": "Meeting", "next_step": "Confirm partner meeting"},
        headers=headers,
    )
    assert investor_update_response.status_code == 200
    assert investor_update_response.json()["relationship_status"] == "Meeting"


def test_upload_endpoint_ingests_document() -> None:
    headers = auth_headers()
    response = client.post(
        "/api/uploads",
        headers=headers,
        files={"file": ("founder-notes.txt", b"Founder notes about GTM and investor priorities", "text/plain")},
        data={"module": "apps", "title": "Founder Notes"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["upload"]["storage_backend"] == "local"
    assert payload["knowledge_source"]["title"] == "Founder Notes"
    assert payload["artifact"]["module"] == "apps"

    uploads_response = client.get("/api/uploads", headers=headers)
    assert uploads_response.status_code == 200
    assert any(item["filename"] == "founder-notes.txt" for item in uploads_response.json())


def test_chat_executes_skill_flow_and_persists_nodes() -> None:
    headers = auth_headers()
    response = client.post(
        "/api/chat",
        headers=headers,
        json={
            "module": "capital",
            "message": "Review the latest pitch deck and prepare an investor update with diligence checklist.",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["reply"]["author"] == "FundraiseAgent"
    assert any(node["kind"] == "skill" for node in payload["nodes"])
    assert any(node["kind"] == "artifact" for node in payload["nodes"])
    assert any(item["kind"] in {"artifact", "knowledge", "goal", "workspace", "thread", "capital"} for item in payload["memory_hits"])

    bootstrap = client.get("/api/bootstrap", headers=headers).json()
    latest_assistant = [message for message in bootstrap["messages"] if message["role"] == "assistant"][-1]
    assert latest_assistant["nodes"]
    assert latest_assistant["memory_hits"]


def test_owner_can_create_workspace_user() -> None:
    headers = auth_headers()
    response = client.post(
        "/api/users",
        headers=headers,
        json={
            "email": "operator@vxv.network",
            "password": "temporary-password",
            "display_name": "Operator",
            "role": "member",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == "operator@vxv.network"

    users_response = client.get("/api/users", headers=headers)
    assert users_response.status_code == 200
    assert any(user["email"] == "operator@vxv.network" for user in users_response.json())

    update_response = client.patch(
        "/api/users/operator@vxv.network",
        headers=headers,
        json={
            "role": "investor",
            "status": "suspended",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "investor"
    assert update_response.json()["status"] == "suspended"


def test_oidc_verifier_accepts_shared_secret_tokens(monkeypatch) -> None:
    shared_secret = "top-secret-value-that-is-long-enough-for-hs256"
    monkeypatch.setenv("VXV_OIDC_SHARED_SECRET", shared_secret)
    monkeypatch.setenv("VXV_OIDC_ISSUER", "https://auth.example.com/")
    monkeypatch.setenv("VXV_OIDC_AUDIENCE", "vxv-workspace")
    token = jwt.encode(
        {
            "iss": "https://auth.example.com/",
            "aud": "vxv-workspace",
            "email": "sso-user@vxv.network",
            "name": "SSO User",
            "role": "member",
        },
        shared_secret,
        algorithm="HS256",
    )

    verifier = OIDCVerifier()
    identity = verifier.validate(token)

    assert identity is not None
    assert identity.email == "sso-user@vxv.network"
    assert identity.display_name == "SSO User"
    assert identity.role == "member"
