import os
import joblib
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import librosa
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

_MODELS_DIR = Path(__file__).resolve().parent.parent / "assets" / "models"
_MODEL_PATH = _MODELS_DIR / "modelo_concentracion.pkl"
_SCALER_PATH = _MODELS_DIR / "scaler_concentracion.pkl"

model = None
scaler = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, scaler
    with open(_MODEL_PATH, "rb") as f:
        model = joblib.load(_MODEL_PATH)
    with open(_SCALER_PATH, "rb") as f:
        scaler = joblib.load(_SCALER_PATH)
    yield


app = FastAPI(title="ClearSpace Audio Classifier", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _extract_features(audio_path: str) -> tuple[np.ndarray, float]:
    """Return (feature_vector shape (1,16), duration_seconds)."""
    y, sr = librosa.load(audio_path, sr=None, mono=True)

    rms = float(np.mean(librosa.feature.rms(y=y)))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=y)))
    spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    mfcc_means = np.mean(librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13), axis=1).tolist()

    features = np.array([[rms, zcr, spectral_centroid, *mfcc_means]])
    duration = librosa.get_duration(y=y, sr=sr)
    return features, duration


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": model is not None}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)) -> dict:
    if model is None or scaler is None:
        raise HTTPException(status_code=503, detail="Modelos no cargados")

    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        features, duration = _extract_features(tmp_path)
        features_scaled = scaler.transform(features)

        label: str = model.predict(features_scaled)[0]
        proba: np.ndarray = model.predict_proba(features_scaled)[0]
        score = float(np.max(proba))

        raw = features[0].tolist()
        names = ["rms", "zcr", "spectral_centroid",
                 *[f"mfcc_{i}" for i in range(1, 14)]]
        print("\n--- /analyze inference ---")
        print(f"  label : {label}")
        print(f"  score : {score:.4f}")
        for name, val in zip(names, raw):
            print(f"  {name:<20} {val:.6f}")
        print("--------------------------\n")
        return {
            "label": label,
            "score": score,
            "features": {
                "rms": raw[0],
                "zcr": raw[1],
                "spectral_centroid": raw[2],
                "mfcc": raw[3:],
                "analyzed_seconds": duration,
            },
        }
    finally:
        os.unlink(tmp_path)
