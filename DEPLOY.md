# Deployment guide

Deploying to a real host needs your own accounts (GitHub, Render, Groq); these are the steps.

## Option A: Render (easiest, free tier) + Groq
1. Sign up at render.com with GitHub. **New -> Blueprint** -> select your repo. Render reads `render.yaml` and creates the
   API (Docker), a PostgreSQL database and the static frontend.
2. When asked for the values marked `sync: false`, fill in:
   - `LLM_API_KEY` and `WHISPER_API_KEY`: your Groq key
   - `CORS_ORIGINS` and `FRONTEND_URL`: the frontend URL (e.g. `https://mockinterview-web.onrender.com`). If you don't
     know it yet, leave blank, finish the deploy, then set it in the API service's Environment tab.
   - `VITE_API_URL` (frontend service): the API URL (e.g. `https://mockinterview-api.onrender.com`), **no trailing slash**
3. After the first deploy, set `CORS_ORIGINS`/`FRONTEND_URL` to the real frontend URL, set `VITE_API_URL` to the real API
   URL, and **redeploy the frontend** (the URL is baked in at build time).
4. Open the frontend URL -> Create account -> run an interview. `https://<api>/health` must return `{"status":"ok"}`.

Free-tier notes (check Render's current terms): the API sleeps when idle, so the first request after a pause can take
~30-60 s; free Postgres databases may expire. For anything real use a paid plan or an external Postgres such as Neon:
paste its connection string as `DATABASE_URL` (`postgres://` URLs and `?sslmode=require` are handled automatically).

## Option B: your own server (VPS) with Docker
```bash
git clone <your repo> && cd <repo>
cp .env.prod.example .env.prod      # fill in PUBLIC_URL, POSTGRES_PASSWORD, JWT_SECRET, LLM_API_KEY ...
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
The stack serves the frontend on port 80 and the API under `/api` on the same origin. The microphone needs **HTTPS**,
so put a TLS proxy in front, e.g. Caddy on the host:
```
interview.yourdomain.com {
    reverse_proxy localhost:80
}
```
Update: `git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` (migrations run on
start). Back up the `pgdata` volume regularly.

## Required production settings
| Variable | Why |
|---|---|
| `APP_ENV=production` | disables API docs, strict CORS, hides dev reset links, enforces JWT secret |
| `JWT_SECRET` | long random value (`python -c "import secrets;print(secrets.token_urlsafe(48))"`) |
| `DATABASE_URL` | `postgres://` and `postgresql://` URLs are converted automatically |
| `CORS_ORIGINS` | exact frontend origin(s), comma-separated, no trailing slash |
| `LLM_API_KEY` (+ base URL/model) | without it the public site runs in demo mode |

## Password-reset emails
Many free hosts block SMTP. Use **Resend** (resend.com): set `RESEND_API_KEY` and `SMTP_FROM`. Without a verified domain
Resend only delivers to your own account email. Plain SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`) also
works where ports are open. With neither, reset requests succeed silently but nobody gets an email.

## After deploying: checklist
- [ ] `/health` returns ok; frontend loads; register -> login works
- [ ] A full interview is evaluated by the real AI (no yellow demo banner)
- [ ] Microphone works over HTTPS; the PDF downloads
- [ ] Rotate your Groq key if it was ever pasted anywhere public

## Known limits
- One API process: the rate limiter is in-memory (use Redis for several instances).
- The login token is kept in `localStorage` (XSS would expose it).
- Audio and answers go to your chosen AI provider; mention this in a privacy policy.
