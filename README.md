# Page Digest – AI Web Scraper & Summarizer

Paste a URL → the backend scrapes the page's main text → a free AI model (Groq, Llama 3.3 70B) returns a short summary → the UI displays it.

**Stack:** Node.js + Express (backend), Cheerio (scraping), Groq API (free tier), plain HTML/CSS/JS (frontend).
The Express server serves both the API and the frontend, so there is one process to run.

## Run locally

Requirements: Node.js 18 or newer.

1. **Get a free API key** at https://console.groq.com/keys (no credit card needed).
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Create the `.env` file in the project root** (same folder as `package.json` and `server.js`):
   ```bash
   cp .env.example .env
   ```
   Then open `.env` and set:
   ```
   GROQ_API_KEY=your_real_key_here
   ```
4. **Start the app** (backend + frontend)
   ```bash
   npm start
   ```
5. Open **http://localhost:3000**, paste a URL and click **Summarize**.

## API

`POST /api/summarize`
Body: `{ "url": "https://example.com/article" }`
Response: `{ "title": "...", "url": "...", "summary": "..." }` or `{ "error": "..." }`

## Project structure

```
server.js          Express server: URL validation, scraping, Groq call
public/index.html  Frontend (input, button, loading state, result)
.env.example       Template for your API key (copy to .env)
render.yaml        Render deployment config
```

## Deploy on Render (free)

1. Push this repo to GitHub.
2. On https://render.com choose **New → Web Service** and connect the repo (or use **New → Blueprint** to pick up `render.yaml`).
3. Build command `npm install`, start command `npm start`.
4. Under **Environment**, add `GROQ_API_KEY` with your key. Do not commit `.env`.
5. Deploy. Render gives you a public `*.onrender.com` URL. The free tier sleeps when idle, so the first request can take ~30 seconds.

## Notes and limits

- Works on server-rendered HTML pages; JavaScript-heavy sites and bot-protected sites may return too little text.
- Page text is trimmed to 12,000 characters before it is sent to the AI.
- Localhost and private-network URLs are blocked to prevent server-side request forgery.
