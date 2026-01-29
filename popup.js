let isRecording = false;
let mediaRecorder = null;
let cameraRecorder = null;
let recordedChunks = [];
let cameraChunks = [];
let startTime = null;
let timerInterval = null;

// DOM Elements
const sourceBtns = document.querySelectorAll('.source-btn');
const audioToggle = document.getElementById('audioToggle');
const cameraToggle = document.getElementById('cameraToggle');
const cameraOptions = document.getElementById('cameraOptions');
const mainBtn = document.getElementById('mainBtn');
const recordingStatus = document.getElementById('recordingStatus');
const recordingTime = document.getElementById('recordingTime');
const errorMsg = document.getElementById('errorMsg');

let selectedSource = 'tab';
let cameraMode = 'pip';

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
  }
});

// Camera Mode Selection
document.querySelectorAll('input[name="cameraMode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    cameraMode = e.target.value;
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
    const screenStream = await getScreenStream();
    if (!screenStream) return;

    // Get camera stream if enabled
    let cameraStream = null;
    if (cameraToggle.checked) {
      cameraStream = await getCameraStream();
      if (!cameraStream) {
        screenStream.getTracks().forEach(track => track.stop());
        return;
      }
    }

    // Setup recording based on camera mode
    if (cameraToggle.checked && cameraMode === 'pip') {
      // Picture-in-Picture: Combine streams
      await setupPIPRecording(screenStream, cameraStream);
    } else if (cameraToggle.checked && cameraMode === 'separate') {
      // Separate Files: Record both independently
      await setupSeparateRecording(screenStream, cameraStream);
    } else {
      // Screen only
      await setupScreenOnlyRecording(screenStream);
    }

    // Update UI
    isRecording = true;
    mainBtn.textContent = 'Stop Recording';
    mainBtn.classList.add('recording');
    recordingStatus.classList.remove('hidden');
    startTimer();

  } catch (error) {
    console.error('Recording error:', error);
    showError('Failed to start recording: ' + error.message);
  }
}

async function stopRecording() {
  try {
    // Stop all recorders
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

    // Update UI
    isRecording = false;
    mainBtn.textContent = 'Start Recording';
    mainBtn.classList.remove('recording');
    recordingStatus.classList.add('hidden');
    stopTimer();

  } catch (error) {
    console.error('Stop recording error:', error);
    showError('Failed to stop recording: ' + error.message);
  }
}

async function getScreenStream() {
  try {
    const constraints = {
      video: {
        mediaSource: selectedSource === 'tab' ? 'tab' : 
                     selectedSource === 'window' ? 'window' : 'screen'
      }
    };

    if (audioToggle.checked) {
      constraints.audio = {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      };
    }

    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    return stream;
  } catch (error) {
    showError('Screen capture denied or failed');
    return null;
  }
}

async function getCameraStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: false
    });
    return stream;
  } catch (error) {
    showError('Camera access denied or failed');
    return null;
  }
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

async function setupPIPRecording(screenStream, cameraStream) {
  recordedChunks = [];

  // Create canvas to combine streams
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const screenVideo = document.createElement('video');
  screenVideo.srcObject = screenStream;
  screenVideo.play();

  const cameraVideo = document.createElement('video');
  cameraVideo.srcObject = cameraStream;
  cameraVideo.play();

  // Wait for video metadata to load
  await Promise.all([
    new Promise(resolve => screenVideo.onloadedmetadata = resolve),
    new Promise(resolve => cameraVideo.onloadedmetadata = resolve)
  ]);

  canvas.width = screenVideo.videoWidth;
  canvas.height = screenVideo.videoHeight;

  // Camera dimensions and position (bottom-right corner)
  const camWidth = canvas.width * 0.2;
  const camHeight = camWidth * (cameraVideo.videoHeight / cameraVideo.videoWidth);
  const camX = canvas.width - camWidth - 20;
  const camY = canvas.height - camHeight - 20;

  // Draw frames
  function drawFrame() {
    if (!isRecording) return;

    // Draw screen
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

    // Draw camera with border
    ctx.fillStyle = 'white';
    ctx.fillRect(camX - 3, camY - 3, camWidth + 6, camHeight + 6);
    ctx.drawImage(cameraVideo, camX, camY, camWidth, camHeight);

    requestAnimationFrame(drawFrame);
  }
  drawFrame();

  // Capture canvas stream
  const canvasStream = canvas.captureStream(30);
  
  // Add audio from screen if enabled
  if (audioToggle.checked) {
    const audioTracks = screenStream.getAudioTracks();
    audioTracks.forEach(track => canvasStream.addTrack(track));
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

  // Screen recorder
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

  // Camera recorder
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

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    recordingTime.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
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
