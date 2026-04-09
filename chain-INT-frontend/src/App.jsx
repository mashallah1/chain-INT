import { useState, useRef } from "react";

// ── Configuration ───────────────────────────────────────────────────
const API_BASE = (import.meta.env && import.meta.env.VITE_API_URL) || "http://localhost:3001";

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

// ── Risk Meter ──────────────────────────────────────────────────────
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
        />
        <text x="65" y="60" textAnchor="middle" fill={color} fontSize="26" fontFamily="monospace" fontWeight="bold">{score}</text>
        <text x="65" y="78" textAnchor="middle" fill="#666" fontSize="9" fontFamily="monospace">TRUST SCORE</text>
      </svg>
      <span style={{ color, fontFamily: "monospace", fontSize: "11px", letterSpacing: "3px", fontWeight: "bold" }}>{label}</span>
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────
function SectionCard({ section, content, isLoading }) {
  const [expanded, setExpanded] = useState(true);

  const fmt = (text) => {
    if (!text) return "";
    return text
      .replace(/\*\*(.*?)\*\*/g, '<span style="color:#00ff9d;font-weight:bold">$1</span>')
      .replace(/##\s+(.*)/g, '<div style="color:#c8a96e;font-size:11px;letter-spacing:2px;margin:14px 0 6px;font-family:monospace">$1</div>')
      .replace(/---/g, '<hr style="border:none;border-top:1px solid #1e2a3a;margin:12px 0"/>');
  };

  return (
    <div style={{ border: "1px solid #1e2a3a", borderRadius: "2px", marginBottom: "4px", background: "#060d1a", overflow: "hidden" }}>
      <button onClick={() => setExpanded(!expanded)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: "12px",
        padding: "14px 18px", background: "none", border: "none", cursor: "pointer",
      }}>
        <span style={{ color: "#00ff9d", fontSize: "16px" }}>{section.icon}</span>
        <span style={{ fontFamily: "monospace", fontSize: "11px", letterSpacing: "2px", color: "#aaa", flex: 1, textAlign: "left" }}>
          {section.label.toUpperCase()}
        </span>
        {isLoading && <span style={{ color: "#00ff9d", fontSize: "10px" }}>SCANNING...</span>}
        {!isLoading && content && <span style={{ color: "#00ff9d" }}>{expanded ? "▼" : "▶"}</span>}
      </button>
      {expanded && content && (
        <div style={{ padding: "0 18px 18px 44px" }}>
          <div
            style={{ fontFamily: "monospace", fontSize: "12.5px", lineHeight: "1.9", color: "#8899aa", whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{ __html: fmt(content) }}
          />
        </div>
      )}
    </div>
  );
}

// ── Parse SSE Stream ─────────────────────────────────────────────────
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
  let current = null;
  let buffer = [];

  for (const line of text.split("\n")) {
    const match = line.match(/^##\s+(.+)/);
    if (match) {
      if (current && buffer.length) result[current] = buffer.join("\n").trim();
      const key = Object.keys(MAP).find(k => match[1].toUpperCase().includes(k));
      current = key ? MAP[key] : null;
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }

  if (current && buffer.length) result[current] = buffer.join("\n").trim();

  const score = text.match(/TRUST_SCORE:\s*(\d+)/);
  if (score) result._score = parseInt(score[1]);

  return result;
}

// ── Main App ─────────────────────────────────────────────────────────
export default function OSINTPlatform() {
  const [query, setQuery] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [sections, setSections] = useState({});
  const [loadingSections, setLoadingSections] = useState({});
  const [trustScore, setTrustScore] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState(null);
  const rawRef = useRef("");

  const runOSINT = async () => {
    if (!query.trim() || isRunning) return;

    setIsRunning(true);
    setError(null);
    setSections({});
    setTrustScore(null);
    rawRef.current = "";
    setProjectName(query.trim());

    const loading = {};
    SECTIONS.forEach(s => (loading[s.id] = true));
    setLoadingSections(loading);

    try {
      const res = await fetch(`${API_BASE}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) throw new Error("Server error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();

        for (const part of parts) {
          let event = "";
          let dataStr = "";

          part.split("\n").forEach(line => {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          });

          if (!dataStr) continue;

          const data = JSON.parse(dataStr);

          if (event === "text_delta") {
            rawRef.current += data.text;
            const parsed = parseIntoSections(rawRef.current);

            const updated = {};
            SECTIONS.forEach(s => {
              if (parsed[s.id]) updated[s.id] = parsed[s.id];
            });

            setSections(updated);
            if (parsed._score !== undefined) setTrustScore(parsed._score);
          }

          if (event === "done") {
            setIsRunning(false);
            setLoadingSections({});
          }

          if (event === "error") {
            throw new Error(data.message);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setIsRunning(false);
      setLoadingSections({});
    }
  };

  const hasResults = Object.keys(sections).length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#030810", color: "#8899aa", fontFamily: "monospace" }}>
      <div style={{ padding: "24px" }}>
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Enter project..."
            style={{ flex: 1, padding: "12px", background: "#060d1a", border: "1px solid #1e2a3a", color: "#00ff9d" }}
          />
          <button onClick={runOSINT} style={{ padding: "0 20px", background: "#00ff9d", border: "none", cursor: "pointer" }}>
            {isRunning ? "Scanning..." : "Scan"}
          </button>
        </div>

        {error && <div style={{ color: "#ff4444" }}>{error}</div>}

        {hasResults && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3>{projectName}</h3>
              {trustScore !== null && <RiskMeter score={trustScore} />}
            </div>

            {SECTIONS.map(s => (
              (sections[s.id] || loadingSections[s.id]) && (
                <SectionCard key={s.id} section={s} content={sections[s.id]} isLoading={loadingSections[s.id]} />
              )
            ))}
          </>
        )}
      </div>
    </div>
  );
}