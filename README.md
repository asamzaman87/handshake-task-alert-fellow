# Handshake Task Availability Phone Alerts

Production-oriented project with:
- a Chrome Extension (Manifest V3) that polls Handshake every 10+ minutes
- a Node.js + TypeScript backend that uses Twilio Programmable Voice

This project **only alerts** about task availability. It does **not** auto-claim tasks.

## Directory tree

```text
handshake-task-alert/
  backend/
    src/
      alertStore.ts
      config.ts
      server.ts
      twilioService.ts
      types.ts
    .env.example
    package.json
    tsconfig.json
  extension/
    public/
      manifest.json
      options.html
      popup.html
    src/
      backendApi.ts
      handshake.ts
      mock-payload.ts
      options.ts
      popup.ts
      service-worker.ts
      storage.ts
      types.ts
    build.mjs
    package.json
    tsconfig.json
  .gitignore
  README.md
```

## Architecture

### Extension responsibilities
- Runs polling via `chrome.alarms` (default 10 minutes, min 10)
- Uses authenticated browser session cookies via `fetch(..., { credentials: "include" })`
- Parses tRPC task response safely and extracts `availableCount`
- Maintains state in `chrome.storage.local`
- Triggers `POST /alerts/start` only on new availability transitions (dedupe)
- Checks backend alert status and schedules a 30-minute retry check if unresolved
- Provides popup controls: enable/disable, poll now, clear state
- Provides options page: backend URL, phone number, poll interval, project ID, message

### Backend responsibilities
- Receives alert start requests (`POST /alerts/start`)
- Starts Twilio outbound calling loop for up to 60 seconds
- Stops loop when answered (via Twilio callback)
- Exposes alert status (`GET /alerts/:id/status`)
- Uses TwiML endpoint for spoken message (`POST /twiml/alert`)
- Keeps all Twilio secrets server-side only

## State and dedupe behavior

- Poll detects task availability (`availableCount > 0`).
- If prior poll had zero/no tasks and there is no active alert, extension creates an `alertId` and starts backend alert.
- While an alert is active, 10-minute polls do not trigger duplicate calls.
- If no answer after backend 1-minute call window, extension sets one retry-check alarm at +30 minutes.
- At retry-check time, extension polls Handshake again first:
  - if tasks still available and backend status still unresolved, starts one more alert cycle
  - otherwise resolves and clears active state
- If tasks disappear (`availableCount === 0`), active alert state is cleared, enabling future fresh alerts.

## Session-expiry handling

Handshake responses that are unauthorized, redirected, non-JSON, malformed, or structurally invalid are treated as session/request issues.

The extension:
- sets `lastPollStatus` to `session_expired` or `error`
- stores human-readable `lastError`
- does not trigger any call for that poll

## Setup

## 1) Backend setup

```bash
cd backend
cp .env.example .env
npm install
```

Set real values in `.env`, especially:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `PUBLIC_BASE_URL` (must be publicly reachable for Twilio callbacks in production)

Run locally:

```bash
npm run dev
```

Build/start production:

```bash
npm run build
npm start
```

## 2) Twilio configuration

1. Buy/assign a Twilio phone number with Voice enabled.
2. Put that number in `TWILIO_FROM_NUMBER`.
3. Ensure backend URL is public (for Twilio webhooks), e.g. `https://your-app.onrender.com`.
4. Set `PUBLIC_BASE_URL` to that public URL.
5. Backend handles:
   - TwiML URL: `/twiml/alert`
   - Status callbacks: `/twilio/status-callback`

## 3) Extension setup

```bash
cd extension
npm install
npm run build
```

Load unpacked extension:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist` folder

Open extension options and configure:
- Backend base URL (default `http://localhost:8787`)
- Destination phone number in E.164 format
- Poll interval (minimum 10)
- Project ID (defaults to `26a53071-8843-4138-97df-430bd3e4cd45`)
- Optional custom message

Then use popup to enable monitoring.

## Local development workflow

- Backend:
  - `cd backend && npm run dev`
- Extension:
  - `cd extension && npm run build`
  - reload extension in `chrome://extensions` after changes

Optional parser harness:

```bash
cd extension
npx esbuild src/mock-payload.ts --bundle --platform=node --outfile=/tmp/mock.js
node /tmp/mock.js
```

## Deployment guidance

### Render / Railway / Fly.io / VPS

1. Deploy backend service from `backend/`.
2. Set environment variables from `.env.example`.
3. Expose HTTPS URL and set `PUBLIC_BASE_URL` accordingly.
4. Update extension options `backendBaseUrl` to deployed URL.
5. Add deployed backend origin to `extension/public/manifest.json` `host_permissions`, rebuild extension, reload unpacked extension.

For VPS:
- run behind HTTPS reverse proxy (Nginx/Caddy)
- use process manager (`pm2`, `systemd`, or Docker)
- keep env vars in server secret store or protected `.env`

## Security notes

- Twilio secrets never exist in extension files.
- Extension stores only operational state/config in `chrome.storage.local`.
- No task-claiming logic exists in this project.

## APIs

### `POST /alerts/start`

Request:

```json
{
  "alertId": "string",
  "phoneNumber": "+15555550123",
  "message": "Handshake task available. Open Handshake now."
}
```

Response `202`:

```json
{
  "alertId": "string",
  "status": "queued",
  "attempts": 0,
  "acceptedAt": "ISO_DATE"
}
```

### `GET /alerts/:id/status`

Returns alert lifecycle info (`queued`, `calling`, `answered`, `unresolved`, `failed`) and attempt metadata.
