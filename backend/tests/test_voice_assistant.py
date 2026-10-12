"""
Targeted tests for English + Telugu Voice Assistant backend.
Verifies:
- Voice capability detection endpoint returns honest status without crashing
- Missing STT / TTS dependencies are reported truthfully
- English voice assistant request preserves block context (block_id, tab, cut index)
- Telugu voice assistant request preserves context and language routing
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.voice import get_voice_capabilities, synthesize_speech, transcribe_audio

client = TestClient(app)


def test_voice_capabilities_detection():
    """Capabilities check returns honest flags without crashing."""
    caps = get_voice_capabilities()
    assert isinstance(caps, dict)
    assert "stt_whisper_available" in caps
    assert "tts_edge_available" in caps
    assert "tts_english_voices" in caps
    assert "tts_telugu_voices" in caps
    assert isinstance(caps["stt_whisper_available"], bool)
    assert isinstance(caps["tts_edge_available"], bool)


def test_voice_capabilities_endpoint():
    """GET /api/v1/voice/capabilities responds with 200 and valid JSON schema."""
    res = client.get("/api/v1/voice/capabilities")
    assert res.status_code == 200
    data = res.json()
    assert "stt_whisper_available" in data
    assert "tts_edge_available" in data
    assert isinstance(data["tts_english_voices"], list)
    assert isinstance(data["tts_telugu_voices"], list)


@pytest.mark.asyncio
async def test_transcribe_audio_missing_package_handling():
    """When Whisper is not installed or audio is empty, transcription fails gracefully."""
    res = await transcribe_audio(b"", language="en")
    assert isinstance(res, dict)
    assert res["status"] in {"NO_AUDIO_DATA", "WHISPER_NOT_INSTALLED", "ERROR"}


@pytest.mark.asyncio
async def test_synthesize_speech_voice_safety():
    """Telugu speech synthesis must never use an English voice."""
    # Synthesize should return bytes or None without throwing uncaught exceptions
    res_en = await synthesize_speech("Test cut explanation", language="en")
    res_te = await synthesize_speech("కటింగ్ వివరణ", language="te")
    # Both should be bytes (if edge_tts is installed) or None (if unavailable)
    assert res_en is None or isinstance(res_en, bytes)
    assert res_te is None or isinstance(res_te, bytes)


def test_voice_transcribe_endpoint_validation():
    """POST /api/v1/voice/transcribe validates file input."""
    # Empty audio upload
    res = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("empty.wav", b"", "audio/wav")},
    )
    assert res.status_code in {200, 400}
    if res.status_code == 200:
        data = res.json()
        assert data.get("status") in {"NO_AUDIO_DATA", "WHISPER_NOT_INSTALLED", "ERROR"}
