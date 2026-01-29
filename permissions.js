const requestBtn = document.getElementById('requestBtn');
const statusDiv = document.getElementById('status');
const preview = document.getElementById('preview');
const description = document.getElementById('description');
const troubleshooting = document.getElementById('troubleshooting');

let stream = null;

requestBtn.addEventListener('click', async () => {
  requestBtn.disabled = true;
  requestBtn.textContent = 'Requesting...';
  statusDiv.classList.add('hidden');
  
  try {
    // Request camera access
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });
    
    // Success!
    preview.srcObject = stream;
    preview.classList.remove('hidden');
    
    requestBtn.textContent = '✓ Permission Granted!';
    requestBtn.classList.add('success');
    requestBtn.disabled = false;
    
    statusDiv.textContent = '✅ Success! Camera permission has been granted. You can now close this tab and use the camera feature in the extension.';
    statusDiv.className = 'status success';
    statusDiv.classList.remove('hidden');
    
    description.textContent = 'Camera access granted! You can now use the camera recording feature.';
    
  } catch (error) {
    console.error('Camera permission error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error constraint:', error.constraint);
    
    requestBtn.textContent = '✗ Permission Denied';
    requestBtn.classList.add('error');
    requestBtn.disabled = false;
    
    let errorMessage = '';
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      errorMessage = '❌ Camera permission was denied. Please click the button again and select "Allow" when prompted. If you don\'t see a prompt, check your browser settings.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      errorMessage = '❌ No camera found. Please connect a camera to your computer and try again.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      errorMessage = '❌ Camera is already in use by another application. Close other apps (Zoom, Skype, etc.) and try again.';
    } else if (error.name === 'OverconstrainedError') {
      errorMessage = '❌ Camera does not support the requested settings. Trying with default settings...';
      // Try again with basic constraints
      setTimeout(async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          preview.srcObject = stream;
          preview.classList.remove('hidden');
          requestBtn.textContent = '✓ Permission Granted!';
          requestBtn.classList.remove('error');
          requestBtn.classList.add('success');
          statusDiv.textContent = '✅ Success! Camera permission granted with default settings.';
          statusDiv.className = 'status success';
          statusDiv.classList.remove('hidden');
        } catch (retryError) {
          console.error('Retry error:', retryError);
          statusDiv.textContent = '❌ Failed even with default settings: ' + retryError.message;
          statusDiv.className = 'status error';
          statusDiv.classList.remove('hidden');
          troubleshooting.classList.remove('hidden');
        }
      }, 1000);
      return;
    } else {
      errorMessage = '❌ Error: ' + error.name + ' - ' + (error.message || 'Unknown error');
    }
    
    statusDiv.textContent = errorMessage;
    statusDiv.className = 'status error';
    statusDiv.classList.remove('hidden');
    troubleshooting.classList.remove('hidden');
    
    // Reset button after 3 seconds
    setTimeout(() => {
      requestBtn.textContent = 'Request Camera Permission';
      requestBtn.classList.remove('error');
    }, 3000);
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
});
