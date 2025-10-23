import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import urlMod from 'url';
import postcss from 'postcss';
import postcssUrl from 'postcss-url';

/**
 * Clone worker process for handling Puppeteer operations
 */

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
 * Process CSS files to rewrite URL references
 * @param {Object} savedFiles - Map of saved files
 * @param {string} baseUrl - Base URL for resolution
 */
async function processCssFiles(savedFiles, baseUrl) {
  const cssFiles = Object.values(savedFiles).filter(filePath => 
    /\.css(\?|$)/i.test(filePath)
  );
  
  for (const cssPath of cssFiles) {
    try {
      const cssText = await fs.readFile(cssPath, 'utf8');
      const cssDir = path.dirname(cssPath);
      
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
  const { url, outputDir, filename, htmlOnly, html, cookies = [], networkData = null } = options || {};
  
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
      for (const resource of networkData.resources) {
        try {
          const resourceUrl = resource.url || resource.name;
          if (resourceUrl && !savedFiles[resourceUrl]) {
            // Add to saved files for processing
            savedFiles[resourceUrl] = resourceUrl; // Will be processed later
            console.log(`Added captured resource: ${resourceUrl}`);
          }
        } catch (error) {
          console.warn('Error processing captured resource:', error);
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
    page.on('request', (request) => request.continue().catch(() => {}));

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
          } catch (_) {}
          
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

        // Handle static resources
        if (['stylesheet', 'script', 'image', 'font', 'document', 'other'].includes(resourceType)) {
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
          } catch (_) {}
          
          if (buffer && buffer.length) {
            processedFiles++;
            
            const parsed = urlMod.parse(requestUrl);
            let pathname = parsed.pathname || '/';
            if (pathname.endsWith('/')) pathname += 'index';
            
            // Add .html extension for HTML files without extension
            if (resourceType === 'document' && !pathname.includes('.') && !pathname.endsWith('.html')) {
              pathname += '.html';
            }
            
            const savePath = path.join(assetsDir, pathname.replace(/^\//, ''));
            
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
    
    // Wait for additional content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get page HTML
    const pageHtml = await page.content();
    
    // Always save HTML file in assets directory
    const htmlAssetsDir = path.join(baseOut, 'assets');
    const savedHtmlPath = path.join(htmlAssetsDir, filename);

    // Replace absolute URLs with relative paths (from assets directory)
    let transformedHtml = pageHtml;
    for (const [remoteUrl, localFullPath] of Object.entries(savedFiles)) {
      const relativePath = path.relative(htmlAssetsDir, localFullPath)
        .split(path.sep).join('/');
      transformedHtml = transformedHtml.split(remoteUrl).join(relativePath);
    }
    
    // Process inline CSS to fix [object Object] URLs
    transformedHtml = processInlineCss(transformedHtml, url);
    
    // Save HTML file in assets directory
    await fs.ensureDir(htmlAssetsDir);
    await fs.outputFile(savedHtmlPath, transformedHtml, 'utf8');

    // Process CSS files to rewrite URL references
    await processCssFiles(savedFiles, url);

    // Save logs
    await saveApiLogs(apiLogs, logsDir);
    await fs.outputJson(
      path.join(logsDir, 'ws_logs.json'),
      wsLogs,
      { spaces: 2 }
    );

    await browser.close();
    
    // Return the saved HTML file path
    const result = {
      savedFullPath: savedHtmlPath,
      savedRelativePath: path.basename(savedHtmlPath)
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
