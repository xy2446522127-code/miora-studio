import io
import tempfile
import unittest
import urllib.error
import zipfile
from pathlib import Path
from unittest.mock import patch

import main


def release_archive() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        root = "miora-studio-main/"
        archive.writestr(root + "main.py", "print('release')\n")
        archive.writestr(root + "plugin_runtime.py", "class PluginRuntime: pass\n")
        archive.writestr(root + "VERSION", "2026.07.30.1\n")
        archive.writestr(root + "static/index.html", "<title>花海画布</title>\n")
        archive.writestr(
            root + "plugins/demo-video/plugin.json",
            '{"id":"demo-video","type":"video-provider"}\n',
        )
        archive.writestr(root + "API/.env", "API_KEY=must-not-extract\n")
        archive.writestr(root + "data/asset_library.json", '{"private":true}\n')
    return buffer.getvalue()


class UpdateArchiveFallbackTests(unittest.TestCase):
    def test_github_version_and_notes_use_uncached_branch_refs(self):
        raw_branch = "raw.githubusercontent.com/xy2446522127-code/miora-studio/refs/heads/main"
        self.assertIn(raw_branch, main.GITHUB_VERSION_URL)
        self.assertIn(raw_branch, main.GITHUB_UPDATE_NOTES_URL)
        self.assertEqual(
            main.updater_request_headers(main.GITHUB_VERSION_URL).get("Cache-Control"),
            "no-cache",
        )

    def test_archive_fallback_updates_product_files_without_local_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            staging = Path(folder) / "staging"
            tree_error = urllib.error.HTTPError(
                main.GITHUB_TREE_URL,
                403,
                "rate limited",
                {},
                None,
            )
            with (
                patch.object(main, "github_update_file_list", side_effect=tree_error),
                patch.object(main, "github_bytes", return_value=release_archive()),
            ):
                root_files, static_files, files = main.stage_update_from_source(
                    "github", str(staging)
                )

            self.assertIn("main.py", root_files)
            self.assertIn("plugin_runtime.py", root_files)
            self.assertIn("plugins/demo-video/plugin.json", root_files)
            self.assertIn("static/index.html", static_files)
            self.assertEqual(files, root_files + static_files)
            self.assertTrue((staging / "plugins/demo-video/plugin.json").is_file())
            self.assertFalse((staging / "API/.env").exists())
            self.assertFalse((staging / "data/asset_library.json").exists())


if __name__ == "__main__":
    unittest.main()
