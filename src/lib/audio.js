// src/lib/audio.js
export async function bootConnectionPipeline() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true },
                latency: 0
            }
        });
        return stream;
    } catch (err) {
        console.error("Audio Pipeline Error:", err);
        return null;
    }
}