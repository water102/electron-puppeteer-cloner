/**
 * Advanced URL Pattern Extractor
 * Extracts URLs from various sources: srcset, picture, CSS custom properties, etc.
 */

class URLExtractor {
  constructor() {
    this.extractedUrls = new Set();
  }

  /**
   * Extract URLs from HTML content
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL for resolution
   * @returns {Array} Array of extracted URLs
   */
  extractFromHTML(html, baseUrl) {
    const urls = [];
    
    // Extract from srcset attributes
    const srcsetRegex = /srcset\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = srcsetRegex.exec(html)) !== null) {
      const srcsetValue = match[1];
      // Parse srcset: "image1.jpg 1x, image2.jpg 2x" or "image1.jpg 100w, image2.jpg 200w"
      const srcsetUrls = srcsetValue.split(',').map(item => {
        const parts = item.trim().split(/\s+/);
        return parts[0]; // Get the URL part
      });
      
      srcsetUrls.forEach(url => {
        try {
          const absoluteUrl = new URL(url, baseUrl).toString();
          if (!this.extractedUrls.has(absoluteUrl)) {
            this.extractedUrls.add(absoluteUrl);
            urls.push({
              url: absoluteUrl,
              source: 'srcset',
              type: 'image'
            });
          }
        } catch (e) {
          // Skip invalid URLs
        }
      });
    }

    // Extract from <picture> elements
    const pictureRegex = /<picture[^>]*>([\s\S]*?)<\/picture>/gi;
    while ((match = pictureRegex.exec(html)) !== null) {
      const pictureContent = match[1];
      
      // Extract <source srcset="...">
      const sourceRegex = /<source[^>]+srcset\s*=\s*["']([^"']+)["'][^>]*>/gi;
      let sourceMatch;
      while ((sourceMatch = sourceRegex.exec(pictureContent)) !== null) {
        const srcsetValue = sourceMatch[1];
        const srcsetUrls = srcsetValue.split(',').map(item => {
          const parts = item.trim().split(/\s+/);
          return parts[0];
        });
        
        srcsetUrls.forEach(url => {
          try {
            const absoluteUrl = new URL(url, baseUrl).toString();
            if (!this.extractedUrls.has(absoluteUrl)) {
              this.extractedUrls.add(absoluteUrl);
              urls.push({
                url: absoluteUrl,
                source: 'picture-source',
                type: 'image'
              });
            }
          } catch (e) {
            // Skip invalid URLs
          }
        });
      }
    }

    // Extract from <video> and <audio> source elements
    const mediaSourceRegex = /<(video|audio)[^>]*>([\s\S]*?)<\/\1>/gi;
    while ((match = mediaSourceRegex.exec(html)) !== null) {
      const mediaContent = match[2];
      const sourceRegex = /<source[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
      let sourceMatch;
      while ((sourceMatch = sourceRegex.exec(mediaContent)) !== null) {
        const srcUrl = sourceMatch[1];
        try {
          const absoluteUrl = new URL(srcUrl, baseUrl).toString();
          if (!this.extractedUrls.has(absoluteUrl)) {
            this.extractedUrls.add(absoluteUrl);
            urls.push({
              url: absoluteUrl,
              source: `${match[1]}-source`,
              type: 'media'
            });
          }
        } catch (e) {
          // Skip invalid URLs
        }
      }
    }

    // Extract from <track> elements (subtitles)
    const trackRegex = /<track[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = trackRegex.exec(html)) !== null) {
      const trackUrl = match[1];
      try {
        const absoluteUrl = new URL(trackUrl, baseUrl).toString();
        if (!this.extractedUrls.has(absoluteUrl)) {
          this.extractedUrls.add(absoluteUrl);
          urls.push({
            url: absoluteUrl,
            source: 'track',
            type: 'subtitle'
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract from link preload/prefetch
    const linkPreloadRegex = /<link[^>]+rel\s*=\s*["'](preload|prefetch|dns-prefetch)["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = linkPreloadRegex.exec(html)) !== null) {
      const linkUrl = match[2];
      const relType = match[1];
      try {
        const absoluteUrl = new URL(linkUrl, baseUrl).toString();
        if (!this.extractedUrls.has(absoluteUrl)) {
          this.extractedUrls.add(absoluteUrl);
          urls.push({
            url: absoluteUrl,
            source: `link-${relType}`,
            type: 'resource'
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract from meta tags (Open Graph, Twitter Cards)
    const metaImageRegex = /<meta[^>]+(property|name)\s*=\s*["'](og:image|twitter:image|twitter:image:src)["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = metaImageRegex.exec(html)) !== null) {
      const imageUrl = match[3];
      try {
        const absoluteUrl = new URL(imageUrl, baseUrl).toString();
        if (!this.extractedUrls.has(absoluteUrl)) {
          this.extractedUrls.add(absoluteUrl);
          urls.push({
            url: absoluteUrl,
            source: 'meta-image',
            type: 'image'
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    return urls;
  }

  /**
   * Extract URLs from CSS content
   * @param {string} cssContent - CSS content
   * @param {string} baseUrl - Base URL for resolution
   * @returns {Array} Array of extracted URLs
   */
  extractFromCSS(cssContent, baseUrl) {
    const urls = [];
    
    // Extract all url() patterns (including nested)
    const urlRegex = /url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi;
    let match;
    
    while ((match = urlRegex.exec(cssContent)) !== null) {
      const urlValue = match[1].trim();
      
      // Skip data URLs
      if (urlValue.startsWith('data:')) {
        continue;
      }
      
      try {
        let absoluteUrl;
        if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) {
          absoluteUrl = urlValue;
        } else {
          absoluteUrl = new URL(urlValue, baseUrl).toString();
        }
        
        if (!this.extractedUrls.has(absoluteUrl)) {
          this.extractedUrls.add(absoluteUrl);
          
          // Determine type by extension
          let type = 'resource';
          const ext = absoluteUrl.split('.').pop().toLowerCase();
          if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
            type = 'image';
          } else if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) {
            type = 'font';
          } else if (['mp4', 'webm', 'ogg', 'mp3', 'wav'].includes(ext)) {
            type = 'media';
          }
          
          urls.push({
            url: absoluteUrl,
            source: 'css-url',
            type: type
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract CSS custom properties with URLs (--variable: url(...))
    const customPropRegex = /--[^:]+:\s*url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi;
    while ((match = customPropRegex.exec(cssContent)) !== null) {
      const urlValue = match[1].trim();
      
      if (urlValue.startsWith('data:')) {
        continue;
      }
      
      try {
        const absoluteUrl = new URL(urlValue, baseUrl).toString();
        if (!this.extractedUrls.has(absoluteUrl)) {
          this.extractedUrls.add(absoluteUrl);
          urls.push({
            url: absoluteUrl,
            source: 'css-custom-property',
            type: 'resource'
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    return urls;
  }

  /**
   * Extract URLs from JavaScript content
   * @param {string} jsContent - JavaScript content
   * @param {string} baseUrl - Base URL for resolution
   * @returns {Array} Array of extracted URLs
   */
  extractFromJS(jsContent, baseUrl) {
    const urls = [];
    
    // Extract import() calls
    const dynamicImportRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/gi;
    let match;
    while ((match = dynamicImportRegex.exec(jsContent)) !== null) {
      const importUrl = match[1];
      try {
        const absoluteUrl = new URL(importUrl, baseUrl).toString();
        if (!this.extractedUrls.has(absoluteUrl)) {
          this.extractedUrls.add(absoluteUrl);
          urls.push({
            url: absoluteUrl,
            source: 'dynamic-import',
            type: 'script'
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract fetch() calls with string literals
    const fetchRegex = /fetch\s*\(\s*["']([^"']+)["']/gi;
    while ((match = fetchRegex.exec(jsContent)) !== null) {
      const fetchUrl = match[1];
      try {
        const absoluteUrl = new URL(fetchUrl, baseUrl).toString();
        if (!this.extractedUrls.has(absoluteUrl)) {
          this.extractedUrls.add(absoluteUrl);
          urls.push({
            url: absoluteUrl,
            source: 'fetch',
            type: 'api'
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract new Worker() calls
    const workerRegex = /new\s+Worker\s*\(\s*["']([^"']+)["']/gi;
    while ((match = workerRegex.exec(jsContent)) !== null) {
      const workerUrl = match[1];
      try {
        const absoluteUrl = new URL(workerUrl, baseUrl).toString();
        if (!this.extractedUrls.has(absoluteUrl)) {
          this.extractedUrls.add(absoluteUrl);
          urls.push({
            url: absoluteUrl,
            source: 'worker-constructor',
            type: 'script'
          });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    return urls;
  }

  /**
   * Clear extracted URLs cache
   */
  clear() {
    this.extractedUrls.clear();
  }
}

export default URLExtractor;

