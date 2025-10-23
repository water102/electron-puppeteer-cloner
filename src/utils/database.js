// database.js - Database utilities for log management using Dexie
import Logger from './logger.js';

// Lazy access to Dexie - will be available when needed
function getDexie() {
  if (typeof window === 'undefined') {
    throw new Error('window is not defined - this module should only be used in renderer process');
  }
  if (typeof window.Dexie === 'undefined') {
    throw new Error('Dexie is not loaded - make sure dexie.js script is loaded before this module');
  }
  return window.Dexie;
}

const logger = new Logger('[Database]');

/**
 * Create database instance with lazy Dexie access
 */
function createDatabase() {
  const Dexie = getDexie();
  const db = new Dexie('WebClonerLogs');
  
  // Define database schema
  db.version(1).stores({
    website: '++id, hostname, title, description, favicon, lastVisited, visitCount',
    request: '++id, websiteId, url, method, status, responseTime, headers, body, timestamp',
    file: '++id, websiteId, url, filename, fileType, size, mimeType, extension, timestamp'
  });
  
  // Define relationships
  db.website.hook('creating', function (primKey, obj, trans) {
    obj.lastVisited = Date.now();
    obj.visitCount = 1;
  });
  
  return db;
}

// Create database instance
let db = null;

/**
 * Get database instance (lazy initialization)
 */
function getDatabase() {
  if (!db) {
    db = createDatabase();
  }
  return db;
}

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
      
      // Get database instance
      const database = getDatabase();
      
      // Test database connection
      await database.open();
      console.log('[Database] Database opened successfully');
      logger.success('Database opened successfully');
      
      // Test basic operations
      const count = await database.website.count();
      console.log(`[Database] Database initialized with ${count} websites`);
      logger.info(`Database initialized with ${count} websites`);
      
      // Test creating a sample record
      const testWebsite = await this.getOrCreateWebsiteId('test.example.com', 'Test Website');
      console.log(`[Database] Test website created with ID: ${testWebsite}`);
      
      return true;
    } catch (error) {
      console.error('[Database] Database initialization failed:', error);
      logger.error('Database initialization failed: ' + error.message);
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
      // Get database instance
      const database = getDatabase();
      
      // Check if website already exists
      const existing = await database.website.where('hostname').equals(hostname).first();
      if (existing) {
        // Update last visited and visit count
        await database.website.update(existing.id, {
          lastVisited: Date.now(),
          visitCount: (existing.visitCount || 0) + 1,
          title: title || existing.title
        });
        return existing.id;
      }
      
      // Create new website record
      const websiteId = await database.website.add({
        hostname: hostname,
        title: title,
        description: '',
        favicon: '',
        lastVisited: Date.now(),
        visitCount: 1
      });
      
      console.log(`✅ Created new website record: ${hostname} (ID: ${websiteId})`);
      return websiteId;
    } catch (error) {
      console.error('Error getting or creating website ID:', error);
      return null;
    }
  },

  /**
   * Save HTTP request to database
   * @param {Object} requestData - Request data
   * @param {string} hostname - Website hostname
   * @returns {Promise<void>}
   */
  async saveRequest(requestData, hostname) {
    if (!requestData || !requestData.url) return;
    
    try {
      // Get database instance
      const database = getDatabase();
      
      // Get existing website ID (website should already exist from handleUrlChange)
      const website = await database.website.where('hostname').equals(hostname).first();
      if (!website) {
        console.warn(`⚠️ Website not found for hostname: ${hostname} - this should not happen`);
        return;
      }
      
      const requestRecord = {
        url: requestData.url,
        websiteId: website.id,
        method: requestData.method || 'GET',
        status: requestData.status || 200,
        responseTime: requestData.responseTime || 0,
        headers: JSON.stringify(requestData.headers || {}),
        body: requestData.body || '',
        timestamp: requestData.timestamp || Date.now()
      };

      await database.request.add(requestRecord);
      console.log(`✅ Saved request: ${requestData.method} ${requestData.url}`);
    } catch (error) {
      console.error('Error saving request:', error);
    }
  },

  /**
   * Save file data to database
   * @param {Object} fileData - File data
   * @param {string} hostname - Website hostname
   * @returns {Promise<void>}
   */
  async saveFile(fileData, hostname) {
    if (!fileData || !fileData.url) return;
    
    try {
      // Get database instance
      const database = getDatabase();
      
      // Get existing website ID (website should already exist from handleUrlChange)
      const website = await database.website.where('hostname').equals(hostname).first();
      if (!website) {
        console.warn(`⚠️ Website not found for hostname: ${hostname} - this should not happen`);
        return;
      }
      
      const fileRecord = {
        url: fileData.url,
        filename: this.getFilenameFromUrl(fileData.url),
        fileType: this.getFileTypeFromUrl(fileData.url),
        size: fileData.size || 0,
        timestamp: fileData.timestamp || Date.now(),
        websiteId: website.id,
        mimeType: this.getMimeTypeFromExtension(this.getFileTypeFromUrl(fileData.url)),
        extension: this.getFileTypeFromUrl(fileData.url)
      };

      await database.file.add(fileRecord);
      console.log(`✅ Saved file: ${fileData.url}`);
    } catch (error) {
      console.error('Error saving file:', error);
    }
  },

  /**
   * Get requests by hostname
   * @param {string} hostname - Website hostname
   * @returns {Promise<Array>} Array of requests
   */
  async getRequestsByHostname(hostname) {
    try {
      const database = getDatabase();
      const website = await database.website.where('hostname').equals(hostname).first();
      if (!website) return [];
      
      return await database.request.where('websiteId').equals(website.id).toArray();
    } catch (error) {
      console.error('Error getting requests by hostname:', error);
      return [];
    }
  },

  /**
   * Get files by hostname
   * @param {string} hostname - Website hostname
   * @returns {Promise<Array>} Array of files
   */
  async getFilesByHostname(hostname) {
    try {
      const database = getDatabase();
      const website = await database.website.where('hostname').equals(hostname).first();
      if (!website) return [];
      
      return await database.file.where('websiteId').equals(website.id).toArray();
    } catch (error) {
      console.error('Error getting files by hostname:', error);
      return [];
    }
  },

  /**
   * Get all websites with their data
   * @returns {Promise<Array>} Array of websites with related data
   */
  async getAllWebsitesWithData() {
    try {
      const database = getDatabase();
      const websites = await database.website.toArray();
      const result = [];
      
      for (const website of websites) {
        const requests = await database.request.where('websiteId').equals(website.id).toArray();
        const files = await database.file.where('websiteId').equals(website.id).toArray();
        
        result.push({
          website: website,
          requests: requests,
          files: files,
          summary: {
            requestCount: requests.length,
            fileCount: files.length,
            totalCount: requests.length + files.length
          }
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error getting all websites with data:', error);
      return [];
    }
  },

  /**
   * Get current page statistics
   * @param {string} hostname - Current hostname
   * @returns {Promise<Object>} Statistics object
   */
  async getCurrentPageStats(hostname) {
    try {
      const database = getDatabase();
      const websites = await database.website.where('hostname').equals(hostname).toArray();
      const requests = await this.getRequestsByHostname(hostname);
      const files = await this.getFilesByHostname(hostname);
      
      return {
        hostname: hostname,
        websiteCount: websites.length,
        requestCount: requests.length,
        fileCount: files.length,
        totalCount: websites.length + requests.length + files.length,
        websites: websites,
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
   * @returns {Promise<void>}
   */
  async clearAllData() {
    try {
      const database = getDatabase();
      await database.website.clear();
      await database.request.clear();
      await database.file.clear();
      console.log('✅ All database data cleared');
    } catch (error) {
      console.error('Error clearing database:', error);
    }
  },

  /**
   * Export data to JSON
   * @param {string} hostname - Optional hostname filter
   * @returns {Promise<Object>} Exported data
   */
  async exportData(hostname = null) {
    try {
      let data;
      if (hostname) {
        const database = getDatabase();
        const website = await database.website.where('hostname').equals(hostname).first();
        if (!website) return null;
        
        const requests = await database.request.where('websiteId').equals(website.id).toArray();
        const files = await database.file.where('websiteId').equals(website.id).toArray();
        
        data = {
          hostname: hostname,
          timestamp: new Date().toISOString(),
          website: website,
          requests: requests,
          files: files,
          summary: {
            requestCount: requests.length,
            fileCount: files.length,
            totalCount: requests.length + files.length
          }
        };
      } else {
        data = await this.getAllWebsitesWithData();
      }
      
      return data;
    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  },

  // Helper methods
  getFilenameFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      return pathname.split('/').pop() || 'index';
    } catch {
      return 'unknown';
    }
  },

  getFileTypeFromUrl(url) {
    const extension = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    return extension || 'unknown';
  },

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
};

export default databaseUtils;
