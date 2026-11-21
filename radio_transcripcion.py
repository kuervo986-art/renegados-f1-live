"""Transcribe public Formula 1 radio clips without redistributing the source audio."""

import hashlib
import logging
import os
import re
import tempfile
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

import requests

RADIO_ORIGIN = "https://livetiming.formula1.com/static/"
RADIO_PATH = re.compile(
    r"20\d{2}/20\d{2}-\d{2}-\d{2}_[A-Za-z0-9_-]{1,120}/"
    r"20\d{2}-\d{2}-\d{2}_[A-Za-z0-9_-]{1,50}/TeamRadio/"
    r"[A-Za-z0-9_-]{1,100}\.mp3", re.ASCII
)
MODEL_URL = ("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/"
             "ggml-tiny.en-q5_1.bin?download=true")
MODEL_HASH = "c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b"
_MODEL_PATH = Path(tempfile.gettempdir()) / "renegados-radio-tiny.en-q5_1.bin"
_MAX_AUDIO = 2 * 1024 * 1024
_POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix="radio")
_LOCK = Lock()
_JOBS = {}
_RESULTS = OrderedDict()
_MODEL = None
logger = logging.getLogger(__name__)


class RadioError(Exception):
    """An expected problem with an individual clip."""


def _model_file():
    configured = os.getenv("RENEGADOS_RADIO_MODEL_PATH")
    if configured:
        return configured
    if _MODEL_PATH.is_file():
        return str(_MODEL_PATH)
    digest = hashlib.sha256()
    with tempfile.NamedTemporaryFile(dir=_MODEL_PATH.parent, delete=False) as model_file:
        partial = Path(model_file.name)
        try:
            with requests.get(MODEL_URL, stream=True, timeout=(6, 25)) as response:
                response.raise_for_status()
                total = 0
                for chunk in response.iter_content(256 * 1024):
                    total += len(chunk)
                    if total > 65 * 1024 * 1024:
                        raise ValueError("Modelo demasiado grande")
                    digest.update(chunk)
                    model_file.write(chunk)
            if digest.hexdigest() != MODEL_HASH:
                raise ValueError("Verificación del modelo fallida")
            model_file.close()
            partial.replace(_MODEL_PATH)
        finally:
            partial.unlink(missing_ok=True)
    return str(_MODEL_PATH)


def _fetch_clip(clip):
    with requests.get(RADIO_ORIGIN + clip, allow_redirects=False, stream=True, timeout=(5, 15)) as response:
        if response.status_code != 200:
            raise RadioError("La fuente no ha entregado el audio de esta radio.")
        content_type = response.headers.get("Content-Type", "").lower()
        if not content_type.startswith(("audio/", "application/octet-stream")):
            raise RadioError("La fuente no ha entregado un archivo de audio.")
        data = bytearray()
        for chunk in response.iter_content(16384):
            data.extend(chunk)
            if len(data) > _MAX_AUDIO:
                raise RadioError("Esta radio supera el tamaño máximo admitido.")
        return bytes(data)


def _transcribe(clip):
    global _MODEL
    import miniaudio
    import numpy as np
    from pywhispercpp.model import Model

    audio = _fetch_clip(clip)
    try:
        decoded = miniaudio.decode(audio, miniaudio.SampleFormat.FLOAT32, 1, 16000)
    except miniaudio.DecodeError as exc:
        raise RadioError("La grabación de radio no se pudo leer.") from exc
    pcm = np.asarray(decoded.samples, dtype=np.float32)
    if len(pcm) > 90 * 16000:
        raise RadioError("La radio supera los 90 segundos.")
    if len(pcm) < 4000 or float(np.max(np.abs(pcm))) < .005:
        raise RadioError("No se ha detectado voz clara en esta radio.")
    pcm = np.copy(pcm)
    pcm[1:] -= .92 * pcm[:-1].copy()
    peak = float(np.max(np.abs(pcm)))
    if 0 < peak < .65:
        pcm *= min(4, .65 / peak)

    if _MODEL is None:
        _MODEL = Model(_model_file(), n_threads=1,
                       redirect_whispercpp_logs_to=None,
                       print_progress=False, print_realtime=False, print_timestamps=False,
                       initial_prompt="Formula 1 team radio. Copy that. Aquaplaning. Box this lap.")
    segments = _MODEL.transcribe(pcm, language="en")
    text = " ".join(segment.text.strip() for segment in segments).strip()
    text = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", text).strip()
    if not re.search(r"[a-z]{2}", text, re.IGNORECASE):
        raise RadioError("No se han podido distinguir las palabras de esta radio.")
    text = re.sub(r"\bice ring\b", "ice rink", text, flags=re.IGNORECASE)
    return text[:2000]


def _finish(clip, future):
    try:
        result = ({"texto": future.result()}, 200)
    except RadioError as exc:
        result = ({"error": str(exc)}, 422)
    except Exception:
        logger.exception("No se pudo transcribir una radio de equipo")
        result = ({"error": "No se pudo preparar la traducción de esta radio. Inténtalo de nuevo en unos segundos."}, 503)
    with _LOCK:
        _JOBS.pop(clip, None)
        _RESULTS[clip] = (time.monotonic(), result)
        while len(_RESULTS) > 128:
            _RESULTS.popitem(last=False)


def estado_transcripcion(clip):
    if not clip or not RADIO_PATH.fullmatch(clip):
        return {"error": "El enlace de radio no es válido."}, 400
    with _LOCK:
        cached = _RESULTS.get(clip)
        if cached:
            saved, result = cached
            ttl = 3600 if result[1] == 200 else 20
            if time.monotonic() - saved < ttl:
                _RESULTS.move_to_end(clip)
                return result
            del _RESULTS[clip]
        if clip in _JOBS:
            return {"estado": "procesando"}, 202
        if len(_JOBS) >= 3:
            return {"error": "El traductor está ocupado. Inténtalo de nuevo en unos segundos."}, 429
        future = _POOL.submit(_transcribe, clip)
        _JOBS[clip] = future
    future.add_done_callback(lambda done: _finish(clip, done))
    return {"estado": "procesando"}, 202
