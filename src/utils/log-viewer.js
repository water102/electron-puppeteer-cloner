// log-viewer.js - Log viewer UI components and functionality

/**
 * Log viewer UI components and functionality
 */
export class LogViewer {
  constructor() {
    this.dialog = null;
    this.currentHostname = '';
    this.activeFilters = new Set();
    this.isVisible = false;
  }

  /**
   * Create and show the log viewer dialog
   */
  async show() {
    if (this.isVisible) {
      this.hide();
      return;
    }

    this.isVisible = true;
    this.currentHostname = this.getCurrentHostname();

    // Create dialog if it doesn't exist
    if (!this.dialog) {
      this.dialog = this.createDialog();
    }

    // Show dialog
    this.dialog.style.display = 'flex';

    // Load and display data
    await this.loadData();
  }

  /**
   * Hide the log viewer dialog
   */
  hide() {
    if (this.dialog) {
      this.dialog.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Get current hostname from the source webview
   */
  getCurrentHostname() {
    try {
      const srcView = document.getElementById('srcView');
      if (srcView && srcView.getURL) {
        const url = srcView.getURL();
        console.log(`[LogViewer] Webview URL: ${url}`);
        if (url && !url.startsWith('about:')) {
          const hostname = new URL(url).hostname;
          console.log(`[LogViewer] Extracted hostname: ${hostname}`);
          return hostname;
        }
      }

      // Fallback to input field
      const srcUrl = document.getElementById('srcUrl');
      if (srcUrl && srcUrl.value) {
        const url = srcUrl.value.trim();
        console.log(`[LogViewer] Input URL: ${url}`);
        if (url && !url.startsWith('about:')) {
          const hostname = new URL(url).hostname;
          console.log(`[LogViewer] Input hostname: ${hostname}`);
          return hostname;
        }
      }
    } catch (error) {
      console.warn('Could not get current hostname:', error);
    }
    console.log(`[LogViewer] No hostname found, using 'unknown'`);
    return 'unknown';
  }

  /**
   * Create the log viewer dialog
   */
  createDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'log-viewer-dialog';
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: none;
      z-index: 10000;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      width: 90%;
      max-width: 1200px;
      height: 90%;
      max-height: 800px;
      background: #1e1e1e;
      border-radius: 10px;
      color: white;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
    `;

    content.innerHTML = `
      <div class="log-header" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-bottom: 1px solid #333;
        flex-shrink: 0;
      ">
        <div>
          <h2 style="margin: 0; color: #4caf50;">📊 Log Viewer</h2>
          <div id="currentHostname" style="font-size: 12px; color: #888; margin-top: 5px;"></div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="refreshLogs" style="
            padding: 8px 16px;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">🔄 Refresh</button>
          <button id="exportLogs" style="
            padding: 8px 16px;
            background: #ff9800;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">📥 Export</button>
          <button id="clearLogs" style="
            padding: 8px 16px;
            background: #c62828;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">🗑️ Clear</button>
          <button id="closeLogs" style="
            padding: 8px 16px;
            background: #666;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">✕ Close</button>
        </div>
      </div>
      
      <div class="log-tabs" style="
        display: flex;
        border-bottom: 1px solid #333;
        flex-shrink: 0;
        gap: 4px;
        padding: 4px;
      ">
        <button class="log-tab active" data-tab="websites" style="
          padding: 12px 20px;
          background: #1976d2;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        ">🌍 Websites</button>
        <button class="log-tab" data-tab="files" style="
          padding: 12px 20px;
          background: #424242;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        ">📁 Files</button>
        <button class="log-tab" data-tab="requests" style="
          padding: 12px 20px;
          background: #424242;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        ">🌐 Requests</button>
      </div>
      
      <div class="log-filters" style="
        padding: 15px 20px;
        border-bottom: 1px solid #333;
        flex-shrink: 0;
      ">
        <div style="display: flex; gap: 10px; align-items: center;">
          <input id="logFilter" placeholder="Filter logs..." style="
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #555;
            border-radius: 6px;
            background: #2a2a2a;
            color: white;
            font-size: 13px;
          ">
          <button id="clearFilters" style="
            padding: 8px 12px;
            background: #666;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Clear Filters</button>
        </div>
      </div>
      
      <div class="log-content" style="
        flex: 1;
        overflow: auto;
        padding: 20px;
        background: #121212;
      ">
        <div id="websitesTab" class="log-tab-content">
          <div id="websitesList" style="font-family: monospace; font-size: 12px;"></div>
        </div>
        <div id="filesTab" class="log-tab-content" style="display: none;">
          <div id="filesList" style="font-family: monospace; font-size: 12px;"></div>
        </div>
        <div id="requestsTab" class="log-tab-content" style="display: none;">
          <div id="requestsList" style="font-family: monospace; font-size: 12px;"></div>
        </div>
      </div>
    `;

    dialog.appendChild(content);
    document.body.appendChild(dialog);

    // Setup event listeners
    this.setupEventListeners(dialog);

    return dialog;
  }

  /**
   * Setup event listeners for the dialog
   */
  setupEventListeners(dialog) {
    // Close button
    dialog.querySelector('#closeLogs').addEventListener('click', () => {
      this.hide();
    });

    // Refresh button
    dialog.querySelector('#refreshLogs').addEventListener('click', () => {
      this.loadData();
    });

    // Export button
    dialog.querySelector('#exportLogs').addEventListener('click', () => {
      this.exportData();
    });

    // Clear button
    dialog.querySelector('#clearLogs').addEventListener('click', () => {
      this.clearData();
    });

    // Tab switching
    dialog.querySelectorAll('.log-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Filter input
    dialog.querySelector('#logFilter').addEventListener('input', (e) => {
      this.filterContent(e.target.value);
    });

    // Clear filters
    dialog.querySelector('#clearFilters').addEventListener('click', () => {
      dialog.querySelector('#logFilter').value = '';
      this.filterContent('');
    });

    // Click outside to close
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        this.hide();
      }
    });
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    // Update tab buttons
    this.dialog.querySelectorAll('.log-tab').forEach(tab => {
      tab.classList.remove('active');
      tab.style.background = '#424242';
    });

    this.dialog.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    this.dialog.querySelector(`[data-tab="${tabName}"]`).style.background = '#1976d2';

    // Update tab content
    this.dialog.querySelectorAll('.log-tab-content').forEach(content => {
      content.style.display = 'none';
    });

    this.dialog.querySelector(`#${tabName}Tab`).style.display = 'block';

    // Load data for the active tab
    this.loadTabData(tabName);
  }

  /**
   * Load data for all tabs
   */
  async loadData() {
    this.currentHostname = this.getCurrentHostname();
    this.dialog.querySelector('#currentHostname').textContent =
      `Current hostname: ${this.currentHostname}`;

    await this.loadTabData('websites');
  }

  /**
   * Load data for specific tab
   */
  async loadTabData(tabName) {
    try {
      switch (tabName) {
        case 'requests':
          await this.loadRequests();
          break;
        case 'files':
          await this.loadFiles();
          break;
        case 'websites':
          await this.loadWebsites();
          break;
      }
    } catch (error) {
      console.error(`Error loading ${tabName} data:`, error);
    }
  }

  /**
   * Load and display requests
   */
  async loadRequests() {
    const requestsList = this.dialog.querySelector('#requestsList');
    requestsList.innerHTML = '<div style="color: #888;">Loading requests...</div>';

    try {
      // Import database utils dynamically
      const { databaseUtils } = await import('../renderer/database.js');
      const logData = await databaseUtils.getLogData(this.currentHostname);
      const requests = logData.requests || [];

      if (requests.length === 0) {
        requestsList.innerHTML = '<div style="color: #888;">No requests found for this hostname</div>';
        return;
      }

      const html = requests.map(request => {
        const headers = JSON.parse(request.headers || '{}');
        const timestamp = new Date(request.timestamp).toLocaleString();

        return `
          <div class="request-item" style="
            margin-bottom: 15px;
            padding: 10px;
            background: #2a2a2a;
            border-radius: 6px;
            border-left: 4px solid ${this.getStatusColor(request.status)};
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="display: flex; gap: 10px; align-items: center;">
                <span style="
                  background: ${this.getMethodColor(request.method)};
                  color: white;
                  padding: 2px 6px;
                  border-radius: 4px;
                  font-size: 11px;
                  font-weight: bold;
                ">${request.method}</span>
                <span style="color: #64b5f6; font-weight: bold;">${request.status}</span>
                <span style="color: #888; font-size: 11px;">${request.responseTime}ms</span>
              </div>
              <span style="color: #888; font-size: 11px;">${timestamp}</span>
            </div>
            <div style="color: #ccc; margin-bottom: 8px; word-break: break-all;">
              <strong>URL:</strong> ${request.url}
            </div>
            ${request.body ? `
              <div style="color: #888; font-size: 11px;">
                <strong>Body:</strong> ${request.body.substring(0, 200)}${request.body.length > 200 ? '...' : ''}
              </div>
            ` : ''}
            <div style="color: #888; font-size: 11px; margin-top: 8px;">
              <strong>Headers:</strong> ${Object.keys(headers).length} headers
            </div>
          </div>
        `;
      }).join('');

      requestsList.innerHTML = html;
    } catch (error) {
      requestsList.innerHTML = `<div style="color: #c62828;">Error loading requests: ${error.message}</div>`;
    }
  }

  /**
   * Load and display files
   */
  async loadFiles() {
    const filesList = this.dialog.querySelector('#filesList');
    filesList.innerHTML = '<div style="color: #888;">Loading files...</div>';

    try {
      // Import database utils dynamically
      const { databaseUtils } = await import('../renderer/database.js');
      const logData = await databaseUtils.getLogData(this.currentHostname);
      const files = logData.files || [];

      if (files.length === 0) {
        filesList.innerHTML = '<div style="color: #888;">No files found for this hostname</div>';
        return;
      }

      const html = files.map(file => {
        const timestamp = new Date(file.timestamp).toLocaleString();
        const sizeKB = Math.round(file.size / 1024);

        return `
          <div class="file-item" style="
            margin-bottom: 15px;
            padding: 10px;
            background: #2a2a2a;
            border-radius: 6px;
            border-left: 4px solid #4caf50;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="display: flex; gap: 10px; align-items: center;">
                <span style="
                  background: #4caf50;
                  color: white;
                  padding: 2px 6px;
                  border-radius: 4px;
                  font-size: 11px;
                  font-weight: bold;
                ">${file.fileType.toUpperCase()}</span>
                <span style="color: #888; font-size: 11px;">${sizeKB}KB</span>
              </div>
              <span style="color: #888; font-size: 11px;">${timestamp}</span>
            </div>
            <div style="color: #ccc; margin-bottom: 8px; word-break: break-all;">
              <strong>URL:</strong> ${file.url}
            </div>
            <div style="color: #888; font-size: 11px;">
              <strong>Filename:</strong> ${file.filename} | 
              <strong>MIME:</strong> ${file.mimeType}
            </div>
          </div>
        `;
      }).join('');

      filesList.innerHTML = html;
    } catch (error) {
      filesList.innerHTML = `<div style="color: #c62828;">Error loading files: ${error.message}</div>`;
    }
  }

  /**
   * Load and display websites
   */
  async loadWebsites() {
    const websitesList = this.dialog.querySelector('#websitesList');
    websitesList.innerHTML = '<div style="color: #888;">Loading websites...</div>';

    try {
      // Import database utils dynamically
      const { databaseUtils } = await import('../renderer/database.js');
      const websites = await databaseUtils.getAllWebsites();

      console.log(`[LogViewer] Loading websites tab. Current hostname: ${this.currentHostname}`);
      console.log(`[LogViewer] Available websites:`, websites.map(w => w.website.hostname));

      if (websites.length === 0) {
        websitesList.innerHTML = '<div style="color: #888;">No websites found</div>';
        return;
      }

      const html = websites.map(websiteData => {
        const website = websiteData.website;
        const lastVisited = new Date(website.lastVisited).toLocaleString();

        return `
          <div class="website-item" style="
            margin-bottom: 15px;
            padding: 15px;
            background: #2a2a2a;
            border-radius: 6px;
            border-left: 4px solid #ff9800;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h3 style="margin: 0; color: #4caf50;">${website.hostname}</h3>
              <span style="color: #888; font-size: 11px;">${lastVisited}</span>
            </div>
            <div style="color: #ccc; margin-bottom: 10px;">
              <strong>Title:</strong> ${website.title || 'No title'}
            </div>
            <div style="display: flex; gap: 20px; color: #888; font-size: 12px;">
              <span><strong>Visits:</strong> ${website.visitCount}</span>
              <span><strong>Requests:</strong> ${websiteData.summary.requestCount}</span>
              <span><strong>Files:</strong> ${websiteData.summary.fileCount}</span>
              <span><strong>Total:</strong> ${websiteData.summary.totalCount}</span>
            </div>
          </div>
        `;
      }).join('');

      websitesList.innerHTML = html;
    } catch (error) {
      websitesList.innerHTML = `<div style="color: #c62828;">Error loading websites: ${error.message}</div>`;
    }
  }

  /**
   * Filter content based on search term
   */
  filterContent(searchTerm) {
    const activeTab = this.dialog.querySelector('.log-tab.active').dataset.tab;
    const content = this.dialog.querySelector(`#${activeTab}Tab`);

    if (!searchTerm.trim()) {
      // Show all items
      content.querySelectorAll('.request-item, .file-item, .website-item').forEach(item => {
        item.style.display = 'block';
      });
      return;
    }

    const term = searchTerm.toLowerCase();
    content.querySelectorAll('.request-item, .file-item, .website-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(term) ? 'block' : 'none';
    });
  }

  /**
   * Export data to JSON file
   */
  async exportData() {
    try {
      // Import database utils dynamically
      const { databaseUtils } = await import('../renderer/database.js');
      const data = await databaseUtils.exportData(this.currentHostname);
      if (!data) {
        alert('No data to export for this hostname');
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${this.currentHostname}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('✅ Data exported successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Error exporting data: ' + error.message);
    }
  }

  /**
   * Clear all data
   */
  async clearData() {
    if (!confirm('Are you sure you want to clear all log data? This action cannot be undone.')) {
      return;
    }

    try {
      // Import database utils dynamically
      const { databaseUtils } = await import('../renderer/database.js');
      await databaseUtils.clearAllData();
      await this.loadData();
      console.log('✅ All log data cleared');
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Error clearing data: ' + error.message);
    }
  }

  /**
   * Get status color for HTTP status codes
   */
  getStatusColor(status) {
    if (status >= 200 && status < 300) return '#4caf50'; // Green
    if (status >= 300 && status < 400) return '#ff9800'; // Orange
    if (status >= 400 && status < 500) return '#f44336'; // Red
    if (status >= 500) return '#9c27b0'; // Purple
    return '#666'; // Gray
  }

  /**
   * Get method color for HTTP methods
   */
  getMethodColor(method) {
    switch (method.toUpperCase()) {
      case 'GET': return '#4caf50';
      case 'POST': return '#2196f3';
      case 'PUT': return '#ff9800';
      case 'DELETE': return '#f44336';
      case 'PATCH': return '#9c27b0';
      default: return '#666';
    }
  }
}

// Create global instance
export const logViewer = new LogViewer();
