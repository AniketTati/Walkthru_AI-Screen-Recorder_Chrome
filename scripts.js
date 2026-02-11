// Scripts page - create and manage teleprompter scripts

const STORAGE_KEY = 'teleprompterScripts';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function parseTimestamp(str) {
  const trimmed = (str || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map(p => parseInt(p, 10));
  if (parts.length === 1 || parts.length === 2) {
    const valid = parts.every(p => !isNaN(p) && p >= 0);
    if (!valid) return null;
    if (parts.length === 1) return parts[0];
    return parts[0] * 60 + parts[1];
  }
  return null;
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + String(s).padStart(2, '0');
}

async function getScripts() {
  const { [STORAGE_KEY]: scripts } = await chrome.storage.local.get(STORAGE_KEY);
  return scripts || [];
}

async function saveScripts(scripts) {
  await chrome.storage.local.set({ [STORAGE_KEY]: scripts });
}

// DOM
const listView = document.getElementById('listView');
const editorView = document.getElementById('editorView');
const scriptList = document.getElementById('scriptList');
const emptyState = document.getElementById('emptyState');
const newScriptBtn = document.getElementById('newScriptBtn');
const emptyCreateBtn = document.getElementById('emptyCreateBtn');
const backBtn = document.getElementById('backBtn');
const editorTitle = document.getElementById('editorTitle');
const scriptForm = document.getElementById('scriptForm');
const scriptName = document.getElementById('scriptName');
const scriptContent = document.getElementById('scriptContent');
const addTimelineBtn = document.getElementById('addTimelineBtn');
const timelineStrip = document.getElementById('timelineStrip');
const timelineTrack = document.getElementById('timelineTrack');
const timelineRuler = document.getElementById('timelineRuler');
const timelineMarkersEl = document.getElementById('timelineMarkers');
const timelineEmpty = document.getElementById('timelineEmpty');
const timelineError = document.getElementById('timelineError');
const timelineModal = document.getElementById('timelineModal');
const timelineInput = document.getElementById('timelineInput');
const timelineCancel = document.getElementById('timelineCancel');
const timelineConfirm = document.getElementById('timelineConfirm');
const speedSlider = document.getElementById('speedSlider');
const speedInput = document.getElementById('speedInput');

let currentScriptId = null;
let pendingTimelinePosition = null;

function showList() {
  listView.classList.remove('hidden');
  editorView.classList.add('hidden');
  document.body.classList.remove('editor-active');
}

function showEditor() {
  listView.classList.add('hidden');
  editorView.classList.remove('hidden');
  document.body.classList.add('editor-active');
}

async function renderList() {
  const scripts = await getScripts();
  scriptList.innerHTML = '';
  if (scripts.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    scripts.forEach(script => {
      const card = document.createElement('div');
      card.className = 'script-card';
      const date = script.updatedAt ? new Date(script.updatedAt).toLocaleDateString() : '—';
      card.innerHTML = `
        <div class="script-card-info">
          <div class="script-card-name">${escapeHtml(script.name)}</div>
          <div class="script-card-date">Modified ${date}</div>
        </div>
        <div class="script-card-actions">
          <button class="edit-btn" data-id="${script.id}">Edit</button>
          <button class="delete-btn" data-id="${script.id}">Delete</button>
        </div>
      `;
      scriptList.appendChild(card);
      card.querySelector('.edit-btn').addEventListener('click', () => openEditor(script.id));
      card.querySelector('.delete-btn').addEventListener('click', () => deleteScript(script.id));
    });
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function getSnippet(text, position, maxLen = 40) {
  if (!text || position >= text.length) return '—';
  const start = Math.max(0, position - 10);
  let snippet = text.slice(start, position + maxLen);
  if (start > 0) snippet = '…' + snippet;
  if (position + maxLen < text.length) snippet += '…';
  return snippet.replace(/\n/g, ' ');
}

const MARKER_CLASS = 'timeline-marker';
const MARKER_DATA = 'data-showat';

function getTimelineMarkerHtml(showAt) {
  return `<span class="${MARKER_CLASS}" ${MARKER_DATA}="${showAt}" title="Show at ${formatTimestamp(showAt)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>`;
}

function getContentFromEditor() {
  let content = '';
  const timelinePoints = [];
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      content += node.textContent;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList?.contains(MARKER_CLASS)) {
        const showAt = parseInt(node.getAttribute(MARKER_DATA), 10);
        if (!isNaN(showAt)) {
          timelinePoints.push({ position: content.length, showAt });
        }
        return;
      }
      node.childNodes.forEach(walk);
    }
  }
  scriptContent.childNodes.forEach(walk);
  return { content, timelinePoints };
}

function setContentInEditor(content, timelinePoints) {
  const points = (timelinePoints || []).sort((a, b) => a.position - b.position);
  if (points.length === 0) {
    scriptContent.textContent = content || '';
    return;
  }
  const parts = [];
  let lastPos = 0;
  points.forEach((p) => {
    const pos = Math.min(p.position, content.length);
    if (pos > lastPos) {
      parts.push(escapeHtml(content.slice(lastPos, pos)));
    }
    parts.push(getTimelineMarkerHtml(p.showAt));
    lastPos = pos;
  });
  if (lastPos < content.length) {
    parts.push(escapeHtml(content.slice(lastPos)));
  }
  scriptContent.innerHTML = parts.join('');
}

function getSelectionOffset() {
  const sel = window.getSelection();
  if (!sel.rangeCount || !scriptContent.contains(sel.anchorNode)) return null;
  const range = document.createRange();
  range.setStart(scriptContent, 0);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  return range.toString().length;
}

function renderTimelineList() {
  const { content, timelinePoints } = getContentFromEditor();
  const points = [...timelinePoints].sort((a, b) => a.showAt - b.showAt);

  timelineRuler.innerHTML = '';
  timelineMarkersEl.innerHTML = '';

  if (points.length === 0) {
    timelineTrack.classList.add('hidden');
    timelineEmpty.style.display = '';
    return;
  }

  timelineTrack.classList.remove('hidden');
  timelineEmpty.style.display = 'none';

  // Determine the timeline range
  const maxShowAt = points[points.length - 1].showAt;
  const maxTime = Math.max(60, Math.ceil((maxShowAt + 30) / 30) * 30);

  // Scale: fit within container or use minimum px/sec
  const trackWidth = timelineTrack.clientWidth - 32; // minus padding
  const PX_PER_SEC = Math.max(3, trackWidth / maxTime);
  const totalWidth = Math.max(trackWidth, maxTime * PX_PER_SEC);

  timelineRuler.style.width = totalWidth + 'px';
  timelineMarkersEl.style.width = totalWidth + 'px';

  // Draw ruler ticks — adaptive interval
  let tickInterval = 30;
  if (maxTime > 600) tickInterval = 120;
  else if (maxTime > 300) tickInterval = 60;

  for (let t = 0; t <= maxTime; t += tickInterval) {
    const tick = document.createElement('span');
    tick.className = 'ruler-tick';
    tick.style.left = (t * PX_PER_SEC) + 'px';
    tick.textContent = formatTimestamp(t);
    timelineRuler.appendChild(tick);
  }

  // Draw markers/pins
  points.forEach((p, i) => {
    const pin = document.createElement('div');
    pin.className = 'timeline-pin';
    pin.style.left = (p.showAt * PX_PER_SEC) + 'px';

    const snippet = getSnippet(content, p.position, 20);
    pin.title = `${formatTimestamp(p.showAt)} — ${snippet}`;

    pin.innerHTML = `
      <button type="button" class="timeline-pin-remove">×</button>
      <div class="timeline-pin-head"></div>
      <div class="timeline-pin-stem"></div>
      <span class="timeline-pin-label">${formatTimestamp(p.showAt)}</span>
    `;

    timelineMarkersEl.appendChild(pin);

    pin.querySelector('.timeline-pin-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      const { content: c, timelinePoints: pts } = getContentFromEditor();
      const sorted = [...pts].sort((a, b) => a.showAt - b.showAt);
      sorted.splice(i, 1);
      setContentInEditor(c, sorted);
      renderTimelineList();
    });
  });
}

function setSpeed(value) {
  const v = Math.min(200, Math.max(60, parseInt(value, 10) || 120));
  speedSlider.value = v;
  speedInput.value = v;
}

function openEditor(id = null) {
  currentScriptId = id;
  if (id) {
    editorTitle.textContent = 'Edit script';
    getScripts().then(scripts => {
      const script = scripts.find(s => s.id === id);
      if (script) {
        scriptName.value = script.name;
        setContentInEditor(script.content || '', script.timelinePoints || []);
        setSpeed(script.defaultSpeed || 120);
      }
      renderTimelineList();
    });
  } else {
    editorTitle.textContent = 'New script';
    scriptName.value = '';
    setContentInEditor('', []);
    setSpeed(120);
    renderTimelineList();
  }
  timelineError.classList.add('hidden');
  showEditor();
}

async function deleteScript(id) {
  if (!confirm('Delete this script?')) return;
  const scripts = await getScripts();
  const filtered = scripts.filter(s => s.id !== id);
  await saveScripts(filtered);
  renderList();
}

addTimelineBtn.addEventListener('click', () => {
  const pos = getSelectionOffset();
  if (pos === null) return;
  pendingTimelinePosition = pos;
  timelineInput.value = '';
  timelineError.classList.add('hidden');
  timelineModal.classList.remove('hidden');
  timelineInput.focus();
});

timelineCancel.addEventListener('click', () => {
  timelineModal.classList.add('hidden');
  pendingTimelinePosition = null;
});

timelineConfirm.addEventListener('click', () => {
  const seconds = parseTimestamp(timelineInput.value);
  if (seconds === null) {
    timelineError.textContent = 'Invalid format. Use M:SS or MM:SS (e.g. 3:00, 1:30)';
    timelineError.classList.remove('hidden');
    return;
  }
  const { content, timelinePoints } = getContentFromEditor();
  const points = [...timelinePoints, { position: pendingTimelinePosition, showAt: seconds }];
  setContentInEditor(content, points);
  renderTimelineList();
  timelineModal.classList.add('hidden');
  pendingTimelinePosition = null;
});

timelineInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') timelineConfirm.click();
  if (e.key === 'Escape') timelineCancel.click();
});

scriptForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = scriptName.value.trim();
  if (!name) {
    scriptName.focus();
    return;
  }
  const speed = Math.min(200, Math.max(60, parseInt(speedInput.value, 10) || 120));
  setSpeed(speed);
  const { content, timelinePoints } = getContentFromEditor();

  const scripts = await getScripts();
  const now = Date.now();

  if (currentScriptId) {
    const idx = scripts.findIndex(s => s.id === currentScriptId);
    if (idx >= 0) {
      scripts[idx] = { ...scripts[idx], name, content, defaultSpeed: speed, timelinePoints, updatedAt: now };
    }
  } else {
    scripts.push({
      id: generateId(),
      name,
      content,
      defaultSpeed: speed,
      timelinePoints,
      updatedAt: now
    });
  }
  await saveScripts(scripts);
  showList();
  renderList();
});

backBtn.addEventListener('click', (e) => {
  e.preventDefault();
  showList();
  renderList();
});

newScriptBtn.addEventListener('click', () => openEditor(null));
emptyCreateBtn.addEventListener('click', () => openEditor(null));

speedSlider.addEventListener('input', () => {
  speedInput.value = speedSlider.value;
});

speedInput.addEventListener('input', () => {
  const v = parseInt(speedInput.value, 10);
  if (!isNaN(v)) {
    const clamped = Math.min(200, Math.max(60, v));
    speedSlider.value = clamped;
    if (v !== clamped) speedInput.value = clamped;
  }
});

speedInput.addEventListener('change', () => {
  const v = parseInt(speedInput.value, 10);
  if (isNaN(v) || v < 60 || v > 200) {
    setSpeed(120);
  }
});

scriptContent.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
    e.preventDefault();
    if (editorView.classList.contains('hidden')) return;
    scriptContent.focus();
    addTimelineBtn.click();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  renderList();
});
