import fs from 'fs-extra';
import path from 'path';
import mime from 'mime';
// Note: Database operations removed - now handled in renderer process

/**
 * Static file analyzer for extracting and downloading static resources
 */
class StaticAnalyzer {
  constructor() {
    this.staticFiles = new Set();
    this.downloadedFiles = new Map(); // url -> localPath
    this.baseUrl = '';
    this.outputDir = '';
  }

  /**
   * Analyze HTML content and extract static file links
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL of the page
   * @returns {Array} Array of static file URLs
   */
  analyzeHtml(html, baseUrl) {
    this.baseUrl = baseUrl;
    const staticFiles = [];
    const skippedFiles = [];

    // Extract CSS links
    const cssRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = cssRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url.startsWith('data:')) {
        skippedFiles.push({ url, type: 'css', reason: 'base64 data URL' });
      } else if (this.isValidStaticFile(url)) {
        staticFiles.push({ url, type: 'css' });
      } else {
        skippedFiles.push({ url, type: 'css', reason: 'external/cdn' });
      }
    }

    // Extract JavaScript files
    const jsRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = jsRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url.startsWith('data:')) {
        skippedFiles.push({ url, type: 'js', reason: 'base64 data URL' });
      } else if (this.isValidStaticFile(url)) {
        staticFiles.push({ url, type: 'js' });
      } else {
        skippedFiles.push({ url, type: 'js', reason: 'external/cdn' });
      }
    }

    // Extract images
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url.startsWith('data:')) {
        skippedFiles.push({ url, type: 'image', reason: 'base64 data URL' });
      } else if (this.isValidStaticFile(url)) {
        staticFiles.push({ url, type: 'image' });
      } else {
        skippedFiles.push({ url, type: 'image', reason: 'external/cdn' });
      }
    }

    // Extract background images from CSS - enhanced pattern matching
    const bgImgRegex = /background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
    while ((match = bgImgRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url.startsWith('data:')) {
        skippedFiles.push({ url, type: 'image', reason: 'base64 data URL' });
      } else if (this.isValidStaticFile(url)) {
        staticFiles.push({ url, type: 'image' });
      } else {
        skippedFiles.push({ url, type: 'image', reason: 'external/cdn' });
      }
    }

    // Extract complex background patterns like: background: transparent url(...) scroll 0 0 no-repeat;
    const complexBgRegex = /background\s*:\s*[^;]*url\(["']?([^"')]+)["']?\)[^;]*/gi;
    while ((match = complexBgRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url.startsWith('data:')) {
        skippedFiles.push({ url, type: 'image', reason: 'base64 data URL' });
      } else if (this.isValidStaticFile(url)) {
        staticFiles.push({ url, type: 'image' });
      } else {
        skippedFiles.push({ url, type: 'image', reason: 'external/cdn' });
      }
    }

    // Extract any url() patterns in CSS (comprehensive approach)
    const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;
    while ((match = urlRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url.startsWith('data:')) {
        skippedFiles.push({ url, type: 'resource', reason: 'base64 data URL' });
      } else if (this.isValidStaticFile(url)) {
        // Determine file type by extension
        const ext = path.extname(new URL(url).pathname).toLowerCase();
        let type = 'resource';
        if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
          type = 'image';
        } else if (['.css'].includes(ext)) {
          type = 'css';
        } else if (['.js'].includes(ext)) {
          type = 'js';
        } else if (['.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
          type = 'font';
        }
        staticFiles.push({ url, type });
      } else {
        skippedFiles.push({ url, type: 'resource', reason: 'external/cdn' });
      }
    }

    // Extract favicon
    const faviconRegex = /<link[^>]+rel=["']icon["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    while ((match = faviconRegex.exec(html)) !== null) {
      const url = this.resolveUrl(match[1]);
      if (url.startsWith('data:')) {
        skippedFiles.push({ url, type: 'favicon', reason: 'base64 data URL' });
      } else if (this.isValidStaticFile(url)) {
        staticFiles.push({ url, type: 'favicon' });
      } else {
        skippedFiles.push({ url, type: 'favicon', reason: 'external/cdn' });
      }
    }

    // Log skipped files
    if (skippedFiles.length > 0) {
      console.log(`Skipped ${skippedFiles.length} external files:`, skippedFiles.map(f => f.url));
    }

    return { staticFiles, skippedFiles };
  }

  /**
   * Resolve relative URL to absolute URL
   * @param {string} url - URL to resolve
   * @returns {string} Absolute URL
   */
  resolveUrl(url) {
    try {
      return new URL(url, this.baseUrl).toString();
    } catch {
      return url;
    }
  }

  /**
   * Check if URL is a valid static file (not CDN or external)
   * @param {string} url - URL to check
   * @returns {boolean} True if valid static file
   */
  isValidStaticFile(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Skip CDN and external domains
      const cdnDomains = [
        'cdn.', 'cdnjs.', 'unpkg.', 'jsdelivr.', 'googleapis.', 'gstatic.',
        'cloudflare.', 'bootstrapcdn.', 'fontawesome.', 'jquery.',
        'ajax.googleapis.', 'fonts.googleapis.', 'fonts.gstatic.',
        'mail.ru', 'yandex.', 'rambler.', 'ya.ru', 'google.', 'facebook.',
        'twitter.', 'instagram.', 'linkedin.', 'github.', 'stackoverflow.',
        'amazonaws.', 'azure.', 'firebase.', 'heroku.', 'netlify.',
        'vercel.', 'surge.', 'github.io', 'gitlab.io', 'bitbucket.io'
      ];
      
      if (cdnDomains.some(domain => hostname.includes(domain))) {
        return false;
      }

      // Skip external domains (different from base URL)
      const baseHostname = new URL(this.baseUrl).hostname.toLowerCase();
      if (hostname !== baseHostname) {
        return false;
      }

      // Check file extension
      const ext = path.extname(urlObj.pathname).toLowerCase();
      const validExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
      
      return validExtensions.includes(ext);
    } catch {
      return false;
    }
  }

  /**
   * Download static file
   * @param {string} url - URL to download
   * @param {string} outputDir - Output directory
   * @returns {Promise<string>} Local file path
   */
  async downloadStaticFile(url, outputDir) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const urlObj = new URL(url);
      const filePath = urlObj.pathname.replace(/^\//, '').replace(/\//g, '_');
      const localPath = path.join(outputDir, 'assets', filePath);

      await fs.ensureDir(path.dirname(localPath));
      await fs.writeFile(localPath, Buffer.from(buffer));

      this.downloadedFiles.set(url, localPath);
      return localPath;
    } catch (error) {
      console.error(`Failed to download ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Download all static files
   * @param {Array} staticFiles - Array of static file objects
   * @param {string} outputDir - Output directory
   * @returns {Promise<Map>} Map of downloaded files
   */
  async downloadAllStaticFiles(staticFiles, outputDir) {
    this.outputDir = outputDir;
    const downloadPromises = staticFiles.map(async (file) => {
      const localPath = await this.downloadStaticFile(file.url, outputDir);
      return { ...file, localPath };
    });

    const results = await Promise.allSettled(downloadPromises);
    const downloaded = new Map();

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.localPath) {
        downloaded.set(staticFiles[index].url, result.value.localPath);
      }
    });

    return downloaded;
  }

  // Note: processUrlsWithClassification method removed - now handled in renderer process

  /**
   * Get static files from HTML content
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL
   * @returns {Array} Array of static file URLs
   */
  getStaticFiles(html, baseUrl) {
    return this.analyzeHtml(html, baseUrl);
  }
}

export default StaticAnalyzer;
