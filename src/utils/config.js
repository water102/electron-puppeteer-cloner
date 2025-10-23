/**
 * Application configuration
 */
export default {
  // Default server configuration
  server: {
    defaultPort: 8080,
    maxPort: 65535
  },

  // Puppeteer configuration
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
    timeout: 90000,
    waitForTimeout: 3000
  },

  // File processing configuration
  processing: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    supportedImageTypes: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    supportedFontTypes: ['.woff', '.woff2', '.ttf', '.otf', '.eot'],
    supportedScriptTypes: ['.js', '.mjs'],
    supportedStyleTypes: ['.css', '.scss', '.sass']
  },

  // Logging configuration
  logging: {
    maxLogEntries: 1000,
    logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  }
};
