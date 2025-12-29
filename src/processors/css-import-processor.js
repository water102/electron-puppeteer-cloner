/**
 * CSS @import Processor
 * Processes CSS @import statements and downloads imported CSS files
 */

import fs from 'fs-extra';
import path from 'path';
import FileUtils from '../utils/file-utils.js';

class CSSImportProcessor {
  constructor() {
    this.processedImports = new Map(); // url -> localPath
    this.importQueue = [];
  }

  /**
   * Process CSS file and extract @import statements
   * @param {string} cssContent - CSS content
   * @param {string} cssFilePath - Path to CSS file
   * @param {string} baseUrl - Base URL for resolving imports
   * @returns {Array} Array of import URLs found
   */
  extractImports(cssContent, cssFilePath, baseUrl) {
    const imports = [];
    
    // Match @import statements
    // Supports: @import url("file.css"); @import "file.css"; @import url(file.css);
    const importRegex = /@import\s+(?:url\()?["']?([^"')]+)["']?\)?[^;]*;/gi;
    let match;
    
    while ((match = importRegex.exec(cssContent)) !== null) {
      const importUrl = match[1].trim();
      
      // Skip data URLs and absolute URLs that are external
      if (importUrl.startsWith('data:') || importUrl.startsWith('http://') || importUrl.startsWith('https://')) {
        // Only process if it's from the same domain
        try {
          const importUrlObj = new URL(importUrl);
          const baseUrlObj = new URL(baseUrl);
          if (importUrlObj.origin !== baseUrlObj.origin) {
            continue; // Skip external imports
          }
        } catch (e) {
          continue; // Skip invalid URLs
        }
      }
      
      // Resolve relative URL
      let absoluteUrl;
      try {
        if (importUrl.startsWith('http://') || importUrl.startsWith('https://')) {
          absoluteUrl = importUrl;
        } else {
          // Resolve relative to CSS file location or base URL
          if (cssFilePath) {
            const cssDir = path.dirname(cssFilePath);
            // Convert CSS file path to URL for resolution
            const cssFileUrl = baseUrl.replace(/\/[^/]*$/, '/') + path.basename(cssFilePath);
            absoluteUrl = new URL(importUrl, cssFileUrl).toString();
          } else {
            absoluteUrl = new URL(importUrl, baseUrl).toString();
          }
        }
        
        imports.push({
          url: absoluteUrl,
          originalUrl: importUrl,
          line: cssContent.substring(0, match.index).split('\n').length
        });
      } catch (error) {
        console.warn(`Failed to resolve import URL: ${importUrl}`, error);
      }
    }
    
    return imports;
  }

  /**
   * Process CSS file and download @import files
   * @param {string} cssFilePath - Path to CSS file
   * @param {string} cssContent - CSS content
   * @param {string} baseUrl - Base URL
   * @param {string} assetsDir - Assets directory
   * @param {Object} savedFiles - Map of saved files
   * @param {Function} downloadFunction - Function to download files
   * @returns {Promise<Object>} Updated CSS content and imported files
   */
  async processImports(cssFilePath, cssContent, baseUrl, assetsDir, savedFiles, downloadFunction) {
    const imports = this.extractImports(cssContent, cssFilePath, baseUrl);
    
    if (imports.length === 0) {
      return {
        content: cssContent,
        importedFiles: []
      };
    }

    const importedFiles = [];
    let processedContent = cssContent;

    // Download each imported CSS file
    for (const importInfo of imports) {
      try {
        // Check if already downloaded
        if (savedFiles[importInfo.url]) {
          importedFiles.push({
            url: importInfo.url,
            localPath: savedFiles[importInfo.url],
            status: 'already-downloaded'
          });
          continue;
        }

        // Download the imported CSS file
        const downloadResult = await downloadFunction(importInfo.url);
        
        if (downloadResult && downloadResult.success) {
          const importedContent = downloadResult.content;
          const localPath = downloadResult.localPath;
          
          savedFiles[importInfo.url] = localPath;
          importedFiles.push({
            url: importInfo.url,
            localPath: localPath,
            status: 'downloaded'
          });

          // Recursively process imports in the imported file
          const recursiveResult = await this.processImports(
            localPath,
            importedContent,
            baseUrl,
            assetsDir,
            savedFiles,
            downloadFunction
          );

          // Update saved files with recursively imported files
          Object.assign(savedFiles, recursiveResult.importedFiles.reduce((acc, file) => {
            if (file.localPath) {
              acc[file.url] = file.localPath;
            }
            return acc;
          }, {}));

          importedFiles.push(...recursiveResult.importedFiles);
        } else {
          console.warn(`Failed to download imported CSS: ${importInfo.url}`);
          importedFiles.push({
            url: importInfo.url,
            status: 'failed',
            error: downloadResult?.error || 'Unknown error'
          });
        }
      } catch (error) {
        console.warn(`Error processing CSS import ${importInfo.url}:`, error.message);
        importedFiles.push({
          url: importInfo.url,
          status: 'error',
          error: error.message
        });
      }
    }

    // Update @import URLs to relative paths
    for (const importInfo of imports) {
      if (savedFiles[importInfo.url]) {
        const cssDir = path.dirname(cssFilePath);
        const importRelativePath = path.relative(cssDir, savedFiles[importInfo.url])
          .split(path.sep).join('/');
        
        // Replace the import URL with relative path
        const importPattern = new RegExp(
          `(@import\\s+(?:url\\()?)["']?${importInfo.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\)?[^;]*;)`,
          'gi'
        );
        
        processedContent = processedContent.replace(
          importPattern,
          `@import url("${importRelativePath}");`
        );
      }
    }

    return {
      content: processedContent,
      importedFiles: importedFiles
    };
  }

  /**
   * Download CSS file
   * @param {string} url - CSS file URL
   * @param {string} assetsDir - Assets directory
   * @param {Object} page - Puppeteer page instance (optional)
   * @returns {Promise<Object>} Download result
   */
  async downloadCSSFile(url, assetsDir, page = null) {
    try {
      let content = null;
      
      if (page) {
        // Use Puppeteer page to fetch
        const result = await page.evaluate(async (cssUrl) => {
          try {
            const res = await fetch(cssUrl);
            if (res.ok) {
              const text = await res.text();
              return { success: true, content: text };
            }
            return { success: false, error: `HTTP ${res.status}` };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }, url);

        if (result && result.success) {
          content = result.content;
        } else {
          return { success: false, error: result?.error || 'Unknown error' };
        }
      } else {
        // Use Node.js fetch (if available) or fallback
        const response = await fetch(url);
        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }
        content = await response.text();
      }

      if (!content) {
        return { success: false, error: 'No content received' };
      }

      // Generate local path
      const localRelativePath = FileUtils.generateLocalPath(url);
      const savePath = path.join(assetsDir, localRelativePath);
      
      // Ensure .css extension
      const finalPath = savePath.endsWith('.css') ? savePath : savePath + '.css';
      
      await fs.ensureDir(path.dirname(finalPath));
      await fs.outputFile(finalPath, content, 'utf8');

      return {
        success: true,
        content: content,
        localPath: finalPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default CSSImportProcessor;

