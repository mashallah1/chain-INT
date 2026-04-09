import { useState, useRef } from "react";

// ── Anthropic API key from Vercel env var ─────────────────────────────
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";

const SECTIONS = [
  { id: "overview",   label: "Project Overview",       icon: "◈" },
  { id: "founders",   label: "Founder Intelligence",   icon: "◉" },
  { id: "investors",  label: "Investor & VC Analysis",  icon: "◎" },
  { id: "affiliates", label: "Affiliate Network",      icon: "⬡" },
  { id: "onchain",    label: "On-Chain Signals",        icon: "⬢" },
  { id: "social",     label: "Social & Community",     icon: "◈" },
  { id: "redflags",   label: "Risk & Red Flags",       icon: "⚑" },
  { id: "verdict",    label: "OSINT Verdict",          icon: "◆" },
];

const SYSTEM_PROMPT = `You are an elite Web3 OSINT analyst with deep expertise in blockchain intelligence, crypto project due diligence, and on-chain forensics.

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

Structure your response using EXACTLY these headers. Flag red flags with 🔴, yellow flags with 🟡, positive signals with 🟢. Use **bold** for key findings.

## PROJECT OVERVIEW
[Founding date, chain, category, current status, brief description, token if any]

---

## FOUNDER INTELLIGENCE
[Every founder/co-founder: full name, background, LinkedIn, Twitter, past projects both successful and failed, any rugs or controversies, doxxed status]

---

## INVESTOR & VC ANALYSIS
[All investors/VCs, their tier/reputation, portfolio history, round details, valuations if known]

---

## AFFILIATE NETWORK
[Advisors, partners, exchanges, launchpads, associated wallets, cross-project connections]

---

## ON-CHAIN SIGNALS
[Token distribution, whale concentration, unlock schedules, smart contract audits, TVL, unusual wallet activity]

---

## SOCIAL & COMMUNITY
[Twitter followers and growth pattern, Telegram/Discord health, GitHub commits, media coverage, bot activity indicators]

---

## RISK & RED FLAGS
[Comprehensive list of ALL concerns: anonymous team, copied code, suspicious tokenomics, VC dump history, honeypot risk, regulatory issues]

---

## OSINT VERDICT
[Final assessment with a TRUST SCORE from 0-100, recommendation: PASS / CAUTION / AVOID, and key reasoning]

At the very end output this exact line:
TRUST_SCORE: [0-100]`;

// ── Risk Meter ────────────────────────────────────────────────────────
function RiskMeter({ score }) {
  const color = score >= 70 ? "#00ff9d" : score >= 40 ? "#ffd700" : "#ff4444";
  const label = score >= 70 ? "LOW RISK" : score >= 40 ? "MODERATE RISK" : "HIGH RISK";
  const circ  = 2 * Math.PI * 54;
  const dash  = (score / 100) * circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"8px" }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r="54" fill="none" stroke="#1a1a2e" strokeWidth="10"/>
        <circle cx="65" cy="65" r="54" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 65 65)"
          style={{ transition:"stroke-dasharray 1.5s cubic-bezier(0.4,0,0.2,1)", filter:`drop-shadow(0 0 8px ${color})` }}
        />
        <text x="65" y="60" textAnchor="middle" fill={color} fontSize="26" fontFamily="'Space Mono',monospace" fontWeight="bold">{score}</text>
        <text x="65" y="78" textAnchor="middle" fill="#666" fontSize="9" fontFamily="'Space Mono',monospace">TRUST SCORE</text>
      </svg>
      <span style={{ color, fontFamily:"'Space Mono',monospace", fontSize:"11px", letterSpacing:"3px", fontWeight:"bold" }}>{label}</span>
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────
function SectionCard({ section, content, isLoading }) {
  const [expanded, setExpanded] = useState(true);
  const fmt = (t) => t
    .replace(/\*\*(.*?)\*\*/g, '<span style="color:#00ff9d;font-weight:bold">$1</span>')
    .replace(/🔴/g,'<span style="color:#ff4444">🔴</span>')
    .replace(/🟡/g,'<span style="color:#ffd700">🟡</span>')
    .replace(/🟢/g,'<span style="color:#00ff9d">🟢</span>')
    .replace(/✅/g,'<span style="color:#00ff9d">✅</span>')
    .replace(/❌/g,'<span style="color:#ff4444">❌</span>')
    .replace(/##\s+(.*)/g,'<div style="color:#c8a96e;font-size:11px;letter-spacing:2px;margin:14px 0 6px;font-family:Space Mono,monospace">$1</div>')
    .replace(/---/g,'<hr style="border:none;border-top:1px solid #1e2a3a;margin:12px 0"/>');

  return (
    <div style={{ border:"1px solid #1e2a3a", borderRadius:"2px", marginBottom:"2px", background:"#060d1a", overflow:"hidden" }}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#00ff9d33"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="#1e2a3a"}>
      <button onClick={()=>setExpanded(!expanded)} style={{ width:"100%", display:"flex", alignItems:"center", gap:"12px", padding:"14px 18px", background:"none", border:"none", cursor:"pointer" }}>
        <span style={{ color:"#00ff9d", fontSize:"16px", fontFamily:"monospace" }}>{section.icon}</span>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"11px", letterSpacing:"2px", color:"#aaa", flex:1, textAlign:"left" }}>
          {section.label.toUpperCase()}
        </span>
        {isLoading && (
          <span style={{ display:"flex", gap:"3px" }}>
            {[0,1,2].map(i=>(
              <span key={i} style={{ width:"4px", height:"4px", borderRadius:"50%", background:"#00ff9d", animation:`pulse 1s ${i*0.2}s infinite` }}/>
            ))}
          </span>
        )}
        {!isLoading && content && (
          <span style={{ color:"#00ff9d", fontSize:"10px" }}>{expanded?"▼":"▶"}</span>
        )}
      </button>
      {expanded && content && (
        <div style={{ padding:"0 18px 18px 44px" }}>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"12.5px", lineHeight:"1.9", color:"#8899aa", whiteSpace:"pre-wrap" }}
            dangerouslySetInnerHTML={{ __html: fmt(content) }}/>
        </div>
      )}
    </div>
  );
}

// ── Parse text into section buckets ──────────────────────────────────
function parseIntoSections(text) {
  const MAP = {
    "PROJECT OVERVIEW":      "overview",
    "FOUNDER INTELLIGENCE":  "founders",
    "INVESTOR & VC ANALYSIS":"investors",
    "AFFILIATE NETWORK":     "affiliates",
    "ON-CHAIN SIGNALS":      "onchain",
    "SOCIAL & COMMUNITY":    "social",
    "RISK & RED FLAGS":      "redflags",
    "OSINT VERDICT":         "verdict",
  };
  const result = {};
  let cur = null, buf = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^##\s+(.+)/);
    if (m) {
      if (cur && buf.length) result[cur] = buf.join("\n").trim();
      const key = Object.keys(MAP).find(k => m[1].toUpperCase().includes(k));
      cur = key ? MAP[key] : null;
      buf = [];
    } else if (cur) buf.push(line);
  }
  if (cur && buf.length) result[cur] = buf.join("\n").trim();
  const sc = text.match(/TRUST_SCORE:\s*(\d+)/);
  if (sc) result._score = parseInt(sc[1]);
  return result;
}

// ── Main App ──────────────────────────────────────────────────────────
export default function OSINTPlatform() {
  const [query,          setQuery]          = useState("");
  const [isRunning,      setIsRunning]      = useState(false);
  const [sections,       setSections]       = useState({});
  const [loadingSections,setLoadingSections]= useState({});
  const [trustScore,     setTrustScore]     = useState(null);
  const [projectName,    setProjectName]    = useState("");
  const [error,          setError]          = useState(null);
  const [scanned,        setScanned]        = useState([]);
  const rawRef = useRef("");

  const runOSINT = async () => {
    if (!query.trim() || isRunning) return;

    if (!ANTHROPIC_KEY) {
      setError("API key not configured. Add VITE_ANTHROPIC_KEY to your Vercel environment variables.");
      return;
    }

    setIsRunning(true);
    setError(null);
    setSections({});
    setTrustScore(null);
    rawRef.current = "";
    setProjectName(query.trim());
    const loading = {};
    SECTIONS.forEach(s => { loading[s.id] = true; });
    setLoadingSections(loading);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `Conduct a full OSINT investigation on this Web3 project: "${query.trim()}"\n\nSearch extensively across CryptoRank, RootData, DeFiLlama, CoinGecko, LinkedIn, Twitter, GitHub, and any other relevant sources. Find real data on founders, investors, team history, on-chain activity, and any red flags. Be thorough and specific.`
          }]
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${response.status}`);
      }

      const data = await response.json();
      const fullText = data.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");

      const parsed = parseIntoSections(fullText);
      const newSections = {};
      SECTIONS.forEach(s => { if (parsed[s.id]) newSections[s.id] = parsed[s.id]; });
      setSections(newSections);
      if (parsed._score !== undefined) {
        setTrustScore(parsed._score);
        setScanned(prev => [
          { name: query.trim(), score: parsed._score, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 9)
        ]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRunning(false);
      setLoadingSections({});
    }
  };

  const hasResults = Object.keys(sections).length > 0;

  return (
    <div style={{ minHeight:"100vh", background:"#030810", fontFamily:"'IBM Plex Mono',monospace", color:"#8899aa" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes scanline{0%{top:-2px}100%{top:100vh}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glitch{0%,90%,100%{text-shadow:none}92%{text-shadow:-2px 0 #ff0044,2px 0 #00ffff}94%{text-shadow:none}96%{text-shadow:2px 0 #ff0044,-2px 0 #00ffff}98%{text-shadow:none}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#030810}::-webkit-scrollbar-thumb{background:#1e2a3a}
        input::placeholder{color:#1e3a2a}
        .scan-btn:not(:disabled):hover{background:#00ff9d!important;color:#030810!important}
        .ex-btn:hover{border-color:#00ff9d44!important;color:#00ff9d!important}
      `}</style>

      {/* Scanline */}
      <div style={{ position:"fixed", left:0, right:0, height:"2px", background:"linear-gradient(transparent,#00ff9d22,transparent)", animation:"scanline 5s linear infinite", pointerEvents:"none", zIndex:999 }}/>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #0d1f2d", padding:"18px 28px", display:"flex", alignItems:"center", gap:"20px" }}>
        <div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"20px", fontWeight:"bold", color:"#00ff9d", letterSpacing:"4px", animation:"glitch 7s infinite" }}>◆ CHAIN_INT</div>
          <div style={{ fontSize:"9px", letterSpacing:"3px", color:"#1a3a2a", marginTop:"3px" }}>WEB3 OSINT INTELLIGENCE PLATFORM // DEEP SCAN ENGINE</div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:"24px" }}>
          {[["SOURCES","14+"],["DATA","LIVE"],["MODE","DEEP SCAN"]].map(([l,v])=>(
            <div key={l} style={{ textAlign:"right" }}>
              <div style={{ fontSize:"8px", color:"#1a3a2a", letterSpacing:"2px" }}>{l}</div>
              <div style={{ fontSize:"11px", color:"#00ff9d", fontFamily:"'Space Mono',monospace" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", height:"calc(100vh - 70px)" }}>
        {/* Sidebar */}
        <div style={{ width:"210px", borderRight:"1px solid #0d1f2d", padding:"18px 0", flexShrink:0, overflowY:"auto" }}>
          <div style={{ padding:"0 14px 10px", fontSize:"8px", letterSpacing:"3px", color:"#1a3a2a" }}>ACTIVE SOURCES</div>
          {["CryptoRank","RootData","DeFiLlama","CoinGecko","LinkedIn","Twitter/X","GitHub","Crunchbase","Messari","On-Chain","OpenSanctions","OFAC","SEC EDGAR","Wayback Machine"].map((src,i)=>(
            <div key={src} style={{ padding:"5px 14px", fontSize:"10px", color:isRunning?"#2a6a3a":"#1e3a2a", display:"flex", alignItems:"center", gap:"8px" }}>
              <span style={{ width:"5px", height:"5px", borderRadius:"50%", background:isRunning?"#00ff9d":"#1a2a1a", boxShadow:isRunning?"0 0 6px #00ff9d":"none", animation:isRunning?`pulse 1.5s ${(i*0.1).toFixed(1)}s infinite`:"none", flexShrink:0 }}/>
              {src}
            </div>
          ))}
          {scanned.length > 0 && (
            <>
              <div style={{ padding:"18px 14px 8px", fontSize:"8px", letterSpacing:"3px", color:"#1a3a2a" }}>SCAN HISTORY</div>
              {scanned.map((s,i)=>(
                <div key={i} onClick={()=>setQuery(s.name)} style={{ padding:"8px 14px", cursor:"pointer", borderLeft:i===0?"2px solid #00ff9d":"2px solid transparent", background:i===0?"#06100a":"none" }}>
                  <div style={{ fontSize:"10px", color:"#aaa" }}>{s.name}</div>
                  <div style={{ fontSize:"9px", color:s.score>=70?"#00ff9d":s.score>=40?"#ffd700":"#ff4444", marginTop:"2px" }}>SCORE {s.score} · {s.time}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Main */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 28px" }}>
          {/* Search */}
          <div style={{ marginBottom:"24px" }}>
            <div style={{ fontSize:"9px", letterSpacing:"3px", color:"#1a3a2a", marginBottom:"10px" }}>TARGET // PROJECT NAME · TOKEN TICKER · CONTRACT ADDRESS</div>
            <div style={{ display:"flex", gap:"10px" }}>
              <div style={{ flex:1, position:"relative" }}>
                <span style={{ position:"absolute", left:"13px", top:"50%", transform:"translateY(-50%)", color:"#00ff9d33", fontSize:"14px" }}>⌕</span>
                <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runOSINT()}
                  placeholder="e.g. Eigenlayer · BLUR · 0x1234...abcd"
                  style={{ width:"100%", padding:"13px 13px 13px 34px", background:"#060d1a", border:"1px solid #1e2a3a", borderRadius:"2px", color:"#ccc", fontFamily:"'IBM Plex Mono',monospace", fontSize:"13px", outline:"none" }}
                  onFocus={e=>e.target.style.borderColor="#00ff9d44"}
                  onBlur={e=>e.target.style.borderColor="#1e2a3a"}
                />
              </div>
              <button className="scan-btn" onClick={runOSINT} disabled={isRunning||!query.trim()} style={{ padding:"13px 24px", background:"#00ff9d0d", border:"1px solid #00ff9d44", borderRadius:"2px", color:"#00ff9d", fontFamily:"'Space Mono',monospace", fontSize:"11px", letterSpacing:"2px", cursor:isRunning||!query.trim()?"not-allowed":"pointer", opacity:isRunning?0.5:1, whiteSpace:"nowrap", transition:"all 0.2s" }}>
                {isRunning ? "SCANNING..." : "▶ INITIATE SCAN"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ padding:"12px 16px", background:"#1a0606", border:"1px solid #ff444433", borderRadius:"2px", color:"#ff6666", fontSize:"11px", marginBottom:"20px" }}>
              ⚠ ERROR: {error}
            </div>
          )}

          {isRunning && (
            <div style={{ padding:"12px 16px", background:"#060d1a", border:"1px solid #00ff9d22", borderRadius:"2px", marginBottom:"20px", display:"flex", alignItems:"center", gap:"12px" }}>
              <span style={{ display:"flex", gap:"4px" }}>
                {[0,1,2].map(i=><span key={i} style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#00ff9d", animation:`pulse 1s ${i*0.2}s infinite` }}/>)}
              </span>
              <span style={{ fontSize:"10px", letterSpacing:"2px", color:"#00ff9d" }}>DEEP SCAN IN PROGRESS — QUERYING 14 INTELLIGENCE SOURCES</span>
            </div>
          )}

          {hasResults && (
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"20px", animation:"fadeIn 0.5s ease" }}>
              <div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"13px", color:"#ccc", letterSpacing:"2px" }}>
                  INTELLIGENCE REPORT: <span style={{ color:"#00ff9d" }}>{projectName.toUpperCase()}</span>
                </div>
                <div style={{ fontSize:"9px", color:"#1a3a2a", letterSpacing:"2px", marginTop:"5px" }}>GENERATED {new Date().toUTCString().toUpperCase()}</div>
              </div>
              {trustScore !== null && <RiskMeter score={trustScore}/>}
            </div>
          )}

          {SECTIONS.map(section=>{
            const content = sections[section.id];
            const loading = loadingSections[section.id];
            if (!content && !loading) return null;
            return (
              <div key={section.id} style={{ animation:content?"fadeIn 0.4s ease":"none" }}>
                <SectionCard section={section} content={content} isLoading={loading&&!content}/>
              </div>
            );
          })}

          {!hasResults && !isRunning && !error && (
            <div style={{ textAlign:"center", padding:"70px 20px", animation:"fadeIn 0.6s ease" }}>
              <div style={{ fontSize:"52px", marginBottom:"18px", opacity:0.08, color:"#00ff9d" }}>◆</div>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"11px", color:"#1a3a2a", letterSpacing:"4px", marginBottom:"12px" }}>AWAITING TARGET</div>
              <div style={{ fontSize:"11px", color:"#1a2a1a", maxWidth:"380px", margin:"0 auto", lineHeight:2 }}>
                Enter any Web3 project name, token ticker, or contract address to begin a comprehensive OSINT investigation.
              </div>
              <div style={{ marginTop:"28px", display:"flex", flexWrap:"wrap", gap:"8px", justifyContent:"center" }}>
                {["Eigenlayer","Blur.io","Polymarket","Hyperliquid","zkSync","Usual Protocol"].map(ex=>(
                  <button key={ex} className="ex-btn" onClick={()=>setQuery(ex)} style={{ padding:"6px 14px", background:"none", border:"1px solid #1e2a3a", borderRadius:"2px", color:"#2a4a3a", fontFamily:"'IBM Plex Mono',monospace", fontSize:"10px", cursor:"pointer", transition:"all 0.2s" }}>{ex}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
