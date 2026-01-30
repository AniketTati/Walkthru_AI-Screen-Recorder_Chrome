// Offscreen document - handles all recording

let recorder = null;
let chunks = [];
let isRecording = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    startRecording(message.config)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.action === 'stop') {
    stopRecording();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'getState') {
    sendResponse({ isRecording });
    return true;
  }
});

async function startRecording(config) {
  if (isRecording) return;
  
  // Get screen
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: config.audio
  });
  
  // Get camera if needed
  let camStream = null;
  if (config.camera) {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
      console.log('No camera');
    }
  }
  
  // Setup recording
  let finalStream = stream;
  
  if (camStream && config.camera === 'pip') {
    finalStream = await combinePIP(stream, camStream, config.audio);
  } else if (camStream && config.camera === 'separate') {
    recordSeparate(stream, camStream);
    return;
  }
  
  // Record
  chunks = [];
  recorder = new MediaRecorder(finalStream);
  
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  
  recorder.onstop = () => {
    download(chunks, 'recording');
    finalStream.getTracks().forEach(t => t.stop());
  };
  
  recorder.start(1000);
  isRecording = true;
  
  // Stop when user stops sharing
  stream.getVideoTracks()[0].onended = () => stopRecording();
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  if (recorder) recorder.stop();
}

async function combinePIP(screen, camera, hasAudio) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const screenVid = document.createElement('video');
  screenVid.srcObject = screen;
  screenVid.muted = true;
  await screenVid.play();
  
  const camVid = document.createElement('video');
  camVid.srcObject = camera;
  camVid.muted = true;
  await camVid.play();
  
  await new Promise(r => screenVid.onloadedmetadata = r);
  await new Promise(r => camVid.onloadedmetadata = r);
  
  canvas.width = screenVid.videoWidth;
  canvas.height = screenVid.videoHeight;
  
  const camW = canvas.width * 0.2;
  const camH = camW * (camVid.videoHeight / camVid.videoWidth);
  const camX = canvas.width - camW - 20;
  const camY = canvas.height - camH - 20;
  
  function draw() {
    if (!isRecording) return;
    ctx.drawImage(screenVid, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.fillRect(camX - 2, camY - 2, camW + 4, camH + 4);
    ctx.drawImage(camVid, camX, camY, camW, camH);
    requestAnimationFrame(draw);
  }
  draw();
  
  const canvasStream = canvas.captureStream(30);
  
  if (hasAudio) {
    screen.getAudioTracks().forEach(t => canvasStream.addTrack(t));
  }
  
  return canvasStream;
}

function recordSeparate(screen, camera) {
  // Screen
  chunks = [];
  recorder = new MediaRecorder(screen);
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    download(chunks, 'screen');
    screen.getTracks().forEach(t => t.stop());
  };
  recorder.start(1000);
  
  // Camera
  const camChunks = [];
  const camRecorder = new MediaRecorder(camera);
  camRecorder.ondataavailable = e => { if (e.data.size > 0) camChunks.push(e.data); };
  camRecorder.onstop = () => {
    download(camChunks, 'camera');
    camera.getTracks().forEach(t => t.stop());
  };
  camRecorder.start(1000);
  
  isRecording = true;
  
  screen.getVideoTracks()[0].onended = () => {
    recorder.stop();
    camRecorder.stop();
    isRecording = false;
  };
}

function download(chunks, name) {
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${Date.now()}.webm`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
