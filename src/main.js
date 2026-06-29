import './styles/main.css';
import { bootConnectionPipeline } from './lib/audio.js';
import * as AppLogic from './lib/app_logic.js';

window.handleAddChannelClick = AppLogic.handleAddChannelClick;
window.switchChannel = AppLogic.switchChannel;

async function initApp() {
    console.log("App initializing...");
    
    // 1. Setup UI
    AppLogic.initializeUI();
    AppLogic.setupAvatarUpload();

    // 2. Check Room ID
    const roomId = new URLSearchParams(window.location.search).get('room');
    console.log("Current Room ID found:", roomId);

    if (!roomId) {
        console.warn("No room ID detected, application waiting for host creation.");
        return; 
    }

    // 3. Start Connection Pipeline
    try {
        const stream = await bootConnectionPipeline(
            (remotePeerObjects) => {
                console.log("Peer list updated, rendering occupants...", remotePeerObjects);
                AppLogic.renderOccupants(remotePeerObjects);
            },
            (peerId, remoteStream) => {
                console.log("Starting visualizer for peer:", peerId);
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
        } else {
            console.error("Pipeline returned no stream.");
        }
    } catch (error) {
        console.error("Critical error during bootConnectionPipeline:", error);
    }

    // 4. Chat & Event Listeners
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
}

document.addEventListener('click', (e) => {
    const id = e.target.id;
    if (id === 'createRoomBtn') AppLogic.createNewPrivateRoomHost();
    if (id === 'saveProfileBtn') AppLogic.saveProfile();
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

document.addEventListener('DOMContentLoaded', initApp);