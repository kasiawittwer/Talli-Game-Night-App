/**
 * Optional backend: forwards chat/completions JSON to OpenAI so the mobile app
 * only needs GAME_ASSISTANT_API_URL — no OPENAI_API_KEY in the client bundle.
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
