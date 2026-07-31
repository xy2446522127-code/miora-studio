import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ProductSurfaceTests(unittest.TestCase):
    def test_shell_keeps_original_product_features_visible(self):
        index = (ROOT / "static/index.html").read_text(encoding="utf-8")
        shell = (ROOT / "static/js/huahai-shell-product.js").read_text(encoding="utf-8")

        for page in ("zimage", "enhance", "klein", "angle", "online", "gpt-chat"):
            self.assertIn(f"switchUI(this, '{page}')", index)
            self.assertNotIn(f"'{page}'", shell.split("async function openLatestSmartCanvas", 1)[0])
        self.assertNotIn("setAttribute('hidden'", shell)
        self.assertIn(">项目管理</span>", index)
        self.assertIn("智能画布", shell)

    def test_ordinary_canvas_links_migrate_to_smart_canvas(self):
        canvas = (ROOT / "static/canvas.html").read_text(encoding="utf-8")
        redirect_at = canvas.index("window.location.replace(target)")
        first_stylesheet = canvas.index('rel="stylesheet"')

        self.assertLess(redirect_at, first_stylesheet)
        self.assertIn("'/static/smart-canvas.html' + window.location.search + window.location.hash", canvas)

    def test_smart_canvas_exposes_only_api_and_dynamic_plugin_modes(self):
        page = (ROOT / "static/smart-canvas.html").read_text(encoding="utf-8")
        script = (ROOT / "static/js/smart-canvas.js").read_text(encoding="utf-8")
        select = page.split('id="engineSelect"', 1)[1].split("</select>", 1)[0]

        self.assertIn('<option value="api">', select)
        self.assertIn('<option value="plugin">', select)
        for removed in ("volcengine", "modelscope", "comfy", "runninghub"):
            self.assertNotIn(f'value="{removed}"', select)
        self.assertIn(
            "settings.engine = ['api','plugin'].includes(settings.engine) ? settings.engine : 'api';",
            script,
        )
        self.assertIn(
            "const engine = ['api','plugin'].includes(baseSettings?.engine) ? baseSettings.engine : 'api';",
            script,
        )

    def test_update_surface_only_uses_project_github(self):
        index = (ROOT / "static/index.html").read_text(encoding="utf-8")

        self.assertIn('id="update-source-github"', index)
        self.assertNotIn("update-source-modelscope", index)
        self.assertNotIn("ModelScope 下载源", index)
        self.assertNotIn("sources.modelscope", index)
        self.assertIn("source:'github'", index)


if __name__ == "__main__":
    unittest.main()
