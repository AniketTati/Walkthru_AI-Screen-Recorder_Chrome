// Screen Recorder Offscreen Document
// Based on Google's official MV3 sample

console.log('Offscreen: Script loaded');

let recorder = null;
let data = [];
let screenStream = null;
let cameraStream = null;
let micStream = null;

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen: Received message:', message);
  
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
      return true; // Keep channel open
      
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
        displaySurface: 'monitor',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: true
    });
  } catch (e) {
    console.error('Offscreen: getDisplayMedia failed:', e);
    throw e;
  }
  
  console.log('Offscreen: Got screen stream');
  console.log('Offscreen: Video tracks:', screenStream.getVideoTracks().length);
  console.log('Offscreen: Audio tracks:', screenStream.getAudioTracks().length);
  
  // Verify video track
  const videoTrack = screenStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error('No video track in screen stream');
  }
  console.log('Offscreen: Video track settings:', videoTrack.getSettings());
  console.log('Offscreen: Video track enabled:', videoTrack.enabled, 'readyState:', videoTrack.readyState);
  
  // Get camera if specified
  if (config.cameraId) {
    try {
      console.log('Offscreen: Requesting camera...');
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: config.cameraId } }
      });
      console.log('Offscreen: Got camera stream');
    } catch (e) {
      console.warn('Offscreen: Could not get camera:', e);
    }
  }
  
  // Get microphone if specified
  if (config.micId) {
    try {
      console.log('Offscreen: Requesting microphone with ID:', config.micId);
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: { exact: config.micId },
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      console.log('Offscreen: Got microphone stream, tracks:', micStream.getAudioTracks().length);
    } catch (e) {
      console.warn('Offscreen: Could not get exact microphone, trying any microphone:', e);
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Offscreen: Got fallback microphone stream');
      } catch (e2) {
        console.warn('Offscreen: Could not get any microphone:', e2);
      }
    }
  }
  
  // Combine video and audio tracks
  console.log('Offscreen: Combining tracks...');
  const tracks = [];
  
  // Add video track from screen (videoTrack already declared above)
  if (videoTrack) {
    tracks.push(videoTrack);
    console.log('Offscreen: Added video track');
  }
  
  // Collect all audio sources
  const audioSources = [];
  
  // System audio from screen capture
  const systemAudioTracks = screenStream.getAudioTracks();
  console.log('Offscreen: System audio tracks:', systemAudioTracks.length);
  if (systemAudioTracks.length > 0) {
    audioSources.push(...systemAudioTracks);
  }
  
  // Microphone audio
  if (micStream) {
    const micTracks = micStream.getAudioTracks();
    console.log('Offscreen: Microphone tracks:', micTracks.length);
    if (micTracks.length > 0) {
      audioSources.push(...micTracks);
    }
  }
  
  // Mix audio if we have multiple sources, otherwise just add the single source
  if (audioSources.length > 0) {
    if (audioSources.length === 1) {
      tracks.push(audioSources[0]);
      console.log('Offscreen: Added single audio track');
    } else {
      // Mix multiple audio tracks using AudioContext
      console.log('Offscreen: Mixing', audioSources.length, 'audio sources');
      try {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        
        audioSources.forEach((track, index) => {
          const source = audioContext.createMediaStreamSource(new MediaStream([track]));
          source.connect(destination);
          console.log('Offscreen: Connected audio source', index);
        });
        
        const mixedTrack = destination.stream.getAudioTracks()[0];
        if (mixedTrack) {
          tracks.push(mixedTrack);
          console.log('Offscreen: Added mixed audio track');
        }
      } catch (e) {
        console.error('Offscreen: Audio mixing failed, using first source:', e);
        tracks.push(audioSources[0]);
      }
    }
  } else {
    console.log('Offscreen: No audio sources available');
  }
  
  const combinedStream = new MediaStream(tracks);
  console.log('Offscreen: Combined stream has', combinedStream.getTracks().length, 'tracks');
  combinedStream.getTracks().forEach(t => {
    console.log('Offscreen: Final track:', t.kind, 'enabled:', t.enabled, 'readyState:', t.readyState);
  });
  
  // Start recorder
  console.log('Offscreen: Starting MediaRecorder...');
  recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
  
  recorder.ondataavailable = (event) => {
    console.log('Offscreen: Data available, size:', event.data.size);
    if (event.data.size > 0) {
      data.push(event.data);
    }
  };
  
  recorder.onstop = async () => {
    console.log('Offscreen: Recorder stopped, data chunks:', data.length, 'total size:', data.reduce((acc, d) => acc + d.size, 0));
    
    if (data.length > 0) {
      const blob = new Blob(data, { type: 'video/webm' });
      console.log('Offscreen: Created blob, size:', blob.size);
      
      if (blob.size > 0) {
        // Convert blob to base64 and send to background for download
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result;
          console.log('Offscreen: Sending blob to background for download, length:', base64data.length);
          
          chrome.runtime.sendMessage({
            action: 'saveRecording',
            data: base64data,
            filename: `recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webm`
          });
        };
        reader.readAsDataURL(blob);
      } else {
        console.log('Offscreen: Blob is empty, not saving');
      }
    } else {
      console.log('Offscreen: No data chunks collected');
    }
    
    cleanup();
    
    // Notify background
    chrome.runtime.sendMessage({ action: 'recordingStopped' });
  };
  
  // Collect data every 100ms for more responsive stopping
  recorder.start(100);
  console.log('Offscreen: Recording started, collecting data every 100ms');
  
  // Handle stream ending (user clicks stop sharing)
  screenStream.getVideoTracks()[0].onended = () => {
    console.log('Offscreen: Screen share ended by user');
    stopRecording();
  };
  
  // Notify background that we're recording
  chrome.runtime.sendMessage({ action: 'recordingStarted' });
}

function stopRecording() {
  console.log('Offscreen: stopRecording called, recorder state:', recorder?.state);
  
  if (recorder && recorder.state !== 'inactive') {
    // Request any pending data before stopping
    if (recorder.state === 'recording') {
      console.log('Offscreen: Requesting final data...');
      recorder.requestData();
    }
    
    // Small delay to ensure data is flushed, then stop
    setTimeout(() => {
      if (recorder && recorder.state !== 'inactive') {
        console.log('Offscreen: Stopping recorder...');
        recorder.stop();
      }
      
      // Stop all tracks after recorder stops
      setTimeout(() => {
        if (screenStream) {
          screenStream.getTracks().forEach(t => t.stop());
        }
      }, 100);
    }, 100);
  } else {
    // No active recorder, just cleanup
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }
    cleanup();
    chrome.runtime.sendMessage({ action: 'recordingStopped' });
  }
}

function cleanup() {
  console.log('Offscreen: Cleaning up...');
  
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
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
