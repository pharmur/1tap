import { db } from './firebase.js';
import { ref, update } from 'firebase/database';
import { myFirebaseKey } from './audio.js';

// 1. Module-level variable for the callback
let onProfileSavedCallback = null;

// 2. Exported function to set the callback from main.js
export function setOnProfileSaved(callback) {
    onProfileSavedCallback = callback;
}

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
        try {
            const profile = JSON.parse(savedProfile);
            const usernameInput = document.getElementById('usernameInput');
            const avatarPreview = document.getElementById('avatarPreview');
            const userName = document.getElementById('userName');
            
            if (usernameInput) usernameInput.value = profile.username;
            if (avatarPreview) avatarPreview.src = profile.avatar || '';
            if (userName) userName.innerText = profile.username;
        } catch (e) {
            console.error("Error parsing profile:", e);
        }
    }

    if (!state.currentRoomId) {
        if (networkLabel) networkLabel.innerText = "AWAITING PRIVATE ROOM CREATION";
    } else {
        if (networkLabel) networkLabel.innerText = "MESH INITIALIZED";
        buildChannelDOMRows();
        const inviteContainer = document.getElementById('inviteContainer');
        if (inviteContainer) {
            inviteContainer.style.display = 'flex';
            const inviteUrl = document.getElementById('inviteUrl');
            if (inviteUrl) inviteUrl.value = window.location.href;
        }
    }
}

export function saveProfile() {
    const usernameInput = document.getElementById('usernameInput');
    const avatarPreview = document.getElementById('avatarPreview');
    const username = usernameInput.value.trim() || 'Guest';
    const avatarData = avatarPreview.src;

    if (!avatarData || avatarData === "") {
        alert("Please upload an avatar first!");
        return;
    }

    // 1. Save profile
    localStorage.setItem('1tap_user_profile', JSON.stringify({ username, avatar: avatarData }));
    
    // 2. Hide modal
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';

    // 3. Logic Flow:
    // If we are already in a room (currentRoomId exists), boot the pipeline.
    // If we are NOT in a room, create one (which reloads the page with a room ID).
    if (state.currentRoomId) {
        console.log("Room ID detected, booting pipeline...");
        if (typeof onProfileSavedCallback === 'function') {
            onProfileSavedCallback(); 
        }
    } else {
        console.log("No room ID found, triggering new room creation...");
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
    const activeChannelSafe = state.activeChannel || 'Lobby';
    
    document.querySelectorAll('.room-occupants').forEach(list => {
        list.innerHTML = '';
        if (list.id === `occupants-${activeChannelSafe.replace(/\s+/g, '-')}`) {
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
        // Safe access to channel property
        const channelName = peer.channel || 'Lobby';
        const targetList = document.getElementById(`occupants-${channelName.replace(/\s+/g, '-')}`);
        if (!targetList || peer.id === state.peer?.id) return;
        
        const li = document.createElement('li');
        li.className = 'occupant-item';
        li.id = `user-${peer.id}`;
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
    const navTitle = document.getElementById('navChannelTitle');
    if (navTitle) navTitle.innerText = channelName;
    
    document.querySelectorAll('.voice-room-row').forEach(r => r.classList.remove('active-channel'));
    const activeRow = document.getElementById(`room-${channelName.replace(/\s+/g, '-')}`);
    if (activeRow) activeRow.classList.add('active-channel');
    
    if (myFirebaseKey) {
        const userRef = ref(db, `rooms/${state.currentRoomId}/peers/${myFirebaseKey}`);
        update(userRef, { channel: channelName });
    }
    renderOccupants(currentRemotePeers);
}

export function createNewPrivateRoomHost() {
    const uniqueSeed = 'room-' + Math.random().toString(36).substring(2, 10);
    
    // Update URL without reloading the page
    const newUrl = window.location.origin + window.location.pathname + `?room=${uniqueSeed}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    
    // Update state and proceed
    state.currentRoomId = uniqueSeed;
    
    // Now trigger the pipeline directly without a full browser reload
    console.log("Room created via History API, booting pipeline...");
    if (typeof onProfileSavedCallback === 'function') {
        onProfileSavedCallback();
    }
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