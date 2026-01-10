# Geometric Resonance — by Kyler Simzer

A single-file, local-first audio visualizer you can run directly in your browser.  
Copy the HTML into your own folder, open it, load a song, and generate reactive geometric visuals — no installs, no accounts, no uploads.

## Quick start
1. Download the `.html` file from this repo.
2. Open it in a modern browser (Chrome / Edge recommended).
3. Load an audio file (or use the included demo clip).
4. Press Play (or press **Space**).

## Controls / Hotkeys
- **Space** — Play / Pause  
- **U** — Hide / Show UI  
- **R** — Randomize  
- **F** — Fullscreen  
- **P** — Presets  
- **1–8** — Switch tabs  

## Privacy / Local-first
- Audio files are loaded locally in your browser (this app does not upload your audio anywhere).
- Note: the default HTML may load some dependencies/fonts from CDNs. If you want **zero external requests**, see Offline mode.

## Offline mode (optional)
To make this fully offline / no external requests:
- Bundle `three.js` locally and update the import map to point to local files.
- Remove/replace any Google Fonts import (use system fonts or local font files).

## Recording
This app can record a WebM video (VP9) with audio.  
Browser support varies; Chrome/Edge tend to work best.

## Demo audio
This repo includes `demo.mp3` for quick testing.

`demo.mp3` © 2025 Kyler Simzer. **All rights reserved.**  
`demo.mp3` is **not** licensed under the MIT License. Included for demonstration/listening only.  
No reuse, redistribution, sampling, or sync without permission.

Contact: weworkfortheo@gmail.com

## License
The software/code in this repo is licensed under the MIT License (see `LICENSE`).

**Attribution request (not required by the MIT License):**  
If you use this in a commercial product or paid project, please include a visible credit like:  
**“Geometric Resonance by Kyler Simzer”**

Contact: weworkfortheo@gmail.com

## Credits
Built with:
- three.js
- WebAudio API
