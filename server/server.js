/**
 * Optional backend: forwards chat/completions JSON to OpenAI so the mobile app
 * only needs GAME_ASSISTANT_API_URL — no OPENAI_API_KEY in the client bundle.
 *
 * Also exposes GET /api/gamerules-fetch?url=... so the web app can load rule pages
 * (browser CORS blocks direct fetches to gamerules.com).
 *
 * Run: cd server && cp .env.example .env  (add OPENAI_API_KEY) && npm i && npm run dev
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(cors());
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(OPENAI_API_KEY) });
});

const GAMERULES_HOST = 'gamerules.com';

app.get('/api/gamerules-fetch', async (req, res) => {
  const raw = req.query.url;
  if (!raw || typeof raw !== 'string') {
    res.status(400).json({ error: 'Missing url' });
    return;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    res.status(400).json({ error: 'Invalid url' });
    return;
  }
  if (parsed.hostname !== GAMERULES_HOST) {
    res.status(400).json({ error: 'Only gamerules.com is allowed' });
    return;
  }
  if (parsed.protocol !== 'https:') {
    res.status(400).json({ error: 'Only https' });
    return;
  }
  try {
    const r = await fetch(parsed.toString(), {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; GameAssistant/1.0)',
      },
    });
    const text = await r.text();
    const cap = 1_500_000;
    res.status(r.status).type('text/html; charset=utf-8').send(text.length > cap ? text.slice(0, cap) : text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Fetch failed', details: String(e) });
  }
});

app.post('/api/openai-proxy', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });
      return;
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(req.body),
    });

    const text = await r.text();
    res.status(r.status).type('application/json').send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Proxy request failed', details: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Game assistant API listening on ${PORT}`);
});
