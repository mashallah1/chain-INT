import { useState, useRef } from "react";

// ── Point this at your backend ────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

const SECTIONS = [
  { id: "overview",   label: "Project Overview",      icon: "◈" },
  { id: "founders",   label: "Founder Intelligence",  icon: "◉" },
  { id: "investors",  label: "Investor & VC Analysis", icon: "◎" },
  { id: "affiliates", label: "Affiliate Network",     icon: "⬡" },
  { id: "onchain",    label: "On-Chain Signals",       icon: "⬢" },
  { id: "social",     label: "Social & Community",    icon: "◈" },
  { id: "redflags",   label: "Risk & Red Flags",      icon: "⚑" },
  { id: "verdict",    label: "OSINT Verdict",         icon: "◆" },
];

// ── Risk Meter ────────────────────────────────────────────────────────
function RiskMeter({ score }) {
  const color  = score >= 70 ? "#00ff9d" : score >= 40 ? "#ffd700" : "#ff4444";
  const label  = score >= 70 ? "LOW RISK" : score >= 40 ? "MODERATE RISK" : "HIGH RISK";
  const circ   = 2 * Math.PI * 54;
  const dash   = (score / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r="54" fill="none" stroke="#1a1a2e" strokeWidth="10" />
        <circle cx="65" cy="65" r="54" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dasharray 1.5s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 8px ${color})` }}
        />
        <text x="65" y="60" textAnchor="middle" fill={color} fontSize="26"
          fontFamily="'Space Mono', monospace" fontWeight="bold">{score}</text>
        <text x="65" y="78" textAnchor="middle" fill="#666" fontSize="9"
          fontFamily="'Space Mono', monospace">TRUST SCORE</text>
      </svg>
      <span style={{ color, fontFamily: "'Space Mono', monospace", fontSize: "11px", letterSpacing: "3px", fontWeight: "bold" }}>{label}</span>
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────
function SectionCard({ section, content, isLoading }) {
  const [expanded, setExpanded] = useState(true);

  const fmt = (text) =>
    text
      .replace(/\*\*(.*?)\*\*/g, '<span style="color:#00ff9d;font-weight:bold">$1</span>')
      .replace(/🔴/g, '<span style="color:#ff4444">🔴</span>')
      .replace(/🟡/g, '<span style="color:#ffd700">🟡</span>')
      .replace(/🟢/g, '<span style="color:#00ff9d">🟢</span>')
      .replace(/⚠️/g, '<span style="color:#ffd700">⚠️</span>')
      .replace(/✅/g, '<span style="color:#00ff9d">✅</span>')
      .replace(/❌/g, '<span style="color:#ff4444">❌</span>')
      .replace(/##\s+(.*)/g, '<div style="color:#c8a96e;font-size:11px;letter-spacing:2px;margin:14px 0 6px;font-family:Space Mono,monospace">$1</div>')
      .replace(/---/g, '<hr style="border:none;border-top:1px solid #1e2a3a;margin:12px 0"/>');

  return (
    <div
      style={{ border: "1px solid #1e2a3a", borderRadius: "2px", marginBottom: "2px", background: "#060d1a", overflow: "hidden" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#00ff9d33"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2a3a"}
    >
      <button onClick={() => setExpanded(!expanded)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: "12px",
        padding: "14px 18px", background: "none", border: "none", cursor: "pointer",
      }}>
        <span style={{ color: "#00ff9d", fontSize: "16px", fontFamily: "monospace" }}>{section.icon}</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", letterSpacing: "2px", color: "#aaa", flex: 1, textAlign: "left" }}>
          {section.label.toUpperCase()}
        </span>
        {isLoading && (
          <span style={{ display: "flex", gap: "3px" }}>
            {[0,1,2].map(i => (
              <span key={i} style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#00ff9d", animation: `pulse 1s ${i*0.2}s infinite` }} />
            ))}
          </span>
        )}
        {!isLoading && content && (
          <span style={{ color: "#00ff9d", fontSize: "10px", fontFamily: "monospace" }}>{expanded ? "▼" : "▶"}</span>
        )}
      </button>
      {expanded && content && (
        <div style={{ padding: "0 18px 18px 44px" }}>
          <div
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12.5px", lineHeight: "1.9", color: "#8899aa", whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{ __html: fmt(content) }}
          />
        </div>
      )}
    </div>
  );
}

// ── Parse streamed text into section buckets ──────────────────────────
function parseIntoSections(text) {
  const MAP = {
    "PROJECT OVERVIEW": "overview",
    "FOUNDER INTELLIGENCE": "founders",
    "INVESTOR & VC ANALYSIS": "investors",
    "AFFILIATE NETWORK": "affiliates",
    "ON-CHAIN SIGNALS": "onchain",
    "SOCIAL & COMMUNITY": "social",
    "RISK & RED FLAGS": "redflags",
    "OSINT VERDICT": "verdict",
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
  const score = text.match(/TRUST_SCORE:\s*(\d+)/);
  if (score) result._score = parseInt(score[1]);
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
  const [toolCount,      setToolCount]      = useState(0);
  const rawRef = useRef("");
  const esRef  = useRef(null);

  const stopScan = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setIsRunning(false);
    setLoadingSections({});
  };

  const runOSINT = async () => {
    if (!query.trim() || isRunning) return;

    stopScan();
    setIsRunning(true);
    setError(null);
    setSections({});
    setTrustScore(null);
    setToolCount(0);
    rawRef.current = "";
    setProjectName(query.trim());
    const loading = {};
    SECTIONS.forEach(s => { loading[s.id] = true; });
    setLoadingSections(loading);

    try {
      const response = await fetch(`${API_BASE}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processSSE = (chunk) => {
        buffer += chunk;
        const parts = buffer.split("\n\n");
        buffer = parts.pop();

        for (const part of parts) {
          const lines = part.split("\n");
          let eventName = "message";
          let dataStr   = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            if (line.startsWith("data: "))  dataStr   = line.slice(6).trim();
          }
          if (!dataStr) continue;

          let data;
          try { data = JSON.parse(dataStr); } catch { continue; }

          if (eventName === "text_delta") {
            rawRef.current += data.text;
            const parsed = parseIntoSections(rawRef.current);
            const newSections = {};
            SECTIONS.forEach(s => { if (parsed[s.id]) newSections[s.id] = parsed[s.id]; });
            setSections(newSections);
            if (parsed._score !== undefined) setTrustScore(parsed._score);
          }
          if (eventName === "tool_use") setToolCount(data.count);
          if (eventName === "done") {
            const parsed = parseIntoSections(rawRef.current);
            if (parsed._score !== undefined) {
              setScanned(prev => [
                { name: query.trim(), score: parsed._score, time: new Date().toLocaleTimeString() },
                ...prev.slice(0, 9),
              ]);
            }
            setLoadingSections({});
            setIsRunning(false);
          }
          if (eventName === "error") throw new Error(data.message || "Scan error");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        processSSE(decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      setError(e.message);
      setLoadingSections({});
      setIsRunning(false);
    }
  };

  const hasResults = Object.keys(sections).length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#030810", fontFamily: "'IBM Plex Mono', monospace", color: "#8899aa" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes scanline { 0%{top:-2px} 100%{top:100vh} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glitch {
          0%,90%,100%{text-shadow:none}
          92%{text-shadow:-2px 0 #ff0044,2px 0 #00ffff}
          94%{text-shadow:none}
          96%{text-shadow:2px 0 #ff0044,-2px 0 #00ffff}
          98%{text-shadow:none}
        }
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#030810}
        ::-webkit-scrollbar-thumb{background:#1e2a3a}
        input::placeholder{color:#1e3a2a}
        .scan-btn:not(:disabled):hover { background:#00ff9d !important; color:#030810 !important; }
      `}</style>

      <div style={{ position: "fixed", left: 0, right: 0, height: "2px", background: "linear-gradient(transparent,#00ff9d22,transparent)", animation: "scanline 5s linear infinite", pointerEvents: "none", zIndex: 999 }} />

      <div style={{ borderBottom: "1px solid #0d1f2d", padding: "18px 28px", display: "flex", alignItems: "center", gap: "20px" }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "20px", fontWeight: "bold", color: "#00ff9d", letterSpacing: "4px", animation: "glitch 7s infinite" }}>◆ CHAIN_INT</div>
          <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#1a3a2a", marginTop: "3px" }}>WEB3 OSINT INTELLIGENCE PLATFORM // DEEP SCAN ENGINE</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "24px" }}>
          {[["SOURCES","14+"],["DATA","LIVE"],["MODE","DEEP SCAN"]].map(([l,v]) => (
            <div key={l} style={{ textAlign: "right" }}>
              <div style={{ fontSize: "8px", color: "#1a3a2a", letterSpacing: "2px" }}>{l}</div>
              <div style={{ fontSize: "11px", color: "#00ff9d", fontFamily: "'Space Mono', monospace" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 70px)" }}>
        <div style={{ width: "210px", borderRight: "1px solid #0d1f2d", padding: "18px 0", flexShrink: 0, overflowY: "auto" }}>
          <div style={{ padding: "0 14px 10px", fontSize: "8px", letterSpacing: "3px", color: "#1a3a2a" }}>ACTIVE SOURCES</div>
          {["CryptoRank","RootData","DeFiLlama","CoinGecko","LinkedIn","Twitter/X","GitHub","Crunchbase","Messari","On-Chain","OpenSanctions","OFAC","SEC EDGAR","Wayback Machine"].map((src, i) => (
            <div key={src} style={{ padding: "5px 14px", fontSize: "10px", color: isRunning ? "#2a6a3a" : "#1e3a2a", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: isRunning ? "#00ff9d" : "#1a2a1a", boxShadow: isRunning ? "0 0 6px #00ff9d" : "none", animation: isRunning ? `pulse 1.5s ${(i*0.1).toFixed(1)}s infinite` : "none", flexShrink: 0 }} />
              {src}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, padding: "30px", overflowY: "auto" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ position: "relative", marginBottom: "40px" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runOSINT()}
                placeholder="ENTER PROJECT NAME OR CONTRACT..."
                style={{ width: "100%", background: "#060d1a", border: "1px solid #1e2a3a", padding: "18px 20px", color: "#00ff9d", fontFamily: "'Space Mono', monospace", outline: "none" }}
              />
              <button
                className="scan-btn"
                onClick={isRunning ? stopScan : runOSINT}
                style={{ position: "absolute", right: "8px", top: "8px", bottom: "8px", background: "#00ff9d11", color: "#00ff9d", border: "1px solid #00ff9d", padding: "0 20px", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}
              >
                {isRunning ? "STOP" : "SCAN"}
              </button>
            </div>

            {hasResults && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
                <h2 style={{ color: "#fff", letterSpacing: "2px" }}>{projectName.toUpperCase()}</h2>
                {trustScore !== null && <RiskMeter score={trustScore} />}
              </div>
            )}

            {SECTIONS.map(s => (
              <SectionCard key={s.id} section={s} content={sections[s.id]} isLoading={loadingSections[s.id]} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

