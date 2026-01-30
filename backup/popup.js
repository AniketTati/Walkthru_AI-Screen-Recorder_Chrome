// Simple popup controller

const controls = document.getElementById('controls');
const recordingStatus = document.getElementById('recordingStatus');
const mainBtn = document.getElementById('mainBtn');
const stopBtn = document.getElementById('stopBtn');
const timeDisplay = document.getElementById('recordingTime');
const container = document.getElementById('container');
const title = document.getElementById('title');

let timer = null;
let startTime = null;

// Check state on load
window.addEventListener('load', checkState);

async function checkState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getState' });
    if (response && response.isRecording) {
      showRecording();
    }
  } catch (e) {
    // Not recording
  }
}

// Source buttons
document.querySelectorAll('.source-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
});

// Camera toggle
document.getElementById('cameraToggle').onchange = (e) => {
  document.getElementById('cameraOptions').classList.toggle('hidden', !e.target.checked);
};

// Camera permission button
document.getElementById('setupCameraBtn').onclick = () => {
  chrome.tabs.create({ url: 'permissions.html' });
};

// Start recording
mainBtn.onclick = async () => {
  const source = document.querySelector('.source-btn.active').dataset.source;
  const audio = document.getElementById('audioToggle').checked;
  const cameraEnabled = document.getElementById('cameraToggle').checked;
  const cameraMode = cameraEnabled ? document.querySelector('input[name="cameraMode"]:checked').value : null;
  
  const config = {
    source,
    audio,
    camera: cameraEnabled ? cameraMode : false
  };
  
  // Create offscreen
  await chrome.runtime.sendMessage({ target: 'background', action: 'start' });
  
  // Start recording
  const response = await chrome.runtime.sendMessage({ action: 'start', config });
  
  if (response.success) {
    showRecording();
  } else {
    alert('Failed: ' + response.error);
  }
};

// Stop recording
stopBtn.onclick = async () => {
  await chrome.runtime.sendMessage({ action: 'stop' });
  showControls();
};

function showRecording() {
  document.body.classList.add('recording-mode');
  container.classList.add('recording-compact');
  title.style.display = 'none';
  controls.classList.add('hidden');
  recordingStatus.classList.remove('hidden');
  mainBtn.classList.add('hidden');
  
  startTime = Date.now();
  timer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    timeDisplay.textContent = `${min}:${sec}`;
  }, 1000);
}

function showControls() {
  document.body.classList.remove('recording-mode');
  container.classList.remove('recording-compact');
  title.style.display = 'block';
  controls.classList.remove('hidden');
  recordingStatus.classList.add('hidden');
  mainBtn.classList.remove('hidden');
  
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  timeDisplay.textContent = '00:00';
}
