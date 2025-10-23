import chalk from 'chalk';

/**
 * Enhanced logging utility with colors and formatting
 */
class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  /**
   * Log info message
   * @param {string} message - Message to log
   */
  info(message) {
    console.log(chalk.blue(`[INFO] ${this.prefix}${message}`));
  }

  /**
   * Log success message
   * @param {string} message - Message to log
   */
  success(message) {
    console.log(chalk.green(`[SUCCESS] ${this.prefix}${message}`));
  }

  /**
   * Log warning message
   * @param {string} message - Message to log
   */
  warn(message) {
    console.log(chalk.yellow(`[WARN] ${this.prefix}${message}`));
  }

  /**
   * Log error message
   * @param {string} message - Message to log
   */
  error(message) {
    console.log(chalk.red(`[ERROR] ${this.prefix}${message}`));
  }

  /**
   * Log debug message
   * @param {string} message - Message to log
   */
  debug(message) {
    if (process.env.NODE_ENV === 'development') {
      console.log(chalk.gray(`[DEBUG] ${this.prefix}${message}`));
    }
  }
}

export default Logger;
