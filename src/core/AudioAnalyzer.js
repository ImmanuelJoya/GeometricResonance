export class AudioAnalyzer {
    constructor() {
        this.bands = 64;
        this.bandValues = new Float32Array(this.bands);
        this.bandPeaks = new Float32Array(this.bands);
        // Logarithmic frequency band edges for perceptually uniform distribution
        this.bandEdges = this._computeLogBandEdges(this.bands, 20, 20000);
        this.prevBandValues = new Float32Array(this.bands);
        this.onsetDecay = new Float32Array(this.bands);
        this._fftSmooth = null;
        this.beatInterval = 500; this.lastBeatTime = 0; this.beatGate = 0;
        this.bpmSmooth = 120; this.beatCount = 0; this.barCount = 0;
        this.spectralCentroid = 0.5; this.spectralFlux = 0; this.energy = 0;
        this.spectralSpread = 0; this.spectralRolloff = 0; this.spectralFlatness = 0;
        this.onsetKick = 0; this.onsetSnare = 0; this.onsetHihat = 0; this.onsetGlobal = 0;
        this._fluxHist = []; this._fluxKickHist = []; this._fluxSnareHist = []; this._fluxHihatHist = [];
        this._lastOnsetT = 0; this._lastKickT = 0; this._lastSnareT = 0; this._lastHihatT = 0;
        this.rms = 0; this.rmsSmooth = 0.06; this.rmsPeak = 0;
        this.sampleRate = 48000; this.fftSize = 8192;
        this.rootNote = NaN; this.noteName = '--'; this.chroma = new Float32Array(12);
        this._noteBins = new Float32Array(12);
        this.smoothSubBass = 0; this.smoothBass = 0; this.smoothLowMid = 0;
        this.smoothMid = 0; this.smoothHighMid = 0; this.smoothHigh = 0; this.smoothBrilliance = 0;
        // Enhanced envelope followers with attack/release
        this._envSubBass = 0; this._envBass = 0; this._envMid = 0; this._envHigh = 0;
        this._tMs = 0;
        // Transient sharpness - how "punchy" the current moment is
        this.transientSharpness = 0;
        // Harmonic content detection
        this.harmonicRatio = 0;
    }

    _computeLogBandEdges(numBands, minHz, maxHz) {
        // Create logarithmically spaced frequency band edges for perceptual accuracy
        const edges = new Float32Array(numBands + 1);
        const logMin = Math.log10(minHz);
        const logMax = Math.log10(maxHz);
        for (let i = 0; i <= numBands; i++) {
            edges[i] = Math.pow(10, logMin + (i / numBands) * (logMax - logMin));
        }
        return edges;
    }

    setFFTInfo(fftSize, sampleRate) {
        this.fftSize = fftSize;
        this.sampleRate = sampleRate;
        this.bandEdges = this._computeLogBandEdges(this.bands, 20, Math.min(20000, sampleRate / 2));
    }
    _median(arr) { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); const mid = (a.length - 1) * 0.5; return lerp(a[Math.floor(mid)], a[Math.ceil(mid)], mid - Math.floor(mid)); }
    _mad(arr, med) { return this._median(arr.map(v => Math.abs(v - med))) + 1e-6; }
    _adaptiveThreshold(history, k = 2.6) { const med = this._median(history); return med + k * this._mad(history, med); }
    _ensureFftSmooth(n) { if (!this._fftSmooth || this._fftSmooth.length !== n) this._fftSmooth = new Float32Array(n); }
    _noteName(pc) { return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][(pc | 0) % 12]; }

    analyze(freqData, timeData, dt, freqL = null, freqR = null, smoothingAlpha = 0.18) {
        this._tMs += dt * 1000;
        const N = freqData.length;
        this._ensureFftSmooth(N);

        // Adaptive smoothing - less smoothing during transients for sharper response
        const baseAlpha = clamp(smoothingAlpha, 0.05, 0.4);

        // Convert to normalized amplitude with proper dB scaling
        const hzPerBin = this.sampleRate / this.fftSize;
        // (perf) removed unused prev FFT copy that could cause periodic GC stutters
        for (let i = 0; i < N; i++) {
            // Convert byte to linear amplitude (0-1) with slight curve for better dynamics
            const linear = Math.pow(freqData[i] / 255, 1.2);
            // Adaptive alpha - faster attack, slower release
            const a = linear > this._fftSmooth[i] ? Math.min(baseAlpha * 2.5, 0.7) : baseAlpha;
            this._fftSmooth[i] = lerp(this._fftSmooth[i], linear, a);
        }

        // Compute logarithmic frequency bands for perceptual accuracy
        let sumEnergy = 0, sumCentroid = 0, sumCentroidWeight = 0;
        let geoMean = 0, arithmeticMean = 0;

        for (let b = 0; b < this.bands; b++) {
            const lowHz = this.bandEdges[b];
            const highHz = this.bandEdges[b + 1];
            const startBin = Math.max(1, Math.floor(lowHz / hzPerBin));
            const endBin = Math.min(N - 1, Math.ceil(highHz / hzPerBin));

            let v = 0, w = 0;
            for (let i = startBin; i <= endBin; i++) {
                // Weight by frequency for better high-frequency response
                const weight = 1.0 + (i / N) * 0.5;
                v += this._fftSmooth[i] * weight;
                w += weight;
            }
            const val = w > 0 ? v / w : 0;
            this.bandValues[b] = val;
            this.bandPeaks[b] = Math.max(this.bandPeaks[b] * 0.97, val);

            const centerHz = (lowHz + highHz) / 2;
            sumCentroid += (b / this.bands) * val;
            sumCentroidWeight += val;
            sumEnergy += val * val; // Energy as sum of squared amplitudes

            // For spectral flatness (geometric mean / arithmetic mean)
            arithmeticMean += val;
            geoMean += val > 0.001 ? Math.log(val + 0.001) : Math.log(0.001);
        }

        this.spectralCentroid = sumCentroidWeight > 1e-6 ? sumCentroid / sumCentroidWeight : 0.5;
        arithmeticMean /= this.bands;
        geoMean = Math.exp(geoMean / this.bands);
        this.spectralFlatness = arithmeticMean > 0.001 ? geoMean / arithmeticMean : 0;

        // Spectral flux - measures change in spectrum (great for onset detection)
        let flux = 0, fluxKick = 0, fluxSnare = 0, fluxHihat = 0;
        for (let b = 0; b < this.bands; b++) {
            const dv = this.bandValues[b] - this.prevBandValues[b];
            const pos = Math.max(0, dv);
            const rectified = pos * pos; // Square for emphasis on large changes
            flux += rectified;

            // Frequency-specific onset detection
            const hz = (this.bandEdges[b] + this.bandEdges[b + 1]) / 2;
            if (hz < 150) fluxKick += rectified * 2.0; // Sub-bass and bass (kick drums)
            else if (hz >= 150 && hz < 400) fluxKick += rectified * 0.5; // Upper bass
            else if (hz >= 200 && hz < 2000) fluxSnare += rectified; // Snare body
            else if (hz >= 4000) fluxHihat += rectified * 1.5; // Hi-hats and cymbals

            this.onsetDecay[b] = Math.max(this.onsetDecay[b] * 0.82, clamp(pos * 2.8, 0, 1));
            this.prevBandValues[b] = this.bandValues[b];
        }
        flux = Math.sqrt(flux);
        fluxKick = Math.sqrt(fluxKick);
        fluxSnare = Math.sqrt(fluxSnare);
        fluxHihat = Math.sqrt(fluxHihat);

        const pushHist = (arr, v, maxLen) => { arr.push(v); if (arr.length > maxLen) arr.shift(); };
        pushHist(this._fluxHist, flux, 60);
        pushHist(this._fluxKickHist, fluxKick, 50);
        pushHist(this._fluxSnareHist, fluxSnare, 50);
        pushHist(this._fluxHihatHist, fluxHihat, 40);

        // Improved onset detection with separate cooldowns for different instruments
        const now = this._tMs;
        const trigOnset = (v, thr, ref, cooldown, sensitivity = 2.4) => {
            if (v > thr && (now - this[ref]) > cooldown) {
                this[ref] = now;
                return clamp((v / thr - 1.0) * sensitivity, 0.5, 1.5); // Proportional to how much over threshold
            }
            return 0.0;
        };

        const gOn = trigOnset(flux, this._adaptiveThreshold(this._fluxHist, 2.2), '_lastOnsetT', 80);
        const kOn = trigOnset(fluxKick, this._adaptiveThreshold(this._fluxKickHist, 2.0), '_lastKickT', 150, 3.0);
        const sOn = trigOnset(fluxSnare, this._adaptiveThreshold(this._fluxSnareHist, 2.2), '_lastSnareT', 100);
        const hOn = trigOnset(fluxHihat, this._adaptiveThreshold(this._fluxHihatHist, 2.5), '_lastHihatT', 50);

        // Smoother decay with different rates per instrument type
        this.onsetGlobal = Math.max(gOn, this.onsetGlobal * 0.88);
        this.onsetKick = Math.max(kOn, this.onsetKick * 0.78); // Slower decay for punchy feel
        this.onsetSnare = Math.max(sOn, this.onsetSnare * 0.82);
        this.onsetHihat = Math.max(hOn, this.onsetHihat * 0.90); // Fast decay for hi-hats

        this.spectralFlux = clamp(flux * 0.8, 0, 2.5);

        // Transient sharpness - combination of all onset signals
        this.transientSharpness = clamp(
            this.onsetKick * 1.2 + this.onsetSnare * 0.8 + this.onsetHihat * 0.5 + this.onsetGlobal * 0.3,
            0, 2.0
        );

        // RMS with proper envelope following
        if (timeData && timeData.length) {
            let sum = 0, zeroCrossings = 0;
            for (let i = 0; i < timeData.length; i++) {
                const sample = (timeData[i] - 128) / 128;
                sum += sample * sample;
                if (i > 0) {
                    const prev = (timeData[i - 1] - 128) / 128;
                    if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) zeroCrossings++;
                }
            }
            this.rms = Math.sqrt(sum / timeData.length);
            // Zero crossing rate hints at high frequency content
            this.harmonicRatio = clamp(zeroCrossings / timeData.length * 50, 0, 1);
        }

        // Envelope follower with faster attack, slower release
        const attackTime = 0.005, releaseTime = 0.15;
        const attackCoeff = 1 - Math.exp(-dt / attackTime);
        const releaseCoeff = 1 - Math.exp(-dt / releaseTime);
        const envCoeff = this.rms > this.rmsSmooth ? attackCoeff : releaseCoeff;
        this.rmsSmooth = this.rmsSmooth + (this.rms - this.rmsSmooth) * envCoeff;
        this.rmsPeak = Math.max(this.rmsPeak * 0.9995, this.rmsSmooth);

        // Enhanced multi-band smoothing with attack/release envelopes
        const computeBandEnergy = (startBand, endBand) => {
            let sum = 0;
            for (let i = startBand; i <= endBand && i < this.bands; i++) sum += this.bandValues[i];
            return sum / (endBand - startBand + 1);
        };

        // More frequency bands for finer control
        const rawSubBass = computeBandEnergy(0, 3);    // 20-60 Hz
        const rawBass = computeBandEnergy(4, 8);       // 60-200 Hz
        const rawLowMid = computeBandEnergy(9, 16);    // 200-600 Hz
        const rawMid = computeBandEnergy(17, 28);      // 600-2kHz
        const rawHighMid = computeBandEnergy(29, 40);  // 2k-6kHz
        const rawHigh = computeBandEnergy(41, 52);     // 6k-12kHz
        const rawBrilliance = computeBandEnergy(53, 63); // 12k-20kHz

        // Per-band envelope followers
        const updateEnv = (current, target, attack, release) => {
            const coeff = target > current ? attack : release;
            return current + (target - current) * coeff;
        };
        const fastAttack = 1 - Math.pow(0.001, dt * 12.0);
        const medAttack = 1 - Math.pow(0.001, dt * 6.0);
        const slowRelease = 1 - Math.pow(0.001, dt * 1.5);
        const medRelease = 1 - Math.pow(0.001, dt * 2.5);

        this.smoothSubBass = updateEnv(this.smoothSubBass, rawSubBass, fastAttack, slowRelease);
        this.smoothBass = updateEnv(this.smoothBass, rawBass, fastAttack, slowRelease);
        this.smoothLowMid = updateEnv(this.smoothLowMid, rawLowMid, medAttack, medRelease);
        this.smoothMid = updateEnv(this.smoothMid, rawMid, medAttack, medRelease);
        this.smoothHighMid = updateEnv(this.smoothHighMid, rawHighMid, medAttack, medRelease);
        this.smoothHigh = updateEnv(this.smoothHigh, rawHigh, fastAttack, medRelease);
        this.smoothBrilliance = updateEnv(this.smoothBrilliance, rawBrilliance, fastAttack, medRelease);

        // Composite energy with perceptual weighting
        this.energy = clamp(
            0.25 * this.smoothSubBass +
            0.30 * this.smoothBass +
            0.15 * this.smoothLowMid +
            0.15 * this.smoothMid +
            0.10 * this.smoothHighMid +
            0.05 * this.smoothHigh,
            0, 1.5
        );

        // Beat detection with tempo tracking
        let isBeat = false;
        if (kOn > 0.3 && (now - this.lastBeatTime) > 180 && this.beatGate <= 0) {
            isBeat = true;
            const interval = now - this.lastBeatTime;
            if (this.lastBeatTime > 0 && interval > 180 && interval < 2500) {
                // Weighted average with recency bias
                this.beatInterval = lerp(this.beatInterval, interval, 0.25);
                this.bpmSmooth = lerp(this.bpmSmooth, 60000 / this.beatInterval, 0.15);
            }
            this.lastBeatTime = now;
            this.beatCount++;
            if (this.beatCount % 4 === 0) this.barCount++;
            this.beatGate = 100;
        }
        this.beatGate = Math.max(0, this.beatGate - dt * 1000);

        // Chroma / pitch class detection for synesthesia
        if (this._fftSmooth) {
            this.chroma.fill(0);
            for (let i = 4; i < Math.min(400, N); i++) {
                const freq = i * hzPerBin;
                if (freq > 30 && freq < 4000) {
                    const midi = 69 + 12 * Math.log2(freq / 440);
                    const chroma = ((Math.round(midi) % 12) + 12) % 12;
                    this.chroma[chroma] += this._fftSmooth[i];
                }
            }
            // Find dominant pitch class
            let maxVal = 0, maxIdx = 0;
            for (let i = 0; i < 12; i++) {
                if (this.chroma[i] > maxVal) { maxVal = this.chroma[i]; maxIdx = i; }
            }
            if (maxVal > 0.1) {
                this.rootNote = maxIdx;
                this.noteName = this._noteName(this.rootNote);
            }
        }
        return isBeat;
    }
    getBand(i) { return this.bandValues[Math.min(i, this.bands - 1)]; }
    getOnset(i) { return this.onsetDecay[Math.min(i, this.bands - 1)]; }
    getBPM() { return Math.round(Number.isFinite(this.bpmSmooth) ? this.bpmSmooth : 60000 / clamp(this.beatInterval, 240, 2000)); }
}

    const audio = new AudioAnalyzer();
