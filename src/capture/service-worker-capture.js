/**
 * Service Worker Capture Module
 * Detects and captures Service Worker scripts and cache contents
 */

class ServiceWorkerCapture {
  constructor() {
    this.registeredWorkers = new Map();
    this.workerScripts = new Set();
    this.cacheContents = new Map();
    this.fetchEvents = [];
  }

  /**
   * Initialize Service Worker capture
   */
  initialize() {
    this.captureRegistrations();
    this.captureCache();
    this.captureFetchEvents();
  }

  /**
   * Capture Service Worker registrations
   */
  captureRegistrations() {
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

      // Log registration
      console.log('[SW Capture] Service Worker registered:', scriptURL);
      
      // Listen for updates
      registration.then(reg => {
        if (reg.installing) {
          self.trackInstallingWorker(reg.installing, registrationId);
        }
        if (reg.waiting) {
          self.trackWaitingWorker(reg.waiting, registrationId);
        }
        if (reg.active) {
          self.trackActiveWorker(reg.active, registrationId);
        }

        // Listen for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            self.trackInstallingWorker(newWorker, registrationId);
          }
        });
      });

      return registration;
    };

    // Capture existing registrations
    if (navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => {
          const registrationId = `sw_existing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          self.registeredWorkers.set(registrationId, {
            id: registrationId,
            scriptURL: reg.active?.scriptURL || 'unknown',
            timestamp: Date.now(),
            scope: reg.scope,
            existing: true
          });
          if (reg.active?.scriptURL) {
            self.workerScripts.add(reg.active.scriptURL);
          }
        });
      });
    }
  }

  /**
   * Track installing worker
   */
  trackInstallingWorker(worker, registrationId) {
    worker.addEventListener('statechange', () => {
      console.log('[SW Capture] Worker state changed:', worker.state);
      if (worker.scriptURL) {
        this.workerScripts.add(worker.scriptURL);
      }
    });
  }

  /**
   * Track waiting worker
   */
  trackWaitingWorker(worker, registrationId) {
    if (worker.scriptURL) {
      this.workerScripts.add(worker.scriptURL);
    }
  }

  /**
   * Track active worker
   */
  trackActiveWorker(worker, registrationId) {
    if (worker.scriptURL) {
      this.workerScripts.add(worker.scriptURL);
    }

    // Try to get cache contents
    this.extractCacheContents(worker);
  }

  /**
   * Extract cache contents from Service Worker
   */
  async extractCacheContents(worker) {
    try {
      // Use postMessage to request cache contents
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'cache-contents') {
          const cacheData = event.data.caches;
          this.cacheContents.set(worker.scriptURL, cacheData);
          console.log('[SW Capture] Cache contents extracted:', cacheData);
        }
      };

      // Request cache contents
      worker.postMessage({ type: 'get-cache-contents' }, [messageChannel.port2]);
    } catch (error) {
      console.warn('[SW Capture] Failed to extract cache contents:', error);
    }
  }

  /**
   * Capture Service Worker cache using caches API
   */
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
              headers: Object.fromEntries(response.headers.entries()),
              status: response.status,
              statusText: response.statusText
            });
          }
        }

        cacheData[cacheName] = cacheEntries;
      }

      this.cacheContents.set('global', cacheData);
      console.log('[SW Capture] Global cache contents captured:', cacheData);
    } catch (error) {
      console.warn('[SW Capture] Failed to capture cache:', error);
    }
  }

  /**
   * Capture Service Worker fetch events
   */
  captureFetchEvents() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return;
    }

    // Listen for messages from Service Workers
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'fetch-event') {
        this.fetchEvents.push({
          url: event.data.url,
          method: event.data.method,
          timestamp: Date.now(),
          worker: event.source?.scriptURL || 'unknown'
        });
      }
    });
  }

  /**
   * Get all captured Service Worker data
   */
  getCapturedData() {
    return {
      registrations: Array.from(this.registeredWorkers.values()),
      scripts: Array.from(this.workerScripts),
      cacheContents: Object.fromEntries(this.cacheContents),
      fetchEvents: this.fetchEvents
    };
  }

  /**
   * Clear captured data
   */
  clear() {
    this.registeredWorkers.clear();
    this.workerScripts.clear();
    this.cacheContents.clear();
    this.fetchEvents = [];
  }
}

export default ServiceWorkerCapture;

