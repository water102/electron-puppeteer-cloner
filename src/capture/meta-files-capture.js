/**
 * Meta Files Capture Module
 * Auto-discovers and captures common meta files (robots.txt, sitemap.xml, manifest.json, etc.)
 */

class MetaFilesCapture {
  constructor() {
    this.metaFiles = new Map();
    this.discoveredFiles = [];
  }

  /**
   * Discover common meta files for a given URL
   * @param {string} baseUrl - Base URL of the website
   * @returns {Array} Array of meta file URLs to check
   */
  discoverMetaFiles(baseUrl) {
    const metaFiles = [];
    
    try {
      const urlObj = new URL(baseUrl);
      const origin = urlObj.origin;
      const pathname = urlObj.pathname;
      
      // Common meta files at root
      const rootMetaFiles = [
        'robots.txt',
        'sitemap.xml',
        'sitemap_index.xml',
        'humans.txt',
        'security.txt',
        'manifest.json',
        'site.webmanifest',
        'browserconfig.xml',
        'favicon.ico',
        'apple-touch-icon.png',
        '.well-known/security.txt',
        '.well-known/robots.txt'
      ];

      // Add root-level meta files
      rootMetaFiles.forEach(filename => {
        metaFiles.push({
          url: `${origin}/${filename}`,
          type: this.getFileType(filename),
          priority: this.getPriority(filename)
        });
      });

      // Check for sitemap in robots.txt location (will be discovered when robots.txt is fetched)
      // Check for manifest in HTML (will be discovered from HTML parsing)

      return metaFiles.sort((a, b) => b.priority - a.priority); // Sort by priority
    } catch (error) {
      console.warn('Failed to discover meta files:', error);
      return [];
    }
  }

  /**
   * Get file type based on filename
   * @param {string} filename - Filename
   * @returns {string} File type
   */
  getFileType(filename) {
    if (filename.includes('robots')) return 'robots';
    if (filename.includes('sitemap')) return 'sitemap';
    if (filename.includes('manifest')) return 'manifest';
    if (filename.includes('humans')) return 'humans';
    if (filename.includes('security')) return 'security';
    if (filename.includes('favicon') || filename.includes('icon')) return 'icon';
    if (filename.includes('browserconfig')) return 'browserconfig';
    return 'meta';
  }

  /**
   * Get priority for file (higher = more important)
   * @param {string} filename - Filename
   * @returns {number} Priority
   */
  getPriority(filename) {
    if (filename.includes('manifest')) return 10;
    if (filename.includes('robots')) return 9;
    if (filename.includes('sitemap')) return 8;
    if (filename.includes('favicon') || filename.includes('icon')) return 7;
    if (filename.includes('security')) return 6;
    if (filename.includes('humans')) return 5;
    return 3;
  }

  /**
   * Extract meta file references from HTML
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL
   * @returns {Array} Array of meta file URLs
   */
  extractFromHTML(html, baseUrl) {
    const metaFiles = [];

    // Extract manifest.json / site.webmanifest
    const manifestRegex = /<link[^>]+rel\s*=\s*["']manifest["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = manifestRegex.exec(html)) !== null) {
      try {
        const manifestUrl = new URL(match[1], baseUrl).toString();
        metaFiles.push({
          url: manifestUrl,
          type: 'manifest',
          priority: 10,
          source: 'html-link'
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract favicon
    const faviconRegex = /<link[^>]+rel\s*=\s*["'](?:icon|shortcut icon)["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = faviconRegex.exec(html)) !== null) {
      try {
        const faviconUrl = new URL(match[1], baseUrl).toString();
        metaFiles.push({
          url: faviconUrl,
          type: 'icon',
          priority: 7,
          source: 'html-link'
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract apple-touch-icon
    const appleIconRegex = /<link[^>]+rel\s*=\s*["']apple-touch-icon["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = appleIconRegex.exec(html)) !== null) {
      try {
        const iconUrl = new URL(match[1], baseUrl).toString();
        metaFiles.push({
          url: iconUrl,
          type: 'icon',
          priority: 7,
          source: 'html-link'
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract Open Graph images
    const ogImageRegex = /<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = ogImageRegex.exec(html)) !== null) {
      try {
        const imageUrl = new URL(match[1], baseUrl).toString();
        metaFiles.push({
          url: imageUrl,
          type: 'og-image',
          priority: 6,
          source: 'html-meta'
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Extract Twitter Card images
    const twitterImageRegex = /<meta[^>]+name\s*=\s*["']twitter:image["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = twitterImageRegex.exec(html)) !== null) {
      try {
        const imageUrl = new URL(match[1], baseUrl).toString();
        metaFiles.push({
          url: imageUrl,
          type: 'twitter-image',
          priority: 6,
          source: 'html-meta'
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    return metaFiles;
  }

  /**
   * Parse robots.txt to find sitemap references
   * @param {string} robotsContent - robots.txt content
   * @param {string} baseUrl - Base URL
   * @returns {Array} Array of sitemap URLs
   */
  parseRobotsTxt(robotsContent, baseUrl) {
    const sitemaps = [];
    const lines = robotsContent.split('\n');
    
    for (const line of lines) {
      const sitemapMatch = line.match(/^Sitemap:\s*(.+)$/i);
      if (sitemapMatch) {
        try {
          const sitemapUrl = new URL(sitemapMatch[1].trim(), baseUrl).toString();
          sitemaps.push({
            url: sitemapUrl,
            type: 'sitemap',
            priority: 8,
            source: 'robots-txt'
          });
        } catch (e) {
          // Skip invalid URLs
        }
      }
    }
    
    return sitemaps;
  }

  /**
   * Parse manifest.json to find additional resources
   * @param {Object} manifest - Parsed manifest JSON
   * @param {string} baseUrl - Base URL
   * @returns {Array} Array of resource URLs
   */
  parseManifest(manifest, baseUrl) {
    const resources = [];
    
    // Extract icons
    if (manifest.icons && Array.isArray(manifest.icons)) {
      manifest.icons.forEach(icon => {
        if (icon.src) {
          try {
            const iconUrl = new URL(icon.src, baseUrl).toString();
            resources.push({
              url: iconUrl,
              type: 'icon',
              priority: 7,
              source: 'manifest'
            });
          } catch (e) {
            // Skip invalid URLs
          }
        }
      });
    }

    // Extract screenshots
    if (manifest.screenshots && Array.isArray(manifest.screenshots)) {
      manifest.screenshots.forEach(screenshot => {
        if (screenshot.src) {
          try {
            const screenshotUrl = new URL(screenshot.src, baseUrl).toString();
            resources.push({
              url: screenshotUrl,
              type: 'screenshot',
              priority: 5,
              source: 'manifest'
            });
          } catch (e) {
            // Skip invalid URLs
          }
        }
      });
    }

    // Extract start_url and scope
    if (manifest.start_url) {
      try {
        const startUrl = new URL(manifest.start_url, baseUrl).toString();
        resources.push({
          url: startUrl,
          type: 'page',
          priority: 4,
          source: 'manifest'
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    return resources;
  }

  /**
   * Get all discovered meta files
   * @returns {Array} Array of meta file objects
   */
  getDiscoveredFiles() {
    return this.discoveredFiles;
  }

  /**
   * Clear discovered files
   */
  clear() {
    this.discoveredFiles = [];
    this.metaFiles.clear();
  }
}

export default MetaFilesCapture;

