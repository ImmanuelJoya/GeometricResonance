// Record
let mediaRecorder, recordedChunks = [];
document.getElementById('recordBtn').addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop(); document.getElementById('rec-indicator').classList.remove('active'); return;
    }
    if (!mediaDest) initAudio();
    const canvasStream = renderer.domElement.captureStream(60);
    const audioStream = mediaDest.stream;
    const combined = new MediaStream([...canvasStream.getTracks(), ...audioStream.getTracks()]);
    mediaRecorder = new MediaRecorder(combined, { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 8000000 });
    recordedChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'geometric_resonance_ultra.webm'; a.click();
    };
    mediaRecorder.start();
    document.getElementById('rec-indicator').classList.add('active');
});

document.getElementById('randomBtn').addEventListener('click', randomize);
document.getElementById('fullscreenBtn').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
});