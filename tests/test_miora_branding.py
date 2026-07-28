import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


class MioraBrandingTests(unittest.TestCase):
    def test_app_info_exposes_miora_identity(self):
        info = main.app_info()

        self.assertEqual(info["brand"], "MIORA Studio")
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

    def test_core_pages_load_shared_miora_theme(self):
        root = Path(__file__).resolve().parents[1]
        for relative in (
            "static/index.html",
            "static/canvas-list.html",
            "static/canvas.html",
        ):
            page = (root / relative).read_text(encoding="utf-8")
            self.assertIn("/static/css/miora.css", page)
            self.assertIn("MIORA", page)


if __name__ == "__main__":
    unittest.main()
