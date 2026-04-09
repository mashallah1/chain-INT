import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security & Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// ── Rate Limiting ────────────────────────────────────────────────────
const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many scan requests. Please wait 15 minutes before trying again.",
  },
});

// ── Anthropic Client ─────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── OSINT System Prompt ──────────────────────────────────────────────
const OSINT_SYSTEM_PROMPT = `You are an elite Web3 OSINT analyst with deep expertise in blockchain intelligence, crypto project due diligence, and on-chain forensics.

When given a project name or contract address, use web search extensively to pull real-time data from:
- CryptoRank (funding rounds, investors, market data)
- RootData (project registry, team info, VC connections)
- DeFiLlama (TVL, protocol metrics, chain data)
- CoinGecko / CoinMarketCap (token data, market cap)
- LinkedIn, Twitter/X (founder backgrounds, social presence)
- GitHub (code activity, contributors, audit history)
- Crunchbase (company/founder history)
- Messari, The Block (research coverage)
- Any news, forums, or community discussions

Structure your response using EXACTLY these headers. Be specific, cite sources, flag red flags with 🔴, yellow flags with 🟡, and positive signals with 🟢. Use **bold** for key findings.

## PROJECT OVERVIEW
[Founding date, chain, category, current status, brief description, token if any]

---

## FOUNDER INTELLIGENCE
[Every founder/co-founder: full name, background, LinkedIn, Twitter, past projects (successful AND failed), any rugs or controversies, doxxed status, claimed credentials vs verified]

---

## INVESTOR & VC ANALYSIS
[All investors/VCs, their tier/reputation, portfolio history, any failed investments or association with scams, round details, valuations if known]

---

## AFFILIATE NETWORK
[Advisors, partners, exchanges, launchpads, associated wallets, cross-project connections, shell company patterns]

---

## ON-CHAIN SIGNALS
[Token distribution, whale concentration, unlock schedules, smart contract audits, TVL if applicable, unusual wallet activity, deployer address history]

---

## SOCIAL & COMMUNITY
[Twitter followers + growth pattern, Telegram/Discord health, GitHub commits, media coverage, community sentiment, bot activity indicators]

---

## RISK & RED FLAGS
[Comprehensive list of ALL concerns: anonymous team, copied code, suspicious tokenomics, VC dump history, honeypot risk, regulatory issues, etc.]

---

## OSINT VERDICT
[Final assessment with a TRUST SCORE from 0-100, overall recommendation: PASS / CAUTION / AVOID, and key reasoning]

At the very end, output this exact line:
TRUST_SCORE: [0-100]`;

// ── Routes ───────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "operational",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Main OSINT scan endpoint — streaming SSE
app.post("/api/scan", scanLimiter, async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query field is required and must be a string." });
  }

  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 200) {
    return res.status(400).json({ error: "Query must be between 2 and 200 characters." });
  }

  // Set up SSE headers for streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent("status", { message: "Initializing OSINT scan...", stage: "init" });

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: OSINT_SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [
        {
          role: "user",
          content: `Conduct a full OSINT investigation on this Web3 project: "${trimmed}"\n\nSearch extensively across CryptoRank, RootData, DeFiLlama, CoinGecko, LinkedIn, Twitter, GitHub, and any other relevant sources. Find real data on the founders, investors, team history, on-chain activity, and any red flags. Be thorough and specific.`,
        },
      ],
    });

    let toolUseCount = 0;

    // Stream events as they arrive
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block?.type === "tool_use") {
          toolUseCount++;
          sendEvent("tool_use", {
            tool: event.content_block.name,
            count: toolUseCount,
            message: `Querying source ${toolUseCount}...`,
          });
        }
      }

      if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta") {
          sendEvent("text_delta", { text: event.delta.text });
        }
      }

      if (event.type === "message_stop") {
        sendEvent("done", { message: "Scan complete." });
      }
    }
  } catch (err) {
    console.error("Scan error:", err);
    const isApiError = err?.status !== undefined;
    sendEvent("error", {
      message: isApiError
        ? `Anthropic API error: ${err.message}`
        : "Internal server error during scan.",
    });
  } finally {
    res.end();
  }
});

// Non-streaming fallback for simpler clients
app.post("/api/scan/sync", scanLimiter, async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return res.status(400).json({ error: "Valid query is required." });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: OSINT_SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [
        {
          role: "user",
          content: `Conduct a full OSINT investigation on this Web3 project: "${query.trim()}"`,
        },
      ],
    });

    const fullText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    res.json({ result: fullText, usage: response.usage });
  } catch (err) {
    console.error("Sync scan error:", err);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong." });
});

// ── Start Server ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🟢 CHAIN_INT Backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Scan:   POST http://localhost:${PORT}/api/scan\n`);
});