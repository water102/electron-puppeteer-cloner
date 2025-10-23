# Electron + Puppeteer Web Cloner

A modern, refactored desktop application for cloning dynamic websites with advanced features:

- **Cookie Sharing**: Seamlessly shares cookies from Electron WebView to Puppeteer for authenticated content
- **Asset Capture**: Intelligently captures and saves static files (HTML/CSS/JS/images/fonts) with proper path structure
- **API Logging**: Comprehensive logging of XHR/Fetch requests and WebSocket frames with full request/response data
- **CSS Optimization**: Advanced CSS `url()` rewriting using PostCSS for local asset references
- **Modern UI**: Clean, responsive 3-panel interface with draggable dividers and real-time progress
- **Static Server**: Built-in static server for instant preview of cloned content
- **Performance Optimized**: Refactored codebase with better error handling, logging, and maintainability


## Quick Start
```bash
npm install
npm start
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

---

## Screens / Layout

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

- **Left panel**: enter URL, browse/login in a WebView.
- **Right panel**: enter filename (default from `location.pathname`) and preview the cloned HTML.
- **Bottom**: choose output directory, toggle static server, run **Clone**, view logs.

---

## Features

- **Cookie sharing**: pulls cookies from the Electron default session for the current URL and injects them into Puppeteer via `page.setCookie(...)` before navigation.
- **Static capture**: saves responses of type `stylesheet`, `script`, `image`, `font`, `document`, etc. into `assets/` mirroring URL paths.
- **API logging**: for `xhr`/`fetch` requests, saves per‑request JSON (with method, URL, headers, postData, status, and responseText) and a combined `logs/api_logs.json`.
- **WebSocket logging**: via Chrome DevTools Protocol `Network.webSocketFrame*` events → combined `logs/ws_logs.json`.
- **CSS `url()` rewriting**: runs PostCSS with `postcss-url` to map any absolute asset URL that was saved to a relative local path.
- **HTML rewriting (basic)**: replaces absolute remote URLs found in saved assets with relative paths in the main HTML.
- **Static server**: optional Express server serving the output directory for easier preview.

> ⚠️ Note: dynamic content loaded after the initial render, CSP, inline JS, and complex bundlers may require additional handling.

---

## Project Structure

```
.
├─ package.json
├─ .gitignore
├─ README.md
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
   │  └─ dev-server.js         # Development server
   └─ assets/
      ├─ index.html           # Modern HTML structure
      └─ styles.css           # Enhanced CSS with responsive design
```

**Output Directory (example)**
```
/output
├─ assets/               # mirrored static assets (css/js/img/font/...)
├─ logs/
│  ├─ api_logs.json      # combined API logs
│  ├─ ws_logs.json       # combined WebSocket logs
│  └─ <encoded-url>.json # per‑request API JSON files
└─ index.html            # cloned HTML (or <filename>.html)
```

---

## Quick Start

### 1) Install & Run
```bash
npm install
npm run start
```

Requirements: Node.js 18+, an environment where Puppeteer can download/run Chromium. If you use corporate proxies, set the proper env vars.

### 2) Steps
1. In the **left panel**, enter the URL and click **Go**. Perform login if needed.
2. Click **Choose** to select the **Output folder**.
3. (Optional) Set **Port** and click **Start Server** to serve the output directory.
4. Click **Clone**. The app will:
   - Pull cookies for the current URL from Electron → inject into Puppeteer.
   - Navigate and capture static resources, API responses, WebSocket frames.
   - Save HTML, rewrite links to local assets, run PostCSS `postcss-url` on CSS.
   - Update logs in the bottom panel.
5. The **right panel** will load the cloned page either via `file://` or via `http://localhost:<port>/` if the server is running.

---

## Key Implementation Notes

### Cookie Sharing
- Renderer requests cookies from `session.defaultSession.cookies.get({ url })`.
- Main process returns cookie list; renderer passes them to the Puppeteer worker.
- Worker maps Electron cookie fields to Puppeteer’s format (`name`, `value`, `domain`, `path`, `httpOnly`, `secure`, `sameSite`, `expires`) and calls `page.setCookie(...)` **before** `page.goto()`.

### API & WebSocket Capture
- **API** (`xhr`/`fetch`) captured in `page.on('response')`; we store request method/headers/postData and response text.
- **WebSocket** via CDP: `Network.enable` + `Network.webSocketFrameSent/Received`.

### Asset Saving & Rewrites
- Static resources are saved to `assets/<pathname>` (ensuring a filename for trailing slash paths).
- Basic HTML rewrite replaces absolute URLs (that were saved) with relative paths.
- CSS processed with `postcss-url`; for an absolute URL that matches a saved asset, we rewrite to a relative path from the CSS file’s directory.

---

## Limitations & Tips
- **Dynamic/lazy content**: increase `waitForTimeout` or add custom automation to trigger loading.
- **CSS `url()`**: current rewrite focuses on absolute URLs; add additional mapping logic for `srcset`, inline styles, and complex build pipelines if needed.
- **CSP / inline script restrictions**: preview via the static server instead of `file://` if you hit CSP issues.
- **Login state**: cookie sharing uses the default session; if you use custom partitions or multiple profiles, adjust the session source accordingly.

---

## Legal / Ethical Notice
Use this tool only on websites you own or are authorized to analyze/clone. Respect terms of service, robots.txt, and data privacy laws.

---

## Roadmap (optional)
- Export **HAR**.
- Rewrite **`srcset`**, inline style `url(...)`, and `@font-face` `src` maps.
- Session partition selection per‑tab.
- Incremental re‑crawl with diffing.

