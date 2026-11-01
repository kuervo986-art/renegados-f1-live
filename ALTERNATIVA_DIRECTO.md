# Receptor alternativo de cronometraje (preparado, no activado)

Este proyecto mantiene el backend Flask de Render y el modo histórico.

## Fuente propuesta

Código de referencia: https://github.com/julesr0y/f1-livetiming-api

El receptor necesita un **servicio Node.js permanente** independiente del servicio Python ya creado. Ni el código abierto ni su licencia garantizan que el flujo de datos de Fórmula 1 esté disponible o que su redistribución esté permitida. Antes de publicar datos hay que revisar los términos aplicables.

## Puesta en marcha

1. Crear otro servicio web en Render desde el repositorio de referencia (requiere autorización desde la cuenta del propietario).
2. Usar el comando de construcción `npm install` y arranque `npm start`, con runtime Node.js y puerto determinado por `PORT`.
3. Comprobar `https://<nuevo-servicio>/api/status`: debe responder `status: CONNECTED`, `isConnected: true`, `lastMessageAt` reciente.
4. En el servicio **Python actual** de Render configurar la variable `F1_ALTERNATIVE_URL` con la URL base del nuevo servicio (sin `/api`).
5. Tras desplegar el backend, probar `/api/alternativa/diagnostico` y las rutas `/api/alternativa/status`, `/api/alternativa/timing`, `/api/alternativa/race-control`.

Las rutas alternas no cambian automáticamente el monitor: aún falta adaptar las estructuras de datos y validar con una carrera real. El backend devuelve error y no falsifica actualidad si la marca de transmisión falta o tiene más de 90 segundos.

**Estado actual:** ruta de integración preparada; servicio externo y permisos de datos pendientes; no se ha demostrado transmisión real.
