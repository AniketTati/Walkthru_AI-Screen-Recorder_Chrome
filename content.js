// Screen Recorder Content Script
// Handles floating controls, camera bubble, and countdown

(function() {
  console.log('Content Script: Initializing...');
  
  // Prevent multiple injections
  if (window.__screenRecorderInjected) {
    console.log('Content Script: Already injected, skipping');
    return;
  }
  window.__screenRecorderInjected = true;
  console.log('Content Script: First injection, proceeding');

  // State
  let config = null;
  let isPaused = false;
  let cameraStream = null;
  let cameraBubbleVisible = true;
  let startTime = null;
  let timerInterval = null;
  let pausedDuration = 0;
  let pauseStartTime = null;

  // DOM Elements
  let countdownOverlay = null;
  let controlBar = null;
  let cameraBubble = null;

  // Icons
  const icons = {
    stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    resume: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
    delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
  };

  // Message handler
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content Script: Received message:', message.action, message);
    
    try {
      switch (message.action) {
        case 'ping':
          console.log('Content Script: Responding to ping');
          sendResponse({ success: true });
          break;
        case 'showCountdown':
          console.log('Content Script: Showing countdown');
          config = message.config;
          showCountdown();
          sendResponse({ success: true });
          break;
        case 'showFloatingControls':
          console.log('Content Script: Showing floating controls');
          config = message.config;
          showFloatingControls();
          sendResponse({ success: true });
          break;
        case 'hideFloatingControls':
          console.log('Content Script: Hiding floating controls');
          hideFloatingControls();
          sendResponse({ success: true });
          break;
        case 'updateControls':
          console.log('Content Script: Updating controls, isPaused:', message.isPaused);
          updateControls(message.isPaused);
          sendResponse({ success: true });
          break;
        case 'toggleCameraBubble':
          console.log('Content Script: Toggling camera bubble');
          toggleCameraBubble();
          sendResponse({ success: true });
          break;
        default:
          console.log('Content Script: Unknown action:', message.action);
      }
    } catch (e) {
      console.error('Content Script: Error handling message:', e);
      sendResponse({ success: false, error: e.message });
    }
    
    return true;
  });
  
  console.log('Content Script: Message listener registered');

  // Show countdown overlay
  function showCountdown() {
    console.log('Content Script: showCountdown() called');
    removeCountdown();
    
    countdownOverlay = document.createElement('div');
    countdownOverlay.className = 'sr-countdown-overlay';
    countdownOverlay.id = 'sr-countdown-overlay';
    // Inline styles as fallback
    countdownOverlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.85) !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
    `;
    console.log('Content Script: Created countdown overlay element');
    
    const numberEl = document.createElement('div');
    numberEl.className = 'sr-countdown-number';
    numberEl.style.cssText = `
      font-size: 200px !important;
      font-weight: 700 !important;
      color: white !important;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sr-countdown-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      margin-top: 40px !important;
      padding: 12px 32px !important;
      background: rgba(255, 255, 255, 0.2) !important;
      color: white !important;
      border: 2px solid rgba(255, 255, 255, 0.5) !important;
      border-radius: 8px !important;
      font-size: 16px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
    `;
    cancelBtn.onclick = () => {
      removeCountdown();
      chrome.runtime.sendMessage({ action: 'countdownCancelled' });
    };
    
    countdownOverlay.appendChild(numberEl);
    countdownOverlay.appendChild(cancelBtn);
    document.body.appendChild(countdownOverlay);
    
    // Countdown animation
    let count = 3;
    
    function showNumber() {
      if (count > 0) {
        numberEl.textContent = count;
        numberEl.style.animation = 'none';
        void numberEl.offsetWidth; // Trigger reflow
        numberEl.style.animation = 'sr-countdown-pulse 1s ease-out';
        count--;
        setTimeout(showNumber, 1000);
      } else {
        removeCountdown();
        chrome.runtime.sendMessage({ action: 'countdownComplete' });
      }
    }
    
    showNumber();
  }

  // Remove countdown overlay
  function removeCountdown() {
    if (countdownOverlay) {
      countdownOverlay.remove();
      countdownOverlay = null;
    }
  }

  // Show floating controls
  async function showFloatingControls() {
    console.log('Content Script: showFloatingControls() called');
    removeFloatingControls();
    
    document.body.classList.add('sr-recording');
    startTime = Date.now();
    isPaused = false;
    pausedDuration = 0;
    
    // Create control bar
    console.log('Content Script: Creating control bar...');
    controlBar = document.createElement('div');
    controlBar.className = 'sr-control-bar';
    controlBar.id = 'sr-control-bar';
    // Inline styles as fallback
    controlBar.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 8px 16px !important;
      background: #1a1a1a !important;
      border-radius: 50px !important;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5) !important;
      z-index: 2147483646 !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
      cursor: grab !important;
      user-select: none !important;
    `;
    controlBar.innerHTML = getControlBarHTML(false);
    document.body.appendChild(controlBar);
    console.log('Content Script: Control bar added to DOM');
    
    // Setup control bar events
    setupControlBarEvents();
    setupDraggable(controlBar);
    
    // Create camera bubble if camera enabled
    if (config && config.cameraId) {
      await createCameraBubble();
    }
    
    // Start timer
    startTimer();
  }

  // Button styles
  const btnStyle = `
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 10px 16px !important;
    background: transparent !important;
    color: white !important;
    border: none !important;
    border-radius: 25px !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
  `;
  
  const stopBtnStyle = btnStyle + `background: #ff4757 !important;`;
  const resumeBtnStyle = btnStyle + `background: #28a745 !important;`;
  const deleteBtnStyle = btnStyle + `color: #ff4757 !important;`;
  const dividerStyle = `width: 1px !important; height: 24px !important; background: rgba(255,255,255,0.2) !important; margin: 0 4px !important;`;
  const timerStyle = `padding: 0 16px !important; font-size: 18px !important; font-weight: 600 !important; color: white !important; min-width: 60px !important; text-align: center !important;`;

  // Get control bar HTML
  function getControlBarHTML(paused) {
    const hasCamera = config && config.cameraId;
    
    if (paused) {
      return `
        <button class="sr-control-btn reset" style="${btnStyle}" data-action="reset">
          ${icons.reset}
          <span>Reset</span>
        </button>
        <div class="sr-divider" style="${dividerStyle}"></div>
        <button class="sr-control-btn delete" style="${deleteBtnStyle}" data-action="delete">
          ${icons.delete}
          <span>Delete</span>
        </button>
        <div class="sr-divider" style="${dividerStyle}"></div>
        <button class="sr-control-btn resume" style="${resumeBtnStyle}" data-action="resume">
          ${icons.resume}
          <span>Resume</span>
        </button>
        ${hasCamera ? `
          <div class="sr-divider" style="${dividerStyle}"></div>
          <button class="sr-control-btn camera ${cameraBubbleVisible ? '' : 'off'}" style="${btnStyle}" data-action="toggleCamera">
            ${icons.camera}
          </button>
        ` : ''}
        <div class="sr-divider" style="${dividerStyle}"></div>
        <div class="sr-timer" id="sr-timer" style="${timerStyle}">00:00</div>
      `;
    } else {
      return `
        <button class="sr-control-btn stop" style="${stopBtnStyle}" data-action="stop">
          ${icons.stop}
          <span>Stop</span>
        </button>
        <div class="sr-divider" style="${dividerStyle}"></div>
        <button class="sr-control-btn pause" style="${btnStyle}" data-action="pause">
          ${icons.pause}
          <span>Pause</span>
        </button>
        ${hasCamera ? `
          <div class="sr-divider" style="${dividerStyle}"></div>
          <button class="sr-control-btn camera ${cameraBubbleVisible ? '' : 'off'}" style="${btnStyle}" data-action="toggleCamera">
            ${icons.camera}
          </button>
        ` : ''}
        <div class="sr-divider" style="${dividerStyle}"></div>
        <div class="sr-timer" id="sr-timer" style="${timerStyle}">00:00</div>
      `;
    }
  }

  // Setup control bar events
  function setupControlBarEvents() {
    controlBar.querySelectorAll('.sr-control-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleControlAction(action);
      });
    });
  }

  // Handle control actions
  function handleControlAction(action) {
    console.log('Content: Control action:', action);
    
    switch (action) {
      case 'stop':
        console.log('Content: Sending stopRecording message');
        chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
          console.log('Content: stopRecording response:', response);
        });
        break;
      case 'pause':
        chrome.runtime.sendMessage({ action: 'pauseRecording' }, (response) => {
          console.log('Content: pauseRecording response:', response);
        });
        break;
      case 'resume':
        chrome.runtime.sendMessage({ action: 'resumeRecording' }, (response) => {
          console.log('Content: resumeRecording response:', response);
        });
        break;
      case 'reset':
        chrome.runtime.sendMessage({ action: 'resetRecording' }, (response) => {
          console.log('Content: resetRecording response:', response);
        });
        break;
      case 'delete':
        chrome.runtime.sendMessage({ action: 'deleteRecording' }, (response) => {
          console.log('Content: deleteRecording response:', response);
        });
        break;
      case 'toggleCamera':
        toggleCameraBubble();
        break;
    }
  }

  // Update controls (pause/resume state)
  function updateControls(paused) {
    isPaused = paused;
    
    if (paused) {
      pauseStartTime = Date.now();
    } else if (pauseStartTime) {
      pausedDuration += Date.now() - pauseStartTime;
      pauseStartTime = null;
    }
    
    if (controlBar) {
      const currentPosition = {
        left: controlBar.style.left,
        bottom: controlBar.style.bottom,
        transform: controlBar.style.transform
      };
      
      controlBar.innerHTML = getControlBarHTML(paused);
      setupControlBarEvents();
      
      // Restore position
      if (currentPosition.left) {
        controlBar.style.left = currentPosition.left;
        controlBar.style.bottom = currentPosition.bottom;
        controlBar.style.transform = currentPosition.transform;
      }
      
      // Update timer display
      updateTimerDisplay();
    }
  }

  // Start timer
  function startTimer() {
    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
  }

  // Update timer display
  function updateTimerDisplay() {
    const timerEl = document.getElementById('sr-timer');
    if (!timerEl || !startTime) return;
    
    let elapsed = Date.now() - startTime - pausedDuration;
    if (pauseStartTime) {
      elapsed -= (Date.now() - pauseStartTime);
    }
    
    const seconds = Math.floor(elapsed / 1000);
    const min = String(Math.floor(seconds / 60)).padStart(2, '0');
    const sec = String(seconds % 60).padStart(2, '0');
    timerEl.textContent = `${min}:${sec}`;
  }

  // Create camera bubble - shows live video if allowed, static placeholder if blocked
  async function createCameraBubble() {
    if (!config || !config.cameraId) {
      console.log('Content: No camera ID provided, skipping camera bubble');
      return;
    }
    
    console.log('Content: Creating camera bubble with device:', config.cameraId);
    
    // Small delay to ensure popup has released the camera
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Try with exact device ID first, fall back to any camera
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: config.cameraId } }
        });
      } catch (exactError) {
        console.warn('Content: Exact camera not available, trying any camera:', exactError);
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }
      
      console.log('Content: Camera stream obtained - showing live bubble');
      
      // Create the draggable bubble with live video
      createBubbleElement();
      
    } catch (e) {
      console.log('Content: Camera access blocked by site, showing static placeholder:', e.message);
      
      // Show a static placeholder bubble (like Loom does when camera is blocked)
      createPlaceholderBubble();
      cameraBubbleVisible = true;
    }
  }
  
  // Create a static placeholder bubble when camera is blocked by site (like Loom)
  function createPlaceholderBubble() {
    cameraBubble = document.createElement('div');
    cameraBubble.className = 'sr-camera-bubble sr-placeholder';
    cameraBubble.id = 'sr-camera-bubble';
    
    cameraBubble.style.cssText = `
      position: fixed !important;
      bottom: 100px !important;
      left: 24px !important;
      width: 120px !important;
      height: 120px !important;
      border-radius: 50% !important;
      overflow: hidden !important;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5) !important;
      border: 4px solid white !important;
      z-index: 2147483645 !important;
      cursor: grab !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    
    // Show camera icon as static placeholder (this site blocks camera access)
    cameraBubble.innerHTML = `
      <div style="text-align: center; color: white;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
      </div>
    `;
    
    document.body.appendChild(cameraBubble);
    console.log('Content: Static placeholder bubble added (camera blocked by this site)');
    
    setupDraggable(cameraBubble);
  }
  
  // Create the actual bubble DOM element with live video
  function createBubbleElement() {
    cameraBubble = document.createElement('div');
    cameraBubble.className = 'sr-camera-bubble';
    cameraBubble.id = 'sr-camera-bubble';
    
    cameraBubble.style.cssText = `
      position: fixed !important;
      bottom: 100px !important;
      left: 24px !important;
      width: 120px !important;
      height: 120px !important;
      border-radius: 50% !important;
      overflow: hidden !important;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5) !important;
      border: 4px solid white !important;
      z-index: 2147483645 !important;
      cursor: grab !important;
      background: #1a1a1a !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    
    const video = document.createElement('video');
    video.srcObject = cameraStream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = `
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      transform: scaleX(-1) !important;
      display: block !important;
    `;
    
    // Ensure video plays
    video.onloadedmetadata = () => {
      console.log('Content: Camera video metadata loaded');
      video.play().catch(e => console.error('Content: Video play error:', e));
    };
    
    cameraBubble.appendChild(video);
    document.body.appendChild(cameraBubble);
    
    console.log('Content: Camera bubble added to DOM');
    
    setupDraggable(cameraBubble);
    
    // Click to toggle (only if not dragging)
    let clickTimeout;
    cameraBubble.addEventListener('mousedown', () => {
      clickTimeout = setTimeout(() => {
        clickTimeout = null;
      }, 200);
    });
    
    cameraBubble.addEventListener('mouseup', (e) => {
      if (clickTimeout && !cameraBubble.classList.contains('dragging')) {
        clearTimeout(clickTimeout);
        toggleCameraBubble();
      }
    });
  }

  // Toggle camera bubble visibility
  function toggleCameraBubble() {
    cameraBubbleVisible = !cameraBubbleVisible;
    
    if (cameraBubble) {
      if (cameraBubbleVisible) {
        cameraBubble.style.setProperty('display', 'flex', 'important');
      } else {
        cameraBubble.style.setProperty('display', 'none', 'important');
      }
    }
    
    // Update button state
    const cameraBtn = controlBar?.querySelector('.sr-control-btn.camera');
    if (cameraBtn) {
      cameraBtn.classList.toggle('off', !cameraBubbleVisible);
    }
  }

  // Setup draggable element
  function setupDraggable(element) {
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, initialX, initialY;
    
    element.addEventListener('mousedown', (e) => {
      if (e.target.closest('.sr-control-btn')) return;
      
      isDragging = true;
      hasMoved = false;
      element.classList.add('dragging');
      
      const rect = element.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialX = rect.left;
      initialY = rect.top;
      
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasMoved = true;
      }
      
      const newX = initialX + deltaX;
      const newY = initialY + deltaY;
      
      // Keep within viewport
      const maxX = window.innerWidth - element.offsetWidth;
      const maxY = window.innerHeight - element.offsetHeight;
      
      // Use setProperty with 'important' to override inline !important styles
      element.style.setProperty('left', Math.max(0, Math.min(newX, maxX)) + 'px', 'important');
      element.style.setProperty('top', Math.max(0, Math.min(newY, maxY)) + 'px', 'important');
      element.style.setProperty('bottom', 'auto', 'important');
      element.style.setProperty('right', 'auto', 'important');
      element.style.setProperty('transform', 'none', 'important');
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        setTimeout(() => {
          element.classList.remove('dragging');
        }, 100);
      }
    });
  }

  // Hide floating controls
  function hideFloatingControls() {
    document.body.classList.remove('sr-recording');
    
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    
    if (controlBar) {
      controlBar.remove();
      controlBar = null;
    }
    
    if (cameraBubble) {
      cameraBubble.remove();
      cameraBubble = null;
    }
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    
    startTime = null;
    pausedDuration = 0;
    pauseStartTime = null;
    cameraBubbleVisible = true;
  }

  // Remove floating controls
  function removeFloatingControls() {
    hideFloatingControls();
    removeCountdown();
  }

})();
