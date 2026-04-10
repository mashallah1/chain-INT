import { useState, useEffect, useRef } from "react";

const ANTHROPIC_KEY   = import.meta.env.VITE_ANTHROPIC_KEY   || "";
const ETHERSCAN_KEY   = import.meta.env.VITE_ETHERSCAN_KEY   || "";
const BSCSCAN_KEY     = import.meta.env.VITE_BSCSCAN_KEY     || "";
const ARBISCAN_KEY    = import.meta.env.VITE_ARBISCAN_KEY    || "";
const BASESCAN_KEY    = import.meta.env.VITE_BASESCAN_KEY    || "";
const POLYGONSCAN_KEY = import.meta.env.VITE_POLYGONSCAN_KEY || "";

// ── Access codes — add yours here, share only with trusted users ──────
// Format: "CODE": { label: "who this is for", scansPerDay: N }
const ACCESS_CODES = {
  [import.meta.env.VITE_ACCESS_CODE_1 || "CHAIN-ALPHA"]: { label: "Alpha Access", scansPerDay: 10 },
  [import.meta.env.VITE_ACCESS_CODE_2 || "CHAIN-BETA" ]: { label: "Beta Access",  scansPerDay: 5  },
  [import.meta.env.VITE_ACCESS_CODE_3 || "CHAIN-ADMIN"]: { label: "Admin",         scansPerDay: 50 },
};

const STORAGE_PREFIX = "chainint_rl_";

// ── Rate limit helpers (localStorage per code) ────────────────────────
function getRateData(code) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + code);
    if (!raw) return { count: 0, date: today() };
    return JSON.parse(raw);
  } catch { return { count: 0, date: today() }; }
}

function setRateData(code, data) {
  try { localStorage.setItem(STORAGE_PREFIX + code, JSON.stringify(data)); } catch {}
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function checkAndIncrementRate(code) {
  const limit = ACCESS_CODES[code]?.scansPerDay ?? 0;
  let data = getRateData(code);
  if (data.date !== today()) data = { count: 0, date: today() }; // reset daily
  if (data.count >= limit) return { allowed: false, used: data.count, limit };
  data.count++;
  setRateData(code, data);
  return { allowed: true, used: data.count, limit };
}

function getRemainingScans(code) {
  if (!code || !ACCESS_CODES[code]) return 0;
  const limit = ACCESS_CODES[code].scansPerDay;
  let data = getRateData(code);
  if (data.date !== today()) return limit;
  return Math.max(0, limit - data.count);
}

// ── Chain config ──────────────────────────────────────────────────────
const CHAINS = {
  ethereum: { label:"Ethereum", symbol:"ETH",  url:"https://api.etherscan.io/api",    key:()=>ETHERSCAN_KEY,   explorer:"https://etherscan.io/address/" },
  bsc:      { label:"BSC",      symbol:"BNB",  url:"https://api.bscscan.com/api",     key:()=>BSCSCAN_KEY,     explorer:"https://bscscan.com/address/" },
  arbitrum: { label:"Arbitrum", symbol:"ETH",  url:"https://api.arbiscan.io/api",     key:()=>ARBISCAN_KEY,    explorer:"https://arbiscan.io/address/" },
  base:     { label:"Base",     symbol:"ETH",  url:"https://api.basescan.org/api",    key:()=>BASESCAN_KEY,    explorer:"https://basescan.org/address/" },
  polygon:  { label:"Polygon",  symbol:"MATIC",url:"https://api.polygonscan.com/api", key:()=>POLYGONSCAN_KEY, explorer:"https://polygonscan.com/address/" },
};

const MIXERS = new Set([
  "0x722122df12d4e14e13ac3b6895a86e84145b6967",
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b",
  "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf",
  "0xa160cdab225685da1d56aa342ad8841c3b53f291",
  "0x0836222f2b2b5a6700c204a2497ef919cc6b0be5",
]);

const PROJECT_SECTIONS = [
  { id:"overview",   label:"Project Overview",       icon:"◈" },
  { id:"founders",   label:"Founder Intelligence",   icon:"◉" },
  { id:"investors",  label:"Investor & VC Analysis", icon:"◎" },
  { id:"onchain",    label:"On-Chain Signals",       icon:"⬢" },
  { id:"social",     label:"Social & Community",     icon:"◈" },
  { id:"redflags",   label:"Risk & Red Flags",       icon:"⚑" },
  { id:"verdict",    label:"OSINT Verdict",          icon:"◆" },
];

const WALLET_SECTIONS = [
  { id:"entity",     label:"Entity Profile",          icon:"◉" },
  { id:"funding",    label:"Funding Source",          icon:"◈" },
  { id:"affiliates", label:"Affiliate Wallet Map",    icon:"⬡" },
  { id:"txintel",    label:"Transaction Intelligence",icon:"⬢" },
  { id:"dumps",      label:"Token Dump Analysis",     icon:"◎" },
  { id:"risk",       label:"Risk Signals",            icon:"⚑" },
  { id:"deployer",   label:"Deployer History",        icon:"◈" },
  { id:"verdict",    label:"On-Chain Verdict",        icon:"◆" },
];

// ── Explorer helpers ──────────────────────────────────────────────────
async function explorerFetch(chain, module, action, address, extra="") {
  const cfg=CHAINS[chain]; const key=cfg.key(); if(!key) return null;
  try {
    const r=await fetch(`${cfg.url}?module=${module}&action=${action}&address=${address}&apikey=${key}&sort=asc${extra}`);
    const d=await r.json(); return d.status==="1"?d.result:null;
  } catch { return null; }
}

async function getBalance(chain, address) {
  const cfg=CHAINS[chain]; const key=cfg.key(); if(!key) return null;
  try {
    const r=await fetch(`${cfg.url}?module=account&action=balance&address=${address}&apikey=${key}`);
    const d=await r.json(); return d.status==="1"?parseFloat(d.result||0)/1e18:null;
  } catch { return null; }
}

async function checkIsContract(chain, address) {
  const cfg=CHAINS[chain]; const key=cfg.key(); if(!key) return false;
  try {
    const r=await fetch(`${cfg.url}?module=proxy&action=eth_getCode&address=${address}&tag=latest&apikey=${key}`);
    const d=await r.json(); return d.result&&d.result!=="0x";
  } catch { return false; }
}

async function detectActiveChains(address) {
  const results = await Promise.all(
    Object.entries(CHAINS).filter(([,cfg])=>cfg.key()).map(async([id])=>{
      const bal=await getBalance(id,address); if(bal===null) return null;
      const txList=await explorerFetch(id,"account","txlist",address,"&startblock=0&endblock=99999999&page=1&offset=5");
      const txCount=Array.isArray(txList)?txList.length:0;
      if(bal>0.001||txCount>0) return{chain:id,balance:bal,txCount,hasMore:txCount===5};
      return null;
    })
  );
  return results.filter(Boolean);
}

// ── Data processors ───────────────────────────────────────────────────
function extractAffiliates(txList, address) {
  if(!Array.isArray(txList)) return{funder:null,recipients:[],senders:[]};
  const addr=address.toLowerCase();
  const firstIn=txList.find(tx=>tx.to?.toLowerCase()===addr&&parseFloat(tx.value)>0);
  const funder=firstIn?{address:firstIn.from,ethAmount:(parseFloat(firstIn.value)/1e18).toFixed(4),date:new Date(parseInt(firstIn.timeStamp)*1000).toLocaleDateString(),txHash:firstIn.hash}:null;
  const recMap={},senMap={};
  for(const tx of txList){
    const val=parseFloat(tx.value||0)/1e18; if(val<0.05) continue;
    if(tx.from?.toLowerCase()===addr){recMap[tx.to]=recMap[tx.to]||{address:tx.to,totalETH:0,txCount:0};recMap[tx.to].totalETH+=val;recMap[tx.to].txCount++;}
    if(tx.to?.toLowerCase()===addr){senMap[tx.from]=senMap[tx.from]||{address:tx.from,totalETH:0,txCount:0};senMap[tx.from].totalETH+=val;senMap[tx.from].txCount++;}
  }
  return{funder,recipients:Object.values(recMap).sort((a,b)=>b.totalETH-a.totalETH).slice(0,8),senders:Object.values(senMap).sort((a,b)=>b.totalETH-a.totalETH).slice(0,8)};
}

function analyzeTokenDumps(tokenTxList, address) {
  if(!Array.isArray(tokenTxList)) return[];
  const addr=address.toLowerCase(),map={};
  for(const tx of tokenTxList){
    const sym=tx.tokenSymbol||"?",dec=parseInt(tx.tokenDecimal||18),amt=parseFloat(tx.value||0)/Math.pow(10,dec);
    if(!map[sym]) map[sym]={symbol:sym,name:tx.tokenName,received:0,sent:0};
    if(tx.to?.toLowerCase()===addr) map[sym].received+=amt;
    if(tx.from?.toLowerCase()===addr) map[sym].sent+=amt;
  }
  return Object.values(map).map(t=>({...t,dumpRatio:t.received>0?+(t.sent/t.received).toFixed(2):(t.sent>0?99:0)}))
    .filter(t=>t.received>0||t.sent>0).sort((a,b)=>b.dumpRatio-a.dumpRatio).slice(0,15);
}

function findMixerTxns(txList, address) {
  if(!Array.isArray(txList)) return[];
  const addr=address.toLowerCase();
  return txList.filter(tx=>MIXERS.has(tx.to?.toLowerCase())||MIXERS.has(tx.from?.toLowerCase()))
    .map(tx=>({direction:tx.from?.toLowerCase()===addr?"SENT TO MIXER":"RECEIVED FROM MIXER",eth:(parseFloat(tx.value||0)/1e18).toFixed(4),date:new Date(parseInt(tx.timeStamp)*1000).toLocaleDateString()}));
}

// ── Claude call — full Sonnet quality ────────────────────────────────
async function callClaude(system, user, webSearch=false) {
  if(!ANTHROPIC_KEY) throw new Error("VITE_ANTHROPIC_KEY not configured.");
  const body={
    model:"claude-sonnet-4-20250514",
    max_tokens:4000,
    system,
    messages:[{role:"user",content:user}],
  };
  if(webSearch) body.tools=[{type:"web_search_20250305",name:"web_search"}];
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify(body),
  });
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`API error ${r.status}`);}
  const d=await r.json();
  return d.content.filter(b=>b.type==="text").map(b=>b.text).join("\n");
}

// ── Prompts — full quality ─────────────────────────────────────────────
const PROJECT_PROMPT = `You are an elite Web3 OSINT analyst specializing in both established and brand new early-stage projects.

For NEW or UNKNOWN projects with minimal coverage:
- Search Twitter/X aggressively for the project name, founders, any mentions
- Check GitHub for repositories
- Look for Telegram, Discord links and community activity
- Search for any contract addresses and trace them on-chain
- Check if any known VCs, influencers, or launchpads have mentioned it
- Identify founders by their handles even if anonymous
- Treat low information as a signal itself — state clearly what you could NOT find

For ALL projects use these EXACT headers. Flag with 🔴🟡🟢. Bold key findings with **.

## PROJECT OVERVIEW
[What it is, chain, category, launch stage, token if any. If stealth/unknown say so clearly.]

---

## FOUNDER INTELLIGENCE
[Every founder/co-founder: name or handle, background, LinkedIn, Twitter, past projects both successful AND failed, any rugs or controversies, doxxed vs anonymous status, verified vs claimed credentials. If anonymous, say so and note what signals exist about identity.]

---

## INVESTOR & VC ANALYSIS
[All known backers, their tier and reputation, portfolio history, round details and valuations if known, any association with failed projects or scams. If no funding info exists, state that explicitly.]

---

## ON-CHAIN SIGNALS
[Contract address if found, deployer wallet history, token distribution and concentration, whale wallets, unlock schedules, audit status, TVL if applicable, any suspicious on-chain activity.]

---

## SOCIAL & COMMUNITY
[Twitter/X presence and follower count with growth pattern, Telegram and Discord health and member count, GitHub activity and commit history, media coverage, bot activity indicators, community sentiment.]

---

## RISK & RED FLAGS
[Comprehensive list of ALL concerns: anonymous team, no audit, low liquidity, suspicious tokenomics, VC dump history, copied code, honeypot indicators, regulatory issues, social manipulation, wash trading.]

---

## OSINT VERDICT
[Final assessment. Recommendation: PASS / CAUTION / AVOID. 3-5 sentences of key reasoning.]

TRUST_SCORE: [0-100]`;

const WALLET_PROMPT = `You are an elite on-chain OSINT analyst using ZachXBT-style investigative methodology. You receive raw blockchain data and produce detailed, actionable intelligence reports.

Be extremely specific. Identify behavioral patterns. Connect dots between wallets. Call out suspicious activity clearly and directly. Do not hedge — state what the data shows.

Use EXACTLY these headers:

## ENTITY PROFILE
[Who or what controls this address. Confidence level. Type: whale/developer/vc/exchange/bot/scammer/unknown. Full behavioral summary based on transaction patterns.]

---

## FUNDING SOURCE
[Detailed analysis of the first funder wallet — is it known? What does the funding pattern suggest about the origin of funds? Any suspicious or notable origins? Trace back as far as the data allows.]

---

## AFFILIATE WALLET MAP
[All connected wallets with their inferred relationships. Evidence of shared control or coordinated behavior. Which wallets appear to be operated by the same entity? What does the money flow reveal?]

---

## TRANSACTION INTELLIGENCE
[Behavioral patterns, timing analysis, transaction volume and frequency. Notable or suspicious transactions. Bot-like vs human behavior indicators. Any coordinated activity with other wallets.]

---

## TOKEN DUMP ANALYSIS
[Which tokens did this address accumulate vs sell? Dump ratios explained. Any evidence of insider trading — receiving tokens before announcements then selling? Coordinated dumping with other wallets?]

---

## RISK SIGNALS
[Tornado Cash and mixer interactions with amounts and dates. Exposure to sanctioned addresses. Known bad actor connections. Patterns consistent with rug pulls, exit scams, or wash trading.]

---

## DEPLOYER HISTORY
[If contract: complete history of this deployer wallet — every project ever launched, success/failure/rug rate, behavioral patterns across projects, any repeat offenses.]

---

## ON-CHAIN VERDICT
[Final assessment. Risk level: LOW / MODERATE / HIGH / CRITICAL. Key findings that drove the assessment. What someone should do with this information.]

RISK_SCORE: [0-100 where 100 = maximum risk / most suspicious]`;

// ── Section parsers ───────────────────────────────────────────────────
function parseSections(text, map, scoreKey) {
  const result={};let cur=null,buf=[];
  for(const line of text.split("\n")){
    const m=line.match(/^##\s+(.+)/);
    if(m){if(cur&&buf.length)result[cur]=buf.join("\n").trim();const key=Object.keys(map).find(k=>m[1].toUpperCase().includes(k));cur=key?map[key]:null;buf=[];}
    else if(cur) buf.push(line);
  }
  if(cur&&buf.length)result[cur]=buf.join("\n").trim();
  const sc=text.match(new RegExp(`${scoreKey}:\\s*(\\d+)`));
  if(sc)result._score=parseInt(sc[1]);
  return result;
}
const parseProject=t=>parseSections(t,{"PROJECT OVERVIEW":"overview","FOUNDER INTELLIGENCE":"founders","INVESTOR & VC ANALYSIS":"investors","ON-CHAIN SIGNALS":"onchain","SOCIAL & COMMUNITY":"social","RISK & RED FLAGS":"redflags","OSINT VERDICT":"verdict"},"TRUST_SCORE");
const parseWallet=t=>parseSections(t,{"ENTITY PROFILE":"entity","FUNDING SOURCE":"funding","AFFILIATE WALLET MAP":"affiliates","TRANSACTION INTELLIGENCE":"txintel","TOKEN DUMP ANALYSIS":"dumps","RISK SIGNALS":"risk","DEPLOYER HISTORY":"deployer","ON-CHAIN VERDICT":"verdict"},"RISK_SCORE");

// ── UI Components ─────────────────────────────────────────────────────
function RiskMeter({score,isRisk=false}){
  const color=isRisk?(score>=70?"#ff4444":score>=40?"#ffd700":"#00ff9d"):(score>=70?"#00ff9d":score>=40?"#ffd700":"#ff4444");
  const label=isRisk?(score>=70?"HIGH RISK":score>=40?"MODERATE":"LOW RISK"):(score>=70?"LOW RISK":score>=40?"MODERATE":"HIGH RISK");
  const circ=2*Math.PI*48,dash=(score/100)*circ;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"6px"}}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r="48" fill="none" stroke="#0d1f2d" strokeWidth="9"/>
        <circle cx="55" cy="55" r="48" fill="none" stroke={color} strokeWidth="9" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 55 55)" style={{transition:"stroke-dasharray 1.2s ease",filter:`drop-shadow(0 0 6px ${color})`}}/>
        <text x="55" y="51" textAnchor="middle" fill={color} fontSize="24" fontFamily="'Space Mono',monospace" fontWeight="bold">{score}</text>
        <text x="55" y="67" textAnchor="middle" fill="#333" fontSize="7" fontFamily="'Space Mono',monospace">{isRisk?"RISK":"TRUST"}</text>
      </svg>
      <span style={{color,fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"2px",fontWeight:"bold"}}>{label}</span>
    </div>
  );
}

function SectionCard({section,content,isLoading}){
  const [open,setOpen]=useState(true);
  const fmt=t=>t
    .replace(/\*\*(.*?)\*\*/g,'<span style="color:#00ff9d;font-weight:bold">$1</span>')
    .replace(/🔴/g,'<span style="color:#ff4444">🔴</span>')
    .replace(/🟡/g,'<span style="color:#ffd700">🟡</span>')
    .replace(/🟢/g,'<span style="color:#00ff9d">🟢</span>')
    .replace(/✅/g,'<span style="color:#00ff9d">✅</span>')
    .replace(/❌/g,'<span style="color:#ff4444">❌</span>')
    .replace(/⚠️/g,'<span style="color:#ffd700">⚠️</span>')
    .replace(/---/g,'<hr style="border:none;border-top:1px solid #0d1f2d;margin:10px 0"/>');
  return(
    <div style={{border:"1px solid #0d1f2d",borderRadius:"2px",marginBottom:"2px",background:"#040c18"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#00ff9d22"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="#0d1f2d"}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",alignItems:"center",gap:"10px",padding:"11px 14px",background:"none",border:"none",cursor:"pointer"}}>
        <span style={{color:"#00ff9d",fontSize:"13px"}}>{section.icon}</span>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"2px",color:"#8899aa",flex:1,textAlign:"left"}}>{section.label.toUpperCase()}</span>
        {isLoading&&<span style={{display:"flex",gap:"3px"}}>{[0,1,2].map(i=><span key={i} style={{width:"3px",height:"3px",borderRadius:"50%",background:"#00ff9d",animation:`pulse 1s ${i*.2}s infinite`}}/>)}</span>}
        {!isLoading&&content&&<span style={{color:"#00ff9d33",fontSize:"9px"}}>{open?"▼":"▶"}</span>}
      </button>
      {open&&content&&(
        <div style={{padding:"0 14px 14px 36px"}}>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px",lineHeight:"1.9",color:"#7a8a9a",whiteSpace:"pre-wrap"}}
            dangerouslySetInnerHTML={{__html:fmt(content)}}/>
        </div>
      )}
    </div>
  );
}

// ── Access Gate Screen ────────────────────────────────────────────────
function AccessGate({onUnlock}){
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [shake,setShake]=useState(false);

  const attempt=()=>{
    const trimmed=code.trim().toUpperCase();
    // Check against all codes case-insensitively
    const matched=Object.keys(ACCESS_CODES).find(k=>k.toUpperCase()===trimmed);
    if(matched){
      onUnlock(matched);
    } else {
      setError("Invalid access code.");
      setShake(true);
      setTimeout(()=>setShake(false),600);
      setCode("");
    }
  };

  return(
    <div style={{minHeight:"100vh",background:"#030810",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'IBM Plex Mono',monospace",padding:"20px"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes scanln{0%{top:-2px}100%{top:100vh}}
        @keyframes glitch{0%,92%,100%{text-shadow:none}93%{text-shadow:-2px 0 #ff0044,2px 0 #00ffff}95%{text-shadow:none}97%{text-shadow:2px 0 #ff0044,-2px 0 #00ffff}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#030810}::-webkit-scrollbar-thumb{background:#1e2a3a}
      `}</style>

      <div style={{position:"fixed",left:0,right:0,height:"2px",background:"linear-gradient(transparent,#00ff9d1a,transparent)",animation:"scanln 5s linear infinite",pointerEvents:"none"}}/>

      <div style={{textAlign:"center",animation:"fadeIn .6s ease",maxWidth:"380px",width:"100%"}}>
        {/* Logo */}
        <div style={{marginBottom:"40px"}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"28px",fontWeight:"bold",color:"#00ff9d",letterSpacing:"6px",animation:"glitch 6s infinite"}}>◆ CHAIN_INT</div>
          <div style={{fontSize:"9px",letterSpacing:"3px",color:"#1a3a2a",marginTop:"6px"}}>WEB3 OSINT INTELLIGENCE PLATFORM</div>
        </div>

        {/* Gate box */}
        <div style={{background:"#040c18",border:"1px solid #0d1f2d",borderRadius:"3px",padding:"32px",animation:shake?"shake .5s ease":"none"}}>
          <div style={{fontSize:"8px",letterSpacing:"3px",color:"#2a4a3a",marginBottom:"6px"}}>RESTRICTED ACCESS</div>
          <div style={{fontSize:"10px",color:"#3a5a4a",marginBottom:"24px",lineHeight:1.7}}>Enter your access code to continue</div>

          <input
            value={code}
            onChange={e=>setCode(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&attempt()}
            placeholder="XXXX-XXXXX"
            autoFocus
            style={{width:"100%",padding:"13px 16px",background:"#030810",border:`1px solid ${error?"#ff444444":"#1e2a3a"}`,borderRadius:"2px",color:"#ccc",fontFamily:"'Space Mono',monospace",fontSize:"14px",letterSpacing:"3px",outline:"none",textAlign:"center",textTransform:"uppercase",marginBottom:"12px",transition:"border-color .2s"}}
            onFocus={e=>e.target.style.borderColor="#00ff9d44"}
            onBlur={e=>e.target.style.borderColor=error?"#ff444444":"#1e2a3a"}
          />

          {error&&(
            <div style={{fontSize:"10px",color:"#ff4444",marginBottom:"12px",letterSpacing:"1px"}}>⚠ {error}</div>
          )}

          <button
            onClick={attempt}
            style={{width:"100%",padding:"13px",background:"#00ff9d0d",border:"1px solid #00ff9d44",borderRadius:"2px",color:"#00ff9d",fontFamily:"'Space Mono',monospace",fontSize:"10px",letterSpacing:"3px",cursor:"pointer",transition:"all .2s"}}
            onMouseEnter={e=>{e.target.style.background="#00ff9d";e.target.style.color="#030810";}}
            onMouseLeave={e=>{e.target.style.background="#00ff9d0d";e.target.style.color="#00ff9d";}}
          >
            ▶ ACCESS PLATFORM
          </button>
        </div>

        <div style={{marginTop:"20px",fontSize:"8px",color:"#1a2a1a",letterSpacing:"2px"}}>
          INTELLIGENCE PLATFORM — AUTHORIZED USERS ONLY
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
export default function App(){
  const [accessCode,  setAccessCode]  = useState(()=>sessionStorage.getItem("chainint_code")||"");
  const [tab,         setTab]         = useState("project");
  const [query,       setQuery]       = useState("");
  const [addrInput,   setAddrInput]   = useState("");
  const [isRunning,   setIsRunning]   = useState(false);
  const [sections,    setSections]    = useState({});
  const [loadingSecs, setLoadingSecs] = useState({});
  const [score,       setScore]       = useState(null);
  const [label,       setLabel]       = useState("");
  const [error,       setError]       = useState(null);
  const [history,     setHistory]     = useState([]);
  const [statusMsg,   setStatusMsg]   = useState("");
  const [activeChains,setActiveChains]= useState([]);
  const [scanMeta,    setScanMeta]    = useState(null);

  const handleUnlock=(code)=>{
    sessionStorage.setItem("chainint_code",code);
    setAccessCode(code);
  };

  const handleLogout=()=>{
    sessionStorage.removeItem("chainint_code");
    setAccessCode("");
  };

  // Show gate if no valid access code
  if(!accessCode||!ACCESS_CODES[accessCode]){
    return <AccessGate onUnlock={handleUnlock}/>;
  }

  const remaining=getRemainingScans(accessCode);
  const codeInfo=ACCESS_CODES[accessCode];

  const reset=(secs)=>{
    setSections({});setScore(null);setError(null);setStatusMsg("");setActiveChains([]);setScanMeta(null);
    const l={};secs.forEach(s=>{l[s.id]=true;});setLoadingSecs(l);
  };

  // ── Project scan ──────────────────────────────────────────────────
  const runProject=async()=>{
    if(!query.trim()||isRunning) return;
    const rate=checkAndIncrementRate(accessCode);
    if(!rate.allowed){setError(`Daily scan limit reached (${rate.limit}/day). Resets at midnight.`);return;}
    setIsRunning(true);reset(PROJECT_SECTIONS);setLabel(query.trim());
    try{
      const text=await callClaude(PROJECT_PROMPT,
        `Investigate this Web3 project: "${query.trim()}"\n\nThis may be a brand new, obscure, or stealth project. Search everywhere — Twitter/X, GitHub, Telegram, Discord, any forums, on-chain data, news. Extract all available signal even if coverage is minimal. If you cannot find something, state that explicitly — absence of information is itself intelligence.`,
        true
      );
      const parsed=parseProject(text);
      const secs={};PROJECT_SECTIONS.forEach(s=>{if(parsed[s.id])secs[s.id]=parsed[s.id];});
      setSections(secs);
      if(parsed._score!==undefined){setScore(parsed._score);setHistory(p=>[{type:"project",name:query.trim(),score:parsed._score,time:new Date().toLocaleTimeString()},...p.slice(0,9)]);}
    }catch(e){setError(e.message);}
    finally{setIsRunning(false);setLoadingSecs({});setStatusMsg("");}
  };

  // ── Wallet / CA scan ──────────────────────────────────────────────
  const runWallet=async()=>{
    if(!addrInput.trim()||isRunning) return;
    const addr=addrInput.trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(addr)){setError("Invalid address format. Must be 0x followed by 40 hex characters.");return;}
    if(!Object.values(CHAINS).some(c=>c.key())){setError("Add at least VITE_ETHERSCAN_KEY to your Vercel environment variables.");return;}
    const rate=checkAndIncrementRate(accessCode);
    if(!rate.allowed){setError(`Daily scan limit reached (${rate.limit}/day). Resets at midnight.`);return;}
    setIsRunning(true);reset(WALLET_SECTIONS);setLabel(addr);
    try{
      setStatusMsg("Scanning all chains for activity...");
      const detected=await detectActiveChains(addr);
      setActiveChains(detected);
      if(!detected.length){setError("No activity found on any configured chain.");setIsRunning(false);setLoadingSecs({});setStatusMsg("");return;}

      const primaryChain=detected.sort((a,b)=>b.txCount-a.txCount)[0].chain;
      setStatusMsg(`Active on ${detected.map(d=>CHAINS[d.chain].label).join(", ")} — deep tracing ${CHAINS[primaryChain].label}...`);

      const[txList,tokenTxList,balance]=await Promise.all([
        explorerFetch(primaryChain,"account","txlist",addr,"&startblock=0&endblock=99999999"),
        explorerFetch(primaryChain,"account","tokentx",addr,"&startblock=0&endblock=99999999"),
        getBalance(primaryChain,addr),
      ]);

      const isCA=await checkIsContract(primaryChain,addr);
      const aff=extractAffiliates(txList,addr);
      const dumps=analyzeTokenDumps(tokenTxList,addr);
      const mixers=findMixerTxns(txList,addr);
      const txCount=txList?.length||0;
      const firstTx=txList?.[0];
      const lastTx=txList?.[txList?.length-1];

      setScanMeta({address:addr,chain:primaryChain,isContract:isCA,balance,txCount,mixerExposure:mixers.length>0,multiChain:detected.length>1});

      let deployerData=null;
      if(isCA){
        setStatusMsg("Contract detected — tracing deployer across all projects...");
        const creation=await explorerFetch(primaryChain,"contract","getcontractcreation",addr);
        if(creation?.[0]?.contractCreator){
          const dep=creation[0].contractCreator;
          const depTxns=await explorerFetch(primaryChain,"account","txlist",dep,"&startblock=0&endblock=99999999");
          const others=depTxns?.filter(tx=>tx.contractAddress&&tx.contractAddress.toLowerCase()!==addr.toLowerCase())
            .map(tx=>tx.contractAddress).filter((v,i,a)=>a.indexOf(v)===i).slice(0,15)||[];
          deployerData={address:dep,otherContracts:others};
        }
      }

      setStatusMsg("Running full intelligence analysis...");

      const ctx=[
        `ADDRESS: ${addr}`,
        `CHAIN ACTIVITY: ${detected.map(d=>`${CHAINS[d.chain].label}: ${d.balance.toFixed(4)} ${CHAINS[d.chain].symbol}, ${d.txCount}${d.hasMore?"+":""} transactions`).join(" | ")}`,
        `TYPE: ${isCA?"SMART CONTRACT":"EOA WALLET"}`,
        `PRIMARY CHAIN BALANCE: ${balance?.toFixed(4)} ${CHAINS[primaryChain].symbol}`,
        `TOTAL TRANSACTIONS: ${txCount}`,
        `WALLET AGE: ${firstTx?new Date(parseInt(firstTx.timeStamp)*1000).toLocaleDateString():"unknown"} → ${lastTx?new Date(parseInt(lastTx.timeStamp)*1000).toLocaleDateString():"unknown"}`,
        "",
        "=== FUNDING SOURCE (first wallet to send funds here) ===",
        JSON.stringify(aff.funder,null,2),
        "",
        "=== TOP RECIPIENTS (this address sent significant ETH to) ===",
        JSON.stringify(aff.recipients,null,2),
        "",
        "=== TOP SENDERS (sent significant ETH to this address) ===",
        JSON.stringify(aff.senders,null,2),
        "",
        "=== TOKEN ACTIVITY (dumpRatio: sold÷received. 99 = sold without receiving = likely insider) ===",
        JSON.stringify(dumps,null,2),
        "",
        "=== MIXER / TORNADO CASH INTERACTIONS ===",
        mixers.length?JSON.stringify(mixers,null,2):"None detected — clean",
        "",
        deployerData?[
          "=== DEPLOYER WALLET: "+deployerData.address+" ===",
          "OTHER CONTRACTS BY SAME DEPLOYER:",
          JSON.stringify(deployerData.otherContracts,null,2),
        ].join("\n"):"",
        "",
        "=== LAST 20 TRANSACTIONS ===",
        JSON.stringify(txList?.slice(-20).map(tx=>({
          from:tx.from?.slice(0,12)+"...",
          to:(tx.to||"[contract creation]")?.slice(0,12)+"...",
          eth:(parseFloat(tx.value||0)/1e18).toFixed(4),
          date:new Date(parseInt(tx.timeStamp)*1000).toLocaleDateString(),
          status:tx.isError==="1"?"FAILED":"ok",
        })),null,2),
      ].join("\n");

      const text=await callClaude(WALLET_PROMPT,`Analyze this address and produce a complete intelligence report:\n\n${ctx}`,false);
      const parsed=parseWallet(text);
      const secs={};WALLET_SECTIONS.forEach(s=>{if(parsed[s.id])secs[s.id]=parsed[s.id];});
      setSections(secs);
      if(parsed._score!==undefined){setScore(parsed._score);setHistory(p=>[{type:"wallet",name:addr.slice(0,12)+"...",score:parsed._score,time:new Date().toLocaleTimeString(),isRisk:true},...p.slice(0,9)]);}
    }catch(e){setError(e.message);}
    finally{setIsRunning(false);setLoadingSecs({});setStatusMsg("");}
  };

  const handleScan=()=>tab==="project"?runProject():runWallet();
  const hasResults=Object.keys(sections).length>0;
  const curSections=tab==="project"?PROJECT_SECTIONS:WALLET_SECTIONS;

  return(
    <div style={{minHeight:"100vh",background:"#030810",fontFamily:"'IBM Plex Mono',monospace",color:"#8899aa"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes scanln{0%{top:-2px}100%{top:100vh}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glitch{0%,92%,100%{text-shadow:none}93%{text-shadow:-2px 0 #ff0044,2px 0 #00ffff}95%{text-shadow:none}97%{text-shadow:2px 0 #ff0044,-2px 0 #00ffff}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#030810}::-webkit-scrollbar-thumb{background:#1e2a3a}
        input::placeholder{color:#1a3020}
        .sbtn:not(:disabled):hover{background:#00ff9d!important;color:#030810!important}
        .exbtn:hover{border-color:#00ff9d33!important;color:#00ff9d!important}
        .tabx:hover{color:#00ff9d!important}
      `}</style>

      <div style={{position:"fixed",left:0,right:0,height:"2px",background:"linear-gradient(transparent,#00ff9d1a,transparent)",animation:"scanln 5s linear infinite",pointerEvents:"none",zIndex:999}}/>

      {/* Header */}
      <div style={{borderBottom:"1px solid #0a1825",padding:"12px 20px",display:"flex",alignItems:"center",gap:"14px",flexWrap:"wrap"}}>
        <div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"16px",fontWeight:"bold",color:"#00ff9d",letterSpacing:"4px",animation:"glitch 8s infinite"}}>◆ CHAIN_INT</div>
          <div style={{fontSize:"7px",letterSpacing:"3px",color:"#1a3a2a",marginTop:"2px"}}>WEB3 OSINT INTELLIGENCE PLATFORM</div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:"2px",background:"#040c18",padding:"3px",border:"1px solid #0d1f2d",borderRadius:"3px"}}>
          {[{id:"project",label:"◈ PROJECT"},{id:"wallet",label:"⬢ WALLET / CA"}].map(t=>(
            <button key={t.id} className="tabx" onClick={()=>{setTab(t.id);setSections({});setScore(null);setError(null);setStatusMsg("");setActiveChains([]);}}
              style={{padding:"6px 13px",background:tab===t.id?"#00ff9d15":"none",border:tab===t.id?"1px solid #00ff9d33":"1px solid transparent",borderRadius:"2px",color:tab===t.id?"#00ff9d":"#2a4a3a",fontFamily:"'Space Mono',monospace",fontSize:"8px",letterSpacing:"2px",cursor:"pointer",transition:"all .15s"}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Scan counter + user info */}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"16px"}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"7px",color:"#1a3a2a",letterSpacing:"2px"}}>SCANS REMAINING</div>
            <div style={{fontSize:"14px",color:remaining<=2?"#ff4444":remaining<=5?"#ffd700":"#00ff9d",fontFamily:"'Space Mono',monospace",fontWeight:"bold"}}>{remaining}<span style={{fontSize:"9px",color:"#2a4a3a"}}>/{codeInfo.scansPerDay}</span></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"7px",color:"#1a3a2a",letterSpacing:"2px"}}>ACCESS</div>
            <div style={{fontSize:"9px",color:"#3a6a4a",fontFamily:"'Space Mono',monospace"}}>{codeInfo.label}</div>
          </div>
          <button onClick={handleLogout}
            style={{padding:"5px 10px",background:"none",border:"1px solid #1e2a3a",borderRadius:"2px",color:"#2a3a2a",fontFamily:"'Space Mono',monospace",fontSize:"7px",letterSpacing:"2px",cursor:"pointer"}}
            onMouseEnter={e=>{e.target.style.borderColor="#ff444433";e.target.style.color="#ff4444";}}
            onMouseLeave={e=>{e.target.style.borderColor="#1e2a3a";e.target.style.color="#2a3a2a";}}>
            LOCK
          </button>
        </div>
      </div>

      <div style={{display:"flex",height:"calc(100vh - 58px)"}}>

        {/* Sidebar */}
        <div style={{width:"185px",borderRight:"1px solid #0a1825",padding:"14px 0",flexShrink:0,overflowY:"auto"}}>
          <div style={{padding:"0 12px 8px",fontSize:"7px",letterSpacing:"3px",color:"#1a3a2a"}}>{tab==="wallet"?"CHAIN STATUS":"SOURCES"}</div>

          {tab==="wallet"
            ?Object.entries(CHAINS).map(([id,cfg])=>{
                const hasKey=!!cfg.key(),found=activeChains.find(a=>a.chain===id);
                return(
                  <div key={id} style={{padding:"7px 12px",display:"flex",alignItems:"center",gap:"8px"}}>
                    <span style={{width:"5px",height:"5px",borderRadius:"50%",flexShrink:0,background:found?"#00ff9d":hasKey?"#1e2a3a":"#0a1020",boxShadow:found?"0 0 5px #00ff9d":"none"}}/>
                    <div>
                      <div style={{fontSize:"9px",color:found?"#00ff9d":hasKey?"#3a5a4a":"#1a2a1a",fontFamily:"'Space Mono',monospace"}}>{cfg.label}</div>
                      {found&&<div style={{fontSize:"8px",color:"#2a6a3a",marginTop:"1px"}}>{found.balance.toFixed(3)} {cfg.symbol}</div>}
                      {!found&&!hasKey&&<div style={{fontSize:"7px",color:"#1a2020",marginTop:"1px"}}>no api key</div>}
                    </div>
                  </div>
                );
              })
            :["CryptoRank","RootData","DeFiLlama","CoinGecko","Twitter/X","GitHub","Telegram","Crunchbase","Messari","On-Chain","OFAC","Wayback"].map((src,i)=>(
                <div key={src} style={{padding:"4px 12px",fontSize:"9px",color:isRunning?"#2a6a3a":"#1a3a2a",display:"flex",alignItems:"center",gap:"7px"}}>
                  <span style={{width:"4px",height:"4px",borderRadius:"50%",flexShrink:0,background:isRunning?"#00ff9d":"#0a1820",boxShadow:isRunning?"0 0 4px #00ff9d":"none",animation:isRunning?`pulse 1.5s ${(i*.08).toFixed(2)}s infinite`:"none"}}/>
                  {src}
                </div>
              ))
          }

          {history.length>0&&(
            <>
              <div style={{padding:"14px 12px 6px",fontSize:"7px",letterSpacing:"3px",color:"#1a3a2a"}}>HISTORY</div>
              {history.map((h,i)=>(
                <div key={i} style={{padding:"6px 12px",borderLeft:i===0?"2px solid #00ff9d22":"2px solid transparent"}}>
                  <div style={{fontSize:"9px",color:"#555",display:"flex",gap:"4px",alignItems:"center"}}>
                    <span style={{color:h.type==="wallet"?"#0088cc":"#00ff9d",fontSize:"8px"}}>{h.type==="wallet"?"⬢":"◈"}</span>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"120px"}}>{h.name}</span>
                  </div>
                  <div style={{fontSize:"8px",marginTop:"2px",color:h.isRisk?(h.score>=70?"#ff4444":h.score>=40?"#ffd700":"#00ff9d"):(h.score>=70?"#00ff9d":h.score>=40?"#ffd700":"#ff4444")}}>
                    {h.isRisk?"RISK":"TRUST"} {h.score} · {h.time}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Main */}
        <div style={{flex:1,overflowY:"auto",padding:"18px 22px"}}>

          {/* Input */}
          <div style={{marginBottom:"18px"}}>
            {tab==="project"?(
              <>
                <div style={{fontSize:"7px",letterSpacing:"3px",color:"#1a3a2a",marginBottom:"7px"}}>TARGET // PROJECT NAME · TOKEN TICKER · WEBSITE · NEW LAUNCH</div>
                <div style={{display:"flex",gap:"8px"}}>
                  <div style={{flex:1,position:"relative"}}>
                    <span style={{position:"absolute",left:"11px",top:"50%",transform:"translateY(-50%)",color:"#00ff9d1a",fontSize:"13px"}}>⌕</span>
                    <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleScan()}
                      placeholder="Known or brand new project — name, ticker, or URL"
                      style={{width:"100%",padding:"11px 11px 11px 30px",background:"#040c18",border:"1px solid #0d1f2d",borderRadius:"2px",color:"#ccc",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px",outline:"none",transition:"border-color .2s"}}
                      onFocus={e=>e.target.style.borderColor="#00ff9d33"} onBlur={e=>e.target.style.borderColor="#0d1f2d"}/>
                  </div>
                  <button className="sbtn" onClick={handleScan} disabled={isRunning||!query.trim()||remaining===0}
                    style={{padding:"11px 20px",background:"#00ff9d0a",border:"1px solid #00ff9d33",borderRadius:"2px",color:"#00ff9d",fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"2px",cursor:isRunning||!query.trim()||remaining===0?"not-allowed":"pointer",opacity:isRunning||remaining===0?.5:1,whiteSpace:"nowrap",transition:"all .2s"}}>
                    {isRunning?"SCANNING...":remaining===0?"LIMIT REACHED":"▶ SCAN"}
                  </button>
                </div>
                <div style={{display:"flex",gap:"5px",marginTop:"7px",flexWrap:"wrap"}}>
                  {["Hyperliquid","Blur","zkSync","Usual Protocol"].map(ex=>(
                    <button key={ex} className="exbtn" onClick={()=>setQuery(ex)} style={{padding:"3px 9px",background:"none",border:"1px solid #0d1f2d",borderRadius:"2px",color:"#2a4a3a",fontFamily:"'IBM Plex Mono',monospace",fontSize:"8px",cursor:"pointer",transition:"all .2s"}}>{ex}</button>
                  ))}
                </div>
              </>
            ):(
              <>
                <div style={{fontSize:"7px",letterSpacing:"3px",color:"#1a3a2a",marginBottom:"7px"}}>TARGET // WALLET ADDRESS · CONTRACT ADDRESS — AUTO CHAIN DETECT</div>
                <div style={{display:"flex",gap:"8px"}}>
                  <div style={{flex:1,position:"relative"}}>
                    <span style={{position:"absolute",left:"11px",top:"50%",transform:"translateY(-50%)",color:"#00aaff1a",fontSize:"12px"}}>⬢</span>
                    <input value={addrInput} onChange={e=>setAddrInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleScan()}
                      placeholder="0x... — auto-detects Ethereum, BSC, Arbitrum, Base, Polygon"
                      style={{width:"100%",padding:"11px 11px 11px 30px",background:"#040c18",border:"1px solid #0d1f2d",borderRadius:"2px",color:"#ccc",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px",outline:"none",transition:"border-color .2s"}}
                      onFocus={e=>e.target.style.borderColor="#00aaff33"} onBlur={e=>e.target.style.borderColor="#0d1f2d"}/>
                  </div>
                  <button className="sbtn" onClick={handleScan} disabled={isRunning||!addrInput.trim()||remaining===0}
                    style={{padding:"11px 20px",background:"#00aaff0a",border:"1px solid #00aaff33",borderRadius:"2px",color:"#00aaff",fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"2px",cursor:isRunning||!addrInput.trim()||remaining===0?"not-allowed":"pointer",opacity:isRunning||remaining===0?.5:1,whiteSpace:"nowrap",transition:"all .2s"}}>
                    {isRunning?"TRACING...":remaining===0?"LIMIT REACHED":"▶ TRACE"}
                  </button>
                </div>
                <div style={{marginTop:"7px",fontSize:"8px",color:"#1a3a2a"}}>No chain selection needed — scans all configured chains simultaneously</div>
              </>
            )}
          </div>

          {remaining<=3&&remaining>0&&(
            <div style={{padding:"8px 13px",background:"#181008",border:"1px solid #ffd70022",borderRadius:"2px",color:"#ffd700",fontSize:"9px",marginBottom:"12px",letterSpacing:"1px"}}>
              ⚠ {remaining} scan{remaining!==1?"s":""} remaining today — resets at midnight
            </div>
          )}

          {remaining===0&&(
            <div style={{padding:"10px 13px",background:"#180608",border:"1px solid #ff444422",borderRadius:"2px",color:"#ff5555",fontSize:"10px",marginBottom:"14px"}}>
              ⚠ Daily scan limit reached ({codeInfo.scansPerDay}/day). Your limit resets at midnight.
            </div>
          )}

          {error&&(
            <div style={{padding:"10px 13px",background:"#180608",border:"1px solid #ff444422",borderRadius:"2px",color:"#ff5555",fontSize:"10px",marginBottom:"14px"}}>⚠ {error}</div>
          )}

          {(isRunning||statusMsg)&&(
            <div style={{padding:"10px 13px",background:"#040c18",border:"1px solid #00ff9d15",borderRadius:"2px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"10px"}}>
              <span style={{display:"flex",gap:"3px"}}>{[0,1,2].map(i=><span key={i} style={{width:"4px",height:"4px",borderRadius:"50%",background:tab==="wallet"?"#00aaff":"#00ff9d",animation:`pulse 1s ${i*.2}s infinite`}}/>)}</span>
              <span style={{fontSize:"8px",letterSpacing:"2px",color:tab==="wallet"?"#00aaff":"#00ff9d"}}>{statusMsg||(tab==="wallet"?"TRACING ON-CHAIN ACTIVITY...":"SCANNING — QUERYING ALL INTELLIGENCE SOURCES...")}</span>
            </div>
          )}

          {hasResults&&(
            <div style={{animation:"fadeIn .4s ease"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"14px"}}>
                <div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:"11px",color:"#ccc",letterSpacing:"2px"}}>
                    {tab==="wallet"?"ON-CHAIN REPORT:":"OSINT REPORT:"}{" "}
                    <span style={{color:tab==="wallet"?"#00aaff":"#00ff9d"}}>{label.length>22?label.slice(0,20)+"...":label.toUpperCase()}</span>
                  </div>
                  <div style={{fontSize:"7px",color:"#1a3a2a",marginTop:"3px"}}>GENERATED {new Date().toUTCString().toUpperCase()}</div>
                  {tab==="wallet"&&scanMeta&&(
                    <div style={{marginTop:"8px",display:"flex",gap:"8px",flexWrap:"wrap"}}>
                      {[
                        {l:"TYPE",  v:scanMeta.isContract?"CONTRACT":"WALLET"},
                        {l:"TXS",   v:scanMeta.txCount?.toLocaleString()},
                        {l:"CHAINS",v:activeChains.length},
                        {l:"MIXER", v:scanMeta.mixerExposure?"⚠ DETECTED":"CLEAN",danger:scanMeta.mixerExposure},
                      ].map(s=>(
                        <div key={s.l} style={{padding:"5px 10px",background:"#040c18",border:`1px solid ${s.danger?"#ff444422":"#0d1f2d"}`,borderRadius:"2px"}}>
                          <div style={{fontSize:"6px",color:"#1a3a2a",letterSpacing:"2px"}}>{s.l}</div>
                          <div style={{fontSize:"10px",color:s.danger?"#ff4444":"#00ff9d",fontFamily:"'Space Mono',monospace",marginTop:"2px"}}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {tab==="wallet"&&activeChains.length>0&&(
                    <div style={{display:"flex",gap:"6px",marginTop:"8px",flexWrap:"wrap"}}>
                      {activeChains.map(c=>(
                        <div key={c.chain} style={{padding:"4px 10px",background:"#040c18",border:"1px solid #00ff9d22",borderRadius:"2px",display:"flex",gap:"7px",alignItems:"center"}}>
                          <span style={{width:"4px",height:"4px",borderRadius:"50%",background:"#00ff9d",boxShadow:"0 0 4px #00ff9d"}}/>
                          <span style={{fontSize:"8px",color:"#00ff9d",fontFamily:"'Space Mono',monospace"}}>{CHAINS[c.chain].label}</span>
                          <span style={{fontSize:"8px",color:"#3a6a4a"}}>{c.balance.toFixed(3)} {CHAINS[c.chain].symbol}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {score!==null&&<RiskMeter score={score} isRisk={tab==="wallet"}/>}
              </div>
            </div>
          )}

          {curSections.map(section=>{
            const content=sections[section.id],loading=loadingSecs[section.id];
            if(!content&&!loading) return null;
            return(
              <div key={section.id} style={{animation:content?"fadeIn .35s ease":"none"}}>
                <SectionCard section={section} content={content} isLoading={loading&&!content}/>
              </div>
            );
          })}

          {!hasResults&&!isRunning&&!error&&(
            <div style={{textAlign:"center",padding:"60px 20px",animation:"fadeIn .5s ease"}}>
              <div style={{fontSize:"40px",marginBottom:"12px",opacity:.06,color:tab==="wallet"?"#00aaff":"#00ff9d"}}>{tab==="wallet"?"⬢":"◆"}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"#1a3a2a",letterSpacing:"4px",marginBottom:"10px"}}>
                {tab==="wallet"?"AWAITING ADDRESS":"AWAITING TARGET"}
              </div>
              <div style={{fontSize:"10px",color:"#151f15",maxWidth:"340px",margin:"0 auto",lineHeight:2}}>
                {tab==="wallet"
                  ?"Paste any wallet or contract — auto-detects all chains, traces funding, maps affiliates, detects mixer use and deployer history."
                  :"Works for any project — from established protocols to brand new stealth launches. Maximum signal from minimum data."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

