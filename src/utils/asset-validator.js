/**
 * Asset Validation System
 * Validates downloaded assets and checks for missing resources
 */

class AssetValidator {
  constructor() {
    this.validationResults = {
      valid: [],
      invalid: [],
      missing: [],
      warnings: []
    };
  }

  /**
   * Validate a single asset
   * @param {Object} asset - Asset object with url, path, type, etc.
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validateAsset(asset, options = {}) {
    const {
      checkFileExists = true,
      checkFileSize = true,
      checkContentType = true,
      checkUrlAccessibility = false
    } = options;

    const result = {
      asset,
      valid: true,
      errors: [],
      warnings: []
    };

    // Check if file exists
    if (checkFileExists && asset.path) {
      try {
        const fs = await import('fs-extra');
        const exists = await fs.pathExists(asset.path);
        if (!exists) {
          result.valid = false;
          result.errors.push(`File does not exist: ${asset.path}`);
        } else if (checkFileSize) {
          // Check file size
          const stats = await fs.stat(asset.path);
          if (stats.size === 0) {
            result.warnings.push(`File is empty: ${asset.path}`);
          }
          result.fileSize = stats.size;
        }
      } catch (error) {
        result.valid = false;
        result.errors.push(`Error checking file: ${error.message}`);
      }
    }

    // Check content type if available
    if (checkContentType && asset.type && asset.path) {
      const expectedExtension = this.getExpectedExtension(asset.type);
      if (expectedExtension && asset.path) {
        const actualExtension = this.getFileExtension(asset.path);
        if (actualExtension && !this.isExtensionCompatible(actualExtension, expectedExtension)) {
          result.warnings.push(`Content type mismatch: expected ${expectedExtension}, got ${actualExtension}`);
        }
      }
    }

    // Check URL accessibility (optional, for external resources)
    if (checkUrlAccessibility && asset.url) {
      try {
        const response = await fetch(asset.url, { method: 'HEAD' });
        if (!response.ok) {
          result.warnings.push(`URL not accessible: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        result.warnings.push(`Error checking URL: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Validate multiple assets
   * @param {Array} assets - Array of asset objects
   * @param {Object} options - Validation options
   * @returns {Object} Validation results
   */
  async validateAssets(assets, options = {}) {
    this.validationResults = {
      valid: [],
      invalid: [],
      missing: [],
      warnings: []
    };

    for (const asset of assets) {
      const result = await this.validateAsset(asset, options);
      
      if (result.valid && result.errors.length === 0) {
        this.validationResults.valid.push(result);
      } else {
        this.validationResults.invalid.push(result);
      }

      if (result.warnings.length > 0) {
        this.validationResults.warnings.push(result);
      }

      // Check for missing assets
      if (result.errors.some(e => e.includes('does not exist'))) {
        this.validationResults.missing.push(result);
      }
    }

    return this.validationResults;
  }

  /**
   * Validate HTML file and check for broken links
   * @param {string} htmlPath - Path to HTML file
   * @param {string} baseUrl - Base URL for resolving relative paths
   * @param {Object} savedFiles - Map of URLs to local paths
   * @returns {Object} Validation result
   */
  async validateHtmlFile(htmlPath, baseUrl, savedFiles = {}) {
    const result = {
      file: htmlPath,
      valid: true,
      brokenLinks: [],
      missingAssets: [],
      warnings: []
    };

    try {
      const fs = await import('fs-extra');
      const html = await fs.readFile(htmlPath, 'utf8');
      
      // Extract all URLs from HTML
      const urls = this.extractUrlsFromHtml(html);
      
      for (const url of urls) {
        const absoluteUrl = new URL(url, baseUrl).toString();
        
        // Check if URL is in saved files
        if (!savedFiles[absoluteUrl] && !savedFiles[url]) {
          // Check if it's an external URL (might be intentional)
          try {
            const urlObj = new URL(absoluteUrl);
            const baseUrlObj = new URL(baseUrl);
            
            if (urlObj.origin !== baseUrlObj.origin) {
              result.warnings.push(`External URL: ${absoluteUrl}`);
            } else {
              result.missingAssets.push(absoluteUrl);
              result.valid = false;
            }
          } catch (e) {
            result.brokenLinks.push(url);
            result.valid = false;
          }
        } else {
          // Check if saved file exists
          const localPath = savedFiles[absoluteUrl] || savedFiles[url];
          if (localPath) {
            const exists = await fs.pathExists(localPath);
            if (!exists) {
              result.missingAssets.push(localPath);
              result.valid = false;
            }
          }
        }
      }
    } catch (error) {
      result.valid = false;
      result.errors = [error.message];
    }

    return result;
  }

  /**
   * Validate CSS file and check for broken URLs
   * @param {string} cssPath - Path to CSS file
   * @param {string} baseUrl - Base URL for resolving relative paths
   * @param {Object} savedFiles - Map of URLs to local paths
   * @returns {Object} Validation result
   */
  async validateCssFile(cssPath, baseUrl, savedFiles = {}) {
    const result = {
      file: cssPath,
      valid: true,
      brokenUrls: [],
      missingAssets: [],
      warnings: []
    };

    try {
      const fs = await import('fs-extra');
      const css = await fs.readFile(cssPath, 'utf8');
      
      // Extract all URLs from CSS
      const urls = this.extractUrlsFromCss(css);
      
      for (const url of urls) {
        if (url.startsWith('data:')) {
          continue; // Skip data URLs
        }
        
        const absoluteUrl = new URL(url, baseUrl).toString();
        
        if (!savedFiles[absoluteUrl] && !savedFiles[url]) {
          try {
            const urlObj = new URL(absoluteUrl);
            const baseUrlObj = new URL(baseUrl);
            
            if (urlObj.origin !== baseUrlObj.origin) {
              result.warnings.push(`External URL: ${absoluteUrl}`);
            } else {
              result.missingAssets.push(absoluteUrl);
              result.valid = false;
            }
          } catch (e) {
            result.brokenUrls.push(url);
            result.valid = false;
          }
        }
      }
    } catch (error) {
      result.valid = false;
      result.errors = [error.message];
    }

    return result;
  }

  /**
   * Extract URLs from HTML
   */
  extractUrlsFromHtml(html) {
    const urls = [];
    const urlPatterns = [
      /href=["']([^"']+)["']/gi,
      /src=["']([^"']+)["']/gi,
      /srcset=["']([^"']+)["']/gi,
      /url\(["']?([^"')]+)["']?\)/gi
    ];

    for (const pattern of urlPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        urls.push(match[1]);
      }
    }

    return [...new Set(urls)];
  }

  /**
   * Extract URLs from CSS
   */
  extractUrlsFromCss(css) {
    const urls = [];
    const urlPattern = /url\(["']?([^"')]+)["']?\)/gi;
    
    let match;
    while ((match = urlPattern.exec(css)) !== null) {
      urls.push(match[1]);
    }

    return [...new Set(urls)];
  }

  /**
   * Get expected file extension for content type
   */
  getExpectedExtension(contentType) {
    const typeMap = {
      'text/html': '.html',
      'text/css': '.css',
      'application/javascript': '.js',
      'text/javascript': '.js',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'font/woff': '.woff',
      'font/woff2': '.woff2',
      'application/json': '.json'
    };
    return typeMap[contentType] || null;
  }

  /**
   * Get file extension from path
   */
  getFileExtension(path) {
    const match = path.match(/\.([^.]+)$/);
    return match ? `.${match[1]}` : null;
  }

  /**
   * Check if extensions are compatible
   */
  isExtensionCompatible(actual, expected) {
    const compatibleGroups = [
      ['.jpg', '.jpeg'],
      ['.js', '.mjs'],
      ['.css', '.scss', '.sass']
    ];

    for (const group of compatibleGroups) {
      if (group.includes(actual) && group.includes(expected)) {
        return true;
      }
    }

    return actual === expected;
  }

  /**
   * Get validation summary
   */
  getSummary() {
    return {
      total: this.validationResults.valid.length + this.validationResults.invalid.length,
      valid: this.validationResults.valid.length,
      invalid: this.validationResults.invalid.length,
      missing: this.validationResults.missing.length,
      warnings: this.validationResults.warnings.length
    };
  }

  /**
   * Clear validation results
   */
  clear() {
    this.validationResults = {
      valid: [],
      invalid: [],
      missing: [],
      warnings: []
    };
  }
}

// Export singleton instance
let instance = null;

export function getAssetValidator() {
  if (!instance) {
    instance = new AssetValidator();
  }
  return instance;
}

export default AssetValidator;

