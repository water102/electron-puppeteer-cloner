// network-monitor.js - Network request monitoring and logging

import { UrlDatabaseManager, URL_TYPES } from './url-classifier.js';

/**
 * Network monitor for capturing and logging requests
 */
export class NetworkMonitor {
  constructor() {
    this.isMonitoring = false;
    this.currentHostname = '';
    this.capturedRequests = new Set();
    this.capturedFiles = new Set();
  }

  /**
   * Start monitoring network requests
   * @param {string} hostname - Current hostname
   */
  async startMonitoring(hostname) {
    if (this.isMonitoring && this.currentHostname === hostname) {
      return; // Already monitoring this hostname
    }

    this.isMonitoring = true;
    this.currentHostname = hostname;
    
    console.log(`🔍 Starting network monitoring for: ${hostname}`);
    
    // Start capturing from the source webview (no reset of existing data)
    await this.captureFromWebview();
  }

  /**
   * Stop monitoring network requests
   */
  stopMonitoring() {
    this.isMonitoring = false;
    this.currentHostname = '';
    console.log('⏹️ Network monitoring stopped');
  }

  /**
   * Capture network requests from the source webview
   */
  async captureFromWebview() {
    try {
      const srcView = document.getElementById('srcView');
      if (!srcView) {
        console.warn('Source webview not found');
        return;
      }

      // Inject network monitoring script into the webview
      await srcView.executeJavaScript(`
        (function() {
          // Avoid duplicate injection
          if (window.__networkMonitorInjected) return;
          window.__networkMonitorInjected = true;
          
          const capturedRequests = [];
          const capturedFiles = [];
          
          // Override fetch to capture requests
          const originalFetch = window.fetch;
          window.fetch = function(...args) {
            const url = args[0];
            const options = args[1] || {};
            
            const requestData = {
              type: 'fetch',
              url: url,
              method: options.method || 'GET',
              headers: options.headers || {},
              body: options.body || null,
              timestamp: Date.now()
            };
            
            capturedRequests.push(requestData);
            
            return originalFetch.apply(this, args).then(response => {
              // Capture response data
              const responseData = {
                ...requestData,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                responseTime: Date.now() - requestData.timestamp
              };
              
              // Store in global for retrieval
              window.__capturedNetworkData = {
                requests: capturedRequests,
                files: capturedFiles,
                timestamp: Date.now()
              };
              
              return response;
            });
          };
          
          // Override XMLHttpRequest to capture requests
          const originalXHR = window.XMLHttpRequest;
          window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            const originalSend = xhr.send;
            
            xhr.open = function(method, url, ...args) {
              this._method = method;
              this._url = url;
              return originalOpen.apply(this, [method, url, ...args]);
            };
            
            xhr.send = function(...args) {
              if (this._url) {
                const requestData = {
                  type: 'xhr',
                  url: this._url,
                  method: this._method || 'GET',
                  timestamp: Date.now()
                };
                
                capturedRequests.push(requestData);
                
                this.addEventListener('load', function() {
                  const responseData = {
                    ...requestData,
                    status: this.status,
                    statusText: this.statusText,
                    responseTime: Date.now() - requestData.timestamp
                  };
                  
                  // Store in global for retrieval
                  window.__capturedNetworkData = {
                    requests: capturedRequests,
                    files: capturedFiles,
                    timestamp: Date.now()
                  };
                });
              }
              return originalSend.apply(this, args);
            };
            
            return xhr;
          };
          
          // Capture existing resources from performance API
          try {
            const resources = performance.getEntriesByType('resource');
            resources.forEach(resource => {
              if (resource.name && resource.initiatorType !== 'navigation') {
                const fileData = {
                  url: resource.name,
                  size: resource.transferSize || 0,
                  duration: resource.duration,
                  timestamp: Date.now()
                };
                
                capturedFiles.push(fileData);
              }
            });
          } catch (error) {
            console.warn('Error capturing existing resources:', error);
          }
          
          // Store initial data
          window.__capturedNetworkData = {
            requests: capturedRequests,
            files: capturedFiles,
            timestamp: Date.now()
          };
          
          console.log('Network monitoring script injected');
        })();
      `);

      // Set up periodic data collection
      this.startPeriodicCollection();
      
    } catch (error) {
      console.error('Error setting up network monitoring:', error);
    }
  }

  /**
   * Start periodic collection of captured data
   */
  startPeriodicCollection() {
    // Clear any existing interval
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    
    // Collect data every 2 seconds
    this.collectionInterval = setInterval(async () => {
      if (this.isMonitoring) {
        await this.collectCapturedData();
      }
    }, 2000);
  }

  /**
   * Collect captured data from the webview
   */
  async collectCapturedData() {
    try {
      const srcView = document.getElementById('srcView');
      if (!srcView) return;

      const networkData = await srcView.executeJavaScript(`
        (function() {
          return window.__capturedNetworkData || {
            requests: [],
            files: [],
            timestamp: Date.now()
          };
        })();
      `);

      if (!networkData) return;

      // Process and save requests using unified classification system
      for (const request of networkData.requests) {
        const requestKey = `${request.method}-${request.url}`;
        if (!this.capturedRequests.has(requestKey)) {
          this.capturedRequests.add(requestKey);
          
          try {
            const result = await urlDatabaseManager.processUrl(
              request.url,
              request.method,
              {
                status: request.status || 200,
                responseTime: request.responseTime || 0,
                headers: request.headers || {},
                body: request.body || '',
                timestamp: request.timestamp,
                source: 'network_monitor'
              },
              this.currentHostname
            );
            
            if (result.success) {
              console.log(`📝 Captured ${result.classification.type}: ${request.method} ${request.url}`);
              console.log(`[NetworkMonitor] Saved to database for hostname: ${this.currentHostname}`);
              
              // Update stats in renderer
              if (window.updateNetworkStats) {
                await window.updateNetworkStats(result.classification.type === URL_TYPES.API_REQUEST ? 'request' : 'file');
              }
            } else if (result.existing) {
              console.log(`⏭️ URL already exists: ${request.method} ${request.url}`);
            } else {
              console.warn(`⚠️ Failed to process request: ${request.method} ${request.url} - ${result.error || result.reason}`);
            }
          } catch (error) {
            console.error('Error processing request:', error);
          }
        }
      }

      // Process and save files using unified classification system
      for (const file of networkData.files) {
        const fileKey = file.url;
        if (!this.capturedFiles.has(fileKey)) {
          this.capturedFiles.add(fileKey);
          
          try {
            const result = await urlDatabaseManager.processUrl(
              file.url,
              'GET',
              {
                size: file.size || 0,
                timestamp: file.timestamp,
                source: 'network_monitor'
              },
              this.currentHostname
            );
            
            if (result.success) {
              console.log(`📁 Captured ${result.classification.type}: ${file.url}`);
              
              // Update stats in renderer
              if (window.updateNetworkStats) {
                await window.updateNetworkStats(result.classification.type === URL_TYPES.STATIC_FILE ? 'file' : 'request');
              }
            } else if (result.existing) {
              console.log(`⏭️ File already exists: ${file.url}`);
            } else {
              console.warn(`⚠️ Failed to process file: ${file.url} - ${result.error || result.reason}`);
            }
          } catch (error) {
            console.error('Error processing file:', error);
          }
        }
      }

    } catch (error) {
      console.error('Error collecting captured data:', error);
    }
  }

  /**
   * Get current monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      hostname: this.currentHostname,
      capturedRequests: this.capturedRequests.size,
      capturedFiles: this.capturedFiles.size
    };
  }

  /**
   * Clear captured data
   */
  clearCapturedData() {
    this.capturedRequests.clear();
    this.capturedFiles.clear();
    console.log('🗑️ Cleared captured network data');
  }

  /**
   * Stop periodic collection
   */
  stopPeriodicCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }

  // Note: Old save methods removed - now using unified urlDatabaseManager

  /**
   * Helper methods for file processing
   */
  getFilenameFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      return pathname.split('/').pop() || 'index';
    } catch {
      return 'unknown';
    }
  }

  getFileTypeFromUrl(url) {
    const extension = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    return extension || 'unknown';
  }

  getMimeTypeFromExtension(extension) {
    const mimeTypes = {
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'txt': 'text/plain'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  // Note: Old existence checking methods removed - now handled by unified urlDatabaseManager

  /**
   * Cleanup when stopping monitoring
   */
  cleanup() {
    this.stopPeriodicCollection();
    this.clearCapturedData();
    this.isMonitoring = false;
    this.currentHostname = '';
  }
}

// Create global instance
export const networkMonitor = new NetworkMonitor();
