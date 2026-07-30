import asyncio
import os
import unittest
from unittest import mock

import httpx

import main


class ImageTaskPollingFallbackTests(unittest.TestCase):
    def setUp(self):
        self.provider = {
            "id": "test-provider",
            "name": "Test Provider",
            "base_url": "https://example.test/v1",
            "protocol": "openai",
            "image_request_mode": "openai",
        }

    def test_standard_openai_candidates_keep_legacy_then_documented_image_route(self):
        urls = main.image_task_urls_for_provider(self.provider, "task_123")

        self.assertEqual(
            urls[:2],
            [
                "https://example.test/v1/images/tasks/task_123",
                "https://example.test/v1/images/task_123",
            ],
        )
        self.assertEqual(main.image_task_url_for_provider(self.provider, "task_123"), urls[0])

    def test_polling_falls_back_after_invalid_url(self):
        class FakeClient:
            def __init__(self):
                self.urls = []

            async def request(self, method, url, **kwargs):
                self.urls.append(url)
                request = httpx.Request(method, url)
                if "/images/tasks/" in url:
                    return httpx.Response(
                        404,
                        json={"error": {"message": "Invalid URL"}},
                        request=request,
                    )
                return httpx.Response(
                    200,
                    json={
                        "id": "task_123",
                        "status": "completed",
                        "data": [{"url": "https://cdn.example.test/result.png"}],
                    },
                    request=request,
                )

        client = FakeClient()
        env_name = main.provider_key_env(self.provider["id"])
        with mock.patch.dict(os.environ, {env_name: "test-key"}):
            payload = asyncio.run(
                main.fetch_image_task_payload(client, "task_123", self.provider)
            )

        self.assertEqual(payload["status"], "completed")
        self.assertEqual(
            client.urls,
            [
                "https://example.test/v1/images/tasks/task_123",
                "https://example.test/v1/images/task_123",
            ],
        )


if __name__ == "__main__":
    unittest.main()
