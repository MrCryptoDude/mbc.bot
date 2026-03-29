import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// ─── In-memory session store ─────────────────────────────────────
// Persists across invocations of the same warm Lambda instance.
// Verification flow takes ~1-2 min, well within Vercel's warm window.
interface VerifySession {
  id: string;
  createdAt: number;
  verified: boolean;
  address: string | null;
  balance: number;
}

const sessions = new Map<string, VerifySession>();

// Clean expired sessions (30 min TTL)
function cleanSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}

const RUNE_NAME = "MEME•BACKED•CURRENCY";
const REQUIRED_BALANCE = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  cleanSessions();

  const action = req.query.action as string;

  // ─── START: Create a new session ───────────────────────────
  if (action === "start" && req.method === "POST") {
    const id = crypto.randomBytes(16).toString("hex");
    sessions.set(id, {
      id,
      createdAt: Date.now(),
      verified: false,
      address: null,
      balance: 0,
    });
    console.log(`Session created: ${id}`);
    return res.json({ sessionId: id });
  }

  // ─── STATUS: Game polls this ───────────────────────────────
  if (action === "status" && req.method === "GET") {
    const sessionId = req.query.sessionId as string;
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found or expired" });
    }
    return res.json({
      verified: session.verified,
      address: session.address,
      balance: session.balance,
    });
  }

  // ─── COMPLETE: Browser sends wallet address ────────────────
  if (action === "complete" && req.method === "POST") {
    const { sessionId, address } = req.body || {};
    if (!sessionId || !address) {
      return res.status(400).json({ error: "Missing sessionId or address" });
    }
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found or expired" });
    }

    const apiKey = process.env.UNISAT_API_KEY || "";
    if (!apiKey) {
      console.error("UNISAT_API_KEY not set");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    try {
      const runesRes = await fetch(
        `https://open-api.unisat.io/v1/indexer/address/${address}/runes/balance-list?start=0&limit=100`,
        {
          headers: {
            "Accept": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
        }
      );

      let mbcBalance = 0;

      if (runesRes.ok) {
        const runesData = await runesRes.json() as any;
        const detail = runesData?.data?.detail || [];
        console.log(`Unisat returned ${detail.length} runes for ${address}`);
        for (const rune of detail) {
          const spacedName = rune.spacedRune || "";
          const rawName = rune.rune || "";
          if (spacedName === RUNE_NAME || rawName === "MEMEBACKEDCURRENCY") {
            const raw = Number(rune.amount || 0);
            const divisibility = Number(rune.divisibility || 0);
            mbcBalance = divisibility > 0 ? raw / Math.pow(10, divisibility) : raw;
            console.log(`MATCH! raw=${raw}, divisibility=${divisibility}, balance=${mbcBalance}`);
            break;
          }
        }
      } else {
        const errBody = await runesRes.text();
        console.warn(`Unisat API ${runesRes.status}: ${errBody}`);
      }

      session.address = address;
      session.balance = mbcBalance;
      session.verified = mbcBalance >= REQUIRED_BALANCE;

      console.log(`Verification ${session.verified ? "SUCCESS" : "FAILED"}: ${address} holds ${mbcBalance} MBC`);

      return res.json({
        verified: session.verified,
        balance: mbcBalance,
        required: REQUIRED_BALANCE,
      });
    } catch (err) {
      console.error(`Balance check failed:`, err);
      return res.status(500).json({ error: "Balance check failed" });
    }
  }

  // ─── HEALTH ────────────────────────────────────────────────
  if (action === "health") {
    return res.json({ status: "ok", sessions: sessions.size });
  }

  return res.status(400).json({ error: "Unknown action. Use ?action=start|status|complete|health" });
}
