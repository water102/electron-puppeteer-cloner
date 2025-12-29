import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import urlMod from 'url';
import postcss from 'postcss';
import postcssUrl from 'postcss-url';
import FileUtils from '../utils/file-utils.js';
import CSSImportProcessor from '../processors/css-import-processor.js';
import URLExtractor from '../processors/url-extractor.js';
import MetaFilesCapture from '../capture/meta-files-capture.js';
import LazyLoadProcessor from '../processors/lazy-load-processor.js';
import { getRetryManager } from '../utils/retry-manager.js';
import { getPriorityQueue } from '../utils/priority-queue.js';

/**
 * Clone worker process for handling Puppeteer operations
 */

// Initialize retry manager
const retryManager = getRetryManager({
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
});

// Initialize priority queue
const priorityQueue = getPriorityQueue();

/**
 * Normalize domain for cookie setting
 * @param {string} domain - Domain to normalize
 * @returns {string|undefined} Normalized domain
 */
function normalizeDomain(domain) {
  if (!domain) return undefined;
  return domain.startsWith('.') ? domain.slice(1) : domain;
}



/**
 * Map SameSite cookie attribute
 * @param {string} value - SameSite value
 * @returns {string} Mapped SameSite value
 */
function mapSameSite(value) {
  if (!value) return 'Lax';
  const s = String(value).toLowerCase();
  if (s.includes('strict')) return 'Strict';
  if (s.includes('none')) return 'None';
  return 'Lax';
}

/**
 * Process inline CSS in HTML to fix URL references
 * @param {string} html - HTML content
 * @param {string} baseUrl - Base URL for resolution
 * @returns {string} Processed HTML
 */
function processInlineCss(html, baseUrl) {
  // Fix [object Object] URLs in inline CSS by preserving original URLs
  let processedHtml = html.replace(/url\(\[object Object\]\)/g, (match) => {
    console.warn('Found [object Object] URL in CSS, attempting to preserve original URL');
    // Try to find original URLs in the HTML to use as fallback
    const urlMatches = html.match(/url\([^)]+\)/g);
    if (urlMatches && urlMatches.length > 0) {
      // Use the first valid URL found as fallback
      const validUrl = urlMatches.find(url => !url.includes('[object Object]'));
      if (validUrl) {
        return validUrl;
      }
    }
    // If no valid URL found, use a generic fallback
    return 'url(./asset.css)';
  });

  // Also fix any other corrupted URL patterns
  processedHtml = processedHtml.replace(/url\([^)]*\[object Object\][^)]*\)/g, (match) => {
    console.warn('Found corrupted URL pattern in CSS, attempting to preserve original:', match);
    // Try to extract the original URL from the corrupted pattern
    const originalUrlMatch = match.match(/url\(([^)]*)\[object Object\]([^)]*)\)/);
    if (originalUrlMatch) {
      const before = originalUrlMatch[1] || '';
      const after = originalUrlMatch[2] || '';
      return `url(${before}${after})`;
    }
    return 'url(./asset.css)';
  });

  return processedHtml;
}

/**
 * Process CSS files to rewrite URL references and handle @import
 * @param {Object} savedFiles - Map of saved files
 * @param {string} baseUrl - Base URL for resolution
 * @param {string} assetsDir - Assets directory
 * @param {Object} page - Puppeteer page instance
 */
async function processCssFiles(savedFiles, baseUrl, assetsDir, page) {
  const cssImportProcessor = new CSSImportProcessor();
  const cssFiles = Object.values(savedFiles).filter(filePath =>
    /\.css(\?|$)/i.test(filePath)
  );

  for (const cssPath of cssFiles) {
    try {
      let cssText = await fs.readFile(cssPath, 'utf8');
      const cssDir = path.dirname(cssPath);

      // Process @import statements first
      const importResult = await cssImportProcessor.processImports(
        cssPath,
        cssText,
        baseUrl,
        assetsDir,
        savedFiles,
        async (importUrl) => {
          return await cssImportProcessor.downloadCSSFile(importUrl, assetsDir, page);
        }
      );

      // Use processed content with resolved imports
      cssText = importResult.content;
      
      if (importResult.importedFiles.length > 0) {
        console.log(`Processed ${importResult.importedFiles.length} CSS import(s) in ${cssPath}`);
        process.send({
          type: 'progress',
          payload: {
            cssImportsProcessed: importResult.importedFiles.length,
            file: path.basename(cssPath)
          }
        });
      }

      // First, try manual URL processing to avoid postcss-url object issues
      let processedCss = cssText;

      // Process URLs manually with regex
      processedCss = processedCss.replace(/url\(([^)]+)\)/g, (match, urlContent) => {
        // Skip if already corrupted
        if (urlContent.includes('[object Object]')) {
          console.warn('Skipping corrupted URL:', match);
          return match; // Return original to avoid further corruption
        }

        // Skip data URLs and absolute URLs that don't need processing
        if (urlContent.startsWith('data:') || urlContent.startsWith('http://') || urlContent.startsWith('https://')) {
          return match;
        }

        // Only process relative URLs
        if (urlContent.startsWith('/') || urlContent.startsWith('../') || urlContent.startsWith('./')) {
          const absoluteUrl = new URL(urlContent, baseUrl).toString();
          if (savedFiles[absoluteUrl]) {
            const relativePath = path.relative(cssDir, savedFiles[absoluteUrl])
              .split(path.sep).join('/');
            console.log('Manually mapped URL:', urlContent, '->', relativePath);
            return `url(${relativePath})`;
          }
        }

        return match; // Return original if no processing needed
      });

      // Only use postcss-url if manual processing didn't work
      if (processedCss.includes('[object Object]')) {
        console.log('Manual processing failed, falling back to postcss-url');

        const processor = postcss([
          postcssUrl({
            url: (assetUrl, decl, from, dirname) => {
              // Early return if assetUrl is already a string and looks valid
              if (typeof assetUrl === 'string' && !assetUrl.includes('[object Object]')) {
                console.log('Valid string URL, processing normally:', assetUrl);
                // Continue with normal processing below
              } else {
                console.log('Problematic URL detected:', assetUrl, 'Type:', typeof assetUrl);
                // Try to find the original URL from the CSS text and return it unchanged
                const originalUrls = cssText.match(/url\([^)]+\)/g);
                if (originalUrls && originalUrls.length > 0) {
                  // Find the URL that corresponds to this position
                  const currentPosition = cssText.indexOf(decl.toString());
                  if (currentPosition !== -1) {
                    // Look for URLs around this position
                    const contextStart = Math.max(0, currentPosition - 200);
                    const contextEnd = Math.min(cssText.length, currentPosition + 200);
                    const context = cssText.substring(contextStart, contextEnd);
                    const contextUrls = context.match(/url\([^)]+\)/g);

                    if (contextUrls && contextUrls.length > 0) {
                      const validUrl = contextUrls.find(url => !url.includes('[object Object]'));
                      if (validUrl) {
                        console.log('Found original URL in context:', validUrl);
                        return validUrl;
                      }
                    }
                  }

                  // Fallback to any valid URL
                  const validUrl = originalUrls.find(url => !url.includes('[object Object]'));
                  if (validUrl) {
                    console.log('Using fallback original URL:', validUrl);
                    return validUrl;
                  }
                }

                // If all else fails, return the original assetUrl to avoid corruption
                console.warn('No valid original URL found, returning original:', assetUrl);
                return assetUrl;
              }
              try {
                // Debug logging
                console.log('Processing CSS URL:', assetUrl, 'Type:', typeof assetUrl, 'Constructor:', assetUrl?.constructor?.name);

                // Convert to string if it's an object (postcss-url sometimes passes objects)
                let urlString = assetUrl;
                if (typeof assetUrl === 'object' && assetUrl !== null) {
                  console.log('Object details:', {
                    keys: Object.keys(assetUrl),
                    url: assetUrl.url,
                    value: assetUrl.value,
                    toString: typeof assetUrl.toString
                  });

                  // If it's an object, try to extract the URL from common properties
                  if (assetUrl.url) {
                    urlString = assetUrl.url;
                    console.log('Extracted from .url:', urlString);
                  } else if (assetUrl.value) {
                    urlString = assetUrl.value;
                    console.log('Extracted from .value:', urlString);
                  } else if (assetUrl.toString && typeof assetUrl.toString === 'function') {
                    urlString = assetUrl.toString();
                    console.log('Extracted from toString():', urlString);
                  } else {
                    console.warn('Cannot convert object to string:', assetUrl);
                    // Try to find original URL from CSS text as fallback
                    const originalUrls = cssText.match(/url\([^)]+\)/g);
                    if (originalUrls && originalUrls.length > 0) {
                      const validUrl = originalUrls.find(url => !url.includes('[object Object]'));
                      if (validUrl) {
                        console.log('Using original URL as fallback:', validUrl);
                        return validUrl;
                      }
                    }
                    return assetUrl; // Return original to avoid corruption
                  }
                }

                // Ensure we have a string
                if (typeof urlString !== 'string') {
                  console.warn('Non-string assetUrl after conversion:', urlString);
                  return assetUrl; // Return original to avoid corruption
                }

                // Skip if already corrupted
                if (urlString.includes('[object Object]')) {
                  console.warn('Skipping corrupted URL:', urlString);
                  return assetUrl; // Return original to avoid corruption
                }

                // Skip data URLs and absolute URLs that don't need processing
                if (urlString.startsWith('data:') || urlString.startsWith('http://') || urlString.startsWith('https://')) {
                  return urlString;
                }

                // Only process relative URLs
                if (urlString.startsWith('/') || urlString.startsWith('../') || urlString.startsWith('./')) {
                  const absoluteUrl = new URL(urlString, baseUrl).toString();
                  if (savedFiles[absoluteUrl]) {
                    const relativePath = path.relative(cssDir, savedFiles[absoluteUrl])
                      .split(path.sep).join('/');
                    console.log('Mapped URL:', urlString, '->', relativePath);
                    return relativePath;
                  }
                }
              } catch (error) {
                console.warn('Error processing CSS URL:', assetUrl, error.message);
              }
              return assetUrl; // Return original to preserve the URL as-is
            }
          })
        ]);

        const result = await processor.process(cssText, { from: cssPath, to: cssPath });

        // Additional safety check to prevent [object Object] in final CSS
        let finalCss = result.css;
        if (finalCss.includes('[object Object]')) {
          console.warn('Found [object Object] in processed CSS, attempting to fix...');
          // Instead of replacing with #, try to preserve original URLs from the original CSS
          finalCss = finalCss.replace(/url\(\[object Object\]\)/g, (match, offset) => {
            // Try to find the original URL from the original CSS text
            const urlMatches = cssText.match(/url\([^)]+\)/g);
            if (urlMatches && urlMatches.length > 0) {
              // Try to find a URL that's likely the original for this position
              const contextBefore = cssText.substring(Math.max(0, offset - 100), offset);
              const contextAfter = cssText.substring(offset, Math.min(cssText.length, offset + 100));

              // Look for font-related URLs if this is in a @font-face rule
              if (contextBefore.includes('@font-face') || contextBefore.includes('font-family')) {
                const fontUrl = urlMatches.find(url =>
                  url.includes('.woff') || url.includes('.ttf') || url.includes('.otf') || url.includes('.eot')
                );
                if (fontUrl) {
                  console.log('Using font URL as fallback:', fontUrl);
                  return fontUrl;
                }
              }

              // Use the first valid URL found as fallback
              const validUrl = urlMatches.find(url => !url.includes('[object Object]'));
              if (validUrl) {
                console.log('Using original URL as fallback:', validUrl);
                return validUrl;
              }
            }
            // If no original URL found, use a generic fallback based on context
            if (contextBefore.includes('@font-face') || contextBefore.includes('font-family')) {
              return 'url(./font.woff)';
            }
            return 'url(./asset.css)';
          });
        }

        await fs.outputFile(cssPath, finalCss, 'utf8');
      } else {
        // Manual processing worked, save the result
        await fs.outputFile(cssPath, processedCss, 'utf8');
      }
    } catch (error) {
      console.error('Error processing CSS file:', cssPath, error);
    }
  }
}

/**
 * Discover and download source maps
 * @param {Object} savedFiles - Map of saved files
 * @param {string} assetsDir - Assets directory
 * @param {string} baseUrl - Base URL
 * @param {Object} page - Puppeteer page instance
 */
async function discoverAndDownloadSourceMaps(savedFiles, assetsDir, baseUrl, page) {
  const sourceMaps = [];
  
  // Check all saved JS and CSS files for source map references
  for (const [fileUrl, localPath] of Object.entries(savedFiles)) {
    try {
      // Only check JS and CSS files
      if (!/\.(js|css)(\?|$)/i.test(fileUrl)) {
        continue;
      }

      const fileContent = await fs.readFile(localPath, 'utf8').catch(() => null);
      if (!fileContent) {
        continue;
      }

      // Look for source map comment: //# sourceMappingURL=... or /*# sourceMappingURL=... */
      const sourceMapRegex = /[\/\*]#\s*sourceMappingURL\s*=\s*([^\s\*]+)/;
      const match = fileContent.match(sourceMapRegex);
      
      if (match) {
        const sourceMapUrl = match[1].trim();
        const absoluteSourceMapUrl = new URL(sourceMapUrl, fileUrl).toString();
        
        // Check if source map already downloaded
        if (savedFiles[absoluteSourceMapUrl]) {
          continue;
        }

        sourceMaps.push({
          sourceFile: fileUrl,
          sourceMapUrl: absoluteSourceMapUrl,
          localSourceFile: localPath
        });
      }
    } catch (error) {
      console.warn(`Error checking source map for ${fileUrl}:`, error.message);
    }
  }

  // Download source maps using Puppeteer page
  for (const sourceMap of sourceMaps) {
    try {
      const response = await page.evaluate(async (sourceMapUrl) => {
      try {
        const response = await retryManager.retryDownload(
          async () => {
            const res = await fetch(sourceMapUrl);
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            return res;
          },
          sourceMapUrl,
          {
            onRetry: (attempt, maxRetries, delay, error) => {
              console.log(`Retrying source map download (${attempt}/${maxRetries}) for ${sourceMapUrl} after ${delay}ms...`);
              process.send({
                type: 'progress',
                payload: {
                  message: `Retrying source map download (${attempt}/${maxRetries}): ${sourceMapUrl}`,
                  retryAttempt: attempt,
                  maxRetries: maxRetries
                }
              });
            }
          }
        );
        
        const text = await response.text();
        return { success: true, content: text };
      } catch (error) {
        return { success: false, error: error.message };
      }
      }, sourceMap.sourceMapUrl);

      if (response && response.success && response.content) {
        const sourceMapPath = FileUtils.generateLocalPath(sourceMap.sourceMapUrl);
        let savePath = path.join(assetsDir, sourceMapPath);
        
        // Ensure .map extension
        if (!savePath.endsWith('.map')) {
          savePath = savePath + '.map';
        }
        
        await fs.ensureDir(path.dirname(savePath));
        await fs.outputFile(savePath, response.content, 'utf8');
        savedFiles[sourceMap.sourceMapUrl] = savePath;
        console.log(`Source map saved: ${savePath}`);
        
        // Update source file to use relative path to source map
        const sourceFileContent = await fs.readFile(sourceMap.localSourceFile, 'utf8');
        const sourceMapRelativePath = path.relative(path.dirname(sourceMap.localSourceFile), savePath)
          .split(path.sep).join('/');
        
        // Update sourceMappingURL to relative path
        const updatedContent = sourceFileContent.replace(
          /[\/\*]#\s*sourceMappingURL\s*=\s*[^\s\*]+/,
          `//# sourceMappingURL=${sourceMapRelativePath}`
        );
        
        await fs.outputFile(sourceMap.localSourceFile, updatedContent, 'utf8');
        console.log(`Updated source file with relative source map path: ${sourceMap.localSourceFile}`);
        
        process.send({
          type: 'progress',
          payload: {
            savedResource: sourceMap.sourceMapUrl,
            path: savePath,
            status: 'downloaded',
            resourceType: 'source-map'
          }
        });
      } else {
        console.warn(`Failed to download source map: ${sourceMap.sourceMapUrl} - ${response?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.warn(`Failed to download source map ${sourceMap.sourceMapUrl}:`, error.message);
    }
  }

  if (sourceMaps.length > 0) {
    console.log(`Discovered and downloaded ${sourceMaps.length} source map(s)`);
  }
}

/**
 * Save API logs to individual files and combined log
 * @param {Array} apiLogs - Array of API log entries
 * @param {string} logsDir - Logs directory path
 */
async function saveApiLogs(apiLogs, logsDir) {
  for (const entry of apiLogs) {
    const safeFilename = encodeURIComponent(entry.url)
      .replace(/%/g, '_')
      .slice(0, 230);

    await fs.outputFile(
      path.join(logsDir, `${safeFilename}.json`),
      JSON.stringify(entry, null, 2),
      'utf8'
    );
  }

  await fs.outputJson(
    path.join(logsDir, 'api_logs.json'),
    apiLogs,
    { spaces: 2 }
  );
}

/**
 * Main worker process handler
 */
process.on('message', async (options) => {
  const { url, outputDir, filename, htmlOnly, html, cookies = [], networkData = null, mobile = false, resourceFilters = {}, capturedAssets = null } = options || {};

  try {
    // Handle HTML-only save
    if (htmlOnly) {
      const assetsDir = path.join(path.resolve(outputDir), 'assets');
      const savedPath = path.join(assetsDir, filename);
      await fs.ensureDir(assetsDir);
      await fs.outputFile(savedPath, html, 'utf8');
      process.send({
        type: 'done',
        payload: {
          savedFullPath: savedPath,
          savedRelativePath: path.basename(savedPath)
        }
      });
      return;
    }

    const baseOut = path.resolve(outputDir);
    const assetsDir = path.join(baseOut, 'assets');
    const logsDir = path.join(baseOut, 'logs');

    await fs.ensureDir(assetsDir);
    await fs.ensureDir(logsDir);

    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();

    // Configure Mobile or Desktop mode
    if (mobile) {
      // iPhone 12 Pro emulation
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1');
    } else {
      await page.setViewport({ width: 1920, height: 1080 });
    }

    // Set cookies if provided
    if (Array.isArray(cookies) && cookies.length) {
      const cookiePayload = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: normalizeDomain(cookie.domain || new URL(url).hostname),
        path: cookie.path || '/',
        httpOnly: !!cookie.httpOnly,
        secure: !!cookie.secure,
        sameSite: mapSameSite(cookie.sameSite),
        expires: cookie.expirationDate ? Math.floor(cookie.expirationDate) : undefined
      }));

      await page.setCookie(...cookiePayload);
      process.send({
        type: 'progress',
        payload: { cookiesApplied: cookiePayload.length }
      });
    }

    const savedFiles = {}; // remoteUrl -> localFullPath
    const apiLogs = [];
    const wsLogs = [];

    // Process captured network data if available
    if (networkData && networkData.resources) {
      console.log(`Processing ${networkData.resources.length} captured resources...`);
      
      // Add all resources to priority queue first
      for (const resource of networkData.resources) {
        try {
          const resourceUrl = resource.url || resource.name;
          if (resourceUrl && !savedFiles[resourceUrl]) {
            priorityQueue.enqueue({
              url: resourceUrl,
              type: resource.type || 'other',
              size: resource.size || 0
            });
          }
        } catch (error) {
          console.warn('Error processing captured resource:', error);
        }
      }
      
      // Log priority queue statistics
      const queueStats = priorityQueue.getStatistics();
      console.log(`Priority Queue: ${queueStats.total} items (Critical: ${queueStats.critical}, High: ${queueStats.high}, Medium: ${queueStats.medium}, Low: ${queueStats.low})`);
      
      // Process resources from priority queue (for reference, actual download happens in response handler)
      // The queue helps us understand download priority
    }

    // Process Web Worker scripts
    if (capturedAssets && capturedAssets.webWorkers) {
      console.log(`Processing ${capturedAssets.webWorkers.length} Web Worker scripts...`);
      for (const worker of capturedAssets.webWorkers) {
        try {
          if (worker.scriptURL && !savedFiles[worker.scriptURL]) {
            // Download Web Worker script using fetch
            try {
              const response = await page.evaluate(async (scriptURL) => {
                try {
                  const res = await fetch(scriptURL);
                  if (res.ok) {
                    const text = await res.text();
                    return { success: true, content: text };
                  }
                  return { success: false, error: `HTTP ${res.status}` };
                } catch (error) {
                  return { success: false, error: error.message };
                }
              }, worker.scriptURL);

              if (response && response.success && response.content) {
                let localRelativePath = FileUtils.generateLocalPath(worker.scriptURL);
                // Ensure .js extension for Worker scripts
                if (!localRelativePath.endsWith('.js')) {
                  localRelativePath += '.js';
                }
                const savePath = path.join(assetsDir, localRelativePath);
                await fs.ensureDir(path.dirname(savePath));
                await fs.outputFile(savePath, response.content, 'utf8');
                savedFiles[worker.scriptURL] = savePath;
                console.log(`Web Worker script saved: ${savePath}`);
                
                process.send({
                  type: 'progress',
                  payload: {
                    savedResource: worker.scriptURL,
                    path: savePath,
                    status: 'downloaded',
                    resourceType: 'web-worker'
                  }
                });
              } else {
                console.warn(`Failed to download Web Worker script ${worker.scriptURL}: ${response?.error || 'Unknown error'}`);
              }
            } catch (error) {
              console.warn(`Failed to download Web Worker script ${worker.scriptURL}:`, error.message);
            }
          }
        } catch (error) {
          console.warn('Error processing Web Worker:', error);
        }
      }
    }

    // Process Blob URLs
    if (capturedAssets && capturedAssets.blobUrls) {
      console.log(`Processing ${capturedAssets.blobUrls.length} Blob URLs...`);
      for (const blobInfo of capturedAssets.blobUrls) {
        try {
          if (blobInfo.url && !savedFiles[blobInfo.url]) {
            // Extract blob content using page.evaluate
            try {
              const blobContent = await page.evaluate(async (blobURL) => {
                try {
                  const response = await fetch(blobURL);
                  const blob = await response.blob();
                  const arrayBuffer = await blob.arrayBuffer();
                  const uint8Array = new Uint8Array(arrayBuffer);
                  
                  return {
                    success: true,
                    content: Array.from(uint8Array),
                    type: blob.type,
                    size: blob.size
                  };
                } catch (error) {
                  return { success: false, error: error.message };
                }
              }, blobInfo.url);

              if (blobContent && blobContent.success && blobContent.content) {
                // Determine file extension from MIME type
                let extension = '';
                if (blobContent.type) {
                  const mimeMap = {
                    'image/png': '.png',
                    'image/jpeg': '.jpg',
                    'image/jpg': '.jpg',
                    'image/gif': '.gif',
                    'image/svg+xml': '.svg',
                    'image/webp': '.webp',
                    'application/pdf': '.pdf',
                    'text/plain': '.txt',
                    'application/json': '.json',
                    'text/html': '.html',
                    'text/css': '.css',
                    'application/javascript': '.js',
                    'text/javascript': '.js'
                  };
                  extension = mimeMap[blobContent.type] || '';
                }

                // Generate filename
                const blobId = blobInfo.url.split('/').pop() || `blob_${Date.now()}`;
                const filename = `${blobId}${extension}`;
                const savePath = path.join(assetsDir, 'blobs', filename);
                
                // Convert array back to buffer
                const buffer = Buffer.from(blobContent.content);
                await fs.ensureDir(path.dirname(savePath));
                await fs.outputFile(savePath, buffer);
                savedFiles[blobInfo.url] = savePath;
                console.log(`Blob URL saved: ${savePath}`);
                
                process.send({
                  type: 'progress',
                  payload: {
                    savedResource: blobInfo.url,
                    path: savePath,
                    status: 'downloaded',
                    resourceType: 'blob'
                  }
                });
              } else {
                console.warn(`Failed to extract Blob URL ${blobInfo.url}: ${blobContent?.error || 'Unknown error'}`);
              }
            } catch (error) {
              console.warn(`Failed to process Blob URL ${blobInfo.url}:`, error.message);
            }
          }
        } catch (error) {
          console.warn('Error processing Blob URL:', error);
        }
      }
    }

    // Process Data URLs
    if (capturedAssets && capturedAssets.dataUrls) {
      console.log(`Processing ${capturedAssets.dataUrls.length} Data URLs...`);
      for (const dataUrlInfo of capturedAssets.dataUrls) {
        try {
          if (dataUrlInfo.url && !savedFiles[dataUrlInfo.url]) {
            try {
              // Parse data URL: data:[<mediatype>][;base64],<data>
              const parts = dataUrlInfo.url.split(',');
              if (parts.length < 2) {
                continue;
              }

              const header = parts[0];
              const data = parts.slice(1).join(',');
              const isBase64 = header.includes('base64');
              
              // Determine file extension from MIME type
              let extension = '';
              const mimeMatch = header.match(/data:([^;]+)/);
              const mimeType = mimeMatch ? mimeMatch[1] : dataUrlInfo.mimeType || 'application/octet-stream';
              
              const mimeMap = {
                'image/png': '.png',
                'image/jpeg': '.jpg',
                'image/jpg': '.jpg',
                'image/gif': '.gif',
                'image/svg+xml': '.svg',
                'image/webp': '.webp',
                'application/pdf': '.pdf',
                'text/plain': '.txt',
                'application/json': '.json',
                'text/html': '.html',
                'text/css': '.css',
                'application/javascript': '.js',
                'text/javascript': '.js'
              };
              extension = mimeMap[mimeType] || '';

              // Generate filename
              const dataId = `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const filename = `${dataId}${extension}`;
              const savePath = path.join(assetsDir, 'data-urls', filename);
              
              // Decode base64 if needed
              let buffer;
              if (isBase64) {
                buffer = Buffer.from(data, 'base64');
              } else {
                buffer = Buffer.from(decodeURIComponent(data), 'utf8');
              }
              
              await fs.ensureDir(path.dirname(savePath));
              await fs.outputFile(savePath, buffer);
              savedFiles[dataUrlInfo.url] = savePath;
              console.log(`Data URL saved: ${savePath}`);
              
              process.send({
                type: 'progress',
                payload: {
                  savedResource: dataUrlInfo.url.substring(0, 100) + '...',
                  path: savePath,
                  status: 'downloaded',
                  resourceType: 'data-url'
                }
              });
            } catch (error) {
              console.warn(`Failed to process Data URL:`, error.message);
            }
          }
        } catch (error) {
          console.warn('Error processing Data URL:', error);
        }
      }
    }

    // Process Module Imports (dynamic imports and ES modules)
    if (capturedAssets && capturedAssets.moduleImports) {
      console.log(`Processing ${capturedAssets.moduleImports.length} Module Import(s)...`);
      for (const moduleInfo of capturedAssets.moduleImports) {
        try {
          if (moduleInfo.url && !savedFiles[moduleInfo.url]) {
            // Download module using fetch
            try {
              const response = await page.evaluate(async (moduleUrl) => {
                try {
                  const res = await fetch(moduleUrl);
                  if (res.ok) {
                    const text = await res.text();
                    return { success: true, content: text };
                  }
                  return { success: false, error: `HTTP ${res.status}` };
                } catch (error) {
                  return { success: false, error: error.message };
                }
              }, moduleInfo.url);

              if (response && response.success && response.content) {
                let localRelativePath = FileUtils.generateLocalPath(moduleInfo.url);
                // Ensure .js extension for modules
                if (!localRelativePath.endsWith('.js') && !localRelativePath.endsWith('.mjs')) {
                  localRelativePath += '.js';
                }
                const savePath = path.join(assetsDir, localRelativePath);
                await fs.ensureDir(path.dirname(savePath));
                await fs.outputFile(savePath, response.content, 'utf8');
                savedFiles[moduleInfo.url] = savePath;
                console.log(`Module import saved: ${savePath}`);
                
                process.send({
                  type: 'progress',
                  payload: {
                    savedResource: moduleInfo.url,
                    path: savePath,
                    status: 'downloaded',
                    resourceType: 'module-import'
                  }
                });
              } else {
                console.warn(`Failed to download module import ${moduleInfo.url}: ${response?.error || 'Unknown error'}`);
              }
            } catch (error) {
              console.warn(`Failed to download module import ${moduleInfo.url}:`, error.message);
            }
          }
        } catch (error) {
          console.warn('Error processing module import:', error);
        }
      }
    }

    // Process Service Worker scripts
    if (capturedAssets && capturedAssets.serviceWorkers) {
      console.log(`Processing ${capturedAssets.serviceWorkers.length} Service Worker scripts...`);
      for (const sw of capturedAssets.serviceWorkers) {
        try {
          if (sw.scriptURL && !savedFiles[sw.scriptURL]) {
            // Download Service Worker script using fetch
            try {
              const response = await page.evaluate(async (scriptURL) => {
                try {
                  const res = await fetch(scriptURL);
                  if (res.ok) {
                    const text = await res.text();
                    return { success: true, content: text };
                  }
                  return { success: false, error: `HTTP ${res.status}` };
                } catch (error) {
                  return { success: false, error: error.message };
                }
              }, sw.scriptURL);

              if (response && response.success && response.content) {
                let localRelativePath = FileUtils.generateLocalPath(sw.scriptURL);
                // Ensure .js extension for SW scripts
                if (!localRelativePath.endsWith('.js')) {
                  localRelativePath += '.js';
                }
                const savePath = path.join(assetsDir, localRelativePath);
                await fs.ensureDir(path.dirname(savePath));
                await fs.outputFile(savePath, response.content, 'utf8');
                savedFiles[sw.scriptURL] = savePath;
                console.log(`Service Worker script saved: ${savePath}`);
                
                process.send({
                  type: 'progress',
                  payload: {
                    savedResource: sw.scriptURL,
                    path: savePath,
                    status: 'downloaded',
                    resourceType: 'service-worker'
                  }
                });
              } else {
                console.warn(`Failed to download Service Worker script ${sw.scriptURL}: ${response?.error || 'Unknown error'}`);
              }
            } catch (error) {
              console.warn(`Failed to download Service Worker script ${sw.scriptURL}:`, error.message);
            }
          }
        } catch (error) {
          console.warn('Error processing Service Worker:', error);
        }
      }
    }

    // Progress tracking
    let totalFiles = 0;
    let processedFiles = 0;
    let downloadedFiles = 0;
    let skippedFiles = 0;

    // Set up request interception
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();

      // Handle Resource Filtering
      if (resourceFilters) {
        if (resourceFilters.images && resourceType === 'image') return request.abort();
        if (resourceFilters.media && (resourceType === 'media' || resourceType === 'texttrack')) return request.abort();
        if (resourceFilters.cssjs && (resourceType === 'stylesheet' || resourceType === 'script')) return request.abort();
      }

      request.continue().catch(() => { });
    });

    // Handle responses
    page.on('response', async (response) => {
      const request = response.request();
      const requestUrl = request.url();
      const resourceType = request.resourceType();
      const status = response.status();

      try {
        // Handle API requests (XHR/Fetch)
        if (resourceType === 'xhr' || resourceType === 'fetch') {
          let body = '';
          try {
            body = await response.text();
          } catch (_) { }

          const entry = {
            timestamp: new Date().toISOString(),
            method: request.method(),
            url: requestUrl,
            headers: request.headers(),
            postData: request.postData(),
            status,
            responseText: body
          };

          apiLogs.push(entry);
          process.send({
            type: 'progress',
            payload: { apiCaptured: requestUrl }
          });
        }

        // Handle static resources and media
        if (['stylesheet', 'script', 'image', 'font', 'document', 'media', 'texttrack', 'other'].includes(resourceType)) {
          // Skip base64 data URLs
          if (requestUrl.startsWith('data:')) {
            process.send({
              type: 'progress',
              payload: { skippedResource: requestUrl, reason: 'base64 data URL' }
            });
            return;
          }

          let buffer = null;
          try {
            buffer = await response.buffer();
          } catch (_) { }

          if (buffer && buffer.length) {
            processedFiles++;

            // Generate local path based on URL structure
            let localRelativePath = FileUtils.generateLocalPath(requestUrl);

            // Ensure .html extension for document types if missing
            if (resourceType === 'document' && !path.extname(localRelativePath) && !localRelativePath.endsWith('.html')) {
              localRelativePath += '.html';
            }

            const savePath = path.join(assetsDir, localRelativePath);

            // Check if file already exists
            const fileExists = await fs.pathExists(savePath);
            if (fileExists) {
              // File already exists, skip download
              skippedFiles++;
              savedFiles[requestUrl] = savePath;
              process.send({
                type: 'progress',
                payload: {
                  savedResource: requestUrl,
                  path: savePath,
                  status: 'skipped',
                  reason: 'File already exists',
                  progress: {
                    total: processedFiles, // Show current count as total since we don't know the actual total
                    processed: processedFiles,
                    downloaded: downloadedFiles,
                    skipped: skippedFiles,
                    percentage: 100, // Always 100% since we're processing files as they come
                    currentFile: path.basename(requestUrl),
                    currentFileProgress: 100
                  }
                }
              });
            } else {
              // File doesn't exist, download it
              downloadedFiles++;
              await fs.ensureDir(path.dirname(savePath));
              await fs.outputFile(savePath, buffer);

              savedFiles[requestUrl] = savePath;
              process.send({
                type: 'progress',
                payload: {
                  savedResource: requestUrl,
                  path: savePath,
                  status: 'downloaded',
                  progress: {
                    total: processedFiles, // Show current count as total since we don't know the actual total
                    processed: processedFiles,
                    downloaded: downloadedFiles,
                    skipped: skippedFiles,
                    percentage: 100, // Always 100% since we're processing files as they come
                    currentFile: path.basename(requestUrl),
                    currentFileProgress: 100
                  }
                }
              });
            }
          }
        }
      } catch (error) {
        console.error('Error processing response:', error);
      }
    });

    // Set up WebSocket logging via CDP
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');

    client.on('Network.webSocketFrameSent', (event) => {
      wsLogs.push({
        type: 'sent',
        timestamp: Date.now(),
        id: event.requestId,
        data: event.response?.payloadData,
        op: event.response?.opcode
      });
    });

    client.on('Network.webSocketFrameReceived', (event) => {
      wsLogs.push({
        type: 'recv',
        timestamp: Date.now(),
        id: event.requestId,
        data: event.response?.payloadData,
        op: event.response?.opcode
      });
    });

    // Navigate to the page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 90000
    });

    // Enhanced lazy loading trigger
    const lazyLoadProcessor = new LazyLoadProcessor();
    const lazyStats = await lazyLoadProcessor.getLazyStats(page);
    
    if (lazyStats.total > 0) {
      console.log(`Found ${lazyStats.total} lazy elements (${lazyStats.lazyImages} images, ${lazyStats.lazyIframes} iframes, ${lazyStats.customLazy} custom)`);
      process.send({
        type: 'progress',
        payload: {
          lazyElementsFound: lazyStats.total,
          message: `Triggering lazy loading for ${lazyStats.total} elements...`
        }
      });
      
      await lazyLoadProcessor.triggerLazyLoading(page, {
        scrollDistance: 100,
        scrollDelay: 100,
        waitAfterScroll: 3000,
        maxScrolls: 100,
        triggerIntersectionObserver: true,
        triggerImageLoad: true
      });
      
      console.log('Lazy loading trigger completed');
    } else {
      // Fallback to simple scroll if no lazy elements detected
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight - window.innerHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      
      // Wait for additional content to load after scroll
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Get page HTML
    const pageHtml = await page.content();

    // Discover and download meta files
    const metaFilesCapture = new MetaFilesCapture();
    const discoveredMetaFiles = metaFilesCapture.discoverMetaFiles(url);
    const htmlMetaFiles = metaFilesCapture.extractFromHTML(pageHtml, url);
    const allMetaFiles = [...discoveredMetaFiles, ...htmlMetaFiles];
    
    console.log(`Discovered ${allMetaFiles.length} meta file(s) to check`);
    
    // Download meta files
    for (const metaFile of allMetaFiles) {
      try {
        // Skip if already downloaded
        if (savedFiles[metaFile.url]) {
          continue;
        }

        const response = await page.evaluate(async (metaUrl) => {
          try {
            const res = await fetch(metaUrl);
            if (res.ok) {
              const contentType = res.headers.get('content-type') || '';
              if (contentType.includes('application/json')) {
                const json = await res.json();
                return { success: true, content: JSON.stringify(json, null, 2), type: 'json' };
              } else {
                const text = await res.text();
                return { success: true, content: text, type: 'text' };
              }
            }
            return { success: false, error: `HTTP ${res.status}` };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }, metaFile.url);

        if (response && response.success && response.content) {
          // Generate local path
          let localRelativePath = FileUtils.generateLocalPath(metaFile.url);
          
          // Ensure proper extension
          if (metaFile.type === 'manifest' && !localRelativePath.endsWith('.json') && !localRelativePath.endsWith('.webmanifest')) {
            localRelativePath += '.json';
          } else if (metaFile.type === 'sitemap' && !localRelativePath.endsWith('.xml')) {
            localRelativePath += '.xml';
          } else if (metaFile.type === 'robots' && !localRelativePath.endsWith('.txt')) {
            localRelativePath += '.txt';
          }
          
          const savePath = path.join(assetsDir, localRelativePath);
          await fs.ensureDir(path.dirname(savePath));
          await fs.outputFile(savePath, response.content, 'utf8');
          savedFiles[metaFile.url] = savePath;
          console.log(`Meta file saved: ${savePath} (${metaFile.type})`);
          
          // Parse and extract additional resources from certain meta files
          if (metaFile.type === 'robots' && response.content) {
            const sitemaps = metaFilesCapture.parseRobotsTxt(response.content, url);
            allMetaFiles.push(...sitemaps);
            console.log(`Found ${sitemaps.length} sitemap(s) in robots.txt`);
          } else if (metaFile.type === 'manifest' && response.type === 'json') {
            try {
              const manifest = JSON.parse(response.content);
              const manifestResources = metaFilesCapture.parseManifest(manifest, url);
              allMetaFiles.push(...manifestResources);
              console.log(`Found ${manifestResources.length} resource(s) in manifest`);
            } catch (e) {
              console.warn('Failed to parse manifest:', e);
            }
          }
          
          process.send({
            type: 'progress',
            payload: {
              savedResource: metaFile.url,
              path: savePath,
              status: 'downloaded',
              resourceType: `meta-${metaFile.type}`
            }
          });
        } else {
          // Silently skip 404s for meta files (they're optional)
          if (response?.error && !response.error.includes('404')) {
            console.warn(`Failed to download meta file ${metaFile.url}: ${response.error}`);
          }
        }
      } catch (error) {
        console.warn(`Error processing meta file ${metaFile.url}:`, error.message);
      }
    }

    // Extract additional URLs using advanced extractor
    const urlExtractor = new URLExtractor();
    const additionalUrls = [];
    
    // Extract from HTML
    const htmlUrls = urlExtractor.extractFromHTML(pageHtml, url);
    additionalUrls.push(...htmlUrls);
    
    // Extract from saved CSS files
    for (const [fileUrl, localPath] of Object.entries(savedFiles)) {
      if (/\.css(\?|$)/i.test(fileUrl)) {
        try {
          const cssContent = await fs.readFile(localPath, 'utf8').catch(() => null);
          if (cssContent) {
            const cssUrls = urlExtractor.extractFromCSS(cssContent, url);
            additionalUrls.push(...cssUrls);
          }
        } catch (error) {
          console.warn(`Failed to extract URLs from CSS ${localPath}:`, error);
        }
      }
    }
    
    // Extract from saved JS files
    for (const [fileUrl, localPath] of Object.entries(savedFiles)) {
      if (/\.js(\?|$)/i.test(fileUrl)) {
        try {
          const jsContent = await fs.readFile(localPath, 'utf8').catch(() => null);
          if (jsContent) {
            const jsUrls = urlExtractor.extractFromJS(jsContent, url);
            additionalUrls.push(...jsUrls);
          }
        } catch (error) {
          console.warn(`Failed to extract URLs from JS ${localPath}:`, error);
        }
      }
    }

    // Download additional URLs that weren't already captured
    if (additionalUrls.length > 0) {
      console.log(`Found ${additionalUrls.length} additional URLs from advanced extraction`);
      
      for (const urlInfo of additionalUrls) {
        if (savedFiles[urlInfo.url]) {
          continue; // Already downloaded
        }

        try {
          // Try to download via response handler (will be caught by existing handler)
          // Or download directly if needed
          const response = await page.goto(urlInfo.url, { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null);
          if (response && response.ok()) {
            // Will be handled by existing response handler
            console.log(`Queued additional URL for download: ${urlInfo.url}`);
          }
        } catch (error) {
          // URL will be handled by existing response interception
          console.debug(`Additional URL will be handled by response handler: ${urlInfo.url}`);
        }
      }
    }

    // Calculate save path for the main HTML file
    let mainHtmlRelativePath = FileUtils.generateLocalPath(url);
    if (!path.extname(mainHtmlRelativePath) && !mainHtmlRelativePath.endsWith('.html')) {
      mainHtmlRelativePath += '.html';
    }

    // Always save HTML file in assets directory
    const htmlAssetsDir = path.join(baseOut, 'assets');
    const savedHtmlPath = path.join(htmlAssetsDir, mainHtmlRelativePath);

    // Replace absolute URLs with relative paths (from assets directory)
    let transformedHtml = pageHtml;
    // We need to calculate paths relative to the HTML file location
    const htmlDir = path.dirname(savedHtmlPath);

    for (const [remoteUrl, localFullPath] of Object.entries(savedFiles)) {
      // Calculate path from HTML file to the asset
      const relativePath = path.relative(htmlDir, localFullPath)
        .split(path.sep).join('/'); // Ensure forward slashes for URLs

      transformedHtml = transformedHtml.split(remoteUrl).join(relativePath);
    }

    // Process inline CSS to fix [object Object] URLs
    transformedHtml = processInlineCss(transformedHtml, url);

    // Save HTML file in assets directory
    await fs.ensureDir(path.dirname(savedHtmlPath));
    await fs.outputFile(savedHtmlPath, transformedHtml, 'utf8');

    // Process CSS files to rewrite URL references and handle @import
    await processCssFiles(savedFiles, url, assetsDir, page);

    // Discover and download source maps (before closing browser)
    await discoverAndDownloadSourceMaps(savedFiles, assetsDir, url, page);

    // Save logs
    await saveApiLogs(apiLogs, logsDir);
    await fs.outputJson(
      path.join(logsDir, 'ws_logs.json'),
      wsLogs,
      { spaces: 2 }
    );

    // Extract links for crawling (before closing browser)
    let links = [];
    try {
      links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => href.startsWith('http') || href.startsWith('https'));
      });
    } catch (e) {
      console.warn('Error extracting links:', e);
    }

    await browser.close();

    // Return the saved HTML file path and extracted links
    const result = {
      savedFullPath: savedHtmlPath,
      savedRelativePath: path.basename(savedHtmlPath),
      links: [...new Set(links)] // Deduplicate links
    };

    process.send({
      type: 'done',
      payload: result
    });

  } catch (error) {
    process.send({
      type: 'error',
      payload: String(error?.stack || error)
    });
  }
});
