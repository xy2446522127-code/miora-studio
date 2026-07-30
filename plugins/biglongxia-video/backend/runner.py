from __future__ import annotations

import contextlib
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any


def emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def validated_external_main(raw_path: str, project_root: Path) -> Path:
    candidate = Path(raw_path).resolve()
    allowed_root = (project_root / "downloads" / "biglongxia-grok-video-plugin").resolve()
    try:
        inside_allowed_root = os.path.commonpath(
            [str(allowed_root), str(candidate)]
        ) == str(allowed_root)
    except ValueError:
        inside_allowed_root = False
    if not inside_allowed_root or candidate.name != "main.py" or not candidate.is_file():
        raise RuntimeError("大龙虾视频插件文件不存在或不在允许的本地目录中")
    return candidate


def load_external_plugin(path: Path):
    spec = importlib.util.spec_from_file_location("huahai_biglongxia_video_plugin", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载大龙虾视频插件")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not callable(getattr(module, "load_params", None)) or not callable(
        getattr(module, "generate", None)
    ):
        raise RuntimeError("大龙虾视频插件缺少 load_params/generate 接口")
    return module


def asset_source(asset: dict[str, Any]) -> str:
    return str(asset.get("local_path") or asset.get("url") or "").strip()


def run(payload: dict[str, Any]) -> dict[str, Any]:
    project_root = Path(str(payload.get("project_root") or "")).resolve()
    external_main = validated_external_main(
        str(payload.get("external_main") or ""), project_root
    )
    output_dir = Path(str(payload.get("output_dir") or "")).resolve()
    output_root = (project_root / "assets" / "output").resolve()
    try:
        output_is_safe = os.path.commonpath(
            [str(output_root), str(output_dir)]
        ) == str(output_root)
    except ValueError:
        output_is_safe = False
    if not output_is_safe:
        raise RuntimeError("视频输出目录不在允许的本地输出目录中")
    output_dir.mkdir(parents=True, exist_ok=True)

    job = payload.get("job") if isinstance(payload.get("job"), dict) else {}
    parameters = (
        job.get("parameters") if isinstance(job.get("parameters"), dict) else {}
    )
    assets = job.get("assets") if isinstance(job.get("assets"), list) else []
    image_assets = [
        asset
        for asset in assets
        if isinstance(asset, dict)
        and str(asset.get("kind") or "").strip().lower() == "image"
        and asset_source(asset)
    ]
    references = [asset_source(asset) for asset in image_assets][:6]
    first_frame = next(
        (
            asset_source(asset)
            for asset in image_assets
            if str(asset.get("role") or "").strip().lower()
            in {"first_frame", "first", "start", "start_frame"}
        ),
        references[0] if references else "",
    )

    plugin = load_external_plugin(external_main)
    model = str(job.get("model") or "grok-imagine-1.0-video").strip()
    duration = max(1, min(15, int(parameters.get("duration") or 6)))
    plugin_params = {
        "base_url": str(payload.get("base_url") or "").strip(),
        "api_key": str(payload.get("api_key") or "").strip(),
        "model": model,
        "aspect_ratio": str(
            parameters.get("aspectRatio")
            or parameters.get("aspect_ratio")
            or "16:9"
        ).strip(),
        "resolution": str(parameters.get("resolution") or "720p").strip(),
        "duration": duration,
        "timeout": max(180, min(1800, int(parameters.get("timeout") or 1200))),
        "poll_interval": max(
            2, min(30, int(parameters.get("pollInterval") or 5))
        ),
        "generation_mode": "multi_reference" if len(references) > 1 else "first_frame",
    }
    if not plugin_params["api_key"]:
        raise RuntimeError("所选 API 平台尚未配置密钥")
    plugin.load_params(plugin_params)

    context: dict[str, Any] = {
        "prompt": str(job.get("prompt") or "").strip(),
        "output_dir": str(output_dir),
        "viewer_index": 0,
        "plugin_params": plugin_params,
        "reference_images": references,
    }
    if first_frame:
        context["first_frame_path"] = first_frame

    with contextlib.redirect_stdout(sys.stderr):
        generated = plugin.generate(context)
    values = generated if isinstance(generated, list) else [generated]
    outputs = []
    for value in values:
        path = Path(str(value or "")).resolve()
        try:
            inside_output = os.path.commonpath(
                [str(output_root), str(path)]
            ) == str(output_root)
        except ValueError:
            inside_output = False
        if inside_output and path.is_file():
            outputs.append(str(path))
    if not outputs:
        raise RuntimeError("视频插件没有返回可用的本地视频文件")
    return {"ok": True, "outputs": outputs}


def main() -> int:
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        emit(run(payload if isinstance(payload, dict) else {}))
        return 0
    except Exception as exc:
        message = str(exc or "视频插件执行失败").replace("PLUGIN_ERROR:::", "").strip()
        emit({"ok": False, "error": message})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
