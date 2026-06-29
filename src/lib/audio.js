// src/lib/audio.js
import { Peer } from 'peerjs';
import { db } from './firebase';
import { ref, push, onValue, set, onDisconnect } from 'firebase/database';
export let myFirebaseKey = null;
export let activeUsers = [];

export async function bootConnectionPipeline(onUserListUpdate, onRemoteStream) {
    console.log("Pipeline starting...");
    
    // 1. Get the roomId safely once
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room') || 'lobby';
    
    try {
        // 2. Initialize Media Stream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: { exact: true },
                noiseSuppression: { exact: true },
                autoGainControl: { exact: false }, 
                sampleRate: { exact: 48000 },
                channelCount: { exact: 1 }
            }
        });

        // 3. Setup PeerJS
        const peer = new Peer(); 
        const activeCalls = new Set();

        peer.on('open', (id) => {
            const roomRef = ref(db, `rooms/${roomId}/peers`);
            const myPeerRef = push(roomRef);
            myFirebaseKey = myPeerRef.key;
            
            const profile = JSON.parse(localStorage.getItem('1tap_user_profile')) || { username: 'Guest' };
            set(myPeerRef, { 
                id: id, 
                username: profile.username, 
                channel: 'Lobby' 
            });
            onDisconnect(myPeerRef).remove();
        });

        // 4. Firebase Listener
        const roomRef = ref(db, `rooms/${roomId}/peers`);
        onValue(roomRef, (snapshot) => {
            const peers = snapshot.val();
            if (!peers) return;

            const allPeerObjects = Object.values(peers);
            activeUsers = allPeerObjects;
            
            const remotePeerObjects = allPeerObjects.filter(p => p.id !== peer.id);
            if (onUserListUpdate) onUserListUpdate(remotePeerObjects);

            allPeerObjects.forEach(peerObj => {
                if (peerObj.id !== peer.id && !activeCalls.has(peerObj.id)) {
                    activeCalls.add(peerObj.id);
                    const call = peer.call(peerObj.id, stream);
                    
                    call.on('stream', (remoteStream) => {
                        if (onRemoteStream) onRemoteStream(peerObj.id, remoteStream);
                        const audio = new Audio();
                        audio.srcObject = remoteStream;
                        audio.play().catch(e => console.log("Audio play failed: ", e));
                    });
                    
                    call.on('close', () => activeCalls.delete(peerObj.id));
                    call.on('error', (err) => {
                        console.error("Connection error:", err);
                        activeCalls.delete(peerObj.id);
                    });
                }
            });
        });

        peer.on('call', (call) => {
            call.answer(stream);
            call.on('stream', (remoteStream) => {
                if (onRemoteStream) onRemoteStream(call.peer, remoteStream);
                const audio = new Audio();
                audio.srcObject = remoteStream;
                audio.play().catch(e => console.log("Audio play failed: ", e));
            });
        });

        return stream;
    } catch (err) {
        console.error("Audio Pipeline Error:", err);
        return null;
    }
}