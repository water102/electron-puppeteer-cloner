/**
 * Electron configuration for ESM support
 */
export default {
  // Main process configuration
  main: {
    // Entry point for main process
    entry: 'src/main/main.js',
    
    // Node.js options
    node: {
      // Enable ES modules
      type: 'module'
    }
  },
  
  // Renderer process configuration
  renderer: {
    // Enable context isolation
    contextIsolation: true,
    
    // Disable node integration for security
    nodeIntegration: false,
    
    // Enable webview tag
    webviewTag: true,
    
    // Allow running insecure content for development
    allowRunningInsecureContent: true
  },
  
  // Development configuration
  development: {
    // Enable dev tools in development
    devTools: true,
    
    // Hot reload configuration
    hotReload: true
  }
};
