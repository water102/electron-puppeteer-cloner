import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import fs from 'fs-extra';
import staticServer from '../utils/static-server.js';
import Logger from '../utils/logger.js';
import config from '../utils/config.js';
import StaticAnalyzer from '../utils/static-analyzer.js';
import databaseUtils from '../utils/database.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = new Logger('[Main]');
let mainWindow;

/**
 * Create the main application window
 */
function createWindow() {
  logger.info('Creating main window...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Web Cloner', // Set window title
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../renderer/preload.js'),
      webviewTag: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableRemoteModule: false,
      webSecurity: true
    },
    icon: path.join(__dirname, '../assets/icon.png'), // Add icon if available
    titleBarStyle: 'default',
    show: false // Don't show until ready
  });
  
  mainWindow.loadFile(path.join(__dirname, '../assets/index.html'));
  
  // Note: Database will be initialized in renderer process
  logger.info('Database will be initialized in renderer process');
  
  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Auto-maximize the window
    mainWindow.maximize();
    logger.success('Main window ready and maximized');
  });
  
  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize app when ready
app.whenReady().then(() => {
  createWindow();
  
  // Auto-start functionality
  if (process.argv.includes('--auto-start')) {
    logger.info('Auto-start mode enabled');
    // You can add auto-start logic here if needed
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Handle folder selection dialog
 */
ipcMain.handle('show-open-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, { 
      properties: ['openDirectory'],
      title: 'Select Output Directory'
    });
    
    if (result.canceled) return null;
    return result.filePaths[0];
  } catch (error) {
    logger.error('Error in folder selection: ' + error.message);
    return null;
  }
});

/**
 * Get cookies for a specific URL from the default session
 */
ipcMain.handle('get-cookies', async (_event, url) => {
  try {
    logger.debug(`Getting cookies for: ${url}`);
    const cookies = await session.defaultSession.cookies.get({ url });
    logger.info(`Retrieved ${cookies.length} cookies`);
    return cookies;
  } catch (error) {
    logger.error('Error getting cookies: ' + error.message);
    return [];
  }
});

let serverHandle = null;

/**
 * Toggle static server on/off
 */
ipcMain.handle('toggle-server', async (_event, { dir, port }) => {
  try {
    if (serverHandle) {
      logger.info('Stopping static server...');
      serverHandle.stop();
      serverHandle = null;
      return { running: false };
    } else {
      const finalPort = port || config.server.defaultPort;
      logger.info(`Starting static server on port ${finalPort}...`);
      
      // Point to assets folder inside the output directory
      const assetsDir = path.join(dir, 'assets');
      logger.info(`assetsDir: ${assetsDir}`);
      
      // Ensure assets directory exists
      if (!fs.existsSync(assetsDir)) {
        await fs.ensureDir(assetsDir);
        logger.info(`Created assets directory: ${assetsDir}`);
      }
      
      serverHandle = await staticServer.start(assetsDir, finalPort);
      return { 
        running: true, 
        url: serverHandle.url,
        port: serverHandle.port,
        originalPort: finalPort
      };
    }
  } catch (error) {
    logger.error('Error toggling server: ' + error.message);
    return { running: false, error: error.message };
  }
});

/**
 * Analyze static files from HTML content
 */
ipcMain.handle('analyze-static-files', async (_event, { html, baseUrl, hostname }) => {
  try {
    logger.info(`Analyzing static files from: ${baseUrl}`);
    const analyzer = new StaticAnalyzer();
    const result = analyzer.analyzeHtml(html, baseUrl);
    
    logger.info(`Found ${result.staticFiles.length} static files, skipped ${result.skippedFiles.length} files`);
    return result;
  } catch (error) {
    logger.error('Error analyzing static files: ' + error.message);
    return { staticFiles: [], skippedFiles: [] };
  }
});

/**
 * Start the Puppeteer clone worker
 */
ipcMain.handle('start-clone', async (_event, options) => {
  return new Promise((resolve, reject) => {
    logger.info('Starting clone worker...');
    
    const worker = fork(path.join(__dirname, '../workers/clone-worker.js'), [], {
      stdio: 'pipe'
    });
    
    worker.send(options);
    
    worker.on('message', (message) => {
      if (message.type === 'progress') {
        mainWindow.webContents.send('clone-progress', message.payload);
      } else if (message.type === 'done') {
        logger.success('Clone operation completed');
        resolve(message.payload);
        worker.kill();
      } else if (message.type === 'error') {
        logger.error('Clone operation failed: ' + message.payload);
        reject(message.payload);
        worker.kill();
      }
    });
    
    worker.on('error', (error) => {
      logger.error('Worker error: ' + error.message);
      reject(String(error));
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        logger.warn(`Worker exited with code ${code}`);
      }
    });
  });
});

/**
 * Clear output folder
 */
ipcMain.handle('clear-output-folder', async (_event, folderPath) => {
  try {
    logger.info(`Clearing output folder: ${folderPath}`);
    
    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      throw new Error('Output folder does not exist');
    }
    
    // Remove all files and directories in the folder
    const items = fs.readdirSync(folderPath);
    for (const item of items) {
      const itemPath = path.join(folderPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        fs.removeSync(itemPath);
        logger.debug(`Removed directory: ${item}`);
      } else {
        fs.unlinkSync(itemPath);
        logger.debug(`Removed file: ${item}`);
      }
    }
    
    logger.success(`Output folder cleared: ${folderPath}`);
    return { success: true, message: 'Output folder cleared successfully' };
    
  } catch (error) {
    logger.error('Clear output folder error: ' + error.message);
    throw error;
  }
});

/**
 * Clear specific file types from output folder
 */
ipcMain.handle('clear-specific-files', async (_event, folderPath, fileExtensions) => {
  try {
    logger.info(`Clearing specific file types from: ${folderPath}`);
    logger.info(`File extensions to clear: ${fileExtensions.join(', ')}`);
    
    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      throw new Error('Output folder does not exist');
    }
    
    let deletedCount = 0;
    
    // Recursive function to find and delete files with specific extensions
    function deleteFilesByExtension(dirPath) {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          // Recursively check subdirectories
          deleteFilesByExtension(itemPath);
          
          // Remove empty directories after deleting files
          try {
            const remainingItems = fs.readdirSync(itemPath);
            if (remainingItems.length === 0) {
              fs.rmdirSync(itemPath);
              logger.debug(`Removed empty directory: ${item}`);
            }
          } catch (error) {
            // Directory might not be empty or might have been removed already
          }
        } else {
          // Check if file has one of the target extensions
          const fileExt = path.extname(item).toLowerCase();
          if (fileExtensions.includes(fileExt)) {
            fs.unlinkSync(itemPath);
            deletedCount++;
            logger.debug(`Removed file: ${item}`);
          }
        }
      }
    }
    
    deleteFilesByExtension(folderPath);
    
    logger.success(`Cleared ${deletedCount} files with specified extensions from: ${folderPath}`);
    return { 
      success: true, 
      message: `Cleared ${deletedCount} files successfully`,
      deletedCount 
    };
    
  } catch (error) {
    logger.error('Clear specific files error: ' + error.message);
    throw error;
  }
});

/**
 * Get log data for current hostname
 */
ipcMain.handle('get-log-data', async (_event, hostname) => {
  try {
    const stats = await databaseUtils.getCurrentPageStats(hostname);
    return stats;
  } catch (error) {
    logger.error('Error getting log data: ' + error.message);
    return {
      hostname: hostname,
      websiteCount: 0,
      requestCount: 0,
      fileCount: 0,
      totalCount: 0,
      websites: [],
      requests: [],
      files: []
    };
  }
});

/**
 * Get all websites with their data
 */
ipcMain.handle('get-all-websites', async () => {
  try {
    const websites = await databaseUtils.getAllWebsitesWithData();
    return websites;
  } catch (error) {
    logger.error('Error getting all websites: ' + error.message);
    return [];
  }
});

/**
 * Export log data
 */
ipcMain.handle('export-log-data', async (_event, hostname) => {
  try {
    const data = await databaseUtils.exportData(hostname);
    return data;
  } catch (error) {
    logger.error('Error exporting log data: ' + error.message);
    return null;
  }
});

/**
 * Clear all log data
 */
ipcMain.handle('clear-log-data', async () => {
  try {
    await databaseUtils.clearAllData();
    logger.success('All log data cleared');
    return { success: true };
  } catch (error) {
    logger.error('Error clearing log data: ' + error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Open output folder in file explorer
 */
ipcMain.handle('open-output-folder', async (_event, folderPath) => {
  try {
    logger.info(`Attempting to open folder: ${folderPath}`);
    
    if (!folderPath) {
      throw new Error('No folder path provided');
    }
    
    // Check if path exists
    if (!fs.existsSync(folderPath)) {
      logger.error(`Folder does not exist: ${folderPath}`);
      throw new Error(`Folder does not exist: ${folderPath}`);
    }
    
    // Check if it's a directory
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      logger.error(`Path is not a directory: ${folderPath}`);
      throw new Error(`Path is not a directory: ${folderPath}`);
    }
    
    logger.info(`Opening folder with shell.openPath: ${folderPath}`);
    await shell.openPath(folderPath);
    logger.success(`Successfully opened output folder: ${folderPath}`);
    return { success: true };
  } catch (error) {
    logger.error('Error opening output folder: ' + error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Save request to database
 */
ipcMain.handle('save-request-to-database', async (_event, requestData) => {
  try {
    await databaseUtils.saveRequest(requestData, requestData.hostname);
    logger.success(`Saved request: ${requestData.method} ${requestData.url}`);
    return { success: true };
  } catch (error) {
    logger.error('Error saving request to database: ' + error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Save file to database
 */
ipcMain.handle('save-file-to-database', async (_event, fileData) => {
  try {
    await databaseUtils.saveFile(fileData, fileData.hostname);
    logger.success(`Saved file: ${fileData.url}`);
    return { success: true };
  } catch (error) {
    logger.error('Error saving file to database: ' + error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Check database status
 */
ipcMain.handle('check-database-status', async () => {
  try {
    const stats = await databaseUtils.getCurrentPageStats('test');
    return { 
      success: true, 
      status: 'connected',
      message: 'Database is working properly'
    };
  } catch (error) {
    logger.error('Database status check failed: ' + error.message);
    return { 
      success: false, 
      status: 'error',
      error: error.message 
    };
  }
});

// Handle app lifecycle
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  logger.info('Application shutting down...');
  if (serverHandle) {
    serverHandle.stop();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception: ' + error.message);
  console.error(error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at: ' + promise + ', reason: ' + reason);
});