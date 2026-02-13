import axios from "axios";
import crypto from "node:crypto";
import 'dotenv/config';
dotenv.config();

import express from "express";
const app = express();
app.get("/", (_req, res) => res.send("ns-feeder up"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[feeder] http listening on :${PORT}`));

/** ---------- Konfig ---------- */
const cfg = {
  accountName: process.env.DEXCOM_ACCOUNT_NAME,            // z.B. +4917...
  password: process.env.DEXCOM_PASSWORD,
  host: process.env.DEXCOM_HOST || "shareous1.dexcom.com", // EU Host
  applicationId: process.env.DEXCOM_APPLICATION_ID || "d89443d2-327c-4a6f-89e5-496bbb0317db",

  nsUrl: process.env.NIGHTSCOUT_URL,
  nsApiSecret: process.env.NIGHTSCOUT_API_SECRET,

  pollSeconds: Number(process.env.POLL_INTERVAL_SECONDS || 60),
  minutes: Number(process.env.DEXCOM_MINUTES || 1440),
  maxCount: Number(process.env.DEXCOM_MAX_COUNT || 288),
};

// minimale Validierung
function requireVar(name, val) {
  if (!val || String(val).trim() === "") {
    throw new Error(`Missing env var: ${name}`);
  }
}
["DEXCOM_ACCOUNT_NAME","DEXCOM_PASSWORD","NIGHTSCOUT_URL","NIGHTSCOUT_API_SECRET"].forEach(n => requireVar(n, process.env[n]));

/** ---------- Hilfen ---------- */
const dex = axios.create({
  baseURL: `https://${cfg.host}/ShareWebServices/Services`,
  headers: { "Content-Type": "application/json", "Accept": "application/json" },
  timeout: 30000,
});

function sha1Hex(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

// "Date(1770916027510+0100)" → { ms: 1770916027510, date: Date }
function parseDexcomDate(str) {
  // holt die erste Zahl nach "Date("
  const m = /Date\((\d+)/.exec(str);
  const ms = m ? Number(m[1]) : Date.now();
  return { ms, date: new Date(ms) };
}

// Nightscout Entry aus Dexcom-Objekt
function mapToNsEntry(d) {
  // Dexcom Trend-Strings → Nightscout direction (best effort)
  const mapDir = {
    "DoubleUp": "DoubleUp",
    "SingleUp": "SingleUp",
    "FortyFiveUp": "FortyFiveUp",
    "Flat": "Flat",
    "FortyFiveDown": "FortyFiveDown",
    "SingleDown": "SingleDown",
    "DoubleDown": "DoubleDown",
    "None": "NONE",
    "NotComputable": "NOT_COMPUTABLE",
    "RateOutOfRange": "RATE_OUT_OF_RANGE"
  };
  const t = parseDexcomDate(d.DT || d.WT || d.ST);
  return {
    type: "sgv",
    sgv: Number(d.Value),
    direction: mapDir[d.Trend] || "Flat",
    date: t.ms,
    dateString: new Date(t.ms).toISOString(),
    // optional Felder:
    // device: "dexcom-share-feeder",
    // rawbg: Number(d.Value)
  };
}

/** ---------- Dexcom EU Flow (bewährt) ---------- */
// 1) AuthenticatePublisherAccount → accountId (UUID)
async function authenticateByName(accountName, password) {
  const url = `/General/AuthenticatePublisherAccount?applicationId=${encodeURIComponent(cfg.applicationId)}`;
  const body = { accountName, password, applicationId: cfg.applicationId };
  const { data } = await dex.post(url, body, { transformResponse: r => r }); // rohes UUID-String
  const accountId = String(data).replace(/"/g, "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(accountId)) {
    throw new Error(`Authenticate returned non-UUID: ${accountId}`);
  }
  return accountId;
}

// 2) LoginPublisherAccountById → sessionId (UUID)
async function loginById(accountId, password) {
  const url = `/General/LoginPublisherAccountById?applicationId=${encodeURIComponent(cfg.applicationId)}`;
  const body = { accountId, password, applicationId: cfg.applicationId };
  const { data } = await dex.post(url, body, { transformResponse: r => r });
  const sessionId = String(data).replace(/"/g, "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(sessionId)) {
    throw new Error(`Login returned non-UUID: ${sessionId}`);
  }
  return sessionId;
}

// 3) ReadPublisherLatestGlucoseValues → Array von Messpunkten
async function readLatest(sessionId, minutes, maxCount) {
  const url = `/Publisher/ReadPublisherLatestGlucoseValues?sessionID=${encodeURIComponent(sessionId)}&minutes=${minutes}&maxCount=${maxCount}`;
  const { data } = await dex.post(url, {}); // leeres JSON-Objekt
  if (!Array.isArray(data)) {
    throw new Error(`Dexcom returned non-array: ${JSON.stringify(data).slice(0,200)}...`);
  }
  return data;
}

/** ---------- Nightscout Upload ---------- */
const ns = axios.create({
  baseURL: cfg.nsUrl.replace(/\/+$/,""),
  headers: { "API-SECRET": sha1Hex(cfg.nsApiSecret) },
  timeout: 30000,
});

async function postEntries(entries) {
  if (!entries.length) return { posted: 0 };
  const { data } = await ns.post("/api/v1/entries", entries);
  return { posted: Array.isArray(data) ? data.length : entries.length };
}

/** ---------- Loop ---------- */
let lastSentMs = 0;

async function tick() {
  try {
    // 1+2: Session besorgen
    const accountId = await authenticateByName(cfg.accountName, cfg.password);
    const sessionId = await loginById(accountId, cfg.password);

    // 3: Werte lesen
    const points = await readLatest(sessionId, cfg.minutes, cfg.maxCount);

    // filtern (nur > lastSentMs)
    const mapped = points
      .map(mapToNsEntry)
      .filter(e => e.date > lastSentMs)
      // sortieren alt→neu, damit Nightscout chronologisch bekommt
      .sort((a,b) => a.date - b.date);

    if (mapped.length) {
      const last = mapped[mapped.length - 1];
      const res = await postEntries(mapped);
      lastSentMs = Math.max(lastSentMs, last.date);
      console.log(`[feeder] posted ${res.posted} entries; last=${new Date(lastSentMs).toISOString()}`);
    } else {
      console.log("[feeder] no new entries");
    }
  } catch (err) {
    // Dexcom Fehlermuster anzeigen (AccountPasswordInvalid etc.)
    if (err.response?.data) {
      console.error("[feeder] ERROR", err.response.status, err.response.data);
    } else {
      console.error("[feeder] ERROR", err.message);
    }
  }
}

async function main() {
  console.log("[feeder] starting… EU host:", cfg.host);
  // beim ersten Run nicht alles posten → nur die letzten 6h zulassen
  lastSentMs = Date.now() - 6 * 60 * 60 * 1000;
  await tick();
  setInterval(tick, cfg.pollSeconds * 1000);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
