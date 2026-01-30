// Screen Recorder Offscreen Document
// Handles actual recording, audio mixing, and PIP compositing

// State
let mediaRecorder = null;
let recordedChunks = [];
let screenStream = null;
let cameraStream = null;
let micStream = null;
let audioContext = null;
let compositeStream = null;
let isRecording = false;
let isPaused = false;
let animationId = null;

// DOM Elements
const screenVideo = document.getElementById('screenVideo');
const cameraVideo = document.getElementById('cameraVideo');
const canvas = document.getElementById('compositeCanvas');
const ctx = canvas.getContext('2d');

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;
  
  console.log('Offscreen: Received message:', message.action);
  
  handleMessage(message).then(response => {
    console.log('Offscreen: Sending response:', response);
    sendResponse(response);
  }).catch(e => {
    console.error('Offscreen: Error handling message:', e);
    sendResponse({ success: false, error: e.message });
  });
  
  return true;
});

async function handleMessage(message) {
  switch (message.action) {
    case 'startRecording':
      return await startRecording(message.config);
    case 'stopRecording':
      return await stopRecording();
    case 'pauseRecording':
      return pauseRecording();
    case 'resumeRecording':
      return resumeRecording();
    case 'discardRecording':
      return discardRecording();
    default:
      return { error: 'Unknown action' };
  }
}

// Start recording
async function startRecording(config) {
  try {
    recordedChunks = [];
    
    // Get screen/window/tab capture
    const displayMediaOptions = {
      video: {
        displaySurface: config.source === 'tab' ? 'browser' : 
                        config.source === 'window' ? 'window' : 'monitor'
      },
      audio: true, // System audio
      preferCurrentTab: config.source === 'tab'
    };

    screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    
    // Setup screen video element
    screenVideo.srcObject = screenStream;
    await screenVideo.play();
    await new Promise(resolve => {
      if (screenVideo.readyState >= 2) resolve();
      else screenVideo.onloadeddata = resolve;
    });

    // Get camera if selected
    if (config.cameraId) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: config.cameraId } }
        });
        cameraVideo.srcObject = cameraStream;
        await cameraVideo.play();
      } catch (e) {
        console.warn('Failed to get camera:', e);
      }
    }

    // Get microphone if selected
    if (config.micId) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: config.micId } }
        });
      } catch (e) {
        console.warn('Failed to get microphone:', e);
      }
    }

    // Setup final stream for recording
    let finalStream;
    
    if (cameraStream) {
      // Composite screen + camera
      finalStream = await createCompositeStream(screenStream, cameraStream, config.micId ? micStream : null);
    } else {
      // Just screen with mixed audio
      finalStream = await createStreamWithMixedAudio(screenStream, micStream);
    }

    // Create MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    
    mediaRecorder = new MediaRecorder(finalStream, { mimeType });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      if (recordedChunks.length > 0 && !isPaused) {
        downloadRecording();
      }
      cleanup();
      chrome.runtime.sendMessage({ action: 'recordingStopped' });
    };

    // Start recording
    mediaRecorder.start(1000); // Collect data every second
    isRecording = true;
    isPaused = false;

    // Listen for stream end (user stops sharing)
    screenStream.getVideoTracks()[0].onended = () => {
      if (isRecording) {
        stopRecording();
      }
    };

    // Notify background that recording started
    chrome.runtime.sendMessage({ action: 'recordingStarted' });

    return { success: true };
  } catch (e) {
    console.error('Failed to start recording:', e);
    cleanup();
    return { success: false, error: e.message };
  }
}

// Create stream with mixed audio (system + mic)
async function createStreamWithMixedAudio(screenStream, micStream) {
  const tracks = [...screenStream.getVideoTracks()];
  
  // Check if we have any audio to mix
  const systemAudioTracks = screenStream.getAudioTracks();
  const micAudioTracks = micStream ? micStream.getAudioTracks() : [];

  if (systemAudioTracks.length === 0 && micAudioTracks.length === 0) {
    // No audio
    return new MediaStream(tracks);
  }

  if (systemAudioTracks.length === 0) {
    // Only mic audio
    tracks.push(...micAudioTracks);
    return new MediaStream(tracks);
  }

  if (micAudioTracks.length === 0) {
    // Only system audio
    tracks.push(...systemAudioTracks);
    return new MediaStream(tracks);
  }

  // Mix both audio sources
  audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  // System audio
  const systemSource = audioContext.createMediaStreamSource(
    new MediaStream(systemAudioTracks)
  );
  systemSource.connect(destination);

  // Mic audio
  const micSource = audioContext.createMediaStreamSource(
    new MediaStream(micAudioTracks)
  );
  micSource.connect(destination);

  // Add mixed audio track
  tracks.push(...destination.stream.getAudioTracks());
  
  return new MediaStream(tracks);
}

// Create composite stream with camera PIP
async function createCompositeStream(screenStream, cameraStream, micStream) {
  // Setup canvas dimensions
  canvas.width = screenVideo.videoWidth;
  canvas.height = screenVideo.videoHeight;

  // Camera bubble settings
  const bubbleSize = Math.min(canvas.width, canvas.height) * 0.15; // 15% of smaller dimension
  const bubbleX = 20;
  const bubbleY = canvas.height - bubbleSize - 20;

  // Draw loop
  function draw() {
    if (!isRecording) return;
    
    // Draw screen
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    
    // Draw camera bubble (circular)
    if (cameraStream && cameraVideo.readyState >= 2) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(bubbleX + bubbleSize/2, bubbleY + bubbleSize/2, bubbleSize/2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      // Draw camera video maintaining aspect ratio
      const camAspect = cameraVideo.videoWidth / cameraVideo.videoHeight;
      let drawW = bubbleSize;
      let drawH = bubbleSize;
      let drawX = bubbleX;
      let drawY = bubbleY;
      
      if (camAspect > 1) {
        drawH = bubbleSize;
        drawW = bubbleSize * camAspect;
        drawX = bubbleX - (drawW - bubbleSize) / 2;
      } else {
        drawW = bubbleSize;
        drawH = bubbleSize / camAspect;
        drawY = bubbleY - (drawH - bubbleSize) / 2;
      }
      
      ctx.drawImage(cameraVideo, drawX, drawY, drawW, drawH);
      ctx.restore();
      
      // Draw bubble border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bubbleX + bubbleSize/2, bubbleY + bubbleSize/2, bubbleSize/2, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    animationId = requestAnimationFrame(draw);
  }
  draw();

  // Create canvas stream
  compositeStream = canvas.captureStream(30);
  
  // Mix audio
  const finalStream = await createStreamWithMixedAudio(
    new MediaStream([...compositeStream.getVideoTracks(), ...screenStream.getAudioTracks()]),
    micStream
  );
  
  return finalStream;
}

// Stop recording
async function stopRecording() {
  console.log('Offscreen: stopRecording called, isRecording:', isRecording);
  
  if (!isRecording && !mediaRecorder) {
    console.log('Offscreen: Not recording, nothing to stop');
    return { success: true };
  }
  
  isRecording = false;
  isPaused = false;
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    console.log('Offscreen: Stopping MediaRecorder, state:', mediaRecorder.state);
    mediaRecorder.stop();
  } else {
    console.log('Offscreen: MediaRecorder already inactive or null');
    // Still try to cleanup and notify
    cleanup();
    chrome.runtime.sendMessage({ action: 'recordingStopped' });
  }
  
  return { success: true };
}

// Pause recording
function pauseRecording() {
  if (!isRecording || isPaused) return { success: false };
  
  isPaused = true;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
  }
  
  return { success: true };
}

// Resume recording
function resumeRecording() {
  if (!isRecording || !isPaused) return { success: false };
  
  isPaused = false;
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
  }
  
  return { success: true };
}

// Discard recording
function discardRecording() {
  recordedChunks = [];
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    isPaused = true; // Prevent download
    mediaRecorder.stop();
  }
  
  cleanup();
  return { success: true };
}

// Download recording
function downloadRecording() {
  if (recordedChunks.length === 0) return;
  
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `recording-${timestamp}.webm`;
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Cleanup streams and resources
function cleanup() {
  isRecording = false;
  
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  if (compositeStream) {
    compositeStream.getTracks().forEach(track => track.stop());
    compositeStream = null;
  }
  
  recordedChunks = [];
}
