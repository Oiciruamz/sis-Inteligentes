export function computeRms(signal: number[]): number {
  if (signal.length === 0) {
    return 0;
  }

  const energy = signal.reduce((acc, sample) => acc + sample * sample, 0);
  return Math.sqrt(energy / signal.length);
}

export function computeZcr(signal: number[]): number {
  if (signal.length < 2) {
    return 0;
  }

  let crossings = 0;
  for (let i = 1; i < signal.length; i += 1) {
    const prev = signal[i - 1];
    const current = signal[i];
    if ((prev >= 0 && current < 0) || (prev < 0 && current >= 0)) {
      crossings += 1;
    }
  }

  return crossings / (signal.length - 1);
}

export function splitIntoFrames(
  signal: number[],
  frameSize = 1024,
  hopSize = 512
): number[][] {
  if (signal.length < frameSize) {
    return [signal];
  }

  const frames: number[][] = [];
  for (let i = 0; i + frameSize <= signal.length; i += hopSize) {
    frames.push(signal.slice(i, i + frameSize));
  }
  return frames;
}
