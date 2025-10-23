# Electron + Puppeteer Web Cloner

A modern, refactored desktop application for cloning dynamic websites with advanced features:

- **Cookie Sharing**: Seamlessly shares cookies from Electron WebView to Puppeteer for authenticated content
- **Asset Capture**: Intelligently captures and saves static files (HTML/CSS/JS/images/fonts) with proper path structure
- **API Logging**: Comprehensive logging of XHR/Fetch requests and WebSocket frames with full request/response data
- **CSS Optimization**: Advanced CSS `url()` rewriting using PostCSS for local asset references
- **Modern UI**: Clean, responsive 3-panel interface with draggable dividers and real-time progress
- **Static Server**: Built-in static server for instant preview of cloned content
- **Performance Optimized**: Refactored codebase with better error handling, logging, and maintainability
- **Watch Mode**: Auto-clone functionality that monitors URL changes and automatically clones new pages
- **Smart File Management**: Advanced file organization with selective clearing and duplicate detection
- **Network Capture**: Enhanced network request monitoring and resource analysis

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd electron-puppeteer-cloner

# Install dependencies
pnpm install
# or npm install
```

### Development
```bash
pnpm dev
# or npm run dev
```

### Production Build
```bash
pnpm build
# or npm run build
```

### Run Production
```bash
pnpm start
# or npm start
```

---

## Interface Layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│   Source (left)                    │       Cloned (right)                     │
│   [ Address bar ]                  │       [ Filename bar ]                   │
│   [ WebView: live site ]           │       [ WebView: file:// or http:// ]    │
├───────────────────────────────────────────────────────────────────────────────┤
│ Controls: Output folder · Choose · Port · Start/Stop Server · Clone           │
│ Logs: streaming progress (saved resources, API captured, WS frames, etc.)     │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Left panel**: Enter URL, browse/login in a WebView
- **Right panel**: Enter filename and preview the cloned HTML
- **Bottom panel**: Choose output directory, toggle static server, run Clone, view logs

---

## Core Features

### 🔐 Cookie Sharing
- Pulls cookies from the Electron default session for the current URL
- Injects cookies into Puppeteer via `page.setCookie(...)` before navigation
- Supports authenticated content cloning

### 📁 Asset Capture
- Saves responses of type `stylesheet`, `script`, `image`, `font`, `document`, etc.
- Mirrors URL paths in `assets/` directory
- Handles both static and dynamic content

### 📊 API & WebSocket Logging
- **API requests**: Saves per-request JSON with method, URL, headers, postData, status, and responseText
- **WebSocket frames**: Captures via Chrome DevTools Protocol `Network.webSocketFrame*` events
- Combined logs saved to `logs/api_logs.json` and `logs/ws_logs.json`

### 🎨 CSS Optimization
- Advanced CSS `url()` rewriting using PostCSS
- Maps absolute asset URLs to relative local paths
- Handles complex CSS structures

### 👁️ Watch Mode
- Auto-clone functionality that monitors URL changes
- Automatically clones new pages when navigating
- Smart domain detection and tracking

### 🗂️ Smart File Management
- Selective file clearing (JS, CSS, HTML, Images)
- Duplicate file detection
- Advanced output folder organization

> ⚠️ Note: Dynamic content loaded after the initial render, CSP, inline JS, and complex bundlers may require additional handling.

---

## Project Structure

```
.
├─ package.json
├─ electron-builder.json
├─ electron.config.js
├─ README.md
├─ suggest-features.md
└─ src/
   ├─ main/
   │  └─ main.js              # Electron main process with enhanced error handling
   ├─ renderer/
   │  ├─ preload.js           # Secure IPC bridge
   │  └─ renderer.js          # Modern UI logic with improved UX
   ├─ workers/
   │  └─ clone-worker.js      # Optimized Puppeteer worker with better performance
   ├─ utils/
   │  ├─ static-server.js     # Enhanced static server
   │  ├─ logger.js            # Colored logging utility
   │  ├─ config.js            # Application configuration
   │  ├─ file-utils.js        # File handling utilities
   │  ├─ static-analyzer.js   # Static file analysis
   │  └─ dev-server.js         # Development server
   └─ assets/
      ├─ index.html           # Modern HTML structure
      ├─ styles.css           # Enhanced CSS with responsive design
      └─ split.min.js         # Split.js library for resizable panels
```

**Output Directory Structure**
```
/output
├─ assets/               # mirrored static assets (css/js/img/font/...)
├─ logs/
│  ├─ api_logs.json      # combined API logs
│  ├─ ws_logs.json       # combined WebSocket logs
│  └─ <encoded-url>.json # per-request API JSON files
└─ index.html            # cloned HTML (or <filename>.html)
```

---

## Usage Guide

### 1) Basic Cloning
1. In the **left panel**, enter the URL and click **Go**
2. Perform login if needed (cookies will be automatically shared)
3. Click **Choose** to select the **Output folder**
4. (Optional) Set **Port** and click **Start Server** to serve the output directory
5. Click **Clone** to start the cloning process

### 2) Watch Mode
1. Click **👁️ Watch & Clone** to enable auto-cloning
2. Navigate through the website - each page change will be automatically cloned
3. Click **Stop Watching** to disable auto-cloning

### 3) File Management
- **Clear All**: Remove all files from output folder
- **Clear Specific**: Remove only certain file types (JS, CSS, HTML, Images)
- **Clear Settings**: Reset saved preferences

---

## Key Implementation Details

### Cookie Sharing
- Renderer requests cookies from `session.defaultSession.cookies.get({ url })`
- Main process returns cookie list; renderer passes them to the Puppeteer worker
- Worker maps Electron cookie fields to Puppeteer's format and calls `page.setCookie(...)` before `page.goto()`

### API & WebSocket Capture
- **API** (`xhr`/`fetch`) captured in `page.on('response')`; stores request method/headers/postData and response text
- **WebSocket** via CDP: `Network.enable` + `Network.webSocketFrameSent/Received`

### Asset Saving & Rewrites
- Static resources saved to `assets/<pathname>` (ensuring filename for trailing slash paths)
- HTML rewrite replaces absolute URLs with relative paths
- CSS processed with `postcss-url` for absolute URL mapping to relative paths

---

## Limitations & Tips

- **Dynamic/lazy content**: Increase `waitForTimeout` or add custom automation to trigger loading
- **CSS `url()`**: Current rewrite focuses on absolute URLs; additional mapping logic needed for `srcset`, inline styles, and complex build pipelines
- **CSP / inline script restrictions**: Preview via static server instead of `file://` if you hit CSP issues
- **Login state**: Cookie sharing uses default session; adjust session source for custom partitions or multiple profiles

---

## Legal / Ethical Notice

Use this tool only on websites you own or are authorized to analyze/clone. Respect terms of service, robots.txt, and data privacy laws.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## License

MIT License - see LICENSE file for details

---

## Future Enhancements

See [suggest-features.md](suggest-features.md) for a comprehensive list of potential features and improvements.

