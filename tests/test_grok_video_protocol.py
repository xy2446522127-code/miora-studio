import asyncio
from types import SimpleNamespace

import main


class FakeResponse:
    status_code = 200
    text = ""

    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(self.payload)


def video_payload(images=None):
    return SimpleNamespace(
        prompt="A luminous flower drifting over the ocean",
        duration=6,
        aspect_ratio="16:9",
        size="16:9",
        resolution="720p",
        images=images or [],
    )


def test_grok_text_to_video_uses_json(monkeypatch):
    client = FakeClient({"data": [{"url": "https://cdn.example/video.mp4"}]})

    async def fake_save(url, prefix="video_"):
        assert url == "https://cdn.example/video.mp4"
        return "/assets/output/video.mp4"

    monkeypatch.setattr(main, "save_remote_video_to_output", fake_save)

    result = asyncio.run(
        main.generate_grok_video(
            client,
            video_payload(),
            {"id": "custom-api", "name": "Custom API"},
            "https://api.example.test",
            "grok-imagine-1.0-video",
        )
    )

    assert result["videos"] == ["/assets/output/video.mp4"]
    assert len(client.calls) == 1
    url, kwargs = client.calls[0]
    assert url == "https://api.example.test/v1/videos"
    assert "json" in kwargs
    assert "files" not in kwargs
    assert kwargs["json"]["model"] == "grok-imagine-1.0-video"
    assert kwargs["json"]["seconds"] == "6"
    assert kwargs["json"]["size"] == "1280x720"


def test_grok_image_to_video_keeps_multipart(monkeypatch):
    client = FakeClient({"data": [{"url": "https://cdn.example/video.mp4"}]})
    reference = SimpleNamespace(
        url="https://cdn.example/reference.png",
        original_url="",
        originalLocalUrl="",
        source_url="",
    )

    async def fake_reference_part(_client, _reference):
        return ("input_reference[]", (None, "https://cdn.example/reference.png"))

    async def fake_save(_url, prefix="video_"):
        return "/assets/output/video.mp4"

    monkeypatch.setattr(main, "grok_reference_multipart_part", fake_reference_part)
    monkeypatch.setattr(main, "save_remote_video_to_output", fake_save)

    asyncio.run(
        main.generate_grok_video(
            client,
            video_payload([reference]),
            {"id": "custom-api", "name": "Custom API"},
            "https://api.example.test",
            "grok-imagine-video-1.5-preview",
        )
    )

    _, kwargs = client.calls[0]
    assert "files" in kwargs
    assert "json" not in kwargs
    assert any(part[0] == "input_reference[]" for part in kwargs["files"])
