/**
 * Capture modules index
 * Central export point for all capture modules
 */

export { default as MetaFilesCapture } from './meta-files-capture.js';
export { default as ServiceWorkerCapture } from './service-worker-capture.js';

// Note: Other capture modules (Worker, Blob, DataURL, SourceMap, DynamicImport)
// are implemented in preload.js or clone-worker.js for performance reasons

