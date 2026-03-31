from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class StoredUpload:
    backend: str
    stored_path: str
    storage_url: Optional[str]


class UploadStorage:
    def __init__(self) -> None:
        self.mode = os.getenv("VXV_STORAGE_MODE", "local").strip().lower() or "local"

    def store(self, *, upload_id: str, filename: str, content: bytes, content_type: str | None) -> StoredUpload:
        if self.mode == "s3":
            return self._store_s3(
                upload_id=upload_id,
                filename=filename,
                content=content,
                content_type=content_type,
            )
        return self._store_local(upload_id=upload_id, filename=filename, content=content)

    def _store_local(self, *, upload_id: str, filename: str, content: bytes) -> StoredUpload:
        uploads_dir = Path(os.getenv("VXV_UPLOAD_DIR", "/tmp/vxv-uploads"))
        uploads_dir.mkdir(parents=True, exist_ok=True)
        safe_name = _safe_filename(filename)
        stored_path = uploads_dir / f"{upload_id}-{safe_name}"
        stored_path.write_bytes(content)
        public_base = os.getenv("VXV_UPLOAD_PUBLIC_BASE_URL", "").strip().rstrip("/")
        storage_url = f"{public_base}/{stored_path.name}" if public_base else None
        return StoredUpload(backend="local", stored_path=str(stored_path), storage_url=storage_url)

    def _store_s3(
        self,
        *,
        upload_id: str,
        filename: str,
        content: bytes,
        content_type: str | None,
    ) -> StoredUpload:
        import boto3

        bucket = os.getenv("VXV_S3_BUCKET", "").strip()
        if not bucket:
            raise RuntimeError("VXV_S3_BUCKET must be configured when VXV_STORAGE_MODE=s3")

        prefix = os.getenv("VXV_S3_PREFIX", "uploads").strip().strip("/")
        safe_name = _safe_filename(filename)
        object_key = "/".join(item for item in [prefix, f"{upload_id}-{safe_name}"] if item)
        client = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION") or os.getenv("VXV_S3_REGION"),
            endpoint_url=os.getenv("VXV_S3_ENDPOINT_URL"),
        )
        put_object_args = {
            "Bucket": bucket,
            "Key": object_key,
            "Body": content,
        }
        if content_type:
            put_object_args["ContentType"] = content_type
        client.put_object(**put_object_args)

        public_base = os.getenv("VXV_S3_PUBLIC_BASE_URL", "").strip().rstrip("/")
        storage_url = f"{public_base}/{object_key}" if public_base else f"s3://{bucket}/{object_key}"
        return StoredUpload(backend="s3", stored_path=object_key, storage_url=storage_url)


def _safe_filename(filename: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip("-") or "upload"
