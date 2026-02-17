# NS with Feeder (Dexcom Phone-Number Login Fix)

This repository provides a small **Dexcom Share → Nightscout feeder** that works reliably when the **Dexcom login uses a mobile phone number** (a setup that often fails with Nightscout’s built-in Dexcom connector).  
It posts glucose entries directly into Nightscout via the `/api/v1/entries` endpoint.

> **Prerequisite:** You already have **Nightscout + MongoDB** deployed and initialized (e.g., on Render).  
> Nightscout must run **without** Dexcom connect enabled (remove Dexcom connect env vars from Nightscout).

---

## Overview

You can run the feeder in **one of two ways**:

- **Option A (Recommended): Run as a Render Web Service (always-on via web ping)**
- **Option B: Run locally (macOS / Linux / Windows)**

The feeder code is a simple Node.js service that:
1) logs into Dexcom Share (EU host supported),
2) reads latest glucose values,
3) maps them to Nightscout entries,
4) pushes them to Nightscout every `POLL_INTERVAL_SECONDS`.

---

## 1) Nightscout: minimal env vars (Render)

Your Nightscout Render service can be kept minimal. These are known to be sufficient for a normal setup:

- `API_SECRET` (your Nightscout API secret)
- `ENABLE` (Nightscout plugins/features look example values)
- `HOSTNAME` (`0.0.0.0`)
- `MONGO_CONNECTION`
- `PORT` (example: `1337`)

### Example values
- `ENABLE` = bgnow delta direction timeago devicestatus profile upbat errorcodes careportal ar2


### Remove Dexcom connect vars from Nightscout
Make sure Nightscout does **not** try to connect to Dexcom itself. Remove any variables like:
- `CONNECT_*`
- `CONNECT_SHARE_*`
- `CONNECT_SOURCE`
- `DEBUG=connect:* ...` (if only used for Dexcom connect)

Nightscout should only display data that the feeder posts.

---

## 2) Feeder env vars (Render Web Service OR local)

These environment variables are used by the feeder service:

Required:
- `DEXCOM_ACCOUNT_NAME` = your Dexcom app login (often phone number, e.g. `+49123456789`)
- `DEXCOM_PASSWORD` = your Dexcom app password (NOT “Share” password)
- `NIGHTSCOUT_URL` = your Nightscout base URL (e.g. `https://your-ns.onrender.com`)
- `NIGHTSCOUT_API_SECRET` = your Nightscout API secret (plain text; the feeder hashes it internally)

Recommended defaults:
- `DEXCOM_HOST` = `shareous1.dexcom.com` (EU)
- `DEXCOM_APPLICATION_ID` = `d89443d2-327c-4a6f-89e5-496bbb0317db`
- `DEXCOM_MINUTES` = `1440`
- `DEXCOM_MAX_COUNT` = `288`
- `POLL_INTERVAL_SECONDS` = `60`

> Note: Some variables like `CONNECT_SHARE_SERVER`, `MAX_COUNT`, `POLL_MINUTES` are not required for the feeder itself. Keep them only if you want them for compatibility/documentation.

---

## Option A (Recommended): Deploy Feeder as Render Web Service (Blueprint)

This repo contains a `render.yaml`.  
When you deploy via Render Blueprint, Render will read it and show you the needed fields.

### A1) Create Render Blueprint
1) Go to Render → **New** → **Blueprint**
2) Select your GitHub repo: `ns-with-feeder`
3) Render will detect `render.yaml` and create the service(s)

### A2) Render Settings you should verify
In Render service settings, ensure:

- **Build Command**:
npm install --no-audit --no-fund

- **Start Command**:
node index.mjs

> If your repo has a subfolder structure, set the “Root Directory” accordingly.  
> In this repository, the feeder should live in the repo root where `index.mjs` and `package.json` are.

### A3) Add Environment Variables (Render)
In the feeder service → **Environment** tab, set at least:

- `DEXCOM_ACCOUNT_NAME`
- `DEXCOM_PASSWORD`
- `NIGHTSCOUT_URL`
- `NIGHTSCOUT_API_SECRET`

Optionally set:
- `DEXCOM_HOST=shareous1.dexcom.com`
- `DEXCOM_APPLICATION_ID=d89443d2-327c-4a6f-89e5-496bbb0317db`
- `POLL_INTERVAL_SECONDS=60`
- `DEXCOM_MINUTES=1440`
- `DEXCOM_MAX_COUNT=288`

Deploy/redeploy after setting env vars.

### A4) Keep the Render Web Service awake (Wake / Ping)
Render free tiers can sleep. To avoid “only runs once”, wake it regularly.

**Recommended: use an external HTTP ping** (any uptime monitor / cron / healthcheck).
Ping the feeder endpoint:
- `GET /` (returns `ns-feeder up`)

Examples:
- UptimeRobot / BetterStack / Pingdom (simple monitoring)
- Your own server cron (curl every minute)
- GitHub Actions scheduler (advanced)

---

## Option B: Run locally (uses the existing `.env` in this repo)

As discussed: the `.env` file already exists in this repository.  
For local usage you only need to **edit `.env`** and then start the service.

### B1) Edit `.env`
Open the existing `.env` in the repo and set your values:

- `DEXCOM_ACCOUNT_NAME=+49123456789`
- `DEXCOM_PASSWORD=yourPassword`
- `NIGHTSCOUT_URL=https://your-nightscout.onrender.com`
- `NIGHTSCOUT_API_SECRET=yourNightscoutSecret`
- `DEXCOM_HOST=shareous1.dexcom.com`
- `DEXCOM_APPLICATION_ID=d89443d2-327c-4a6f-89e5-496bbb0317db`
- `POLL_INTERVAL_SECONDS=60`
- `DEXCOM_MINUTES=1440`
- `DEXCOM_MAX_COUNT=288`

### B2) macOS / Linux: Install + Start
```bash
npm install
npm start

### B3) Windows: Install + Start (PowerShell)

npm install
npm start

Troubleshooting
“Missing env var …”

Your feeder service is missing required env vars.
Set at least:

DEXCOM_ACCOUNT_NAME

DEXCOM_PASSWORD

NIGHTSCOUT_URL

NIGHTSCOUT_API_SECRET

Data becomes “X minutes old”

If you deploy the feeder on Render and the data stops updating, your service likely slept.
Use a wake/ping strategy (see Option A4).

Dexcom auth errors

Double-check you use your Dexcom app login (often phone number) and app password

Make sure you are using the correct region host:

EU commonly: shareous1.dexcom.com

US commonly: share2.dexcom.com (depends on account region)

Notes / Disclaimer

This project is intended for personal data display in Nightscout.
Use at your own risk and comply with Dexcom’s terms and applicable regulations.
  
## License
AGPL-3.0 — see [LICENSE](LICENSE).

