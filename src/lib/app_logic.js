import { db } from './firebase.js';
import { ref, update } from 'firebase/database';
import { myFirebaseKey } from './audio.js';

export let state = {
    currentRoomId: new URLSearchParams(window.location.search).get('room'),
    localStream: null,
    peer: null,
    isMuted: false,
    activeChannel: 'Lobby',
    pendingRoomCreation: false,
    localVisualizerLoopId: null
};

let currentRemotePeers = [];

export function setLocalStream(stream) { state.localStream = stream; }

export function setupAvatarUpload() {
    const uploadTrigger = document.getElementById('uploadTrigger');
    const avatarUpload = document.getElementById('avatarUpload');
    const avatarPreview = document.getElementById('avatarPreview');
    if (!uploadTrigger || !avatarUpload) return;
    
    uploadTrigger.onclick = () => avatarUpload.click();
    avatarUpload.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => { avatarPreview.src = event.target.result; };
            reader.readAsDataURL(file);
        }
    };
}

export function initializeUI() {
    const networkLabel = document.getElementById('networkStateLabel');
    const modal = document.getElementById('profileModal');
    const saveBtn = document.getElementById('saveProfileBtn');

    
    
    if (modal) modal.classList.add('active');
    if (saveBtn) saveBtn.innerText = "Connect";

    const savedProfile = localStorage.getItem('1tap_user_profile');
    if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        document.getElementById('usernameInput').value = profile.username;
        if(document.getElementById('avatarPreview')) document.getElementById('avatarPreview').src = profile.avatar || '';
        if(document.getElementById('userName')) document.getElementById('userName').innerText = profile.username;
    }

    if (!state.currentRoomId) {
        if (networkLabel) networkLabel.innerText = "AWAITING PRIVATE ROOM CREATION";
    } else {
        if (networkLabel) networkLabel.innerText = "MESH INITIALIZED";
        buildChannelDOMRows();
        const inviteContainer = document.getElementById('inviteContainer');
        if (inviteContainer) {
            inviteContainer.style.display = 'flex';
            document.getElementById('inviteUrl').value = window.location.href;
        }
    }
}

export function saveProfile() {
    const username = document.getElementById('usernameInput').value;
    // CRITICAL: Capture the image source from the preview element
    const avatarPreview = document.getElementById('avatarPreview');
    const avatar = avatarPreview ? avatarPreview.src : ''; 
    
    if (!username) { 
        alert("Enter a username!"); 
        return; 
    }

    // 1. Lock the button
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "Connecting...";
    }

    // 2. Save username AND avatar to localStorage
    localStorage.setItem('1tap_user_profile', JSON.stringify({ username, avatar }));
    
    // Update the UI username immediately
    const userNameDisplay = document.getElementById('userName');
    if (userNameDisplay) userNameDisplay.innerText = username;

    // 3. Hide modal
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none'; 
    
    // 4. Navigate
    if (!state.currentRoomId) {
        createNewPrivateRoomHost();
    }
}

export function buildChannelDOMRows() {
    const container = document.getElementById('dynamicVoiceChannelsContainer');
    if (!container) return;
    const storageKey = `1tap_channels_${state.currentRoomId || 'lobby'}`;
    let channels = JSON.parse(localStorage.getItem(storageKey)) || ['Lobby', 'Match Chat'];
    container.innerHTML = ''; 
    channels.forEach(ch => {
        const div = document.createElement('div');
        div.className = 'voice-room-row';
        div.id = `room-${ch.replace(/\s+/g, '-')}`;
        div.innerHTML = `<div class="room-meta">${ch}</div><ul class="room-occupants" id="occupants-${ch.replace(/\s+/g, '-')}"></ul>`;
        div.onclick = () => switchChannel(ch);
        container.appendChild(div);
    });
    renderOccupants([]);
}

export function renderOccupants(remotePeerObjects = currentRemotePeers) {
    currentRemotePeers = remotePeerObjects;
    document.querySelectorAll('.room-occupants').forEach(list => {
        list.innerHTML = '';
        if (list.id === `occupants-${state.activeChannel.replace(/\s+/g, '-')}`) {
            // Local user row
            const profile = JSON.parse(localStorage.getItem('1tap_user_profile')) || { username: 'You' };
            list.innerHTML = `
                <li class="occupant-item" id="localOccupantItem">
                    <div class="visualizer-ring"></div>
                    <img src="${profile.avatar || ''}" class="occupant-avatar">
                    <span>${profile.username} (You)</span>
                </li>`;
        }
    });

    remotePeerObjects.forEach(peer => {
        const targetList = document.getElementById(`occupants-${peer.channel.replace(/\s+/g, '-')}`);
        if (!targetList || peer.id === state.peer?.id) return;
        
        const li = document.createElement('li');
        li.className = 'occupant-item';
        li.id = `user-${peer.id}`;
        // Ensure image and ring structure are present here too
        li.innerHTML = `
            <div class="visualizer-ring"></div>
            <img src="${peer.avatar || ''}" class="occupant-avatar">
            <span>${peer.username || "Peer"}</span>
        `;
        targetList.appendChild(li);
    });
}

export function startAudioVisualizer(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256;
    source.connect(analyzer);
    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    function update() {
        analyzer.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const localItem = document.getElementById('localOccupantItem');
        if (localItem) {
            avg > 2 ? localItem.classList.add('speaking') : localItem.classList.remove('speaking');
        }
        state.localVisualizerLoopId = requestAnimationFrame(update);
    }
    update();
}

export function switchChannel(channelName) {
    state.activeChannel = channelName;
    document.getElementById('navChannelTitle').innerText = channelName;
    document.querySelectorAll('.voice-room-row').forEach(r => r.classList.remove('active-channel'));
    document.getElementById(`room-${channelName.replace(/\s+/g, '-')}`).classList.add('active-channel');
    
    if (myFirebaseKey) {
        const userRef = ref(db, `rooms/${state.currentRoomId}/peers/${myFirebaseKey}`);
        update(userRef, { channel: channelName });
    }
    renderOccupants(currentRemotePeers);
}

export function createNewPrivateRoomHost() {
    const uniqueSeed = 'room-' + Math.random().toString(36).substring(2, 10);
    window.location.href = window.location.origin + window.location.pathname + `?room=${uniqueSeed}`;
}

export function sendChatMessage(text) {
    const mainStage = document.getElementById('mainStage');
    const profile = JSON.parse(localStorage.getItem('1tap_user_profile')) || { username: 'Guest' };
    const msgRow = document.createElement('div');
    msgRow.className = 'chat-message-row';
    msgRow.innerHTML = `<div class="chat-message-content"><div class="chat-message-author">${profile.username}</div><div class="chat-message-text">${text}</div></div>`;
    mainStage.appendChild(msgRow);
    mainStage.scrollTop = mainStage.scrollHeight;
}

export function toggleMute(muteBtn) {
    if (!state.localStream) return;
    state.isMuted = !state.isMuted;
    state.localStream.getAudioTracks()[0].enabled = !state.isMuted;
    muteBtn.innerText = state.isMuted ? "Unmute" : "Mute";
    muteBtn.classList.toggle('active-muted', state.isMuted);
}

export function handleAddChannelClick() {
    const name = prompt("Enter new channel name:");
    if (name) {
        const storageKey = `1tap_channels_${state.currentRoomId || 'lobby'}`;
        let channels = JSON.parse(localStorage.getItem(storageKey)) || ['Lobby'];
        channels.push(name);
        localStorage.setItem(storageKey, JSON.stringify(channels));
        buildChannelDOMRows();
    }
}