"""Local-only plugin discovery and state storage for Infinite Canvas.

Plugin source lives in ``plugins/<id>/``. Runtime state deliberately lives in
``data/local/plugins/<id>/`` so accounts, browser profile ids and task history
cannot be committed with the plugin source.
"""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


class PluginRuntime:
    def __init__(self, plugins_dir: str, local_data_dir: str):
        self.plugins_dir = Path(plugins_dir)
        self.local_data_dir = Path(local_data_dir)

    def _manifest(self, path: Path) -> Dict[str, Any] | None:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        plugin_id = str(raw.get("id") or "").strip()
        if not PLUGIN_ID.fullmatch(plugin_id) or path.parent.name != plugin_id:
            return None
        if not isinstance(raw.get("capabilities"), list):
            return None
        raw["id"] = plugin_id
        raw["enabled"] = bool(raw.get("enabled", True))
        entry = str(raw.get("entry") or "").strip()
        raw["runtime_ready"] = bool(entry and (path.parent / entry).is_file())
        raw["source"] = "local-folder"
        return raw

    def plugins(self) -> List[Dict[str, Any]]:
        if not self.plugins_dir.exists():
            return []
        result = []
        for folder in sorted(self.plugins_dir.iterdir(), key=lambda item: item.name.lower()):
            manifest = self._manifest(folder / "plugin.json") if folder.is_dir() else None
            if manifest:
                result.append(manifest)
        return result

    def plugin(self, plugin_id: str) -> Dict[str, Any] | None:
        return next((item for item in self.plugins() if item["id"] == plugin_id), None)

    def _state_file(self, plugin_id: str, name: str) -> Path:
        if not PLUGIN_ID.fullmatch(plugin_id):
            raise ValueError("Invalid plugin id")
        folder = self.local_data_dir / plugin_id
        folder.mkdir(parents=True, exist_ok=True)
        return folder / name

    @staticmethod
    def _read(path: Path, default: Any) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return default

    @staticmethod
    def _write(path: Path, value: Any) -> None:
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(path)

    def accounts(self, plugin_id: str) -> List[Dict[str, Any]]:
        rows = self._read(self._state_file(plugin_id, "accounts.json"), [])
        return rows if isinstance(rows, list) else []

    def upsert_account(self, plugin_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        rows = self.accounts(plugin_id)
        account_id = str(payload.get("id") or uuid.uuid4().hex)
        now = int(time.time() * 1000)
        item = {
            "id": account_id,
            "label": str(payload.get("label") or "Untitled account").strip()[:120],
            "browserProfileId": str(payload.get("browserProfileId") or "").strip()[:180],
            "creditBalance": max(0, float(payload.get("creditBalance") or 0)),
            "reservedCredits": max(0, float(payload.get("reservedCredits") or 0)),
            "status": str(payload.get("status") or "unknown"),
            "lastSyncedAt": payload.get("lastSyncedAt") or 0,
            "updatedAt": now,
        }
        if not item["label"]:
            raise ValueError("Account label is required")
        for index, row in enumerate(rows):
            if row.get("id") == account_id:
                item["createdAt"] = row.get("createdAt", now)
                rows[index] = item
                break
        else:
            item["createdAt"] = now
            rows.append(item)
        self._write(self._state_file(plugin_id, "accounts.json"), rows)
        return item

    def jobs(self, plugin_id: str) -> List[Dict[str, Any]]:
        rows = self._read(self._state_file(plugin_id, "jobs.json"), [])
        return rows if isinstance(rows, list) else []

    def queue_job(self, plugin_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = int(time.time() * 1000)
        job = {
            "id": uuid.uuid4().hex,
            "pluginId": plugin_id,
            "accountId": str(payload.get("accountId") or ""),
            "model": str(payload.get("model") or ""),
            "kind": str(payload.get("kind") or "video"),
            "prompt": str(payload.get("prompt") or "")[:10000],
            "parameters": payload.get("parameters") if isinstance(payload.get("parameters"), dict) else {},
            "assets": payload.get("assets") if isinstance(payload.get("assets"), list) else [],
            "status": "queued",
            "createdAt": now,
            "updatedAt": now,
        }
        rows = self.jobs(plugin_id)
        rows.insert(0, job)
        self._write(self._state_file(plugin_id, "jobs.json"), rows[:500])
        return job

    def update_job(self, plugin_id: str, job_id: str, **changes: Any) -> Dict[str, Any] | None:
        rows = self.jobs(plugin_id)
        for index, row in enumerate(rows):
            if row.get("id") != job_id:
                continue
            updated = {**row, **changes, "updatedAt": int(time.time() * 1000)}
            rows[index] = updated
            self._write(self._state_file(plugin_id, "jobs.json"), rows[:500])
            return updated
        return None
