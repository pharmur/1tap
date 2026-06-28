import './styles/main.css';
import { bootConnectionPipeline } from './lib/audio.js';
import * as AppLogic from './lib/app_logic.js';

window.handleAddChannelClick = AppLogic.handleAddChannelClick;
window.switchChannel = AppLogic.switchChannel;

async function initApp() {
    AppLogic.initializeUI();
    AppLogic.setupAvatarUpload();

    // UPDATED: Passing callbacks to handle UI updates and remote streams
    const stream = await bootConnectionPipeline(
        // 1. Sidebar update callback (runs when peers change in Firebase)
        (peerIds) => {
            console.log("Peer list updated:", peerIds);
            // This is the critical change: pass peerIds so it can render everyone
            AppLogic.renderOccupants(peerIds);
        },
        // 2. Remote stream callback (runs when a call connects)
        (peerId, remoteStream) => {
            console.log("Starting visualizer for peer:", peerId);
            
            // Create a dedicated visualizer for this remote peer
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(remoteStream);
            const analyzer = audioContext.createAnalyser();
            analyzer.fftSize = 256;
            source.connect(analyzer);
            
            const dataArray = new Uint8Array(analyzer.frequencyBinCount);
            function update() {
                analyzer.getByteFrequencyData(dataArray);
                // Lowered threshold to 5 for better sensitivity
                const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
                
                // Toggle 'speaking' class on the sidebar element
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
        AppLogic.setLocalStream(stream);
        AppLogic.startAudioVisualizer(stream);
    }

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

    document.addEventListener('click', (e) => {
        const id = e.target.id;
        if (id === 'createRoomBtn') AppLogic.createNewPrivateRoomHost();
        if (id === 'saveProfileBtn') AppLogic.saveProfile();
        if (id === 'addChannelBtn') AppLogic.handleAddChannelClick();
        if (id === 'muteBtn') AppLogic.toggleMute(e.target);
        if (id === 'copyBtn') {
            const url = document.getElementById('inviteUrl');
            url.select();
            document.execCommand('copy');
            alert("Invite URL copied!");
        }
    });
}

document.addEventListener('DOMContentLoaded', initApp);