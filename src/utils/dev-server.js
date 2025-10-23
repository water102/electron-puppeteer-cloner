import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from './logger.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = new Logger('[Dev Server]');

/**
 * Development server for hot reloading
 */
class DevServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
  }

  setupMiddleware() {
    // Serve static files from src/assets
    this.app.use('/assets', express.static(path.join(__dirname, '../assets')));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      logger.success(`Development server running on http://localhost:${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('Development server stopped');
    }
  }
}

export default DevServer;
