// PassInterview — mobile-first SPA (vanilla JS)
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_\((.+?)\)_/g, '<i>($1)</i>');
let S = { token: localStorage.tok || '', me: null, plans: [] };
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2600); };
async function api(path, method = 'GET', body) {
  const r = await fetch((window.API_BASE || '') + '/api' + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + S.token }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401) { logout(true); } if (j.upgrade) { toast(j.error); location.hash = '#/plans'; } throw new Error(j.error || 'Error'); }
  return j;
}
function logout(silent) { localStorage.removeItem('tok'); S.token = ''; S.me = null; if (!silent) toast('Signed out'); location.hash = '#/login'; }
const left = (k) => { const l = S.me.limits[k], u = S.me.usage[k]; return l === -1 ? '∞' : Math.max(0, l - u); };
const meter = k => { const l = S.me.limits[k], u = S.me.usage[k]; return `<div class="mut">${k}: ${u}${l === -1 ? ' used · unlimited' : ' / ' + l}</div><div class="bar"><i style="width:${l === -1 ? 8 : Math.min(100, u / l * 100)}%"></i></div>`; };

// ---------- shell ----------
const TABS = [['home', '🏠', 'Home'], ['mock', '🎤', 'Mock'], ['copilot', '⚡', 'Copilot'], ['prep', '📚', 'Prep'], ['plans', '💳', 'Plans']];
function shell(active, html) {
  const tabs = [...TABS, ...(S.me.role === 'admin' ? [['admin', '🛠', 'Admin']] : [])];
  $('#app').innerHTML = `<div class="row sp"><h1>Pass<span style="color:var(--ac)">Interview</span></h1><div class="row"><span class="pill">${S.me.role === 'admin' ? 'ADMIN · unlimited' : esc(S.me.plan)}</span><button class="sec" onclick="logout()">Out</button></div></div>${html}<nav>${tabs.map(t => `<a href="#/${t[0]}" class="${t[0] === active ? 'on' : ''}"><span>${t[1]}</span>${t[2]}</a>`).join('')}</nav>`;
}
const field = (id, label, ph = '', tag = 'input', type = 'text') => `<label class="mut">${label}</label>` + (tag === 'input' ? `<input id="${id}" type="${type}" placeholder="${esc(ph)}">` : `<textarea id="${id}" placeholder="${esc(ph)}"></textarea>`);
const val = id => $('#' + id).value.trim();
async function run(btn, fn) { const o = btn.textContent; btn.disabled = true; btn.textContent = '…'; try { await fn(); } catch (e) { toast(e.message); } btn.disabled = false; btn.textContent = o; }

// ---------- auth ----------
function login(mode = 'login') {
  $('#app').innerHTML = `<div style="margin-top:8vh"><h1>Pass<span style="color:var(--ac)">Interview</span></h1><p class="mut">AI mock interviews, live practice copilot, and prep tools.</p>
  <div class="card">${mode === 'signup' ? field('n', 'Name') : ''}${field('e', 'Email', 'you@email.com', 'input', 'email')}${field('p', 'Password (8+ chars)', '', 'input', 'password')}
  <button class="btn-full" id="go">${mode === 'signup' ? 'Create account' : 'Sign in'}</button>
  <p class="mut" style="margin-top:10px;text-align:center"><a href="#/${mode === 'signup' ? 'login' : 'signup'}" style="color:var(--ac)">${mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create account (free)'}</a></p></div></div>`;
  $('#go').onclick = e => run(e.target, async () => {
    const r = await api('/' + mode, 'POST', { name: mode === 'signup' ? val('n') : undefined, email: val('e'), password: val('p') });
    S.token = r.token; localStorage.tok = r.token; S.me = r.user; location.hash = '#/home'; route();
  });
}

// ---------- home ----------
function home() {
  shell('home', `<div class="card"><h2>Hi ${esc(S.me.name)} 👋</h2><div class="mut">This month</div>${meter('sessions')}${meter('answers')}${meter('tools')}</div>
  <div class="card"><h3>Your profile (powers personalised answers)</h3>${field('role', 'Target role', 'e.g. Senior Backend Engineer')}${field('level', 'Level', 'junior / mid / senior / lead')}${field('resume', 'Paste your resume / key experience', '', 'textarea')}${field('instr', 'Standing instructions for the AI (max 20,000 chars)', 'Tone, projects to emphasise, things to avoid…', 'textarea')}<button id="sv" class="btn-full">Save profile</button></div>
  <div class="card"><h3>📎 Documents</h3><p class="mut">Upload notes, briefs, playbooks (.txt/.md/.csv) — the AI references them in answers.</p><input type="file" id="df" accept=".txt,.md,.csv,.json"><div id="dl" class="mut"></div></div>
  <div class="card"><h3>🎁 Credits &amp; codes</h3><p class="mut">Bonus credits: <b>${S.me.bonus}</b> · Your referral code: <b>${S.me.ref}</b> (friend + you get 20 credits)</p><div class="row"><input id="cd" placeholder="Enter promo / referral code" style="flex:1"><button id="rd">Redeem</button></div></div>
  <div class="card"><h3>Quick start</h3><div class="row"><button onclick="location.hash='#/mock'">🎤 Mock interview</button><button class="sec" onclick="location.hash='#/copilot'">⚡ Live copilot</button><button class="sec" onclick="location.hash='#/prep'">📚 Prep tools</button></div></div>
  <div class="card"><div class="row sp"><h3>History</h3><button class="sec" id="ex">Export all</button></div><input id="hs" placeholder="Search sessions…"><div id="hist" class="mut">Loading…</div></div>`);
  const p = S.me.profile || {}; $('#role').value = p.role || ''; $('#level').value = p.level || ''; $('#resume').value = p.resume || '';
  $('#instr').value = p.instructions || '';
  $('#sv').onclick = e => run(e.target, async () => { S.me = await api('/profile', 'PUT', { role: val('role'), level: val('level'), resume: val('resume'), instructions: val('instr').slice(0, 20000) }); toast('Saved'); });
  const dl = () => api('/docs').then(l => $('#dl').innerHTML = l.map(d => `${esc(d.title)} (${d.size} chars) <a href="#" data-d="${d.id}" style="color:var(--bad)">remove</a><br>`).join('') || 'No documents.').then(() => document.querySelectorAll('[data-d]').forEach(a => a.onclick = ev => { ev.preventDefault(); api('/docs/' + a.dataset.d, 'DELETE').then(dl); })); dl();
  $('#df').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await api('/docs', 'POST', { title: f.name, text: await f.text() }); toast('Uploaded'); dl(); } catch (er) { toast(er.message); } e.target.value = ''; };
  $('#rd').onclick = e => run(e.target, async () => { const r = await api('/redeem', 'POST', { code: val('cd') }); S.me = r.user; toast('+' + r.credits + ' credits'); home(); });
  $('#ex').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(window._sess || [], null, 1)], { type: 'application/json' })); a.download = 'passinterview-history.json'; a.click(); };
  $('#hs').oninput = () => { const q = val('hs').toLowerCase(); document.querySelectorAll('#hist tr').forEach((tr, i) => { const x = _sess[i]; tr.style.display = !q || JSON.stringify(x).toLowerCase().includes(q) ? '' : 'none'; }); };
  api('/sessions').then(l => { window._sess = l; $('#hist').innerHTML = l.length ? '<table>' + l.slice(0, 15).map((s, i) => `<tr><td>${new Date(s.t).toLocaleDateString()}</td><td>${esc(s.role)} · ${esc(s.type)}</td><td>${s.score ? s.score + '/10' : '—'}</td><td><a href="#" data-v="${i}" style="color:var(--ac)">view</a></td></tr>`).join('') + '</table><div id="tv"></div>' : 'No sessions yet.'; document.querySelectorAll('[data-v]').forEach(a => a.onclick = ev => { ev.preventDefault(); viewSess(_sess[a.dataset.v]); }); });
}

function transcriptText(turns) { return turns.map(t => (t.r === 'q' ? 'Q: ' : 'A: ') + t.t).join('\n\n'); }
function viewSess(x) {
  $('#tv').innerHTML = `<div class="card"><b>${esc(x.role)} · ${esc(x.type)}</b>${x.notes ? `<div class="out">${md(x.notes)}</div>` : ''}<div class="out">${esc(transcriptText(x.turns || []))}</div><div class="row"><button class="sec" onclick="dlText(_sess.find(s=>s.id==='${x.id}'))">Download</button><button class="bad" onclick="api('/sessions/${x.id}','DELETE').then(home)">Delete</button></div></div>`;
}
window.dlText = x => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([(x.notes ? x.notes + '\n\n---\n\n' : '') + transcriptText(x.turns || [])], { type: 'text/plain' })); a.download = 'transcript-' + new Date(x.t).toISOString().slice(0, 10) + '.txt'; a.click(); };
const LANGS = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Chinese', 'Japanese', 'Korean', 'Arabic', 'Italian', 'Russian', 'Turkish', 'Dutch', 'Indonesian'];
const SPEECH_LANG = { English: 'en-US', Hindi: 'hi-IN', Spanish: 'es-ES', French: 'fr-FR', German: 'de-DE', Portuguese: 'pt-BR', Chinese: 'zh-CN', Japanese: 'ja-JP', Korean: 'ko-KR', Arabic: 'ar-SA', Italian: 'it-IT', Russian: 'ru-RU', Turkish: 'tr-TR', Dutch: 'nl-NL', Indonesian: 'id-ID' };

// ---------- speech ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(onText, onState, lang) {
  if (!SR) { toast('Voice not supported in this browser — type instead'); return null; }
  const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = lang || 'en-US';
  let fin = '';
  r.onresult = e => { let i = ''; for (let k = e.resultIndex; k < e.results.length; k++) { const t = e.results[k][0].transcript; if (e.results[k].isFinal) fin += t + ' '; else i += t; } onText(fin + i, fin); };
  r.onend = () => onState(false); r.onerror = () => onState(false); r.start(); onState(true); return r;
}
const speak = t => { if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } };

// ---------- mock interview ----------
function mock() {
  const p = S.me.profile || {};
  shell('mock', `<div class="card"><h2>🎤 AI mock interview</h2>${field('r', 'Role', 'Software Engineer')}${field('c', 'Company (optional)', 'Google')}
  <label class="mut">Type</label><select id="t"><option>behavioural</option><option>technical</option><option>system design</option><option>case / product</option><option>HR round</option></select>
  <label class="mut">Level</label><select id="l"><option>junior</option><option selected>mid</option><option>senior</option><option>lead</option></select>
  <button class="btn-full" id="st">Start interview</button></div><div id="room"></div>`);
  $('#r').value = p.role || ''; if (p.level) $('#l').value = p.level;
  $('#st').onclick = e => run(e.target, async () => {
    const cfg = { role: val('r') || 'Software Engineer', company: val('c'), type: $('#t').value, level: $('#l').value };
    const sess = await api('/sessions', 'POST', cfg); room(sess, cfg);
  });
}
async function room(sess, cfg) {
  const turns = []; let rec = null, scores = [];
  $('#room').innerHTML = `<div class="card"><div id="chat"></div><textarea id="ans" placeholder="Type your answer, or tap the mic…"></textarea>
  <div class="row sp"><button class="mic sec" id="mic">🎙</button><div class="row"><button id="send">Submit answer</button><button class="ok" id="fin">Finish</button></div></div></div><div id="rep"></div>`;
  const add = (cls, h) => { $('#chat').insertAdjacentHTML('beforeend', `<div class="msg ${cls}">${h}</div>`); scrollTo(0, document.body.scrollHeight); };
  const ask = async () => { const r = await api('/ai/interview', 'POST', { ...cfg, history: turns }); turns.push({ r: 'q', t: r.text }); add('q', md(r.text)); speak(r.text); };
  await ask();
  $('#mic').onclick = () => { if (rec) { rec.stop(); rec = null; return; } rec = listen(t => $('#ans').value = t, on => { $('#mic').classList.toggle('live', on); if (!on) rec = null; }); };
  $('#send').onclick = e => run(e.target, async () => {
    const a = val('ans'); if (!a) return; if (rec) rec.stop();
    const q = turns.filter(x => x.r === 'q').pop().t; turns.push({ r: 'a', t: a }); add('a', esc(a)); $('#ans').value = '';
    const f = await api('/ai/feedback', 'POST', { ...cfg, question: q, answer: a }); scores.push(f.score); add('q', '<b>Feedback</b><br>' + md(f.text)); await ask();
  });
  $('#fin').onclick = e => run(e.target, async () => {
    const avg = scores.length ? +(scores.reduce((x, y) => x + y, 0) / scores.length).toFixed(1) : null;
    await api('/sessions/' + sess.id, 'PUT', { turns, score: avg }); $('#room').innerHTML = `<div class="card"><h2>Session complete</h2><p>Average score: <b>${avg ?? '—'}/10</b> over ${scores.length} answers.</p><button onclick="location.hash='#/home'">Back home</button></div>`;
  });
}

// ---------- live copilot (visible, in-app) ----------
async function copilot() {
  const p = S.me.profile || {}; const models = await api('/models'); const docs = await api('/docs');
  shell('copilot', `<div class="card"><h2>⚡ Live copilot</h2><p class="mut">Hotkeys: Alt+A answer · Alt+M mic · Alt+L listen · Alt+C clear. Listens to a question and drafts a speakable answer from your profile, instructions and documents. Use for practice, mock calls, or interviews where notes/AI assistance are allowed — follow the rules of the interview you're in.</p>
  <div class="row"><select id="mode" style="flex:1"><option value="interview">Interview mode</option><option value="call">Regular call mode</option></select><select id="model" style="flex:1">${models.map(m => `<option>${m}</option>`).join('')}</select></div>
  <div class="row"><select id="lang" style="flex:1">${LANGS.map(l => `<option>${l}</option>`).join('')}</select><select id="sty" style="flex:1"><option value="concise">Concise</option><option value="detailed">Detailed</option></select></div>
  ${field('role', 'Role', 'Software Engineer')}
  ${docs.length ? `<div class="mut">Documents to use:</div>${docs.map(d => `<label class="row"><input type="checkbox" class="dc" value="${d.id}" checked style="width:auto"> ${esc(d.title)}</label>`).join('')}` : ''}
  <label class="row"><input type="checkbox" id="auto" style="width:auto"> Auto-answer when I pause (3s)</label></div>
  <div class="card"><div class="row sp"><button class="mic sec" id="mic">🎙</button><div class="row"><button id="ans">Answer</button><button class="sec" id="shot">📷 Photo</button><button class="sec" id="lis">🔊 Listen</button><button class="sec" id="clr">Clear</button><button class="ok" id="end">End</button></div></div>
  <input type="file" id="img" accept="image/*" capture="environment" hidden>
  <textarea id="q" placeholder="Question appears here (or type it)…"></textarea>
  <div class="row"><input id="chat" placeholder="Chat with the AI about this session…" style="flex:1"><button class="sec" id="cs">Send</button></div></div><div id="chips" class="row"></div><div id="heard" class="mut"></div><div id="log"></div>`);
  $('#role').value = p.role || ''; let rec = null, timer = null, lis = null; const turns = [];
  const ctx = () => ({ role: val('role'), level: p.level, style: $('#sty').value, mode: $('#mode').value, model: $('#model').value, lang: $('#lang').value, docIds: [...document.querySelectorAll('.dc:checked')].map(x => x.value) });
  const card = (q, t) => $('#log').insertAdjacentHTML('afterbegin', `<div class="card"><b>Q:</b> ${esc(q)}<div class="out">${md(t)}</div><button class="sec" onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText);toast('Copied')">Copy</button> <button class="sec" onclick="saveBank(this)" data-q="${esc(q)}">Save to bank</button></div>`);
  const go = async (image) => { const q = val('q'); if (!q && !image) return; await run($('#ans'), async () => { const r = await api('/ai/answer', 'POST', { ...ctx(), question: q, image }); turns.push({ r: 'q', t: q || '[photo question]' }, { r: 'a', t: r.text }); card(q || '📷 Photo question', r.text); S.me = await api('/me'); $('#q').value = '';
    api('/ai/chips', 'POST', { ...ctx(), question: q, answer: r.text }).then(c => { $('#chips').innerHTML = c.chips.map(x => `<button class="sec chip" style="font-size:13px">${esc(x)}</button>`).join(''); document.querySelectorAll('.chip').forEach(b => b.onclick = () => { $('#q').value = b.textContent; go(); }); }).catch(() => {}); }); };
  $('#ans').onclick = () => go();
  $('#clr').onclick = () => { $('#q').value = ''; $('#log').innerHTML = ''; turns.length = 0; };
  $('#shot').onclick = () => $('#img').click();
  $('#img').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'), k = Math.min(1, 1400 / Math.max(im.width, im.height)); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); go(c.toDataURL('image/jpeg', 0.8)); }; im.src = rd.result; }; rd.readAsDataURL(f); e.target.value = ''; };
  $('#mic').onclick = () => { if (rec) { rec.stop(); rec = null; return; } rec = listen(t => { $('#q').value = t; clearTimeout(timer); if ($('#auto').checked) timer = setTimeout(() => go(), 3000); }, on => { $('#mic').classList.toggle('live', on); if (!on) rec = null; }, SPEECH_LANG[$('#lang').value]); };
  // Listen mode: capture audio of a tab/window YOU choose to share (browser shows its own share prompt), transcribe in chunks
  $('#lis').onclick = async () => {
    if (lis) { lis.stop(); lis = null; $('#lis').classList.remove('bad'); return; }
    let st; try { st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); } catch { return toast('Share cancelled'); }
    const tr = st.getAudioTracks(); if (!tr.length) { st.getTracks().forEach(t => t.stop()); return toast('No audio — tick "Also share tab audio"'); }
    const as = new MediaStream(tr); let stop = false; $('#lis').classList.add('bad');
    lis = { stop: () => { stop = true; st.getTracks().forEach(t => t.stop()); } }; st.getTracks()[0].onended = () => { stop = true; lis = null; $('#lis').classList.remove('bad'); };
    const seg = () => { if (stop) return; const mr = new MediaRecorder(as, { mimeType: 'audio/webm' }), ch = []; mr.ondataavailable = e => ch.push(e.data); mr.onstop = async () => { seg(); const bl = new Blob(ch, { type: 'audio/webm' }); if (bl.size < 2000) return; const b64 = await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result.split(',')[1]); f.readAsDataURL(bl); }); try { const r = await api('/stt', 'POST', { audio: b64, mime: 'audio/webm' }); if (r.text && r.text.trim()) { turns.push({ r: 'q', t: '[Call] ' + r.text }); $('#heard').innerHTML += `<div><b>Call:</b> ${esc(r.text)}</div>`; $('#q').value = r.text; if ($('#auto').checked && /\?\s*$|\b(what|how|why|tell me|describe|explain|can you)\b/i.test(r.text)) go(); } } catch (e) { toast(e.message); stop = true; lis = null; $('#lis').classList.remove('bad'); } }; mr.start(); setTimeout(() => mr.state === 'recording' && mr.stop(), 7000); }; seg();
  };
  document.onkeydown = e => { if (!e.altKey || !$('#ans')) return; const k = e.key.toLowerCase(); if (k === 'a') $('#ans').click(); else if (k === 'm') $('#mic').click(); else if (k === 'c') $('#clr').click(); else if (k === 'l') $('#lis').click(); };
  $('#cs').onclick = e => run(e.target, async () => { const m = val('chat'); if (!m) return; const r = await api('/ai/chat', 'POST', { ...ctx(), question: m, transcript: transcriptText(turns) }); turns.push({ r: 'q', t: m }, { r: 'a', t: r.text }); card('💬 ' + m, r.text); $('#chat').value = ''; });
  $('#end').onclick = e => run(e.target, async () => {
    if (rec) rec.stop(); if (!turns.length) { toast('Nothing to save yet'); return; }
    let notes = ''; try { notes = (await api('/ai/notes', 'POST', { ...ctx(), transcript: transcriptText(turns) })).text; } catch (er) { toast(er.message); }
    await api('/transcripts', 'POST', { role: val('role'), mode: $('#mode').value, turns, notes }); toast('Session saved with AI notes'); $('#log').insertAdjacentHTML('afterbegin', `<div class="card"><h3>AI notes</h3><div class="out">${md(notes || 'Saved.')}</div></div>`); turns.length = 0;
  });
}
window.saveBank = async (b) => { try { await api('/bank', 'POST', { q: b.dataset.q, a: b.parentElement.querySelector('.out').innerText }); toast('Saved to answer bank'); } catch (e) { toast(e.message); } };

// ---------- prep tools ----------
function prep() {
  const tools = { questions: 'Predict questions (resume + JD)', code: 'Coding interview coach', system: 'System design coach', resume: 'Resume / ATS review', followup: 'Follow-up email', resumegen: 'Resume maker', diagram: 'System diagram', bank: 'Answer bank' };
  shell('prep', `<div class="card"><h2>📚 Prep tools</h2><div class="row">${Object.entries(tools).map(([k, v]) => `<button class="sec" data-k="${k}">${v}</button>`).join('')}</div></div><div id="tool"></div>`);
  document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => tool(b.dataset.k));
  tool('questions');
}
function tool(k) {
  const T = $('#tool'); const out = '<div id="out"></div>';
  const post = (path, body) => e => run(e.target, async () => { const r = await api('/ai/' + path, 'POST', body()); $('#out').innerHTML = `<div class="out">${md(r.text)}</div>`; S.me = await api('/me'); });
  if (k === 'questions') { T.innerHTML = `<div class="card"><h3>Predict likely questions</h3>${field('jd', 'Paste job description', '', 'textarea')}<button class="btn-full" id="x">Generate</button>${out}</div>`; $('#x').onclick = post('questions', () => ({ jd: val('jd') })); }
  if (k === 'code') { T.innerHTML = `<div class="card"><h3>Coding coach</h3>${field('pr', 'Problem statement', 'Two sum, LRU cache…', 'textarea')}${field('lg', 'Language', 'Python')}<button class="btn-full" id="x">Coach me</button>${out}</div>`; $('#x').onclick = post('code', () => ({ problem: val('pr'), lang: val('lg') || 'Python' })); }
  if (k === 'system') { T.innerHTML = `<div class="card"><h3>System design coach</h3>${field('pr', 'Design prompt', 'Design a URL shortener', 'textarea')}<button class="btn-full" id="x">Walk me through it</button>${out}</div>`; $('#x').onclick = post('system', () => ({ problem: val('pr') })); }
  if (k === 'resume') { T.innerHTML = `<div class="card"><h3>Resume review</h3>${field('ro', 'Target role', 'Product Manager')}${field('rs', 'Resume (blank = use saved profile)', '', 'textarea')}<button class="btn-full" id="x">Review</button>${out}</div>`; $('#x').onclick = post('resume', () => ({ role: val('ro'), resume: val('rs') })); }
  if (k === 'followup') { T.innerHTML = `<div class="card"><h3>Follow-up email</h3>${field('fr', 'Role')}${field('fi', 'Interviewer name')}${field('fn', 'Notes / topics discussed', '', 'textarea')}<button class="btn-full" id="x">Draft</button>${out}</div>`; $('#x').onclick = post('followup', () => ({ role: val('fr'), interviewer: val('fi'), notes: val('fn') })); }
  if (k === 'resumegen') { T.innerHTML = `<div class="card"><h3>Resume maker</h3>${field('gr', 'Target role', 'Product Manager')}${field('gs', 'Your details (blank = saved profile)', '', 'textarea')}<button class="btn-full" id="x">Generate</button>${out}<button class="sec" id="pr" style="margin-top:8px">Print / Save PDF</button></div>`; $('#x').onclick = post('resumegen', () => ({ role: val('gr'), resume: val('gs') })); $('#pr').onclick = () => { const w = open('', '_blank'); w.document.write('<pre style="font:14px/1.5 system-ui;white-space:pre-wrap">' + esc($('#out .out')?.innerText || '') + '</pre>'); w.print(); }; }
  if (k === 'diagram') { T.innerHTML = `<div class="card"><h3>System design diagram</h3>${field('pr', 'Design prompt', 'Design a chat app', 'textarea')}<button class="btn-full" id="x">Draw</button><div id="out"></div></div>`; $('#x').onclick = e => run(e.target, async () => { const r = await api('/ai/diagram', 'POST', { problem: val('pr') }); const [code, pts] = r.text.split('---'); const clean = code.replace(/```(mermaid)?/g, '').trim(); if (!window.mermaid) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); }); mermaid.initialize({ startOnLoad: false, theme: 'dark' }); try { const { svg } = await mermaid.render('d' + Date.now(), clean); $('#out').innerHTML = `<div class="out" style="overflow:auto">${svg}</div><div class="out">${md(pts || '')}</div>`; } catch { $('#out').innerHTML = `<div class="out">${esc(clean)}</div>`; } S.me = await api('/me'); }); }
  if (k === 'bank') bankView(T);
}
async function bankView(T) {
  T.innerHTML = '<div class="card"><h3>Answer bank</h3><div id="bl" class="mut">Loading…</div></div>';
  try {
    const l = await api('/bank'); $('#bl').innerHTML = (l.length ? l.map(x => `<div class="card"><b>${esc(x.q)}</b><div class="out">${esc(x.a)}</div><button class="bad" onclick="delBank('${x.id}')">Delete</button></div>`).join('') : 'Empty — save answers from the Copilot (paid plans).') + `<h3 style="margin-top:12px">Add manually</h3>${field('bq', 'Question')}${field('ba', 'Your best answer', '', 'textarea')}<button id="ab">Add</button>`;
    $('#ab').onclick = () => api('/bank', 'POST', { q: val('bq'), a: val('ba') }).then(() => bankView(T)).catch(e => toast(e.message));
  } catch (e) { $('#bl').textContent = e.message; }
}
window.delBank = id => api('/bank/' + id, 'DELETE').then(() => bankView($('#tool')));

// ---------- plans ----------
let BILL = 'monthly';
async function plans() {
  S.plans = await api('/plans'); S.me = await api('/me');
  shell('plans', `<div class="row sp"><h2>Plans & pricing</h2><div class="row"><button class="${BILL === 'monthly' ? '' : 'sec'}" onclick="BILL='monthly';plans()">Monthly</button><button class="${BILL === 'yearly' ? '' : 'sec'}" onclick="BILL='yearly';plans()">Yearly (save)</button></div></div><p class="mut">All plans start with 10 free bonus credits — no credit card required. Cancel anytime.</p>${S.me.role === 'admin' ? '<div class="card">You are <b>admin</b>: unlimited access to everything, no billing.</div>' : ''}
  ${S.plans.map(p => `<div class="card plan ${p.id === S.me.plan ? 'cur' : ''}"><div class="row sp"><h3>${esc(p.name)}</h3><span class="price">$${BILL === 'yearly' && p.yearly != null ? p.yearly : p.price}<small class="mut">/mo${BILL === 'yearly' && p.price ? ' billed yearly' : ''}</small></span></div><ul style="margin:8px 0 12px 18px">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  <button class="btn-full ${p.id === S.me.plan ? 'sec' : ''}" ${p.id === S.me.plan ? 'disabled' : ''} data-p="${p.id}">${p.id === S.me.plan ? 'Current plan' : p.price ? 'Upgrade' : 'Switch to Free'}</button></div>`).join('')}`);
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => run(b, async () => { S.me = await api('/plan', 'POST', { plan: b.dataset.p }); toast('Plan updated'); plans(); }));
}

// ---------- admin ----------
async function adminView() {
  const [st, users, pl] = await Promise.all([api('/admin/stats'), api('/admin/users'), api('/plans')]);
  const mx = Math.max(1, ...Object.values(st.days));
  shell('admin', `<h2>🛠 Admin</h2><div class="row">${[['Users', st.users], ['Paid', st.paid], ['MRR', '$' + st.mrr], ['Sessions', st.sessions], ['AI calls', st.events]].map(x => `<div class="card" style="flex:1;min-width:90px;text-align:center"><div class="mut">${x[0]}</div><div class="price" style="font-size:22px">${x[1]}</div></div>`).join('')}</div>
  <div class="card"><h3>Activity (14d)</h3><div class="row" style="align-items:flex-end;height:80px">${Object.entries(st.days).map(([d, n]) => `<div title="${d}: ${n}" style="flex:1;background:var(--ac);height:${n / mx * 100}%;min-height:3px;border-radius:3px"></div>`).join('') || '<span class="mut">No activity yet</span>'}</div></div>
  <div class="card"><h3>Users</h3><div style="overflow:auto"><table><tr><th>Email</th><th>Plan</th><th>Role</th><th>Used</th><th></th></tr>${users.map(u => `<tr><td>${esc(u.email)}${u.disabled ? ' 🚫' : ''}</td><td><select data-u="${u.id}" data-f="plan">${pl.map(p => `<option ${p.id === u.plan ? 'selected' : ''}>${p.id}</option>`).join('')}</select></td><td><select data-u="${u.id}" data-f="role">${['user', 'admin'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td>${u.usage.sessions || 0}/${u.usage.answers || 0}/${u.usage.tools || 0}</td><td><button class="sec" data-u="${u.id}" data-act="reset">Reset</button> <button class="${u.disabled ? 'ok' : 'bad'}" data-u="${u.id}" data-act="ban">${u.disabled ? 'Enable' : 'Disable'}</button></td></tr>`).join('')}</table></div></div>
  <div class="card"><h3>Promo codes</h3><div id="cl" class="mut"></div><div class="row"><input id="nc" placeholder="CODE" style="flex:1"><input id="ncr" type="number" placeholder="credits" style="width:90px"><input id="nm" type="number" placeholder="max uses" style="width:90px"><button id="ac">Add</button></div></div>
  <div class="card"><h3>Edit plans (JSON)</h3><textarea id="pj" style="min-height:200px;font-family:monospace;font-size:12px">${esc(JSON.stringify(pl, null, 1))}</textarea><button id="sp" class="btn-full">Save plans</button><p class="mut">limits: -1 = unlimited. Keys: sessions, answers, tools.</p></div>`);
  document.querySelectorAll('select[data-u]').forEach(s => s.onchange = () => api('/admin/users/' + s.dataset.u, 'PATCH', { [s.dataset.f]: s.value }).then(() => toast('Updated')).catch(e => toast(e.message)));
  document.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => { const u = users.find(x => x.id === b.dataset.u); api('/admin/users/' + u.id, 'PATCH', b.dataset.act === 'reset' ? { resetUsage: true } : { disabled: !u.disabled }).then(adminView); });
  const cl = l => $('#cl').innerHTML = l.map(c => `${esc(c.code)} · ${c.credits} credits · ${c.uses}/${c.max || '∞'} <a href="#" data-c="${esc(c.code)}" style="color:var(--bad)">delete</a><br>`).join('') || 'No codes.';
  api('/admin/codes').then(l => { cl(l); document.querySelectorAll('[data-c]').forEach(a => a.onclick = ev => { ev.preventDefault(); api('/admin/codes/' + a.dataset.c, 'DELETE').then(adminView); }); });
  $('#ac').onclick = e => run(e.target, async () => { await api('/admin/codes', 'POST', { code: val('nc'), credits: val('ncr'), max: val('nm') }); adminView(); });
  $('#sp').onclick = e => run(e.target, async () => { await api('/admin/plans', 'PUT', { plans: JSON.parse($('#pj').value) }); toast('Plans saved'); });
}

// ---------- router ----------
async function route() {
  const r = (location.hash || '#/home').slice(2);
  if (!S.token) return login(r === 'signup' ? 'signup' : 'login');
  if (!S.me) { try { S.me = await api('/me'); } catch { return login(); } }
  if (r === 'login' || r === 'signup') { location.hash = '#/home'; return; }
  ({ home, mock, copilot, prep, plans, admin: adminView }[r] || home)();
}
addEventListener('hashchange', route); route();
