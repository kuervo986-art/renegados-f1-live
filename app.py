"""RENEGADOS F1 LIVE: pasarela con diagnósticos y sin tiempos inventados."""
import os
import time
from datetime import datetime, timezone
from threading import Lock
import requests
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
ORIGIN = os.environ.get("F1_COMMUNITY_API", "https://f1-live-api.onrender.com").rstrip("/")
ALLOWED = {"status", "timing", "race-control", "weather", "team-radio", "drivers"}
_cache = {}
_lock = Lock()

def utc():
    return datetime.now(timezone.utc).isoformat()

@app.get("/")
def inicio():
    return jsonify(proyecto="RENEGADOS F1 LIVE", idioma="es",
                   estado="servidor en funcionamiento",
                   nota="Pasarela comunitaria experimental. Un servidor activo no garantiza cronometraje en directo.")

@app.get("/api/salud")
def salud():
    return jsonify(correcto=True, servidor="operativo", hora_utc=utc())

@app.get("/api/estado")
def estado():
    return jsonify(servidor="operativo", proveedor=ORIGIN,
                   directo_confirmado=False,
                   mensaje="El directo depende de la disponibilidad del proveedor externo. Comprueba /api/f1/status.",
                   actualizado_utc=utc())

@app.get("/api/f1/<topic>")
def proveedor(topic):
    if topic not in ALLOWED:
        return jsonify(error="Ruta no permitida"), 404
    now = time.monotonic()
    with _lock:
        cached = _cache.get(topic)
        if cached and now - cached[0] < 10:
            return jsonify(cached[1]), 200
    try:
        resp = requests.get(ORIGIN + "/" + topic,
                            headers={"Accept": "application/json",
                                     "User-Agent": "RenegadosF1Live/1.0"},
                            timeout=(4, 7))
        resp.raise_for_status()
        payload = resp.json()
        with _lock:
            _cache[topic] = (time.monotonic(), payload)
        return jsonify(payload), 200
    except requests.exceptions.Timeout:
        return jsonify(error="El proveedor ha agotado el tiempo de espera.",
                       proveedor_disponible=False, hora_utc=utc()), 503
    except requests.exceptions.RequestException as exc:
        code = getattr(getattr(exc, "response", None), "status_code", None)
        return jsonify(error="El proveedor comunitario no responde correctamente.",
                       codigo_proveedor=code, proveedor_disponible=False,
                       hora_utc=utc()), 503
    except ValueError:
        return jsonify(error="El proveedor devolvió datos inválidos.",
                       proveedor_disponible=False, hora_utc=utc()), 502

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "10000")))
