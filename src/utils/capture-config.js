/**
 * Capture Configuration System
 * Manages capture settings and preferences
 */

const DEFAULT_CAPTURE_CONFIG = {
  capture: {
    serviceWorkers: true,
    webWorkers: true,
    blobUrls: true,
    dataUrls: true,
    sourceMaps: true,
    iframes: true,
    metaFiles: true,
    cssImports: true
  },
  lazyLoading: {
    waitForLazyImages: true,
    scrollToTrigger: true,
    waitTime: 5
  },
  advanced: {
    includeCDN: false,
    includeExternal: false,
    downloadDuplicates: false
  }
};

class CaptureConfig {
  constructor(storageKey = 'captureSettings') {
    this.storageKey = storageKey;
    this.config = this.load();
  }

  /**
   * Load configuration from localStorage (renderer) or file (main)
   */
  load() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Renderer process - use localStorage
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
          return JSON.parse(saved);
        }
      } else {
        // Main process - could use file system
        // For now, return default
      }
    } catch (error) {
      console.warn('Failed to load capture config:', error);
    }
    return this.getDefault();
  }

  /**
   * Save configuration to localStorage (renderer) or file (main)
   */
  save(config = null) {
    try {
      const configToSave = config || this.config;
      
      if (typeof window !== 'undefined' && window.localStorage) {
        // Renderer process - use localStorage
        localStorage.setItem(this.storageKey, JSON.stringify(configToSave));
        this.config = configToSave;
        return true;
      } else {
        // Main process - could use file system
        this.config = configToSave;
        return true;
      }
    } catch (error) {
      console.warn('Failed to save capture config:', error);
      return false;
    }
  }

  /**
   * Get default configuration
   */
  getDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_CAPTURE_CONFIG));
  }

  /**
   * Reset to default configuration
   */
  reset() {
    this.config = this.getDefault();
    this.save();
    return this.config;
  }

  /**
   * Get a specific config value
   * @param {string} path - Dot-separated path (e.g., 'capture.serviceWorkers')
   */
  get(path) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Set a specific config value
   * @param {string} path - Dot-separated path (e.g., 'capture.serviceWorkers')
   * @param {*} value - Value to set
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;
    
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    target[lastKey] = value;
    this.save();
    return this.config;
  }

  /**
   * Get all configuration
   */
  getAll() {
    return this.config;
  }

  /**
   * Update configuration with partial config
   * @param {Object} partialConfig - Partial configuration to merge
   */
  update(partialConfig) {
    this.config = this.deepMerge(this.config, partialConfig);
    this.save();
    return this.config;
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  /**
   * Check if value is an object
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Validate configuration
   */
  validate(config = null) {
    const configToValidate = config || this.config;
    const errors = [];

    // Validate capture options
    if (configToValidate.capture) {
      const captureOptions = ['serviceWorkers', 'webWorkers', 'blobUrls', 'dataUrls', 
                             'sourceMaps', 'iframes', 'metaFiles', 'cssImports'];
      for (const option of captureOptions) {
        if (typeof configToValidate.capture[option] !== 'boolean') {
          errors.push(`capture.${option} must be a boolean`);
        }
      }
    }

    // Validate lazy loading
    if (configToValidate.lazyLoading) {
      if (typeof configToValidate.lazyLoading.waitForLazyImages !== 'boolean') {
        errors.push('lazyLoading.waitForLazyImages must be a boolean');
      }
      if (typeof configToValidate.lazyLoading.scrollToTrigger !== 'boolean') {
        errors.push('lazyLoading.scrollToTrigger must be a boolean');
      }
      if (typeof configToValidate.lazyLoading.waitTime !== 'number' || 
          configToValidate.lazyLoading.waitTime < 1 || 
          configToValidate.lazyLoading.waitTime > 30) {
        errors.push('lazyLoading.waitTime must be a number between 1 and 30');
      }
    }

    // Validate advanced options
    if (configToValidate.advanced) {
      const advancedOptions = ['includeCDN', 'includeExternal', 'downloadDuplicates'];
      for (const option of advancedOptions) {
        if (typeof configToValidate.advanced[option] !== 'boolean') {
          errors.push(`advanced.${option} must be a boolean`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
let instance = null;

export function getCaptureConfig(storageKey = 'captureSettings') {
  if (!instance) {
    instance = new CaptureConfig(storageKey);
  }
  return instance;
}

export default CaptureConfig;

