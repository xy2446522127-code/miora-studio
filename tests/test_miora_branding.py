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
        self.assertEqual(
            info["repo_url"],
            "https://github.com/xy2446522127-code/miora-studio",
        )
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
            "static/canvas.html",
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
        canvas = (root / "static/js/canvas.js").read_text(encoding="utf-8")
        inspector = (root / "static/js/canvas-inspector.js").read_text(encoding="utf-8")
        css = (root / "static/css/huahai.css").read_text(encoding="utf-8")

        self.assertIn("studio-canvas-creation-mode", index)
        self.assertIn("blockSidebarBrowserZoom", index)
        self.assertIn("canvas-creation-active", css)
        self.assertIn("sidebar:focus-within", css)
        self.assertIn("zoom: 1 !important", css)
        self.assertIn("huahaiCanvasZoomPercent", canvas)
        self.assertIn("setCanvasViewportScale", canvas)
        self.assertIn("Ctrl + 滚轮", inspector)

    def test_buttons_use_one_shared_control_system(self):
        root = Path(__file__).resolve().parents[1]
        css = (root / "static/css/huahai.css").read_text(encoding="utf-8")
        self.assertIn("--hh-control-height", css)
        self.assertIn("--hh-control-radius", css)
        self.assertIn("--hh-control-line", css)
        self.assertIn("#mainGenBtn", css)
        self.assertIn(".ws-card-continue", css)


if __name__ == "__main__":
    unittest.main()
