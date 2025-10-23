/**
 * Enhanced logging utility with colors and formatting
 * Browser-compatible version without external dependencies
 */
class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  /**
   * Apply color styling to console output
   * @param {string} message - Message to style
   * @param {string} color - Color name
   * @returns {string} Styled message
   */
  applyColor(message, color) {
    const colors = {
      blue: '\x1b[34m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    };
    
    const colorCode = colors[color] || '';
    const resetCode = colors.reset;
    
    return `${colorCode}${message}${resetCode}`;
  }

  /**
   * Log info message
   * @param {string} message - Message to log
   */
  info(message) {
    const styledMessage = this.applyColor(`[INFO] ${this.prefix}${message}`, 'blue');
    console.log(styledMessage);
  }

  /**
   * Log success message
   * @param {string} message - Message to log
   */
  success(message) {
    const styledMessage = this.applyColor(`[SUCCESS] ${this.prefix}${message}`, 'green');
    console.log(styledMessage);
  }

  /**
   * Log warning message
   * @param {string} message - Message to log
   */
  warn(message) {
    const styledMessage = this.applyColor(`[WARN] ${this.prefix}${message}`, 'yellow');
    console.log(styledMessage);
  }

  /**
   * Log error message
   * @param {string} message - Message to log
   */
  error(message) {
    const styledMessage = this.applyColor(`[ERROR] ${this.prefix}${message}`, 'red');
    console.log(styledMessage);
  }

  /**
   * Log debug message
   * @param {string} message - Message to log
   */
  debug(message) {
    if (process.env.NODE_ENV === 'development') {
      const styledMessage = this.applyColor(`[DEBUG] ${this.prefix}${message}`, 'gray');
      console.log(styledMessage);
    }
  }
}

export default Logger;
