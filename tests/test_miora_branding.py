import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


class HuahaiBrandingTests(unittest.TestCase):
    def test_app_info_exposes_huahai_identity(self):
        info = main.app_info()

        self.assertEqual(info["brand"], "花海画布")
        self.assertEqual(info["author"], "xy2446522127-code")
        self.assertEqual(info["developer"], "xy2446522127-code")
        self.assertEqual(
            info["repo_url"],
            "https://github.com/xy2446522127-code/miora-studio",
        )
        self.assertEqual(info["project_repo_url"], info["repo_url"])
        self.assertEqual(
            info["upstream_repo_url"],
            "https://github.com/hero8152/Infinite-Canvas",
        )
        self.assertEqual(set(info["sources"]), {"github", "upstream"})

    def test_updater_only_accepts_project_github_source(self):
        for requested in ("github", "modelscope", "ms", "anything"):
            self.assertEqual(main.normalize_update_source(requested), "github")

    def test_all_product_pages_load_shared_huahai_theme(self):
        root = Path(__file__).resolve().parents[1]
        for relative in (
            "static/index.html",
            "static/home.html",
            "static/canvas-list.html",
            "static/smart-canvas.html",
            "static/zimage.html",
            "static/enhance.html",
            "static/klein.html",
            "static/angle.html",
            "static/online.html",
            "static/gpt-chat.html",
            "static/asset-manager.html",
            "static/api-settings.html",
            "static/comfyui-settings.html",
            "static/plugin-center.html",
        ):
            page = (root / relative).read_text(encoding="utf-8")
            self.assertIn("/static/js/theme.js", page, relative)
            self.assertNotIn("MIORA Studio", page, relative)

        theme = (root / "static/js/theme.js").read_text(encoding="utf-8")
        self.assertIn("/static/css/huahai.css", theme)
        self.assertIn("/static/js/huahai-interactions.js", theme)

    def test_home_is_the_default_studio_page(self):
        root = Path(__file__).resolve().parents[1]
        index = (root / "static/index.html").read_text(encoding="utf-8")
        self.assertIn("const DEFAULT_PAGE_ID = 'home'", index)
        self.assertIn('id="frame-home"', index)

    def test_canvas_interactions_disable_reflections(self):
        root = Path(__file__).resolve().parents[1]
        css = (root / "static/css/huahai.css").read_text(encoding="utf-8")
        self.assertIn('body[data-huaha-page="canvas"] [class*="reflection"]', css)
        self.assertIn('body[data-huaha-page="smart-canvas"] [class*="reflection"]', css)
        script = (root / "static/js/huahai-interactions.js").read_text(encoding="utf-8")
        self.assertIn("canvasBlank", script)
        self.assertIn("requestAnimationFrame", script)
        self.assertIn("state?.moved", script)
        self.assertIn("dragging()", script)
        self.assertIn("for(let i=0;i<count;i++)", script)
        self.assertIn("page === 'canvas-list' && target.closest('.ws-card') ? 3 : 2", script)
        self.assertIn("@media (prefers-reduced-motion: reduce)", css)

    def test_project_cards_expose_focus_actions(self):
        root = Path(__file__).resolve().parents[1]
        script = (root / "static/js/canvas-list.js").read_text(encoding="utf-8")
        self.assertIn("ws-card-focus-actions", script)
        self.assertIn("duplicateCanvas", script)
        self.assertIn("requestAnimationFrame(resetView)", script)

    def test_canvas_creation_focus_mode_and_zoom_feedback(self):
        root = Path(__file__).resolve().parents[1]
        index = (root / "static/index.html").read_text(encoding="utf-8")
        page = (root / "static/smart-canvas.html").read_text(encoding="utf-8")
        canvas = (root / "static/js/smart-canvas.js").read_text(encoding="utf-8")
        css = (root / "static/css/huahai.css").read_text(encoding="utf-8")

        self.assertIn("studio-canvas-creation-mode", index)
        self.assertIn("blockSidebarBrowserZoom", index)
        self.assertIn("canvas-creation-active", css)
        self.assertIn("sidebar:focus-within", css)
        self.assertIn("zoom: 1 !important", css)
        self.assertIn("smartCanvasZoomPercent", page)
        self.assertIn("setSmartCanvasViewportScale", canvas)
        self.assertIn("Ctrl + 滚轮", page)

    def test_buttons_use_one_shared_control_system(self):
        root = Path(__file__).resolve().parents[1]
        css = (root / "static/css/huahai.css").read_text(encoding="utf-8")
        self.assertIn("--hh-control-height", css)
        self.assertIn("--hh-control-radius", css)
        self.assertIn("--hh-control-line", css)
        self.assertIn("#mainGenBtn", css)
        self.assertIn(".ws-card-continue", css)

    def test_canvas_node_creation_actions_remain_available(self):
        root = Path(__file__).resolve().parents[1]
        page = (root / "static/smart-canvas.html").read_text(encoding="utf-8")
        canvas = (root / "static/js/smart-canvas.js").read_text(encoding="utf-8")
        for node_type in ("image", "group", "prompt", "loop"):
            self.assertIn(f'data-create-type="{node_type}"', page)
        self.assertIn("createNodeFromMenu", canvas)
        self.assertIn("createPromptNode", canvas)
        self.assertIn("createImageNodeAt", canvas)
        self.assertIn("createSmartGroupNode", canvas)
        self.assertIn("createLoopNode", canvas)

    def test_smart_canvas_uses_native_functional_controls(self):
        root = Path(__file__).resolve().parents[1]
        page = (root / "static/smart-canvas.html").read_text(encoding="utf-8")
        interactions = (root / "static/js/huahai-interactions.js").read_text(encoding="utf-8")
        css = (root / "static/css/huahai.css").read_text(encoding="utf-8")

        for control_id in (
            "createMenu",
            "runBtn",
            "smartWorkflowToggle",
            "smartShortcutToggle",
            "smartLogToggle",
            "assetToggle",
            "imageEditModal",
        ):
            self.assertIn(f'id="{control_id}"', page)
        self.assertNotIn("installSmartCanvasChrome", interactions)
        self.assertNotIn(".huahai-smart-rail", css)
        self.assertNotIn(".huahai-smart-inspector", css)

    def test_project_manager_uses_locked_chronological_grid(self):
        root = Path(__file__).resolve().parents[1]
        script = (root / "static/js/canvas-list.js").read_text(encoding="utf-8")
        page = (root / "static/canvas-list.html").read_text(encoding="utf-8")
        css = (root / "static/css/huahai-product.css").read_text(encoding="utf-8")

        self.assertIn("chronologicalCanvasesInProject", script)
        self.assertIn("sortedCanvases()", script)
        self.assertNotIn("draggable=", script)
        self.assertIn("更新时间：新 → 旧", page)
        self.assertIn("grid-template-columns: repeat(4", css)
        self.assertIn("grid-template-columns: 244px", css)
        self.assertIn("padding: 28px 52px 90px", css)
        self.assertIn("min-height: 293px", css)
        self.assertIn("hh-card-reflection", script)

    def test_smart_canvas_contains_all_canvas_upgrades(self):
        root = Path(__file__).resolve().parents[1]
        smart_page = (root / "static/smart-canvas.html").read_text(encoding="utf-8")
        smart_script = (root / "static/js/smart-canvas.js").read_text(encoding="utf-8")

        self.assertIn("huahai-batch-links.js", smart_page)
        self.assertIn("smart-batch-proxy-port", smart_script)
        self.assertIn('id="smartResultsRail"', smart_page)
        self.assertIn("smartVideoProviderPlugins", smart_script)
        self.assertIn("/api/generated-assets/reveal", smart_script)
        self.assertIn('id="smartCanvasZoomPercent"', smart_page)
        self.assertIn("setSmartCanvasViewportScale", smart_script)
        self.assertIn("smartViewportScalePercent", smart_script)
        self.assertNotIn("智能建议", smart_page)

    def test_empty_generation_nodes_show_real_setting_summaries(self):
        root = Path(__file__).resolve().parents[1]
        smart_script = (root / "static/js/smart-canvas.js").read_text(encoding="utf-8")
        smart_css = (root / "static/css/smart-canvas.css").read_text(encoding="utf-8")

        self.assertIn("generationNodeSummaryHtml", smart_script)
        self.assertIn(
            "if(imgs.length === 0 && node.runSettings)",
            smart_script,
        )
        self.assertIn("generation-node-summary", smart_css)
        self.assertIn("generation-node-open", smart_css)

    def test_smart_canvas_restores_sharp_visible_media_after_zoom(self):
        root = Path(__file__).resolve().parents[1]
        smart_script = (root / "static/js/smart-canvas.js").read_text(encoding="utf-8")

        self.assertIn("scheduleSmartImageResolutionSync", smart_script)
        self.assertIn("smartViewportWantsHighRes", smart_script)
        self.assertIn("smartImageNearViewport", smart_script)
        self.assertIn(
            "imageSelected || (smartViewportWantsHighRes() && smartImageNearViewport(img))",
            smart_script,
        )

    def test_api_settings_has_no_bilibili_contact_promotion(self):
        root = Path(__file__).resolve().parents[1]
        files = (
            root / "static/js/api-settings.js",
            root / "static/js/i18n/api-settings.js",
            root / "static/css/api-settings.css",
        )
        combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
        self.assertNotIn("B站私信", combined)
        self.assertNotIn("space.bilibili.com", combined)
        self.assertNotIn("recommend-seedance-private", combined)

    def test_plugin_folder_and_local_update_recovery_controls_exist(self):
        root = Path(__file__).resolve().parents[1]
        index = (root / "static/index.html").read_text(encoding="utf-8")
        plugin_center = (root / "static/plugin-center.html").read_text(encoding="utf-8")

        self.assertIn('id="project-update-rollback-btn"', index)
        self.assertIn("rollbackProjectUpdate()", index)
        self.assertIn('id="openPluginFolderBtn"', plugin_center)
        self.assertIn("/api/plugins/open-directory", plugin_center)


if __name__ == "__main__":
    unittest.main()
