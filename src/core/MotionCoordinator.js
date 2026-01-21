// ========================================================================
// MOTION COORDINATOR V2 - Ultra-smooth motion with configurable smoothness
// ========================================================================
export class MotionCoordinator {
    constructor() {
        // === OUTPUT VALUES (what visual elements should READ) ===
        this.pulse = 0;           // Main beat pulse (0-1)
        this.impact = 0;          // Sharp transients (0-1)
        this.swell = 0;           // Sustained energy (0-1), VERY slow
        this.breathe = 0;         // Bar-locked breathing (0-1)

        // Frequency motion (heavily smoothed)
        this.lowMotion = 0;
        this.midMotion = 0;
        this.highMotion = 0;

        // Pre-computed suggestions
        this.scaleSuggestion = 1;
        this.zoomSuggestion = 0;

        // === INTERNAL: Raw targets (before smoothing) ===
        this._pulseRaw = 0;
        this._impactRaw = 0;
        this._swellRaw = 0;
        this._lowRaw = 0;
        this._midRaw = 0;
        this._highRaw = 0;

        // === INTERNAL: Second-order smoothing (for extra smoothness) ===
        this._pulseSmooth1 = 0;
        this._pulseSmooth2 = 0;
        this._swellSmooth1 = 0;
        this._swellSmooth2 = 0;

        // === INTERNAL: Timing ===
        this._lastBeatTime = 0;
        this._beatLockout = 0;
        this._breathePhase = 0;
    }

    update(audio, dt, musicPhase, smoothness = 0.7) {
        const now = performance.now();

        // Smoothness affects all lerp rates
        // smoothness 0 = reactive (fast lerps)
        // smoothness 1 = ultra smooth (very slow lerps)
        const smoothFactor = 0.3 + smoothness * 0.7; // 0.3 to 1.0
        const lerpSlow = dt * (1.5 - smoothFactor * 1.2);   // 1.5 to 0.3
        const lerpMed = dt * (4.0 - smoothFactor * 3.0);    // 4.0 to 1.0
        const lerpFast = dt * (8.0 - smoothFactor * 5.0);   // 8.0 to 3.0

        // === BEAT PULSE ===
        // Longer lockout at higher smoothness to prevent rapid beats
        const beatLockoutTime = 150 + smoothness * 200; // 150-350ms

        if (audio.onsetKick > 0.4 && this._beatLockout <= 0) {
            // Scale pulse intensity by how strong the beat is
            this._pulseRaw = clamp(audio.onsetKick * 0.9, 0.5, 1.0);
            this._beatLockout = beatLockoutTime;
            this._lastBeatTime = now;
        }
        this._beatLockout = Math.max(0, this._beatLockout - dt * 1000);

        // Decay rate affected by smoothness
        const pulseDecayRate = 0.92 + smoothness * 0.06; // 0.92 to 0.98
        this._pulseRaw *= pulseDecayRate;

        // TWO-STAGE smoothing for pulse (removes jitter)
        this._pulseSmooth1 = lerp(this._pulseSmooth1, this._pulseRaw, lerpFast);
        this._pulseSmooth2 = lerp(this._pulseSmooth2, this._pulseSmooth1, lerpMed);
        this.pulse = this._pulseSmooth2;

        // === IMPACT (sharp transients) ===
        // At high smoothness, we basically disable sharp transients
        const impactInfluence = 1.0 - smoothness * 0.8; // 1.0 to 0.2
        const rawImpact = (audio.onsetSnare * 0.5 + audio.onsetHihat * 0.3) * impactInfluence;
        this._impactRaw = Math.max(this._impactRaw * 0.9, rawImpact);
        this.impact = lerp(this.impact, this._impactRaw, lerpFast);

        // === SWELL (sustained energy) ===
        // This is intentionally VERY slow - tracks overall song energy
        const targetSwell = audio.energy * 0.7 + audio.rmsSmooth * 0.3;
        this._swellRaw = lerp(this._swellRaw, targetSwell, dt * (0.5 - smoothness * 0.35)); // Very slow

        // Two-stage smoothing for swell
        this._swellSmooth1 = lerp(this._swellSmooth1, this._swellRaw, lerpSlow);
        this._swellSmooth2 = lerp(this._swellSmooth2, this._swellSmooth1, lerpSlow);
        this.swell = this._swellSmooth2;

        // === BREATHE (tempo-locked gentle motion) ===
        const bpm = audio.getBPM() || 120;
        this._breathePhase += dt * (bpm / 60) * 0.25; // Quarter-note cycle
        // Sine wave breathing, scaled by swell
        this.breathe = (Math.sin(this._breathePhase * Math.PI * 2) * 0.5 + 0.5) * this.swell * 0.7;

        // === FREQUENCY BANDS (heavily smoothed) ===
        const lowTarget = (audio.smoothSubBass + audio.smoothBass) * 0.5;
        const midTarget = (audio.smoothLowMid + audio.smoothMid) * 0.5;
        const highTarget = (audio.smoothHighMid + audio.smoothHigh) * 0.5;

        // Extra smoothing layer
        this._lowRaw = lerp(this._lowRaw, lowTarget, lerpMed);
        this._midRaw = lerp(this._midRaw, midTarget, lerpMed);
        this._highRaw = lerp(this._highRaw, highTarget, lerpMed);

        // Final output with additional smoothing
        this.lowMotion = lerp(this.lowMotion, this._lowRaw, lerpSlow);
        this.midMotion = lerp(this.midMotion, this._midRaw, lerpSlow);
        this.highMotion = lerp(this.highMotion, this._highRaw, lerpSlow);

        // === PRE-COMPUTED SUGGESTIONS ===
        // Scale: gentle pulse + subtle swell + breathing
        const pulseScale = this.pulse * (0.2 - smoothness * 0.12); // 0.2 to 0.08
        const swellScale = this.swell * 0.12;
        const breatheScale = this.breathe * 0.06;
        this.scaleSuggestion = 1.0 + pulseScale + swellScale + breatheScale;

        // Zoom: very subtle, mostly breathing-based at high smoothness
        const pulseZoom = this.pulse * (0.12 - smoothness * 0.10); // 0.12 to 0.02
        this.zoomSuggestion = -pulseZoom + this.breathe * 0.04;
    }

    // Get a value with extra smoothing applied
    getSmoothed(value, extraSmooth = 0.5) {
        // This doesn't actually smooth (would need state), but reduces magnitude
        return value * (1.0 - extraSmooth * 0.5);
    }
}
const motion = new MotionCoordinator();

// Floating particles - smoother motion
if (floatingParticles) {
    const fp = floatingParticles.geometry.attributes.position.array;
    const fc = floatingParticles.geometry.attributes.color.array;
    floatingData.forEach((fd, i) => {
        fd.theta += fd.speed * dt * 0.25;
        fd.phi += fd.speed * dt * 0.12;
        const bv = audio.getBand(fd.band);
        // Smoother radius modulation
        const rr = fd.r * (1 + bv * 0.2 + motion.swell * 0.1);
        fp[i * 3] = rr * Math.sin(fd.phi) * Math.cos(fd.theta);
        fp[i * 3 + 1] = rr * Math.sin(fd.phi) * Math.sin(fd.theta);
        fp[i * 3 + 2] = rr * Math.cos(fd.phi);
        const c = getHarmonizedColor(bv * 0.7, fd.band / 64);
        fc[i * 3] = c.r; fc[i * 3 + 1] = c.g; fc[i * 3 + 2] = c.b;
    });
    floatingParticles.geometry.attributes.position.needsUpdate = true;
    floatingParticles.geometry.attributes.color.needsUpdate = true;
}
// Environment
envObjects.forEach(obj => {
    if (obj.userData && obj.userData.rotSpeed) { obj.rotation.y += obj.userData.rotSpeed; obj.rotation.x += obj.userData.rotSpeed * 0.5; }
});
// Camera - DECOUPLED from rapid audio changes for smoothness
// Uses motion coordinator's smooth values, not raw audio
const mode = config.autoPilot ? camState.autoMode : config.cameraMode;
const cSpeed = config.cameraSpeed;
const cShake = config.cameraShake;

camState.autoAngleOffset = lerp(camState.autoAngleOffset, camState.autoAngleOffsetTarget, dt * 0.5);
camState.autoHeightBias = lerp(camState.autoHeightBias, camState.autoHeightBiasTarget, dt * 0.5);
camState.autoRoll = lerp(camState.autoRoll, camState.autoRollTarget, dt * 0.3);
