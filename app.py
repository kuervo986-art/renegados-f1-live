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


# Archivo de sesiones históricas: OpenF1, sin autenticación.
from flask import request

_history_cache = {}
def historical(endpoint, params):
    key = (endpoint, tuple(sorted(params.items())))
    current = time.monotonic()
    with _lock:
        cached = _history_cache.get(key)
        if cached and current - cached[0] < 900:
            return cached[1]
    resp = requests.get("https://api.openf1.org/v1/" + endpoint,
                        params=params, timeout=(5, 20),
                        headers={"User-Agent": "RenegadosF1Live/1.0"})
    resp.raise_for_status()
    result = resp.json()
    if not isinstance(result, list):
        raise ValueError("Respuesta histórica inválida")
    with _lock:
        _history_cache[key] = (time.monotonic(), result)
    return result

def historical_error(exc):
    response = getattr(exc, "response", None)
    status = response.status_code if response is not None else None
    return jsonify(error="No se pudieron obtener los datos históricos de OpenF1.",
                   codigo_proveedor=status, detalle=str(exc)[:160]), 503

@app.get("/api/historico/sesiones")
def sesiones_historicas():
    try:
        year = int(request.args.get("year", 2026))
        if year < 2023 or year > 2026:
            return jsonify(error="Temporada fuera del intervalo admitido"), 400
        country = request.args.get("country", "Mexico")
        items = historical("sessions", {"year": year})
        return jsonify([s for s in items if s.get("session_name") in ("Qualifying", "Sprint Qualifying") and (
            country.lower() in str(s.get("country_name", "")).lower()
            or country.lower() in str(s.get("location", "")).lower())])
    except (ValueError, requests.RequestException) as exc:
        return historical_error(exc)

@app.get("/api/historico/sesion/<int:session_key>")
def sesion_historica(session_key):
    try:
        sessions = historical("sessions", {"session_key": session_key})
        if not sessions:
            return jsonify(error="Sesión inexistente"), 404
        session = sessions[0]
        end = session.get("date_end")
        from datetime import timedelta
        if not end:
            return jsonify(error="La sesión no tiene una fecha final válida"), 409
        try:
            ended = datetime.fromisoformat(end.replace("Z", "+00:00"))
            if ended.tzinfo is None:
                ended = ended.replace(tzinfo=timezone.utc)
        except ValueError:
            return jsonify(error="Fecha de fin de sesión inválida"), 409
        if datetime.now(timezone.utc) < ended + timedelta(minutes=30):
            return jsonify(error="Sesión todavía en ventana restringida; inténtalo tras su cierre"), 403
        keys = ("drivers", "session_result", "laps", "stints", "race_control")
        data = {"sesion": session}
        errors = {}
        for endpoint in keys:
            try:
                data[endpoint] = historical(endpoint, {"session_key": session_key})
            except (requests.RequestException, ValueError) as exc:
                data[endpoint] = []
                errors[endpoint] = str(exc)[:130]
        if not data["drivers"] or (not data["laps"] and not data["session_result"]):
            return jsonify(error="OpenF1 no ha entregado pilotos o tiempos históricos.",
                           errores=errors), 503
        data["errores_parciales"] = errors
        data["modo"] = "HISTÓRICO — NO EN DIRECTO"
        return jsonify(data)
    except (requests.RequestException, ValueError) as exc:
        return historical_error(exc)

@app.get("/api/historico/jolpica/<int:year>")
def clasificacion_jolpica(year):
    """Resultados reales de Q1/Q2/Q3; no ofrece sectores individuales."""
    if year < 2023 or year > 2026:
        return jsonify(error="Temporada no disponible"), 400
    try:
        resp = requests.get(
            f"https://api.jolpi.ca/ergast/f1/{year}/qualifying.json",
            params={"limit": 250},
            timeout=(5, 20),
            headers={"User-Agent": "RenegadosF1Live/1.0"})
        resp.raise_for_status()
        raw = resp.json()
        races = raw.get("MRData", {}).get("RaceTable", {}).get("Races", [])
        matches = [r for r in races if ("mexico" in str(r.get("raceName","")).lower()
                    or "rodr" in str(r.get("Circuit",{}).get("circuitName","")).lower()
                    or r.get("Circuit",{}).get("Location",{}).get("country","").lower() == "mexico")]
        if not matches:
            return jsonify(error="Todavía no hay clasificación de México publicada por Jolpica.",
                           proveedor="Jolpica", resultados=[]), 404
        r = matches[-1]
        rows = []
        for q in r.get("QualifyingResults", []):
            driver=q.get("Driver",{})
            rows.append({
                "posicion": q.get("position"),
                "numero": q.get("number"),
                "piloto": " ".join(filter(None,[driver.get("givenName"),driver.get("familyName")])),
                "siglas":driver.get("code"),
                "equipo":q.get("Constructor",{}).get("name"),
                "q1":q.get("Q1"), "q2":q.get("Q2"), "q3":q.get("Q3")
            })
        return jsonify(modo="HISTÓRICO", fuente="Jolpica", temporada=year,
                       gran_premio=r.get("raceName"), fecha=r.get("date"),
                       circuito=r.get("Circuit",{}).get("circuitName"),
                       resultados=rows, sectores_disponibles=False,
                       mensajes_fia_disponibles=False)
    except (requests.RequestException, ValueError) as exc:
        return jsonify(error="Tampoco se pudo consultar Jolpica.",
                       detalle=str(exc)[:150]),503

@app.get("/api/historico/mapa/<int:session_key>")
def mapa_historico(session_key):
    """Reconstruye la línea central desde posiciones GPS de una vuelta real."""
    try:
        sessions=historical("sessions",{"session_key":session_key})
        if not sessions:
            return jsonify(error="Sesión no encontrada"),404
        laps=historical("laps",{"session_key":session_key})
        candidate=next((l for l in laps if l.get("date_start") and l.get("lap_duration") and
                        65 < l["lap_duration"] < 180 and not l.get("is_pit_out_lap")),None)
        if not candidate:
            return jsonify(error="No hay una vuelta con coordenadas utilizables"),404
        from datetime import timedelta
        start=datetime.fromisoformat(candidate["date_start"].replace("Z","+00:00"))
        end=start+timedelta(seconds=float(candidate["lap_duration"]))
        params={"session_key":session_key,"driver_number":candidate["driver_number"],
                "date>=":start.isoformat(),"date<=":end.isoformat()}
        points=historical("location",params)
        coords=[{"x":p["x"],"y":p["y"],"fecha":p.get("date")}
                for p in points if isinstance(p.get("x"),(float,int)) and isinstance(p.get("y"),(float,int))]
        if len(coords)<30:
            return jsonify(error="OpenF1 no ha devuelto suficientes coordenadas GPS."),404
        step=max(1,len(coords)//450)
        return jsonify(session_key=session_key,driver_number=candidate["driver_number"],
                       modo="RECORRIDO GPS HISTÓRICO",coordenadas=coords[::step],
                       nota="Trazado reconstruido con GPS histórico de una vuelta, no posiciones actuales de los coches.")
    except (requests.RequestException,ValueError,KeyError,TypeError) as exc:
        return historical_error(exc)
