// PassInterview — zero-dependency Node server (Node 18+)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const PUB = path.join(__dirname, 'public');
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const KEY = process.env.ANTHROPIC_API_KEY || '';

// ---------- DB ----------
const DEFAULT_PLANS = [
  { id: 'free', name: 'Free', price: 0, yearly: 0, limits: { sessions: 2, answers: 10, tools: 5 }, features: ['2 mock interviews/mo', '10 live answers/mo', '5 prep tools/mo'] },
  { id: 'starter', name: 'Starter', price: 9, yearly: 7, limits: { sessions: 15, answers: 100, tools: 50 }, features: ['15 mock interviews/mo', '100 live answers/mo', '50 prep tools/mo', 'Answer bank'] },
  { id: 'pro', name: 'Pro', price: 24, yearly: 18, limits: { sessions: 60, answers: 500, tools: 300 }, features: ['60 mock interviews/mo', '500 live answers/mo', '300 prep tools/mo', 'Coding & system design', 'Priority AI'] },
  { id: 'elite', name: 'Elite', price: 49, yearly: 39, limits: { sessions: -1, answers: 2000, tools: -1 }, features: ['Unlimited mock interviews', '2000 live answers/mo', 'Unlimited prep tools', 'Everything in Pro'] },
];
let db = { users: [], plans: DEFAULT_PLANS, sessions: [], bank: [], docs: [], codes: [], tokens: {}, events: [] };
if (fs.existsSync(DB_FILE)) db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
const save = () => { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db)); };
const uid = () => crypto.randomBytes(8).toString('hex');
const month = () => new Date().toISOString().slice(0, 7);
function hash(pw, salt = crypto.randomBytes(8).toString('hex')) { return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); }
function check(pw, h) { const [s] = h.split(':'); return hash(pw, s) === h; }

// Seed admin (unlimited, full access)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'gourav8jain@gmail.com').toLowerCase();
if (!db.users.some(u => u.role === 'admin')) {
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('hex');
  db.users.push({ id: uid(), email: ADMIN_EMAIL, name: 'Admin', pass: hash(pw), role: 'admin', plan: 'elite', disabled: false, created: Date.now(), usage: {}, profile: {} });
  save();
  console.log(`\n  ADMIN CREATED  email: ${ADMIN_EMAIL}  password: ${pw}\n  (set ADMIN_PASSWORD env var to choose your own before first run)\n`);
}

// ---------- usage / limits ----------
function usage(u) { if (!u.usage || u.usage.m !== month()) u.usage = { m: month(), sessions: 0, answers: 0, tools: 0 }; return u.usage; }
function limitsOf(u) {
  if (u.role === 'admin') return { sessions: -1, answers: -1, tools: -1 };
  return (db.plans.find(p => p.id === u.plan) || db.plans[0]).limits;
}
function consume(u, kind) {
  const us = usage(u), lim = limitsOf(u)[kind];
  if (lim !== -1 && us[kind] >= lim) { if ((u.bonus || 0) > 0) { u.bonus--; db.events.push({ t: Date.now(), u: u.id, k: kind }); save(); return true; } return false; }
  us[kind]++; db.events.push({ t: Date.now(), u: u.id, k: kind }); save(); return true;
}
const pub = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan, disabled: u.disabled, created: u.created, profile: u.profile, usage: usage(u), limits: limitsOf(u), bonus: u.bonus || 0, ref: 'REF-' + u.id.slice(0, 6) });

// ---------- AI ----------
const MODELS = (process.env.AI_MODELS || 'claude-sonnet-5-5,claude-opus-5-5,claude-haiku-5-5').split(',');
async function ai(system, user, max = 900, o = {}) {
  if (!KEY && process.env.OPENAI_API_KEY) {
    try {
      const r = await fetch((process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/chat/completions', {
        method: 'POST', headers: { authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens: max, messages: [{ role: 'system', content: system }, { role: 'user', content: o.image ? [{ type: 'image_url', image_url: { url: o.image } }, { type: 'text', text: user || 'Answer the question shown in this image.' }] : user }] }),
      });
      const j = await r.json(); return j.choices && j.choices[0].message.content;
    } catch (e) { return null; }
  }
  if (!KEY) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELS.includes(o.model) ? o.model : MODEL, max_tokens: max, system, messages: [{ role: 'user', content: o.image ? [{ type: 'image', source: { type: 'base64', media_type: (o.image.match(/^data:(.+?);/) || [])[1] || 'image/png', data: o.image.split(',')[1] } }, { type: 'text', text: user || 'Answer the question shown in this image.' }] : user }] }),
    });
    const j = await r.json();
    return j.content && j.content[0] && j.content[0].text;
  } catch (e) { return null; }
}
const demoNote = '\n\n_(Demo mode: set ANTHROPIC_API_KEY on the server for real AI responses.)_';
function fallbackAnswer(q, role) {
  return `**Quick structure (STAR):**\n- **Situation:** one line of context relevant to "${q.slice(0, 80)}".\n- **Task:** what you owned as ${role || 'the candidate'}.\n- **Action:** 2–3 concrete steps you took, with the tools/decisions.\n- **Result:** a measurable outcome (%, $, time saved) and what you learned.` + demoNote;
}

async function handleAI(kind, b, user) {
  const docs = db.docs.filter(d => d.uid === user.id && (!b.docIds || b.docIds.includes(d.id))).map(d => `# ${d.title}\n${d.text}`).join('\n\n').slice(0, 8000);
  const lang = b.lang && b.lang !== 'English' ? ` Respond in ${b.lang}.` : '';
  const ctx = `Role: ${b.role || 'general'}. Level: ${b.level || 'mid'}. Mode: ${b.mode || 'interview'}.${lang} Candidate background: ${(user.profile.resume || '').slice(0, 2500)}. Standing instructions from the user: ${(user.profile.instructions || '').slice(0, 4000)}.${docs ? ' Reference documents:\n' + docs : ''}`;
  const o = { model: b.model, image: b.image };
  if (kind === 'answer') {
    const style = b.style === 'detailed' ? 'a detailed, structured answer' : 'a concise answer (max 120 words) in spoken-friendly language with bullet cues';
    const out = await ai(`You are an interview coach helping a candidate prepare and practise. ${ctx}. Give ${style}. Use STAR for behavioural questions; for technical give approach, complexity and trade-offs. Be honest: don't invent employers or numbers — use placeholders like [metric] where the candidate must fill in real facts.`, b.question, 700, o);
    if (!out && b.image) return { text: 'Image questions need ANTHROPIC_API_KEY (vision).' };
    return { text: out || fallbackAnswer(b.question, b.role) };
  }
  if (kind === 'feedback') {
    const out = await ai(`You are a strict but kind interview coach. ${ctx}. Evaluate the answer. Return: Score /10, Strengths, Gaps, Filler/clarity notes, and an improved version.`, `Question: ${b.question}\n\nAnswer: ${b.answer}`, 800);
    if (out) return { text: out, score: +(out.match(/(\d+(?:\.\d)?)\s*\/\s*10/) || [0, 6])[1] };
    const words = (b.answer || '').split(/\s+/).filter(Boolean).length;
    const fillers = ((b.answer || '').match(/\b(um|uh|like|basically|actually|you know)\b/gi) || []).length;
    const star = ['situation', 'task', 'action', 'result'].filter(w => new RegExp(w, 'i').test(b.answer || '')).length;
    const score = Math.max(2, Math.min(9, 3 + Math.min(words / 40, 3) + star * 0.6 - fillers * 0.3));
    return { score: +score.toFixed(1), text: `**Score: ${score.toFixed(1)}/10**\n- Length: ${words} words ${words < 50 ? '(too short — add detail)' : words > 220 ? '(long — tighten)' : '(good)'}\n- Filler words: ${fillers}\n- STAR elements detected: ${star}/4\n- Tip: end with a quantified result.` + demoNote };
  }
  if (kind === 'interview') {
    const h = (b.history || []).map(m => `${m.r === 'q' ? 'Interviewer' : 'Candidate'}: ${m.t}`).join('\n');
    const out = await ai(`You are a realistic ${b.type || 'behavioural'} interviewer for a ${b.level || 'mid'}-level ${b.role || 'software engineer'} at ${b.company || 'a top tech company'}. ${ctx}. Ask exactly ONE next question (a short follow-up if the last answer was vague). Output only the question.`, h || 'Begin the interview with a brief greeting and the first question.', 200);
    const bank = ['Tell me about yourself.', 'Describe a time you handled a conflict with a teammate.', 'Tell me about your most challenging project and your exact contribution.', 'How do you prioritise when everything is urgent?', 'Describe a failure and what you changed afterwards.', 'Why do you want this role?'];
    const n = (b.history || []).filter(m => m.r === 'q').length;
    return { text: out || bank[n % bank.length] };
  }
  if (kind === 'questions') {
    const out = await ai(`Generate 10 likely interview questions (mix behavioural/technical) tailored to this resume and job description, each with a one-line "what they're testing" note. Numbered list.`, `RESUME:\n${(b.resume || user.profile.resume || '').slice(0, 4000)}\n\nJOB DESCRIPTION:\n${(b.jd || '').slice(0, 4000)}`, 1200);
    return { text: out || '1. Walk me through your background.\n2. Why this role?\n3. Biggest technical challenge you solved?\n4. Tell me about a conflict.\n5. How do you measure success?\n6. A time you failed.\n7. A decision made with incomplete data.\n8. How do you mentor others?\n9. System you would redesign?\n10. Questions for us?' + demoNote };
  }
  if (kind === 'code') {
    const out = await ai(`You are a senior engineer coaching a coding interview. For the problem: clarifying questions, approach, ${b.lang || 'Python'} solution, complexity, edge cases, and how to explain it aloud.`, b.problem, 1400);
    return { text: out || `**Approach template**\n1. Clarify inputs/constraints.\n2. Brute force → optimise (hash map / two pointers / DP).\n3. Code in ${b.lang || 'Python'}.\n4. State time/space complexity.\n5. Test edge cases (empty, duplicates, large).` + demoNote };
  }
  if (kind === 'system') {
    const out = await ai(`You are coaching a system design interview. Give: requirements, capacity estimates, high-level architecture, data model, scaling/bottlenecks, trade-offs.`, b.problem, 1400);
    return { text: out || '**Framework:** Requirements → Estimates → API → Data model → High-level design → Deep dive → Bottlenecks & trade-offs.' + demoNote };
  }
  if (kind === 'resume') {
    const out = await ai(`Review this resume for the target role. Give ATS score /100, top 5 fixes, and 3 rewritten bullet examples with [metric] placeholders.`, `Target: ${b.role}\n\n${(b.resume || user.profile.resume || '').slice(0, 5000)}`, 1000);
    return { text: out || 'Add measurable outcomes to each bullet, mirror JD keywords, keep to 1–2 pages, lead bullets with strong verbs.' + demoNote };
  }
  if (kind === 'chips') {
    const out = await ai(`Suggest 4 short follow-up questions the interviewer/other party might ask next (or the candidate should ask). One per line, no numbering.`, `Last question: ${b.question}\nAnswer given: ${(b.answer || '').slice(0, 1500)}`, 200, o);
    const lines = (out || '').split('\n').map(x => x.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 4);
    return { chips: lines.length ? lines : ['Can you give a concrete example?', 'What was the measurable result?', 'What would you do differently?', 'How did you work with the team?'] };
  }
  if (kind === 'notes') {
    const out = await ai(`Summarise this call/interview transcript. Return a meeting report: Summary (3 bullets), Key questions asked, Decisions made, Action items (owner if known), Follow-ups to send, What went well, What to improve.`, (b.transcript || '').slice(0, 20000), 900, o);
    return { text: out || '**Summary (demo)**\n- Transcript saved. Add an API key for AI notes.' + demoNote };
  }
  if (kind === 'chat') {
    const out = await ai(`You are an in-session assistant. Answer the user's follow-up using the transcript so far. ${ctx}`, `TRANSCRIPT:\n${(b.transcript || '').slice(-8000)}\n\nUSER: ${b.question}`, 700, o);
    return { text: out || 'Chat needs ANTHROPIC_API_KEY.' };
  }
  if (kind === 'diagram') {
    const out = await ai(`Produce a system-design diagram as valid Mermaid flowchart code ONLY (start with "flowchart LR"), no prose, no code fences. Then on a new line after "---" give 5 short talking points.`, b.problem, 900, o);
    return { text: out || 'flowchart LR\n  Client-->LB[Load balancer]-->API-->Cache\n  API-->DB[(Database)]\n---\n- Add API key for tailored diagrams' };
  }
  if (kind === 'resumegen') {
    const out = await ai(`Write a polished ATS-friendly resume in Markdown for the target role from the candidate's details. Do not invent facts; use [metric] placeholders.`, `Target: ${b.role}\n\nDetails:\n${(b.resume || user.profile.resume || '').slice(0, 5000)}`, 1500, o);
    return { text: out || '# Your Name\n(Add an API key to generate a full resume.)' };
  }
  if (kind === 'followup') {
    const out = await ai(`Write a concise, polite post-interview thank-you/follow-up email.`, `Role: ${b.role}\nInterviewer: ${b.interviewer}\nNotes: ${b.notes}`, 400);
    return { text: out || `Hi ${b.interviewer || 'there'},\n\nThank you for your time today. I enjoyed discussing the ${b.role} role and remain very interested. Happy to share anything further.\n\nBest regards` };
  }
  return { text: 'Unknown tool' };
}

// ---------- http helpers ----------
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 9e6) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const rate = {};
function limited(ip) { const n = Date.now(), a = (rate[ip] = (rate[ip] || []).filter(t => n - t < 60000)); a.push(n); return a.length > 120; }

const server = http.createServer(async (req, res) => {
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (!p.startsWith('/api/')) {
    let f = path.join(PUB, p === '/' ? 'index.html' : p);
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'text/plain' });
    return fs.createReadStream(f).pipe(res);
  }
  if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'Too many requests' });
  const b = req.method === 'GET' ? {} : await body(req);
  const tok = (req.headers.authorization || '').replace('Bearer ', '');
  const user = db.users.find(u => u.id === db.tokens[tok]);
  const need = () => { if (!user || user.disabled) { send(res, 401, { error: 'Please sign in' }); return false; } return true; };
  const admin = () => { if (!need()) return false; if (user.role !== 'admin') { send(res, 403, { error: 'Admin only' }); return false; } return true; };
  try {
    if (p === '/api/plans') return send(res, 200, db.plans);
    if (p === '/api/models') return send(res, 200, MODELS);
    if (p === '/api/signup' && req.method === 'POST') {
      const email = (b.email || '').toLowerCase().trim();
      if (!/^\S+@\S+\.\S+$/.test(email) || (b.password || '').length < 8) return send(res, 400, { error: 'Valid email and 8+ char password required' });
      if (db.users.some(u => u.email === email)) return send(res, 400, { error: 'Email already registered' });
      const u = { id: uid(), email, name: b.name || email.split('@')[0], pass: hash(b.password), role: 'user', plan: 'free', disabled: false, created: Date.now(), usage: {}, profile: {}, bonus: 10 };
      db.users.push(u); const t = uid() + uid(); db.tokens[t] = u.id; save();
      return send(res, 200, { token: t, user: pub(u) });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const u = db.users.find(x => x.email === (b.email || '').toLowerCase().trim());
      if (!u || !check(b.password || '', u.pass)) return send(res, 401, { error: 'Invalid credentials' });
      if (u.disabled) return send(res, 403, { error: 'Account disabled' });
      const t = uid() + uid(); db.tokens[t] = u.id; save();
      return send(res, 200, { token: t, user: pub(u) });
    }
    if (p === '/api/me') return need() && send(res, 200, pub(user));
    if (p === '/api/profile' && req.method === 'PUT') { if (!need()) return; user.profile = { ...user.profile, ...b }; if (b.name) user.name = b.name; save(); return send(res, 200, pub(user)); }
    if (p === '/api/plan' && req.method === 'POST') {
      if (!need()) return;
      const plan = db.plans.find(x => x.id === b.plan); if (!plan) return send(res, 400, { error: 'Unknown plan' });
      // Payment hook: when STRIPE_SECRET_KEY is set, create a Checkout Session here and return its URL instead.
      if (plan.price > 0 && user.role !== 'admin' && !process.env.ALLOW_FREE_UPGRADE) return send(res, 402, { error: 'Payment required — connect Stripe (see README) or set ALLOW_FREE_UPGRADE=1 for testing' });
      user.plan = plan.id; save(); return send(res, 200, pub(user));
    }
    const m = p.match(/^\/api\/ai\/(\w+)$/);
    if (m && req.method === 'POST') {
      if (!need()) return;
      const kind = m[1], bucket = kind === 'answer' ? 'answers' : (kind === 'interview' || kind === 'chips') ? null : 'tools';
      if (bucket && !consume(user, bucket)) return send(res, 402, { error: `Monthly ${bucket} limit reached — upgrade your plan`, upgrade: true });
      return send(res, 200, await handleAI(kind, b, user));
    }
    if (p === '/api/sessions' && req.method === 'POST') {
      if (!need()) return;
      if (!consume(user, 'sessions')) return send(res, 402, { error: 'Monthly mock-interview limit reached — upgrade your plan', upgrade: true });
      const s = { id: uid(), uid: user.id, t: Date.now(), role: b.role, type: b.type, level: b.level, company: b.company, turns: [], score: null };
      db.sessions.push(s); save(); return send(res, 200, s);
    }
    if (p === '/api/sessions' && req.method === 'GET') { if (!need()) return; return send(res, 200, db.sessions.filter(s => s.uid === user.id).reverse()); }
    const sm = p.match(/^\/api\/sessions\/(\w+)$/);
    if (sm && req.method === 'PUT') { if (!need()) return; const s = db.sessions.find(x => x.id === sm[1] && x.uid === user.id); if (!s) return send(res, 404, {}); Object.assign(s, { turns: b.turns, score: b.score }); save(); return send(res, 200, s); }
    if (p === '/api/bank') {
      if (!need()) return;
      if (req.method === 'GET') return send(res, 200, db.bank.filter(x => x.uid === user.id));
      if (req.method === 'POST') {
        if (user.role !== 'admin' && user.plan === 'free') return send(res, 402, { error: 'Answer bank needs a paid plan', upgrade: true });
        const it = { id: uid(), uid: user.id, q: b.q, a: b.a, tag: b.tag || '' }; db.bank.push(it); save(); return send(res, 200, it);
      }
    }
    const bm = p.match(/^\/api\/bank\/(\w+)$/);
    if (bm && req.method === 'DELETE') { if (!need()) return; db.bank = db.bank.filter(x => !(x.id === bm[1] && x.uid === user.id)); save(); return send(res, 200, {}); }
    if (p === '/api/stt' && req.method === 'POST') {
      if (!need()) return;
      const key = process.env.STT_API_KEY || process.env.OPENAI_API_KEY;
      if (!key) return send(res, 501, { error: 'Speech-to-text not configured (set STT_API_KEY, optional STT_BASE_URL / STT_MODEL)' });
      const fd = new FormData(); fd.append('file', new Blob([Buffer.from(b.audio || '', 'base64')], { type: b.mime || 'audio/webm' }), 'a.webm'); fd.append('model', process.env.STT_MODEL || 'whisper-1');
      const r = await fetch((process.env.STT_BASE_URL || 'https://api.openai.com/v1') + '/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: fd });
      const j = await r.json().catch(() => ({})); return send(res, r.ok ? 200 : 502, { text: j.text || '', error: j.error && j.error.message });
    }
    if (p === '/api/docs') {
      if (!need()) return;
      if (req.method === 'GET') return send(res, 200, db.docs.filter(d => d.uid === user.id).map(d => ({ id: d.id, title: d.title, size: d.text.length })));
      if (req.method === 'POST') { if (!b.text) return send(res, 400, { error: 'Empty document' }); const d = { id: uid(), uid: user.id, title: (b.title || 'Untitled').slice(0, 80), text: String(b.text).slice(0, 50000) }; db.docs.push(d); save(); return send(res, 200, { id: d.id, title: d.title }); }
    }
    const dm = p.match(/^\/api\/docs\/(\w+)$/);
    if (dm && req.method === 'DELETE') { if (!need()) return; db.docs = db.docs.filter(d => !(d.id === dm[1] && d.uid === user.id)); save(); return send(res, 200, {}); }
    if (p === '/api/transcripts' && req.method === 'POST') {
      if (!need()) return;
      const s = { id: uid(), uid: user.id, t: Date.now(), role: b.role, type: b.mode || 'copilot', turns: b.turns || [], notes: b.notes || '', score: null };
      db.sessions.push(s); save(); return send(res, 200, s);
    }
    const sd = p.match(/^\/api\/sessions\/(\w+)$/);
    if (sd && req.method === 'DELETE') { if (!need()) return; db.sessions = db.sessions.filter(x => !(x.id === sd[1] && x.uid === user.id)); save(); return send(res, 200, {}); }
    if (p === '/api/redeem' && req.method === 'POST') {
      if (!need()) return; const code = (b.code || '').trim().toUpperCase(); user.redeemed = user.redeemed || [];
      if (user.redeemed.includes(code)) return send(res, 400, { error: 'Code already used' });
      let credits = 0;
      if (code.startsWith('REF-')) {
        const r = db.users.find(x => 'REF-' + x.id.slice(0, 6) === code && x.id !== user.id); if (!r) return send(res, 400, { error: 'Invalid code' });
        r.bonus = (r.bonus || 0) + 20; credits = 20;
      } else {
        const c = db.codes.find(x => x.code === code); if (!c || (c.max && c.uses >= c.max)) return send(res, 400, { error: 'Invalid or expired code' });
        c.uses++; credits = c.credits;
      }
      user.bonus = (user.bonus || 0) + credits; user.redeemed.push(code); save(); return send(res, 200, { credits, user: pub(user) });
    }
    // ---- admin ----
    if (p === '/api/admin/codes') {
      if (!admin()) return;
      if (req.method === 'GET') return send(res, 200, db.codes);
      if (req.method === 'POST') { db.codes.push({ code: String(b.code).toUpperCase(), credits: +b.credits || 10, max: +b.max || 0, uses: 0 }); save(); return send(res, 200, db.codes); }
    }
    const ac = p.match(/^\/api\/admin\/codes\/(\w+)$/);
    if (ac && req.method === 'DELETE') { if (!admin()) return; db.codes = db.codes.filter(c => c.code !== ac[1].toUpperCase()); save(); return send(res, 200, db.codes); }
    if (p === '/api/admin/users' && req.method === 'GET') return admin() && send(res, 200, db.users.map(pub));
    const au = p.match(/^\/api\/admin\/users\/(\w+)$/);
    if (au && req.method === 'PATCH') {
      if (!admin()) return; const u = db.users.find(x => x.id === au[1]); if (!u) return send(res, 404, {});
      for (const k of ['plan', 'role', 'disabled']) if (k in b) u[k] = b[k];
      if (b.resetUsage) u.usage = {};
      if (b.password) u.pass = hash(b.password);
      save(); return send(res, 200, pub(u));
    }
    if (p === '/api/admin/plans' && req.method === 'PUT') { if (!admin()) return; db.plans = b.plans; save(); return send(res, 200, db.plans); }
    if (p === '/api/admin/stats') {
      if (!admin()) return;
      const paid = db.users.filter(u => u.plan !== 'free' && u.role !== 'admin');
      const mrr = paid.reduce((s, u) => s + ((db.plans.find(x => x.id === u.plan) || {}).price || 0), 0);
      const days = {}; db.events.filter(e => Date.now() - e.t < 14 * 864e5).forEach(e => { const d = new Date(e.t).toISOString().slice(5, 10); days[d] = (days[d] || 0) + 1; });
      return send(res, 200, { users: db.users.length, paid: paid.length, mrr, sessions: db.sessions.length, events: db.events.length, byPlan: db.plans.map(pl => ({ plan: pl.name, n: db.users.filter(u => u.plan === pl.id).length })), days });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) { console.error(e); send(res, 500, { error: 'Server error' }); }
});
server.listen(PORT, () => console.log(`PassInterview running on http://localhost:${PORT}  (AI: ${KEY ? 'live' : 'demo mode'})`));
