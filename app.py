"""Servidor de diagnóstico RENEGADOS F1 LIVE.
No simula datos en directo; permite verificar el despliegue y la accesibilidad.
"""
from datetime import datetime, timezone
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.get("/")
def inicio():
    return jsonify({
        "proyecto": "RENEGADOS F1 LIVE",
        "estado": "servidor en funcionamiento",
        "nota": "El receptor de cronometraje todavía no está conectado.",
        "idioma": "es"
    })

@app.get("/api/salud")
def salud():
    return jsonify({
        "correcto": True,
        "servidor": "operativo",
        "hora_utc": datetime.now(timezone.utc).isoformat()
    })

@app.get("/api/estado")
def estado():
    return jsonify({
        "conectado": False,
        "directo_confirmado": False,
        "mensaje": "Servidor operativo. Conexión con el cronometraje de F1 pendiente de implementar y validar.",
        "pilotos": [],
        "mensajes_fia": [],
        "actualizado_utc": datetime.now(timezone.utc).isoformat()
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
