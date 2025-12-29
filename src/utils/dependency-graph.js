/**
 * Dependency Graph Builder
 * Tracks and visualizes asset dependencies
 */

class DependencyGraph {
  constructor() {
    this.nodes = new Map(); // url -> node
    this.edges = new Map(); // url -> Set of dependent URLs
    this.reverseEdges = new Map(); // url -> Set of URLs that depend on it
  }

  /**
   * Add a node (asset) to the graph
   * @param {string} url - Asset URL
   * @param {Object} metadata - Node metadata
   */
  addNode(url, metadata = {}) {
    if (!this.nodes.has(url)) {
      this.nodes.set(url, {
        url,
        type: metadata.type || 'unknown',
        size: metadata.size || 0,
        status: metadata.status || 'pending',
        ...metadata
      });
      this.edges.set(url, new Set());
      this.reverseEdges.set(url, new Set());
    } else {
      // Update existing node
      const node = this.nodes.get(url);
      Object.assign(node, metadata);
    }
  }

  /**
   * Add a dependency edge
   * @param {string} fromUrl - URL that depends on
   * @param {string} toUrl - URL that is depended upon
   */
  addEdge(fromUrl, toUrl) {
    if (fromUrl === toUrl) return; // Skip self-references
    
    // Ensure both nodes exist
    if (!this.nodes.has(fromUrl)) {
      this.addNode(fromUrl);
    }
    if (!this.nodes.has(toUrl)) {
      this.addNode(toUrl);
    }
    
    // Add edge
    this.edges.get(fromUrl).add(toUrl);
    this.reverseEdges.get(toUrl).add(fromUrl);
  }

  /**
   * Get dependencies of a URL
   * @param {string} url - Asset URL
   * @returns {Array} Array of dependent URLs
   */
  getDependencies(url) {
    return Array.from(this.edges.get(url) || []);
  }

  /**
   * Get dependents of a URL (what depends on this)
   * @param {string} url - Asset URL
   * @returns {Array} Array of URLs that depend on this
   */
  getDependents(url) {
    return Array.from(this.reverseEdges.get(url) || []);
  }

  /**
   * Detect circular dependencies
   * @returns {Array} Array of circular dependency chains
   */
  detectCircularDependencies() {
    const cycles = [];
    const visited = new Set();
    const recStack = new Set();
    
    const dfs = (url, path) => {
      visited.add(url);
      recStack.add(url);
      
      const dependencies = this.getDependencies(url);
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          dfs(dep, [...path, dep]);
        } else if (recStack.has(dep)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), dep, url]);
          }
        }
      }
      
      recStack.delete(url);
    };
    
    for (const url of this.nodes.keys()) {
      if (!visited.has(url)) {
        dfs(url, [url]);
      }
    }
    
    return cycles;
  }

  /**
   * Get topological sort order (optimal download order)
   * @returns {Array} Array of URLs in optimal download order
   */
  getTopologicalOrder() {
    const inDegree = new Map();
    const queue = [];
    const result = [];
    
    // Initialize in-degree
    for (const url of this.nodes.keys()) {
      inDegree.set(url, this.getDependents(url).length);
      if (inDegree.get(url) === 0) {
        queue.push(url);
      }
    }
    
    // Process nodes
    while (queue.length > 0) {
      const url = queue.shift();
      result.push(url);
      
      const dependencies = this.getDependencies(url);
      for (const dep of dependencies) {
        const currentInDegree = inDegree.get(dep) - 1;
        inDegree.set(dep, currentInDegree);
        if (currentInDegree === 0) {
          queue.push(dep);
        }
      }
    }
    
    // Add remaining nodes (if there are cycles)
    for (const url of this.nodes.keys()) {
      if (!result.includes(url)) {
        result.push(url);
      }
    }
    
    return result;
  }

  /**
   * Get critical path (longest dependency chain)
   * @returns {Array} Array of URLs in critical path
   */
  getCriticalPath() {
    const distances = new Map();
    const predecessors = new Map();
    
    // Initialize distances
    for (const url of this.nodes.keys()) {
      distances.set(url, 0);
      predecessors.set(url, null);
    }
    
    // Calculate longest paths
    const topoOrder = this.getTopologicalOrder();
    for (const url of topoOrder) {
      const dependencies = this.getDependencies(url);
      for (const dep of dependencies) {
        const node = this.nodes.get(dep);
        const newDistance = distances.get(url) + (node?.size || 1);
        
        if (newDistance > distances.get(dep)) {
          distances.set(dep, newDistance);
          predecessors.set(dep, url);
        }
      }
    }
    
    // Find the longest path
    let maxDistance = 0;
    let endNode = null;
    for (const [url, distance] of distances.entries()) {
      if (distance > maxDistance) {
        maxDistance = distance;
        endNode = url;
      }
    }
    
    // Reconstruct path
    const path = [];
    let current = endNode;
    while (current) {
      path.unshift(current);
      current = predecessors.get(current);
    }
    
    return path;
  }

  /**
   * Get graph statistics
   * @returns {Object} Graph statistics
   */
  getStatistics() {
    const stats = {
      totalNodes: this.nodes.size,
      totalEdges: 0,
      circularDependencies: 0,
      maxDepth: 0,
      criticalPathLength: 0
    };
    
    for (const edges of this.edges.values()) {
      stats.totalEdges += edges.size;
    }
    
    const cycles = this.detectCircularDependencies();
    stats.circularDependencies = cycles.length;
    
    const criticalPath = this.getCriticalPath();
    stats.criticalPathLength = criticalPath.length;
    
    return stats;
  }

  /**
   * Export graph to JSON
   * @returns {Object} Graph data
   */
  exportToJSON() {
    const nodes = Array.from(this.nodes.values());
    const edges = [];
    
    for (const [fromUrl, dependencies] of this.edges.entries()) {
      for (const toUrl of dependencies) {
        edges.push({ from: fromUrl, to: toUrl });
      }
    }
    
    return {
      nodes,
      edges,
      statistics: this.getStatistics(),
      circularDependencies: this.detectCircularDependencies(),
      topologicalOrder: this.getTopologicalOrder(),
      criticalPath: this.getCriticalPath()
    };
  }

  /**
   * Clear graph
   */
  clear() {
    this.nodes.clear();
    this.edges.clear();
    this.reverseEdges.clear();
  }
}

// Export singleton instance
let instance = null;

export function getDependencyGraph() {
  if (!instance) {
    instance = new DependencyGraph();
  }
  return instance;
}

export default DependencyGraph;

