from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from pathlib import Path
from typing import Any, Optional

from .models import now_iso


class SqlitePersistence:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or os.getenv("VXV_DB_PATH", "/tmp/vxv-workspace.db")
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS workspace_state (
                    workspace_id TEXT PRIMARY KEY,
                    state_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS uploads (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    stored_path TEXT NOT NULL,
                    content_type TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )

            existing_user = connection.execute("SELECT email FROM users LIMIT 1").fetchone()
            if existing_user is None:
                email = os.getenv("VXV_ADMIN_EMAIL", "founder@vxv.network")
                password = os.getenv("VXV_ADMIN_PASSWORD", "vxv-demo")
                connection.execute(
                    """
                    INSERT INTO users (email, password_hash, workspace_id, display_name, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        email,
                        self._hash_password(password),
                        "workspace-vxv",
                        os.getenv("VXV_ADMIN_NAME", "Founder"),
                        now_iso(),
                    ),
                )

    def load_state(self, workspace_id: str) -> Optional[str]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT state_json FROM workspace_state WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()
            return None if row is None else str(row["state_json"])

    def save_state(self, workspace_id: str, state_json: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO workspace_state (workspace_id, state_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(workspace_id) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = excluded.updated_at
                """,
                (workspace_id, state_json, now_iso()),
            )

    def create_session(self, email: str, password: str) -> Optional[dict[str, str]]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT email, password_hash, workspace_id, display_name FROM users WHERE email = ?",
                (email,),
            ).fetchone()
            if row is None or not self._verify_password(str(row["password_hash"]), password):
                return None

            token = secrets.token_urlsafe(32)
            payload = {
                "token": token,
                "email": str(row["email"]),
                "workspace_id": str(row["workspace_id"]),
                "display_name": str(row["display_name"]),
            }
            connection.execute(
                """
                INSERT INTO sessions (token, email, workspace_id, display_name, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (token, payload["email"], payload["workspace_id"], payload["display_name"], now_iso()),
            )
            return payload

    def get_session(self, token: str) -> Optional[dict[str, str]]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT token, email, workspace_id, display_name FROM sessions WHERE token = ?",
                (token,),
            ).fetchone()
            if row is None:
                return None
            return {
                "token": str(row["token"]),
                "email": str(row["email"]),
                "workspace_id": str(row["workspace_id"]),
                "display_name": str(row["display_name"]),
            }

    def record_upload(
        self,
        *,
        upload_id: str,
        workspace_id: str,
        filename: str,
        stored_path: str,
        content_type: str | None,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO uploads (id, workspace_id, filename, stored_path, content_type, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (upload_id, workspace_id, filename, stored_path, content_type or "", now_iso()),
            )

    def _hash_password(self, password: str, salt: bytes | None = None) -> str:
        salt = salt or secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 390000)
        return f"{salt.hex()}:{digest.hex()}"

    def _verify_password(self, stored: str, password: str) -> bool:
        salt_hex, digest_hex = stored.split(":", 1)
        recomputed = self._hash_password(password, bytes.fromhex(salt_hex))
        return hmac.compare_digest(recomputed, stored)
