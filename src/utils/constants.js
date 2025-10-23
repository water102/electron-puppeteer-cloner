/**
 * Application constants
 */
export default {
  // Application info
  APP_NAME: 'Web Cloner',
  APP_VERSION: '0.3.0',
  
  // File types
  RESOURCE_TYPES: {
    STYLESHEET: 'stylesheet',
    SCRIPT: 'script',
    IMAGE: 'image',
    FONT: 'font',
    DOCUMENT: 'document',
    XHR: 'xhr',
    FETCH: 'fetch',
    OTHER: 'other'
  },
  
  // WebSocket frame types
  WS_FRAME_TYPES: {
    SENT: 'sent',
    RECEIVED: 'recv'
  },
  
  // Log levels
  LOG_LEVELS: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
  },
  
  // Default values
  DEFAULTS: {
    PORT: 8080,
    TIMEOUT: 30000,
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    WAIT_FOR_TIMEOUT: 3000
  },
  
  // UI messages
  MESSAGES: {
    NO_SOURCE_URL: 'No source URL provided',
    NO_OUTPUT_DIR: 'Choose output folder first',
    NO_FILENAME: 'Provide filename',
    CLONE_STARTED: 'Starting clone operation...',
    CLONE_COMPLETED: 'Clone operation completed',
    CLONE_FAILED: 'Clone operation failed',
    SERVER_STARTED: 'Static server started',
    SERVER_STOPPED: 'Static server stopped',
    COOKIES_APPLIED: 'Cookies applied successfully'
  }
};
