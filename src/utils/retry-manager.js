/**
 * Retry Manager
 * Handles retry logic with exponential backoff for failed downloads
 */

class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelay = options.initialDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.retryableErrors = options.retryableErrors || [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'timeout',
      'network',
      'fetch failed'
    ];
  }

  /**
   * Check if error is retryable
   * @param {Error|string} error - Error to check
   * @returns {boolean} True if error is retryable
   */
  isRetryable(error) {
    const errorMessage = error?.message || error?.toString() || String(error);
    const errorCode = error?.code || '';
    
    return this.retryableErrors.some(retryableError => 
      errorMessage.toLowerCase().includes(retryableError.toLowerCase()) ||
      errorCode.toLowerCase().includes(retryableError.toLowerCase())
    );
  }

  /**
   * Calculate delay for retry attempt
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt) {
    const delay = this.initialDelay * Math.pow(this.backoffMultiplier, attempt);
    return Math.min(delay, this.maxDelay);
  }

  /**
   * Retry an async function with exponential backoff
   * @param {Function} fn - Async function to retry
   * @param {Object} options - Retry options
   * @returns {Promise} Result of the function
   */
  async retry(fn, options = {}) {
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const onRetry = options.onRetry || (() => {});
    const shouldRetry = options.shouldRetry || this.isRetryable.bind(this);
    
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry if it's the last attempt or error is not retryable
        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }
        
        // Calculate delay and wait
        const delay = this.calculateDelay(attempt);
        onRetry(attempt + 1, maxRetries, delay, error);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry a download operation
   * @param {Function} downloadFn - Download function
   * @param {string} url - URL being downloaded
   * @param {Object} options - Retry options
   * @returns {Promise} Download result
   */
  async retryDownload(downloadFn, url, options = {}) {
    const onRetry = (attempt, maxRetries, delay, error) => {
      if (options.onRetry) {
        options.onRetry(attempt, maxRetries, delay, error, url);
      } else {
        console.log(`Retrying download (${attempt}/${maxRetries}) for ${url} after ${delay}ms...`);
      }
    };
    
    return this.retry(downloadFn, {
      ...options,
      onRetry
    });
  }
}

// Export singleton instance
let instance = null;

export function getRetryManager(options) {
  if (!instance) {
    instance = new RetryManager(options);
  }
  return instance;
}

export default RetryManager;

