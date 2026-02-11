// Screen Recorder Offscreen Document
// Handles screen capture, audio mixing, and recording

// Recording state
let recorder = null;
let data = [];
let screenStream = null;
let micStream = null;
let isStopping = false; // Guard against concurrent stop calls
let recordingMimeType = 'video/webm';
let currentFilenamePrefix = ''; // Set at startRecording for use in saveBlob

// Track blob URLs for large file downloads - revoke only when download completes
const pendingBlobUrls = new Map(); // downloadId -> blobUrl

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
      discardRecording();
      sendResponse({ success: true });
      return true;

    case 'resetForRerecord':
      // Reset recorder but keep streams alive for re-recording
      resetForRerecord();
      sendResponse({ success: true });
      return true;

    case 'captureScreenshot':
      captureScreenshot(message.config)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'downloadComplete':
      if (message.downloadId && pendingBlobUrls.has(message.downloadId)) {
        const blobUrl = pendingBlobUrls.get(message.downloadId);
        URL.revokeObjectURL(blobUrl);
        pendingBlobUrls.delete(message.downloadId);
      }
      sendResponse({ success: true });
      return true;
      
    default:
      return false;
  }
});

// Resolution presets: ideal dimensions and bitrate (bps)
const QUALITY_PRESETS = {
  '720p': { width: 1280, height: 720, videoBitsPerSecond: 4000000 },
  '1080p': { width: 1920, height: 1080, videoBitsPerSecond: 8000000 },
  '4k': { width: 3840, height: 2160, videoBitsPerSecond: 16000000 }
};

function getVideoConstraints(quality) {
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS['1080p'];
  return {
    width: { ideal: preset.width, max: preset.width },
    height: { ideal: preset.height, max: preset.height },
    frameRate: { ideal: 30, max: 60 }
  };
}

// Request permission (shows the screen picker dialog)
async function requestPermission(config) {
  // Clean up any existing streams first
  if (screenStream) {
    screenStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    screenStream = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    micStream = null;
  }
  
  const videoConstraints = getVideoConstraints(config?.quality);
  screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: videoConstraints,
    audio: true,
    preferCurrentTab: config?.source === 'tab'
  });
  
  const videoTrack = screenStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error('No video track in screen stream');
  }
  
  // Get microphone if configured
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
        console.warn('Microphone unavailable, continuing without mic');
      }
    }
  }
  
  // Handle user clicking browser's "Stop sharing" button
  videoTrack.onended = () => {
    console.log('Screen sharing stopped by user/browser');
    stopRecording();
  };
}

// Start recording (permission already granted, streams ready)
async function startRecording(config) {
  if (recorder?.state === 'recording') {
    throw new Error('Already recording');
  }
  
  // Verify screen stream is still active (might have expired between permission and countdown)
  if (!screenStream || screenStream.getVideoTracks().length === 0 ||
      screenStream.getVideoTracks()[0].readyState === 'ended') {
    throw new Error('Screen stream is no longer active. Please try again.');
  }
  
  data = [];
  isStopping = false;
  currentFilenamePrefix = (config?.filenamePrefix || '').replace(/[^a-zA-Z0-9_-]/g, '');
  await setupRecorder(config);
  
  // Notify background that recording has started
  try {
    chrome.runtime.sendMessage({ action: 'recordingStarted' });
  } catch (e) {
    console.warn('Failed to notify recordingStarted:', e);
  }
}

// Setup the MediaRecorder
async function setupRecorder(config) {
  const tracks = [];
  
  const videoTrack = screenStream.getVideoTracks()[0];
  if (videoTrack) {
    tracks.push(videoTrack);
  }
  
  // Collect audio sources
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
  
  // Mix audio if multiple sources
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
        console.warn('Audio mixing failed, using first source:', e);
        tracks.push(audioSources[0]);
      }
    }
  }
  
  const combinedStream = new MediaStream(tracks);
  
  // Find best supported codec
  recordingMimeType = 'video/webm';
  const codecs = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8'
  ];
  for (const codec of codecs) {
    if (MediaRecorder.isTypeSupported(codec)) {
      recordingMimeType = codec;
      break;
    }
  }
  
  const preset = QUALITY_PRESETS[config?.quality] || QUALITY_PRESETS['1080p'];
  recorder = new MediaRecorder(combinedStream, { 
    mimeType: recordingMimeType,
    videoBitsPerSecond: preset.videoBitsPerSecond,
    audioBitsPerSecond: 128000
  });
  
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      data.push(event.data);
    }
  };
  
  // CRITICAL: Handle MediaRecorder errors instead of swallowing them
  recorder.onerror = (event) => {
    const errorMsg = event.error?.message || 'Recording failed';
    console.error('MediaRecorder error:', event.error);
    cleanup();
    try {
      chrome.runtime.sendMessage({ action: 'recordingStopped', error: errorMsg });
    } catch (e) {}
  };
  
  recorder.onstop = async () => {
    console.log('recorder.onstop - data chunks:', data.length);
    
    // Save the recording
    try {
      if (data.length > 0) {
        const blob = new Blob(data, { type: recordingMimeType });
        console.log('Recording blob size:', blob.size);
        if (blob.size > 0) {
          await saveBlob(blob);
        }
      }
    } catch (e) {
      console.error('Failed to save recording:', e);
    }
    
    // CRITICAL: cleanup and notify AFTER save is complete
    // This ensures the save finishes before the offscreen document could be closed
    cleanup();
    
    try {
      chrome.runtime.sendMessage({ action: 'recordingStopped' });
    } catch (e) {
      console.warn('Failed to send recordingStopped:', e);
    }
  };
  
  // Use 1000ms timeslice - much more memory efficient than 100ms
  // 100ms creates 600 chunks/min vs 60 chunks/min with 1000ms
  recorder.start(1000);
  console.log('MediaRecorder started, mimeType:', recordingMimeType);
}

// Save the recorded blob
async function saveBlob(blob) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = currentFilenamePrefix
    ? `${currentFilenamePrefix}-recording-${timestamp}.webm`
    : `recording-${timestamp}.webm`;
  
  // For files that fit in a single message as base64 (~45MB source → ~60MB base64, under 64MB limit)
  const MAX_BASE64_SIZE = 45 * 1024 * 1024;
  
  if (blob.size < MAX_BASE64_SIZE) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      const response = await chrome.runtime.sendMessage({
        action: 'saveRecording',
        data: dataUrl,
        filename: filename
      });
      if (response?.success) {
        console.log('Recording saved via base64 download');
        return;
      }
      if (response?.error) {
        chrome.runtime.sendMessage({
          action: 'reportError',
          message: response.error,
          showBadge: true,
          notify: true
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Base64 save failed, trying blob URL:', e.message);
    }
  }
  
  // For large files or if base64 failed: use blob URL
  try {
    const blobUrl = URL.createObjectURL(blob);
    const response = await chrome.runtime.sendMessage({
      action: 'saveRecording',
      data: blobUrl,
      filename: filename
    });
    if (response?.success) {
      console.log('Recording saved via blob URL download');
      // Keep blob URL alive until download completes (background notifies via downloadComplete)
      if (response.downloadId) {
        pendingBlobUrls.set(response.downloadId, blobUrl);
      } else {
        // Fallback: revoke after 5 min if no downloadId
        setTimeout(() => URL.revokeObjectURL(blobUrl), 300000);
      }
      return;
    }
    if (response?.error) {
      chrome.runtime.sendMessage({
        action: 'reportError',
        message: response.error,
        showBadge: true,
        notify: true
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Blob URL save failed, trying direct download:', e.message);
    chrome.runtime.sendMessage({
      action: 'reportError',
      message: 'Failed to save recording. Try direct download.',
      showBadge: true,
      notify: true
    }).catch(() => {});
  }
  
  // Last resort: direct download from offscreen document
  console.log('Falling back to direct download from offscreen');
  downloadBlobDirectly(blob, filename);
}

// Convert blob to data URL
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader returned null'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

// Download blob directly using a download link (fallback for large files)
function downloadBlobDirectly(blob, filename) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      try { document.body.removeChild(a); } catch (e) {}
      URL.revokeObjectURL(url);
    }, 5000);
  } catch (e) {
    console.error('Direct download failed:', e);
  }
}

// Stop recording
// FIXED: Removed the dangerous setTimeout(150ms) hack that caused race conditions.
// MediaRecorder.stop() automatically fires one final 'dataavailable' event with
// remaining data, then fires 'stop'. No need for requestData() + delayed stop().
function stopRecording() {
  console.log('stopRecording called, recorder state:', recorder?.state, 'isStopping:', isStopping);
  
  // CRITICAL: Prevent concurrent stops (e.g., user clicks Stop AND browser's "Stop sharing" fires)
  if (isStopping) {
    console.log('Already stopping, ignoring duplicate call');
    return;
  }
  isStopping = true;
  
  if (recorder && recorder.state !== 'inactive') {
    try {
      // stop() fires final dataavailable then onstop - no setTimeout needed
      recorder.stop();
      console.log('recorder.stop() called successfully');
    } catch (e) {
      console.error('recorder.stop() failed:', e);
      cleanup();
      try { chrome.runtime.sendMessage({ action: 'recordingStopped' }); } catch (e2) {}
    }
  } else {
    console.log('No active recorder, sending recordingStopped');
    cleanup();
    try { chrome.runtime.sendMessage({ action: 'recordingStopped' }); } catch (e) {}
  }
}

// Discard recording (stop without saving, full cleanup including streams)
function discardRecording() {
  data = [];
  
  if (recorder && recorder.state !== 'inactive') {
    // Override onstop to skip saving and NOT send recordingStopped
    // (the caller handles its own cleanup)
    recorder.onstop = () => {
      console.log('Discard: recorder stopped, skipping save');
      cleanup();
    };
    try {
      recorder.stop();
    } catch (e) {
      cleanup();
    }
  } else {
    cleanup();
  }
}

// Reset for re-recording: stop recorder but KEEP streams alive
// FIXED: The old resetRecording flow called discardRecording which killed the streams,
// then tried to re-record with dead streams (always failed silently)
function resetForRerecord() {
  data = [];
  isStopping = false;
  
  if (recorder && recorder.state !== 'inactive') {
    // Override onstop to just clean up the recorder, NOT the streams
    recorder.onstop = () => {
      console.log('Reset: recorder stopped, keeping streams alive');
      recorder = null;
    };
    try {
      recorder.stop();
    } catch (e) {
      recorder = null;
    }
  } else {
    recorder = null;
  }
}

function cleanup() {
  if (screenStream) {
    try { screenStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    screenStream = null;
  }
  
  if (micStream) {
    try { micStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    micStream = null;
  }
  
  recorder = null;
  data = [];
  isStopping = false;
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
    const prefix = (config?.filenamePrefix || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = prefix ? `${prefix}-screenshot-${timestamp}.png` : `screenshot-${timestamp}.png`;
    
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
