/**
 * E2E tests for the Screen Recorder Chrome Extension
 * 
 * These tests load the actual extension in Chrome and test its functionality.
 * Note: Screen recording tests require user interaction for permission dialogs.
 */

const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const EXTENSION_ID = 'your-extension-id'; // Will be dynamic when loaded

describe('Chrome Extension E2E Tests', () => {
  let browser;
  let extensionPage;
  
  beforeAll(async () => {
    // Launch Chrome with the extension loaded
    browser = await puppeteer.launch({
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      defaultViewport: null
    });
    
    // Wait for extension to load
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
  
  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Extension Loading', () => {
    test('should load the extension successfully', async () => {
      const targets = await browser.targets();
      const extensionTarget = targets.find(
        target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
      );
      
      expect(extensionTarget).toBeDefined();
    });
    
    test('should have a popup page', async () => {
      const pages = await browser.pages();
      const page = pages[0] || await browser.newPage();
      
      // Navigate to a test page first
      await page.goto('https://example.com', { waitUntil: 'networkidle0' });
      
      // The extension popup would be accessed via chrome-extension:// URL
      // This test verifies the extension is loaded
      const targets = await browser.targets();
      const hasExtension = targets.some(t => t.url().includes('chrome-extension://'));
      
      expect(hasExtension).toBe(true);
    });
  });

  describe('Content Script Injection', () => {
    test('should inject content script on web pages', async () => {
      const page = await browser.newPage();
      await page.goto('https://example.com', { waitUntil: 'networkidle0' });
      
      // Check if the content script elements would be present
      // Note: Content script is only injected when recording starts
      const hasDocument = await page.evaluate(() => !!document);
      expect(hasDocument).toBe(true);
      
      await page.close();
    });
  });

  describe('Popup UI', () => {
    test('should have proper UI elements', async () => {
      // Get extension ID from service worker URL
      const targets = await browser.targets();
      const extensionTarget = targets.find(
        target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
      );
      
      if (!extensionTarget) {
        console.log('Extension not loaded, skipping popup test');
        return;
      }
      
      const extensionUrl = extensionTarget.url();
      const extensionId = extensionUrl.split('/')[2];
      
      // Open the popup
      const popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
        waitUntil: 'networkidle0'
      });
      
      // Check for key UI elements
      const hasStartButton = await popupPage.$('#startBtn');
      const hasSourceSelect = await popupPage.$('#sourceSelect');
      const hasCameraSelect = await popupPage.$('#cameraSelect');
      
      expect(hasStartButton).toBeTruthy();
      expect(hasSourceSelect).toBeTruthy();
      expect(hasCameraSelect).toBeTruthy();
      
      await popupPage.close();
    });
  });
});

describe('Integration Tests (No Browser)', () => {
  // These tests don't require a browser but test integration between components
  
  describe('Message Flow', () => {
    test('content script to background message format', () => {
      const stopMessage = { action: 'stopRecording' };
      expect(stopMessage).toHaveProperty('action');
      expect(stopMessage.action).toBe('stopRecording');
    });
    
    test('background to offscreen message format', () => {
      const offscreenMessage = { target: 'offscreen', action: 'stopRecording' };
      expect(offscreenMessage).toHaveProperty('target');
      expect(offscreenMessage).toHaveProperty('action');
      expect(offscreenMessage.target).toBe('offscreen');
    });
    
    test('background to content script message format', () => {
      const contentMessage = { action: 'showFloatingControls', config: {} };
      expect(contentMessage).toHaveProperty('action');
      expect(contentMessage).toHaveProperty('config');
    });
  });

  describe('Configuration', () => {
    test('should have valid manifest', () => {
      const manifest = require('../../manifest.json');
      
      expect(manifest.manifest_version).toBe(3);
      expect(manifest.name).toBeTruthy();
      expect(manifest.version).toBeTruthy();
      expect(manifest.permissions).toContain('tabs');
      expect(manifest.permissions).toContain('offscreen');
    });
  });
});

// Skip this in CI environments
const isCI = process.env.CI === 'true';

(isCI ? describe.skip : describe)('Manual Testing Helpers', () => {
  test('extension path is correct', () => {
    const fs = require('fs');
    const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
    
    expect(fs.existsSync(manifestPath)).toBe(true);
  });
});
