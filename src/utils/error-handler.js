/**
 * Error Handler System
 * Centralized error handling and reporting
 */

import { getEventEmitter } from './event-emitter.js';

class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxErrorLogSize = 100;
    this.eventEmitter = getEventEmitter();
  }

  /**
   * Handle an error with context
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context information
   * @param {string} severity - Error severity: 'error', 'warning', 'info'
   */
  handle(error, context = {}, severity = 'error') {
    const errorInfo = this.normalizeError(error, context, severity);
    
    // Add to error log
    this.addToLog(errorInfo);
    
    // Emit error event
    this.eventEmitter.emit('error', errorInfo);
    
    // Log to console
    this.logToConsole(errorInfo);
    
    return errorInfo;
  }

  /**
   * Normalize error to consistent format
   */
  normalizeError(error, context, severity) {
    const errorInfo = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      severity,
      message: '',
      stack: null,
      context: { ...context }
    };

    if (error instanceof Error) {
      errorInfo.message = error.message;
      errorInfo.stack = error.stack;
      errorInfo.name = error.name;
    } else if (typeof error === 'string') {
      errorInfo.message = error;
    } else {
      errorInfo.message = JSON.stringify(error);
    }

    return errorInfo;
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add error to log
   */
  addToLog(errorInfo) {
    this.errorLog.unshift(errorInfo);
    
    // Keep log size manageable
    if (this.errorLog.length > this.maxErrorLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxErrorLogSize);
    }
  }

  /**
   * Log to console with appropriate level
   */
  logToConsole(errorInfo) {
    const prefix = `[${errorInfo.severity.toUpperCase()}]`;
    const message = `${prefix} ${errorInfo.message}`;
    
    switch (errorInfo.severity) {
      case 'error':
        console.error(message, errorInfo.context);
        if (errorInfo.stack) {
          console.error(errorInfo.stack);
        }
        break;
      case 'warning':
        console.warn(message, errorInfo.context);
        break;
      case 'info':
        console.info(message, errorInfo.context);
        break;
      default:
        console.log(message, errorInfo.context);
    }
  }

  /**
   * Wrap async function with error handling
   * @param {Function} fn - Async function to wrap
   * @param {Object} context - Context information
   * @returns {Function} Wrapped function
   */
  wrapAsync(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handle(error, { ...context, args }, 'error');
        throw error; // Re-throw to allow caller to handle
      }
    };
  }

  /**
   * Wrap sync function with error handling
   * @param {Function} fn - Function to wrap
   * @param {Object} context - Context information
   * @returns {Function} Wrapped function
   */
  wrapSync(fn, context = {}) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        this.handle(error, { ...context, args }, 'error');
        throw error; // Re-throw to allow caller to handle
      }
    };
  }

  /**
   * Get error log
   * @param {number} limit - Maximum number of errors to return
   * @returns {Array} Array of error info objects
   */
  getErrorLog(limit = null) {
    if (limit) {
      return this.errorLog.slice(0, limit);
    }
    return [...this.errorLog];
  }

  /**
   * Get errors by severity
   * @param {string} severity - Severity level to filter
   * @returns {Array} Array of error info objects
   */
  getErrorsBySeverity(severity) {
    return this.errorLog.filter(error => error.severity === severity);
  }

  /**
   * Clear error log
   */
  clearLog() {
    this.errorLog = [];
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getStatistics() {
    const stats = {
      total: this.errorLog.length,
      errors: 0,
      warnings: 0,
      info: 0
    };

    for (const error of this.errorLog) {
      stats[error.severity + 's'] = (stats[error.severity + 's'] || 0) + 1;
    }

    return stats;
  }

  /**
   * Export error log to JSON
   * @returns {string} JSON string
   */
  exportToJSON() {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      statistics: this.getStatistics(),
      errors: this.errorLog
    }, null, 2);
  }
}

// Export singleton instance
let instance = null;

export function getErrorHandler() {
  if (!instance) {
    instance = new ErrorHandler();
  }
  return instance;
}

export default ErrorHandler;

