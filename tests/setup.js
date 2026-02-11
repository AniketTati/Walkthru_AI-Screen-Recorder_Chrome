// Test setup - Mock Chrome Extension APIs

// Mock chrome.runtime
global.chrome = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`),
    getContexts: jest.fn().mockResolvedValue([])
  },
  tabs: {
    query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
    onActivated: {
      addListener: jest.fn()
    }
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue()
    }
  },
  downloads: {
    download: jest.fn().mockResolvedValue(1)
  },
  scripting: {
    insertCSS: jest.fn().mockResolvedValue(),
    executeScript: jest.fn().mockResolvedValue()
  },
  offscreen: {
    createDocument: jest.fn().mockResolvedValue(),
    closeDocument: jest.fn().mockResolvedValue()
  }
};

// Mock navigator.mediaDevices
global.navigator = {
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
      getVideoTracks: () => [{ stop: jest.fn() }],
      getAudioTracks: () => [{ stop: jest.fn() }]
    }),
    getDisplayMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn(), onended: null }],
      getVideoTracks: () => [{ stop: jest.fn(), onended: null }],
      getAudioTracks: () => [{ stop: jest.fn() }]
    }),
    enumerateDevices: jest.fn().mockResolvedValue([])
  }
};

// Mock MediaRecorder
global.MediaRecorder = class MockMediaRecorder {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
  }
  
  start(timeslice) {
    this.state = 'recording';
  }
  
  stop() {
    this.state = 'inactive';
    if (this.onstop) {
      setTimeout(() => this.onstop(), 0);
    }
  }
  
  pause() {
    this.state = 'paused';
  }
  
  resume() {
    this.state = 'recording';
  }
  
  requestData() {
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['test'], { type: 'video/webm' }) });
    }
  }
  
  static isTypeSupported(type) {
    return type.includes('video/webm');
  }
};

// Mock URL
global.URL = {
  createObjectURL: jest.fn().mockReturnValue('blob:test'),
  revokeObjectURL: jest.fn()
};

// Mock Blob
global.Blob = class MockBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.type = options?.type || '';
    this.size = parts.reduce((acc, part) => acc + (part.length || part.size || 0), 0);
  }
};

// Mock FileReader
global.FileReader = class MockFileReader {
  constructor() {
    this.result = null;
    this.onloadend = null;
    this.onerror = null;
  }
  
  readAsDataURL(blob) {
    this.result = 'data:video/webm;base64,dGVzdA==';
    setTimeout(() => {
      if (this.onloadend) this.onloadend();
    }, 0);
  }
};

// Mock AudioContext
global.AudioContext = class MockAudioContext {
  createMediaStreamDestination() {
    return {
      stream: {
        getAudioTracks: () => [{ stop: jest.fn() }]
      }
    };
  }
  
  createMediaStreamSource(stream) {
    return {
      connect: jest.fn()
    };
  }
};

// Mock MediaStream
global.MediaStream = class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = tracks;
  }
  
  getTracks() {
    return this.tracks;
  }
  
  getVideoTracks() {
    return this.tracks.filter(t => t.kind === 'video');
  }
  
  getAudioTracks() {
    return this.tracks.filter(t => t.kind === 'audio');
  }
};

// Console spy for debugging
beforeEach(() => {
  jest.clearAllMocks();
});
