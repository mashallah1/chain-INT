import { useState, useRef } from "react";

const ANTHROPIC_KEY  = import.meta.env.VITE_ANTHROPIC_KEY  || "";
const ETHERSCAN_KEY  = import.meta.env.VITE_ETHERSCAN_KEY  || "";
const BSCSCAN_KEY    = import.meta.env.VITE_BSCSCAN_KEY    || "";
const ARBISCAN_KEY   = import.meta.env.VITE_ARBISCAN_KEY   || "";
const BASESCAN_KEY   = import.meta.env.VITE_BASESCAN_KEY   || "";
const POLYGONSCAN_KEY= import.meta.env.VITE_POLYGONSCAN_KEY|| "";

// ── Chain config ──────────────────────────────────────────────────────
const CHAINS = {
  ethereum: { label: "Ethereum",  symbol: "ETH", url: "https://api.etherscan.io/api",     key: () => ETHERSCAN_KEY,   explorer: "https://etherscan.io" },
  bsc:      { label: "BSC",       symbol: "BNB", url: "https://api.bscscan.com/api",      key: () => BSCSCAN_KEY,     explorer: "https://bscscan.com" },
  arbitrum: { label: "Arbitrum",  symbol: "ETH", url: "https://api.arbiscan.io/api",      key: () => ARBISCAN_KEY,    explorer: "https://arbiscan.io" },
  base:     { label: "Base",      symbol: "ETH", url: "https://api.basescan.org/api",     key: () => BASESCAN_KEY,    explorer: "https://basescan.org" },
  polygon:  { label: "Polygon",   symbol: "MATIC",url:"https://api.polygonscan.com/api",  key: () => POLYGONSCAN_KEY, explorer: "https://polygonscan.com" },
};

// Known mixer / sanctioned addresses
const MIXERS = new Set([
  "0x722122df12d4e14e13ac3b6895a86e84145b6967",
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b",
  "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf",
  "0xa160cdab225685da1d56aa342ad8841c3b53f291",
  "0x0836222f2b2b5a6700c204a2497ef919cc6b0be5",
  "0x8589427373d6d84e98730d7795d8f6f8731fda16",
  "0x19aa5fe80d33a56d56c78e82ea5e50e5d80b4dff",
]);

const PROJECT_SECTIONS = [
  { id: "overview",   label: "Project Overview",       icon: "◈" },
  { id: "founders",   label: "Founder Intelligence",   icon: "◉" },
  { id: "investors",  label: "Investor & VC Analysis", icon: "◎" },
  { id: "affiliates", label: "Affiliate Network",      icon: "⬡" },
  { id: "onchain",    label: "On-Chain Signals",       icon: "⬢" },
  { id: "social",     label: "Social & Community",     icon: "◈" },
  { id: "redflags",   label: "Risk & Red Flags",       icon: "⚑" },
  { id: "verdict",    label: "OSINT Verdict",          icon: "◆" },
];

const WALLET_SECTIONS = [
  { id: "entity",      label: "Entity Profile",         icon: "◉" },
  { id: "funding",     label: "Funding Source",         icon: "◈" },
  { id: "affiliates",  label: "Affiliate Wallet Map",   icon: "⬡" },
  { id: "txintel",     label: "Transaction Intelligence",icon: "⬢" },
  { id: "dumps",       label: "Token Dump Analysis",    icon: "◎" },
  { id: "risk",        label: "Risk Signals",           icon: "⚑" },
  { id: "deployer",    label: "Deployer History",       icon: "◈" },
  { id: "verdict",     label: "On-Chain Verdict",       icon: "◆" },
];

// ── Explorer fetch (browser-side) ─────────────────────────────────────
async function explorerFetch(chain, module, action, address, extra = "") {
  const cfg = CHAINS[chain];
  const key = cfg.key();
  if (!key) return null;
  try {
    const url = `${cfg.url}?module=${module}&action=${action}&address=${address}&apikey=${key}&sort=asc${extra}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.status === "1" ? data.result : null;
  } catch { return null; }
}

async function checkIsContract(address, chain) {
  const cfg = CHAINS[chain];
  const key = cfg.key();
  if (!key) return false;
  try {
    const url = `${cfg.url}?module=proxy&action=eth_getCode&address=${address}&tag=latest&apikey=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.result && data.result !== "0x";
  } catch { return false; }
}

// ── Data processors ───────────────────────────────────────────────────
function extractAffiliates(txList, address) {
  if (!Array.isArray(txList)) return { funder: null, recipients: [], senders: [] };
  const addr = address.toLowerCase();
  const firstIn = txList.find(tx => tx.to?.toLowerCase() === addr && parseFloat(tx.value) > 0);
  const funder  = firstIn ? {
    address: firstIn.from,
    ethAmount: (parseFloat(firstIn.value) / 1e18).toFixed(4),
    date: new Date(parseInt(firstIn.timeStamp) * 1000).toLocaleDateString(),
    txHash: firstIn.hash,
  } : null;

  const recMap = {}, senMap = {};
  for (const tx of txList) {
    const val = parseFloat(tx.value || 0) / 1e18;
    if (val < 0.05) continue;
    if (tx.from?.toLowerCase() === addr) {
      recMap[tx.to] = recMap[tx.to] || { address: tx.to, totalETH: 0, txCount: 0 };
      recMap[tx.to].totalETH += val; recMap[tx.to].txCount++;
    }
    if (tx.to?.toLowerCase() === addr) {
      senMap[tx.from] = senMap[tx.from] || { address: tx.from, totalETH: 0, txCount: 0 };
      senMap[tx.from].totalETH += val; senMap[tx.from].txCount++;
    }
  }
  return {
    funder,
    recipients: Object.values(recMap).sort((a,b)=>b.totalETH-a.totalETH).slice(0,8),
    senders:    Object.values(senMap).sort((a,b)=>b.totalETH-a.totalETH).slice(0,8),
  };
}

function analyzeTokenDumps(tokenTxList, address) {
  if (!Array.isArray(tokenTxList)) return [];
  const addr = address.toLowerCase();
  const map  = {};
  for (const tx of tokenTxList) {
    const sym = tx.tokenSymbol || "?";
    const dec = parseInt(tx.tokenDecimal || 18);
    const amt = parseFloat(tx.value || 0) / Math.pow(10, dec);
    if (!map[sym]) map[sym] = { symbol: sym, name: tx.tokenName, received: 0, sent: 0, contract: tx.contractAddress };
    if (tx.to?.toLowerCase()   === addr) map[sym].received += amt;
    if (tx.from?.toLowerCase() === addr) map[sym].sent     += amt;
  }
  return Object.values(map)
    .map(t => ({ ...t, dumpRatio: t.received > 0 ? +(t.sent/t.received).toFixed(2) : (t.sent > 0 ? 99 : 0) }))
    .filter(t => t.received > 0 || t.sent > 0)
    .sort((a,b) => b.dumpRatio - a.dumpRatio)
    .slice(0, 15);
}

function findMixerInteractions(txList, address) {
  if (!Array.isArray(txList)) return [];
  const addr = address.toLowerCase();
  return txList
    .filter(tx => MIXERS.has(tx.to?.toLowerCase()) || MIXERS.has(tx.from?.toLowerCase()))
    .map(tx => ({
      direction:    tx.from?.toLowerCase() === addr ? "SENT TO MIXER" : "RECEIVED FROM MIXER",
      counterparty: tx.from?.toLowerCase() === addr ? tx.to : tx.from,
      ethAmount:    (parseFloat(tx.value||0)/1e18).toFixed(4),
      date:         new Date(parseInt(tx.timeStamp)*1000).toLocaleDateString(),
      txHash:       tx.hash,
    }));
}

// ── Claude call (direct, no backend) ─────────────────────────────────
async function callClaude(systemPrompt, userContent, useWebSearch = false) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  };
  if (useWebSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
}

// ── Prompts ───────────────────────────────────────────────────────────
const PROJECT_PROMPT = `You are an elite Web3 OSINT analyst. Use web search extensively across CryptoRank, RootData, DeFiLlama, CoinGecko, LinkedIn, Twitter/X, GitHub, Crunchbase, Messari, and any relevant news.

Use EXACTLY these headers. Flag with 🔴🟡🟢. Bold key findings with **.

## PROJECT OVERVIEW
[Founding date, chain, category, status, description, token if any]
---
## FOUNDER INTELLIGENCE
[Every founder: full name, background, Twitter/LinkedIn, past projects successful AND failed, any rugs, doxxed status, verified vs claimed credentials]
---
## INVESTOR & VC ANALYSIS
[All investors/VCs, reputation tier, portfolio history, round details, valuations, any rug associations]
---
## AFFILIATE NETWORK
[Advisors, partners, exchanges, launchpads, cross-project connections, shell company patterns]
---
## ON-CHAIN SIGNALS
[Token distribution, whale concentration, unlock schedules, contract audits, TVL, deployer history]
---
## SOCIAL & COMMUNITY
[Twitter followers and growth, Discord/Telegram health, GitHub activity, bot indicators, sentiment]
---
## RISK & RED FLAGS
[ALL concerns: anon team, copied code, bad tokenomics, VC dump history, honeypot risk, regulatory]
---
## OSINT VERDICT
[Final assessment, recommendation: PASS / CAUTION / AVOID, key reasoning]

TRUST_SCORE: [0-100]`;

const WALLET_PROMPT = `You are an elite on-chain OSINT analyst using ZachXBT-style investigative methodology. You receive raw blockchain data and produce actionable intelligence.

Be extremely specific. Identify behavioral patterns. Connect dots between wallets. Call out suspicious activity clearly and directly.

Use EXACTLY these headers:

## ENTITY PROFILE
[Who/what controls this address — confidence level, type: whale/dev/vc/exchange/bot/scammer/unknown, behavioral summary]
---
## FUNDING SOURCE
[Analyze the first funder — is this wallet known? What does the funding pattern suggest? Any suspicious origins?]
---
## AFFILIATE WALLET MAP
[All connected wallets, inferred relationships, evidence of shared control or coordinated behavior across wallets]
---
## TRANSACTION INTELLIGENCE
[Behavioral patterns, timing, volume, notable transactions, bot-like vs human indicators, any coordinated activity]
---
## TOKEN DUMP ANALYSIS
[Which tokens accumulated vs sold? Dump ratios. Evidence of insider trading or coordinated dumping before announcements?]
---
## RISK SIGNALS
[Mixer/Tornado Cash interactions, sanctioned address exposure, known bad actor connections, rug wallet patterns]
---
## DEPLOYER HISTORY
[If contract: full history of this deployer — every project launched, success/failure/rug rate, behavioral patterns]
---
## ON-CHAIN VERDICT
[Final assessment, key findings, risk level: LOW / MODERATE / HIGH / CRITICAL]

RISK_SCORE: [0-100 where 100 = maximum risk / most suspicious]`;

// ── Section parsers ───────────────────────────────────────────────────
function parseProjectSections(text) {
  const MAP = {
    "PROJECT OVERVIEW": "overview", "FOUNDER INTELLIGENCE": "founders",
    "INVESTOR & VC ANALYSIS": "investors", "AFFILIATE NETWORK": "affiliates",
    "ON-CHAIN SIGNALS": "onchain", "SOCIAL & COMMUNITY": "social",
    "RISK & RED FLAGS": "redflags", "OSINT VERDICT": "verdict",
  };
  return parseSections(text, MAP, "TRUST_SCORE");
}

function parseWalletSections(text) {
  const MAP = {
    "ENTITY PROFILE": "entity", "FUNDING SOURCE": "funding",
    "AFFILIATE WALLET MAP": "affiliates", "TRANSACTION INTELLIGENCE": "txintel",
    "TOKEN DUMP ANALYSIS": "dumps", "RISK SIGNALS": "risk",
    "DEPLOYER HISTORY": "deployer", "ON-CHAIN VERDICT": "verdict",
  };
  return parseSections(text, MAP, "RISK_SCORE");
}

function parseSections(text, MAP, scoreKey) {
  const result = {};
  let cur = null, buf = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^##\s+(.+)/);
    if (m) {
      if (cur && buf.length) result[cur] = buf.join("\n").trim();
      const key = Object.keys(MAP).find(k => m[1].toUpperCase().includes(k));
      cur = key ? MAP[key] : null; buf = [];
    } else if (cur) buf.push(line);
  }
  if (cur && buf.length) result[cur] = buf.join("\n").trim();
  const sc = text.match(new RegExp(`${scoreKey}:\\s*(\\d+)`));
  if (sc) result._score = parseInt(sc[1]);
  return result;
}

// ── UI Components ─────────────────────────────────────────────────────
function RiskMeter({ score, isRisk = false }) {
  const color = isRisk
    ? (score >= 70 ? "#ff4444" : score >= 40 ? "#ffd700" : "#00ff9d")
    : (score >= 70 ? "#00ff9d" : score >= 40 ? "#ffd700" : "#ff4444");
  const label = isRisk
    ? (score >= 70 ? "HIGH RISK" : score >= 40 ? "MODERATE" : "LOW RISK")
    : (score >= 70 ? "LOW RISK"  : score >= 40 ? "MODERATE" : "HIGH RISK");
  const circ = 2 * Math.PI * 54;
  const dash = (score / 100) * circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"8px" }}>
      <svg width="120" height="120" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r="54" fill="none" stroke="#0d1f2d" strokeWidth="10"/>
        <circle cx="65" cy="65" r="54" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 65 65)"
          style={{ transition:"stroke-dasharray 1.5s cubic-bezier(0.4,0,0.2,1)", filter:`drop-shadow(0 0 8px ${color})` }}/>
        <text x="65" y="60" textAnchor="middle" fill={color} fontSize="26" fontFamily="'Space Mono',monospace" fontWeight="bold">{score}</text>
        <text x="65" y="78" textAnchor="middle" fill="#444" fontSize="8" fontFamily="'Space Mono',monospace">{isRisk ? "RISK SCORE" : "TRUST SCORE"}</text>
      </svg>
      <span style={{ color, fontFamily:"'Space Mono',monospace", fontSize:"10px", letterSpacing:"3px", fontWeight:"bold" }}>{label}</span>
    </div>
  );
}

function SectionCard({ section, content, isLoading }) {
  const [open, setOpen] = useState(true);
  const fmt = t => t
    .replace(/\*\*(.*?)\*\*/g, '<span style="color:#00ff9d;font-weight:bold">$1</span>')
    .replace(/🔴/g,'<span style="color:#ff4444">🔴</span>')
    .replace(/🟡/g,'<span style="color:#ffd700">🟡</span>')
    .replace(/🟢/g,'<span style="color:#00ff9d">🟢</span>')
    .replace(/✅/g,'<span style="color:#00ff9d">✅</span>')
    .replace(/❌/g,'<span style="color:#ff4444">❌</span>')
    .replace(/⚠️/g,'<span style="color:#ffd700">⚠️</span>')
    .replace(/##\s+(.*)/g,'<div style="color:#c8a96e;font-size:11px;letter-spacing:2px;margin:14px 0 6px;">$1</div>')
    .replace(/---/g,'<hr style="border:none;border-top:1px solid #1e2a3a;margin:12px 0"/>');

  return (
    <div style={{ border:"1px solid #1e2a3a", borderRadius:"2px", marginBottom:"2px", background:"#060d1a" }}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#00ff9d33"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="#1e2a3a"}>
      <button onClick={()=>setOpen(!open)} style={{ width:"100%", display:"flex", alignItems:"center", gap:"12px", padding:"13px 16px", background:"none", border:"none", cursor:"pointer" }}>
        <span style={{ color:"#00ff9d", fontSize:"14px" }}>{section.icon}</span>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"10px", letterSpacing:"2px", color:"#aaa", flex:1, textAlign:"left" }}>{section.label.toUpperCase()}</span>
        {isLoading && <span style={{ display:"flex", gap:"3px" }}>{[0,1,2].map(i=><span key={i} style={{ width:"4px", height:"4px", borderRadius:"50%", background:"#00ff9d", animation:`pulse 1s ${i*.2}s infinite` }}/>)}</span>}
        {!isLoading && content && <span style={{ color:"#00ff9d44", fontSize:"10px" }}>{open?"▼":"▶"}</span>}
      </button>
      {open && content && (
        <div style={{ padding:"0 16px 16px 42px" }}>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"12px", lineHeight:"1.9", color:"#8899aa", whiteSpace:"pre-wrap" }}
            dangerouslySetInnerHTML={{ __html: fmt(content) }}/>
        </div>
      )}
    </div>
  );
}

function WalletStats({ meta }) {
  if (!meta) return null;
  const stats = [
    { label:"TYPE",      value: meta.isContract ? "CONTRACT" : "WALLET" },
    { label:"BALANCE",   value: `${meta.ethBalance?.toFixed(3)} ${CHAINS[meta.chain]?.symbol}` },
    { label:"TXS",       value: meta.txCount?.toLocaleString() },
    { label:"AFFILIATES",value: meta.affiliateCount },
    { label:"MIXER",     value: meta.mixerExposure ? "⚠ DETECTED" : "CLEAN", danger: meta.mixerExposure },
  ];
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", marginBottom:"16px" }}>
      {stats.map(s => (
        <div key={s.label} style={{ padding:"8px 14px", background:"#060d1a", border:`1px solid ${s.danger ? "#ff444433" : "#1e2a3a"}`, borderRadius:"2px" }}>
          <div style={{ fontSize:"8px", color:"#2a4a3a", letterSpacing:"2px", marginBottom:"3px" }}>{s.label}</div>
          <div style={{ fontSize:"11px", color: s.danger ? "#ff4444" : "#00ff9d", fontFamily:"'Space Mono',monospace" }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
export default function App() {
  const [tab,            setTab]           = useState("project"); // "project" | "wallet"
  const [query,          setQuery]         = useState("");
  const [walletAddr,     setWalletAddr]    = useState("");
  const [selectedChain,  setSelectedChain] = useState("ethereum");
  const [isRunning,      setIsRunning]     = useState(false);
  const [sections,       setSections]      = useState({});
  const [loadingSecs,    setLoadingSecs]   = useState({});
  const [score,          setScore]         = useState(null);
  const [label,          setLabel]         = useState("");
  const [error,          setError]         = useState(null);
  const [history,        setHistory]       = useState([]);
  const [walletMeta,     setWalletMeta]    = useState(null);
  const [statusMsg,      setStatusMsg]     = useState("");

  const resetState = () => {
    setSections({}); setScore(null); setError(null);
    setWalletMeta(null); setStatusMsg("");
    const secs = tab === "project" ? PROJECT_SECTIONS : WALLET_SECTIONS;
    const l = {}; secs.forEach(s => { l[s.id] = true; }); setLoadingSecs(l);
  };

  // ── Project OSINT scan ──────────────────────────────────────────────
  const runProjectScan = async () => {
    if (!query.trim() || isRunning) return;
    if (!ANTHROPIC_KEY) { setError("Add VITE_ANTHROPIC_KEY to Vercel environment variables."); return; }
    setIsRunning(true); resetState(); setLabel(query.trim());

    try {
      const text = await callClaude(PROJECT_PROMPT,
        `Full OSINT investigation on Web3 project: "${query.trim()}". Search CryptoRank, RootData, DeFiLlama, CoinGecko, Twitter, GitHub, Crunchbase, and all relevant sources.`,
        true
      );
      const parsed = parseProjectSections(text);
      const secs = {};
      PROJECT_SECTIONS.forEach(s => { if (parsed[s.id]) secs[s.id] = parsed[s.id]; });
      setSections(secs);
      if (parsed._score !== undefined) {
        setScore(parsed._score);
        setHistory(p => [{ type:"project", name:query.trim(), score:parsed._score, time:new Date().toLocaleTimeString() }, ...p.slice(0,9)]);
      }
    } catch(e) { setError(e.message); }
    finally { setIsRunning(false); setLoadingSecs({}); }
  };

  // ── Wallet / CA on-chain scan ───────────────────────────────────────
  const runWalletScan = async () => {
    if (!walletAddr.trim() || isRunning) return;
    if (!ANTHROPIC_KEY) { setError("Add VITE_ANTHROPIC_KEY to Vercel environment variables."); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddr.trim())) { setError("Invalid address — must be 0x followed by 40 hex characters."); return; }
    if (!CHAINS[selectedChain].key()) { setError(`Add VITE_${selectedChain.toUpperCase()}_KEY (or VITE_ETHERSCAN_KEY) to Vercel environment variables.`); return; }

    setIsRunning(true); resetState(); setLabel(walletAddr.trim());
    const addr = walletAddr.trim();

    try {
      setStatusMsg("Detecting address type...");
      const isCA = await checkIsContract(addr, selectedChain);

      setStatusMsg(`${isCA ? "Contract" : "Wallet"} detected — fetching on-chain data from ${CHAINS[selectedChain].label}...`);

      const [txList, tokenTxList, balance] = await Promise.all([
        explorerFetch(selectedChain, "account", "txlist",  addr, "&startblock=0&endblock=99999999"),
        explorerFetch(selectedChain, "account", "tokentx", addr, "&startblock=0&endblock=99999999"),
        explorerFetch(selectedChain, "account", "balance", addr),
      ]);

      setStatusMsg("Tracing affiliates and analyzing patterns...");
      const affiliates = extractAffiliates(txList, addr);
      const tokenDumps = analyzeTokenDumps(tokenTxList, addr);
      const mixerTxns  = findMixerInteractions(txList, addr);
      const ethBal     = parseFloat(balance || 0) / 1e18;
      const txCount    = txList?.length || 0;
      const firstTx    = txList?.[0];
      const lastTx     = txList?.[txList?.length - 1];

      // Contract-specific: get deployer history
      let deployerData = null;
      if (isCA) {
        const creation = await explorerFetch(selectedChain, "contract", "getcontractcreation", addr);
        if (creation?.[0]?.contractCreator) {
          const depAddr = creation[0].contractCreator;
          const depTxns = await explorerFetch(selectedChain, "account", "txlist", depAddr, "&startblock=0&endblock=99999999");
          const otherContracts = depTxns
            ?.filter(tx => tx.contractAddress && tx.contractAddress.toLowerCase() !== addr.toLowerCase())
            .map(tx => tx.contractAddress)
            .filter((v,i,a) => a.indexOf(v) === i).slice(0, 15) || [];
          deployerData = { address: depAddr, otherContracts };
        }
      }

      setWalletMeta({
        address: addr, chain: selectedChain, isContract: isCA,
        ethBalance: ethBal, txCount,
        affiliateCount: affiliates.recipients.length + affiliates.senders.length,
        mixerExposure: mixerTxns.length > 0,
      });

      setStatusMsg("Running AI intelligence analysis...");

      const context = `
ADDRESS: ${addr}
CHAIN: ${CHAINS[selectedChain].label.toUpperCase()}
TYPE: ${isCA ? "SMART CONTRACT" : "EOA WALLET"}
BALANCE: ${ethBal.toFixed(4)} ${CHAINS[selectedChain].symbol}
TOTAL TRANSACTIONS: ${txCount}
WALLET AGE: ${firstTx ? new Date(parseInt(firstTx.timeStamp)*1000).toLocaleDateString() : "unknown"} → ${lastTx ? new Date(parseInt(lastTx.timeStamp)*1000).toLocaleDateString() : "unknown"}

=== FUNDING SOURCE (first wallet to send ETH here) ===
${JSON.stringify(affiliates.funder, null, 2)}

=== TOP RECIPIENTS (this address sent significant ETH to) ===
${JSON.stringify(affiliates.recipients, null, 2)}

=== TOP SENDERS (sent significant ETH to this address) ===
${JSON.stringify(affiliates.senders, null, 2)}

=== TOKEN ACTIVITY (dumpRatio = sold/received; 99 = sold without receiving = insider/pre-mine) ===
${JSON.stringify(tokenDumps, null, 2)}

=== MIXER / SANCTIONED INTERACTIONS ===
${mixerTxns.length ? JSON.stringify(mixerTxns, null, 2) : "None detected — clean"}

${deployerData ? `=== DEPLOYER WALLET ===
Address: ${deployerData.address}
Other contracts deployed by same wallet: ${JSON.stringify(deployerData.otherContracts, null, 2)}` : ""}

=== RECENT 20 TRANSACTIONS ===
${JSON.stringify(txList?.slice(-20).map(tx => ({
  from: tx.from?.slice(0,10)+"...",
  to: (tx.to||"contract_creation")?.slice(0,10)+"...",
  eth: (parseFloat(tx.value||0)/1e18).toFixed(4),
  date: new Date(parseInt(tx.timeStamp)*1000).toLocaleDateString(),
  status: tx.isError==="1"?"FAILED":"ok",
})), null, 2)}
`;

      const text = await callClaude(WALLET_PROMPT, `Analyze this address and produce a full intelligence report:\n\n${context}`);
      const parsed = parseWalletSections(text);
      const secs = {};
      WALLET_SECTIONS.forEach(s => { if (parsed[s.id]) secs[s.id] = parsed[s.id]; });
      setSections(secs);
      if (parsed._score !== undefined) {
        setScore(parsed._score);
        setHistory(p => [{ type:"wallet", name:addr.slice(0,10)+"...", score:parsed._score, time:new Date().toLocaleTimeString(), isRisk:true }, ...p.slice(0,9)]);
      }
    } catch(e) { setError(e.message); }
    finally { setIsRunning(false); setLoadingSecs({}); setStatusMsg(""); }
  };

  const handleScan = () => tab === "project" ? runProjectScan() : runWalletScan();
  const hasResults = Object.keys(sections).length > 0;
  const currentSections = tab === "project" ? PROJECT_SECTIONS : WALLET_SECTIONS;

  return (
    <div style={{ minHeight:"100vh", background:"#030810", fontFamily:"'IBM Plex Mono',monospace", color:"#8899aa" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes scanline{0%{top:-2px}100%{top:100vh}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glitch{0%,90%,100%{text-shadow:none}92%{text-shadow:-2px 0 #ff0044,2px 0 #00ffff}94%{text-shadow:none}96%{text-shadow:2px 0 #ff0044,-2px 0 #00ffff}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#030810}::-webkit-scrollbar-thumb{background:#1e2a3a}
        input::placeholder,select::placeholder{color:#1e3a2a}
        .scan-btn:not(:disabled):hover{background:#00ff9d!important;color:#030810!important}
        .tab-btn:hover{color:#00ff9d!important}
        .ex-btn:hover{border-color:#00ff9d44!important;color:#00ff9d!important}
      `}</style>

      <div style={{ position:"fixed", left:0, right:0, height:"2px", background:"linear-gradient(transparent,#00ff9d22,transparent)", animation:"scanline 5s linear infinite", pointerEvents:"none", zIndex:999 }}/>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #0d1f2d", padding:"16px 24px", display:"flex", alignItems:"center", gap:"16px" }}>
        <div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"18px", fontWeight:"bold", color:"#00ff9d", letterSpacing:"4px", animation:"glitch 7s infinite" }}>◆ CHAIN_INT</div>
          <div style={{ fontSize:"8px", letterSpacing:"3px", color:"#1a3a2a", marginTop:"2px" }}>WEB3 OSINT INTELLIGENCE PLATFORM</div>
        </div>
        {/* Tabs */}
        <div style={{ display:"flex", gap:"2px", marginLeft:"24px", background:"#060d1a", padding:"3px", borderRadius:"3px", border:"1px solid #1e2a3a" }}>
          {[
            { id:"project", label:"◈ PROJECT SCAN" },
            { id:"wallet",  label:"⬢ WALLET / CA" },
          ].map(t => (
            <button key={t.id} className="tab-btn" onClick={()=>{ setTab(t.id); setSections({}); setScore(null); setError(null); setStatusMsg(""); }}
              style={{ padding:"7px 16px", background:tab===t.id?"#00ff9d1a":"none", border:tab===t.id?"1px solid #00ff9d44":"1px solid transparent", borderRadius:"2px", color:tab===t.id?"#00ff9d":"#3a5a4a", fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"2px", cursor:"pointer", transition:"all 0.2s" }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:"20px" }}>
          {[["SOURCES","14+"],["DATA","LIVE"],["MODE",tab==="wallet"?"ON-CHAIN":"DEEP SCAN"]].map(([l,v])=>(
            <div key={l} style={{ textAlign:"right" }}>
              <div style={{ fontSize:"7px", color:"#1a3a2a", letterSpacing:"2px" }}>{l}</div>
              <div style={{ fontSize:"10px", color:"#00ff9d", fontFamily:"'Space Mono',monospace" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", height:"calc(100vh - 66px)" }}>
        {/* Sidebar */}
        <div style={{ width:"200px", borderRight:"1px solid #0d1f2d", padding:"16px 0", flexShrink:0, overflowY:"auto" }}>
          <div style={{ padding:"0 12px 8px", fontSize:"7px", letterSpacing:"3px", color:"#1a3a2a" }}>{tab==="wallet" ? "CHAIN EXPLORERS" : "ACTIVE SOURCES"}</div>
          {tab === "project"
            ? ["CryptoRank","RootData","DeFiLlama","CoinGecko","LinkedIn","Twitter/X","GitHub","Crunchbase","Messari","On-Chain","OpenSanctions","OFAC","SEC EDGAR","Wayback Machine"].map((src,i) => (
                <div key={src} style={{ padding:"4px 12px", fontSize:"9px", color:isRunning?"#2a6a3a":"#1e3a2a", display:"flex", alignItems:"center", gap:"7px" }}>
                  <span style={{ width:"4px", height:"4px", borderRadius:"50%", background:isRunning?"#00ff9d":"#1a2a1a", boxShadow:isRunning?"0 0 5px #00ff9d":"none", animation:isRunning?`pulse 1.5s ${(i*.1).toFixed(1)}s infinite`:"none", flexShrink:0 }}/>
                  {src}
                </div>
              ))
            : Object.entries(CHAINS).map(([id, cfg], i) => {
                const active = cfg.key();
                return (
                  <div key={id} onClick={()=>setSelectedChain(id)} style={{ padding:"8px 12px", cursor:"pointer", borderLeft:selectedChain===id?"2px solid #00ff9d":"2px solid transparent", background:selectedChain===id?"#06100a":"none", transition:"all 0.2s" }}>
                    <div style={{ fontSize:"10px", color:selectedChain===id?"#00ff9d":"#3a5a4a", fontFamily:"'Space Mono',monospace" }}>{cfg.label}</div>
                    <div style={{ fontSize:"8px", color:active?"#2a6a3a":"#2a2a2a", marginTop:"2px" }}>{active ? "● API READY" : "○ NO KEY"}</div>
                  </div>
                );
              })
          }

          {history.length > 0 && (
            <>
              <div style={{ padding:"16px 12px 6px", fontSize:"7px", letterSpacing:"3px", color:"#1a3a2a" }}>HISTORY</div>
              {history.map((h,i) => (
                <div key={i} style={{ padding:"7px 12px", borderLeft:i===0?"2px solid #00ff9d33":"2px solid transparent" }}>
                  <div style={{ fontSize:"9px", color:"#666", display:"flex", gap:"4px", alignItems:"center" }}>
                    <span style={{ color:h.type==="wallet"?"#00aaff":"#00ff9d", fontSize:"8px" }}>{h.type==="wallet"?"⬢":"◈"}</span>
                    {h.name}
                  </div>
                  <div style={{ fontSize:"8px", color:h.isRisk ? (h.score>=70?"#ff4444":h.score>=40?"#ffd700":"#00ff9d") : (h.score>=70?"#00ff9d":h.score>=40?"#ffd700":"#ff4444"), marginTop:"2px" }}>
                    SCORE {h.score} · {h.time}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Main */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

          {/* Search area */}
          <div style={{ marginBottom:"20px" }}>
            {tab === "project" ? (
              <>
                <div style={{ fontSize:"8px", letterSpacing:"3px", color:"#1a3a2a", marginBottom:"8px" }}>TARGET // PROJECT NAME · TOKEN TICKER</div>
                <div style={{ display:"flex", gap:"8px" }}>
                  <div style={{ flex:1, position:"relative" }}>
                    <span style={{ position:"absolute", left:"12px", top:"50%", transform:"translateY(-50%)", color:"#00ff9d22" }}>⌕</span>
                    <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleScan()}
                      placeholder="e.g. Eigenlayer · BLUR · Hyperliquid"
                      style={{ width:"100%", padding:"12px 12px 12px 32px", background:"#060d1a", border:"1px solid #1e2a3a", borderRadius:"2px", color:"#ccc", fontFamily:"'IBM Plex Mono',monospace", fontSize:"13px", outline:"none" }}
                      onFocus={e=>e.target.style.borderColor="#00ff9d44"} onBlur={e=>e.target.style.borderColor="#1e2a3a"}/>
                  </div>
                  <button className="scan-btn" onClick={handleScan} disabled={isRunning||!query.trim()}
                    style={{ padding:"12px 22px", background:"#00ff9d0d", border:"1px solid #00ff9d44", borderRadius:"2px", color:"#00ff9d", fontFamily:"'Space Mono',monospace", fontSize:"10px", letterSpacing:"2px", cursor:isRunning||!query.trim()?"not-allowed":"pointer", opacity:isRunning?.5:1, whiteSpace:"nowrap", transition:"all 0.2s" }}>
                    {isRunning ? "SCANNING..." : "▶ SCAN"}
                  </button>
                </div>
                <div style={{ display:"flex", gap:"6px", marginTop:"8px", flexWrap:"wrap" }}>
                  {["Eigenlayer","Blur.io","Polymarket","Hyperliquid","zkSync","Usual"].map(ex=>(
                    <button key={ex} className="ex-btn" onClick={()=>setQuery(ex)} style={{ padding:"4px 10px", background:"none", border:"1px solid #1e2a3a", borderRadius:"2px", color:"#2a4a3a", fontFamily:"'IBM Plex Mono',monospace", fontSize:"9px", cursor:"pointer", transition:"all 0.2s" }}>{ex}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:"8px", letterSpacing:"3px", color:"#1a3a2a", marginBottom:"8px" }}>TARGET // WALLET ADDRESS · CONTRACT ADDRESS (0x...)</div>
                <div style={{ display:"flex", gap:"8px" }}>
                  <div style={{ flex:1, position:"relative" }}>
                    <span style={{ position:"absolute", left:"12px", top:"50%", transform:"translateY(-50%)", color:"#00aaff22" }}>⬢</span>
                    <input value={walletAddr} onChange={e=>setWalletAddr(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleScan()}
                      placeholder="0x742d35Cc6634C0532925a3b8D4C9c0F5b6D1a2b3"
                      style={{ width:"100%", padding:"12px 12px 12px 32px", background:"#060d1a", border:"1px solid #1e2a3a", borderRadius:"2px", color:"#ccc", fontFamily:"'IBM Plex Mono',monospace", fontSize:"12px", outline:"none" }}
                      onFocus={e=>e.target.style.borderColor="#00aaff44"} onBlur={e=>e.target.style.borderColor="#1e2a3a"}/>
                  </div>
                  {/* Chain selector */}
                  <select value={selectedChain} onChange={e=>setSelectedChain(e.target.value)}
                    style={{ padding:"12px", background:"#060d1a", border:"1px solid #1e2a3a", borderRadius:"2px", color:"#00ff9d", fontFamily:"'Space Mono',monospace", fontSize:"10px", cursor:"pointer", outline:"none" }}>
                    {Object.entries(CHAINS).map(([id,cfg]) => (
                      <option key={id} value={id} style={{ background:"#060d1a" }}>{cfg.label}</option>
                    ))}
                  </select>
                  <button className="scan-btn" onClick={handleScan} disabled={isRunning||!walletAddr.trim()}
                    style={{ padding:"12px 22px", background:"#00aaff0d", border:"1px solid #00aaff44", borderRadius:"2px", color:"#00aaff", fontFamily:"'Space Mono',monospace", fontSize:"10px", letterSpacing:"2px", cursor:isRunning||!walletAddr.trim()?"not-allowed":"pointer", opacity:isRunning?.5:1, whiteSpace:"nowrap", transition:"all 0.2s" }}>
                    {isRunning ? "TRACING..." : "▶ TRACE"}
                  </button>
                </div>
                <div style={{ marginTop:"8px", fontSize:"9px", color:"#1a3a2a" }}>
                  Paste any wallet or contract address → automatic chain detection, affiliate tracing, dump analysis, mixer detection
                </div>
              </>
            )}
          </div>

          {error && (
            <div style={{ padding:"10px 14px", background:"#1a0606", border:"1px solid #ff444433", borderRadius:"2px", color:"#ff6666", fontSize:"11px", marginBottom:"16px" }}>⚠ {error}</div>
          )}

          {(isRunning || statusMsg) && (
            <div style={{ padding:"10px 14px", background:"#060d1a", border:"1px solid #00ff9d22", borderRadius:"2px", marginBottom:"16px", display:"flex", alignItems:"center", gap:"10px" }}>
              <span style={{ display:"flex", gap:"3px" }}>{[0,1,2].map(i=><span key={i} style={{ width:"4px", height:"4px", borderRadius:"50%", background:tab==="wallet"?"#00aaff":"#00ff9d", animation:`pulse 1s ${i*.2}s infinite` }}/>)}</span>
              <span style={{ fontSize:"9px", letterSpacing:"2px", color:tab==="wallet"?"#00aaff":"#00ff9d" }}>
                {statusMsg || (tab==="wallet" ? "TRACING ON-CHAIN ACTIVITY..." : "DEEP SCAN IN PROGRESS — QUERYING 14 INTELLIGENCE SOURCES")}
              </span>
            </div>
          )}

          {hasResults && (
            <div style={{ animation:"fadeIn 0.5s ease" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"16px" }}>
                <div>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"12px", color:"#ccc", letterSpacing:"2px" }}>
                    {tab === "wallet" ? "ON-CHAIN INTELLIGENCE:" : "INTELLIGENCE REPORT:"}{" "}
                    <span style={{ color: tab==="wallet" ? "#00aaff" : "#00ff9d" }}>{label.length > 20 ? label.slice(0,18)+"..." : label.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize:"8px", color:"#1a3a2a", marginTop:"4px" }}>GENERATED {new Date().toUTCString().toUpperCase()}</div>
                  {tab === "wallet" && <div style={{ marginTop:"6px" }}><a href={`${CHAINS[selectedChain].explorer}/address/${label}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:"8px", color:"#00aaff44", letterSpacing:"1px" }}>↗ VIEW ON {CHAINS[selectedChain].label.toUpperCase()}</a></div>}
                </div>
                {score !== null && <RiskMeter score={score} isRisk={tab==="wallet"}/>}
              </div>
              {tab === "wallet" && <WalletStats meta={walletMeta}/>}
            </div>
          )}

          {currentSections.map(section => {
            const content = sections[section.id];
            const loading = loadingSecs[section.id];
            if (!content && !loading) return null;
            return (
              <div key={section.id} style={{ animation:content?"fadeIn 0.4s ease":"none" }}>
                <SectionCard section={section} content={content} isLoading={loading&&!content}/>
              </div>
            );
          })}

          {!hasResults && !isRunning && !error && (
            <div style={{ textAlign:"center", padding:"60px 20px", animation:"fadeIn 0.6s ease" }}>
              <div style={{ fontSize:"44px", marginBottom:"14px", opacity:0.06, color: tab==="wallet"?"#00aaff":"#00ff9d" }}>{tab==="wallet"?"⬢":"◆"}</div>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"10px", color:"#1a3a2a", letterSpacing:"4px", marginBottom:"10px" }}>
                {tab==="wallet" ? "AWAITING WALLET / CONTRACT ADDRESS" : "AWAITING TARGET"}
              </div>
              <div style={{ fontSize:"10px", color:"#1a2a1a", maxWidth:"360px", margin:"0 auto", lineHeight:2 }}>
                {tab==="wallet"
                  ? "Paste any 0x address to trace funding sources, affiliate wallets, token dumps, mixer interactions, and deployer history."
                  : "Enter any Web3 project name or token ticker to begin a comprehensive OSINT investigation."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
