/**
 * Main renderer process logic for the Electron app
 */

// Import EventEmitter, CaptureConfig, AssetValidator, ErrorHandler, DependencyGraph, and PriorityQueue
import { getEventEmitter } from '../utils/event-emitter.js';
import { getCaptureConfig } from '../utils/capture-config.js';
import { getAssetValidator } from '../utils/asset-validator.js';
import { getErrorHandler } from '../utils/error-handler.js';
import { getDependencyGraph } from '../utils/dependency-graph.js';
import { getPriorityQueue } from '../utils/priority-queue.js';

// Get event emitter, config, validator, error handler, dependency graph, and priority queue instances
const eventEmitter = getEventEmitter();
const captureConfig = getCaptureConfig('captureSettings');
const assetValidator = getAssetValidator();
const errorHandler = getErrorHandler();
const dependencyGraph = getDependencyGraph();
const priorityQueue = getPriorityQueue();

// Check if electronAPI is available
function checkElectronAPI() {
  return typeof window.electronAPI !== 'undefined';
}

// Set up global error handler
window.addEventListener('error', (event) => {
  errorHandler.handle(event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  }, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  errorHandler.handle(event.reason, {
    type: 'unhandledrejection'
  }, 'error');
});

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
  currentFileProgressFill: document.getElementById('currentFileProgressFill'),
  overallProgressText: document.getElementById('overallProgressText'),
  progressSpeed: document.getElementById('progressSpeed'),
  progressETA: document.getElementById('progressETA'),
  progressTimeElapsed: document.getElementById('progressTimeElapsed'),
  recentAssetsContainer: document.getElementById('recentAssetsContainer'),
  deviceType: document.getElementById('deviceType'),
  filterBtn: document.getElementById('filterBtn'),
  filterMenu: document.getElementById('filterMenu'),
  filterImages: document.getElementById('filterImages'),
  filterMedia: document.getElementById('filterMedia'),
  filterCssJs: document.getElementById('filterCssJs'),
  crawlDepth: document.getElementById('crawlDepth'),
  sameDomain: document.getElementById('sameDomain'),
  assetsDashboardBtn: document.getElementById('assetsDashboardBtn'),
  assetsDashboardModal: document.getElementById('assetsDashboardModal'),
  closeAssetsDashboard: document.getElementById('closeAssetsDashboard'),
  statTotalAssets: document.getElementById('statTotalAssets'),
  statDownloaded: document.getElementById('statDownloaded'),
  statMissing: document.getElementById('statMissing'),
  statTotalSize: document.getElementById('statTotalSize'),
  breakdownHtml: document.getElementById('breakdownHtml'),
  breakdownCss: document.getElementById('breakdownCss'),
  breakdownJs: document.getElementById('breakdownJs'),
  breakdownImages: document.getElementById('breakdownImages'),
  breakdownFonts: document.getElementById('breakdownFonts'),
  breakdownMedia: document.getElementById('breakdownMedia'),
  breakdownWorkers: document.getElementById('breakdownWorkers'),
  breakdownSourceMaps: document.getElementById('breakdownSourceMaps'),
  refreshAssetsBtn: document.getElementById('refreshAssetsBtn'),
  exportAssetsBtn: document.getElementById('exportAssetsBtn'),
  scanMissingBtn: document.getElementById('scanMissingBtn'),
  validateAssetsBtn: document.getElementById('validateAssetsBtn'),
  dependencyGraphBtn: document.getElementById('dependencyGraphBtn'),
  assetPreviewModal: document.getElementById('assetPreviewModal'),
  assetPreviewTitle: document.getElementById('assetPreviewTitle'),
  assetPreviewContent: document.getElementById('assetPreviewContent'),
  closeAssetPreview: document.getElementById('closeAssetPreview'),
  contextMenu: document.getElementById('contextMenu'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  devToolsBtn: document.getElementById('devToolsBtn'),
  srcUrlDropZone: document.getElementById('srcUrlDropZone'),
  outPathDropZone: document.getElementById('outPathDropZone'),
  assetListContainer: document.getElementById('assetListContainer'),
  assetSearchInput: document.getElementById('assetSearchInput'),
  assetTypeFilter: document.getElementById('assetTypeFilter'),
  assetStatusFilter: document.getElementById('assetStatusFilter'),
  assetSizeFilter: document.getElementById('assetSizeFilter'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsModal: document.getElementById('closeSettingsModal'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  resetSettingsBtn: document.getElementById('resetSettingsBtn'),
  settingCaptureServiceWorkers: document.getElementById('settingCaptureServiceWorkers'),
  settingCaptureWebWorkers: document.getElementById('settingCaptureWebWorkers'),
  settingExtractBlobUrls: document.getElementById('settingExtractBlobUrls'),
  settingExtractDataUrls: document.getElementById('settingExtractDataUrls'),
  settingDownloadSourceMaps: document.getElementById('settingDownloadSourceMaps'),
  settingCaptureIframes: document.getElementById('settingCaptureIframes'),
  settingDownloadMetaFiles: document.getElementById('settingDownloadMetaFiles'),
  settingProcessCssImports: document.getElementById('settingProcessCssImports'),
  settingWaitForLazyImages: document.getElementById('settingWaitForLazyImages'),
  settingScrollToTrigger: document.getElementById('settingScrollToTrigger'),
  settingLazyWaitTime: document.getElementById('settingLazyWaitTime'),
  settingIncludeCDN: document.getElementById('settingIncludeCDN'),
  settingIncludeExternal: document.getElementById('settingIncludeExternal'),
  settingDownloadDuplicates: document.getElementById('settingDownloadDuplicates')
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
let visitedUrls = new Set();
let crawlQueue = [];
let isCrawling = false;

// Enhanced progress tracking
let progressTracking = {
  startTime: null,
  lastUpdateTime: null,
  lastBytesDownloaded: 0,
  totalBytesDownloaded: 0,
  totalBytes: 0,
  recentAssets: [],
  downloadSpeed: 0,
  averageSpeed: 0
};

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
  setupWebviewListeners(); // Set up webview listeners once
  setupResizePanels();
  setupCloneProgressListener();
  setupResizeObserver();
  restoreLastSettings();
  setupToastContainer();
}

/**
 * Setup Toast Container
 */
function setupToastContainer() {
  if (!document.querySelector('.toast-container')) {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

/**
 * Show a toast notification
 * @param {string} message - Message to show
 * @param {string} type - 'info', 'success', 'error', 'warning'
 * @param {number} duration - Duration in ms
 */
function showToast(message, type = 'info', duration = 3000) {
  // Emit toast event
  eventEmitter.emit('toast', { message, type, duration });
  
  const container = document.querySelector('.toast-container');
  if (!container) return; // Should not happen

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  // Icon based on type
  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };

  toast.innerHTML = `
    <span style="display:flex; align-items:center; gap:8px">
      <span style="font-size:1.2em">${icons[type] || 'ℹ️'}</span>
      <span>${message}</span>
    </span>
  `;

  // Close button (optional, but nice for long toasts)
  // toast.onclick = () => removeToast(toast);

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      if (toast.parentElement) {
        toast.remove();
      }
    });
  }, duration);
}

/**
 * Set loading state for a button
 * @param {HTMLElement} btn - Button element
 * @param {boolean} isLoading - Loading state
 * @param {string} originalText - Text to restore (optional)
 * @param {string} loadingText - Text to show while loading
 */
function setLoadingState(btn, isLoading, originalText = null, loadingText = 'Loading...') {
  if (isLoading) {
    if (originalText) btn.dataset.originalText = originalText;
    btn.disabled = true;
    btn.innerHTML = `<span class="fn-spinner"></span> ${loadingText}`;
    btn.classList.add('btn-loading');
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || originalText || btn.textContent;
    btn.classList.remove('btn-loading');
  }
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
    
    // Auto-enable watch mode if URL is restored
    if (!watchMode && lastUrl && !lastUrl.startsWith('about:')) {
      watchMode = true;
      lastWatchedUrl = lastUrl;
      appendLog('👁️ Watch mode auto-enabled - restored URL detected');
    }
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
  
  // Initialize theme
  initializeTheme();
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Source URL navigation
  if (elements.srcGo) {
    elements.srcGo.addEventListener('click', (e) => {
      e.preventDefault();
      handleSourceNavigation();
    });
  } else {
    console.error('srcGo button not found');
  } 

  // Allow editing srcUrl
  if (elements.srcUrl) {
    elements.srcUrl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSourceNavigation();
      }
    });
  }

  // Add click event to sync URL from webview
  elements.srcUrl.addEventListener('click', () => {
    syncUrlFromWebview();
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      // Allow Esc to close modals even when typing
      if (e.key === 'Escape') {
        handleKeyboardShortcut(e);
      }
      return;
    }

    handleKeyboardShortcut(e);
  });

  /**
   * Handle keyboard shortcuts
   */
  function handleKeyboardShortcut(e) {
    const isModifier = e.ctrlKey || e.metaKey;
    
    // Ctrl/Cmd + Enter: Start Clone
    if (isModifier && e.key === 'Enter') {
      if (elements.cloneBtn && !elements.cloneBtn.disabled) {
        e.preventDefault();
        handleClone();
        showToast('🚀 Started Clone', 'info');
      }
    }
    // Ctrl/Cmd + R: Refresh Destination
    else if (isModifier && e.key === 'r') {
      e.preventDefault();
      handleRefresh();
      showToast('🔄 Refreshing preview...', 'info');
    }
    // Ctrl/Cmd + L: Focus Source URL
    else if (isModifier && e.key === 'l') {
      e.preventDefault();
      elements.srcUrl.focus();
      elements.srcUrl.select();
    }
    // Ctrl/Cmd + S: Save Settings
    else if (isModifier && e.key === 's') {
      e.preventDefault();
      if (elements.settingsModal && elements.settingsModal.style.display !== 'none') {
        handleSaveSettings();
      } else {
        showToast('Open Settings panel first (⚙️ Settings)', 'info');
      }
    }
    // Ctrl/Cmd + F: Focus Asset Search
    else if (isModifier && e.key === 'f') {
      e.preventDefault();
      if (elements.assetsDashboardModal && elements.assetsDashboardModal.style.display !== 'none') {
        elements.assetSearchInput?.focus();
      } else {
        // Open assets dashboard if not open
        handleAssetsDashboard();
        setTimeout(() => elements.assetSearchInput?.focus(), 100);
      }
    }
    // Ctrl/Cmd + E: Export Assets
    else if (isModifier && e.key === 'e') {
      e.preventDefault();
      if (elements.assetsDashboardModal && elements.assetsDashboardModal.style.display !== 'none') {
        handleExportAssets();
      } else {
        handleAssetsDashboard();
        setTimeout(() => handleExportAssets(), 100);
      }
    }
    // Esc: Close Modals
    else if (e.key === 'Escape') {
      // Close assets dashboard
      if (elements.assetsDashboardModal && elements.assetsDashboardModal.style.display !== 'none') {
        e.preventDefault();
        handleCloseAssetsDashboard();
      }
      // Close settings modal
      else if (elements.settingsModal && elements.settingsModal.style.display !== 'none') {
        e.preventDefault();
        handleCloseSettingsModal();
      }
    }
  }

  // Save port when changed
  if (elements.portInput) {
    elements.portInput.addEventListener('change', (e) => {
      localStorage.setItem(STORAGE_KEYS.LAST_PORT, e.target.value);
      appendLog(`💾 Saved port: ${e.target.value}`);
    });
  }

  // Watch for URL changes in srcView for auto-clone
  if (elements.srcView) {
    elements.srcView.addEventListener('did-navigate', handleUrlChange);
    elements.srcView.addEventListener('did-navigate-in-page', handleUrlChange);
    elements.srcView.addEventListener('did-finish-load', handleUrlChange);
    elements.srcView.addEventListener('did-frame-navigate', handleUrlChange);
  }

  // Destination URL navigation
  if (elements.dstGo) {
    elements.dstGo.addEventListener('click', handleDestinationNavigation);
  }
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', handleRefresh);
  }

  // Allow editing dstUrl
  elements.dstUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleDestinationNavigation();
    }
  });

  // Output folder selection
  if (elements.chooseOut) {
    elements.chooseOut.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleChooseOutput();
    });
  }

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
  
  // Asset Dashboard
  elements.assetsDashboardBtn.addEventListener('click', handleAssetsDashboard);
  elements.closeAssetsDashboard.addEventListener('click', handleCloseAssetsDashboard);
  elements.refreshAssetsBtn.addEventListener('click', handleRefreshAssets);
  elements.exportAssetsBtn.addEventListener('click', handleExportAssets);
  elements.scanMissingBtn.addEventListener('click', handleScanMissing);
  elements.validateAssetsBtn.addEventListener('click', handleValidateAssets);
  elements.dependencyGraphBtn.addEventListener('click', handleDependencyGraph);
  
  // Asset List filters
  elements.assetSearchInput.addEventListener('input', handleAssetListFilter);
  elements.assetTypeFilter.addEventListener('change', handleAssetListFilter);
  elements.assetStatusFilter.addEventListener('change', handleAssetListFilter);
  elements.assetSizeFilter.addEventListener('change', handleAssetListFilter);
  
  // Settings Panel
  elements.settingsBtn.addEventListener('click', handleSettingsModal);
  elements.closeSettingsModal.addEventListener('click', handleCloseSettingsModal);
  elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
  elements.resetSettingsBtn.addEventListener('click', handleResetSettings);
  
  // Close settings modal when clicking outside
  if (elements.settingsModal) {
    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) {
        handleCloseSettingsModal();
      }
    });
  }
  
  // Close modal when clicking outside
  if (elements.assetsDashboardModal) {
    elements.assetsDashboardModal.addEventListener('click', (e) => {
      if (e.target === elements.assetsDashboardModal) {
        handleCloseAssetsDashboard();
      }
    });
  }
  
  // Asset Preview
  if (elements.closeAssetPreview) {
    elements.closeAssetPreview.addEventListener('click', handleCloseAssetPreview);
  }
  if (elements.assetPreviewModal) {
    elements.assetPreviewModal.addEventListener('click', (e) => {
      if (e.target === elements.assetPreviewModal) {
        handleCloseAssetPreview();
      }
    });
  }
  
  // Expose functions to global scope for onclick handlers
  window.handleAssetPreview = handleAssetPreview;
  window.handleCopyAssetUrl = handleCopyAssetUrl;
  window.handleAssetContextMenu = handleAssetContextMenu;
  window.handleContextMenuAction = handleContextMenuAction;
  
  // Close context menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu') && !e.target.closest('.asset-list-item')) {
      hideContextMenu();
    }
  });
  
  // Close context menu on scroll
  if (elements.assetListContainer) {
    elements.assetListContainer.addEventListener('scroll', hideContextMenu);
  }
  
  // Theme toggle
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener('click', handleThemeToggle);
  }
  
  // DevTools toggle
  if (elements.devToolsBtn) {
    elements.devToolsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleToggleDevTools();
    });
  }
  
  // Drag & Drop
  setupDragAndDrop();

  // Filter menu toggle
  elements.filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = elements.filterMenu.style.display !== 'none';
    elements.filterMenu.style.display = isVisible ? 'none' : 'block';
  });

  // Close filter menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#filterBtn') && !e.target.closest('#filterMenu')) {
      elements.filterMenu.style.display = 'none';
    }
  });

  // Filter checkboxes prevent menu closing
  if (elements.filterMenu) {
    elements.filterMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
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
      // Make sure parent container (#app) is ready
      const appContainer = document.getElementById('app');
      if (appContainer && elements.top && elements.bottom) {
        // Force initial heights to ensure Split.js can calculate
        const appHeight = appContainer.offsetHeight || window.innerHeight;
        if (!elements.top.style.height && !elements.bottom.style.height) {
          elements.top.style.height = `${appHeight * 0.7}px`;
          elements.bottom.style.height = `${appHeight * 0.3}px`;
        }
        
        const verticalSplit = window.Split([elements.top, elements.bottom], {
          direction: 'vertical',
          sizes: [70, 30],
          minSize: [200, 100],
          gutterSize: 8,
          cursor: 'ns-resize',
          snapOffset: 0,
          dragInterval: 1,
          onDrag: () => {
            // Update log area height after vertical resize
            updateLogAreaHeight();
          },
          onDragStart: () => {
            console.log('Vertical split drag started');
            // Make gutter more visible during drag
            document.querySelectorAll('.gutter.gutter-vertical').forEach(g => {
              g.style.background = 'var(--accent-primary)';
              g.style.height = '10px';
            });
          },
          onDragEnd: () => {
            console.log('Vertical split drag ended');
            // Reset gutter style
            document.querySelectorAll('.gutter.gutter-vertical').forEach(g => {
              g.style.background = '';
              g.style.height = '';
            });
          }
        });
        
        // Store split instance
        window.verticalSplit = verticalSplit;
        
        // Debug: Log gutter element after a delay
        setTimeout(() => {
          const gutters = document.querySelectorAll('.gutter.gutter-vertical');
          console.log('Vertical gutters found:', gutters.length);
          gutters.forEach((g, i) => {
            const style = window.getComputedStyle(g);
            console.log(`Gutter ${i}:`, {
              element: g,
              height: g.offsetHeight,
              width: g.offsetWidth,
              zIndex: style.zIndex,
              display: style.display,
              position: style.position,
              top: g.offsetTop,
              left: g.offsetLeft
            });
          });
        }, 300);
      } else {
        console.warn('Vertical split elements not found:', {
          appContainer: !!appContainer,
          top: !!elements.top,
          bottom: !!elements.bottom
        });
      }

      // Store split instances for potential cleanup
      window.horizontalSplit = horizontalSplit;

      // Log success
      if (window.verticalSplit) {
        console.log('Split.js initialized successfully - both splits active');
      } else {
        console.warn('Split.js: Vertical split not initialized');
      }
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
 * Show desktop notification
 */
function showDesktopNotification(title, body, options = {}) {
  // Check if browser supports notifications
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return;
  }
  
  // Check if permission is granted
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: options.icon || undefined,
      badge: options.badge || undefined,
      tag: options.tag || 'web-cloner',
      ...options
    });
  } else if (Notification.permission !== 'denied') {
    // Request permission
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, {
          body,
          icon: options.icon || undefined,
          badge: options.badge || undefined,
          tag: options.tag || 'web-cloner',
          ...options
        });
      }
    });
  }
}

/**
 * Request notification permission on app start
 */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    // Don't request immediately, wait for user interaction
    // Will request when first notification is needed
  }
}

/**
 * Update progress bar with current progress data
 * @param {Object} progress - Progress data object
 */
function updateProgressBar(progress) {
  // Emit progress event
  eventEmitter.emit('progress', progress);
  
  // Initialize progress tracking
  if (!progressTracking.startTime) {
    progressTracking.startTime = Date.now();
    progressTracking.lastUpdateTime = Date.now();
    eventEmitter.emit('clone:start', { startTime: progressTracking.startTime });
  }

  // Show progress container
  elements.progressContainer.style.display = 'block';

  const percentage = progress.percentage || 0;
  
  // Update overall progress text and stats
  elements.progressText.textContent = `Processing files... ${percentage}%`;
  elements.progressStats.textContent = `${progress.processed || 0} files processed (${progress.downloaded || 0} downloaded, ${progress.skipped || 0} skipped)`;

  // Update overall progress bar fill
  elements.overallProgressFill.style.width = `${percentage}%`;
  if (elements.overallProgressText) {
    elements.overallProgressText.textContent = `${Math.round(percentage)}%`;
  }

  // Calculate download speed
  const now = Date.now();
  const timeElapsed = (now - progressTracking.startTime) / 1000; // seconds
  const timeSinceLastUpdate = (now - progressTracking.lastUpdateTime) / 1000; // seconds
  
  if (progress.size) {
    progressTracking.totalBytesDownloaded += progress.size;
  }
  
  // Calculate speed (bytes per second)
  if (timeSinceLastUpdate > 0) {
    const bytesSinceLastUpdate = (progress.size || 0);
    progressTracking.downloadSpeed = bytesSinceLastUpdate / timeSinceLastUpdate;
    
    // Calculate average speed
    if (progressTracking.totalBytesDownloaded > 0 && timeElapsed > 0) {
      progressTracking.averageSpeed = progressTracking.totalBytesDownloaded / timeElapsed;
    }
  }
  
  progressTracking.lastUpdateTime = now;

  // Update speed display
  if (elements.progressSpeed) {
    elements.progressSpeed.textContent = `Speed: ${formatBytes(progressTracking.averageSpeed)}/s`;
  }

  // Calculate and update ETA
  if (elements.progressETA && progressTracking.averageSpeed > 0 && percentage < 100) {
    const remainingBytes = progressTracking.totalBytes - progressTracking.totalBytesDownloaded;
    const remainingTime = remainingBytes / progressTracking.averageSpeed;
    elements.progressETA.textContent = `ETA: ${formatTime(remainingTime)}`;
  } else if (elements.progressETA) {
    elements.progressETA.textContent = `ETA: --`;
  }

  // Update time elapsed
  if (elements.progressTimeElapsed) {
    elements.progressTimeElapsed.textContent = `Time: ${formatTime(timeElapsed)}`;
  }

  // Update current file progress if available
  if (progress.currentFile) {
    elements.currentFileText.textContent = `Downloading: ${progress.currentFile}`;
    elements.currentFileProgressFill.style.width = `${progress.currentFileProgress || 0}%`;
  } else {
    elements.currentFileText.textContent = 'Ready to download...';
    elements.currentFileProgressFill.style.width = '0%';
  }

  // Add to recent assets list
  if (progress.savedResource && progress.path) {
    addToRecentAssets({
      name: progress.path.split('/').pop() || progress.savedResource,
      url: progress.savedResource,
      status: progress.status || 'downloaded',
      size: progress.size || 0,
      timestamp: Date.now()
    });
  }

  // Clear any existing timeout
  if (progressHideTimeout) {
    clearTimeout(progressHideTimeout);
    progressHideTimeout = null;
  }

  // Hide progress bar when complete, but wait 10 seconds after the last update
  if (percentage >= 100) {
    const completionData = {
      totalFiles: progress.processed || 0,
      downloaded: progress.downloaded || 0,
      skipped: progress.skipped || 0,
      timeElapsed: (Date.now() - progressTracking.startTime) / 1000
    };
    
    eventEmitter.emit('clone:complete', completionData);
    
    // Show desktop notification
    showDesktopNotification(
      'Clone Complete! 🎉',
      `Downloaded ${completionData.downloaded} files in ${formatTime(completionData.timeElapsed)}`,
      {
        tag: 'clone-complete',
        requireInteraction: false
      }
    );
    
    progressHideTimeout = setTimeout(() => {
      elements.progressContainer.style.display = 'none';
      progressHideTimeout = null;
      // Reset progress tracking
      resetProgressTracking();
    }, 10000); // 10 seconds delay
  }
}

/**
 * Format time in seconds to human readable
 */
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '--';
  
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

/**
 * Add asset to recent assets list
 */
function addToRecentAssets(asset) {
  progressTracking.recentAssets.unshift(asset);
  
  // Keep only last 10 assets
  if (progressTracking.recentAssets.length > 10) {
    progressTracking.recentAssets = progressTracking.recentAssets.slice(0, 10);
  }
  
  // Update recent assets display
  updateRecentAssetsDisplay();
}

/**
 * Update recent assets display
 */
function updateRecentAssetsDisplay() {
  if (!elements.recentAssetsContainer) return;
  
  if (progressTracking.recentAssets.length === 0) {
    elements.recentAssetsContainer.innerHTML = '<div class="recent-assets-empty">No recent assets</div>';
    return;
  }
  
  const assetsHTML = progressTracking.recentAssets.map(asset => {
    const statusClass = asset.status || 'downloaded';
    const icon = getAssetIcon(asset.type || 'other');
    
    return `
      <div class="recent-asset-item">
        <span class="recent-asset-icon">${icon}</span>
        <span class="recent-asset-name">${escapeHtml(asset.name)}</span>
        <span class="recent-asset-status ${statusClass}">${statusClass}</span>
        <span class="recent-asset-size">${formatBytes(asset.size)}</span>
      </div>
    `;
  }).join('');
  
  elements.recentAssetsContainer.innerHTML = assetsHTML;
}

/**
 * Reset progress tracking
 */
function resetProgressTracking() {
  progressTracking = {
    startTime: null,
    lastUpdateTime: null,
    lastBytesDownloaded: 0,
    totalBytesDownloaded: 0,
    totalBytes: 0,
    recentAssets: [],
    downloadSpeed: 0,
    averageSpeed: 0
  };
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
  resetProgressTracking();
  progressTracking.startTime = Date.now();
  progressTracking.lastUpdateTime = Date.now();
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
  try {
    let url = elements.srcUrl.value.trim();
    
    if (!url) {
      // If URL is cleared, disable watch mode
      if (watchMode) {
        watchMode = false;
        lastWatchedUrl = '';
        elements.cloneBtn.textContent = 'Clone';
        elements.cloneBtn.style.background = '';
        appendLog('⏹️ Watch mode OFF - URL cleared');
      }
      showToast('Please enter a URL', 'warning');
      return;
    }

    // Validate and normalize URL
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      appendLog(`❌ Invalid URL format: ${url}`);
      showToast('Invalid URL format. Please enter a valid URL (e.g., example.com or https://example.com)', 'error');
      return;
    }

    appendLog(`🌐 Navigating to: ${url}`);

    // Check for domain change when manually navigating
    checkDomainChange(url);

    // Auto-enable watch mode if not already enabled
    if (!watchMode && url) {
      watchMode = true;
      lastWatchedUrl = url;
      appendLog('👁️ Watch mode auto-enabled - URL detected');
    }

    // If watch mode is active and URL changed, reset button state but keep watch mode
    if (watchMode && url !== lastWatchedUrl) {
      // Reset button to normal state but preserve file count if available
      if (totalFiles > 0) {
        elements.cloneBtn.textContent = `Clone (${totalFiles} files)`;
      } else {
        elements.cloneBtn.textContent = 'Clone';
      }
      elements.cloneBtn.style.background = '';

      // Update last watched URL
      lastWatchedUrl = url;

      appendLog(`🔄 Manual navigation to: ${url}`);
      appendLog(`👁️ Watch mode remains active - ready to clone new URL`);
    }

    // Navigate webview
    if (elements.srcView) {
      elements.srcView.src = url;
      appendLog(`✅ Loading: ${url}`);
    } else {
      appendLog('❌ Error: srcView element not found');
      showToast('Error: Webview not found', 'error');
      return;
    }

    // Save URL to localStorage
    saveLastUrl(url);

    // Analyze static files after page loads (only once, not every navigation)
    // This listener should be set up once in setupEventListeners, not here
  } catch (error) {
    errorHandler.handle(error, { function: 'handleSourceNavigation', url }, 'error');
    appendLog(`❌ Navigation error: ${error.message}`);
    showToast('Navigation failed: ' + error.message, 'error');
  }
}

// Set up dom-ready listener once (not in handleSourceNavigation)
function setupWebviewListeners() {
  if (!elements.srcView) {
    console.error('srcView not found');
    return;
  }

  // Analyze static files after page loads
  elements.srcView.addEventListener('dom-ready', async () => {
    try {
      const url = elements.srcView.getURL?.() || elements.srcUrl.value.trim();
      if (!url || url.startsWith('about:')) return;
      
      const html = await elements.srcView.executeJavaScript('document.documentElement.outerHTML');
      const result = await window.electronAPI.analyzeStaticFiles({ html, baseUrl: url });

      if (result.staticFiles && result.staticFiles.length > 0) {
        totalFiles = result.staticFiles.length;
        appendLog(`✅ Found ${totalFiles} static files to download`);
        result.staticFiles.forEach(file => {
          appendLog(`📁 ${file.type.toUpperCase()}: ${file.url}`);
        });

        // Update button text to show total files
        elements.cloneBtn.textContent = `Clone (${totalFiles} files)`;
      } else {
        totalFiles = 0;
        appendLog('ℹ️ No local static files found (all external/CDN)');
        // Reset button text when no files found
        elements.cloneBtn.textContent = 'Clone';
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
      errorHandler.handle(error, { function: 'setupWebviewListeners' }, 'error');
      appendLog('❌ Error analyzing static files: ' + error.message);
    }
  });
}

/**
 * Handle URL changes in srcView for auto-clone
 */
async function handleUrlChange(event) {
  const newUrl = event.url;
  if (!newUrl || newUrl.startsWith('about:')) {
    // If URL is cleared, disable watch mode
    if (watchMode) {
      watchMode = false;
      lastWatchedUrl = '';
      elements.cloneBtn.textContent = 'Clone';
      elements.cloneBtn.style.background = '';
      appendLog('⏹️ Watch mode OFF - URL cleared');
    }
    return;
  }

  // Always update the URL input field regardless of watch mode
  elements.srcUrl.value = newUrl;

  // Check for domain change and reset tracking if needed
  checkDomainChange(newUrl);

  // Auto-enable watch mode if not already enabled and URL is valid
  if (!watchMode && newUrl && !newUrl.startsWith('about:')) {
    watchMode = true;
    lastWatchedUrl = newUrl;
    appendLog('👁️ Watch mode auto-enabled - URL detected');
  }

  // If watch mode is active and URL changed, reset button state but keep watch mode
  if (watchMode && newUrl !== lastWatchedUrl) {
    // Reset button to normal state but preserve file count if available
    if (totalFiles > 0) {
      elements.cloneBtn.textContent = `Clone (${totalFiles} files)`;
    } else {
      elements.cloneBtn.textContent = 'Clone';
    }
    elements.cloneBtn.style.background = '';

    // Update last watched URL
    lastWatchedUrl = newUrl;

    appendLog(`🔄 URL changed: ${newUrl}`);
    appendLog(`👁️ Watch mode remains active - ready to clone new URL`);

    // Save new URL to localStorage
    saveLastUrl(newUrl);

    // Don't auto-clone - user needs to manually click Clone again
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
 * Perform actual cloning of a single URL
 * @param {string} url - URL to clone
 * @param {Object} overrideOptions - Optional options to override defaults
 */
async function performClone(url, overrideOptions = {}) {
  const outputDir = elements.outPath.value.trim();
  if (!outputDir) {
    appendLog('⚠️ No output folder selected');
    throw new Error('No output folder selected');
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

  // Get options from UI
  const uiOptions = {
    mobile: elements.deviceType.value === 'mobile',
    resourceFilters: {
      images: !elements.filterImages.checked,
      media: !elements.filterMedia.checked,
      cssjs: !elements.filterCssJs.checked
    },
    crawlDepth: parseInt(elements.crawlDepth.value, 10) || 1,
    sameDomain: elements.sameDomain.checked
  };

  // Merge UI options with overrides
  const options = { ...uiOptions, ...overrideOptions };

  try {
    // Get cookies from Electron for this URL
    const cookies = await window.electronAPI.getCookies(url);

    // Get captured network data (only use if it's the seed URL or if we want to share it)
    let networkData = overrideOptions.networkData;
    if (!networkData && elements.srcView.getURL() === url) {
      networkData = await getCapturedNetworkData();
    }

    // Get captured assets (Service Workers, Web Workers, Blob URLs, Data URLs)
    let capturedAssets = null;
    try {
      const swData = window.electronAPI.getServiceWorkerData?.();
      const workerData = window.electronAPI.getWebWorkerData?.();
      const blobDataUrlData = window.electronAPI.getBlobDataUrlData?.();
      const dynamicImportData = window.electronAPI.getDynamicImportData?.();
      
      if (swData || workerData || blobDataUrlData) {
        capturedAssets = {
          serviceWorkers: swData?.registrations || [],
          webWorkers: [],
          blobUrls: [],
          dataUrls: []
        };
        
        if (swData && (swData.scripts?.length > 0 || swData.registrations?.length > 0)) {
          appendLog(`📦 Found ${swData.scripts?.length || 0} Service Worker script(s)`);
        }
        
        if (workerData) {
          const allWorkers = [
            ...(workerData.workers || []),
            ...(workerData.sharedWorkers || [])
          ];
          if (allWorkers.length > 0) {
            capturedAssets.webWorkers = allWorkers.map(url => ({
              scriptURL: url,
              timestamp: Date.now()
            }));
            appendLog(`👷 Found ${allWorkers.length} Web Worker script(s)`);
          }
        }
        
        if (blobDataUrlData) {
          if (blobDataUrlData.blobUrls && blobDataUrlData.blobUrls.length > 0) {
            capturedAssets.blobUrls = blobDataUrlData.blobUrls;
            appendLog(`📎 Found ${blobDataUrlData.blobUrls.length} Blob URL(s)`);
          }
          if (blobDataUrlData.dataUrls && blobDataUrlData.dataUrls.length > 0) {
            capturedAssets.dataUrls = blobDataUrlData.dataUrls;
            appendLog(`📄 Found ${blobDataUrlData.dataUrls.length} Data URL(s)`);
          }
        }
        
        if (dynamicImportData) {
          const allImports = [
            ...(dynamicImportData.dynamicImports || []),
            ...(dynamicImportData.moduleImports || [])
          ];
          if (allImports.length > 0 && !capturedAssets.moduleImports) {
            capturedAssets.moduleImports = allImports.map(url => ({
              url: url,
              timestamp: Date.now()
            }));
            appendLog(`📦 Found ${allImports.length} Dynamic/Module Import(s)`);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get captured assets data:', error);
    }

    const result = await window.electronAPI.startClone({
      url,
      outputDir,
      filename,
      cookies,
      networkData,
      capturedAssets,
      ...options
    });

    return result;

  } catch (error) {
    appendLog(`❌ Clone error for ${url}: ` + error);
    throw error;
  }
}

/**
 * Process the crawl queue
 */
async function processCrawlQueue() {
  const maxDepth = parseInt(elements.crawlDepth.value, 10) || 1;
  const sameDomain = elements.sameDomain.checked;

  if (crawlQueue.length === 0) return;

  const initialDomain = new URL(crawlQueue[0].url).hostname;

  elements.cloneBtn.disabled = true;
  elements.cloneBtn.textContent = 'Crawling...';
  isCrawling = true;

  try {
    while (crawlQueue.length > 0) {
      if (!isCrawling) break;

      const currentItem = crawlQueue.shift();
      const { url, depth, networkData } = currentItem;

      if (visitedUrls.has(url)) continue;
      visitedUrls.add(url);

      appendLog(`🕷️ Processing (${depth}/${maxDepth}): ${url}`);

      try {
        const result = await performClone(url, { networkData });

        appendLog(`✅ Saved: ${result.savedRelativePath}`);

        // If we haven't reached max depth, add links
        if (depth < maxDepth && result.links && result.links.length > 0) {
          const newLinks = result.links.filter(link => {
            if (visitedUrls.has(link)) return false;
            if (crawlQueue.some(item => item.url === link)) return false;

            if (sameDomain) {
              try {
                return new URL(link).hostname === initialDomain;
              } catch { return false; }
            }
            return true;
          });

          if (newLinks.length > 0) {
            appendLog(`Found ${newLinks.length} new links to crawl.`);
            newLinks.forEach(link => {
              crawlQueue.push({ url: link, depth: depth + 1 });
            });
          }
        }

      } catch (err) {
        appendLog(`⚠️ Failed to clone ${url}: ${err.message}`);
      }
    }
  } finally {
    isCrawling = false;
    elements.cloneBtn.disabled = false;
    elements.cloneBtn.textContent = watchMode ? 'Stop Watching' : 'Clone';
    appendLog('✅ Crawl finished!');
  }
}

/**
 * Auto-clone a page when URL changes
 */
async function autoClonePage(url) {
  appendLog(`🤖 Auto-cloning: ${url}`);
  try {
    const result = await performClone(url);
    appendLog(`✅ Auto-clone completed: ${result.savedRelativePath}`);

    // Auto-navigate to cloned content if server is running
    if (serverRunning) {
      const port = elements.portInput.value || '8080';
      const loadUrl = `http://localhost:${port}/${result.savedRelativePath}`;
      elements.dstUrl.value = loadUrl;
      handleDestinationNavigation();
    }
  } catch (e) {
    // Logged in performClone
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
  try {
    // Wait for electronAPI to be available (with timeout)
    let retries = 0;
    const maxRetries = 10;
    while ((!window.electronAPI || !window.electronAPI.chooseFolder) && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }

    if (!window.electronAPI || !window.electronAPI.chooseFolder) {
      appendLog('❌ Error: Folder selection not available');
      showToast('Error: Folder selection not available. Please reload the app.', 'error');
      return;
    }

    appendLog('📁 Opening folder selection dialog...');
    const path = await window.electronAPI.chooseFolder();
    
    if (path) {
      if (elements.outPath) {
        elements.outPath.value = path;
        elements.outPath.style.borderColor = '#10b981'; // Green border
        appendLog(`✅ Output folder selected: ${path}`);
        showToast('Output folder selected', 'success');

        // Save output directory to localStorage
        localStorage.setItem(STORAGE_KEYS.LAST_OUTPUT_DIR, path);
      } else {
        appendLog('❌ Error: outPath element not found');
      }
    } else {
      if (elements.outPath) {
        elements.outPath.style.borderColor = '#ef4444'; // Red border
      }
      appendLog('ℹ️ Folder selection cancelled');
    }
  } catch (error) {
    errorHandler.handle(error, { function: 'handleChooseOutput' }, 'error');
    appendLog(`❌ Error selecting folder: ${error.message}`);
    showToast('Error selecting folder: ' + error.message, 'error');
    
    if (elements.outPath) {
      elements.outPath.style.borderColor = '#ef4444'; // Red border
    }
  }
}

/**
 * Handle server toggle
 */
async function handleToggleServer() {
  const dir = elements.outPath.value || null;
  const port = parseInt(elements.portInput.value || '8080', 10);

  // Set loading state
  setLoadingState(elements.toggleServerBtn, true, null, 'Starting...');

  try {
    const result = await window.electronAPI.toggleServer({ dir, port });
    serverRunning = result.running;
    elements.toggleServerBtn.textContent = serverRunning ? 'Stop Server' : 'Start Server';
    elements.toggleServerBtn.style.background = serverRunning ? '#ef4444' : ''; // Red for stop

    if (serverRunning) {
      // Update port input with actual port used
      if (result.port && result.port !== result.originalPort) {
        elements.portInput.value = result.port;
        appendLog(`⚠️ Port ${result.originalPort} was in use, using port ${result.port} instead`);
      }
      appendLog(`Server started on ${result.url}`);
      showToast(`Server started on port ${result.port}`, 'success');

      // Auto-navigate to static server when started
      if (result.url) {
        elements.dstUrl.value = result.url;
        // Test server connection first
        await testServerConnection(result.url);
        handleDestinationNavigation();
      }
    } else {
      appendLog(`Server stopped`);
      showToast('Server stopped', 'info');
      elements.toggleServerBtn.style.background = '';
    }
  } catch (error) {
    appendLog('Server toggle error: ' + error);
    showToast('Failed to toggle server', 'error');
  } finally {
    setLoadingState(elements.toggleServerBtn, false);
    // Restore correct text based on state
    elements.toggleServerBtn.textContent = serverRunning ? 'Stop Server' : 'Start Server';
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
 * Handle Clone operation
 */
async function handleClone() {
  const currentURL = elements.srcView.getURL?.() || elements.srcUrl.value.trim();
  if (!currentURL) {
    appendLog('❌ No source URL');
    showAlert('❌ Please enter a source URL first!');
    eventEmitter.emit('clone:error', { error: 'No source URL' });
    return;
  }

  // Validate URL format
  try {
    new URL(currentURL);
  } catch (error) {
    appendLog('❌ Invalid URL format');
    showAlert('❌ Invalid URL format!\n\nPlease enter a valid URL (e.g., https://example.com)');
    eventEmitter.emit('clone:error', { error: 'Invalid URL format', url: currentURL });
    return;
  }
  
  // Emit clone start event
  eventEmitter.emit('clone:start', { url: currentURL, timestamp: Date.now() });

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

    // Set loading state
    setLoadingState(elements.cloneBtn, true, 'Clone', 'Initializing...');

    try {
      // Check if server is running for better UX
      if (!serverRunning) {
        const startServer = confirm('⚠️ Static server is not running.\n\nDo you want to start the server now to preview the cloned content?\n\nClick "OK" to start server, or "Cancel" to continue without server.');
        if (startServer) {
          await handleToggleServer();
        }
      }

      // Capture all fetch/XHR requests and existing resources
      appendLog('🔍 Watch mode ON - Auto-cloning enabled');
      await captureNetworkRequests(currentURL);

      elements.cloneBtn.textContent = 'Stop Watching';
      elements.cloneBtn.style.background = '#ef4444';

      showToast('Clone started!', 'success');

      // Clone current page immediately (or start crawl)
      // Initialize crawl queue with seed URL
      const networkData = await getCapturedNetworkData(); // Capture once for seed
      visitedUrls.clear();
      crawlQueue = [{ url: currentURL, depth: 1, networkData }];

      await processCrawlQueue();

    } catch (error) {
      appendLog('❌ Error starting watch mode: ' + error);
      showToast('Failed to start watch mode', 'error');
      watchMode = false;
      elements.cloneBtn.textContent = 'Clone';
      elements.cloneBtn.style.background = '';
    } finally {
      setLoadingState(elements.cloneBtn, false);
      if (watchMode) {
        elements.cloneBtn.textContent = 'Stop Watching';
        elements.cloneBtn.style.background = '#ef4444';
      }
    }

  } else {
    // Stop watching
    watchMode = false;
    lastWatchedUrl = '';

    // Preserve file count in button text
    if (totalFiles > 0) {
      elements.cloneBtn.textContent = `Clone (${totalFiles} files)`;
    } else {
      elements.cloneBtn.textContent = 'Clone';
    }
            elements.cloneBtn.style.background = '';
            appendLog('⏹️ Watch mode OFF - Auto-cloning disabled');
            showToast('Watch mode stopped', 'info');
            eventEmitter.emit('clone:watch-mode-stopped');
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
 * Show alert (Using Toast system now)
 * @param {string} message - Alert message
 * @param {string} title - Alert title (ignored for toast)
 */
function showAlert(message, title = 'Alert') {
  // Determine type based on message content
  let type = 'info';
  if (message.toLowerCase().includes('error') || message.includes('❌') || title.toLowerCase().includes('error')) type = 'error';
  else if (message.toLowerCase().includes('success') || message.includes('✅')) type = 'success';
  else if (message.toLowerCase().includes('warning') || message.includes('⚠️')) type = 'warning';

  showToast(message, type, 4000);
}

/**
 * Append log message to the log area
 * @param {string} message - Log message to append
 */
function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  
  // Emit log event
  eventEmitter.emit('log', { message, timestamp });
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

// Asset statistics storage
let assetStatistics = {
  total: 0,
  downloaded: 0,
  missing: 0,
  totalSize: 0,
  breakdown: {
    html: 0,
    css: 0,
    js: 0,
    images: 0,
    fonts: 0,
    media: 0,
    workers: 0,
    sourceMaps: 0
  }
};

/**
 * Calculate asset statistics from captured data
 */
async function calculateAssetStatistics() {
  try {
    const stats = {
      total: 0,
      downloaded: 0,
      missing: 0,
      totalSize: 0,
      breakdown: {
        html: 0,
        css: 0,
        js: 0,
        images: 0,
        fonts: 0,
        media: 0,
        workers: 0,
        sourceMaps: 0
      }
    };

    // Get captured assets data
    const swData = window.electronAPI.getServiceWorkerData?.();
    const workerData = window.electronAPI.getWebWorkerData?.();
    const blobData = window.electronAPI.getBlobDataUrlData?.();
    const importData = window.electronAPI.getDynamicImportData?.();

    // Count Service Workers
    if (swData && swData.scripts) {
      stats.breakdown.workers += swData.scripts.length;
      stats.total += swData.scripts.length;
      stats.downloaded += swData.scripts.length;
    }

    // Count Web Workers
    if (workerData) {
      const allWorkers = [
        ...(workerData.workers || []),
        ...(workerData.sharedWorkers || [])
      ];
      stats.breakdown.workers += allWorkers.length;
      stats.total += allWorkers.length;
      stats.downloaded += allWorkers.length;
    }

    // Count Blob URLs
    if (blobData && blobData.blobUrls) {
      stats.total += blobData.blobUrls.length;
      stats.downloaded += blobData.blobUrls.length;
    }

    // Count Data URLs
    if (blobData && blobData.dataUrls) {
      stats.total += blobData.dataUrls.length;
      stats.downloaded += blobData.dataUrls.length;
    }

    // Count Module Imports
    if (importData) {
      const allImports = [
        ...(importData.dynamicImports || []),
        ...(importData.moduleImports || [])
      ];
      stats.breakdown.js += allImports.length;
      stats.total += allImports.length;
      stats.downloaded += allImports.length;
    }

    // Get sources data if available
    if (window.sourcesData && Array.isArray(window.sourcesData)) {
      window.sourcesData.forEach(source => {
        stats.total++;
        stats.downloaded++;
        
        const type = source.type || 'other';
        const sourceType = source.source || '';
        
        if (type === 'document' || type === 'html') {
          stats.breakdown.html++;
        } else if (type === 'stylesheet' || type === 'css') {
          stats.breakdown.css++;
        } else if (type === 'script' || type === 'js') {
          stats.breakdown.js++;
        } else if (type === 'image') {
          stats.breakdown.images++;
        } else if (type === 'font') {
          stats.breakdown.fonts++;
        } else if (type === 'media') {
          stats.breakdown.media++;
        } else if (sourceType.includes('worker')) {
          stats.breakdown.workers++;
        } else if (sourceType.includes('source-map') || sourceType.includes('map')) {
          stats.breakdown.sourceMaps++;
        }
        
        if (source.size) {
          stats.totalSize += source.size;
        }
      });
    }

    assetStatistics = stats;
    return stats;
  } catch (error) {
    console.warn('Failed to calculate asset statistics:', error);
    return assetStatistics;
  }
}

/**
 * Update asset dashboard display
 */
async function updateAssetDashboard() {
  const stats = await calculateAssetStatistics();
  
  // Emit asset statistics event
  eventEmitter.emit('assets:statistics-updated', stats);
  
  // Update statistics
  elements.statTotalAssets.textContent = stats.total;
  elements.statDownloaded.textContent = stats.downloaded;
  elements.statMissing.textContent = stats.missing;
  elements.statTotalSize.textContent = formatBytes(stats.totalSize);
  
  // Update breakdown
  elements.breakdownHtml.textContent = stats.breakdown.html;
  elements.breakdownCss.textContent = stats.breakdown.css;
  elements.breakdownJs.textContent = stats.breakdown.js;
  elements.breakdownImages.textContent = stats.breakdown.images;
  elements.breakdownFonts.textContent = stats.breakdown.fonts;
  elements.breakdownMedia.textContent = stats.breakdown.media;
  elements.breakdownWorkers.textContent = stats.breakdown.workers;
  elements.breakdownSourceMaps.textContent = stats.breakdown.sourceMaps;
  
  // Update asset list
  updateAssetList();
}

/**
 * Get all assets for display
 */
function getAllAssets() {
  const assets = [];
  
  // Get from sources data
  if (window.sourcesData && Array.isArray(window.sourcesData)) {
    window.sourcesData.forEach(source => {
      const asset = {
        name: source.name || 'Unknown',
        url: source.url,
        type: source.type || 'other',
        size: source.size || 0,
        status: 'downloaded',
        source: source.source || 'unknown'
      };
      assets.push(asset);
      
      // Add to dependency graph
      dependencyGraph.addNode(source.url, {
        type: source.type,
        size: source.size,
        status: 'downloaded'
      });
      
      // Add to priority queue for reference
      priorityQueue.enqueue(asset);
    });
  }
  
  // Get from captured assets
  try {
    const swData = window.electronAPI.getServiceWorkerData?.();
    const workerData = window.electronAPI.getWebWorkerData?.();
    const blobData = window.electronAPI.getBlobDataUrlData?.();
    const importData = window.electronAPI.getDynamicImportData?.();
    
    if (swData && swData.scripts) {
      swData.scripts.forEach(url => {
        assets.push({
          name: url.split('/').pop() || 'service-worker.js',
          url: url,
          type: 'worker',
          size: 0,
          status: 'downloaded',
          source: 'service-worker'
        });
      });
    }
    
    if (workerData) {
      const allWorkers = [
        ...(workerData.workers || []),
        ...(workerData.sharedWorkers || [])
      ];
      allWorkers.forEach(url => {
        assets.push({
          name: url.split('/').pop() || 'worker.js',
          url: url,
          type: 'worker',
          size: 0,
          status: 'downloaded',
          source: 'web-worker'
        });
      });
    }
    
    if (blobData) {
      if (blobData.blobUrls) {
        blobData.blobUrls.forEach(blob => {
          assets.push({
            name: `blob-${blob.url.split('/').pop()}`,
            url: blob.url,
            type: 'blob',
            size: blob.size || 0,
            status: 'downloaded',
            source: 'blob-url'
          });
        });
      }
      
      if (blobData.dataUrls) {
        blobData.dataUrls.forEach(dataUrl => {
          assets.push({
            name: `data-url-${dataUrl.url.substring(0, 20)}...`,
            url: dataUrl.url.substring(0, 100) + '...',
            type: 'data-url',
            size: dataUrl.dataLength || 0,
            status: 'downloaded',
            source: 'data-url'
          });
        });
      }
    }
    
    if (importData) {
      const allImports = [
        ...(importData.dynamicImports || []),
        ...(importData.moduleImports || [])
      ];
      allImports.forEach(url => {
        assets.push({
          name: url.split('/').pop() || 'module.js',
          url: url,
          type: 'js',
          size: 0,
          status: 'downloaded',
          source: 'module-import'
        });
      });
    }
  } catch (error) {
    console.warn('Failed to get captured assets:', error);
  }
  
  return assets;
}

/**
 * Update asset list display
 */
function updateAssetList() {
  const assets = getAllAssets();
  const searchTerm = elements.assetSearchInput.value.toLowerCase();
  const typeFilter = elements.assetTypeFilter.value;
  const statusFilter = elements.assetStatusFilter.value;
  const sizeFilter = elements.assetSizeFilter.value;
  
  // Filter assets
  let filteredAssets = assets;
  
  if (searchTerm) {
    filteredAssets = filteredAssets.filter(asset => 
      asset.name.toLowerCase().includes(searchTerm) ||
      asset.url.toLowerCase().includes(searchTerm)
    );
  }
  
  if (typeFilter !== 'all') {
    filteredAssets = filteredAssets.filter(asset => {
      if (typeFilter === 'html') return asset.type === 'document' || asset.type === 'html';
      if (typeFilter === 'css') return asset.type === 'stylesheet' || asset.type === 'css';
      if (typeFilter === 'js') return asset.type === 'script' || asset.type === 'js';
      if (typeFilter === 'image') return asset.type === 'image';
      if (typeFilter === 'font') return asset.type === 'font';
      if (typeFilter === 'media') return asset.type === 'media';
      if (typeFilter === 'worker') return asset.type === 'worker' || asset.source.includes('worker');
      if (typeFilter === 'source-map') return asset.source.includes('source-map') || asset.source.includes('map');
      return true;
    });
  }
  
  if (statusFilter !== 'all') {
    filteredAssets = filteredAssets.filter(asset => asset.status === statusFilter);
  }
  
  // Size filter
  if (sizeFilter !== 'all') {
    filteredAssets = filteredAssets.filter(asset => {
      const size = asset.size || 0;
      switch (sizeFilter) {
        case 'small':
          return size < 100 * 1024; // < 100 KB
        case 'medium':
          return size >= 100 * 1024 && size < 1024 * 1024; // 100 KB - 1 MB
        case 'large':
          return size >= 1024 * 1024 && size < 10 * 1024 * 1024; // 1 MB - 10 MB
        case 'xlarge':
          return size >= 10 * 1024 * 1024; // > 10 MB
        default:
          return true;
      }
    });
  }
  
  // Render asset list
  renderAssetList(filteredAssets);
}

/**
 * Render asset list
 */
function renderAssetList(assets) {
  if (assets.length === 0) {
    elements.assetListContainer.innerHTML = '<div class="asset-list-empty">No assets found</div>';
    return;
  }
  
  const listHTML = assets.map((asset, index) => {
    const icon = getAssetIcon(asset.type);
    const statusClass = asset.status || 'downloaded';
    const assetId = `asset-${index}-${Date.now()}`;
    
    return `
      <div class="asset-list-item" 
           data-asset-url="${escapeHtml(asset.url)}" 
           data-asset-type="${asset.type}"
           data-asset-id="${assetId}"
           oncontextmenu="handleAssetContextMenu(event, '${escapeHtml(asset.url)}', '${asset.type}', '${assetId}')">
        <div class="asset-item-icon">${icon}</div>
        <div class="asset-item-info">
          <div class="asset-item-name" style="cursor: pointer;" onclick="handleAssetPreview('${escapeHtml(asset.url)}', '${asset.type}')">${escapeHtml(asset.name)}</div>
          <div class="asset-item-url">${escapeHtml(asset.url.length > 80 ? asset.url.substring(0, 80) + '...' : asset.url)}</div>
        </div>
        <div class="asset-item-status ${statusClass}">${statusClass}</div>
        <div class="asset-item-size">${formatBytes(asset.size)}</div>
        <div class="asset-item-actions">
          <button class="asset-action-btn" onclick="handleAssetPreview('${escapeHtml(asset.url)}', '${asset.type}')" title="Preview">👁️</button>
          <button class="asset-action-btn" onclick="handleCopyAssetUrl('${escapeHtml(asset.url)}')" title="Copy URL">📋</button>
        </div>
      </div>
    `;
  }).join('');
  
  elements.assetListContainer.innerHTML = listHTML;
  
  // Setup context menu event listeners
  setupContextMenuListeners();
}

/**
 * Get icon for asset type
 */
function getAssetIcon(type) {
  const icons = {
    'document': '📄',
    'html': '📄',
    'stylesheet': '🎨',
    'css': '🎨',
    'script': '📜',
    'js': '📜',
    'image': '🖼️',
    'font': '🔤',
    'media': '🎬',
    'worker': '👷',
    'blob': '📎',
    'data-url': '📄',
    'source-map': '🗺️',
    'other': '📦'
  };
  return icons[type] || icons['other'];
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Handle asset list filter
 */
function handleAssetListFilter() {
  updateAssetList();
}

/**
 * Handle asset preview
 */
async function handleAssetPreview(url, type) {
  if (!url) return;
  
  elements.assetPreviewModal.style.display = 'block';
  elements.assetPreviewTitle.textContent = `📄 Preview: ${url.split('/').pop() || 'Asset'}`;
  elements.assetPreviewContent.innerHTML = '<div class="asset-preview-loading">Loading preview...</div>';
  
  try {
    let previewHTML = '';
    
    if (type === 'image' || url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      previewHTML = `
        <div class="asset-preview-image">
          <img src="${escapeHtml(url)}" alt="Preview" style="max-width: 100%; max-height: 70vh; object-fit: contain;" 
               onerror="this.parentElement.innerHTML='<p style=\\'color: red;\\'>Failed to load image</p>'">
        </div>
        <div class="asset-preview-info">
          <p><strong>URL:</strong> <a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></p>
          <p><strong>Type:</strong> ${escapeHtml(type || 'image')}</p>
        </div>
      `;
    } else if (type === 'css' || url.match(/\.css$/i)) {
      try {
        const response = await fetch(url);
        const cssText = await response.text();
        previewHTML = `
          <div class="asset-preview-code">
            <pre><code class="language-css">${escapeHtml(cssText)}</code></pre>
          </div>
          <div class="asset-preview-info">
            <p><strong>URL:</strong> <a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></p>
            <p><strong>Size:</strong> ${formatBytes(cssText.length)}</p>
          </div>
        `;
      } catch (error) {
        previewHTML = `<p style="color: red;">Failed to load CSS: ${error.message}</p>`;
      }
    } else if (type === 'js' || url.match(/\.(js|mjs)$/i)) {
      try {
        const response = await fetch(url);
        const jsText = await response.text();
        previewHTML = `
          <div class="asset-preview-code">
            <pre><code class="language-javascript">${escapeHtml(jsText)}</code></pre>
          </div>
          <div class="asset-preview-info">
            <p><strong>URL:</strong> <a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></p>
            <p><strong>Size:</strong> ${formatBytes(jsText.length)}</p>
          </div>
        `;
      } catch (error) {
        previewHTML = `<p style="color: red;">Failed to load JavaScript: ${error.message}</p>`;
      }
    } else {
      previewHTML = `
        <div class="asset-preview-info">
          <p><strong>URL:</strong> <a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></p>
          <p><strong>Type:</strong> ${escapeHtml(type || 'unknown')}</p>
          <p><em>Preview not available for this file type. Click the URL to open in browser.</em></p>
        </div>
      `;
    }
    
    elements.assetPreviewContent.innerHTML = previewHTML;
  } catch (error) {
    errorHandler.handle(error, { function: 'handleAssetPreview', url }, 'error');
    elements.assetPreviewContent.innerHTML = `<p style="color: red;">Error loading preview: ${error.message}</p>`;
  }
}

/**
 * Handle close asset preview
 */
function handleCloseAssetPreview() {
  elements.assetPreviewModal.style.display = 'none';
  elements.assetPreviewContent.innerHTML = '';
}

/**
 * Handle copy asset URL
 */
async function handleCopyAssetUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast('URL copied to clipboard', 'success');
    appendLog(`📋 Copied URL: ${url}`);
  } catch (error) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('URL copied to clipboard', 'success');
  }
}

// Context menu state
let contextMenuState = {
  url: null,
  type: null,
  assetId: null
};

/**
 * Handle asset context menu
 */
function handleAssetContextMenu(event, url, type, assetId) {
  event.preventDefault();
  event.stopPropagation();
  
  contextMenuState = { url, type, assetId };
  
  // Position context menu
  const menu = elements.contextMenu;
  menu.style.display = 'block';
  menu.style.left = `${event.pageX}px`;
  menu.style.top = `${event.pageY}px`;
  
  // Adjust if menu goes off screen
  setTimeout(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${event.pageX - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${event.pageY - rect.height}px`;
    }
  }, 0);
}

/**
 * Handle context menu action
 */
function handleContextMenuAction(action) {
  const { url, type } = contextMenuState;
  if (!url) return;
  
  hideContextMenu();
  
  switch (action) {
    case 'preview':
      handleAssetPreview(url, type);
      break;
    case 'copy':
      handleCopyAssetUrl(url);
      break;
    case 'open':
      window.open(url, '_blank');
      appendLog(`🔗 Opened URL in browser: ${url}`);
      break;
    case 'download':
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = url.split('/').pop() || 'download';
      a.click();
      appendLog(`⬇️ Downloading: ${url}`);
      showToast('Download started', 'info');
      break;
    case 'validate':
      // Validate single asset
      handleValidateSingleAsset(url, type);
      break;
  }
}

/**
 * Hide context menu
 */
function hideContextMenu() {
  if (elements.contextMenu) {
    elements.contextMenu.style.display = 'none';
  }
  contextMenuState = { url: null, type: null, assetId: null };
}

/**
 * Setup context menu listeners
 */
function setupContextMenuListeners() {
  // Already handled by global listeners
}

/**
 * Handle dependency graph
 */
function handleDependencyGraph() {
  const stats = dependencyGraph.getStatistics();
  const cycles = dependencyGraph.detectCircularDependencies();
  const criticalPath = dependencyGraph.getCriticalPath();
  const topoOrder = dependencyGraph.getTopologicalOrder();
  const queueStats = priorityQueue.getStatistics();
  
  const graphData = dependencyGraph.exportToJSON();
  graphData.priorityQueue = queueStats;
  
  // Show graph info
  const message = `
📊 Dependency Graph & Priority Queue Statistics

Dependency Graph:
  Total Nodes: ${stats.totalNodes}
  Total Edges: ${stats.totalEdges}
  Circular Dependencies: ${cycles.length}
  Critical Path Length: ${criticalPath.length}
  Optimal Download Order: ${topoOrder.length} assets

Priority Queue:
  Total: ${queueStats.total}
  Critical: ${queueStats.critical}
  High: ${queueStats.high}
  Medium: ${queueStats.medium}
  Low: ${queueStats.low}

${cycles.length > 0 ? `⚠️ Warning: Found ${cycles.length} circular dependency chain(s)` : '✅ No circular dependencies found'}

Would you like to export the dependency graph?
  `.trim();
  
  if (confirm(message)) {
    const exportText = JSON.stringify(graphData, null, 2);
    const blob = new Blob([exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `dependency-graph-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    appendLog('📊 Dependency graph exported');
    showToast('Dependency graph exported', 'success');
  }
  
  // Log graph info
  appendLog(`📊 Dependency Graph: ${stats.totalNodes} nodes, ${stats.totalEdges} edges`);
  appendLog(`📊 Priority Queue: ${queueStats.total} items (Critical: ${queueStats.critical}, High: ${queueStats.high}, Medium: ${queueStats.medium}, Low: ${queueStats.low})`);
  if (cycles.length > 0) {
    appendLog(`⚠️ Circular dependencies detected: ${cycles.length} chain(s)`);
    cycles.forEach((cycle, index) => {
      appendLog(`  Cycle ${index + 1}: ${cycle.join(' → ')}`);
    });
  }
  if (criticalPath.length > 0) {
    appendLog(`🔗 Critical path: ${criticalPath.length} assets`);
  }
}

/**
 * Validate single asset
 */
async function handleValidateSingleAsset(url, type) {
  try {
    appendLog(`✅ Validating asset: ${url}`);
    showToast('Validating asset...', 'info');
    
    const asset = {
      url,
      type,
      name: url.split('/').pop() || 'Unknown',
      size: 0,
      status: 'downloaded'
    };
    
    const result = await assetValidator.validateAsset(asset, {
      checkFileExists: false, // Can't check file system from renderer
      checkUrlAccessibility: true,
      checkContentType: true
    });
    
    if (result.valid) {
      showToast('Asset is valid', 'success');
      appendLog(`✅ Asset validated: ${url}`);
    } else {
      showToast('Asset validation failed', 'warning');
      result.errors.forEach(error => {
        appendLog(`❌ ${error}`);
      });
    }
  } catch (error) {
    errorHandler.handle(error, { function: 'handleValidateSingleAsset', url }, 'error');
    showToast('Validation error: ' + error.message, 'error');
  }
}

/**
 * Handle theme toggle
 */
function handleThemeToggle() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  // Update data-theme attribute
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  // Load or remove dark theme stylesheet
  const darkStylesheet = document.getElementById('dark-theme-stylesheet');
  if (newTheme === 'dark') {
    if (!darkStylesheet) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'styles-dark.css';
      link.id = 'dark-theme-stylesheet';
      document.head.appendChild(link);
    }
  } else {
    if (darkStylesheet) {
      darkStylesheet.remove();
    }
  }
  
  // Update button icon
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    elements.themeToggleBtn.title = newTheme === 'dark' ? 'Toggle Light Mode' : 'Toggle Dark Mode';
  }
  
  appendLog(`🎨 Theme changed to ${newTheme} mode`);
  showToast(`Switched to ${newTheme} mode`, 'success');
}

/**
 * Handle DevTools toggle
 */
async function handleToggleDevTools() {
  try {
    // Wait for electronAPI to be available
    let retries = 0;
    const maxRetries = 10;
    while ((!window.electronAPI || !window.electronAPI.toggleDevTools) && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }

    if (!window.electronAPI || !window.electronAPI.toggleDevTools) {
      appendLog('❌ Error: DevTools toggle not available');
      showToast('Error: DevTools toggle not available', 'error');
      return;
    }

    const result = await window.electronAPI.toggleDevTools();
    if (result && result.opened) {
      appendLog('🔧 DevTools opened');
      if (elements.devToolsBtn) {
        elements.devToolsBtn.textContent = '❌ Close DevTools';
        elements.devToolsBtn.title = 'Close Developer Tools';
      }
    } else {
      appendLog('🔧 DevTools closed');
      if (elements.devToolsBtn) {
        elements.devToolsBtn.textContent = '🔧 DevTools';
        elements.devToolsBtn.title = 'Toggle Developer Tools';
      }
    }
  } catch (error) {
    errorHandler.handle(error, { function: 'handleToggleDevTools' }, 'error');
    appendLog(`❌ Error toggling DevTools: ${error.message}`);
    showToast('Error toggling DevTools: ' + error.message, 'error');
  }
}

/**
 * Setup drag and drop functionality
 */
function setupDragAndDrop() {
  // Drag & Drop for URL input
  if (elements.srcUrlDropZone) {
    elements.srcUrlDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.srcUrlDropZone.classList.add('drag-over');
    });
    
    elements.srcUrlDropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.srcUrlDropZone.classList.remove('drag-over');
    });
    
    elements.srcUrlDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.srcUrlDropZone.classList.remove('drag-over');
      
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        // Check if it's a URL
        try {
          const url = new URL(text);
          elements.srcUrl.value = url.toString();
          appendLog(`📥 Dropped URL: ${url.toString()}`);
          showToast('URL dropped successfully', 'success');
          
          // Auto-navigate if valid URL
          setTimeout(() => {
            handleSourceNavigation();
          }, 100);
        } catch (error) {
          // Not a valid URL, try as text
          elements.srcUrl.value = text;
          appendLog(`📥 Dropped text: ${text}`);
          showToast('Text dropped (please verify it\'s a valid URL)', 'info');
        }
      }
    });
  }
  
  // Drag & Drop for output folder (Electron specific)
  if (elements.outPathDropZone) {
    elements.outPathDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.outPathDropZone.classList.add('drag-over');
    });
    
    elements.outPathDropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.outPathDropZone.classList.remove('drag-over');
    });
    
    elements.outPathDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.outPathDropZone.classList.remove('drag-over');
      
      // Electron can access file paths from drag events
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        
        // Check if it's a directory (Electron specific)
        if (file.path) {
          try {
            const fs = await import('fs-extra');
            const stats = await fs.stat(file.path);
            
            if (stats.isDirectory()) {
              elements.outPath.value = file.path;
              localStorage.setItem(STORAGE_KEYS.LAST_OUTPUT_DIR, file.path);
              appendLog(`📁 Dropped folder: ${file.path}`);
              showToast('Folder selected successfully', 'success');
            } else {
              // If it's a file, use its parent directory
              const path = await import('path');
              const dirPath = path.dirname(file.path);
              elements.outPath.value = dirPath;
              localStorage.setItem(STORAGE_KEYS.LAST_OUTPUT_DIR, dirPath);
              appendLog(`📁 Using parent folder: ${dirPath}`);
              showToast('Using parent folder', 'info');
            }
          } catch (error) {
            errorHandler.handle(error, { function: 'setupDragAndDrop', path: file.path }, 'error');
            showToast('Failed to set folder: ' + error.message, 'error');
          }
        } else {
          // Fallback: try to use the file path as text
          const path = file.name || file.path || '';
          if (path) {
            elements.outPath.value = path;
            appendLog(`📁 Dropped path: ${path}`);
            showToast('Path set (please verify)', 'info');
          }
        }
      }
    });
  }
  
  // Prevent default drag behavior on document
  document.addEventListener('dragover', (e) => {
    // Only prevent if not over a drop zone
    if (!e.target.closest('.drag-zone')) {
      e.preventDefault();
    }
  });
  
  document.addEventListener('drop', (e) => {
    // Only prevent if not over a drop zone
    if (!e.target.closest('.drag-zone')) {
      e.preventDefault();
    }
  });
}

/**
 * Initialize theme from localStorage or system preference
 */
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  
  // Load or remove dark theme stylesheet
  const darkStylesheet = document.getElementById('dark-theme-stylesheet');
  if (theme === 'dark') {
    if (!darkStylesheet) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'styles-dark.css';
      link.id = 'dark-theme-stylesheet';
      document.head.appendChild(link);
    }
  } else {
    if (darkStylesheet) {
      darkStylesheet.remove();
    }
  }
  
  // Update button icon
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    elements.themeToggleBtn.title = theme === 'dark' ? 'Toggle Light Mode' : 'Toggle Dark Mode';
  }
  
  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        
        // Load or remove dark theme stylesheet
        const darkStylesheet = document.getElementById('dark-theme-stylesheet');
        if (newTheme === 'dark') {
          if (!darkStylesheet) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'styles-dark.css';
            link.id = 'dark-theme-stylesheet';
            document.head.appendChild(link);
          }
        } else {
          if (darkStylesheet) {
            darkStylesheet.remove();
          }
        }
        
        if (elements.themeToggleBtn) {
          elements.themeToggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        }
      }
    });
  }
}


/**
 * Load settings using CaptureConfig
 */
function loadSettings() {
  return captureConfig.getAll();
}

/**
 * Save settings using CaptureConfig
 */
function saveSettings(settings) {
  const validation = captureConfig.validate(settings);
  if (!validation.valid) {
    console.warn('Settings validation failed:', validation.errors);
    return false;
  }
  return captureConfig.update(settings);
}

/**
 * Apply settings to UI
 */
function applySettingsToUI(settings) {
  const s = settings || captureConfig.getAll();
  
  // Capture options
  elements.settingCaptureServiceWorkers.checked = captureConfig.get('capture.serviceWorkers') ?? true;
  elements.settingCaptureWebWorkers.checked = captureConfig.get('capture.webWorkers') ?? true;
  elements.settingExtractBlobUrls.checked = captureConfig.get('capture.blobUrls') ?? true;
  elements.settingExtractDataUrls.checked = captureConfig.get('capture.dataUrls') ?? true;
  elements.settingDownloadSourceMaps.checked = captureConfig.get('capture.sourceMaps') ?? true;
  elements.settingCaptureIframes.checked = captureConfig.get('capture.iframes') ?? true;
  elements.settingDownloadMetaFiles.checked = captureConfig.get('capture.metaFiles') ?? true;
  elements.settingProcessCssImports.checked = captureConfig.get('capture.cssImports') ?? true;
  
  // Lazy loading
  elements.settingWaitForLazyImages.checked = captureConfig.get('lazyLoading.waitForLazyImages') ?? true;
  elements.settingScrollToTrigger.checked = captureConfig.get('lazyLoading.scrollToTrigger') ?? true;
  elements.settingLazyWaitTime.value = captureConfig.get('lazyLoading.waitTime') ?? 5;
  
  // Advanced
  elements.settingIncludeCDN.checked = captureConfig.get('advanced.includeCDN') ?? false;
  elements.settingIncludeExternal.checked = captureConfig.get('advanced.includeExternal') ?? false;
  elements.settingDownloadDuplicates.checked = captureConfig.get('advanced.downloadDuplicates') ?? false;
}

/**
 * Get settings from UI
 */
function getSettingsFromUI() {
  return {
    capture: {
      serviceWorkers: elements.settingCaptureServiceWorkers.checked,
      webWorkers: elements.settingCaptureWebWorkers.checked,
      blobUrls: elements.settingExtractBlobUrls.checked,
      dataUrls: elements.settingExtractDataUrls.checked,
      sourceMaps: elements.settingDownloadSourceMaps.checked,
      iframes: elements.settingCaptureIframes.checked,
      metaFiles: elements.settingDownloadMetaFiles.checked,
      cssImports: elements.settingProcessCssImports.checked
    },
    lazyLoading: {
      waitForLazyImages: elements.settingWaitForLazyImages.checked,
      scrollToTrigger: elements.settingScrollToTrigger.checked,
      waitTime: parseInt(elements.settingLazyWaitTime.value, 10) || 5
    },
    advanced: {
      includeCDN: elements.settingIncludeCDN.checked,
      includeExternal: elements.settingIncludeExternal.checked,
      downloadDuplicates: elements.settingDownloadDuplicates.checked
    }
  };
}

/**
 * Handle Settings Modal
 */
function handleSettingsModal() {
  const settings = loadSettings();
  applySettingsToUI(settings);
  elements.settingsModal.style.display = 'block';
}

/**
 * Handle close Settings Modal
 */
function handleCloseSettingsModal() {
  elements.settingsModal.style.display = 'none';
}

/**
 * Handle save settings
 */
function handleSaveSettings() {
  const settings = getSettingsFromUI();
  if (saveSettings(settings)) {
    appendLog('💾 Settings saved successfully');
    showToast('Settings saved successfully', 'success');
    eventEmitter.emit('settings:saved', settings);
    handleCloseSettingsModal();
  } else {
    showToast('Failed to save settings', 'error');
    eventEmitter.emit('settings:error', { error: 'Failed to save settings' });
  }
}

/**
 * Handle reset settings
 */
function handleResetSettings() {
  if (confirm('Reset all settings to default values?')) {
    const defaultSettings = captureConfig.reset();
    applySettingsToUI(defaultSettings);
    appendLog('🔄 Settings reset to default');
    showToast('Settings reset to default', 'success');
  }
}

/**
 * Get current capture settings
 */
function getCaptureSettings() {
  return captureConfig.getAll();
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Handle Assets Dashboard button click
 */
function handleAssetsDashboard() {
  elements.assetsDashboardModal.style.display = 'block';
  updateAssetDashboard();
}

/**
 * Handle close Assets Dashboard
 */
function handleCloseAssetsDashboard() {
  elements.assetsDashboardModal.style.display = 'none';
}

/**
 * Handle refresh assets
 */
async function handleRefreshAssets() {
  appendLog('🔄 Refreshing asset statistics...');
  await updateAssetDashboard();
  showToast('Asset statistics refreshed', 'success');
}

/**
 * Handle export assets
 */
async function handleExportAssets() {
  try {
    const stats = await calculateAssetStatistics();
    const assets = getAllAssets();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    // Show export options
    const exportType = await showExportOptions();
    if (!exportType) return;
    
    let exportData, filename, mimeType;
    
    switch (exportType) {
      case 'json':
        exportData = {
          timestamp: new Date().toISOString(),
          statistics: stats,
          assets: assets,
          sources: window.sourcesData || []
        };
        filename = `assets-export-${timestamp}.json`;
        mimeType = 'application/json';
        break;
        
      case 'csv':
        exportData = convertAssetsToCSV(assets);
        filename = `assets-export-${timestamp}.csv`;
        mimeType = 'text/csv';
        break;
        
      case 'manifest':
        exportData = generateAssetManifest(assets, stats);
        filename = `asset-manifest-${timestamp}.json`;
        mimeType = 'application/json';
        break;
        
      case 'missing':
        const missingAssets = assets.filter(a => a.status === 'missing' || !a.status);
        exportData = {
          timestamp: new Date().toISOString(),
          missingCount: missingAssets.length,
          missingAssets: missingAssets.map(a => ({
            name: a.name,
            url: a.url,
            type: a.type,
            size: a.size
          }))
        };
        filename = `missing-assets-${timestamp}.json`;
        mimeType = 'application/json';
        break;
        
      default:
        return;
    }
    
    const exportText = typeof exportData === 'string' ? exportData : JSON.stringify(exportData, null, 2);
    const blob = new Blob([exportText], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    appendLog(`📤 Assets exported as ${exportType.toUpperCase()}`);
    showToast(`Assets exported as ${exportType.toUpperCase()}`, 'success');
  } catch (error) {
    errorHandler.handle(error, { function: 'handleExportAssets' }, 'error');
    appendLog(`❌ Export failed: ${error.message}`);
    showToast('Export failed: ' + error.message, 'error');
  }
}

/**
 * Show export options dialog
 */
function showExportOptions() {
  return new Promise((resolve) => {
    const options = ['JSON', 'CSV', 'Manifest', 'Missing Assets Report', 'Cancel'];
    const choice = prompt(
      'Choose export format:\n\n' +
      '1. JSON - Full data export\n' +
      '2. CSV - Spreadsheet format\n' +
      '3. Manifest - Asset manifest file\n' +
      '4. Missing Assets Report - Only missing assets\n' +
      '5. Cancel\n\n' +
      'Enter number (1-5):'
    );
    
    if (!choice) {
      resolve(null);
      return;
    }
    
    const num = parseInt(choice, 10);
    if (num >= 1 && num <= 4) {
      const types = ['json', 'csv', 'manifest', 'missing'];
      resolve(types[num - 1]);
    } else {
      resolve(null);
    }
  });
}

/**
 * Convert assets to CSV format
 */
function convertAssetsToCSV(assets) {
  const headers = ['Name', 'URL', 'Type', 'Size (bytes)', 'Size (human)', 'Status', 'Source'];
  const rows = assets.map(asset => [
    escapeCSV(asset.name || ''),
    escapeCSV(asset.url || ''),
    escapeCSV(asset.type || ''),
    asset.size || 0,
    formatBytes(asset.size || 0),
    escapeCSV(asset.status || 'unknown'),
    escapeCSV(asset.source || 'unknown')
  ]);
  
  const csvRows = [headers.join(','), ...rows.map(row => row.join(','))];
  return csvRows.join('\n');
}

/**
 * Escape CSV field
 */
function escapeCSV(field) {
  if (typeof field !== 'string') return field;
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Generate asset manifest
 */
function generateAssetManifest(assets, stats) {
  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    summary: {
      total: stats.total,
      downloaded: stats.downloaded,
      missing: stats.missing,
      totalSize: stats.totalSize
    },
    assets: assets.map(asset => ({
      name: asset.name,
      url: asset.url,
      type: asset.type,
      size: asset.size,
      status: asset.status,
      source: asset.source
    })),
    breakdown: stats.breakdown
  };
}

/**
 * Handle scan missing assets
 */
async function handleScanMissing() {
  appendLog('🔍 Scanning for missing assets...');
  showToast('Scanning for missing assets...', 'info');
  
  // This would trigger a re-scan of the page
  // For now, just refresh the statistics
  await updateAssetDashboard();
  
  if (assetStatistics.missing > 0) {
    showToast(`Found ${assetStatistics.missing} missing assets`, 'warning');
  } else {
    showToast('No missing assets found', 'success');
  }
}

/**
 * Handle validate assets
 */
async function handleValidateAssets() {
  appendLog('✅ Starting asset validation...');
  showToast('Validating assets...', 'info');
  
  try {
    const assets = getAllAssets();
    const outputDir = elements.outPath.value.trim();
    
    if (!outputDir) {
      showToast('Please select output directory first', 'error');
      return;
    }
    
    // Prepare assets for validation
    const assetsToValidate = assets.map(asset => ({
      url: asset.url,
      path: asset.path || null,
      type: asset.type,
      name: asset.name
    }));
    
    // Validate assets
    const results = await assetValidator.validateAssets(assetsToValidate, {
      checkFileExists: true,
      checkFileSize: true,
      checkContentType: true
    });
    
    const summary = assetValidator.getSummary();
    
    // Log results
    appendLog(`✅ Validation complete: ${summary.valid} valid, ${summary.invalid} invalid, ${summary.missing} missing`);
    
    if (summary.invalid > 0 || summary.missing > 0) {
      appendLog(`❌ Found ${summary.invalid} invalid assets and ${summary.missing} missing assets`);
      showToast(`Validation found issues: ${summary.invalid} invalid, ${summary.missing} missing`, 'warning');
      
      // Log invalid assets
      results.invalid.forEach(result => {
        result.errors.forEach(error => {
          appendLog(`❌ ${result.asset.name}: ${error}`);
        });
      });
    } else {
      showToast('All assets validated successfully!', 'success');
    }
    
    // Emit validation event
    eventEmitter.emit('assets:validated', { results, summary });
    
  } catch (error) {
    errorHandler.handle(error, { function: 'handleValidateAssets' }, 'error');
    appendLog(`❌ Validation error: ${error.message}`);
    showToast('Validation failed: ' + error.message, 'error');
    eventEmitter.emit('assets:validation-error', { error: error.message });
  }
}

// Request notification permission on load
if ('Notification' in window) {
  // Request permission after user interaction
  document.addEventListener('click', () => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, { once: true });
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
