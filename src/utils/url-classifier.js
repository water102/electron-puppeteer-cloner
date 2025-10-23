// url-classifier.js - URL classification for renderer process

import Logger from './logger.js';

const logger = new Logger('[URLClassifier]');

/**
 * URL classification types
 */
export const URL_TYPES = {
  API_REQUEST: 'api_request',
  STATIC_FILE: 'static_file',
  UNKNOWN: 'unknown'
};

/**
 * Static file extensions
 */
const STATIC_FILE_EXTENSIONS = [
  '.html', '.htm', '.css', '.js', '.json', '.xml',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.txt', '.csv', '.zip', '.rar', '.tar', '.gz',
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.ogg',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
];

/**
 * API endpoint patterns
 */
const API_PATTERNS = [
  '/api/', '/v1/', '/v2/', '/v3/', '/v4/', '/v5/',
  '/rest/', '/graphql/', '/rpc/', '/service/',
  '/endpoint/', '/controller/', '/handler/',
  '/auth/', '/login/', '/logout/', '/register/',
  '/user/', '/users/', '/admin/', '/dashboard/',
  '/data/', '/query/', '/search/', '/filter/',
  '/upload/', '/download/', '/export/', '/import/'
];

/**
 * URL Classifier for renderer process
 */
export class URLClassifier {
  constructor() {
    this.classificationCache = new Map();
  }

  /**
   * Classify a URL as API request or static file
   * @param {string} url - URL to classify
   * @param {string} method - HTTP method (optional)
   * @param {Object} context - Additional context (optional)
   * @returns {Object} Classification result
   */
  classifyUrl(url, method = 'GET', context = {}) {
    try {
      // Check cache first
      const cacheKey = `${method}-${url}`;
      if (this.classificationCache.has(cacheKey)) {
        return this.classificationCache.get(cacheKey);
      }

      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      const searchParams = urlObj.searchParams.toString();
      
      // Classification logic
      const classification = this.performClassification(url, pathname, searchParams, method, context);
      
      // Cache the result
      this.classificationCache.set(cacheKey, classification);
      
      return classification;
    } catch (error) {
      logger.error(`Error classifying URL ${url}:`, error);
      return {
        type: URL_TYPES.UNKNOWN,
        confidence: 0,
        reason: 'Invalid URL format',
        url: url,
        method: method
      };
    }
  }

  /**
   * Perform the actual classification logic
   * @param {string} url - Original URL
   * @param {string} pathname - URL pathname (lowercase)
   * @param {string} searchParams - URL search parameters
   * @param {string} method - HTTP method
   * @param {Object} context - Additional context
   * @returns {Object} Classification result
   */
  performClassification(url, pathname, searchParams, method, context) {
    // Check for API patterns
    const apiScore = this.calculateApiScore(pathname, searchParams, method, context);
    
    // Check for static file patterns
    const staticScore = this.calculateStaticScore(pathname, url, context);
    
    // Determine classification
    if (apiScore.score > staticScore.score) {
      return {
        type: URL_TYPES.API_REQUEST,
        confidence: apiScore.score,
        reason: apiScore.reason,
        url: url,
        method: method,
        details: {
          apiPatterns: apiScore.patterns,
          staticPatterns: staticScore.patterns
        }
      };
    } else if (staticScore.score > 0) {
      return {
        type: URL_TYPES.STATIC_FILE,
        confidence: staticScore.score,
        reason: staticScore.reason,
        url: url,
        method: method,
        details: {
          fileType: staticScore.fileType,
          extension: staticScore.extension,
          apiPatterns: apiScore.patterns,
          staticPatterns: staticScore.patterns
        }
      };
    } else {
      return {
        type: URL_TYPES.UNKNOWN,
        confidence: 0,
        reason: 'No clear classification pattern',
        url: url,
        method: method,
        details: {
          apiPatterns: apiScore.patterns,
          staticPatterns: staticScore.patterns
        }
      };
    }
  }

  /**
   * Calculate API score for URL
   * @param {string} pathname - URL pathname
   * @param {string} searchParams - URL search parameters
   * @param {string} method - HTTP method
   * @param {Object} context - Additional context
   * @returns {Object} API score result
   */
  calculateApiScore(pathname, searchParams, method, context) {
    let score = 0;
    const patterns = [];
    let reason = '';

    // Check API patterns
    for (const pattern of API_PATTERNS) {
      if (pathname.includes(pattern)) {
        score += 0.8;
        patterns.push(`API pattern: ${pattern}`);
      }
    }

    // Check HTTP methods
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      score += 0.6;
      patterns.push(`HTTP method: ${method}`);
    }

    // Check for query parameters (common in APIs)
    if (searchParams) {
      score += 0.3;
      patterns.push('Has query parameters');
    }

    // Check for JSON-like paths
    if (pathname.includes('.json') || pathname.includes('format=json')) {
      score += 0.7;
      patterns.push('JSON format indicator');
    }

    // Check for REST-like patterns
    if (/\/(\d+)$/.test(pathname) || /\/([a-f0-9-]{8,})$/.test(pathname)) {
      score += 0.5;
      patterns.push('REST-like ID pattern');
    }

    // Check for dynamic segments
    if (pathname.includes('{') || pathname.includes('[') || pathname.includes('*')) {
      score += 0.4;
      patterns.push('Dynamic segment pattern');
    }

    if (score > 0) {
      reason = `API indicators: ${patterns.join(', ')}`;
    }

    return { score, patterns, reason };
  }

  /**
   * Calculate static file score for URL
   * @param {string} pathname - URL pathname
   * @param {string} url - Original URL
   * @param {Object} context - Additional context
   * @returns {Object} Static score result
   */
  calculateStaticScore(pathname, url, context) {
    let score = 0;
    const patterns = [];
    let reason = '';
    let fileType = 'unknown';
    let extension = '';

    // Check file extensions
    const ext = this.getFileExtension(pathname);
    if (ext) {
      extension = ext;
      if (STATIC_FILE_EXTENSIONS.includes(ext)) {
        score += 0.9;
        patterns.push(`Static file extension: ${ext}`);
        fileType = this.getFileTypeFromExtension(ext);
      }
    }

    // Check for common static file patterns
    if (pathname.includes('/assets/') || pathname.includes('/static/') || 
        pathname.includes('/public/') || pathname.includes('/resources/')) {
      score += 0.7;
      patterns.push('Static directory pattern');
    }

    // Check for CDN patterns
    if (this.isCdnUrl(url)) {
      score += 0.8;
      patterns.push('CDN URL pattern');
    }

    // Check for versioned static files
    if (/\/(v\d+\/|version\/|\d+\.\d+\.\d+\/)/.test(pathname)) {
      score += 0.6;
      patterns.push('Versioned static file');
    }

    // Check for minified files
    if (pathname.includes('.min.') || pathname.includes('.bundle.')) {
      score += 0.5;
      patterns.push('Minified file pattern');
    }

    if (score > 0) {
      reason = `Static file indicators: ${patterns.join(', ')}`;
    }

    return { score, patterns, reason, fileType, extension };
  }

  /**
   * Get file extension from pathname
   * @param {string} pathname - URL pathname
   * @returns {string|null} File extension
   */
  getFileExtension(pathname) {
    const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return match ? `.${match[1].toLowerCase()}` : null;
  }

  /**
   * Get file type from extension
   * @param {string} extension - File extension
   * @returns {string} File type
   */
  getFileTypeFromExtension(extension) {
    const typeMap = {
      '.html': 'html', '.htm': 'html',
      '.css': 'css',
      '.js': 'javascript', '.mjs': 'javascript',
      '.json': 'json',
      '.png': 'image', '.jpg': 'image', '.jpeg': 'image', 
      '.gif': 'image', '.svg': 'image', '.webp': 'image',
      '.woff': 'font', '.woff2': 'font', '.ttf': 'font', '.eot': 'font',
      '.pdf': 'document', '.txt': 'text', '.csv': 'data'
    };
    return typeMap[extension] || 'unknown';
  }

  /**
   * Check if URL is from CDN
   * @param {string} url - URL to check
   * @returns {boolean} True if CDN URL
   */
  isCdnUrl(url) {
    const cdnDomains = [
      'cdn.', 'cdnjs.', 'unpkg.', 'jsdelivr.', 'googleapis.', 'gstatic.',
      'cloudflare.', 'bootstrapcdn.', 'fontawesome.', 'jquery.',
      'ajax.googleapis.', 'fonts.googleapis.', 'fonts.gstatic.'
    ];
    
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return cdnDomains.some(domain => hostname.includes(domain));
    } catch {
      return false;
    }
  }

  /**
   * Clear classification cache
   */
  clearCache() {
    this.classificationCache.clear();
    this.processedUrls.clear();
    logger.info('Classification cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.classificationCache.size,
      processedUrls: this.processedUrls.size
    };
  }
}

/**
 * URL Database Manager for renderer process
 * Handles URL data storage with existence checking using renderer database
 */
export class UrlDatabaseManager {
  constructor() {
    this.urlClassifier = new URLClassifier();
  }

  /**
   * Process and save URL data with classification
   * @param {string} url - URL to process
   * @param {string} method - HTTP method
   * @param {Object} additionalData - Additional data to store
   * @param {string} hostname - Website hostname
   * @returns {Promise<Object>} Processing result
   */
  async processUrl(url, method = 'GET', additionalData = {}, hostname) {
    try {
      // Classify the URL
      const classification = this.urlClassifier.classifyUrl(url, method, additionalData);
      
      // Check if URL already exists
      const exists = await this.checkUrlExists(url, method, hostname, classification.type);
      
      if (exists) {
        logger.info(`URL already exists: ${method} ${url} (${classification.type})`);
        return {
          success: false,
          reason: 'URL already exists',
          classification: classification,
          existing: true
        };
      }

      // Save based on classification
      let saveResult;
      if (classification.type === URL_TYPES.API_REQUEST) {
        saveResult = await this.saveApiRequest(url, method, additionalData, hostname, classification);
      } else if (classification.type === URL_TYPES.STATIC_FILE) {
        saveResult = await this.saveStaticFile(url, method, additionalData, hostname, classification);
      } else {
        // Save as unknown type
        saveResult = await this.saveUnknownUrl(url, method, additionalData, hostname, classification);
      }

      return {
        success: true,
        classification: classification,
        saveResult: saveResult,
        existing: false
      };

    } catch (error) {
      logger.error(`Error processing URL ${url}:`, error);
      return {
        success: false,
        error: error.message,
        classification: null
      };
    }
  }

  /**
   * Check if URL already exists in database
   * @param {string} url - URL to check
   * @param {string} method - HTTP method
   * @param {string} hostname - Website hostname
   * @param {string} type - URL type (api_request, static_file, unknown)
   * @returns {Promise<boolean>} True if exists
   */
  async checkUrlExists(url, method, hostname, type) {
    try {
      // Use the renderer database utils directly
      const { databaseUtils } = await import('./database.js');
      const website = await databaseUtils.getOrCreateWebsiteId(hostname);
      if (!website) return false;

      if (type === URL_TYPES.API_REQUEST) {
        const requests = await databaseUtils.getRequestsByHostname(hostname);
        return requests.some(req => req.url === url && req.method === method);
      } else if (type === URL_TYPES.STATIC_FILE) {
        const files = await databaseUtils.getFilesByHostname(hostname);
        return files.some(file => file.url === url);
      } else {
        // Check both tables for unknown types
        const requests = await databaseUtils.getRequestsByHostname(hostname);
        const files = await databaseUtils.getFilesByHostname(hostname);
        return requests.some(req => req.url === url) || files.some(file => file.url === url);
      }
    } catch (error) {
      logger.error(`Error checking URL existence:`, error);
      return false;
    }
  }

  /**
   * Save API request to database
   * @param {string} url - Request URL
   * @param {string} method - HTTP method
   * @param {Object} additionalData - Additional data
   * @param {string} hostname - Website hostname
   * @param {Object} classification - Classification result
   * @returns {Promise<Object>} Save result
   */
  async saveApiRequest(url, method, additionalData, hostname, classification) {
    const { databaseUtils } = await import('./database.js');
    const requestData = {
      url: url,
      method: method,
      status: additionalData.status || 200,
      responseTime: additionalData.responseTime || 0,
      headers: additionalData.headers || {},
      body: additionalData.body || '',
      timestamp: additionalData.timestamp || Date.now(),
      classification: classification
    };

    await databaseUtils.saveRequest(requestData, hostname);
    
    logger.info(`Saved API request: ${method} ${url}`);
    return {
      type: 'api_request',
      url: url,
      method: method,
      classification: classification
    };
  }

  /**
   * Save static file to database
   * @param {string} url - File URL
   * @param {string} method - HTTP method
   * @param {Object} additionalData - Additional data
   * @param {string} hostname - Website hostname
   * @param {Object} classification - Classification result
   * @returns {Promise<Object>} Save result
   */
  async saveStaticFile(url, method, additionalData, hostname, classification) {
    const { databaseUtils } = await import('./database.js');
    const fileData = {
      url: url,
      size: additionalData.size || 0,
      timestamp: additionalData.timestamp || Date.now(),
      classification: classification,
      fileType: classification.details?.fileType || 'unknown',
      extension: classification.details?.extension || '',
      mimeType: this.getMimeTypeFromExtension(classification.details?.extension || '')
    };

    await databaseUtils.saveFile(fileData, hostname);
    
    logger.info(`Saved static file: ${url}`);
    return {
      type: 'static_file',
      url: url,
      fileType: classification.details?.fileType || 'unknown',
      classification: classification
    };
  }

  /**
   * Save unknown URL to database
   * @param {string} url - URL
   * @param {string} method - HTTP method
   * @param {Object} additionalData - Additional data
   * @param {string} hostname - Website hostname
   * @param {Object} classification - Classification result
   * @returns {Promise<Object>} Save result
   */
  async saveUnknownUrl(url, method, additionalData, hostname, classification) {
    const { databaseUtils } = await import('./database.js');
    // Try to save as request first (more common for unknown types)
    const requestData = {
      url: url,
      method: method,
      status: additionalData.status || 200,
      responseTime: additionalData.responseTime || 0,
      headers: additionalData.headers || {},
      body: additionalData.body || '',
      timestamp: additionalData.timestamp || Date.now(),
      classification: classification
    };

    await databaseUtils.saveRequest(requestData, hostname);
    
    logger.info(`Saved unknown URL as request: ${method} ${url}`);
    return {
      type: 'unknown',
      url: url,
      method: method,
      classification: classification
    };
  }

  /**
   * Get MIME type from file extension
   * @param {string} extension - File extension
   * @returns {string} MIME type
   */
  getMimeTypeFromExtension(extension) {
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Get classification statistics
   * @param {string} hostname - Website hostname
   * @returns {Promise<Object>} Classification statistics
   */
  async getClassificationStats(hostname) {
    try {
      const { databaseUtils } = await import('./database.js');
      const requests = await databaseUtils.getRequestsByHostname(hostname);
      const files = await databaseUtils.getFilesByHostname(hostname);
      
      const stats = {
        total: requests.length + files.length,
        apiRequests: requests.length,
        staticFiles: files.length,
        byType: {},
        byMethod: {}
      };

      // Count by type
      requests.forEach(req => {
        const type = req.classification?.type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
        stats.byMethod[req.method] = (stats.byMethod[req.method] || 0) + 1;
      });

      files.forEach(file => {
        const type = file.classification?.type || 'static_file';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('Error getting classification stats:', error);
      return {
        total: 0,
        apiRequests: 0,
        staticFiles: 0,
        byType: {},
        byMethod: {}
      };
    }
  }
}

// Create global instances
export const urlClassifier = new URLClassifier();
export const urlDatabaseManager = new UrlDatabaseManager();

export default {
  URLClassifier,
  UrlDatabaseManager,
  URL_TYPES,
  urlClassifier,
  urlDatabaseManager
};
