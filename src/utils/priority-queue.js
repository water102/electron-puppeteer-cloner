/**
 * Priority Queue for Asset Downloads
 * Manages download queue with priority levels
 */

class PriorityQueue {
  constructor() {
    this.queue = [];
    this.priorityLevels = {
      critical: 0,    // HTML, main CSS, main JS
      high: 1,        // CSS, JS, fonts
      medium: 2,      // Images, fonts
      low: 3          // Other assets
    };
  }

  /**
   * Get priority for an asset
   * @param {Object} asset - Asset object
   * @returns {number} Priority level (lower = higher priority)
   */
  getPriority(asset) {
    const url = asset.url || '';
    const type = asset.type || '';
    
    // Critical: Main HTML, critical CSS/JS
    if (type === 'document' || type === 'html') {
      return this.priorityLevels.critical;
    }
    
    // High: CSS, JS, fonts
    if (type === 'stylesheet' || type === 'css') {
      return this.priorityLevels.high;
    }
    if (type === 'script' || type === 'js') {
      // Check if it's a main script or module
      if (url.includes('main') || url.includes('app') || url.includes('index')) {
        return this.priorityLevels.critical;
      }
      return this.priorityLevels.high;
    }
    if (type === 'font') {
      return this.priorityLevels.high;
    }
    
    // Medium: Images, media
    if (type === 'image') {
      // Critical images (above the fold, logos)
      if (url.includes('logo') || url.includes('hero') || url.includes('banner')) {
        return this.priorityLevels.high;
      }
      return this.priorityLevels.medium;
    }
    if (type === 'media') {
      return this.priorityLevels.medium;
    }
    
    // Low: Everything else
    return this.priorityLevels.low;
  }

  /**
   * Add asset to queue
   * @param {Object} asset - Asset to add
   */
  enqueue(asset) {
    const priority = this.getPriority(asset);
    const item = {
      ...asset,
      priority,
      addedAt: Date.now()
    };
    
    // Insert in priority order
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority > priority) {
        this.queue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      this.queue.push(item);
    }
  }

  /**
   * Remove and return highest priority item
   * @returns {Object|null} Highest priority asset
   */
  dequeue() {
    return this.queue.shift() || null;
  }

  /**
   * Peek at highest priority item without removing
   * @returns {Object|null} Highest priority asset
   */
  peek() {
    return this.queue[0] || null;
  }

  /**
   * Check if queue is empty
   * @returns {boolean} True if empty
   */
  isEmpty() {
    return this.queue.length === 0;
  }

  /**
   * Get queue size
   * @returns {number} Queue size
   */
  size() {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  clear() {
    this.queue = [];
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStatistics() {
    const stats = {
      total: this.queue.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };
    
    for (const item of this.queue) {
      if (item.priority === this.priorityLevels.critical) stats.critical++;
      else if (item.priority === this.priorityLevels.high) stats.high++;
      else if (item.priority === this.priorityLevels.medium) stats.medium++;
      else stats.low++;
    }
    
    return stats;
  }

  /**
   * Get items by priority level
   * @param {string} level - Priority level name
   * @returns {Array} Array of assets
   */
  getByPriority(level) {
    const priority = this.priorityLevels[level];
    if (priority === undefined) return [];
    
    return this.queue.filter(item => item.priority === priority);
  }

  /**
   * Remove item from queue
   * @param {string} url - Asset URL to remove
   * @returns {boolean} True if removed
   */
  remove(url) {
    const index = this.queue.findIndex(item => item.url === url);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Update priority of an item
   * @param {string} url - Asset URL
   * @param {number} newPriority - New priority level
   */
  updatePriority(url, newPriority) {
    const index = this.queue.findIndex(item => item.url === url);
    if (index !== -1) {
      const item = this.queue.splice(index, 1)[0];
      item.priority = newPriority;
      this.enqueue(item);
    }
  }
}

// Export singleton instance
let instance = null;

export function getPriorityQueue() {
  if (!instance) {
    instance = new PriorityQueue();
  }
  return instance;
}

export default PriorityQueue;

