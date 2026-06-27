import './styles/main.css';
import { bootConnectionPipeline } from './lib/audio.js';
import * as AppLogic from './lib/app_logic.js';

window.handleAddChannelClick = AppLogic.handleAddChannelClick;
window.switchChannel = AppLogic.switchChannel;

async function initApp() {
    AppLogic.initializeUI();
    AppLogic.setupAvatarUpload();

    const stream = await bootConnectionPipeline();
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