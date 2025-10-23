import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { createServer } from 'http';

let server = null;

/**
 * Find an available port starting from the given port
 * @param {number} startPort - Port to start checking from
 * @returns {Promise<number>} Available port number
 */
async function findAvailablePort(startPort = 8080) {
  return new Promise((resolve, reject) => {
    const testServer = createServer();
    
    testServer.listen(startPort, '0.0.0.0', () => {
      const port = testServer.address().port;
      testServer.close(() => {
        resolve(port);
      });
    });
    
    testServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        // Try next port
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Static server utility for serving cloned content
 */
export default {
  /**
   * Start a static server for the given directory
   * @param {string} dir - Directory to serve
   * @param {number} port - Port to listen on
   * @returns {Object} Server handle with stop method
   */
  start: async (dir, port = 8080) => {
    if (server) {
      return { stop: () => {} };
    }
    
    // Find available port
    const actualPort = await findAvailablePort(port);
    if (actualPort !== port) {
      console.log(`⚠️ Port ${port} is in use, automatically using port ${actualPort} instead`);
    }
    
    const app = express();
    const serveDir = path.resolve(dir || process.cwd());
    
    // Enable CORS for all requests
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Add a test endpoint
    app.get('/test', (req, res) => {
      res.json({ 
        status: 'ok', 
        message: 'Static server is running',
        directory: serveDir,
        timestamp: new Date().toISOString()
      });
    });
    
    // Serve static files
    app.use(express.static(serveDir, {
      index: ['index.html', 'index.htm'],
      extensions: ['html', 'htm'],
      setHeaders: (res, filePath) => {
        // Set proper MIME type for HTML files
        if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
      }
    }));
    
    // Handle 404 - serve index.html if available
    app.use(async (req, res, next) => {
      const requestedPath = path.join(serveDir, req.path);
      
      try {
        const stats = await fs.stat(requestedPath);
        
        if (stats.isDirectory()) {
          // Try to serve index.html from directory
          const indexPath = path.join(requestedPath, 'index.html');
          if (await fs.pathExists(indexPath)) {
            return res.sendFile(indexPath);
          }
        } else if (stats.isFile()) {
          return res.sendFile(requestedPath);
        }
      } catch (error) {
        // File not found, continue to next middleware
      }
      
      next();
    });
    
    // Final 404 handler
    app.use((req, res) => {
      res.status(404).send('File not found');
    });
    
    const serverInstance = app.listen(actualPort, '0.0.0.0', () => {
      console.log(`Static server running on port ${actualPort}`);
      console.log(`Serving directory: ${serveDir}`);
      console.log(`Access at: http://localhost:${actualPort}`);
    });
    
    // Add error handling for the server
    serverInstance.on('error', (error) => {
      console.error('Static server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please try a different port.`);
      }
    });
    
    server = serverInstance;
    
    return {
      stop: () => { 
        serverInstance.close(); 
        server = null; 
      },
      port: actualPort,
      url: `http://localhost:${actualPort}`
    };
  }
};
