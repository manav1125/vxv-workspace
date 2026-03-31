from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Optional
from urllib.request import Request, urlopen

import jwt
from jwt import InvalidTokenError
from jwt.algorithms import RSAAlgorithm


@dataclass
class ExternalIdentity:
    token: str
    email: str
    display_name: str
    workspace_id: str
    role: str


class OIDCVerifier:
    def __init__(self) -> None:
        self.issuer = os.getenv("VXV_OIDC_ISSUER", "").strip()
        self.audience = os.getenv("VXV_OIDC_AUDIENCE", "").strip()
        self.jwks_url = os.getenv("VXV_OIDC_JWKS_URL", "").strip()
        self.jwks_json = os.getenv("VXV_OIDC_JWKS_JSON", "").strip()
        self.shared_secret = os.getenv("VXV_OIDC_SHARED_SECRET", "").strip()
        self.workspace_id = os.getenv("VXV_WORKSPACE_ID", "workspace-vxv").strip() or "workspace-vxv"
        self.email_claim = os.getenv("VXV_OIDC_EMAIL_CLAIM", "email").strip() or "email"
        self.name_claim = os.getenv("VXV_OIDC_NAME_CLAIM", "name").strip() or "name"
        self.role_claim = os.getenv("VXV_OIDC_ROLE_CLAIM", "role").strip() or "role"
        self.default_role = os.getenv("VXV_OIDC_DEFAULT_ROLE", "member").strip() or "member"
        self.cache_ttl = max(60, int(os.getenv("VXV_OIDC_JWKS_CACHE_TTL", "300")))
        self._cached_jwks: Optional[dict[str, Any]] = None
        self._cached_at = 0.0

    def validate(self, token: str) -> Optional[ExternalIdentity]:
        if not token:
            return None

        try:
            claims = self._decode(token)
        except InvalidTokenError:
            return None

        email = self._claim_value(claims, self.email_claim)
        if not isinstance(email, str) or not email.strip():
            return None

        display_name = self._claim_value(claims, self.name_claim)
        if not isinstance(display_name, str) or not display_name.strip():
            display_name = email.split("@", 1)[0].replace(".", " ").title()

        role_value = self._claim_value(claims, self.role_claim)
        role = self.default_role
        if isinstance(role_value, str) and role_value.strip():
            role = role_value.strip()
        elif isinstance(role_value, list):
            first_role = next((item for item in role_value if isinstance(item, str) and item.strip()), None)
            if first_role:
                role = first_role.strip()

        return ExternalIdentity(
            token=token,
            email=email.strip().lower(),
            display_name=display_name.strip(),
            workspace_id=self.workspace_id,
            role=role,
        )

    def _decode(self, token: str) -> dict[str, Any]:
        if self.shared_secret:
            return self._decode_with_shared_secret(token)
        return self._decode_with_jwks(token)

    def _decode_with_shared_secret(self, token: str) -> dict[str, Any]:
        options: dict[str, bool] = {"verify_aud": bool(self.audience)}
        return jwt.decode(
            token,
            self.shared_secret,
            algorithms=["HS256", "HS384", "HS512"],
            audience=self.audience or None,
            issuer=self.issuer or None,
            options=options,
        )

    def _decode_with_jwks(self, token: str) -> dict[str, Any]:
        if not self.jwks_json and not self.jwks_url:
            raise InvalidTokenError("OIDC verification requires VXV_OIDC_JWKS_URL or VXV_OIDC_JWKS_JSON")

        header = jwt.get_unverified_header(token)
        key_id = header.get("kid")
        jwks = self._jwks()
        keys = jwks.get("keys", [])
        if not isinstance(keys, list) or not keys:
            raise InvalidTokenError("OIDC JWKS has no keys")

        jwk = None
        if key_id:
            jwk = next((item for item in keys if item.get("kid") == key_id), None)
        if jwk is None:
            jwk = keys[0]

        public_key = RSAAlgorithm.from_jwk(json.dumps(jwk))
        options: dict[str, bool] = {"verify_aud": bool(self.audience)}
        return jwt.decode(
            token,
            public_key,
            algorithms=[header.get("alg", "RS256")],
            audience=self.audience or None,
            issuer=self.issuer or None,
            options=options,
        )

    def _jwks(self) -> dict[str, Any]:
        if self.jwks_json:
            return json.loads(self.jwks_json)

        now = time.time()
        if self._cached_jwks and now - self._cached_at < self.cache_ttl:
            return self._cached_jwks

        request = Request(self.jwks_url, headers={"User-Agent": "VXV-Workspace/1.0"})
        with urlopen(request, timeout=5) as response:  # noqa: S310
            payload = json.loads(response.read().decode("utf-8"))

        self._cached_jwks = payload
        self._cached_at = now
        return payload

    def _claim_value(self, claims: dict[str, Any], path: str) -> Any:
        current: Any = claims
        for segment in [item for item in path.split(".") if item]:
            if not isinstance(current, dict):
                return None
            current = current.get(segment)
        return current
