from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from pathlib import Path
from typing import Optional

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from .models import now_iso


class PersistenceBackend:
    def __init__(self, database_url: Optional[str] = None) -> None:
        self.database_url = self._normalize_database_url(
            database_url or os.getenv("DATABASE_URL") or os.getenv("VXV_DB_PATH")
        )
        self.engine = create_engine(self.database_url, future=True)
        self._init_db()

    def _normalize_database_url(self, value: Optional[str]) -> str:
        if not value:
            path = "/tmp/vxv-workspace.db"
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            return f"sqlite:///{path}"
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        if value.startswith("sqlite:///") or value.startswith("postgresql+psycopg://"):
            return value
        path = str(Path(value))
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{path}"

    def _init_db(self) -> None:
        ddl = [
            """
            CREATE TABLE IF NOT EXISTS workspace_state (
                workspace_id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS uploads (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                storage_backend TEXT NOT NULL DEFAULT 'local',
                storage_url TEXT,
                content_type TEXT,
                created_at TEXT NOT NULL
            )
            """,
        ]
        with self.engine.begin() as connection:
            for statement in ddl:
                connection.execute(text(statement))
            self._ensure_column(connection, "users", "status", "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
            self._ensure_column(connection, "users", "last_login_at", "ALTER TABLE users ADD COLUMN last_login_at TEXT")
            self._ensure_column(
                connection,
                "uploads",
                "storage_backend",
                "ALTER TABLE uploads ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'local'",
            )
            self._ensure_column(connection, "uploads", "storage_url", "ALTER TABLE uploads ADD COLUMN storage_url TEXT")

            existing_user = connection.execute(text("SELECT email FROM users LIMIT 1")).mappings().first()
            if existing_user is None:
                connection.execute(
                    text(
                        """
                        INSERT INTO users (email, password_hash, workspace_id, display_name, role, status, created_at)
                        VALUES (:email, :password_hash, :workspace_id, :display_name, :role, :status, :created_at)
                        """
                    ),
                    {
                        "email": os.getenv("VXV_ADMIN_EMAIL", "founder@vxv.network"),
                        "password_hash": self._hash_password(os.getenv("VXV_ADMIN_PASSWORD", "vxv-demo")),
                        "workspace_id": "workspace-vxv",
                        "display_name": os.getenv("VXV_ADMIN_NAME", "Founder"),
                        "role": "owner",
                        "status": "active",
                        "created_at": now_iso(),
                    },
                )

    def _ensure_column(self, connection, table_name: str, column_name: str, ddl: str) -> None:
        columns = {column["name"] for column in inspect(connection).get_columns(table_name)}
        if column_name not in columns:
            connection.execute(text(ddl))

    def load_state(self, workspace_id: str) -> Optional[str]:
        with self.engine.begin() as connection:
            row = connection.execute(
                text("SELECT state_json FROM workspace_state WHERE workspace_id = :workspace_id"),
                {"workspace_id": workspace_id},
            ).mappings().first()
            return None if row is None else str(row["state_json"])

    def save_state(self, workspace_id: str, state_json: str) -> None:
        with self.engine.begin() as connection:
            updated_at = now_iso()
            exists = connection.execute(
                text("SELECT workspace_id FROM workspace_state WHERE workspace_id = :workspace_id"),
                {"workspace_id": workspace_id},
            ).mappings().first()
            if exists is None:
                connection.execute(
                    text(
                        """
                        INSERT INTO workspace_state (workspace_id, state_json, updated_at)
                        VALUES (:workspace_id, :state_json, :updated_at)
                        """
                    ),
                    {
                        "workspace_id": workspace_id,
                        "state_json": state_json,
                        "updated_at": updated_at,
                    },
                )
            else:
                connection.execute(
                    text(
                        """
                        UPDATE workspace_state
                        SET state_json = :state_json, updated_at = :updated_at
                        WHERE workspace_id = :workspace_id
                        """
                    ),
                    {
                        "workspace_id": workspace_id,
                        "state_json": state_json,
                        "updated_at": updated_at,
                    },
                )

    def create_user(
        self,
        *,
        email: str,
        password: str,
        workspace_id: str,
        display_name: str,
        role: str,
        status: str = "active",
    ) -> dict[str, str]:
        email = email.lower()
        payload = {
            "email": email,
            "password_hash": self._hash_password(password),
            "workspace_id": workspace_id,
            "display_name": display_name,
            "role": role,
            "status": status,
            "created_at": now_iso(),
        }
        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO users (email, password_hash, workspace_id, display_name, role, status, created_at)
                    VALUES (:email, :password_hash, :workspace_id, :display_name, :role, :status, :created_at)
                    """
                ),
                payload,
            )
        return {
            "email": email,
            "workspace_id": workspace_id,
            "display_name": display_name,
            "role": role,
            "status": status,
        }

    def list_users(self, workspace_id: str) -> list[dict[str, str]]:
        with self.engine.begin() as connection:
            rows = connection.execute(
                text(
                    """
                    SELECT email, workspace_id, display_name, role, status, created_at, last_login_at
                    FROM users
                    WHERE workspace_id = :workspace_id
                    ORDER BY created_at ASC
                    """
                ),
                {"workspace_id": workspace_id},
            ).mappings().all()
            return [dict(row) for row in rows]

    def get_user_by_email(self, email: str) -> Optional[dict[str, str]]:
        email = email.lower()
        with self.engine.begin() as connection:
            row = connection.execute(
                text(
                    """
                    SELECT email, password_hash, workspace_id, display_name, role, status, last_login_at
                    FROM users
                    WHERE email = :email
                    """
                ),
                {"email": email},
            ).mappings().first()
            return None if row is None else dict(row)

    def ensure_user(self, *, email: str, workspace_id: str, display_name: str, role: str) -> dict[str, str]:
        email = email.lower()
        existing = self.get_user_by_email(email)
        if existing is None:
            return self.create_user(
                email=email,
                password=secrets.token_urlsafe(18),
                workspace_id=workspace_id,
                display_name=display_name,
                role=role,
                status="active",
            )

        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    UPDATE users
                    SET display_name = :display_name, role = :role, status = :status
                    WHERE email = :email
                    """
                ),
                {
                    "email": email,
                    "display_name": display_name,
                    "role": role,
                    "status": existing.get("status") or "active",
                },
            )
        return {
            "email": email,
            "workspace_id": str(existing["workspace_id"]),
            "display_name": display_name,
            "role": role,
            "status": str(existing.get("status") or "active"),
            "created_at": existing.get("created_at"),
            "last_login_at": existing.get("last_login_at"),
        }

    def update_user(
        self,
        *,
        email: str,
        workspace_id: str,
        display_name: Optional[str] = None,
        role: Optional[str] = None,
        status: Optional[str] = None,
        password: Optional[str] = None,
    ) -> dict[str, str]:
        email = email.lower()
        existing = self.get_user_by_email(email)
        if existing is None or str(existing["workspace_id"]) != workspace_id:
            raise KeyError(f"Unknown workspace user: {email}")

        updated = {
            "display_name": display_name or str(existing["display_name"]),
            "role": role or str(existing["role"]),
            "status": status or str(existing.get("status") or "active"),
            "password_hash": self._hash_password(password) if password else str(existing["password_hash"]),
            "email": email,
        }
        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    UPDATE users
                    SET display_name = :display_name,
                        role = :role,
                        status = :status,
                        password_hash = :password_hash
                    WHERE email = :email
                    """
                ),
                updated,
            )
        return {
            "email": email,
            "workspace_id": workspace_id,
            "display_name": updated["display_name"],
            "role": updated["role"],
            "status": updated["status"],
            "created_at": existing.get("created_at"),
            "last_login_at": existing.get("last_login_at"),
        }

    def create_session(self, email: str, password: str) -> Optional[dict[str, str]]:
        email = email.lower()
        row = self.get_user_by_email(email)
        if row is None or str(row.get("status") or "active") != "active":
            return None
        if not self._verify_password(str(row["password_hash"]), password):
            return None
        return self._persist_session(
            email=str(row["email"]),
            workspace_id=str(row["workspace_id"]),
            display_name=str(row["display_name"]),
            role=str(row["role"]),
        )

    def create_trusted_session(self, email: str, display_name: str, workspace_id: str, role: str) -> dict[str, str]:
        email = email.lower()
        self.ensure_user(
            email=email,
            workspace_id=workspace_id,
            display_name=display_name,
            role=role,
        )
        return self._persist_session(
            email=email,
            workspace_id=workspace_id,
            display_name=display_name,
            role=role,
        )

    def _persist_session(self, *, email: str, workspace_id: str, display_name: str, role: str) -> dict[str, str]:
        token = secrets.token_urlsafe(32)
        payload = {
            "token": token,
            "email": email,
            "workspace_id": workspace_id,
            "display_name": display_name,
            "role": role,
            "created_at": now_iso(),
        }
        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO sessions (token, email, workspace_id, display_name, role, created_at)
                    VALUES (:token, :email, :workspace_id, :display_name, :role, :created_at)
                    """
                ),
                payload,
            )
            connection.execute(
                text(
                    """
                    UPDATE users
                    SET last_login_at = :last_login_at
                    WHERE email = :email
                    """
                ),
                {
                    "email": email,
                    "last_login_at": payload["created_at"],
                },
            )
        return {
            "token": token,
            "email": email,
            "workspace_id": workspace_id,
            "display_name": display_name,
            "role": role,
        }

    def get_session(self, token: str) -> Optional[dict[str, str]]:
        with self.engine.begin() as connection:
            row = connection.execute(
                text(
                    """
                    SELECT token, email, workspace_id, display_name, role
                    FROM sessions
                    WHERE token = :token
                    """
                ),
                {"token": token},
            ).mappings().first()
            return None if row is None else dict(row)

    def record_upload(
        self,
        *,
        upload_id: str,
        workspace_id: str,
        filename: str,
        stored_path: str,
        storage_backend: str,
        storage_url: str | None,
        content_type: str | None,
    ) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO uploads (
                        id,
                        workspace_id,
                        filename,
                        stored_path,
                        storage_backend,
                        storage_url,
                        content_type,
                        created_at
                    )
                    VALUES (
                        :id,
                        :workspace_id,
                        :filename,
                        :stored_path,
                        :storage_backend,
                        :storage_url,
                        :content_type,
                        :created_at
                    )
                    """
                ),
                {
                    "id": upload_id,
                    "workspace_id": workspace_id,
                    "filename": filename,
                    "stored_path": stored_path,
                    "storage_backend": storage_backend,
                    "storage_url": storage_url,
                    "content_type": content_type or "",
                    "created_at": now_iso(),
                },
            )

    def list_uploads(self, workspace_id: str) -> list[dict[str, str]]:
        with self.engine.begin() as connection:
            rows = connection.execute(
                text(
                    """
                    SELECT id, workspace_id, filename, stored_path, storage_backend, storage_url, content_type, created_at
                    FROM uploads
                    WHERE workspace_id = :workspace_id
                    ORDER BY created_at DESC
                    """
                ),
                {"workspace_id": workspace_id},
            ).mappings().all()
            return [dict(row) for row in rows]

    def _hash_password(self, password: str, salt: bytes | None = None) -> str:
        salt = salt or secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 390000)
        return f"{salt.hex()}:{digest.hex()}"

    def _verify_password(self, stored: str, password: str) -> bool:
        salt_hex, _ = stored.split(":", 1)
        recomputed = self._hash_password(password, bytes.fromhex(salt_hex))
        return hmac.compare_digest(recomputed, stored)

    @property
    def backend_label(self) -> str:
        return "postgres" if self.database_url.startswith("postgresql+psycopg://") else "sqlite"
