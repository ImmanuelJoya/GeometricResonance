// Animation loop
function animate(timestamp) {
    requestAnimationFrame(animate);
    if (!timestamp) timestamp = performance.now();
    const rawDt = _lastFrameTime ? (timestamp - _lastFrameTime) / 1000 : 0.016;
    const dt = Math.min(rawDt, 0.05);
    _lastFrameTime = timestamp;
    _animationTime += dt;
    const t = _animationTime;

    // Smooth continuous model spin (decoupled from beat phase/BPM estimation)
    if (config.modelSpinEnabled) {
        modelSpin += dt * (0.24 * config.cameraSpeed * config.modelSpinSpeed); // continuous; speed is user-controlled
    }

    // Beat pulse decay is handled after beat detection for better timing

    let isBeat = false;
    if (analyser && playing) {
        if ((timestamp - _lastFFTUpdate) >= getFFTInterval()) {
            _lastFFTUpdate = timestamp;
            analyser.getByteFrequencyData(freqData);
            analyser.getByteTimeDomainData(timeData);
        }
        // Smoothing alpha adjusted by global smoothness setting
        const smoothingAlpha = 0.18 + config.smoothness * 0.15; // 0.18 to 0.33
        isBeat = audio.analyze(freqData, timeData, dt, null, null, smoothingAlpha);

        // Update motion coordinator with smoothness setting
        motion.update(audio, dt, music.phase, config.smoothness);

        document.getElementById('bpm-display').textContent = `${audio.getBPM()} BPM`;
        document.getElementById('energy-display').textContent = `Energy: ${(audio.energy * 100).toFixed(0)}%`;
        document.getElementById('bar-display').textContent = `Bar: ${audio.barCount}`;
        document.getElementById('note-display').textContent = `Note: ${audio.noteName}`;
    }
    updateMusicClock(dt);

    if (config.hueRotateSpeed > 0) { palette.globalHueShift += dt * config.hueRotateSpeed * 0.1; palette.globalHueShift = fract(palette.globalHueShift); }

    if (audio.barCount !== music.lastSeenBar) {
        music.lastSeenBar = audio.barCount;
        if (config.barLockColors) palette.hOffsetTarget = (hash1(audio.barCount * 0.97) - 0.5) * 0.10;
        if (config.cameraAutoAngles && audio.barCount > 0 && audio.barCount % 16 === 0) {
            const modes = ['orbit', 'reactive', 'cinematic', 'spiral', 'figure8', 'vortex', 'pendulum'];
            camState.autoMode = modes[Math.floor(Math.random() * modes.length)];
            camState.autoAngleOffsetTarget = (Math.random() * 2 - 1) * (Math.PI * 0.45);
            camState.autoHeightBiasTarget = (Math.random() * 2 - 1) * 7.0;
            camState.autoRollTarget = (Math.random() * 2 - 1) * (Math.PI / 18);
        }
    }
    palette.hOffset = lerp(palette.hOffset, palette.hOffsetTarget, dt * 0.8);

    const { smoothSubBass, smoothBass, smoothLowMid, smoothMid, smoothHighMid, smoothHigh, smoothBrilliance, spectralCentroid, spectralFlux, energy, transientSharpness, onsetSnare, onsetHihat } = audio;
    const phase = music.phase;
    const sens = config.sensitivity;
    const symN = config.symmetry;

    // Use motion coordinator's pulse instead of raw beatPulse
    // This is pre-smoothed and won't conflict with other systems
    beatPulse = motion.pulse;

    // Spawn shockwave on coordinator's beat, not raw audio
    // Shockwave triggers (beat + transients), with cooldown for stability
    if (config.showShockwaves) {
        const canSpawn = (t - shockState.lastTime) > config.shockwaveCooldown;
        const strongTransient = motion.impact > config.shockwaveImpactThreshold;
        if (canSpawn && (isBeat || strongTransient)) {
            shockState.lastTime = t;
            const col = getHarmonizedColor(energy, 0.5);
            spawnShockwave(col, isBeat ? 1.0 : 0.75);
        }
    }

    // Update background - use motion coordinator values
    bgUniforms.uTime.value = t;
    bgUniforms.uPhase.value = phase;
    bgUniforms.uSymmetry.value = symN;
    bgUniforms.uEnergy.value = motion.swell; // Smooth swell instead of raw energy
    bgUniforms.uBass.value = motion.lowMotion;
    bgUniforms.uMid.value = motion.midMotion;
    bgUniforms.uHigh.value = motion.highMotion;
    bgUniforms.uNegative.value = config.negativeSpace ? 1.0 : 0.0;
    bgUniforms.uBeatPulse.value = motion.pulse;
    bgUniforms.uReactiveBg.value = config.reactiveBg ? 1.0 : 0.0;
    bgUniforms.uPatternStrength.value = config.bgPatternStrength;

    // Main geometry - USE MOTION COORDINATOR for scale (single source of truth)
    if (wireframeMesh && particleSystem) {
        const rotBase = 0.55 * config.cameraSpeed;

        // Rotation driven by TIME and mid frequencies, NOT beats
        // This creates smooth, continuous rotation that doesn't jerk
        // NOTE: we use modelSpin (time-integrated radians) instead of music.phase.
        // music.phase is beat/BPM-driven and can re-time when BPM smoothing shifts.
        const react = (config.modelSpinReactive ? config.modelSpinReactivity : 0);
        const baseY = modelSpin;
        const baseX = modelSpin * 0.455;
        const baseZ = modelSpin * 0.273;

        const centroidFactor = lerp(1.0, (0.85 + 0.35 * spectralCentroid), react);

        let rotY = baseY + motion.midMotion * 0.06 * react;
        let rotX = baseX * centroidFactor;
        let rotZ = baseZ + motion.highMotion * 0.04 * react;

        if (config.modelSpinAxis === 'y') {
            rotX = 0;
            rotZ = 0;
        }

        wireframeMesh.rotation.y = rotY;
        wireframeMesh.rotation.x = rotX;
        wireframeMesh.rotation.z = rotZ;

        // SINGLE scale source from motion coordinator
        const targetScale = motion.scaleSuggestion * (0.95 + sens * 0.05);
        const pulseAmt = (config.modelPulseEnabled ? config.modelPulseAmount : 0);
        const meshScale = lerp(1.0, targetScale, pulseAmt);
        wireframeMesh.scale.setScalar(meshScale);

        wireframeMesh.material.opacity = config.negativeSpace ? 0.12 : (0.22 + motion.swell * 0.42);
        wireframeMesh.material.color.copy(config.negativeSpace ? new THREE.Color(0x080808) : getHarmonizedColor(motion.swell, 0.5));

        if (rimMesh) {
            rimMesh.visible = config.negativeSpace;
            rimMesh.rotation.copy(wireframeMesh.rotation);
            rimMesh.scale.copy(wireframeMesh.scale);
            rimMesh.material.uniforms.uColor.value.copy(getHarmonizedColor(motion.swell, 0.5));
            rimMesh.material.uniforms.uTime.value = t;
        }

        // Update particles - simplified to not compete with main geometry motion
        const pos = particleSystem.geometry.attributes.position.array;
        const col = particleSystem.geometry.attributes.color.array;
        const sizes = particleSystem.geometry.attributes.size.array;
        const pMode = config.particleMode;
        const turb = config.turbulence;
        const cohe = config.cohesion;
        const { tmp, targetPos } = _pool;

        // Pre-compute noise field offset for smooth motion
        const noiseOffset = t * 0.15;

        // Use motion coordinator values for particle behavior
        const particlePulse = motion.pulse;
        const particleImpact = motion.impact;

        for (let i = 0; i < vertexData.length; i++) {
            const vd = vertexData[i];
            // Simplified frequency response - smoother, less jerky
            const freqVal = clamp(audio.getBand(vd.band) * 1.2 * sens, 0, 1.5);
            const onset = audio.getOnset(vd.band) * 0.6; // Reduced onset influence
            const thetaSym = foldTheta(vd.theta, symN);

            // Displacement uses motion coordinator's smooth values
            let disp = 1.0;

            if (config.fieldMode === 'harmonic') {
                const h1 = Math.sin(thetaSym + 2.0 * vd.phi + phase * 0.04);
                const h2 = Math.sin(2.0 * thetaSym - 3.0 * vd.phi + phase * 0.028);
                // Use motion.lowMotion instead of raw bass, motion.pulse instead of beatPulse
                disp = 1.0 + freqVal * 0.5 * h1 + motion.lowMotion * 0.4 * h2
                    + particlePulse * 0.15 + onset * 0.08;
            } else if (config.fieldMode === 'curl') {
                const noiseVal = gradNoise(vd.base.x * 0.08 + noiseOffset, vd.base.y * 0.08, vd.base.z * 0.08 + t * 0.1);
                disp = 1 + freqVal * 0.45 + onset * 0.25 + noiseVal * 0.2 * turb + particlePulse * 0.18;
            } else if (config.fieldMode === 'spiral') {
                const spiralWave = Math.sin(thetaSym + phase * 0.18 + motion.lowMotion * 2.0);
                disp = 1 + freqVal * 0.45 + onset * 0.25 + spiralWave * 0.22 * sens + particlePulse * 0.18;
            } else {
                const noiseVal = gradNoise(vd.base.x * 0.12 + noiseOffset, vd.base.y * 0.12, vd.base.z * 0.12);
                disp = 1 + freqVal * 0.55 + onset * 0.35 + noiseVal * 0.25 * turb + particlePulse * 0.2;
            }
            disp = clamp(disp, 0.7, 2.2);

            targetPos.copy(vd.base).multiplyScalar(disp);

            if (pMode === 'swarm') {
                const swarmIntensity = turb * freqVal * 1.0;
                targetPos.x += Math.cos(thetaSym + phase * 0.18) * swarmIntensity;
                targetPos.y += Math.sin(vd.phi + phase * 0.14) * swarmIntensity * 0.7;
                targetPos.z += Math.sin(thetaSym - phase * 0.16) * swarmIntensity;
            } else if (pMode === 'explode') {
                tmp.copy(vd.base).normalize();
                // Use motion impact for explosion, not raw beats
                const explodeForce = (particlePulse * 0.8 + particleImpact * 0.5) * 5 * sens;
                targetPos.addScaledVector(tmp, explodeForce);
            } else if (pMode === 'orbital') {
                const ang = phase * 0.25 + vd.phase + freqVal * 2.0;
                const r = vd.base.length() * (1 + freqVal * 0.3 * sens);
                targetPos.set(Math.cos(ang) * r, vd.base.y * (1 + motion.midMotion * 0.35), Math.sin(ang) * r);
            } else if (pMode === 'magnetic') {
                // Use motion values instead of raw audio
                const attractorY = (motion.lowMotion - motion.highMotion) * 6;
                const attractorStrength = motion.swell * 0.12 * sens;
                tmp.set(0, attractorY, 0).sub(vd.current);
                const dist = Math.max(tmp.length(), 0.5);
                targetPos.addScaledVector(tmp.normalize(), attractorStrength / (dist * 0.08));
                targetPos.x += Math.sin(phase * 0.2 + vd.phase) * motion.midMotion * 1.2;
                targetPos.z += Math.cos(phase * 0.2 + vd.phase) * motion.midMotion * 1.2;
            } else if (pMode === 'wave') {
                // Smoother wave using motion coordinator
                const wave1 = Math.sin(thetaSym + phase * 0.35) * motion.lowMotion * 2.5;
                const wave2 = Math.sin(thetaSym * 2 + phase * 0.5 + Math.PI / 3) * motion.midMotion * 1.2;
                const wave3 = Math.sin(thetaSym * 3 + phase * 0.7) * motion.highMotion * 0.6;
                targetPos.y += (wave1 + wave2 + wave3) * sens;
            } else if (pMode === 'vortex') {
                const vAng = phase * 0.35 + vd.phase;
                const vR = vd.base.length() * (1 + motion.lowMotion * 0.2);
                targetPos.x = Math.cos(vAng + thetaSym * 0.5) * vR;
                targetPos.z = Math.sin(vAng + thetaSym * 0.5) * vR;
                targetPos.y = vd.base.y * (1 + motion.midMotion * 0.25) + motion.highMotion * 3 * Math.sin(vAng * 2);
            } else if (pMode === 'aurora') {
                const aWave1 = Math.sin(vd.base.x * 0.15 + phase * 0.12) * Math.cos(vd.base.z * 0.15 + phase * 0.08);
                const aWave2 = Math.sin(vd.base.x * 0.25 + phase * 0.18 + Math.PI / 4) * motion.highMotion;
                targetPos.y += (aWave1 * motion.midMotion * 3.0 + aWave2 * 1.2) * sens;
                targetPos.x += Math.sin(phase * 0.08 + vd.base.y * 0.1) * motion.lowMotion * 0.6;
            }

            // Smoother velocity physics - adjusted by global smoothness
            tmp.copy(targetPos).sub(vd.current);

            // Cohesion reduced at higher smoothness for more gradual movement
            const effectiveCohesion = cohe * (0.4 - config.smoothness * 0.15); // 0.4 to 0.25
            vd.velocity.add(tmp.multiplyScalar(effectiveCohesion));

            // Higher damping at higher smoothness (less overshoot)
            const damping = 0.92 + config.smoothness * 0.05; // 0.92 to 0.97
            vd.velocity.multiplyScalar(damping);

            // Limit velocity to prevent sudden jumps
            const maxVel = 2.0 - config.smoothness * 1.0; // 2.0 to 1.0
            const velMag = vd.velocity.length();
            if (velMag > maxVel) {
                vd.velocity.multiplyScalar(maxVel / velMag);
            }

            vd.current.addScaledVector(vd.velocity, dt);

            pos[i * 3] = vd.current.x; pos[i * 3 + 1] = vd.current.y; pos[i * 3 + 2] = vd.current.z;

            // Simplified color - use motion swell for smoother color changes
            const colorEnergy = freqVal + onset * 0.3;
            const colorPhase = fract((thetaSym / TAU) + spectralCentroid * 0.25);
            const c = getHarmonizedColor(colorEnergy, colorPhase);
            const brightness = clamp(0.35 + freqVal * 0.45 + motion.pulse * 0.15, 0.15, 1.0);
            col[i * 3] = c.r * brightness; col[i * 3 + 1] = c.g * brightness; col[i * 3 + 2] = c.b * brightness;

            // Simplified size - less reactive to prevent jitter
            const baseSize = 0.12 + freqVal * 0.14;
            const pulseSize = motion.pulse * 0.25;
            sizes[i] = baseSize * (1 + pulseSize);
        }

        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleSystem.geometry.attributes.color.needsUpdate = true;
        particleSystem.geometry.attributes.size.needsUpdate = true;
        particleSystem.rotation.copy(wireframeMesh.rotation);
        particleSystem.scale.copy(wireframeMesh.scale);
        particleSystem.material.uniforms.uTime.value = t;
        particleSystem.material.uniforms.uEnergy.value = motion.swell;
        particleSystem.material.uniforms.uSizeMult.value = config.particleSizeMult;
        particleSystem.material.uniforms.uBrightness.value = config.particleBrightness;
    }

    // Connection lines - use motion coordinator
    if (connectionLines && config.showConnections && vertexData.length > 1) {
        const linePos = connectionLines.geometry.attributes.position.array;
        const lineCol = connectionLines.geometry.attributes.color.array;
        let lineIdx = 0;
        // Smoother connection distance using motion values
        const maxDist = 3.5 + motion.midMotion * 4.0 + motion.pulse * 2.0;
        _pool.quat.setFromEuler(wireframeMesh.rotation);
        const scale = wireframeMesh.scale.x;
        const limit = Math.min(vertexData.length, 150);

        for (let i = 0; i < limit && lineIdx < linePos.length / 6; i++) {
            for (let j = i + 1; j < limit && lineIdx < linePos.length / 6; j++) {
                _pool.vi.copy(vertexData[i].current).multiplyScalar(scale).applyQuaternion(_pool.quat);
                _pool.vj.copy(vertexData[j].current).multiplyScalar(scale).applyQuaternion(_pool.quat);
                const d = _pool.vi.distanceTo(_pool.vj);
                if (d < maxDist) {
                    linePos[lineIdx * 6] = _pool.vi.x; linePos[lineIdx * 6 + 1] = _pool.vi.y; linePos[lineIdx * 6 + 2] = _pool.vi.z;
                    linePos[lineIdx * 6 + 3] = _pool.vj.x; linePos[lineIdx * 6 + 4] = _pool.vj.y; linePos[lineIdx * 6 + 5] = _pool.vj.z;
                    const bright = clamp((maxDist - d) / maxDist, 0, 1) * 0.24 + 0.03;
                    const c = getHarmonizedColor(energy, 0.5);
                    lineCol[lineIdx * 6] = lineCol[lineIdx * 6 + 3] = c.r * bright;
                    lineCol[lineIdx * 6 + 1] = lineCol[lineIdx * 6 + 4] = c.g * bright;
                    lineCol[lineIdx * 6 + 2] = lineCol[lineIdx * 6 + 5] = c.b * bright;
                    lineIdx++;
                }
            }
        }
        connectionLines.geometry.setDrawRange(0, lineIdx * 2);
        connectionLines.geometry.attributes.position.needsUpdate = true;
        connectionLines.geometry.attributes.color.needsUpdate = true;
    }

    // Secondary meshes - use motion coordinator for smooth, non-competing motion
    if (innerMesh) {
        innerMesh.rotation.y = phase * 0.05;
        innerMesh.rotation.x = phase * 0.03;
        // Use motion.pulse instead of raw audio
        innerMesh.scale.setScalar(1 + motion.lowMotion * 0.25 + motion.pulse * 0.15);
        innerMesh.material.color.copy(getHarmonizedColor(motion.lowMotion, 0.2));
        innerMesh.material.opacity = 0.12 + motion.swell * 0.12;
    }
    if (outerMesh) {
        outerMesh.rotation.y = -phase * 0.02;
        outerMesh.rotation.z = phase * 0.015;
        outerMesh.scale.setScalar(1 + motion.lowMotion * 0.15 + motion.breathe * 0.08);
        outerMesh.material.opacity = 0.03 + motion.swell * 0.03;
    }

    // Waveform ring - still uses raw timeData for accurate waveform, but scaling is smoothed
    if (waveformRing && waveformRing.visible && timeData) {
        const wPos = waveformRing.geometry.attributes.position.array;
        const baseRadius = 12;
        const waveAmplitude = 3.5 * (1 + motion.swell * 0.4);

        for (let i = 0; i < 256; i++) {
            const ang = (i / 256) * TAU;
            const dataIdx = Math.floor(i * timeData.length / 256);
            const sample = (timeData[dataIdx] / 128 - 1);
            const prevSample = (timeData[Math.max(0, dataIdx - 1)] / 128 - 1);
            const nextSample = (timeData[Math.min(timeData.length - 1, dataIdx + 1)] / 128 - 1);
            const smoothedSample = (prevSample + sample * 2 + nextSample) / 4;

            const r = baseRadius + smoothedSample * waveAmplitude;
            wPos[i * 3] = Math.cos(ang) * r;
            wPos[i * 3 + 2] = Math.sin(ang) * r;
            wPos[i * 3 + 1] = smoothedSample * 0.4 * motion.highMotion;
        }
        waveformRing.geometry.attributes.position.needsUpdate = true;
        waveformRing.material.color.copy(getHarmonizedColor(motion.midMotion, 0.7));
        waveformRing.material.opacity = 0.35 + motion.swell * 0.2;
    }

    // Freq bars - smoothed transitions
    freqBars.forEach((bar, idx) => {
        if (!bar.visible) return;
        const v = audio.getBand(idx);
        const peak = audio.bandPeaks[idx];
        const targetScale = 0.5 + v * 8 + (peak - v) * 1.5;
        bar.scale.y = lerp(bar.scale.y, targetScale, 0.25);
        bar.material.color.copy(getHarmonizedColor(v, idx / 64));
        bar.material.opacity = 0.35 + v * 0.45;
    });

    // Rings - use motion coordinator
    rings.forEach((ring, idx) => {
        ring.rotation.x = phase * 0.02 * (idx + 1) + Math.PI / 2 * (idx % 2);
        ring.rotation.y = phase * 0.015 * (idx + 1);
        const bandVal = audio.getBand(idx * 8);
        ring.scale.setScalar(1 + bandVal * 0.3 + motion.pulse * 0.1);
        ring.material.color.copy(getHarmonizedColor(bandVal, idx / config.ringCount));
        ring.material.opacity = 0.02 + bandVal * 0.025;
    });

    // Light rays - smoother motion
    lightRays.forEach((ray, i) => {
        ray.rotation.z = ray.userData.baseAngle + t * ray.userData.speed * (1 + motion.lowMotion * 0.3);
        const intensity = 0.1 + motion.midMotion * 0.3 + motion.pulse * 0.15;
        ray.material.uniforms.uIntensity.value = intensity;
        ray.material.uniforms.uColor.value.copy(getHarmonizedColor(motion.midMotion, i / 12));
    });

    // Aurora - use motion coordinator
    if (auroraLayer) {
        auroraLayer.material.uniforms.uTime.value = t;
        auroraLayer.material.uniforms.uEnergy.value = motion.swell;
        auroraLayer.material.uniforms.uColorA.value.copy(new THREE.Color(config.colorPrimary));
        auroraLayer.material.uniforms.uColorB.value.copy(new THREE.Color(config.colorSecondary));
    }

    // Energy field - use motion coordinator
    if (energyFieldMesh) {
        energyFieldMesh.material.uniforms.uTime.value = t;
        energyFieldMesh.material.uniforms.uEnergy.value = motion.swell;
        energyFieldMesh.material.uniforms.uColor.value.copy(getHarmonizedColor(motion.swell, 0.5));
        energyFieldMesh.rotation.y = t * 0.1;
        energyFieldMesh.rotation.x = t * 0.05;
    }

    // Orbitals - use motion coordinator
    orbitalRings.forEach((ring, i) => {
        ring.rotation.x = t * ring.userData.speed;
        ring.rotation.z = t * ring.userData.speed * 0.7;
        ring.material.color.copy(getHarmonizedColor(motion.midMotion, i / 3));
        ring.material.opacity = 0.08 + motion.swell * 0.15;
    });

    // Shockwaves
    shockwaves.forEach(s => {
        if (!s.active) return;
        s.life -= dt * 1.8;
        if (s.life <= 0) { s.active = false; s.mesh.material.uniforms.uOpacity.value = 0; return; }
        // Always face camera so the rings read cleanly from any orbit angle
        s.mesh.quaternion.copy(camera.quaternion);
        s.mesh.scale.addScalar(dt * 22);
        s.mesh.material.uniforms.uOpacity.value = s.life * config.shockwaveIntensity * (s.strength || 1.0);
    });