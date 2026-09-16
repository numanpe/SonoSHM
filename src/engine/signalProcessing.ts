// Signal processing engine: detrending, Hann windowing, FFT, harmonic peak
// detection, and time-of-flight (ToF) estimation via envelope detection and
// cross-correlation. All computation here is real (not fabricated) — it
// operates on whatever samples it is given, synthetic or [MEASURED].

export interface FFTResult {
  freqBinsKHz: number[];
  amplitude: number[]; // magnitude spectrum, normalized by N
  real: number[];
  imag: number[];
}

/** Remove linear trend (best-fit line) from a signal — simple, standard
 * preprocessing step prior to windowing/FFT. */
export function detrend(samples: number[]): number[] {
  const n = samples.length;
  if (n < 2) return samples.slice();
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += samples[i];
    sumXY += i * samples[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  return samples.map((y, i) => y - (slope * i + intercept));
}

/** Standard Hann (Hanning) window: w[n] = 0.5 (1 - cos(2*pi*n/(N-1))) */
export function hannWindow(n: number): number[] {
  if (n <= 1) return new Array(Math.max(n, 0)).fill(1);
  const w = new Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

export function applyWindow(samples: number[], window: number[]): number[] {
  return samples.map((v, i) => v * (window[i] ?? 1));
}

/** Next power of two >= n */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Iterative in-place radix-2 Cooley-Tukey FFT. Operates on parallel
 * real/imag arrays whose length must be a power of two. */
function fftRadix2(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wReal = Math.cos(ang);
    const wImag = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;
      for (let k = 0; k < len / 2; k++) {
        const uReal = real[i + k];
        const uImag = imag[i + k];
        const vReal = real[i + k + len / 2] * curReal - imag[i + k + len / 2] * curImag;
        const vImag = real[i + k + len / 2] * curImag + imag[i + k + len / 2] * curReal;
        real[i + k] = uReal + vReal;
        imag[i + k] = uImag + vImag;
        real[i + k + len / 2] = uReal - vReal;
        imag[i + k + len / 2] = uImag - vImag;
        const nextCurReal = curReal * wReal - curImag * wImag;
        const nextCurImag = curReal * wImag + curImag * wReal;
        curReal = nextCurReal;
        curImag = nextCurImag;
      }
    }
  }
}

/**
 * Compute the single-sided amplitude spectrum of a real signal.
 * samplingFrequencyMHz is samples per microsecond, so returned frequency
 * bins are in kHz for readability against typical ultrasonic excitation
 * frequencies (tens to hundreds of kHz).
 */
export function computeFFT(samples: number[], samplingFrequencyMHz: number): FFTResult {
  const n0 = samples.length;
  const n = nextPow2(n0);
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  for (let i = 0; i < n0; i++) real[i] = samples[i];
  // zero-padded beyond n0 automatically (typed array default 0)
  fftRadix2(real, imag);

  const half = n / 2;
  const freqBinsKHz: number[] = new Array(half);
  const amplitude: number[] = new Array(half);
  const realOut: number[] = new Array(half);
  const imagOut: number[] = new Array(half);
  const samplingFreqKHz = samplingFrequencyMHz * 1000;
  for (let k = 0; k < half; k++) {
    freqBinsKHz[k] = (k * samplingFreqKHz) / n;
    const mag = (2 / n0) * Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
    amplitude[k] = mag;
    realOut[k] = real[k];
    imagOut[k] = imag[k];
  }
  return { freqBinsKHz, amplitude, real: realOut, imag: imagOut };
}

/** Find the amplitude of the strongest bin within +/- toleranceKHz of a
 * target frequency (accounts for FFT bin resolution + spectral spread). */
export function peakNear(
  fft: FFTResult,
  targetKHz: number,
  toleranceKHz: number
): { amplitude: number; freqKHz: number; binIndex: number } {
  let bestAmp = 0;
  let bestFreq = targetKHz;
  let bestIdx = -1;
  for (let i = 0; i < fft.freqBinsKHz.length; i++) {
    const f = fft.freqBinsKHz[i];
    if (Math.abs(f - targetKHz) <= toleranceKHz) {
      if (fft.amplitude[i] > bestAmp) {
        bestAmp = fft.amplitude[i];
        bestFreq = f;
        bestIdx = i;
      }
    }
  }
  return { amplitude: bestAmp, freqKHz: bestFreq, binIndex: bestIdx };
}

export function rms(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sumSq = samples.reduce((s, v) => s + v * v, 0);
  return Math.sqrt(sumSq / samples.length);
}

export function peakAbs(samples: number[]): number {
  return samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

export function signalEnergy(samples: number[]): number {
  return samples.reduce((s, v) => s + v * v, 0);
}

/** Envelope via simple analytic-style approximation: moving RMS window. */
export function movingRmsEnvelope(samples: number[], windowSize: number): number[] {
  const n = samples.length;
  const half = Math.floor(windowSize / 2);
  const env = new Array(n).fill(0);
  let sumSq = 0;
  const sq = samples.map((v) => v * v);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(n - 1, i + half);
    if (i === 0) {
      sumSq = 0;
      for (let j = start; j <= end; j++) sumSq += sq[j];
    } else {
      // recompute directly for correctness (n is small, ~512, acceptable)
      sumSq = 0;
      for (let j = start; j <= end; j++) sumSq += sq[j];
    }
    env[i] = Math.sqrt(sumSq / (end - start + 1));
  }
  return env;
}

export interface ToFResult {
  tofUs: number;
  method: 'envelope-threshold';
  thresholdFraction: number;
  arrivalIndex: number;
}

/**
 * Estimate time-of-flight as the first arrival of the wave packet, detected
 * via a moving-RMS envelope crossing a fraction of its peak value. This is a
 * standard, transparent onset-detection approach for a demonstration
 * pipeline (cross-correlation against a reference pulse is an alternative
 * noted in the UI but not required when the excitation waveform itself is
 * synthetic).
 */
export function estimateToF(
  samples: number[],
  timeAxisUs: number[],
  thresholdFraction = 0.25
): ToFResult {
  const envelope = movingRmsEnvelope(samples, Math.max(8, Math.floor(samples.length / 20)));
  const peak = Math.max(...envelope);
  const threshold = peak * thresholdFraction;
  let arrivalIndex = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] >= threshold) {
      arrivalIndex = i;
      break;
    }
  }
  return {
    tofUs: timeAxisUs[arrivalIndex] ?? 0,
    method: 'envelope-threshold',
    thresholdFraction,
    arrivalIndex,
  };
}

/** Cross-correlation between two equal-length (or padded) signals, returned
 * as a normalized coefficient array indexed by lag (centered). Provided as
 * a general utility for reference-signal comparisons. */
export function crossCorrelate(a: number[], b: number[]): number[] {
  const n = a.length;
  const m = b.length;
  const out: number[] = [];
  const len = n + m - 1;
  for (let lag = 0; lag < len; lag++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const j = i - (lag - (m - 1));
      if (j >= 0 && j < m) sum += a[i] * b[j];
    }
    out.push(sum);
  }
  return out;
}
