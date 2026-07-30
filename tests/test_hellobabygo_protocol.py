import unittest

import main


class HelloBabyGoProtocolTests(unittest.TestCase):
    def setUp(self):
        self.provider = {
            "id": "hellobabygo",
            "name": "HelloBabyGo API",
            "base_url": "https://api.hellobabygo.com/v1",
            "protocol": "openai",
            "image_request_mode": "openai",
        }

    def test_provider_uses_documented_media_routes(self):
        self.assertTrue(main.is_hellobabygo_provider(self.provider))
        self.assertEqual(
            main.video_submit_url_candidates(
                self.provider, main.video_api_root(self.provider)
            ),
            ["https://api.hellobabygo.com/v1/videos"],
        )
        self.assertEqual(
            main.video_task_url_candidates(
                self.provider,
                main.video_api_root(self.provider),
                "task_123",
            ),
            ["https://api.hellobabygo.com/v1/videos/task_123"],
        )
        self.assertIn(
            "https://api.hellobabygo.com/v1/images/task_123",
            main.image_task_urls_for_provider(self.provider, "task_123"),
        )

    def test_video_duration_is_normalized_per_model(self):
        self.assertEqual(main.hellobabygo_video_seconds("firefly-veo31-fast", 6), 8)
        self.assertEqual(main.hellobabygo_video_seconds("sora-2", 7), 8)
        self.assertEqual(main.hellobabygo_video_seconds("sora-2-pro", 4), 12)
        self.assertEqual(
            main.hellobabygo_video_seconds(
                "grok-imagine-video-1.5-fast-16s", 10
            ),
            16,
        )

    def test_video_metadata_url_is_detected(self):
        urls = main.video_output_urls(
            {
                "id": "task_123",
                "status": "completed",
                "metadata": {"url": "https://cdn.example.test/result.mp4"},
            }
        )
        self.assertEqual(urls, ["https://cdn.example.test/result.mp4"])


if __name__ == "__main__":
    unittest.main()
