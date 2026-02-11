// Screen Recorder Popup Controller

// DOM Elements
const cameraPreview = document.getElementById('cameraPreview');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const previewSection = document.querySelector('.preview-section');
const sourceSelect = document.getElementById('sourceSelect');
const qualitySelect = document.getElementById('qualitySelect');
const countdownSelect = document.getElementById('countdownSelect');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const filenamePrefix = document.getElementById('filenamePrefix');
const qualityRow = document.getElementById('qualityRow');
const countdownRow = document.getElementById('countdownRow');
const cameraRow = document.getElementById('cameraRow');
const micRow = document.getElementById('micRow');
const prefixRow = document.getElementById('prefixRow');
const micLevelBar = document.getElementById('micLevelBar');
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
let micStream = null;
let micAnalyser = null;
let micAnimationId = null;
let timerInterval = null;
let profilePhotoData = null;
let currentMode = 'video';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkStoredError();
  await checkRecordingState();
  await enumerateDevices();
  await loadSavedPreferences();
  updateModeUI();
  setupEventListeners();
  if (currentMode === 'video') updateMicLevelMeter();
});

// Check for stored error from background (e.g. recording failure when popup was closed)
async function checkStoredError() {
  try {
    const { lastError } = await chrome.storage.local.get('lastError');
    if (lastError) {
      await chrome.storage.local.remove('lastError');
      showError(lastError);
      // Clear error badge
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {}
}

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
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
      })
      .catch(() => {});

    const devices = await navigator.mediaDevices.enumerateDevices();
    
    const cameras = devices.filter(d => d.kind === 'videoinput');
    cameraSelect.innerHTML = '<option value="">No Camera</option>';
    cameras.forEach(camera => {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      option.textContent = camera.label || `Camera ${cameraSelect.options.length}`;
      cameraSelect.appendChild(option);
    });

    const mics = devices.filter(d => d.kind === 'audioinput');
    micSelect.innerHTML = '<option value="">No Microphone</option>';
    mics.forEach(mic => {
      const option = document.createElement('option');
      option.value = mic.deviceId;
      option.textContent = mic.label || `Microphone ${micSelect.options.length}`;
      micSelect.appendChild(option);
    });

  } catch (e) {
    // Failed to enumerate devices
  }
}

// Load saved preferences
async function loadSavedPreferences() {
  try {
    const prefs = await chrome.storage.local.get(['source', 'quality', 'countdownDuration', 'cameraId', 'micId', 'cameraMode', 'profilePhoto', 'filenamePrefix', 'mode']);
    
    if (prefs.mode === 'photo' || prefs.mode === 'video') {
      currentMode = prefs.mode;
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.mode-btn[data-mode="${currentMode}"]`)?.classList.add('active');
    }
    if (prefs.source) {
      sourceSelect.value = prefs.source;
    }
    if (prefs.quality && qualitySelect.querySelector(`option[value="${prefs.quality}"]`)) {
      qualitySelect.value = prefs.quality;
    }
    if (prefs.countdownDuration && countdownSelect.querySelector(`option[value="${prefs.countdownDuration}"]`)) {
      countdownSelect.value = prefs.countdownDuration;
    }
    if (prefs.filenamePrefix) {
      filenamePrefix.value = prefs.filenamePrefix;
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
    
    updateCameraOptionsVisibility();
  } catch (e) {
    // Failed to load preferences
  }
}

// Save preferences
async function savePreferences() {
  try {
    await chrome.storage.local.set({
      source: sourceSelect.value,
      quality: qualitySelect.value,
      countdownDuration: countdownSelect.value,
      cameraId: cameraSelect.value,
      micId: micSelect.value,
      cameraMode: cameraModeSelect.value,
      profilePhoto: profilePhotoData,
      filenamePrefix: filenamePrefix.value.trim(),
      mode: currentMode
    });
  } catch (e) {
    // Failed to save preferences
  }
}

// Microphone level meter
function updateMicLevelMeter() {
  stopMicLevelMeter();
  if (!micSelect.value) {
    micLevelBar.classList.add('hidden');
    return;
  }
  micLevelBar.classList.remove('hidden');
  navigator.mediaDevices.getUserMedia({ audio: { deviceId: micSelect.value } })
    .then((stream) => {
      micStream = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.8;
      source.connect(micAnalyser);
      const data = new Uint8Array(micAnalyser.frequencyBinCount);
      
      function update() {
        if (!micAnalyser) return;
        micAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const level = Math.min(100, (avg / 128) * 100);
        micLevelBar.querySelector('.mic-level-fill').style.width = level + '%';
        micAnimationId = requestAnimationFrame(update);
      }
      update();
    })
    .catch(() => micLevelBar.classList.add('hidden'));
}

function stopMicLevelMeter() {
  if (micAnimationId) {
    cancelAnimationFrame(micAnimationId);
    micAnimationId = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  micAnalyser = null;
  micLevelBar.classList.add('hidden');
}

// Update camera options visibility
function updateCameraOptionsVisibility() {
  if (currentMode === 'video' && cameraSelect.value) {
    cameraModeRow.style.display = 'flex';
    photoSection.style.display = 'block';
  } else {
    cameraModeRow.style.display = 'none';
    photoSection.style.display = 'none';
  }
}

// Update UI based on current mode
function updateModeUI() {
  if (currentMode === 'photo') {
    previewSection.style.display = 'none';
    qualityRow.style.display = 'none';
    countdownRow.style.display = 'none';
    cameraRow.style.display = 'none';
    micRow.style.display = 'none';
    cameraModeRow.style.display = 'none';
    photoSection.style.display = 'none';
    startBtn.textContent = 'Take Screenshot';
    stopMicLevelMeter();
    
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop());
      previewStream = null;
      cameraPreview.srcObject = null;
    }
  } else {
    previewSection.style.display = 'block';
    qualityRow.style.display = 'flex';
    countdownRow.style.display = 'flex';
    cameraRow.style.display = 'flex';
    micRow.style.display = 'flex';
    startBtn.textContent = 'Start Recording';
    updateCameraOptionsVisibility();
    updateMicLevelMeter();
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
  
  if (file.size > 2 * 1024 * 1024) {
    showError('Image too large. Max 2MB.');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
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
        photoUrl.value = '';
      });
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    showError('Failed to load image from URL');
  }
}

// Resize image
function resizeImage(dataUrl, maxSize, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;
    
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
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      updateModeUI();
      savePreferences();
    });
  });

  cameraSelect.addEventListener('change', async () => {
    await savePreferences();
    await updateCameraPreview();
    updateCameraOptionsVisibility();
  });

  cameraModeSelect.addEventListener('change', savePreferences);
  sourceSelect.addEventListener('change', savePreferences);
  qualitySelect.addEventListener('change', savePreferences);
  countdownSelect.addEventListener('change', savePreferences);
  micSelect.addEventListener('change', () => {
    savePreferences();
    updateMicLevelMeter();
  });
  filenamePrefix.addEventListener('input', savePreferences);
  filenamePrefix.addEventListener('blur', savePreferences);

  photoUpload.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handlePhotoUpload(e.target.files[0]);
    }
  });

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

  removePhotoBtn.addEventListener('click', removePhoto);

  startBtn.addEventListener('click', () => {
    if (currentMode === 'photo') {
      takeScreenshot();
    } else {
      startRecording();
    }
  });

  navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);

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

  if (previewStream) {
    previewStream.getTracks().forEach(track => track.stop());
    previewStream = null;
    cameraPreview.srcObject = null;
    cameraPreview.classList.remove('active');
    previewPlaceholder.classList.remove('hidden');
  }

  const config = {
    source: sourceSelect.value,
    quality: qualitySelect.value,
    countdownDuration: parseInt(countdownSelect.value, 10) || 3,
    cameraId: cameraSelect.value || null,
    micId: micSelect.value || null,
    cameraMode: cameraModeSelect.value,
    profilePhoto: profilePhotoData || null,
    filenamePrefix: filenamePrefix.value.trim() || null
  };

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'startRecording',
      config
    });

    if (response && response.success) {
      // Close popup so the user can see the countdown and controls on the page
      window.close();
      return;
    } else {
      const errorMessage = response?.error || 'Failed to start recording';
      showError(errorMessage);
      startBtn.disabled = false;
      startBtn.textContent = 'Start Recording';
    }
  } catch (e) {
    showError(e.message || 'Failed to start recording');
    startBtn.disabled = false;
    startBtn.textContent = 'Start Recording';
  }
}

// Take screenshot
async function takeScreenshot() {
  hideError();
  startBtn.disabled = true;
  startBtn.textContent = 'Capturing...';

  const source = sourceSelect.value;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'captureScreenshot',
      config: {
        source,
        filenamePrefix: filenamePrefix?.value?.trim() || null
      }
    });

    if (response && response.success) {
      startBtn.textContent = 'Screenshot Saved!';
      setTimeout(() => {
        startBtn.disabled = false;
        startBtn.textContent = 'Take Screenshot';
      }, 1500);
    } else {
      const errorMessage = response?.error || 'Failed to capture screenshot';
      showError(errorMessage);
      startBtn.disabled = false;
      startBtn.textContent = 'Take Screenshot';
    }
  } catch (e) {
    showError(e.message || 'Failed to capture screenshot');
    startBtn.disabled = false;
    startBtn.textContent = 'Take Screenshot';
  }
}

// Show recording state
function showRecordingState(startTime) {
  startBtn.classList.add('hidden');
  recordingStatus.classList.remove('hidden');
  
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
  stopMicLevelMeter();
});
