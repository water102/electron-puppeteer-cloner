import fs from 'fs-extra';
import path from 'path';
import mime from 'mime';

/**
 * File utility functions
 */
class FileUtils {
  /**
   * Get file extension from URL or path
   * @param {string} url - URL or file path
   * @returns {string} File extension
   */
  static getExtension(url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      return path.extname(pathname).toLowerCase();
    } catch {
      return path.extname(url).toLowerCase();
    }
  }

  /**
   * Check if file is an image
   * @param {string} url - File URL
   * @returns {boolean} True if image
   */
  static isImage(url) {
    const ext = this.getExtension(url);
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext);
  }

  /**
   * Check if file is a stylesheet
   * @param {string} url - File URL
   * @returns {boolean} True if stylesheet
   */
  static isStylesheet(url) {
    const ext = this.getExtension(url);
    return ['.css', '.scss', '.sass', '.less'].includes(ext);
  }

  /**
   * Check if file is a script
   * @param {string} url - File URL
   * @returns {boolean} True if script
   */
  static isScript(url) {
    const ext = this.getExtension(url);
    return ['.js', '.mjs', '.ts', '.jsx', '.tsx'].includes(ext);
  }

  /**
   * Check if file is a font
   * @param {string} url - File URL
   * @returns {boolean} True if font
   */
  static isFont(url) {
    const ext = this.getExtension(url);
    return ['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext);
  }

  /**
   * Get MIME type for file
   * @param {string} url - File URL
   * @returns {string} MIME type
   */
  static getMimeType(url) {
    return mime.lookup(url) || 'application/octet-stream';
  }

  /**
   * Generate safe filename from URL
   * @param {string} url - File URL
   * @returns {string} Safe filename
   */
  static getSafeFilename(url) {
    try {
      const parsed = new URL(url);
      let pathname = parsed.pathname;
      
      if (pathname.endsWith('/')) {
        pathname += 'index';
      }
      
      // Remove leading slash and replace slashes with underscores
      return pathname.replace(/^\//, '').replace(/\//g, '_');
    } catch {
      return url.replace(/[^a-zA-Z0-9._-]/g, '_');
    }
  }

  /**
   * Ensure directory exists
   * @param {string} dirPath - Directory path
   */
  static async ensureDir(dirPath) {
    await fs.ensureDir(dirPath);
  }

  /**
   * Write file with error handling
   * @param {string} filePath - File path
   * @param {Buffer|string} content - File content
   * @param {Object} options - Write options
   */
  static async writeFile(filePath, content, options = {}) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, options);
  }

  /**
   * Read file with error handling
   * @param {string} filePath - File path
   * @param {string} encoding - File encoding
   * @returns {Promise<string|Buffer>} File content
   */
  static async readFile(filePath, encoding = 'utf8') {
    return await fs.readFile(filePath, encoding);
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} True if exists
   */
  static async exists(filePath) {
    return await fs.pathExists(filePath);
  }

  /**
   * Get file size
   * @param {string} filePath - File path
   * @returns {Promise<number>} File size in bytes
   */
  static async getSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }
}

export default FileUtils;
