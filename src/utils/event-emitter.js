/**
 * Event Emitter System
 * Provides event-driven communication between modules
 */

class EventEmitter {
  constructor() {
    this.events = new Map();
    this.maxListeners = 100;
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const listeners = this.events.get(event);
    
    // Check max listeners
    if (listeners.length >= this.maxListeners) {
      console.warn(`Max listeners (${this.maxListeners}) reached for event "${event}"`);
    }

    listeners.push(listener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  /**
   * Register a one-time event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event handler function
   */
  once(event, listener) {
    const onceWrapper = (...args) => {
      listener(...args);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event handler function
   */
  off(event, listener) {
    if (!this.events.has(event)) {
      return;
    }

    const listeners = this.events.get(event);
    const index = listeners.indexOf(listener);
    
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    // Clean up empty event arrays
    if (listeners.length === 0) {
      this.events.delete(event);
    }
  }

  /**
   * Remove all listeners for an event, or all events
   * @param {string} event - Event name (optional)
   */
  removeAllListeners(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...*} args - Arguments to pass to listeners
   * @returns {boolean} True if event had listeners
   */
  emit(event, ...args) {
    if (!this.events.has(event)) {
      return false;
    }

    const listeners = this.events.get(event);
    
    // Create a copy to avoid issues if listeners are modified during iteration
    const listenersCopy = [...listeners];
    
    for (const listener of listenersCopy) {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for "${event}":`, error);
      }
    }

    return true;
  }

  /**
   * Get all listeners for an event
   * @param {string} event - Event name
   * @returns {Array} Array of listeners
   */
  listeners(event) {
    return this.events.get(event) || [];
  }

  /**
   * Get count of listeners for an event
   * @param {string} event - Event name
   * @returns {number} Listener count
   */
  listenerCount(event) {
    return this.listeners(event).length;
  }

  /**
   * Get all event names
   * @returns {Array} Array of event names
   */
  eventNames() {
    return Array.from(this.events.keys());
  }

  /**
   * Set maximum number of listeners per event
   * @param {number} n - Maximum listeners
   */
  setMaxListeners(n) {
    this.maxListeners = n;
  }
}

// Export singleton instance
let instance = null;

export function getEventEmitter() {
  if (!instance) {
    instance = new EventEmitter();
  }
  return instance;
}

export default EventEmitter;

