document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`.settings-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
});

document.querySelectorAll('.toggle').forEach(toggle => {
      toggle.addEventListener('click', () => toggle.classList.toggle('active'));
    });


        // Resize
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h); composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
      bgUniforms.uResolution.value.set(w, h);
      screenFXPass.uniforms.uResolution.value.set(w, h);
      specCanvas.width = w;
    });


     // Keyboard
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch(e.key.toLowerCase()) {
        case ' ': e.preventDefault(); playBtn.click(); break;
        case 'u': document.getElementById('ui').classList.toggle('hidden'); break;
        case 'r': randomize(); break;
        case 'f': document.getElementById('fullscreenBtn').click(); break;
        case 'p': openPresetModal(); break;
        case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8':
          const tabs = document.querySelectorAll('.tab');
          const idx = parseInt(e.key) - 1;
          if (tabs[idx]) tabs[idx].click();
          break;
      }
    });

      // Playback
    const playBtn = document.getElementById('playBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');

    document.getElementById('file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) { initAudio(); audioEl.src = URL.createObjectURL(file); audioEl.load(); }
    });

    playBtn.addEventListener('click', () => {
      if (!audioEl.src) return;
      initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (audioEl.paused) {
        audioEl.play(); playing = true;
        playIcon.style.display = 'none'; pauseIcon.style.display = 'block';
      } else {
        audioEl.pause(); playing = false;
        playIcon.style.display = 'block'; pauseIcon.style.display = 'none';
      }
    });

    audioEl.addEventListener('ended', () => { playing = false; playIcon.style.display = 'block'; pauseIcon.style.display = 'none'; });

     // Sync new layer sliders to config defaults
    const _psm = document.getElementById('particleSizeMult'); if (_psm) _psm.value = config.particleSizeMult;
    const _pbr = document.getElementById('particleBrightness'); if (_pbr) _pbr.value = config.particleBrightness;
    const _swi = document.getElementById('shockwaveIntensity'); if (_swi) _swi.value = config.shockwaveIntensity;
    const _swt = document.getElementById('shockwaveImpactThreshold'); if (_swt) _swt.value = config.shockwaveImpactThreshold;
    const _swc = document.getElementById('shockwaveCooldown'); if (_swc) _swc.value = config.shockwaveCooldown;


    document.getElementById('form').addEventListener('change', e => { config.form = e.target.value; buildMainGeometry(); });
    document.getElementById('density').addEventListener('input', e => { config.density = parseInt(e.target.value); buildMainGeometry(); });
    document.getElementById('sensitivity').addEventListener('input', e => { config.sensitivity = parseFloat(e.target.value); });
    document.getElementById('smoothness').addEventListener('input', e => { config.smoothness = parseFloat(e.target.value); });
    document.getElementById('volume').addEventListener('input', e => { config.volume = parseFloat(e.target.value); if (gainNode) gainNode.gain.value = config.volume; });
    document.getElementById('visualMode').addEventListener('change', e => { config.visualMode = e.target.value; });

    
    // Model motion controls (Main tab)
    document.getElementById('modelSpinSpeed').addEventListener('input', e => { config.modelSpinSpeed = parseFloat(e.target.value); });
    document.getElementById('modelSpinAxis').addEventListener('change', e => { config.modelSpinAxis = e.target.value; });
    document.getElementById('modelSpinReactivity').addEventListener('input', e => { config.modelSpinReactivity = parseFloat(e.target.value); });
    document.getElementById('modelPulseAmount').addEventListener('input', e => { config.modelPulseAmount = parseFloat(e.target.value); });

    document.getElementById('toggleModelSpin').addEventListener('click', e => { config.modelSpinEnabled = e.target.classList.contains('active'); });
    document.getElementById('toggleModelSpinReactive').addEventListener('click', e => { config.modelSpinReactive = e.target.classList.contains('active'); });
    document.getElementById('toggleModelPulse').addEventListener('click', e => { config.modelPulseEnabled = e.target.classList.contains('active'); });

document.getElementById('colorTheme').addEventListener('change', e => { config.colorTheme = e.target.value; applyColorTheme(); });
    document.getElementById('colorPrimary').addEventListener('input', e => { config.colorPrimary = e.target.value; bgUniforms.uAccentA.value.set(config.colorPrimary); });
    document.getElementById('colorSecondary').addEventListener('input', e => { config.colorSecondary = e.target.value; bgUniforms.uAccentB.value.set(config.colorSecondary); });
    document.getElementById('colorBg').addEventListener('input', e => { config.colorBg = e.target.value; scene.fog.color.set(config.colorBg); bgUniforms.uBgColor.value.set(config.colorBg); });
    document.getElementById('colorReactivity').addEventListener('input', e => { config.colorReactivity = parseFloat(e.target.value); });
    document.getElementById('hueRotateSpeed').addEventListener('input', e => { config.hueRotateSpeed = parseFloat(e.target.value); });
    document.getElementById('toggleBarLockColors').addEventListener('click', e => { config.barLockColors = e.target.classList.contains('active'); });

    document.getElementById('cameraMode').addEventListener('change', e => { config.cameraMode = e.target.value; camState.autoMode = e.target.value; });
    document.getElementById('cameraDistance').addEventListener('input', e => { config.cameraDistance = parseFloat(e.target.value); });
    document.getElementById('cameraSpeed').addEventListener('input', e => { config.cameraSpeed = parseFloat(e.target.value); });
    document.getElementById('cameraShake').addEventListener('input', e => { config.cameraShake = parseFloat(e.target.value); });
    document.getElementById('cameraFov').addEventListener('input', e => { config.cameraFov = parseFloat(e.target.value); camera.fov = config.cameraFov; camera.updateProjectionMatrix(); });
    document.getElementById('toggleBeatZoom').addEventListener('click', e => { config.cameraBeatZoom = e.target.classList.contains('active'); });
    document.getElementById('toggleAutoAngles').addEventListener('click', e => { config.cameraAutoAngles = e.target.classList.contains('active'); });

    document.getElementById('particleMode').addEventListener('change', e => { config.particleMode = e.target.value; });
    document.getElementById('fieldMode').addEventListener('change', e => { config.fieldMode = e.target.value; });
    document.getElementById('symmetry').addEventListener('change', e => { config.symmetry = parseInt(e.target.value); });
    document.getElementById('turbulence').addEventListener('input', e => { config.turbulence = parseFloat(e.target.value); });
    document.getElementById('cohesion').addEventListener('input', e => { config.cohesion = parseFloat(e.target.value); });
    document.getElementById('particleCount').addEventListener('change', e => { config.particleCount = parseInt(e.target.value); buildMainGeometry(); });

    document.getElementById('toggleInner').addEventListener('click', e => { config.showInner = e.target.classList.contains('active'); if (innerMesh) innerMesh.visible = config.showInner; });
    document.getElementById('toggleOuter').addEventListener('click', e => { config.showOuter = e.target.classList.contains('active'); if (outerMesh) outerMesh.visible = config.showOuter; });
    document.getElementById('toggleWaveform').addEventListener('click', e => { config.showWaveform = e.target.classList.contains('active'); if (waveformRing) waveformRing.visible = config.showWaveform; });
    document.getElementById('toggleBars').addEventListener('click', e => { config.showBars = e.target.classList.contains('active'); freqBars.forEach(b => b.visible = config.showBars); });
    document.getElementById('toggleConnections').addEventListener('click', e => { config.showConnections = e.target.classList.contains('active'); if (connectionLines) connectionLines.visible = config.showConnections; });
    document.getElementById('toggleParticles').addEventListener('click', e => { config.showParticles = e.target.classList.contains('active'); if (particleSystem) particleSystem.visible = config.showParticles; });
    document.getElementById('toggleShockwaves').addEventListener('click', e => { config.showShockwaves = e.target.classList.contains('active'); shockwaves.forEach(s => s.mesh.visible = config.showShockwaves); });
    document.getElementById('toggleLightRays').addEventListener('click', e => { config.showLightRays = e.target.classList.contains('active'); buildLightRays(); });
    document.getElementById('toggleAurora').addEventListener('click', e => { config.showAurora = e.target.classList.contains('active'); buildAurora(); });
    document.getElementById('toggleEnergyField').addEventListener('click', e => { config.showEnergyField = e.target.classList.contains('active'); buildEnergyField(); });
    document.getElementById('toggleOrbitals').addEventListener('click', e => { config.showOrbitals = e.target.classList.contains('active'); buildOrbitals(); });

    document.getElementById('bloomStrength').addEventListener('input', e => { config.bloomStrength = parseFloat(e.target.value); });
    document.getElementById('bloomRadius').addEventListener('input', e => { config.bloomRadius = parseFloat(e.target.value); });
    document.getElementById('trailMode').addEventListener('change', e => { config.trailMode = e.target.value; updateTrailMode(); });
    document.getElementById('glitchAmount').addEventListener('input', e => { config.glitchAmount = parseFloat(e.target.value); });
    document.getElementById('vignette').addEventListener('input', e => { config.vignette = parseFloat(e.target.value); });
    document.getElementById('grain').addEventListener('input', e => { config.grain = parseFloat(e.target.value); });
    document.getElementById('aberration').addEventListener('input', e => { config.aberration = parseFloat(e.target.value); });
    document.getElementById('anamorphic').addEventListener('input', e => { config.anamorphic = parseFloat(e.target.value); });
    document.getElementById('scanlines').addEventListener('input', e => { config.scanlines = parseFloat(e.target.value); });
    document.getElementById('filmLook').addEventListener('change', e => { config.filmLook = e.target.value; });

    document.getElementById('environment').addEventListener('change', e => { config.environment = e.target.value; buildEnvironment(); });
    document.getElementById('fogDensity').addEventListener('input', e => { config.fogDensity = parseFloat(e.target.value); scene.fog.density = config.fogDensity; });
    document.getElementById('ringCount').addEventListener('input', e => { config.ringCount = parseInt(e.target.value); buildRings(); });
    document.getElementById('bgPattern').addEventListener('change', e => { config.bgPattern = e.target.value; setBgPatternFromConfig(); });
    document.getElementById('bgPatternStrength').addEventListener('input', e => { config.bgPatternStrength = parseFloat(e.target.value); });

    document.getElementById('toggleSpectrum').addEventListener('click', e => { config.showSpectrum = e.target.classList.contains('active'); });
    document.getElementById('toggleAutoPilot').addEventListener('click', e => { config.autoPilot = e.target.classList.contains('active'); });
    document.getElementById('toggleBeatFlash').addEventListener('click', e => { config.beatFlash = e.target.classList.contains('active'); });
    document.getElementById('toggleColorCycle').addEventListener('click', e => { config.colorCycle = e.target.classList.contains('active'); });
    document.getElementById('toggleSynesthesia').addEventListener('click', e => { config.synesthesia = e.target.classList.contains('active'); });
    document.getElementById('toggleHarmonicSnap').addEventListener('click', e => { config.harmonicSnap = e.target.classList.contains('active'); });
    document.getElementById('toggleNegativeSpace').addEventListener('click', e => { config.negativeSpace = e.target.classList.contains('active'); if (rimMesh) rimMesh.visible = config.negativeSpace; wireframeMesh.material.blending = config.negativeSpace ? THREE.NormalBlending : THREE.AdditiveBlending; });
    document.getElementById('toggleReactiveBg').addEventListener('click', e => { config.reactiveBg = e.target.classList.contains('active'); });

  