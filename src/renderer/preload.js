const { contextBridge, ipcRenderer } = require('electron');

/**
 * Service Worker Capture
 * Captures Service Worker registrations and scripts
 */
class ServiceWorkerCapture {
  constructor() {
    this.registeredWorkers = new Map();
    this.workerScripts = new Set();
    this.cacheContents = new Map();
    this.fetchEvents = [];
    this.initialize();
  }

  initialize() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return;
    }

    // Override serviceWorker.register
    const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    const self = this;

    navigator.serviceWorker.register = function(scriptURL, options) {
      const registration = originalRegister(scriptURL, options);
      
      // Track registration
      const registrationId = `sw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      self.registeredWorkers.set(registrationId, {
        id: registrationId,
        scriptURL: scriptURL,
        options: options,
        timestamp: Date.now(),
        scope: options?.scope || '/'
      });

      // Track script URL
      self.workerScripts.add(scriptURL);

      // Send to main process
      try {
        ipcRenderer.send('asset-captured', {
          type: 'service-worker',
          data: {
            scriptURL: scriptURL,
            options: options,
            timestamp: Date.now()
          }
        });
      } catch (error) {
        console.warn('Failed to send SW capture data:', error);
      }

      // Listen for updates
      registration.then(reg => {
        if (reg.active && reg.active.scriptURL) {
          self.workerScripts.add(reg.active.scriptURL);
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker && newWorker.scriptURL) {
            self.workerScripts.add(newWorker.scriptURL);
          }
        });
      }).catch(err => {
        console.warn('SW registration error:', err);
      });

      return registration;
    };

    // Capture existing registrations
    if (navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => {
          if (reg.active?.scriptURL) {
            self.workerScripts.add(reg.active.scriptURL);
          }
        });
      }).catch(err => {
        console.warn('Failed to get existing registrations:', err);
      });
    }

    // Capture cache contents
    this.captureCache();
  }

  async captureCache() {
    if (typeof caches === 'undefined') {
      return;
    }

    try {
      const cacheNames = await caches.keys();
      const cacheData = {};

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        const cacheEntries = [];

        for (const request of requests) {
          const response = await cache.match(request);
          if (response) {
            cacheEntries.push({
              url: request.url,
              method: request.method,
              status: response.status
            });
          }
        }

        cacheData[cacheName] = cacheEntries;
      }

      this.cacheContents.set('global', cacheData);
    } catch (error) {
      console.warn('Failed to capture cache:', error);
    }
  }

  getCapturedData() {
    return {
      registrations: Array.from(this.registeredWorkers.values()),
      scripts: Array.from(this.workerScripts),
      cacheContents: Object.fromEntries(this.cacheContents),
      fetchEvents: this.fetchEvents
    };
  }
}

/**
 * Web Worker Capture
 * Captures Web Worker and SharedWorker scripts
 */
class WebWorkerCapture {
  constructor() {
    this.workerScripts = new Set();
    this.sharedWorkerScripts = new Set();
    this.initialize();
  }

  initialize() {
    if (typeof window === 'undefined') {
      return;
    }

    // Override Worker constructor
    const OriginalWorker = window.Worker;
    const self = this;

    window.Worker = function(scriptURL, options) {
      // Track script URL
      self.workerScripts.add(scriptURL);

      // Send to main process
      try {
        ipcRenderer.send('asset-captured', {
          type: 'web-worker',
          data: {
            scriptURL: scriptURL,
            options: options,
            timestamp: Date.now()
          }
        });
      } catch (error) {
        console.warn('Failed to send Worker capture data:', error);
      }

      return new OriginalWorker(scriptURL, options);
    };

    // Override SharedWorker constructor
    if (window.SharedWorker) {
      const OriginalSharedWorker = window.SharedWorker;
      
      window.SharedWorker = function(scriptURL, name) {
        // Track script URL
        self.sharedWorkerScripts.add(scriptURL);

        // Send to main process
        try {
          ipcRenderer.send('asset-captured', {
            type: 'web-worker',
            data: {
              scriptURL: scriptURL,
              name: name,
              type: 'shared-worker',
              timestamp: Date.now()
            }
          });
        } catch (error) {
          console.warn('Failed to send SharedWorker capture data:', error);
        }

        return new OriginalSharedWorker(scriptURL, name);
      };
    }
  }

  getCapturedData() {
    return {
      workers: Array.from(this.workerScripts),
      sharedWorkers: Array.from(this.sharedWorkerScripts)
    };
  }
}

/**
 * Blob & Data URL Capture
 * Captures Blob URLs and extracts Data URLs
 */
class BlobDataUrlCapture {
  constructor() {
    this.blobUrls = new Map(); // blobURL -> { blob, type, size }
    this.dataUrls = new Map(); // dataURL -> { data, type, mime }
    this.originalCreateObjectURL = URL.createObjectURL;
    this.originalRevokeObjectURL = URL.revokeObjectURL;
    this.initialize();
  }

  initialize() {
    if (typeof window === 'undefined' || typeof URL === 'undefined') {
      return;
    }

    const self = this;

    // Override URL.createObjectURL
    URL.createObjectURL = function(blob) {
      const blobURL = self.originalCreateObjectURL.call(URL, blob);
      
      // Track blob
      self.blobUrls.set(blobURL, {
        url: blobURL,
        type: blob.type || 'application/octet-stream',
        size: blob.size || 0,
        timestamp: Date.now()
      });

      // Send to main process
      try {
        ipcRenderer.send('asset-captured', {
          type: 'blob-url',
          data: {
            url: blobURL,
            type: blob.type,
            size: blob.size,
            timestamp: Date.now()
          }
        });
      } catch (error) {
        console.warn('Failed to send Blob URL capture data:', error);
      }

      return blobURL;
    };

    // Override URL.revokeObjectURL to track revocations
    URL.revokeObjectURL = function(url) {
      self.blobUrls.delete(url);
      return self.originalRevokeObjectURL.call(URL, url);
    };

    // Extract data URLs from DOM
    this.extractDataUrlsFromDOM();
  }

  extractDataUrlsFromDOM() {
    if (typeof document === 'undefined') {
      return;
    }

    // Extract data URLs from images
    const images = document.querySelectorAll('img[src^="data:"]');
    images.forEach(img => {
      const dataUrl = img.src;
      if (dataUrl.startsWith('data:')) {
        this.processDataUrl(dataUrl, 'image');
      }
    });

    // Extract data URLs from CSS
    const styleSheets = document.styleSheets;
    for (let i = 0; i < styleSheets.length; i++) {
      try {
        const sheet = styleSheets[i];
        if (sheet.cssRules) {
          for (let j = 0; j < sheet.cssRules.length; j++) {
            const rule = sheet.cssRules[j];
            if (rule.style) {
              // Check background-image
              const bgImage = rule.style.backgroundImage;
              if (bgImage && bgImage.startsWith('url("data:') || bgImage.startsWith("url('data:")) {
                const match = bgImage.match(/url\(["']?(data:[^"')]+)["']?\)/);
                if (match) {
                  this.processDataUrl(match[1], 'image');
                }
              }
            }
          }
        }
      } catch (e) {
        // Cross-origin stylesheet
      }
    }

    // Extract data URLs from inline styles
    const elementsWithStyle = document.querySelectorAll('[style*="data:"]');
    elementsWithStyle.forEach(el => {
      const style = el.getAttribute('style');
      const matches = style.match(/url\(["']?(data:[^"')]+)["']?\)/g);
      if (matches) {
        matches.forEach(match => {
          const urlMatch = match.match(/url\(["']?(data:[^"')]+)["']?\)/);
          if (urlMatch) {
            this.processDataUrl(urlMatch[1], 'image');
          }
        });
      }
    }
    );
  }

  processDataUrl(dataUrl, defaultType) {
    if (this.dataUrls.has(dataUrl)) {
      return;
    }

    try {
      // Parse data URL: data:[<mediatype>][;base64],<data>
      const parts = dataUrl.split(',');
      if (parts.length < 2) {
        return;
      }

      const header = parts[0];
      const data = parts.slice(1).join(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : defaultType;
      const isBase64 = header.includes('base64');

      this.dataUrls.set(dataUrl, {
        url: dataUrl,
        mimeType: mimeType,
        data: data,
        isBase64: isBase64,
        timestamp: Date.now()
      });

      // Send to main process
      try {
        ipcRenderer.send('asset-captured', {
          type: 'data-url',
          data: {
            url: dataUrl,
            mimeType: mimeType,
            isBase64: isBase64,
            dataLength: data.length,
            timestamp: Date.now()
          }
        });
      } catch (error) {
        console.warn('Failed to send Data URL capture data:', error);
      }
    } catch (error) {
      console.warn('Failed to process data URL:', error);
    }
  }

  async extractBlobContent(blobURL) {
    const blobInfo = this.blobUrls.get(blobURL);
    if (!blobInfo) {
      return null;
    }

    try {
      const response = await fetch(blobURL);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      return {
        content: arrayBuffer,
        type: blob.type,
        size: blob.size
      };
    } catch (error) {
      console.warn('Failed to extract blob content:', error);
      return null;
    }
  }

  getCapturedData() {
    return {
      blobUrls: Array.from(this.blobUrls.values()),
      dataUrls: Array.from(this.dataUrls.values())
    };
  }
}

/**
 * Dynamic Import Capture
 * Captures dynamic import() calls and module imports
 */
class DynamicImportCapture {
  constructor() {
    this.dynamicImports = new Set();
    this.moduleImports = new Set();
    this.initialize();
  }

  initialize() {
    if (typeof window === 'undefined') {
      return;
    }

    // Override dynamic import()
    const self = this;
    window.__originalImport = window.__originalImport || null;
    
    // Note: import() cannot be overridden directly, so we'll track it via script analysis
    // Instead, we'll intercept module loading via script tags
    
    // Track script[type="module"] tags
    this.trackModuleScripts();
    
    // Monitor for new module scripts
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      const targetNode = document.head || document.body || document.documentElement;
      if (targetNode && targetNode.nodeType === Node.ELEMENT_NODE) {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node && node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SCRIPT' && node.type === 'module') {
                if (node.src) {
                  self.trackModuleImport(node.src);
                }
              }
            });
          });
        });
        
        observer.observe(targetNode, {
          childList: true,
          subtree: true
        });
      }
    }
  }

  trackModuleScripts() {
    if (typeof document === 'undefined') {
      return;
    }

    const moduleScripts = document.querySelectorAll('script[type="module"]');
    moduleScripts.forEach(script => {
      if (script.src) {
        this.trackModuleImport(script.src);
      }
      
      // Parse inline module scripts for import statements
      if (script.textContent) {
        this.parseModuleImports(script.textContent, script.src || window.location.href);
      }
    });
  }

  parseModuleImports(jsContent, baseUrl) {
    // Extract import statements: import ... from "url"
    const importRegex = /import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+)|(?:\w+\s*,\s*\{[^}]*\}))\s+from\s+["']([^"']+)["']/gi;
    let match;
    
    while ((match = importRegex.exec(jsContent)) !== null) {
      const importUrl = match[1];
      this.trackModuleImport(importUrl, baseUrl);
    }

    // Extract dynamic import(): import("url")
    const dynamicImportRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/gi;
    while ((match = dynamicImportRegex.exec(jsContent)) !== null) {
      const importUrl = match[1];
      this.trackDynamicImport(importUrl, baseUrl);
    }
  }

  trackModuleImport(importUrl, baseUrl = window.location.href) {
    try {
      const absoluteUrl = new URL(importUrl, baseUrl).toString();
      if (!this.moduleImports.has(absoluteUrl)) {
        this.moduleImports.add(absoluteUrl);
        
        // Send to main process
        try {
          ipcRenderer.send('asset-captured', {
            type: 'module-import',
            data: {
              url: absoluteUrl,
              timestamp: Date.now()
            }
          });
        } catch (error) {
          console.warn('Failed to send module import data:', error);
        }
      }
    } catch (error) {
      console.warn('Failed to track module import:', error);
    }
  }

  trackDynamicImport(importUrl, baseUrl = window.location.href) {
    try {
      const absoluteUrl = new URL(importUrl, baseUrl).toString();
      if (!this.dynamicImports.has(absoluteUrl)) {
        this.dynamicImports.add(absoluteUrl);
        
        // Send to main process
        try {
          ipcRenderer.send('asset-captured', {
            type: 'dynamic-import',
            data: {
              url: absoluteUrl,
              timestamp: Date.now()
            }
          });
        } catch (error) {
          console.warn('Failed to send dynamic import data:', error);
        }
      }
    } catch (error) {
      console.warn('Failed to track dynamic import:', error);
    }
  }

  getCapturedData() {
    return {
      dynamicImports: Array.from(this.dynamicImports),
      moduleImports: Array.from(this.moduleImports)
    };
  }
}

// Initialize Service Worker capture
let swCapture = null;
let workerCapture = null;
let blobDataUrlCapture = null;
let dynamicImportCapture = null;
if (typeof window !== 'undefined') {
  try {
    swCapture = new ServiceWorkerCapture();
    workerCapture = new WebWorkerCapture();
    blobDataUrlCapture = new BlobDataUrlCapture();
    dynamicImportCapture = new DynamicImportCapture();
  } catch (error) {
    // Error initializing capture classes - silent fail
  }
}

/**
 * Safe bridge for renderer ↔ main IPC communication
 */
try {
  if (!contextBridge || !ipcRenderer) {
    throw new Error('contextBridge or ipcRenderer not available');
  }

  contextBridge.exposeInMainWorld('electronAPI', {
    chooseFolder: () => ipcRenderer.invoke('show-open-dialog'),
  toggleServer: (options) => ipcRenderer.invoke('toggle-server', options),
  startClone: (options) => ipcRenderer.invoke('start-clone', options),
  getCookies: (url) => ipcRenderer.invoke('get-cookies', url),
  analyzeStaticFiles: (options) => ipcRenderer.invoke('analyze-static-files', options),
    clearOutputFolder: (path) => ipcRenderer.invoke('clear-output-folder', path),
    clearSpecificFiles: (path, extensions) => ipcRenderer.invoke('clear-specific-files', path, extensions),
    onCloneProgress: (callback) => ipcRenderer.on('clone-progress', (_event, payload) => callback(payload)),
    toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
  
  // Service Worker capture
  getServiceWorkerData: () => swCapture ? swCapture.getCapturedData() : null,
  
  // Web Worker capture
  getWebWorkerData: () => workerCapture ? workerCapture.getCapturedData() : null,
  
  // Blob & Data URL capture
  getBlobDataUrlData: () => blobDataUrlCapture ? blobDataUrlCapture.getCapturedData() : null,
  extractBlobContent: (blobURL) => blobDataUrlCapture ? blobDataUrlCapture.extractBlobContent(blobURL) : null,
  
  // Dynamic Import capture
  getDynamicImportData: () => dynamicImportCapture ? dynamicImportCapture.getCapturedData() : null
  });
  
} catch (error) {
  // Try to expose a minimal API even if there's an error
  try {
    if (contextBridge && ipcRenderer) {
      contextBridge.exposeInMainWorld('electronAPI', {
        chooseFolder: () => ipcRenderer.invoke('show-open-dialog'),
        toggleServer: (options) => ipcRenderer.invoke('toggle-server', options),
        startClone: (options) => ipcRenderer.invoke('start-clone', options),
        getCookies: (url) => ipcRenderer.invoke('get-cookies', url),
        analyzeStaticFiles: (options) => ipcRenderer.invoke('analyze-static-files', options),
        clearOutputFolder: (path) => ipcRenderer.invoke('clear-output-folder', path),
        clearSpecificFiles: (path, extensions) => ipcRenderer.invoke('clear-specific-files', path, extensions),
        onCloneProgress: (callback) => ipcRenderer.on('clone-progress', (_event, payload) => callback(payload)),
        toggleDevTools: () => ipcRenderer.invoke('toggle-devtools')
      });
    }
  } catch (fallbackError) {
    // Silent fail
  }
}
