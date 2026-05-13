# ClearSpace — Backend de Inferencia

Servidor FastAPI que expone el modelo `MLPClassifier` entrenado para clasificar el entorno acústico en **Favorable / Moderado / No Favorable**.

## Requisitos

- Python 3.10+
- Los archivos `modelo_concentracion.pkl` y `scaler_concentracion.pkl` deben estar en `../assets/models/` (ya están en el repo).

## Instalación

```bash
# Desde la raíz del proyecto
cd backend

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

## Ejecutar el servidor

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

El servidor queda disponible en `http://localhost:8000`.

## Endpoints

### `GET /health`
Verifica que el servidor y los modelos están cargados.

```json
{ "status": "ok", "model_loaded": true }
```

### `POST /analyze`
Recibe un archivo de audio y devuelve la clasificación.

**Request:** `multipart/form-data` con campo `file` (WAV, MP3, M4A, etc.)

**Response:**
```json
{
  "label": "Favorable",
  "score": 0.91,
  "features": {
    "rms": 0.0032,
    "zcr": 0.045,
    "spectral_centroid": 1840.5,
    "mfcc": [-120.3, 42.1, ...],
    "analyzed_seconds": 3.2
  }
}
```

**Posibles clases:** `Favorable`, `Moderado`, `No Favorable`

## Documentación interactiva

Con el servidor corriendo, visita:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc:       `http://localhost:8000/redoc`

## Notas

- Si el servidor no está disponible, la app móvil cae automáticamente a clasificación heurística local.
- Para exponer el servidor a un dispositivo físico (no emulador), reemplaza `localhost` por la IP local de tu máquina (e.g. `192.168.1.x`) y ajusta `BACKEND_URL` en `lib/audio/audioAnalyzer.ts`.
