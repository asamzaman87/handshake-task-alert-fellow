# Handshake Task Alerts (Simplified Remote Cron)

This version is optimized for Vercel remote execution:

- Poll Handshake every 10 minutes with Vercel Cron
- If task count is greater than zero, call once via Twilio
- If poll request errors, also call once via Twilio
- No retry loop and no 30-minute follow-up state machine
- Extension is optional manual UI (`poll now`, `force alert`)

No auto-claim functionality is included.

## Runtime behavior

`GET /cron/poll` does this once per run:

1. Exit early when `POLLING_ENABLED=false`
2. Poll Handshake endpoint using `HANDSHAKE_COOKIE`
3. If `availableCount > 0` => place exactly one Twilio call
4. If poll fails => place exactly one Twilio call with an error message
5. Log a structured JSON event for observability in Vercel logs

## Environment variables

Copy from `backend/.env.example` into local `.env` and into Vercel project envs:

- `PORT`
- `PUBLIC_BASE_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `DESTINATION_PHONE_NUMBER`
- `DEFAULT_VOICE_MESSAGE`
- `EXTENSION_ORIGIN`
- `POLLING_ENABLED`
- `CRON_SECRET`
- `CALL_TIMEOUT_SEC`
- `HANDSHAKE_PROJECT_ID`
- `HANDSHAKE_COOKIE`

## Local setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

## Extension setup (manual testing UI)

```bash
cd extension
npm install
npm run build
```

Load `extension/dist` in `chrome://extensions` as unpacked.

Popup actions:
- `Poll now (remote)` => calls backend `POST /monitor/poll-now`
- `Force alert` => calls backend `POST /alerts/force`

## Vercel deployment

1. Import GitHub repo into Vercel
2. Set all env vars from `.env.example`
3. Deploy
4. Set `PUBLIC_BASE_URL` to deployed URL and redeploy if needed
5. Confirm cron path exists in `backend/vercel.json`

`backend/vercel.json` includes:
- `*/10 * * * *` schedule calling `/cron/poll`

## API endpoints

- `GET /health`
- `GET /cron/poll` (cron runner; optional bearer check via `CRON_SECRET`)
- `POST /monitor/poll-now` (manual run)
- `POST /alerts/force` (manual one-call trigger)
- `POST /alerts/start` (manual one-call trigger with optional payload)
- `GET /monitor/status`
- `POST /debug/handshake-poll-with-cookie`
