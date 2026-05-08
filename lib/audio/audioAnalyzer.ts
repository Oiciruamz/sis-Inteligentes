import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { computeRms, computeZcr, splitIntoFrames } from '@/lib/audio/dsp';

export type ConcentrationLabel = 'Favorable' | 'Moderado' | 'No Favorable';

export type AudioFeatures = {
  rms: number;
  zcr: number;
  spectralCentroid: number;
  mfcc: number[];
  analyzedSeconds: number;
};

export type InferenceResult = {
  label: ConcentrationLabel;
  score: number;
  features: AudioFeatures;
  usedModelFiles: boolean;
};

function getFileExtension(uri: string): string {
  const match = uri.match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : '';
}

function isUnsupportedCompressedAudioExtension(extension: string): boolean {
  return ['.m4a', '.aac', '.mp4', '.caf', '.3gp', '.webm'].includes(extension);
}

function bytesToSignal(bytes: Uint8Array): number[] {
  if (!bytes.length) {
    return [];
  }

  const maxSamples = 12000;
  const step = Math.max(1, Math.floor(bytes.length / maxSamples));
  const signal: number[] = [];

  for (let i = 0; i < bytes.length; i += step) {
    signal.push((bytes[i] - 128) / 128);
  }

  return signal;
}

async function decodeWebAudioToSignal(uri: string): Promise<{ signal: number[]; sampleRate: number }> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const AudioContextRef =
    globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextRef) {
    throw new Error('AudioContext no disponible en este navegador.');
  }

  const audioContext = new AudioContextRef();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

  // Mezcla a mono para DSP estable.
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);

  for (let c = 0; c < channels; c += 1) {
    const channelData = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      mono[i] += channelData[i] / channels;
    }
  }

  await audioContext.close();
  return { signal: Array.from(mono), sampleRate: audioBuffer.sampleRate };
}

function base64FallbackToSignal(base64: string): number[] {
  const safeBase64 = base64.slice(0, 12000);
  return safeBase64.split('').map((char) => (char.charCodeAt(0) - 128) / 128);
}

function base64ToBytes(base64: string): Uint8Array | null {
  if (typeof atob !== 'function') {
    return null;
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function computeAverage(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export async function extractFeaturesFromAudioFile(uri: string): Promise<AudioFeatures> {
  let signal: number[] = [];
  let sampleRate = 16000;

  // Web suele entregar blob: URIs; en móvil normalmente file://
  if (Platform.OS === 'web' && (uri.startsWith('blob:') || uri.startsWith('http'))) {
    const decoded = await decodeWebAudioToSignal(uri);
    signal = decoded.signal;
    sampleRate = decoded.sampleRate;
  } else {
    const extension = getFileExtension(uri);
    if (isUnsupportedCompressedAudioExtension(extension)) {
      throw new Error(
        `El archivo grabado tiene extensión ${extension}, que no se puede analizar como bytes directos. ` +
          'En dispositivos móviles, use un formato PCM/WAV o habilite metering para evitar resultados erróneos.'
      );
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    const bytes = base64ToBytes(base64);
    signal = bytes ? bytesToSignal(bytes) : base64FallbackToSignal(base64);
  }

  const frames = splitIntoFrames(signal);
  const rms = computeAverage(frames.map((frame) => computeRms(frame)));
  const zcr = computeAverage(frames.map((frame) => computeZcr(frame)));
  const analyzedSeconds = signal.length > 0 ? signal.length / sampleRate : 0;

  return {
    rms,
    zcr,
    spectralCentroid: 0,
    mfcc: Array.from({ length: 13 }, () => 0),
    analyzedSeconds,
  };
}

function classifyByHeuristic(features: AudioFeatures): InferenceResult {
  const score = Math.max(
    0,
    Math.min(1, 1 - (features.rms / 0.12) * 0.7 - (features.zcr / 0.15) * 0.3)
  );

  if (features.rms >= 0.09 || features.zcr >= 0.12) {
    return { label: 'No Favorable', score, features, usedModelFiles: false };
  }
  if (features.rms >= 0.04 || features.zcr >= 0.06) {
    return { label: 'Moderado', score, features, usedModelFiles: false };
  }
  return { label: 'Favorable', score, features, usedModelFiles: false };
}

function normalizeRecordingLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;

  // Exact zero: treat as silence (or unavailable) -> 0
  if (level === 0) return 0;

  // Negative values are usually dBFS (e.g., -60..-1) -> convert to linear
  if (level < 0) {
    // dB -> linear amplitude: linear = 10^(dB/20)
    const linear = Math.pow(10, level / 20);
    return Math.min(1, Math.max(0, linear));
  }

  // If value in (0..1), assume it's already linear amplitude
  if (level > 0 && level <= 1) {
    return Math.min(1, level);
  }

  // If value looks like a percentage (0..100)
  if (level > 1 && level <= 100) {
    return Math.min(1, level / 100);
  }

  // Fallback: normalize large integer samples
  return Math.min(1, level / 32768);
}

function classifyByRecordingLevel(level: number): InferenceResult {
  const normalizedRms = normalizeRecordingLevel(level);
  const features: AudioFeatures = {
    rms: normalizedRms,
    zcr: 0,
    spectralCentroid: 0,
    mfcc: Array.from({ length: 13 }, () => 0),
    analyzedSeconds: 0,
  };

  const result = classifyByHeuristic(features);
  return {
    ...result,
    features,
    usedModelFiles: false,
  };
}

export async function runConcentrationInference(
  uri: string,
  modelUris?: { modelPklUri?: string; scalerPklUri?: string },
  recordingLevel?: number
): Promise<InferenceResult> {
  try {
    const features = await extractFeaturesFromAudioFile(uri);
    const hasModelFiles = Boolean(modelUris?.modelPklUri && modelUris?.scalerPklUri);

    const result = classifyByHeuristic(features);
    return {
      ...result,
      usedModelFiles: hasModelFiles,
    };
  } catch (error) {
    if (typeof recordingLevel === 'number') {
      return classifyByRecordingLevel(recordingLevel);
    }
    throw error;
  }
}
