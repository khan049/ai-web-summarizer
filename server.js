require("dotenv").config();
const express = require("express");
const cheerio = require("cheerio");
const dns = require("dns").promises;
const net = require("net");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const MAX_CHARS = 12000; // keep prompt small for free-tier limits

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (req, res) => res.send("ok"));

// Block localhost / private network targets (basic SSRF protection)
function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw httpError(400, "That doesn't look like a valid URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw httpError(400, "Only http and https URLs are supported.");
  const { address } = await dns.lookup(url.hostname).catch(() => { throw httpError(400, "Could not resolve that hostname."); });
  if (isPrivateIp(address)) throw httpError(400, "Private or local addresses are not allowed.");
  return url;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function scrape(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AISummarizerBot/1.0)", Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  }).catch(() => { throw httpError(502, "Could not reach that page."); });

  if (!res.ok) throw httpError(502, `The page returned status ${res.status}.`);
  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html")) throw httpError(415, "That URL is not an HTML page.");

  const $ = cheerio.load(await res.text());
  $("script, style, noscript, nav, footer, header, aside, form, iframe, svg").remove();

  const title = $("title").first().text().trim() || $("h1").first().text().trim() || url.hostname;
  const root = $("article").length ? $("article") : $("main").length ? $("main") : $("body");
  const text = root.text().replace(/\s+/g, " ").trim();

  if (text.length < 200) throw httpError(422, "Not enough text found. The page may need JavaScript to render.");
  return { title, text: text.slice(0, MAX_CHARS) };
}

async function summarize(title, text) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 2000, // reasoning models spend part of this thinking
      ...(GROQ_MODEL.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: "You summarize web pages. Write a concise summary: one sentence overview, then 3-5 bullet points of key takeaways. Use only the provided text." },
        { role: "user", content: `Title: ${title}\n\nPage text:\n${text}` },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("Groq error:", res.status, detail);
    let reason = "";
    try { reason = JSON.parse(detail).error?.message || ""; } catch {}
    if (res.status === 401) throw httpError(502, "Groq rejected the API key (401). Check GROQ_API_KEY in .env and restart the server.");
    throw httpError(502, `AI service error (${res.status}): ${reason || "unknown reason"}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "No summary was returned.";
}

app.post("/api/summarize", async (req, res) => {
  try {
    if (!GROQ_API_KEY) throw httpError(500, "Server is missing GROQ_API_KEY. See the README.");
    const url = await assertPublicUrl(String(req.body?.url || "").trim());
    const { title, text } = await scrape(url);
    const summary = await summarize(title, text);
    res.json({ title, url: url.href, summary });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
  }
});

app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));