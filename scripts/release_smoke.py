from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


BASE = "http://127.0.0.1:3000"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VERSION = (PROJECT_ROOT / "VERSION").read_text(encoding="utf-8").strip()
REPORT = Path(os.environ.get(
    "HUAHAI_RELEASE_SMOKE_REPORT",
    PROJECT_ROOT / "docs" / "screenshots" / EXPECTED_VERSION / "release-smoke.json",
))


def request(path: str, method: str = "GET", payload: dict | None = None) -> tuple[int, bytes, dict[str, str]]:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(f"{BASE}{path}", data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, response.read(), dict(response.headers.items())
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(), dict(exc.headers.items())


def request_json(path: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict]:
    status, raw, _ = request(path, method, payload)
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        data = {}
    return status, data


def main() -> int:
    checks: list[dict] = []
    project_id = ""
    canvas_id = ""

    def check(name: str, passed: bool, detail: str = "") -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    try:
        status, info = request_json("/api/app-info")
        check(
            "app-info",
            status == 200
            and info.get("brand") == "花海画布"
            and info.get("version") == EXPECTED_VERSION
            and "xy2446522127-code/miora-studio" in str(info.get("project_repo_url", "")),
            f"status={status}, version={info.get('version', '')}",
        )

        for path in ("/", "/static/home.html", "/static/canvas-list.html", "/static/smart-canvas.html", "/static/plugin-center.html"):
            page_status, _, _ = request(path)
            check(f"page:{path}", page_status == 200, f"status={page_status}")

        manual_status, manual, headers = request("/static/downloads/%E8%8A%B1%E6%B5%B7%E7%94%BB%E5%B8%83-AI%E6%8F%92%E4%BB%B6%E5%88%B6%E4%BD%9C%E8%AF%B4%E6%98%8E%E4%B9%A6.txt")
        check(
            "plugin-manual",
            manual_status == 200 and len(manual) > 800 and b"plugin.json" in manual,
            f"status={manual_status}, bytes={len(manual)}, type={headers.get('Content-Type', '')}",
        )

        plugin_status, plugin_data = request_json("/api/plugins")
        plugin_ids = {str(item.get("id", "")) for item in plugin_data.get("plugins", [])}
        check(
            "plugins",
            plugin_status == 200 and {"gemini-creator", "gpt-creator"}.issubset(plugin_ids),
            f"status={plugin_status}, count={len(plugin_ids)}",
        )

        status, created_project = request_json("/api/projects", "POST", {"name": f"QA release {int(time.time())}"})
        project_id = str(created_project.get("project", {}).get("id", ""))
        check("project-create", status == 200 and bool(project_id), f"status={status}")

        status, created_canvas = request_json(
            "/api/canvases",
            "POST",
            {"title": "QA release canvas", "icon": "layers", "kind": "smart", "project": project_id or "default"},
        )
        canvas_id = str(created_canvas.get("canvas", {}).get("id", ""))
        check("canvas-create", status == 200 and bool(canvas_id), f"status={status}")

        if canvas_id:
            node = {"id": "qa-node", "type": "smart-prompt", "x": 120, "y": 120, "w": 300, "h": 180, "title": "提示词", "text": "QA"}
            status, saved = request_json(
                f"/api/canvases/{canvas_id}",
                "PUT",
                {
                    "title": "QA release canvas",
                    "icon": "layers",
                    "nodes": [node],
                    "connections": [],
                    "viewport": {"x": 0, "y": 0, "scale": 1},
                    "logs": [],
                    "settings": {},
                    "client_id": "release-smoke",
                    "base_updated_at": 0,
                },
            )
            check("canvas-save", status == 200, f"status={status}")
            status, loaded = request_json(f"/api/canvases/{canvas_id}")
            loaded_canvas = loaded.get("canvas", loaded)
            check("canvas-load", status == 200 and len(loaded_canvas.get("nodes", [])) == 1, f"status={status}")

            export_status, archive, _ = request(
                "/api/canvas-workflows/export",
                "POST",
                {"nodes": [node], "connections": [], "filename": "qa-release.zip", "include_resources": False},
            )
            zip_ok = False
            if export_status == 200:
                with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
                    zip_ok = "workflow.json" in bundle.namelist()
            check("workflow-export", export_status == 200 and zip_ok, f"status={export_status}, bytes={len(archive)}")

            status, _ = request_json(f"/api/canvases/{canvas_id}", "DELETE")
            check("canvas-trash", status == 200, f"status={status}")
            status, _ = request_json(f"/api/canvases/{canvas_id}/restore", "POST", {})
            check("canvas-restore", status == 200, f"status={status}")
            status, _ = request_json(f"/api/canvases/{canvas_id}", "DELETE")
            check("canvas-trash-again", status == 200, f"status={status}")
            status, _ = request_json(f"/api/canvases/{canvas_id}/purge", "DELETE")
            check("canvas-purge", status == 200, f"status={status}")
            canvas_id = ""

        if project_id:
            status, _ = request_json(f"/api/projects/{project_id}", "DELETE")
            check("project-delete", status == 200, f"status={status}")
            project_id = ""

        for path, name in (
            ("/api/local-assets", "asset-library"),
            ("/api/canvas-assets", "canvas-assets"),
            ("/api/workflows", "workflows"),
            ("/api/providers", "providers"),
            ("/api/update-connectivity", "update-connectivity"),
        ):
            status, _ = request_json(path)
            check(name, status == 200, f"status={status}")
    finally:
        if canvas_id:
            request_json(f"/api/canvases/{canvas_id}", "DELETE")
            request_json(f"/api/canvases/{canvas_id}/purge", "DELETE")
        if project_id:
            request_json(f"/api/projects/{project_id}", "DELETE")

    result = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "base": BASE,
        "passed": all(item["passed"] for item in checks),
        "checks": checks,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
