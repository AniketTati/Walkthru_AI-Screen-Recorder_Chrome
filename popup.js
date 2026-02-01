// Screen Recorder Popup Controller

// DOM Elements
const cameraPreview = document.getElementById('cameraPreview');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const sourceSelect = document.getElementById('sourceSelect');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const cameraModeRow = document.getElementById('cameraModeRow');
const cameraModeSelect = document.getElementById('cameraModeSelect');
const photoSection = document.getElementById('photoSection');
const photoPreview = document.getElementById('photoPreview');
const photoUpload = document.getElementById('photoUpload');
const photoUrl = document.getElementById('photoUrl');
const removePhotoBtn = document.getElementById('removePhotoBtn');
const startBtn = document.getElementById('startBtn');
const recordingStatus = document.getElementById('recordingStatus');
const recordingTime = document.getElementById('recordingTime');
const errorMsg = document.getElementById('errorMsg');

// State
let previewStream = null;
let timerInterval = null;
let profilePhotoData = null; // Base64 photo data

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkRecordingState();
  await enumerateDevices();
  await loadSavedPreferences();
  setupEventListeners();
});

// Check if already recording
async function checkRecordingState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getState' });
    if (response && response.isRecording) {
      showRecordingState(response.startTime);
    }
  } catch (e) {
    // Not recording
  }
}

// Enumerate available devices
async function enumerateDevices() {
  try {
    // Request permission to enumerate devices
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
      })
      .catch(() => {
        // Permission denied, will show empty lists
      });

    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Populate camera dropdown
    const cameras = devices.filter(d => d.kind === 'videoinput');
    cameraSelect.innerHTML = '<option value="">No Camera</option>';
    cameras.forEach(camera => {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      option.textContent = camera.label || `Camera ${cameraSelect.options.length}`;
      cameraSelect.appendChild(option);
    });

    // Populate microphone dropdown
    const mics = devices.filter(d => d.kind === 'audioinput');
    micSelect.innerHTML = '<option value="">No Microphone</option>';
    mics.forEach(mic => {
      const option = document.createElement('option');
      option.value = mic.deviceId;
      option.textContent = mic.label || `Microphone ${micSelect.options.length}`;
      micSelect.appendChild(option);
    });

  } catch (e) {
    console.error('Failed to enumerate devices:', e);
  }
}

// Load saved preferences
async function loadSavedPreferences() {
  try {
    const prefs = await chrome.storage.local.get(['source', 'cameraId', 'micId', 'cameraMode', 'profilePhoto']);
    
    if (prefs.source) {
      sourceSelect.value = prefs.source;
    }
    if (prefs.cameraId && cameraSelect.querySelector(`option[value="${prefs.cameraId}"]`)) {
      cameraSelect.value = prefs.cameraId;
      await updateCameraPreview();
    }
    if (prefs.micId && micSelect.querySelector(`option[value="${prefs.micId}"]`)) {
      micSelect.value = prefs.micId;
    }
    if (prefs.cameraMode) {
      cameraModeSelect.value = prefs.cameraMode;
    }
    if (prefs.profilePhoto) {
      profilePhotoData = prefs.profilePhoto;
      updatePhotoPreview();
    }
    
    // Show/hide camera options based on camera selection
    updateCameraOptionsVisibility();
  } catch (e) {
    console.error('Failed to load preferences:', e);
  }
}

// Save preferences
async function savePreferences() {
  try {
    await chrome.storage.local.set({
      source: sourceSelect.value,
      cameraId: cameraSelect.value,
      micId: micSelect.value,
      cameraMode: cameraModeSelect.value,
      profilePhoto: profilePhotoData
    });
  } catch (e) {
    console.error('Failed to save preferences:', e);
  }
}

// Update camera options visibility (mode selector and photo section)
function updateCameraOptionsVisibility() {
  if (cameraSelect.value) {
    cameraModeRow.style.display = 'flex';
    photoSection.style.display = 'block';
  } else {
    cameraModeRow.style.display = 'none';
    photoSection.style.display = 'none';
  }
}

// Update photo preview
function updatePhotoPreview() {
  if (profilePhotoData) {
    photoPreview.innerHTML = `<img src="${profilePhotoData}" alt="Profile">`;
    photoPreview.classList.add('has-photo');
    removePhotoBtn.classList.remove('hidden');
  } else {
    photoPreview.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="10" r="3"></circle>
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 0 1-6.25-3A6 6 0 0 1 12 14a6 6 0 0 1 6.25 3A8 8 0 0 1 12 20z"></path>
      </svg>
    `;
    photoPreview.classList.remove('has-photo');
    removePhotoBtn.classList.add('hidden');
  }
}

// Handle photo file upload
function handlePhotoUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    showError('Please select a valid image file');
    return;
  }
  
  // Limit file size (2MB)
  if (file.size > 2 * 1024 * 1024) {
    showError('Image too large. Max 2MB.');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    // Resize image to reasonable size
    resizeImage(e.target.result, 200, (resizedData) => {
      profilePhotoData = resizedData;
      updatePhotoPreview();
      savePreferences();
    });
  };
  reader.readAsDataURL(file);
}

// Handle photo URL input
async function handlePhotoUrl(url) {
  if (!url) return;
  
  try {
    // Fetch and convert to base64
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      throw new Error('URL is not an image');
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      resizeImage(e.target.result, 200, (resizedData) => {
        profilePhotoData = resizedData;
        updatePhotoPreview();
        savePreferences();
        photoUrl.value = ''; // Clear input
      });
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    showError('Failed to load image from URL');
  }
}

// Resize image to max dimension
function resizeImage(dataUrl, maxSize, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;
    
    // Scale down if needed
    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL('image/jpeg', 0.8));
  };
  img.src = dataUrl;
}

// Remove photo
function removePhoto() {
  profilePhotoData = null;
  updatePhotoPreview();
  savePreferences();
}

// Setup event listeners
function setupEventListeners() {
  // Mode toggle (Video/Photo)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Camera selection change
  cameraSelect.addEventListener('change', async () => {
    await savePreferences();
    await updateCameraPreview();
    updateCameraOptionsVisibility();
  });

  // Camera mode change
  cameraModeSelect.addEventListener('change', savePreferences);

  // Source and mic changes
  sourceSelect.addEventListener('change', savePreferences);
  micSelect.addEventListener('change', savePreferences);

  // Photo upload
  photoUpload.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handlePhotoUpload(e.target.files[0]);
    }
  });

  // Photo URL input (on blur or Enter)
  photoUrl.addEventListener('blur', () => {
    if (photoUrl.value.trim()) {
      handlePhotoUrl(photoUrl.value.trim());
    }
  });
  photoUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && photoUrl.value.trim()) {
      handlePhotoUrl(photoUrl.value.trim());
    }
  });

  // Remove photo
  removePhotoBtn.addEventListener('click', removePhoto);

  // Start recording
  startBtn.addEventListener('click', startRecording);

  // Listen for device changes
  navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);

  // Listen for state updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'stateUpdate') {
      if (message.state === 'recording') {
        showRecordingState(message.startTime);
      } else if (message.state === 'stopped') {
        hideRecordingState();
      }
    }
  });
}

// Update camera preview
async function updateCameraPreview() {
  // Stop existing preview
  if (previewStream) {
    previewStream.getTracks().forEach(track => track.stop());
    previewStream = null;
  }

  const cameraId = cameraSelect.value;
  
  if (!cameraId) {
    cameraPreview.classList.remove('active');
    previewPlaceholder.classList.remove('hidden');
    return;
  }

  try {
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: cameraId } }
    });
    cameraPreview.srcObject = previewStream;
    cameraPreview.classList.add('active');
    previewPlaceholder.classList.add('hidden');
  } catch (e) {
    console.error('Failed to start camera preview:', e);
    cameraPreview.classList.remove('active');
    previewPlaceholder.classList.remove('hidden');
    showError('Failed to access camera');
  }
}

// Start recording
async function startRecording() {
  hideError();
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  // Stop camera preview to release the camera for recording
  if (previewStream) {
    previewStream.getTracks().forEach(track => track.stop());
    previewStream = null;
    cameraPreview.srcObject = null;
    cameraPreview.classList.remove('active');
    previewPlaceholder.classList.remove('hidden');
  }

  const config = {
    source: sourceSelect.value,
    cameraId: cameraSelect.value || null,
    micId: micSelect.value || null,
    cameraMode: cameraModeSelect.value, // 'live' or 'photo'
    profilePhoto: profilePhotoData || null
  };

  try {
    console.log('Popup: Sending startRecording message with config:', config);
    
    // Send start message to background
    const response = await chrome.runtime.sendMessage({
      action: 'startRecording',
      config
    });
    
    console.log('Popup: Response from background:', response);

    if (response && response.success) {
      showRecordingState(Date.now());
    } else {
      const errorMsg = response?.error || 'Failed to start recording';
      console.error('Popup: Recording failed:', errorMsg);
      showError(errorMsg);
      startBtn.disabled = false;
      startBtn.textContent = 'Start Recording';
    }
  } catch (e) {
    console.error('Popup: Error starting recording:', e);
    showError(e.message || 'Failed to start recording');
    startBtn.disabled = false;
    startBtn.textContent = 'Start Recording';
  }
}

// Show recording state
function showRecordingState(startTime) {
  startBtn.classList.add('hidden');
  recordingStatus.classList.remove('hidden');
  
  // Start timer
  if (timerInterval) clearInterval(timerInterval);
  
  const updateTimer = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    recordingTime.textContent = `${min}:${sec}`;
  };
  
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

// Hide recording state
function hideRecordingState() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  recordingStatus.classList.add('hidden');
  startBtn.classList.remove('hidden');
  startBtn.disabled = false;
  startBtn.textContent = 'Start Recording';
  recordingTime.textContent = '00:00';
}

// Show error message
function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove('hidden');
}

// Hide error message
function hideError() {
  errorMsg.classList.add('hidden');
}

// Cleanup on popup close
window.addEventListener('unload', () => {
  if (previewStream) {
    previewStream.getTracks().forEach(track => track.stop());
  }
});
