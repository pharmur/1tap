import './styles/main.css';
import { bootConnectionPipeline } from './lib/audio.js';
import * as AppLogic from './lib/app_logic.js';

// Expose necessary functions to the window object for HTML event attributes
window.handleAddChannelClick = AppLogic.handleAddChannelClick;
window.switchChannel = AppLogic.switchChannel;

async function initApp() {
    console.log("App initializing...");
    AppLogic.initializeUI();
    AppLogic.setupAvatarUpload();

    AppLogic.setOnProfileSaved(async () => {
        console.log("Profile saved, booting pipeline...");
        await runConnectionPipeline();
    });

    // --- NEW LOGIC: Auto-Join if profile exists ---
    const savedProfile = localStorage.getItem('1tap_user_profile');
    const roomId = new URLSearchParams(window.location.search).get('room');

    // Force the sidebar to populate with default channels 
    // so the UI isn't just a blank void on load
    AppLogic.buildChannelDOMRows();

    if (roomId) {
        console.log("Room ID found in URL, booting pipeline...");
        await runConnectionPipeline();
    } else if (savedProfile) {
        // If we have a profile but no room ID, 
        // we might be returning to a previously active room.
        console.log("Profile found, ready to connect. Waiting for room ID or action.");
    } else {
        console.warn("No profile and no room. Waiting for user interaction.");
    }
}

async function runConnectionPipeline() {
    try {
        const stream = await bootConnectionPipeline(
            (remotePeerObjects) => {
                console.log("Peer list updated, rendering occupants...", remotePeerObjects);
                AppLogic.renderOccupants(remotePeerObjects);
            },
            (peerId, remoteStream) => {
                console.log("Starting visualizer for peer:", peerId);
                // Implementation for visualizer per peer
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(remoteStream);
                const analyzer = audioContext.createAnalyser();
                analyzer.fftSize = 256;
                source.connect(analyzer);
                
                const dataArray = new Uint8Array(analyzer.frequencyBinCount);
                function update() {
                    analyzer.getByteFrequencyData(dataArray);
                    const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
                    const occupant = document.getElementById(`user-${peerId}`);
                    if (occupant) {
                        avg > 5 ? occupant.classList.add('speaking') : occupant.classList.remove('speaking');
                    }
                    requestAnimationFrame(update);
                }
                update();
            }
        );

        if (stream) {
            console.log("Pipeline success, setting local stream.");
            AppLogic.setLocalStream(stream);
            AppLogic.startAudioVisualizer(stream);
        }
    } catch (error) {
        console.error("Critical error during bootConnectionPipeline:", error);
    }
}

// 4. Global Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Chat input
    const chatInput = document.getElementById('chatInputField');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const message = chatInput.value.trim();
                if (message !== "") {
                    AppLogic.sendChatMessage(message);
                    chatInput.value = '';
                }
            }
        });
    }

    // App click handling
    document.addEventListener('click', (e) => {
        const id = e.target.id;
        if (id === 'createRoomBtn') AppLogic.createNewPrivateRoomHost();
        if (id === 'saveProfileBtn') {
            e.preventDefault(); // Prevents page refresh/console wipe
            AppLogic.saveProfile();
        }
        if (id === 'addChannelBtn') AppLogic.handleAddChannelClick();
        if (id === 'muteBtn') AppLogic.toggleMute(e.target);
        if (id === 'copyBtn') {
            const url = document.getElementById('inviteUrl');
            if (url) {
                url.select();
                document.execCommand('copy');
                alert("Invite URL copied!");
            }
        }
    });

    initApp();
});