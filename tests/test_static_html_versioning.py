import asyncio
import unittest
from pathlib import Path

import main


class StaticHtmlVersioningTests(unittest.TestCase):
    def test_static_html_is_versioned_without_rewriting_source(self):
        path = Path(main.STATIC_DIR) / "home.html"
        before_bytes = path.read_bytes()
        before_mtime = path.stat().st_mtime_ns

        main.sync_static_html_versions()
        static_files = main.VersionedHtmlStaticFiles(directory=main.STATIC_DIR)
        response = asyncio.run(
            static_files.get_response(
                "home.html",
                {"method": "GET", "headers": []},
            )
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            f"?v={main.current_app_version()}.".encode(),
            response.body,
        )
        self.assertEqual(path.read_bytes(), before_bytes)
        self.assertEqual(path.stat().st_mtime_ns, before_mtime)


if __name__ == "__main__":
    unittest.main()
