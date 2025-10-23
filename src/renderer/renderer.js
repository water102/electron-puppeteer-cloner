/**
 * Main renderer process logic for the Electron app
 */

// DOM element references
const elements = {
  srcView: document.getElementById('srcView'),
  dstView: document.getElementById('dstView'),
  srcUrl: document.getElementById('srcUrl'),
  srcGo: document.getElementById('srcGo'),
  dstUrl: document.getElementById('dstUrl'),
  dstGo: document.getElementById('dstGo'),
  refreshBtn: document.getElementById('refreshBtn'),
  chooseOut: document.getElementById('chooseOut'),
  outPath: document.getElementById('outPath'),
  portInput: document.getElementById('port'),
  toggleServerBtn: document.getElementById('toggleServer'),
  testServerBtn: document.getElementById('testServer'),
  cloneBtn: document.getElementById('cloneBtn'),
  clearBtn: document.getElementById('clearBtn'),
  clearDropdown: document.getElementById('clearDropdown'),
  clearDropdownMenu: document.getElementById('clearDropdownMenu'),
  clearJsBtn: document.getElementById('clearJsBtn'),
  clearCssBtn: document.getElementById('clearCssBtn'),
  clearHtmlBtn: document.getElementById('clearHtmlBtn'),
  clearImagesBtn: document.getElementById('clearImagesBtn'),
  clearSettingsBtn: document.getElementById('clearSettingsBtn'),
  logArea: document.getElementById('logArea'),
  leftPanel: document.getElementById('leftPanel'),
  rightPanel: document.getElementById('rightPanel'),
  top: document.getElementById('top'),
  bottom: document.getElementById('bottom'),
  progressContainer: document.getElementById('progressContainer'),
  progressText: document.getElementById('progressText'),
  progressStats: document.getElementById('progressStats'),
  progressToggle: document.getElementById('progressToggle'),
  progressContent: document.getElementById('progressContent'),
  overallProgressFill: document.getElementById('overallProgressFill'),
  currentFileText: document.getElementById('currentFileText'),
  currentFileProgressFill: document.getElementById('currentFileProgressFill')
};

// Application state
let serverRunning = false;
let watchMode = false;
let lastWatchedUrl = '';
let cloneQueue = [];
let progressHideTimeout = null;
let currentDomain = '';
let totalFiles = 0; // Store total file count
let progressCollapsed = false; // Track progress container collapse state

// Local storage keys
const STORAGE_KEYS = {
  LAST_URL: 'lastSourceUrl',
  LAST_OUTPUT_DIR: 'lastOutputDir',
  LAST_PORT: 'lastPort'
};

// Debounce utility (kept for resize observer)
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Initialize the application
 */
function initializeApp() {
  setupEventListeners();
  setupResizePanels();
  setupCloneProgressListener();
  setupResizeObserver();
  restoreLastSettings();
  setupUrlSync();
}

/**
 * Setup periodic URL synchronization
 */
function setupUrlSync() {
  // Sync URL every 2 seconds to ensure it stays updated
  setInterval(() => {
    syncUrlFromWebview();
  }, 2000);
}

/**
 * Save URL to localStorage
 */
function saveLastUrl(url) {
  if (url && url.trim()) {
    localStorage.setItem(STORAGE_KEYS.LAST_URL, url.trim());
    appendLog(`💾 Saved URL: ${url}`);
  }
}

/**
 * Restore last settings from localStorage
 */
function restoreLastSettings() {
  // Restore last URL
  const lastUrl = localStorage.getItem(STORAGE_KEYS.LAST_URL);
  if (lastUrl) {
    elements.srcUrl.value = lastUrl;
    appendLog(`🔄 Restored last URL: ${lastUrl}`);
    
    // Initialize domain tracking for restored URL
    checkDomainChange(lastUrl);
  }
  
  // Restore last output directory
  const lastOutputDir = localStorage.getItem(STORAGE_KEYS.LAST_OUTPUT_DIR);
  if (lastOutputDir) {
    elements.outPath.value = lastOutputDir;
    appendLog(`📁 Restored last output directory: ${lastOutputDir}`);
  }
  
  // Restore last port
  const lastPort = localStorage.getItem(STORAGE_KEYS.LAST_PORT);
  if (lastPort) {
    elements.portInput.value = lastPort;
    appendLog(`🔌 Restored last port: ${lastPort}`);
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Source URL navigation
  elements.srcGo.addEventListener('click', handleSourceNavigation);
  
  // Allow editing srcUrl
  elements.srcUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSourceNavigation();
    }
  });
  
  // Add click event to sync URL from webview
  elements.srcUrl.addEventListener('click', () => {
    syncUrlFromWebview();
  });
  
  // Save port when changed
  elements.portInput.addEventListener('change', (e) => {
    localStorage.setItem(STORAGE_KEYS.LAST_PORT, e.target.value);
    appendLog(`💾 Saved port: ${e.target.value}`);
  });
  
  // Watch for URL changes in srcView for auto-clone
  elements.srcView.addEventListener('did-navigate', handleUrlChange);
  elements.srcView.addEventListener('did-navigate-in-page', handleUrlChange);
  elements.srcView.addEventListener('did-finish-load', handleUrlChange);
  elements.srcView.addEventListener('did-frame-navigate', handleUrlChange);
  
  // Destination URL navigation
  elements.dstGo.addEventListener('click', handleDestinationNavigation);
  elements.refreshBtn.addEventListener('click', handleRefresh);
  
  // Allow editing dstUrl
  elements.dstUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleDestinationNavigation();
    }
  });
  
  // Output folder selection
  elements.chooseOut.addEventListener('click', handleChooseOutput);
  
  // Server toggle
  elements.toggleServerBtn.addEventListener('click', handleToggleServer);
  
  // Test server
  elements.testServerBtn.addEventListener('click', handleTestServer);
  
  // Clone operation
  elements.cloneBtn.addEventListener('click', handleClone);
  
  // Progress toggle
  elements.progressToggle.addEventListener('click', handleProgressToggle);
  
  // Clear output folder (main button)
  elements.clearBtn.addEventListener('click', handleClearOutput);
  
  // Dropdown arrow click
  elements.clearDropdown.addEventListener('click', handleClearDropdownToggle);
  
  // Specific clear options
  elements.clearJsBtn.addEventListener('click', () => handleClearSpecific('js'));
  elements.clearCssBtn.addEventListener('click', () => handleClearSpecific('css'));
  elements.clearHtmlBtn.addEventListener('click', () => handleClearSpecific('html'));
  elements.clearImagesBtn.addEventListener('click', () => handleClearSpecific('images'));
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      elements.clearDropdownMenu.style.display = 'none';
    }
  });
  
  // Clear saved settings
  elements.clearSettingsBtn.addEventListener('click', handleClearSettings);
}

/**
 * Setup resize panels using split.js library
 */
function setupResizePanels() {
  // Wait a bit for split.js to load
  setTimeout(() => {
    try {
      // Check if Split is available globally
      if (typeof window.Split === 'undefined') {
        throw new Error('Split.js not loaded');
      }
      
      // Clean up existing splits if any
      if (window.horizontalSplit) {
        window.horizontalSplit.destroy();
      }
      if (window.verticalSplit) {
        window.verticalSplit.destroy();
      }
    
    // Initialize horizontal split for left/right panels
    const horizontalSplit = window.Split([elements.leftPanel, elements.rightPanel], {
      sizes: [50, 50],
      minSize: [220, 220],
      gutterSize: 8,
      cursor: 'ew-resize',
      onDrag: () => {
        // Update webview dimensions when horizontal split changes
        elements.srcView.style.width = '100%';
        elements.dstView.style.width = '100%';
      }
    });
    
    // Initialize vertical split for top/bottom panels
    const verticalSplit = window.Split([elements.top, elements.bottom], {
      direction: 'vertical',
      sizes: [70, 30],
      minSize: [200, 100],
      gutterSize: 8,
      cursor: 'ns-resize',
      onDrag: () => {
        // Update log area height after vertical resize
        updateLogAreaHeight();
      }
    });
    
    // Store split instances for potential cleanup
    window.horizontalSplit = horizontalSplit;
    window.verticalSplit = verticalSplit;
    
    console.log('Split.js initialized successfully');
    console.log('Horizontal split:', horizontalSplit);
    console.log('Vertical split:', verticalSplit);
    } catch (error) {
      console.error('Failed to initialize split.js:', error);
      // Fallback to manual resize if split.js fails
      setupManualResize();
    }
  }, 100); // Wait 100ms for split.js to load
}

/**
 * Fallback manual resize setup (if split.js fails)
 */
function setupManualResize() {
  console.log('Using manual resize fallback');
  // Simple CSS-based resize without JavaScript
  elements.leftPanel.style.flex = '1';
  elements.rightPanel.style.flex = '1';
  elements.top.style.flex = '1';
  elements.bottom.style.flex = '0 0 200px';
}

/**
 * Update log area height based on bottom panel size
 */
function updateLogAreaHeight() {
  // Use requestAnimationFrame for smooth updates
  requestAnimationFrame(() => {
    const bottomHeight = elements.bottom.offsetHeight;
    const controlsHeight = elements.bottom.querySelector('.controls').offsetHeight;
    const availableHeight = bottomHeight - controlsHeight - 20; // 20px padding
    
    // Set height without transition for immediate response
    elements.logArea.style.transition = 'none';
    elements.logArea.style.height = `${Math.max(100, availableHeight)}px`;
    
    // Re-enable transition after a short delay
    setTimeout(() => {
      elements.logArea.style.transition = 'all 0.3s ease';
    }, 50);
  });
}

/**
 * Setup resize observer for responsive log area
 */
function setupResizeObserver() {
  // Initial height calculation
  updateLogAreaHeight();
  
  // Observe bottom panel size changes
  const resizeObserver = new ResizeObserver(debounce(() => {
    updateLogAreaHeight();
  }, 100));
  
  resizeObserver.observe(elements.bottom);
  
  // Also observe window resize
  window.addEventListener('resize', debounce(() => {
    updateLogAreaHeight();
  }, 100));
}

/**
 * Setup clone progress listener
 */
function setupCloneProgressListener() {
  window.electronAPI.onCloneProgress((progress) => {
    if (progress.savedResource) {
      const fileName = progress.path ? progress.path.split('/').pop() : 'Unknown file';
      if (progress.status === 'skipped') {
        appendLog(`⏭️ Skipped: ${fileName} (${progress.reason || 'Already exists'})`);
      } else if (progress.status === 'downloaded') {
        appendLog(`📥 Downloaded: ${fileName}`);
      } else {
        appendLog(`📁 Saved: ${fileName}`);
      }
      
      // Update progress bar if progress data is available
      if (progress.progress) {
        showProgressBar(); // Ensure progress bar is visible
        updateProgressBar(progress.progress);
      }
    } else if (progress.cookiesApplied) {
      appendLog(`🍪 Applied ${progress.cookiesApplied} cookies`);
    } else {
      appendLog('[progress] ' + JSON.stringify(progress));
    }
  });
}

/**
 * Update progress bar with current progress data
 * @param {Object} progress - Progress data object
 */
function updateProgressBar(progress) {
  // Show progress container
  elements.progressContainer.style.display = 'block';
  
  // Update overall progress text and stats
  elements.progressText.textContent = `Processing files... ${progress.percentage}%`;
  elements.progressStats.textContent = `${progress.processed} files processed (${progress.downloaded} downloaded, ${progress.skipped} skipped)`;
  
  // Update overall progress bar fill
  elements.overallProgressFill.style.width = `${progress.percentage}%`;
  
  // Update current file progress if available
  if (progress.currentFile) {
    elements.currentFileText.textContent = `Downloading: ${progress.currentFile}`;
    elements.currentFileProgressFill.style.width = `${progress.currentFileProgress || 0}%`;
  } else {
    elements.currentFileText.textContent = 'Ready to download...';
    elements.currentFileProgressFill.style.width = '0%';
  }
  
  // Clear any existing timeout
  if (progressHideTimeout) {
    clearTimeout(progressHideTimeout);
    progressHideTimeout = null;
  }
  
  // Hide progress bar when complete, but wait 10 seconds after the last update
  if (progress.percentage >= 100) {
    progressHideTimeout = setTimeout(() => {
      elements.progressContainer.style.display = 'none';
      progressHideTimeout = null;
    }, 10000); // 10 seconds delay
  }
}

/**
 * Manually hide progress bar (useful for clearing timeouts)
 */
function hideProgressBar() {
  if (progressHideTimeout) {
    clearTimeout(progressHideTimeout);
    progressHideTimeout = null;
  }
  elements.progressContainer.style.display = 'none';
}

/**
 * Show progress bar and reset any existing timeout
 */
function showProgressBar() {
  if (progressHideTimeout) {
    clearTimeout(progressHideTimeout);
    progressHideTimeout = null;
  }
  elements.progressContainer.style.display = 'block';
}

/**
 * Extract domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.warn('Could not extract domain from URL:', url, error);
    return '';
  }
}

/**
 * Reset all tracking variables for a new domain
 */
function resetTrackingForNewDomain() {
  lastWatchedUrl = '';
  cloneQueue = [];
  
  // Clear any pending progress timeouts
  if (progressHideTimeout) {
    clearTimeout(progressHideTimeout);
    progressHideTimeout = null;
  }
  
  appendLog(`🔄 Reset all tracking variables for new domain`);
}

/**
 * Check if domain has changed and reset tracking if needed
 * @param {string} newUrl - New URL to check
 */
function checkDomainChange(newUrl) {
  const newDomain = extractDomain(newUrl);
  
  if (newDomain && newDomain !== currentDomain) {
    const oldDomain = currentDomain;
    currentDomain = newDomain;
    
    // Reset all tracking variables
    resetTrackingForNewDomain();
    
    appendLog(`🌐 Domain changed: ${oldDomain || 'none'} → ${newDomain}`);
    appendLog(`🔄 Reset tracking for new domain: ${newDomain}`);
    
    // If watch mode is active, restart monitoring for the new domain
    if (watchMode) {
      appendLog(`👁️ Restarting watch mode for new domain: ${newDomain}`);
      // The watch mode will continue with the new domain
    }
  }
}

/**
 * Sync URL from webview to input field
 */
function syncUrlFromWebview() {
  try {
    const currentUrl = elements.srcView.getURL();
    if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.startsWith('about:')) {
      // Only update if the URL is different to avoid unnecessary updates
      if (elements.srcUrl.value !== currentUrl) {
        elements.srcUrl.value = currentUrl;
        appendLog(`🔄 Synced URL from webview: ${currentUrl}`);
        
        // Check for domain change
        checkDomainChange(currentUrl);
      }
    }
  } catch (error) {
    console.warn('Could not sync URL from webview:', error);
  }
}

/**
 * Handle source URL navigation
 */
async function handleSourceNavigation() {
  let url = elements.srcUrl.value.trim();
  if (!url) return;
  
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  
  // Check for domain change when manually navigating
  checkDomainChange(url);
  
  // If watch mode is active and URL changed, reset button state but keep watch mode
  if (watchMode && url !== lastWatchedUrl) {
    // Reset button to normal state but preserve file count if available
    if (totalFiles > 0) {
      elements.cloneBtn.textContent = `👁️ Watch & Clone (${totalFiles} files)`;
    } else {
      elements.cloneBtn.textContent = '👁️ Watch & Clone';
    }
    elements.cloneBtn.style.background = '';
    
    // Reset last watched URL but keep watch mode active
    lastWatchedUrl = '';
    
    appendLog(`🔄 Manual navigation to: ${url}`);
    appendLog(`👁️ Watch mode remains active - ready to clone new URL`);
  }
  
  elements.srcView.src = url;
  
  // Save URL to localStorage
  saveLastUrl(url);
  
  // Analyze static files after page loads
  elements.srcView.addEventListener('dom-ready', async () => {
    try {
      const html = await elements.srcView.executeJavaScript('document.documentElement.outerHTML');
      const result = await window.electronAPI.analyzeStaticFiles({ html, baseUrl: url });
      
      if (result.staticFiles && result.staticFiles.length > 0) {
        totalFiles = result.staticFiles.length;
        appendLog(`✅ Found ${totalFiles} static files to download`);
        result.staticFiles.forEach(file => {
          appendLog(`📁 ${file.type.toUpperCase()}: ${file.url}`);
        });
        
        // Update button text to show total files
        elements.cloneBtn.textContent = `👁️ Watch & Clone (${totalFiles} files)`;
      } else {
        totalFiles = 0;
        appendLog('ℹ️ No local static files found (all external/CDN)');
        // Reset button text when no files found
        elements.cloneBtn.textContent = '👁️ Watch & Clone';
      }
      
      // Show skipped files info
      if (result.skippedFiles && result.skippedFiles.length > 0) {
        const base64Count = result.skippedFiles.filter(f => f.reason === 'base64 data URL').length;
        const externalCount = result.skippedFiles.filter(f => f.reason === 'external/cdn').length;
        
        if (base64Count > 0) {
          appendLog(`🚫 Skipped ${base64Count} base64 data URLs (not saved as files)`);
        }
        if (externalCount > 0) {
          appendLog(`🌐 Skipped ${externalCount} external/CDN files`);
        }
      }
    } catch (error) {
      appendLog('❌ Error analyzing static files: ' + error.message);
    }
  });
}

/**
 * Handle URL changes in srcView for auto-clone
 */
async function handleUrlChange(event) {
  const newUrl = event.url;
  if (!newUrl || newUrl.startsWith('about:')) return;
  
  // Always update the URL input field regardless of watch mode
  elements.srcUrl.value = newUrl;
  
  // Check for domain change and reset tracking if needed
  checkDomainChange(newUrl);
  
  // If watch mode is active and URL changed, reset button state but keep watch mode
  if (watchMode && newUrl !== lastWatchedUrl) {
    // Reset button to normal state but preserve file count if available
    if (totalFiles > 0) {
      elements.cloneBtn.textContent = `👁️ Watch & Clone (${totalFiles} files)`;
    } else {
      elements.cloneBtn.textContent = '👁️ Watch & Clone';
    }
    elements.cloneBtn.style.background = '';
    
    // Reset last watched URL but keep watch mode active
    lastWatchedUrl = '';
    
    appendLog(`🔄 URL changed: ${newUrl}`);
    appendLog(`👁️ Watch mode remains active - ready to clone new URL`);
    
    // Save new URL to localStorage
    saveLastUrl(newUrl);
    
    // Don't auto-clone - user needs to manually click Watch & Clone again
    return;
  }
  
  // Only proceed with auto-clone logic if watch mode is enabled and URL hasn't changed
  if (!watchMode) return;
  
  if (newUrl === lastWatchedUrl) return;
  
  lastWatchedUrl = newUrl;
  appendLog(`🔄 URL changed: ${newUrl}`);
  
  // Save new URL to localStorage
  saveLastUrl(newUrl);
  
  // Auto-clone the new page
  await autoClonePage(newUrl);
}

/**
 * Auto-clone a page when URL changes
 */
async function autoClonePage(url) {
  const outputDir = elements.outPath.value.trim();
  if (!outputDir) {
    appendLog('⚠️ No output folder selected for auto-clone');
    return;
  }
  
  // Generate filename from pathname
  let filename = 'index';
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname || '/';
    
    if (pathname === '/' || pathname === '') {
      filename = 'index';
    } else {
      // Remove leading slash and replace slashes with underscores
      filename = pathname.replace(/^\//, '').replace(/\//g, '_');
      // Remove file extension if present
      filename = filename.replace(/\.[^/.]+$/, '');
      if (!filename) filename = 'index';
    }
  } catch (error) {
    appendLog('⚠️ Error parsing URL for filename: ' + error.message);
    filename = 'index';
  }
  
  // Add .html extension if not present
  if (!filename.toLowerCase().endsWith('.html')) {
    filename += '.html';
  }
  
  appendLog(`🤖 Auto-cloning: ${url} → ${filename}`);
  
  try {
    // Get cookies from Electron for this URL
    const cookies = await window.electronAPI.getCookies(url);
    
    // Get captured network data for enhanced cloning
    const networkData = await getCapturedNetworkData();
    
    const result = await window.electronAPI.startClone({ 
      url, 
      outputDir, 
      filename, 
      cookies,
      networkData // Pass captured network data to the clone worker
    });
    
    appendLog(`✅ Auto-clone completed: ${result.savedRelativePath}`);
    
    // Auto-navigate to cloned content if server is running
    if (serverRunning) {
      const port = elements.portInput.value || '8080';
      const loadUrl = `http://localhost:${port}/${result.savedRelativePath}`;
      elements.dstUrl.value = loadUrl;
      handleDestinationNavigation();
    }
    
  } catch (error) {
    appendLog('❌ Auto-clone error: ' + error);
  }
}

/**
 * Test server connection
 */
async function testServerConnection(baseUrl) {
  try {
    const testUrl = `${baseUrl}/test`;
    appendLog(`Testing server connection: ${testUrl}`);
    
    const response = await fetch(testUrl);
    if (response.ok) {
      const data = await response.json();
      appendLog(`✅ Server test successful: ${data.message}`);
    } else {
      appendLog(`❌ Server test failed: HTTP ${response.status}`);
    }
  } catch (error) {
    appendLog(`❌ Server test error: ${error.message}`);
  }
}

/**
 * Handle test server button click
 */
async function handleTestServer() {
  const port = elements.portInput.value || '8080';
  const testUrl = `http://localhost:${port}`;
  await testServerConnection(testUrl);
}

/**
 * Handle destination URL navigation
 */
function handleDestinationNavigation() {
  let url = elements.dstUrl.value.trim();
  if (!url) {
    // Default to localhost with current port
    const port = elements.portInput.value || '8080';
    url = `http://localhost:${port}`;
  }
  
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  
  // Add error handling for webview navigation
  elements.dstView.addEventListener('did-fail-load', (event) => {
    appendLog(`❌ Failed to load ${url}: ${event.errorDescription || 'Unknown error'}`);
  });
  
  elements.dstView.addEventListener('did-finish-load', () => {
    appendLog(`✅ Successfully loaded: ${url}`);
  });
  
  elements.dstView.src = url;
  appendLog(`Navigating to: ${url}`);
}

/**
 * Handle refresh button
 */
function handleRefresh() {
  if (elements.dstView.src && elements.dstView.src !== 'about:blank') {
    elements.dstView.reload();
    appendLog('Refreshed destination view');
  } else {
    handleDestinationNavigation();
  }
}

/**
 * Handle output folder selection
 */
async function handleChooseOutput() {
  const path = await window.electronAPI.chooseFolder();
  if (path) {
    elements.outPath.value = path;
    elements.outPath.style.borderColor = '#10b981'; // Green border
    appendLog(`✅ Output folder selected: ${path}`);
    
    // Save output directory to localStorage
    localStorage.setItem(STORAGE_KEYS.LAST_OUTPUT_DIR, path);
  } else {
    elements.outPath.style.borderColor = '#ef4444'; // Red border
    appendLog('❌ No output folder selected');
  }
}

/**
 * Handle server toggle
 */
async function handleToggleServer() {
  const dir = elements.outPath.value || null;
  const port = parseInt(elements.portInput.value || '8080', 10);
  
  try {
    const result = await window.electronAPI.toggleServer({ dir, port });
    serverRunning = result.running;
    elements.toggleServerBtn.textContent = serverRunning ? 'Stop Server' : 'Start Server';
    
    if (serverRunning) {
      // Update port input with actual port used
      if (result.port && result.port !== result.originalPort) {
        elements.portInput.value = result.port;
        appendLog(`⚠️ Port ${result.originalPort} was in use, using port ${result.port} instead`);
      }
      appendLog(`Server started on ${result.url}`);
      
      // Auto-navigate to static server when started
      if (result.url) {
        elements.dstUrl.value = result.url;
        // Test server connection first
        await testServerConnection(result.url);
        handleDestinationNavigation();
      }
    } else {
      appendLog(`Server stopped`);
    }
  } catch (error) {
    appendLog('Server toggle error: ' + error);
  }
}

/**
 * Capture all fetch/XHR requests and existing resources
 * @param {string} url - Current URL to capture resources for
 */
async function captureNetworkRequests(url) {
  try {
    appendLog('🔍 Capturing network requests and existing resources...');
    
    // Execute JavaScript in the webview to capture network data
    const networkData = await elements.srcView.executeJavaScript(`
      (function() {
        const capturedRequests = [];
        const capturedResources = [];
        
        // Capture existing resources from performance API
        try {
          const resources = performance.getEntriesByType('resource');
          resources.forEach(resource => {
            capturedResources.push({
              name: resource.name,
              type: resource.initiatorType || 'unknown',
              duration: resource.duration,
              size: resource.transferSize || 0,
              startTime: resource.startTime,
              url: resource.name
            });
          });
        } catch (error) {
          console.warn('Error getting performance resources:', error);
        }
        
        // Override fetch to capture requests
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          const url = args[0];
          const options = args[1] || {};
          
          capturedRequests.push({
            type: 'fetch',
            url: url,
            method: options.method || 'GET',
            headers: options.headers || {},
            timestamp: Date.now()
          });
          
          return originalFetch.apply(this, args);
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
              capturedRequests.push({
                type: 'xhr',
                url: this._url,
                method: this._method || 'GET',
                timestamp: Date.now()
              });
            }
            return originalSend.apply(this, args);
          };
          
          return xhr;
        };
        
        // Store the captured data globally for later retrieval
        window._capturedNetworkData = {
          requests: capturedRequests,
          resources: capturedResources,
          timestamp: Date.now()
        };
        
        return {
          requests: capturedRequests,
          resources: capturedResources,
          timestamp: Date.now()
        };
      })();
    `);
    
    // Log captured data
    if (networkData.resources && networkData.resources.length > 0) {
      appendLog(`📊 Found ${networkData.resources.length} existing resources`);
      networkData.resources.forEach(resource => {
        appendLog(`  📄 ${resource.type}: ${resource.name}`);
      });
    }
    
    if (networkData.requests && networkData.requests.length > 0) {
      appendLog(`🌐 Captured ${networkData.requests.length} network requests`);
      networkData.requests.forEach(request => {
        appendLog(`  🔗 ${request.type.toUpperCase()}: ${request.method} ${request.url}`);
      });
    }
    
    // Store captured data for potential use in cloning
    window._networkCaptureData = networkData;
    
    appendLog('✅ Network capture completed');
    
    // Return the captured data for immediate use
    return networkData;
    
  } catch (error) {
    appendLog('❌ Error capturing network requests: ' + error.message);
    console.error('Network capture error:', error);
  }
}

/**
 * Retrieve captured network data from the webview
 * @returns {Object} Captured network data
 */
async function getCapturedNetworkData() {
  try {
    const networkData = await elements.srcView.executeJavaScript(`
      (function() {
        return window._capturedNetworkData || {
          requests: [],
          resources: [],
          timestamp: Date.now()
        };
      })();
    `);
    
    return networkData;
  } catch (error) {
    console.warn('Error retrieving captured network data:', error);
    return { requests: [], resources: [], timestamp: Date.now() };
  }
}

/**
 * Handle Watch & Clone operation
 */
async function handleClone() {
  const currentURL = elements.srcView.getURL?.() || elements.srcUrl.value.trim();
  if (!currentURL) {
    appendLog('❌ No source URL');
    showAlert('❌ Please enter a source URL first!');
    return;
  }
  
  // Validate URL format
  try {
    new URL(currentURL);
  } catch (error) {
    appendLog('❌ Invalid URL format');
    showAlert('❌ Invalid URL format!\n\nPlease enter a valid URL (e.g., https://example.com)');
    return;
  }
  
  const outputDir = elements.outPath.value.trim();
  if (!outputDir) {
    appendLog('❌ No output folder selected');
    showAlert('❌ Please choose an output folder first!\n\nClick the "Choose" button to select a folder.');
    return;
  }
  
  // Toggle watch mode
  if (!watchMode) {
    // Start watching
    watchMode = true;
    lastWatchedUrl = currentURL;
    elements.cloneBtn.textContent = 'Stop Watching';
    elements.cloneBtn.style.background = '#ef4444';
    appendLog('🔍 Watch mode ON - Auto-cloning enabled');
    
    // Capture all fetch/XHR requests and existing resources
    await captureNetworkRequests(currentURL);
    
    // Check if server is running for better UX
    if (!serverRunning) {
      const startServer = confirm('⚠️ Static server is not running.\n\nDo you want to start the server now to preview the cloned content?\n\nClick "OK" to start server, or "Cancel" to continue without server.');
      if (startServer) {
        await handleToggleServer();
      }
    }
    
    // Clone current page immediately
    await autoClonePage(currentURL);
    
  } else {
    // Stop watching
    watchMode = false;
    lastWatchedUrl = '';
    
    // Preserve file count in button text
    if (totalFiles > 0) {
      elements.cloneBtn.textContent = `👁️ Watch & Clone (${totalFiles} files)`;
    } else {
      elements.cloneBtn.textContent = '👁️ Watch & Clone';
    }
    elements.cloneBtn.style.background = '';
    appendLog('⏹️ Watch mode OFF - Auto-cloning disabled');
  }
}

/**
 * Handle progress container toggle
 */
function handleProgressToggle() {
  progressCollapsed = !progressCollapsed;
  
  if (progressCollapsed) {
    elements.progressContent.classList.add('collapsed');
    elements.progressToggle.textContent = '+';
    elements.progressToggle.classList.add('collapsed');
  } else {
    elements.progressContent.classList.remove('collapsed');
    elements.progressToggle.textContent = '−';
    elements.progressToggle.classList.remove('collapsed');
  }
}

/**
 * Handle dropdown toggle
 */
function handleClearDropdownToggle() {
  const isVisible = elements.clearDropdownMenu.style.display !== 'none';
  elements.clearDropdownMenu.style.display = isVisible ? 'none' : 'block';
}

/**
 * Handle clear specific file types
 * @param {string} fileType - Type of files to clear (js, css, html, images)
 */
async function handleClearSpecific(fileType) {
  const outputDir = elements.outPath.value.trim();
  if (!outputDir) {
    appendLog('❌ No output folder selected');
    showAlert('❌ Please choose an output folder first!');
    return;
  }
  
  // Close dropdown
  elements.clearDropdownMenu.style.display = 'none';
  
  const fileTypeNames = {
    'js': 'JavaScript files',
    'css': 'CSS files', 
    'html': 'HTML files',
    'images': 'Image files'
  };
  
  const fileExtensions = {
    'js': ['.js', '.mjs', '.jsx', '.ts', '.tsx'],
    'css': ['.css', '.scss', '.sass', '.less'],
    'html': ['.html', '.htm'],
    'images': ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico']
  };
  
  const confirmed = confirm(
    `⚠️ Clear ${fileTypeNames[fileType]}?\n\n` +
    `This will delete all ${fileTypeNames[fileType]} in the output folder.\n\n` +
    `Folder: ${outputDir}\n\n` +
    `This action cannot be undone. Are you sure you want to continue?\n\n` +
    `Click "OK" to delete ${fileTypeNames[fileType]}, or "Cancel" to abort.`
  );
  
  if (!confirmed) {
    appendLog(`❌ Clear ${fileTypeNames[fileType]} cancelled by user`);
    return;
  }
  
  try {
    // Disable clear buttons during operation
    const clearButtons = [elements.clearBtn, elements.clearDropdown, elements.clearJsBtn, elements.clearCssBtn, elements.clearHtmlBtn, elements.clearImagesBtn];
    clearButtons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.6';
    });
    
    appendLog(`🗑️ Clearing ${fileTypeNames[fileType]} from: ${outputDir}`);
    
    // Call Electron API to clear specific file types
    await window.electronAPI.clearSpecificFiles(outputDir, fileExtensions[fileType]);
    
    appendLog(`✅ ${fileTypeNames[fileType]} cleared successfully`);
    showAlert(`✅ ${fileTypeNames[fileType]} cleared successfully!\n\nAll ${fileTypeNames[fileType]} have been deleted.`);
    
  } catch (error) {
    appendLog(`❌ Clear ${fileTypeNames[fileType]} error: ` + error);
    showAlert(`❌ Failed to clear ${fileTypeNames[fileType]}!\n\nError: ${error}\n\nPlease check the logs for more details.`);
  } finally {
    // Re-enable clear buttons
    const clearButtons = [elements.clearBtn, elements.clearDropdown, elements.clearJsBtn, elements.clearCssBtn, elements.clearHtmlBtn, elements.clearImagesBtn];
    clearButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '';
    });
  }
}

/**
 * Handle clear output folder operation
 */
async function handleClearOutput() {
  const outputDir = elements.outPath.value.trim();
  if (!outputDir) {
    appendLog('❌ No output folder selected');
    showAlert('❌ Please choose an output folder first!');
    return;
  }
  
  // Confirmation dialog with double confirmation
  const confirmed = confirm(
    `⚠️ WARNING: This will delete ALL files in the output folder!\n\n` +
    `Folder: ${outputDir}\n\n` +
    `This action cannot be undone. Are you sure you want to continue?\n\n` +
    `Click "OK" to delete all files, or "Cancel" to abort.`
  );
  
  if (confirmed) {
    // Double confirmation for safety
    const doubleConfirmed = confirm(
      `🚨 FINAL WARNING: You are about to permanently delete ALL files!\n\n` +
      `This is your last chance to cancel.\n\n` +
      `Click "OK" to proceed with deletion, or "Cancel" to abort.`
    );
    
    if (!doubleConfirmed) {
      appendLog('❌ Clear operation cancelled by user (double confirmation)');
      return;
    }
  }
  
  if (!confirmed) {
    appendLog('❌ Clear operation cancelled by user');
    return;
  }
  
  try {
    // Disable clear button during operation
    elements.clearBtn.disabled = true;
    elements.clearBtn.textContent = 'Clearing...';
    elements.clearBtn.style.background = '#6b7280';
    elements.clearBtn.style.color = '#ffffff';
    
    appendLog(`🗑️ Clearing output folder: ${outputDir}`);
    
    // Call Electron API to clear the folder
    await window.electronAPI.clearOutputFolder(outputDir);
    
    appendLog('✅ Output folder cleared successfully');
    showAlert('✅ Output folder cleared successfully!\n\nAll files have been deleted.');
    
  } catch (error) {
    appendLog('❌ Clear error: ' + error);
    showAlert(`❌ Failed to clear output folder!\n\nError: ${error}\n\nPlease check the logs for more details.`);
  } finally {
    // Re-enable clear button
    elements.clearBtn.disabled = false;
    elements.clearBtn.textContent = 'Clear';
    elements.clearBtn.style.background = '';
    elements.clearBtn.style.color = '';
  }
}

/**
 * Handle clear saved settings
 */
function handleClearSettings() {
  const confirmed = confirm(
    `🗑️ Clear all saved settings?\n\n` +
    `This will clear:\n` +
    `• Last URL\n` +
    `• Last output directory\n` +
    `• Last port\n\n` +
    `Click "OK" to clear, or "Cancel" to keep settings.`
  );
  
  if (confirmed) {
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEYS.LAST_URL);
    localStorage.removeItem(STORAGE_KEYS.LAST_OUTPUT_DIR);
    localStorage.removeItem(STORAGE_KEYS.LAST_PORT);
    
    // Clear form fields
    elements.srcUrl.value = '';
    elements.outPath.value = '';
    elements.portInput.value = '8080';
    
    // Reset visual states
    elements.outPath.style.borderColor = '';
    
    appendLog('🗑️ All saved settings cleared');
    showAlert('✅ All saved settings have been cleared!');
  } else {
    appendLog('❌ Clear settings cancelled by user');
  }
}

/**
 * Show alert with custom title
 * @param {string} message - Alert message
 * @param {string} title - Alert title (default: "Alert")
 */
function showAlert(message, title = 'Alert') {
  // Set window title before showing alert
  document.title = title;
  showAlert(message);
  // Reset window title after alert
  document.title = 'Web Cloner';
}

/**
 * Append log message to the log area
 * @param {string} message - Log message to append
 */
function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logItem = document.createElement('div');
  logItem.className = 'log-item';
  logItem.innerHTML = `<span class="log-time">${timestamp}</span> <span class="log-message">${message}</span>`;
  
  // Add to top of log area
  elements.logArea.insertBefore(logItem, elements.logArea.firstChild);
  
  // Limit to 100 log items to prevent memory issues
  const logItems = elements.logArea.querySelectorAll('.log-item');
  if (logItems.length > 100) {
    elements.logArea.removeChild(logItems[logItems.length - 1]);
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
