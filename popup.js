// DOM Elements
const sourceBtns = document.querySelectorAll('.source-btn');
const audioToggle = document.getElementById('audioToggle');
const cameraToggle = document.getElementById('cameraToggle');
const cameraOptions = document.getElementById('cameraOptions');
const mainBtn = document.getElementById('mainBtn');
const recordingStatus = document.getElementById('recordingStatus');
const recordingTime = document.getElementById('recordingTime');
const errorMsg = document.getElementById('errorMsg');
const setupCameraBtn = document.getElementById('setupCameraBtn');
const controls = document.getElementById('controls');

let selectedSource = 'tab';
let cameraMode = 'pip';
let isRecording = false;
let mediaRecorder = null;
let cameraRecorder = null;
let recordedChunks = [];
let cameraChunks = [];
let startTime = null;
let timerInterval = null;
let animationId = null;

// Check recording state on load
window.addEventListener('load', async () => {
  const state = await chrome.storage.local.get(['isRecording', 'startTime']);
  if (state.isRecording) {
    // Already recording - show stop UI
    showRecordingUI(state.startTime);
  }
});

// Source Selection
sourceBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    sourceBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSource = btn.dataset.source;
  });
});

// Camera Toggle
cameraToggle.addEventListener('change', () => {
  if (cameraToggle.checked) {
    cameraOptions.classList.remove('hidden');
  } else {
    cameraOptions.classList.add('hidden');
    showError('');
  }
});

// Camera Mode Selection
document.querySelectorAll('input[name="cameraMode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    cameraMode = e.target.value;
  });
});

// Setup Camera Button
setupCameraBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('permissions.html')
  });
});

// Main Recording Button
mainBtn.addEventListener('click', async () => {
  if (!isRecording) {
    await startRecording();
  } else {
    await stopRecording();
  }
});

async function startRecording() {
  try {
    showError('');
    
    // Get screen stream
    const screenConstraints = {
      video: { mediaSource: selectedSource }
    };
    if (audioToggle.checked) {
      screenConstraints.audio = {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      };
    }
    
    const screenStream = await navigator.mediaDevices.getDisplayMedia(screenConstraints);
    
    // Get camera stream if needed
    let cameraStream = null;
    if (cameraToggle.checked) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
      } catch (error) {
        console.error('Camera error:', error);
        showError('Camera access failed. Recording without camera.');
      }
    }
    
    // Setup recording based on mode
    if (cameraToggle.checked && cameraStream && cameraMode === 'pip') {
      await setupPIPRecording(screenStream, cameraStream, audioToggle.checked);
    } else if (cameraToggle.checked && cameraStream && cameraMode === 'separate') {
      await setupSeparateRecording(screenStream, cameraStream);
    } else {
      await setupScreenOnlyRecording(screenStream);
    }
    
    // Handle stream ending (user stops sharing)
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopRecording();
    });
    
    // Update state
    isRecording = true;
    startTime = Date.now();
    await chrome.storage.local.set({ isRecording: true, startTime });
    
    showRecordingUI(startTime);
    
  } catch (error) {
    console.error('Recording error:', error);
    if (error.name === 'NotAllowedError') {
      showError('Screen sharing was cancelled');
    } else {
      showError('Failed to start recording: ' + error.message);
    }
  }
}

async function stopRecording() {
  if (!isRecording) return;
  
  isRecording = false;
  
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (cameraRecorder && cameraRecorder.state !== 'inactive') {
    cameraRecorder.stop();
  }
  
  // Stop all tracks
  if (mediaRecorder && mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  if (cameraRecorder && cameraRecorder.stream) {
    cameraRecorder.stream.getTracks().forEach(track => track.stop());
  }
  
  await chrome.storage.local.set({ isRecording: false });
  
  showControlsUI();
}

async function setupScreenOnlyRecording(screenStream) {
  recordedChunks = [];
  
  mediaRecorder = new MediaRecorder(screenStream, {
    mimeType: 'video/webm;codecs=vp9'
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    downloadRecording(recordedChunks, 'screen-recording');
  };

  mediaRecorder.start();
}

async function setupPIPRecording(screenStream, cameraStream, hasAudio) {
  recordedChunks = [];
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const screenVideo = document.createElement('video');
  screenVideo.srcObject = screenStream;
  screenVideo.muted = true;
  
  const cameraVideo = document.createElement('video');
  cameraVideo.srcObject = cameraStream;
  cameraVideo.muted = true;

  await Promise.all([
    screenVideo.play(),
    cameraVideo.play(),
    new Promise(resolve => screenVideo.onloadedmetadata = resolve),
    new Promise(resolve => cameraVideo.onloadedmetadata = resolve)
  ]);

  canvas.width = screenVideo.videoWidth || 1920;
  canvas.height = screenVideo.videoHeight || 1080;

  const camWidth = Math.floor(canvas.width * 0.2);
  const camHeight = Math.floor(camWidth * (cameraVideo.videoHeight / cameraVideo.videoWidth || 0.75));
  const camX = canvas.width - camWidth - 20;
  const camY = canvas.height - camHeight - 20;

  function drawFrame() {
    if (!isRecording) return;

    try {
      ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.fillRect(camX - 3, camY - 3, camWidth + 6, camHeight + 6);
      ctx.drawImage(cameraVideo, camX, camY, camWidth, camHeight);
    } catch (error) {
      console.error('Draw error:', error);
    }

    animationId = requestAnimationFrame(drawFrame);
  }
  drawFrame();

  const canvasStream = canvas.captureStream(30);
  
  if (hasAudio) {
    screenStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
  }

  mediaRecorder = new MediaRecorder(canvasStream, {
    mimeType: 'video/webm;codecs=vp9'
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    screenVideo.srcObject = null;
    cameraVideo.srcObject = null;
    downloadRecording(recordedChunks, 'screen-recording-with-camera');
  };

  mediaRecorder.start();
}

async function setupSeparateRecording(screenStream, cameraStream) {
  recordedChunks = [];
  cameraChunks = [];

  mediaRecorder = new MediaRecorder(screenStream, {
    mimeType: 'video/webm;codecs=vp9'
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    downloadRecording(recordedChunks, 'screen-recording');
  };

  cameraRecorder = new MediaRecorder(cameraStream, {
    mimeType: 'video/webm;codecs=vp9'
  });

  cameraRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      cameraChunks.push(event.data);
    }
  };

  cameraRecorder.onstop = () => {
    downloadRecording(cameraChunks, 'camera-recording');
  };

  mediaRecorder.start();
  cameraRecorder.start();
}

function downloadRecording(chunks, filename) {
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `${filename}-${Date.now()}.webm`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function showRecordingUI(recordingStartTime) {
  controls.classList.add('hidden');
  recordingStatus.classList.remove('hidden');
  mainBtn.textContent = 'Stop Recording';
  mainBtn.classList.add('recording');
  
  startTime = recordingStartTime;
  
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    recordingTime.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function showControlsUI() {
  controls.classList.remove('hidden');
  recordingStatus.classList.add('hidden');
  mainBtn.textContent = 'Start Recording';
  mainBtn.classList.remove('recording');
  recordingTime.textContent = '00:00';
}

function showError(message) {
  if (message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  } else {
    errorMsg.classList.add('hidden');
  }
}
