import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from PIL import Image

import main


def make_image(path: Path, color=(20, 80, 140)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (24, 24), color).save(path, format="PNG")


def test_browser_plugins_declare_four_reference_handoff():
    for plugin_id in ("gemini-creator", "gpt-creator"):
        manifest = json.loads(
            (Path(main.BASE_DIR) / "plugins" / plugin_id / "plugin.json").read_text(encoding="utf-8")
        )
        assert manifest["maxReferenceImages"] == 4
        assert "browserReferenceUpload" in manifest["capabilities"]
        assert "promptPassthrough" in manifest["capabilities"]


def test_stage_browser_plugin_references_copies_four_original_files(tmp_path):
    assets_root = tmp_path / "assets"
    handoff_root = tmp_path / "data" / "local" / "browser-plugin-handoff"
    handoff_root.mkdir(parents=True)
    payload = []
    for index in range(1, 5):
        source = assets_root / "input" / f"source-{index}.png"
        make_image(source, (index * 20, index * 30, index * 40))
        payload.append({"url": f"/assets/input/source-{index}.png", "kind": "image"})

    with (
        patch.object(main, "ASSETS_DIR", str(assets_root)),
        patch.object(main, "browser_plugin_handoff_root", return_value=str(handoff_root)),
    ):
        job_dir, staged = main.stage_browser_plugin_references("gemini-creator", "job-four", payload)

    assert Path(job_dir).parent == handoff_root
    assert [Path(item).name for item in staged] == [
        "huahai-reference-01.png",
        "huahai-reference-02.png",
        "huahai-reference-03.png",
        "huahai-reference-04.png",
    ]
    assert all(Path(item).is_file() for item in staged)
    assert [Path(item).read_bytes() for item in staged] == [
        (assets_root / "input" / f"source-{index}.png").read_bytes()
        for index in range(1, 5)
    ]


def test_stage_browser_plugin_references_rejects_fifth_image(tmp_path):
    handoff_root = tmp_path / "handoff"
    handoff_root.mkdir()
    payload = [{"url": f"/assets/input/{index}.png", "kind": "image"} for index in range(5)]
    with patch.object(main, "browser_plugin_handoff_root", return_value=str(handoff_root)):
        with pytest.raises(HTTPException) as exc:
            main.stage_browser_plugin_references("gpt-creator", "too-many", payload)
    assert exc.value.status_code == 400
    assert "最多 4 张" in str(exc.value.detail)


def test_stage_browser_plugin_references_rejects_remote_or_missing_file(tmp_path):
    handoff_root = tmp_path / "handoff"
    handoff_root.mkdir()
    with patch.object(main, "browser_plugin_handoff_root", return_value=str(handoff_root)):
        with pytest.raises(HTTPException) as exc:
            main.stage_browser_plugin_references(
                "gemini-creator",
                "remote",
                [{"url": "https://example.invalid/reference.png", "kind": "image"}],
            )
    assert exc.value.status_code == 400
    assert "画布本地文件" in str(exc.value.detail)
    assert not (handoff_root / "remote").exists()


def test_frontend_preserves_original_prompt_and_caps_reference_payload():
    script = (Path(main.BASE_DIR) / "static" / "js" / "smart-canvas.js").read_text(encoding="utf-8")
    assert "const SMART_REFERENCE_IMAGE_MAX = 4;" in script
    assert "const pluginPrompt = String(request.displayPrompt || prompt || '').trim();" in script
    assert "runPluginImageGeneration(pluginPrompt, refs, settings)" in script
    assert "assets:imageRefsOnly(refs).slice(0, SMART_REFERENCE_IMAGE_MAX)" in script
    assert "if(kind === 'image' && imageCount >= SMART_REFERENCE_IMAGE_MAX) return;" in script
    assert "if(refs.length >= SMART_UPLOAD_MAX) return;" in script
    assert "自动逐张上传最多 ${Number(plugin.maxReferenceImages)} 张参考图并原样提交提示词" in script


def test_windows_helper_requires_attachment_and_prompt_confirmation_before_submit():
    helper = (Path(main.BASE_DIR) / "scripts" / "browser-plugin-handoff.ps1").read_text(encoding="utf-8")
    confirm_at = helper.index("$confirmed = Confirm-Attachments")
    prompt_at = helper.index("Set-ExactPrompt $rootProvider")
    submit_at = helper.index("Submit-Prompt $rootProvider")
    assert confirm_at < prompt_at < submit_at
    assert "为避免退化成纯文字生成，已停止提交" in helper
    assert "$readBack -ne $Prompt" in helper
    assert "Get-AttachmentSnapshot" in helper
    assert "Invoke-OrClick $uploadText" in helper
    assert "[System.Windows.Forms.Clipboard]::SetText($quotedNames)" in helper
    assert "[System.Windows.Automation.ExpandCollapsePattern]::Pattern" in helper
    assert "$expand.Expand()" in helper
    assert "ExpandCollapse LeafNode" in helper
    assert "sleeping tab" in helper
    assert "[System.Windows.Automation.ControlType]::Pane" in helper
    assert "[System.Windows.Automation.ControlType]::Window" in helper
    assert "Sort-Object Score, Order -Descending" in helper


def test_backend_launches_handoff_in_sta_and_requires_real_submission():
    source = (Path(main.BASE_DIR) / "main.py").read_text(encoding="utf-8")
    handoff_start = source.index("async def run_browser_plugin_handoff")
    handoff_end = source.index("async def run_python_external_video_plugin", handoff_start)
    handoff = source[handoff_start:handoff_end]
    assert 'powershell,\n            "-STA",' in handoff
    assert 'result.get("attachmentCount")' in handoff
    assert 'result.get("promptVerified")' in handoff
    assert 'result.get("submitted")' in handoff
