// Teleprompter window - runs in separate window, not recorded

const textEl = document.getElementById('text');
let scriptData = null;
let rafId = null;

// Manual scroll: pause auto-scroll briefly, then resume from new position
let manualScrollActive = false;
let manualScrollTimer = null;
let scrollOffset = 0;
let needOffsetRecalc = false;
const MANUAL_PAUSE_MS = 3000;

async function loadScript() {
  const { teleprompterActiveScript } = await chrome.storage.local.get('teleprompterActiveScript');
  scriptData = teleprompterActiveScript;
  if (scriptData?.content) {
    textEl.textContent = scriptData.content;
  } else {
    textEl.textContent = 'No script loaded.';
  }
}

function getState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getTeleprompterState' }, (res) => {
      resolve(res ?? { elapsedMs: 0, isPaused: false });
    });
  });
}

function getTargetScrollTop(elapsed, maxScroll) {
  if (maxScroll <= 0 || !scriptData?.content) return 0;
  const len = scriptData.content.length;
  const timelinePoints = (scriptData.timelinePoints || []).sort((a, b) => a.showAt - b.showAt);
  const speed = scriptData.defaultSpeed || 120;
  const pxPerSec = Math.max(20, Math.min(80, speed * 0.4));
  
  if (timelinePoints.length === 0) {
    return Math.min(maxScroll, pxPerSec * elapsed);
  }
  
  const pts = timelinePoints;
  const toScroll = (pos) => Math.min(maxScroll, (pos / len) * maxScroll);
  
  // Segment 0: scroll from 0 at speed, cap at first point until elapsed >= showAt[0]
  if (elapsed < pts[0].showAt) {
    const natural = pxPerSec * elapsed;
    const cap = toScroll(pts[0].position);
    return Math.min(natural, cap);
  }
  
  // Segment i: interpolate from position[i] to position[i+1] over [showAt[i], showAt[i+1]]
  for (let i = 0; i < pts.length - 1; i++) {
    if (elapsed >= pts[i].showAt && elapsed < pts[i + 1].showAt) {
      const segStart = pts[i].showAt;
      const segEnd = pts[i + 1].showAt;
      const posStart = toScroll(pts[i].position);
      const posEnd = toScroll(pts[i + 1].position);
      const progress = (segEnd - segStart) > 0 ? (elapsed - segStart) / (segEnd - segStart) : 1;
      return posStart + (posEnd - posStart) * Math.min(1, progress);
    }
  }
  
  // After last point: scroll from position[last] to end at speed
  const last = pts[pts.length - 1];
  const lastScroll = toScroll(last.position);
  return Math.min(maxScroll, lastScroll + pxPerSec * (elapsed - last.showAt));
}

function scrollLoop() {
  (async () => {
    if (!scriptData?.content) return;
    
    const { elapsedMs, isPaused } = await getState();
    if (isPaused || manualScrollActive) {
      rafId = requestAnimationFrame(scrollLoop);
      return;
    }
    const maxScroll = textEl.scrollHeight - textEl.clientHeight;
    if (maxScroll <= 0) {
      rafId = requestAnimationFrame(scrollLoop);
      return;
    }
    const elapsed = elapsedMs / 1000;
    const target = getTargetScrollTop(elapsed, maxScroll);
    
    // After manual scroll ends, recalculate offset so auto-scroll
    // resumes from where the user left off instead of jumping back
    if (needOffsetRecalc) {
      scrollOffset = textEl.scrollTop - target;
      needOffsetRecalc = false;
    }
    
    textEl.scrollTop = Math.min(maxScroll, Math.max(0, target + scrollOffset));
    rafId = requestAnimationFrame(scrollLoop);
  })();
}

// Detect manual scroll via user input events
function onManualScroll() {
  manualScrollActive = true;
  if (manualScrollTimer) clearTimeout(manualScrollTimer);
  manualScrollTimer = setTimeout(() => {
    manualScrollActive = false;
    manualScrollTimer = null;
    needOffsetRecalc = true;
  }, MANUAL_PAUSE_MS);
}

textEl.addEventListener('wheel', onManualScroll, { passive: true });
textEl.addEventListener('touchstart', onManualScroll, { passive: true });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.teleprompterActiveScript) {
    loadScript();
  }
});

loadScript().then(() => {
  rafId = requestAnimationFrame(scrollLoop);
});

window.addEventListener('beforeunload', () => {
  if (rafId) cancelAnimationFrame(rafId);
});
