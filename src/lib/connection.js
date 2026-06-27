// src/lib/connection.js
export function boostAudioSDP(sdp) {
    return sdp.replace(/a=fmtp:111 .*/g, "a=fmtp:111 minptime=10;useinbandfec=1;usedtx=0;maxplaybackrate=48000;stereo=1;maxaveragebitrate=128000");
}