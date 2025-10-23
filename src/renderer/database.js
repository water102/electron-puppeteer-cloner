// database.js - Database utilities for renderer process using Dexie
// Use Dexie from CDN or local copy
const Dexie = window.Dexie;

if (!Dexie) {
  throw new Error('Dexie is not loaded. Please ensure Dexie script is included before this module.');
}

/**
 * Database schema for log management with hostname support
 */
class LogDatabase extends Dexie {
  constructor() {
    super('WebClonerLogs');
    
    // Define database schema
    this.version(1).stores({
      website: '++id, hostname, title, description, favicon, lastVisited, visitCount',
      request: '++id, websiteId, url, method, status, responseTime, headers, body, timestamp',
      file: '++id, websiteId, url, filename, fileType, size, mimeType, extension, timestamp'
    });
    
    // Define relationships
    this.website.hook('creating', function (primKey, obj, trans) {
      obj.lastVisited = Date.now();
      obj.visitCount = 1;
    });
  }
}

// Create database instance
const db = new LogDatabase();

/**
 * Database utilities for log management
 */
export const databaseUtils = {
  /**
   * Initialize database and test connection
   */
  async initializeDatabase() {
    try {
      console.log('[Database] Starting database initialization...');
      
      // Test database connection
      await db.open();
      console.log('[Database] Database opened successfully');
      
      // Test basic operations
      const count = await db.website.count();
      console.log(`[Database] Database initialized with ${count} websites`);
      
      // Test database operations without creating test data
      console.log('[Database] Database operations test completed');
      
      return true;
    } catch (error) {
      console.error('[Database] Database initialization failed:', error);
      throw error;
    }
  },

  /**
   * Get or create website ID for hostname
   * @param {string} hostname - Website hostname
   * @param {string} title - Page title (optional)
   * @returns {Promise<number>} Website ID
   */
  async getOrCreateWebsiteId(hostname, title = '') {
    try {
      // Check if website already exists
      const existing = await db.website.where('hostname').equals(hostname).first();
      if (existing) {
        // Update last visited and visit count
        await db.website.update(existing.id, {
          lastVisited: Date.now(),
          visitCount: (existing.visitCount || 0) + 1,
          title: title || existing.title
        });
        return existing.id;
      }

      // Create new website record
      const websiteId = await db.website.add({
        hostname: hostname,
        title: title,
        description: '',
        favicon: '',
        lastVisited: Date.now(),
        visitCount: 1
      });

      return websiteId;
    } catch (error) {
      console.error('Error getting or creating website ID:', error);
      throw error;
    }
  },

  /**
   * Save request data
   * @param {Object} requestData - Request data
   * @param {string} hostname - Website hostname
   */
  async saveRequest(requestData, hostname) {
    try {
      // Get existing website ID (website should already exist from handleUrlChange)
      const logData = await this.getLogData(hostname);
      if (!logData.website) {
        console.warn(`⚠️ Website not found for hostname: ${hostname} - this should not happen`);
        return;
      }
      
      await db.request.add({
        websiteId: logData.website.id,
        url: requestData.url,
        method: requestData.method,
        status: requestData.status || 200,
        responseTime: requestData.responseTime || 0,
        headers: JSON.stringify(requestData.headers || {}),
        body: requestData.body || '',
        timestamp: requestData.timestamp || Date.now()
      });

      console.log(`[Database] Saved request: ${requestData.method} ${requestData.url}`);
    } catch (error) {
      console.error('Error saving request:', error);
      throw error;
    }
  },

  /**
   * Save file data
   * @param {Object} fileData - File data
   * @param {string} hostname - Website hostname
   */
  async saveFile(fileData, hostname) {
    try {
      // Get existing website ID (website should already exist from handleUrlChange)
      const logData = await this.getLogData(hostname);
      if (!logData.website) {
        console.warn(`⚠️ Website not found for hostname: ${hostname} - this should not happen`);
        return;
      }
      
      await db.file.add({
        websiteId: logData.website.id,
        url: fileData.url,
        filename: fileData.filename || '',
        fileType: fileData.fileType || '',
        size: fileData.size || 0,
        mimeType: fileData.mimeType || '',
        extension: fileData.extension || '',
        timestamp: fileData.timestamp || Date.now()
      });

      console.log(`[Database] Saved file: ${fileData.url}`);
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  },

  /**
   * Get log data for specific hostname
   * @param {string} hostname - Website hostname
   * @returns {Promise<Object>} Log data
   */
  async getLogData(hostname) {
    try {
      console.log(`[Database] Getting log data for hostname: ${hostname}`);
      
      const website = await db.website.where('hostname').equals(hostname).first();
      console.log(`[Database] Found website:`, website);
      
      if (!website) {
        console.log(`[Database] No website found for hostname: ${hostname}`);
        return { requests: [], files: [], website: null };
      }

      const requests = await db.request.where('websiteId').equals(website.id).toArray();
      const files = await db.file.where('websiteId').equals(website.id).toArray();
      
      console.log(`[Database] Found ${requests.length} requests and ${files.length} files`);

      return {
        requests: requests,
        files: files,
        website: website
      };
    } catch (error) {
      console.error('Error getting log data:', error);
      throw error;
    }
  },

  /**
   * Get all websites with data
   * @returns {Promise<Array>} All websites
   */
  async getAllWebsites() {
    try {
      const websites = await db.website.toArray();
      console.log(`[Database] Found ${websites.length} websites:`, websites.map(w => w.hostname));
      
      const result = [];

      for (const website of websites) {
        const requests = await db.request.where('websiteId').equals(website.id).toArray();
        const files = await db.file.where('websiteId').equals(website.id).toArray();

        result.push({
          website: website,
          summary: {
            requestCount: requests.length,
            fileCount: files.length,
            totalCount: requests.length + files.length
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting all websites:', error);
      throw error;
    }
  },

  /**
   * Export data for specific hostname
   * @param {string} hostname - Website hostname
   * @returns {Promise<Object>} Export data
   */
  async exportData(hostname) {
    try {
      const logData = await this.getLogData(hostname);
      
      return {
        hostname: hostname,
        timestamp: new Date().toISOString(),
        requests: logData.requests,
        files: logData.files,
        summary: {
          requestCount: logData.requests.length,
          fileCount: logData.files.length,
          totalCount: logData.requests.length + logData.files.length
        }
      };
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  },

  /**
   * Get current page statistics
   * @param {string} hostname - Current hostname
   * @returns {Promise<Object>} Statistics object
   */
  async getCurrentPageStats(hostname) {
    try {
      const website = await db.website.where('hostname').equals(hostname).first();
      
      if (!website) {
        return {
          hostname: hostname,
          websiteCount: 0,
          requestCount: 0,
          fileCount: 0,
          totalCount: 0,
          websites: [],
          requests: [],
          files: []
        };
      }

      const requests = await db.request.where('websiteId').equals(website.id).toArray();
      const files = await db.file.where('websiteId').equals(website.id).toArray();
      
      return {
        hostname: hostname,
        websiteCount: 1,
        requestCount: requests.length,
        fileCount: files.length,
        totalCount: 1 + requests.length + files.length,
        websites: [website],
        requests: requests,
        files: files
      };
    } catch (error) {
      console.error('Error getting current page stats:', error);
      return {
        hostname: hostname,
        websiteCount: 0,
        requestCount: 0,
        fileCount: 0,
        totalCount: 0,
        websites: [],
        requests: [],
        files: []
      };
    }
  },

  /**
   * Clear all data
   */
  async clearAllData() {
    try {
      await db.website.clear();
      await db.request.clear();
      await db.file.clear();
      console.log('[Database] All data cleared');
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }
};

export default databaseUtils;
