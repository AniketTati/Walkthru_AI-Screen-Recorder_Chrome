// Screen Recorder Offscreen Document
// Handles screen capture, audio mixing, and recording

// Recording state
let recorder = null;
let data = [];
let screenStream = null;
let micStream = null;

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }
  
  switch (message.action) {
    case 'requestPermission':
      requestPermission(message.config)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    case 'startRecording':
      startRecording(message.config)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    case 'stopRecording':
      stopRecording();
      sendResponse({ success: true });
      return true;
      
    case 'pauseRecording':
      if (recorder && recorder.state === 'recording') {
        recorder.pause();
      }
      sendResponse({ success: true });
      return true;
      
    case 'resumeRecording':
      if (recorder && recorder.state === 'paused') {
        recorder.resume();
      }
      sendResponse({ success: true });
      return true;
      
    case 'discardRecording':
      data = [];
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      cleanup();
      sendResponse({ success: true });
      return true;

    case 'captureScreenshot':
      captureScreenshot(message.config)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    default:
      return false;
  }
});

// Request permission (shows the screen picker dialog)
async function requestPermission(config) {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: true,
      preferCurrentTab: false
    });
  } catch (e) {
    throw e;
  }
  
  const videoTrack = screenStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error('No video track in screen stream');
  }
  
  if (config.micId) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: { exact: config.micId },
          echoCancellation: true,
          noiseSuppression: true
        }
      });
    } catch (e) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e2) {
        // Continue without microphone
      }
    }
  }
  
  videoTrack.onended = () => {
    stopRecording();
  };
}

// Start recording (permission already granted, streams ready)
async function startRecording(config) {
  if (recorder?.state === 'recording') {
    throw new Error('Already recording');
  }
  
  if (!screenStream) {
    throw new Error('No screen stream - permission not granted');
  }
  
  data = [];
  await setupRecorder();
  chrome.runtime.sendMessage({ action: 'recordingStarted' });
}

// Setup the MediaRecorder
async function setupRecorder() {
  const tracks = [];
  
  const videoTrack = screenStream.getVideoTracks()[0];
  if (videoTrack) {
    tracks.push(videoTrack);
  }
  
  const audioSources = [];
  
  if (screenStream) {
    const systemAudioTracks = screenStream.getAudioTracks();
    if (systemAudioTracks.length > 0) {
      audioSources.push(...systemAudioTracks);
    }
  }
  
  if (micStream) {
    const micTracks = micStream.getAudioTracks();
    if (micTracks.length > 0) {
      audioSources.push(...micTracks);
    }
  }
  
  if (audioSources.length > 0) {
    if (audioSources.length === 1) {
      tracks.push(audioSources[0]);
    } else {
      try {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        
        audioSources.forEach((track) => {
          const source = audioContext.createMediaStreamSource(new MediaStream([track]));
          source.connect(destination);
        });
        
        const mixedTrack = destination.stream.getAudioTracks()[0];
        if (mixedTrack) {
          tracks.push(mixedTrack);
        }
      } catch (e) {
        tracks.push(audioSources[0]);
      }
    }
  }
  
  const combinedStream = new MediaStream(tracks);
  
  let mimeType = 'video/webm';
  
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
    mimeType = 'video/webm;codecs=vp9,opus';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    mimeType = 'video/webm;codecs=vp9';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
    mimeType = 'video/webm;codecs=vp8,opus';
  }
  
  recorder = new MediaRecorder(combinedStream, { 
    mimeType: mimeType,
    videoBitsPerSecond: 8000000,
    audioBitsPerSecond: 128000
  });
  
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      data.push(event.data);
    }
  };
  
  recorder.onstop = async () => {
    if (data.length > 0) {
      const blob = new Blob(data, { type: 'video/webm' });
      
      if (blob.size > 0) {
        const filename = `recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webm`;
        
        // For large files, use blob URL approach (avoids 64MB message limit)
        // For small files (< 40MB), base64 still works and is simpler
        const MAX_BASE64_SIZE = 40 * 1024 * 1024; // 40MB (safe margin for 64MiB limit after base64 encoding)
        
        if (blob.size < MAX_BASE64_SIZE) {
          // Small file: use base64 approach
          await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
              try {
                await chrome.runtime.sendMessage({
                  action: 'saveRecording',
                  data: reader.result,
                  filename: filename
                });
              } catch (e) {
                // If base64 fails, fall back to download link
                downloadBlobDirectly(blob, filename);
              }
              resolve();
            };
            reader.onerror = () => {
              downloadBlobDirectly(blob, filename);
              resolve();
            };
            reader.readAsDataURL(blob);
          });
        } else {
          // Large file: trigger download directly using a link
          downloadBlobDirectly(blob, filename);
        }
      }
    }
    
    cleanup();
    chrome.runtime.sendMessage({ action: 'recordingStopped' });
  };
  
  recorder.start(100);
}

// Download blob directly using a download link (for large files that exceed message size limits)
function downloadBlobDirectly(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  // Clean up after a delay to ensure download starts
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

function stopRecording() {
  console.log('stopRecording called, recorder state:', recorder?.state);
  
  if (recorder && recorder.state !== 'inactive') {
    // Request final data chunk if recording
    if (recorder.state === 'recording') {
      try {
        recorder.requestData();
      } catch (e) {
        console.error('requestData failed:', e);
      }
    }
    
    // Stop the recorder after a short delay to allow data to be collected
    setTimeout(() => {
      try {
        if (recorder && recorder.state !== 'inactive') {
          console.log('Calling recorder.stop()');
          recorder.stop();
        }
      } catch (e) {
        console.error('recorder.stop() failed:', e);
        cleanup();
        chrome.runtime.sendMessage({ action: 'recordingStopped' });
      }
    }, 150);
  } else {
    console.log('No active recorder, cleaning up');
    cleanup();
    chrome.runtime.sendMessage({ action: 'recordingStopped' });
  }
}

function cleanup() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  
  recorder = null;
  data = [];
}

// Capture screenshot using getDisplayMedia
async function captureScreenshot(config) {
  let stream = null;
  
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 3840 },
        height: { ideal: 2160 }
      },
      audio: false
    });
    
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error('No video track available');
    }
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve).catch(reject);
      };
      video.onerror = reject;
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    
    const dataUrl = canvas.toDataURL('image/png');
    
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `screenshot-${timestamp}.png`;
    
    chrome.runtime.sendMessage({
      action: 'saveRecording',
      data: dataUrl,
      filename: filename
    });
    
    return { success: true };
    
  } catch (e) {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    throw e;
  }
}
