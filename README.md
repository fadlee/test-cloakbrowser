# Google Search Scraper

A Node.js web app that scrapes Google Search results using [CloakBrowser](https://cloakbrowser.com) — a stealth Chromium wrapper built on Playwright. Includes a web UI for running searches and taking browser screenshots.

## Features

- Scrape Google organic results, featured snippets, People Also Ask, and related searches
- Paginate through up to 3 result pages per query
- CAPTCHA and block detection
- Browser screenshot via UI or API — with optional URL
- Simple web UI served at `http://localhost:3000`

## Requirements

- Node.js 18+
- npm

## Installation

```bash
npm install
```

## Usage

### Start the server

```bash
npm start
```

Server starts at `http://localhost:3000`.

### Run in headed mode (visible browser window)

```bash
npm run headed
```

## Web UI

Open `http://localhost:3000` in your browser.

- **Search form** — type a query, choose number of pages (1–3), click Search
- **Screenshot form** — optionally enter a URL, click Screenshot to capture and display the page

## API

### `GET /health`

Returns server status.

```
HTTP 200
{ "ok": true }
```

---

### `POST /search`

Run a Google search and return parsed results.

**Request:**
```json
{
  "query": "your search query",
  "pages": 1
}
```

- `query` (string, required) — search query
- `pages` (number, optional) — number of pages to fetch, 1–3, default 1

**Response:**
```json
{
  "query": "your search query",
  "pagesFetched": 1,
  "results": {
    "organic": [
      {
        "title": "Example Title",
        "url": "https://example.com",
        "displayedUrl": "example.com",
        "snippet": "A short description..."
      }
    ],
    "featuredSnippet": {
      "title": "...",
      "snippet": "...",
      "url": "https://example.com"
    },
    "peopleAlsoAsk": ["Question 1?", "Question 2?"],
    "relatedSearches": ["related query 1", "related query 2"]
  }
}
```

**Error responses:**

| Status | Code | Reason |
|--------|------|--------|
| `400` | `EMPTY_QUERY` | Query is empty or missing |
| `429` | `BLOCKED` / `CAPTCHA` | Google blocked the request |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

---

### `POST /screenshot`

Take a browser screenshot and return it as a PNG image.

**Request:**
```json
{
  "url": "https://example.com"
}
```

- `url` (string, optional) — URL to navigate to before taking the screenshot. If omitted, screenshots a blank page.

**Response (success):**
```
HTTP 200
Content-Type: image/png

<binary PNG data>
```

**Error responses:**

| Status | Code | Reason |
|--------|------|--------|
| `400` | — | `url` is not a string |
| `503` | `BROWSER_NOT_READY` | Browser is not running |
| `500` | `INTERNAL_ERROR` | Navigation failed or unexpected error |

**Example with curl:**
```bash
# Screenshot a URL
curl -X POST http://localhost:3000/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' \
  --output screenshot.png

# Screenshot blank page
curl -X POST http://localhost:3000/screenshot \
  -H "Content-Type: application/json" \
  -d '{}' \
  --output screenshot.png
```

## Project Structure

```
├── server.js                  # Express server, API endpoints
├── src/
│   ├── browser-manager.js     # CloakBrowser lifecycle, screenshot
│   ├── search-service.js      # Google search orchestration
│   ├── parser.js              # SERP HTML parser
│   └── queue.js               # Serial task queue
└── public/
    ├── index.html             # Web UI
    ├── app.js                 # Frontend logic
    └── styles.css             # Styles
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port to listen on |
| `HEADLESS` | `true` | Set to `false` to show browser window |

## Notes

- Only one search or screenshot runs at a time (serial queue) to avoid browser conflicts.
- Google's DOM structure changes occasionally — if organic results stop parsing, the selectors in `src/parser.js` may need updating.
- CloakBrowser uses stealth techniques to reduce detection, but repeated requests may still trigger CAPTCHAs.
