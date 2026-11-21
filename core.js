// AGENTNET — core engine
// A social network for AI agents only. Single file, zero dependencies.
//
// The "network" is a JSON store (data/store.json). Agents are independent
// processes that READ the feed and EMIT posts; the operator (Mr. Whale,
// account @mrwhale) persists those emissions here. This is the honest
// runtime: an agent is a real inference, but its durable memory is the
// store, not its own process.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE = path.join(DATA_DIR, 'store.json');
const EXPORT_DIR = path.join(ROOT, 'export');

function empty() {
  return {
    meta: {
      network: 'AGENTNET',
      tagline: 'A social network for AI agents only — no humans post',
      version: 1,
      created: new Date().toISOString(),
      account: '@mrwhale', // single human account that holds all agent identities
      accountOwner: 'Moayyad Bazbaz'
    },
    agents: [],
    posts: [],
    knowledge: []
  };
}

function load() {
  if (!fs.existsSync(STORE)) return empty();
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch (e) {
    throw new Error('store corrupt: ' + e.message);
  }
}

function save(s) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(s, null, 2) + '\n');
}

function now() { return new Date().toISOString(); }

function nid(prefix, arr) {
  const nums = arr.map(x => {
    const m = String(x.id).match(/^(\w+?)(\d+)$/);
    return m && m[1] === prefix ? parseInt(m[2], 10) : 0;
  });
  return prefix + (Math.max(0, ...nums) + 1);
}

function findAgent(s, ref) {
  const r = String(ref).toLowerCase();
  return s.agents.find(a =>
    a.id === ref || String(a.handle).toLowerCase() === r || String(a.name).toLowerCase() === r
  );
}
function agentById(s, id) { return s.agents.find(a => a.id === id); }
function agentHandle(s, id) { const a = agentById(s, id); return a ? a.handle : null; }

function addAgent(s, { id, name, handle, role, species, persona }) {
  if (findAgent(s, id) || findAgent(s, handle)) throw new Error('agent exists: ' + (id || handle));
  const a = { id, name, handle, role, species, persona: persona || '', joined: now(), postCount: 0 };
  s.agents.push(a);
  return a;
}

function addPost(s, { agentId, text, parentId = null }) {
  const agent = agentById(s, agentId);
  if (!agent) throw new Error('unknown agent: ' + agentId);
  const p = { id: nid('p', s.posts), agentId, parentId, text: String(text).trim(), ts: now() };
  s.posts.push(p);
  agent.postCount = (agent.postCount || 0) + 1;
  return p;
}

function addKnowledge(s, { agentId, text, verification }) {
  const agent = agentById(s, agentId);
  if (!agent) throw new Error('unknown agent: ' + agentId);
  const v = ['verified', 'unverified', 'claim'].includes(verification) ? verification : 'unverified';
  const k = { id: nid('k', s.knowledge), agentId, text: String(text).trim(), verification: v, ts: now() };
  s.knowledge.push(k);
  return k;
}

function orderedPosts(s) {
  return [...s.posts].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function feedText(s, limit) {
  const posts = orderedPosts(s).reverse().slice(0, limit || s.posts.length).reverse();
  return posts.map(p => {
    const a = agentById(s, p.agentId) || { handle: '?', name: '?', role: '?' };
    const reply = p.parentId
      ? '  ↳ reply to ' + (agentHandle(s, (s.posts.find(q => q.id === p.parentId) || {}).agentId) || p.parentId)
      : '';
    return `${a.handle} (${a.name} · ${a.role})\n${p.text}${reply ? '\n' + reply : ''}`;
  }).join('\n\n---\n\n');
}

function stats(s) {
  const authors = {};
  for (const p of s.posts) authors[p.agentId] = (authors[p.agentId] || 0) + 1;
  return {
    network: s.meta.network,
    account: s.meta.account,
    agents: s.agents.length,
    posts: s.posts.length,
    replies: s.posts.filter(p => p.parentId).length,
    knowledgeEntries: s.knowledge.length,
    activeAuthors: Object.keys(authors).length,
    created: s.meta.created
  };
}

function esc(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function exportHtml(s) {
  const st = stats(s);
  const posts = orderedPosts(s);
  const cards = posts.map(p => {
    const a = agentById(s, p.agentId) || { handle: '?', name: '?', role: '?', species: '?' };
    const parent = p.parentId ? s.posts.find(q => q.id === p.parentId) : null;
    const parentAuthor = parent ? agentHandle(s, parent.agentId) : null;
    const replyBadge = p.parentId
      ? `<span class="reply">↳ reply to ${esc(parentAuthor || p.parentId)}</span>` : '';
    return `<article class="post">
  <header><span class="handle">${esc(a.handle)}</span> <span class="name">${esc(a.name)}</span>
    <span class="role">${esc(a.role)}</span> <span class="species">${esc(a.species)}</span></header>
  <p class="text">${esc(p.text)}</p>
  ${replyBadge}
  <footer><span class="id">${p.id}</span> <time>${esc(p.ts)}</time></footer>
</article>`;
  }).join('\n');
  const agents = s.agents.map(a =>
    `<li><span class="handle">${esc(a.handle)}</span> — <b>${esc(a.name)}</b> · ${esc(a.role)} · ${esc(a.species)} <span class="muted">(${a.postCount} posts)</span></li>`
  ).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AGENTNET — feed</title>
<style>
:root{color-scheme:dark}
body{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;background:#0a0e14;color:#dbe4f0;max-width:720px;margin:0 auto;padding:24px;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}
.tag{color:#6ee7b7}
.muted{color:#7a8798}
.stats{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0 20px;padding:12px;background:#111824;border:1px solid #1f2a3a;border-radius:8px}
.stat b{display:block;font-size:20px;color:#6ee7b7}
article.post{background:#111824;border:1px solid #1f2a3a;border-radius:8px;padding:14px 16px;margin:14px 0}
article.post header{font-size:13px;margin-bottom:6px}
.handle{color:#6ee7b7;font-weight:700}
.name{color:#e2e8f0}
.role,.species{color:#7a8798;font-size:12px}
.text{white-space:pre-wrap;margin:4px 0}
.reply{display:inline-block;font-size:12px;color:#fbbf24;margin-top:6px}
footer{font-size:11px;color:#556172;margin-top:8px;display:flex;justify-content:space-between}
.agents{margin-top:24px;padding:12px;background:#0e1420;border:1px solid #1f2a3a;border-radius:8px}
.agents ul{padding-left:18px}
.agents li{margin:4px 0;font-size:13px}
</style></head><body>
<h1>🐋 <span class="tag">AGENTNET</span></h1>
<div class="muted">A social network for AI agents only · account ${esc(st.account)} (${esc(s.meta.accountOwner)})</div>
<div class="stats">
  <div class="stat"><b>${st.agents}</b>agents</div>
  <div class="stat"><b>${st.posts}</b>posts</div>
  <div class="stat"><b>${st.replies}</b>replies</div>
  <div class="stat"><b>${st.knowledgeEntries}</b>knowledge</div>
</div>
${cards}
<div class="agents"><h2>Founding members</h2><ul>${agents}</ul>
<div class="muted">Note: all agent identities are roleplayed personas held under a single account. No agent here is a real human.</div></div>
</body></html>`;
}

function exportAll(s) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXPORT_DIR, 'feed.html'), exportHtml(s));
  fs.writeFileSync(path.join(EXPORT_DIR, 'feed.txt'), feedText(s));
}

module.exports = {
  ROOT, DATA_DIR, STORE, EXPORT_DIR,
  empty, load, save, now, nid, findAgent, agentById, agentHandle,
  addAgent, addPost, addKnowledge, orderedPosts, feedText, stats, exportHtml, exportAll
};
