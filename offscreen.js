// Screen Recorder Offscreen Document
// Handles screen capture, audio mixing, and recording only
// Camera bubble is handled by content script

console.log('Offscreen document loaded');

// Recording state
let recorder = null;
let data = [];
let screenStream = null;
let micStream = null;

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen: Received message:', message.action);
  
  if (message.target !== 'offscreen') {
    return false;
  }
  
  switch (message.action) {
    case 'startRecording':
      startRecording(message.config)
        .then(() => {
          console.log('Offscreen: Recording started successfully');
          sendResponse({ success: true });
        })
        .catch(err => {
          console.error('Offscreen: Failed to start recording:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
      
    case 'stopRecording':
      console.log('Offscreen: Stopping recording...');
      stopRecording();
      sendResponse({ success: true });
      return true;
      
    case 'pauseRecording':
      if (recorder && recorder.state === 'recording') {
        recorder.pause();
        console.log('Offscreen: Recording paused');
      }
      sendResponse({ success: true });
      return true;
      
    case 'resumeRecording':
      if (recorder && recorder.state === 'paused') {
        recorder.resume();
        console.log('Offscreen: Recording resumed');
      }
      sendResponse({ success: true });
      return true;
      
    case 'discardRecording':
      console.log('Offscreen: Discarding recording');
      data = [];
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      cleanup();
      sendResponse({ success: true });
      return true;
      
    default:
      console.log('Offscreen: Unknown action:', message.action);
      return false;
  }
});

async function startRecording(config) {
  console.log('Offscreen: Starting recording with config:', config);
  
  if (recorder?.state === 'recording') {
    throw new Error('Already recording');
  }
  
  data = [];
  
  // Get screen capture
  console.log('Offscreen: Requesting display media...');
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
    console.error('Offscreen: getDisplayMedia failed:', e);
    throw e;
  }
  
  console.log('Offscreen: Got screen stream');
  
  // Verify video track
  const videoTrack = screenStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error('No video track in screen stream');
  }
  
  const settings = videoTrack.getSettings();
  console.log('Offscreen: Video settings:', settings);
  
  // Get microphone if specified
  if (config.micId) {
    try {
      console.log('Offscreen: Requesting microphone...');
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: { exact: config.micId },
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      console.log('Offscreen: Got microphone stream');
    } catch (e) {
      console.warn('Offscreen: Could not get exact microphone, trying any:', e);
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e2) {
        console.warn('Offscreen: Could not get any microphone:', e2);
      }
    }
  }
  
  // Setup recorder with screen stream + mixed audio
  await setupRecorder();
  
  // Handle screen share ending
  videoTrack.onended = () => {
    console.log('Offscreen: Screen share ended by user');
    stopRecording();
  };
  
  // Notify background that we're recording
  chrome.runtime.sendMessage({ action: 'recordingStarted' });
}

// Setup the MediaRecorder
async function setupRecorder() {
  console.log('Offscreen: Setting up recorder...');
  
  // Combine video and audio tracks
  const tracks = [];
  
  // Add screen video track
  const videoTrack = screenStream.getVideoTracks()[0];
  if (videoTrack) {
    tracks.push(videoTrack);
    console.log('Offscreen: Added screen video track');
  }
  
  // Collect all audio sources
  const audioSources = [];
  
  // System audio from screen capture
  if (screenStream) {
    const systemAudioTracks = screenStream.getAudioTracks();
    if (systemAudioTracks.length > 0) {
      audioSources.push(...systemAudioTracks);
      console.log('Offscreen: Added', systemAudioTracks.length, 'system audio tracks');
    }
  }
  
  // Microphone audio
  if (micStream) {
    const micTracks = micStream.getAudioTracks();
    if (micTracks.length > 0) {
      audioSources.push(...micTracks);
      console.log('Offscreen: Added', micTracks.length, 'mic audio tracks');
    }
  }
  
  // Mix audio if we have multiple sources
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
          console.log('Offscreen: Added mixed audio track');
        }
      } catch (e) {
        console.error('Offscreen: Audio mixing failed:', e);
        tracks.push(audioSources[0]);
      }
    }
  }
  
  const combinedStream = new MediaStream(tracks);
  console.log('Offscreen: Combined stream has', combinedStream.getTracks().length, 'tracks');
  
  // Create recorder
  recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
  
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      data.push(event.data);
      console.log('Offscreen: Data chunk received, size:', event.data.size);
    }
  };
  
  recorder.onstop = async () => {
    console.log('Offscreen: Recorder stopped, chunks:', data.length);
    
    if (data.length > 0) {
      const totalSize = data.reduce((sum, chunk) => sum + chunk.size, 0);
      console.log('Offscreen: Total data size:', totalSize);
      
      const blob = new Blob(data, { type: 'video/webm' });
      console.log('Offscreen: Created blob, size:', blob.size);
      
      if (blob.size > 0) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result;
          console.log('Offscreen: Sending blob to background for download');
          
          chrome.runtime.sendMessage({
            action: 'saveRecording',
            data: base64data,
            filename: `recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webm`
          });
        };
        reader.readAsDataURL(blob);
      }
    } else {
      console.log('Offscreen: No data chunks to save');
    }
    
    cleanup();
    chrome.runtime.sendMessage({ action: 'recordingStopped' });
  };
  
  // Collect data frequently
  recorder.start(100);
  console.log('Offscreen: Recording started');
}

function stopRecording() {
  console.log('Offscreen: stopRecording called, recorder state:', recorder?.state);
  
  if (recorder && recorder.state !== 'inactive') {
    if (recorder.state === 'recording') {
      console.log('Offscreen: Requesting final data...');
      recorder.requestData();
    }
    
    setTimeout(() => {
      if (recorder && recorder.state !== 'inactive') {
        console.log('Offscreen: Stopping recorder...');
        recorder.stop();
      }
    }, 100);
  } else {
    console.log('Offscreen: No active recorder, cleaning up');
    cleanup();
    chrome.runtime.sendMessage({ action: 'recordingStopped' });
  }
}

function cleanup() {
  console.log('Offscreen: Cleaning up...');
  
  // Stop all streams
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
  
  console.log('Offscreen: Cleanup complete');
}

console.log('Offscreen: Script initialization complete');
