import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { logger } from "./utils/logger";
import { config } from "./config";

const app = express();
app.use(cors());
app.use(express.json());

// Serve static website files
app.use(express.static(path.join(__dirname, "..", "website")));

// ─── In-memory session store ─────────────────────────────────────────
interface VerifySession {
  id: string;
  createdAt: number;
  verified: boolean;
  address: string | null;
  balance: number;
}

const sessions = new Map<string, VerifySession>();

// Clean expired sessions every 10 minutes (sessions live 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

// ─── Balance check helper ───────────────────────────────────────
async function checkMbcBalance(address: string): Promise<number> {
  const RUNE_NAME = "MEME•BACKED•CURRENCY";
  const apiKey = process.env.UNISAT_API_KEY || "";
  if (!apiKey) throw new Error("UNISAT_API_KEY not set");

  const runesRes = await fetch(
    `https://open-api.unisat.io/v1/indexer/address/${address}/runes/balance-list?start=0&limit=100`,
    {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    }
  );

  if (!runesRes.ok) {
    const errBody = await runesRes.text();
    logger.warn(`Unisat API returned ${runesRes.status} for ${address}: ${errBody}`);
    return 0;
  }

  const runesData = await runesRes.json() as any;
  const detail = runesData?.data?.detail || [];
  logger.info(`Unisat returned ${detail.length} runes for ${address}`);

  for (const rune of detail) {
    const spacedName = rune.spacedRune || "";
    const rawName = rune.rune || "";
    if (spacedName === RUNE_NAME || rawName === "MEMEBACKEDCURRENCY") {
      const raw = Number(rune.amount || 0);
      const divisibility = Number(rune.divisibility || 0);
      const balance = divisibility > 0 ? raw / Math.pow(10, divisibility) : raw;
      logger.info(`MATCH! raw=${raw}, divisibility=${divisibility}, balance=${balance}`);
      return balance;
    }
  }
  return 0;
}

// ─── Endpoints ───────────────────────────────────────────────────────

// Game calls this to start a new verification session
app.post("/api/verify/start", (_req, res) => {
  const id = crypto.randomBytes(16).toString("hex");
  sessions.set(id, {
    id,
    createdAt: Date.now(),
    verified: false,
    address: null,
    balance: 0,
  });
  logger.info(`Verification session created: ${id}`);
  res.json({ sessionId: id });
});

// Game polls this to check if verification completed
app.get("/api/verify/status/:sessionId", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found or expired" });
  }
  res.json({
    verified: session.verified,
    address: session.address,
    balance: session.balance,
  });
});

// Browser verify page calls this when wallet check is done
app.post("/api/verify/complete", async (req, res) => {
  const { sessionId, address } = req.body;
  if (!sessionId || !address) {
    return res.status(400).json({ error: "Missing sessionId or address" });
  }
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found or expired" });
  }

  const requiredBalance = 1000;
  const RUNE_NAME = "MEME•BACKED•CURRENCY";

  try {
    // Check balance server-side via Unisat API
    const apiKey = process.env.UNISAT_API_KEY || "";
    if (!apiKey) {
      logger.error("UNISAT_API_KEY not set in .env");
      return res.status(500).json({ error: "Server misconfigured: missing API key" });
    }

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
      // Unisat response: { code: 0, data: { detail: [...] } }
      const detail = runesData?.data?.detail || [];
      logger.info(`Unisat returned ${detail.length} runes for ${address}`);
      for (const rune of detail) {
        logger.info(`  Rune: spacedRune="${rune.spacedRune}" rune="${rune.rune}" amount="${rune.amount}" divisibility=${rune.divisibility}`);
        const spacedName = rune.spacedRune || "";
        const rawName = rune.rune || "";
        if (spacedName === RUNE_NAME || rawName === "MEMEBACKEDCURRENCY") {
          const raw = Number(rune.amount || 0);
          const divisibility = Number(rune.divisibility || 0);
          mbcBalance = divisibility > 0 ? raw / Math.pow(10, divisibility) : raw;
          logger.info(`  MATCH! raw=${raw}, divisibility=${divisibility}, computed balance=${mbcBalance}`);
          break;
        }
      }
    } else {
      const errBody = await runesRes.text();
      logger.warn(`Unisat API returned ${runesRes.status} for ${address}: ${errBody}`);
    }

    session.address = address;
    session.balance = mbcBalance;
    session.verified = mbcBalance >= requiredBalance;

    logger.info(
      `Verification ${session.verified ? "SUCCESS" : "FAILED"}: ${address} holds ${mbcBalance} MBC (need ${requiredBalance})`
    );

    res.json({
      verified: session.verified,
      balance: mbcBalance,
      required: requiredBalance,
    });
  } catch (err) {
    logger.error(`Balance check failed for ${address}:`, { error: String(err) });
    res.status(500).json({ error: "Balance check failed" });
  }
});

// ─── Unified route (Vercel-compatible ?action= format) ───────────────
app.all("/api/verify", async (req, res) => {
  const action = req.query.action as string;
  if (action === "start" && req.method === "POST") {
    const id = crypto.randomBytes(16).toString("hex");
    sessions.set(id, { id, createdAt: Date.now(), verified: false, address: null, balance: 0 });
    logger.info(`Verification session created: ${id}`);
    return res.json({ sessionId: id });
  }
  if (action === "status" && req.method === "GET") {
    const session = sessions.get(req.query.sessionId as string);
    if (!session) return res.status(404).json({ error: "Session not found or expired" });
    return res.json({ verified: session.verified, address: session.address, balance: session.balance });
  }
  if (action === "complete" && req.method === "POST") {
    const { sessionId, address } = req.body;
    if (!sessionId || !address) return res.status(400).json({ error: "Missing sessionId or address" });
    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found or expired" });
    try {
      const mbcBalance = await checkMbcBalance(address);
      session.address = address;
      session.balance = mbcBalance;
      session.verified = mbcBalance >= 1000;
      logger.info(`Verification ${session.verified ? "SUCCESS" : "FAILED"}: ${address} holds ${mbcBalance} MBC`);
      return res.json({ verified: session.verified, balance: mbcBalance, required: 1000 });
    } catch (err) {
      logger.error(`Balance check failed:`, { error: String(err) });
      return res.status(500).json({ error: "Balance check failed" });
    }
  }
  return res.status(400).json({ error: "Unknown action" });
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessions.size });
});

// ─── Start server ────────────────────────────────────────────────────

export function startServer(port: number = 3000): void {
  app.listen(port, () => {
    logger.info(`Verification server running on port ${port}`);
  });
}
