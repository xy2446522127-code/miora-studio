import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
from plugin_runtime import PluginRuntime


class PluginRuntimeExternalEntryTests(unittest.TestCase):
    def test_external_entry_controls_runtime_readiness(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            plugins = root / "plugins"
            plugin = plugins / "demo-video"
            backend = plugin / "backend"
            backend.mkdir(parents=True)
            (backend / "runner.py").write_text("pass\n", encoding="utf-8")
            (plugin / "plugin.json").write_text(
                json.dumps(
                    {
                        "id": "demo-video",
                        "entry": "backend/runner.py",
                        "capabilities": [],
                        "externalEntryGlobs": ["downloads/demo/**/main.py"],
                    }
                ),
                encoding="utf-8",
            )
            runtime = PluginRuntime(str(plugins), str(root / "data"))
            manifest = runtime.plugin("demo-video")
            self.assertFalse(manifest["runtime_ready"])
            self.assertTrue(manifest["installation_required"])
            self.assertIsNone(runtime.external_entry_path("demo-video"))

            external = root / "downloads" / "demo" / "vendor" / "main.py"
            external.parent.mkdir(parents=True)
            external.write_text("pass\n", encoding="utf-8")
            manifest = runtime.plugin("demo-video")
            self.assertTrue(manifest["runtime_ready"])
            self.assertFalse(manifest["installation_required"])
            self.assertEqual(runtime.external_entry_path("demo-video"), external.resolve())


class PythonVideoPluginAdapterTests(unittest.IsolatedAsyncioTestCase):
    def test_no_channel_error_is_actionable_and_utf8_safe(self):
        detail = main.plugin_error_message(
            "No available channel for model grok-imagine-1.0-video "
            "under group default (distributor)\n���"
        )
        self.assertIn("grok-imagine-1.0-video", detail)
        self.assertIn("没有视频模型", detail)
        self.assertNotIn("\ufffd", detail)

    async def test_external_runner_returns_local_video_without_exposing_key(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            output = root / "assets" / "output"
            output.mkdir(parents=True)
            external = (
                root
                / "downloads"
                / "biglongxia-grok-video-plugin"
                / "vendor"
                / "main.py"
            )
            external.parent.mkdir(parents=True)
            external.write_text(
                "from pathlib import Path\n"
                "def load_params(params):\n"
                "    assert params.get('api_key')\n"
                "def generate(context):\n"
                "    path = Path(context['output_dir']) / 'adapter-test.mp4'\n"
                "    path.write_bytes(b'fake-video')\n"
                "    return [str(path)]\n",
                encoding="utf-8",
            )
            runner = (
                Path(__file__).resolve().parents[1]
                / "plugins"
                / "biglongxia-video"
                / "backend"
                / "runner.py"
            )
            runtime = Mock()
            runtime.entry_path.return_value = runner
            runtime.external_entry_path.return_value = external
            runtime.update_job.side_effect = lambda _plugin, _job, **changes: {
                "id": "job-1",
                **changes,
            }
            payload = main.PluginJobRequest(
                model="grok-imagine-1.0-video",
                prompt="test video",
                parameters={
                    "duration": 6,
                    "resolution": "480p",
                    "aspectRatio": "16:9",
                },
                assets=[],
            )
            manifest = {
                "runtime": "python-external-plugin",
                "defaultProviderId": "custom-api",
            }
            provider = {
                "id": "custom-api",
                "name": "Test API",
                "base_url": "https://example.invalid/v1",
            }
            with (
                patch.object(main, "BASE_DIR", str(root)),
                patch.object(main, "OUTPUT_OUTPUT_DIR", str(output)),
                patch.object(main, "PLUGIN_RUNTIME", runtime),
                patch.object(main, "get_api_provider", return_value=provider),
                patch.object(main, "provider_env_key_value", return_value="secret-test-key"),
            ):
                result = await main.run_python_external_video_plugin(
                    "biglongxia-video",
                    manifest,
                    payload,
                    {"id": "job-1"},
                )

            self.assertEqual(len(result["videos"]), 1)
            self.assertEqual(result["videos"][0]["kind"], "video")
            self.assertTrue(
                result["videos"][0]["url"].endswith("/adapter-test.mp4")
            )
            self.assertTrue((output / "adapter-test.mp4").is_file())
            self.assertNotIn("secret-test-key", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
