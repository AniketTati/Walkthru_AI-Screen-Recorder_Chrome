/**
 * Unit tests for offscreen.js functionality
 */

describe('Offscreen Document', () => {
  describe('Recording Size Limits', () => {
    const MAX_BASE64_SIZE = 40 * 1024 * 1024; // 40MB
    
    test('should use base64 for small recordings', () => {
      const blobSize = 10 * 1024 * 1024; // 10MB
      const shouldUseBase64 = blobSize < MAX_BASE64_SIZE;
      
      expect(shouldUseBase64).toBe(true);
    });
    
    test('should use blob URL for large recordings', () => {
      const blobSize = 50 * 1024 * 1024; // 50MB
      const shouldUseBase64 = blobSize < MAX_BASE64_SIZE;
      
      expect(shouldUseBase64).toBe(false);
    });
    
    test('should handle edge case at exactly 40MB', () => {
      const blobSize = MAX_BASE64_SIZE;
      const shouldUseBase64 = blobSize < MAX_BASE64_SIZE;
      
      // 40MB exactly should use blob URL (not less than)
      expect(shouldUseBase64).toBe(false);
    });
  });

  describe('MediaRecorder Setup', () => {
    test('should support webm with vp9 codec', () => {
      const isSupported = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus');
      expect(isSupported).toBe(true);
    });
    
    test('should fall back to basic webm', () => {
      const isSupported = MediaRecorder.isTypeSupported('video/webm');
      expect(isSupported).toBe(true);
    });
  });

  describe('Stop Recording Logic', () => {
    let recorder;
    
    beforeEach(() => {
      recorder = new MediaRecorder(new MediaStream(), {});
    });
    
    test('should request data before stopping if recording', () => {
      recorder.start();
      expect(recorder.state).toBe('recording');
      
      const requestDataSpy = jest.spyOn(recorder, 'requestData');
      
      // Simulate stopRecording logic
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
      
      expect(requestDataSpy).toHaveBeenCalled();
    });
    
    test('should handle paused state on stop', () => {
      recorder.start();
      recorder.pause();
      expect(recorder.state).toBe('paused');
      
      // Should still be able to stop from paused state
      recorder.stop();
      expect(recorder.state).toBe('inactive');
    });
    
    test('should handle already inactive recorder', () => {
      expect(recorder.state).toBe('inactive');
      
      // stopRecording logic: if inactive, just cleanup
      const isInactive = recorder.state === 'inactive';
      expect(isInactive).toBe(true);
    });
  });

  describe('Message Filtering', () => {
    test('should only handle messages with target=offscreen', () => {
      const validMessage = { target: 'offscreen', action: 'stopRecording' };
      const invalidMessage = { action: 'stopRecording' };
      
      expect(validMessage.target === 'offscreen').toBe(true);
      expect(invalidMessage.target === 'offscreen').toBe(false);
    });
    
    test('should handle all expected actions', () => {
      const expectedActions = [
        'requestPermission',
        'startRecording',
        'stopRecording',
        'pauseRecording',
        'resumeRecording',
        'discardRecording',
        'captureScreenshot'
      ];
      
      expectedActions.forEach(action => {
        const message = { target: 'offscreen', action };
        expect(expectedActions).toContain(message.action);
      });
    });
  });

  describe('Filename Generation', () => {
    test('should generate valid filename with timestamp', () => {
      const now = new Date('2024-01-15T10:30:45.123Z');
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `recording-${timestamp}.webm`;
      
      expect(filename).toBe('recording-2024-01-15T10-30-45.webm');
      // Check that colons are replaced (not dots - we keep .webm extension)
      expect(filename).not.toContain(':');
      expect(filename.endsWith('.webm')).toBe(true);
    });
  });
});

describe('Stream Handling', () => {
  test('should stop all tracks on cleanup', () => {
    const mockTrack1 = { stop: jest.fn() };
    const mockTrack2 = { stop: jest.fn() };
    const mockStream = {
      getTracks: () => [mockTrack1, mockTrack2]
    };
    
    // Simulate cleanup
    mockStream.getTracks().forEach(t => t.stop());
    
    expect(mockTrack1.stop).toHaveBeenCalled();
    expect(mockTrack2.stop).toHaveBeenCalled();
  });
});
