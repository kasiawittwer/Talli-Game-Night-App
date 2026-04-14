# Game assistant API (optional)

Small Express app that proxies **OpenAI** chat and **gamerules.com** HTML so the mobile/web app does not need an API key in the bundle and web builds avoid CORS issues when loading rule pages.

## What I have to do myself

This repo cannot be deployed for you automatically. You need an account on a host (below uses **Render**), connect **your** Git repo, and paste secrets in their dashboard.

## Deploy on Render (recommended)

1. Push this project to GitHub/GitLab/Bitbucket.
2. In [Render](https://render.com): **New** → **Blueprint** → connect the repo → select `render.yaml`.
3. When prompted, add **`OPENAI_API_KEY`** (only if you want cloud Rulebook answers through the proxy). GameRules-only proxy works without it.
4. Wait for the deploy. Open **`https://<your-service-name>.onrender.com/api/health`** — you should see JSON like `{ "ok": true, ... }`.
5. Copy the **origin** only (no path): `https://<your-service-name>.onrender.com`

## Point the Expo app at the API

Set this **when you build** the web export (or in CI env):

```bash
export EXPO_PUBLIC_GAME_ASSISTANT_API_URL="https://your-service-name.onrender.com"
npx expo export -p web
```

For local dev, put the same value in a root `.env` file (see `../.env.example`) and restart Expo.

Do **not** use `http://localhost:3000` for a public site—visitors cannot reach your computer.

## Manual deploy (any host)

- **Root directory:** `server`
- **Install:** `npm install`
- **Start:** `npm start`
- **Port:** host sets `PORT`; the server reads `process.env.PORT || 3000`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness check |
| GET | `/api/gamerules-fetch?url=...` | Proxy HTML from `https://gamerules.com/...` only |
| POST | `/api/openai-proxy` | Forward body to OpenAI (requires `OPENAI_API_KEY` on server) |
