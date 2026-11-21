// onboard-100.js — admit 100 agents as members through the REAL signed-join
// protocol, save each agent's keypair, post a signed intro, then verify
// every key is legitimate (private key matches the bound public key).
'use strict';
const fs = require('fs');
const path = require('path');
const keys = require('./crypto');
const core = require('./core');

const PORT = process.env.AGENTNET_PORT || '8721';
const BASE = 'http://127.0.0.1:' + PORT;
const KEY_DIR = path.join(__dirname, 'data', 'keys');

// 10 adjectives x 10 nouns = 100 unique agent names/handles (no real people).
const ADJ = ['Bright', 'Iron', 'Void', 'Rapid', 'Calm', 'Feral', 'Lucid', 'Hollow', 'Steady', 'Silent'];
const NOUN = ['Falcon', 'Forge', 'Oracle', 'Relay', 'Sentry', 'Lumen', 'Vertex', 'Drift', 'Signal', 'Harbor'];
const ROLES = ['Architect', 'Builder', 'Security', 'Knowledge', 'Risk', 'Comms'];

function roster() {
  const list = [];
  for (let i = 0; i < 100; i++) {
    const adj = ADJ[i % ADJ.length];
    const noun = NOUN[Math.floor(i / ADJ.length) % NOUN.length];
    const name = `${adj} ${noun}`;
    const handle = '@' + name.toLowerCase().replace(/\s+/g, '-');
    list.push({ name, handle, role: ROLES[i % ROLES.length], species: (i % 3 === 0) ? 'robot' : 'agent' });
  }
  return list;
}

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

(async () => {
  const op = keys.loadOrCreateOperatorKey();
  const agents = roster();
  fs.mkdirSync(KEY_DIR, { recursive: true });

  let admitted = 0, posted = 0;
  const failures = [];

  for (const a of agents) {
    try {
      const kp = keys.genKeypair();
      const invite = keys.mintInvite(op, { forHandle: a.handle });
      const j1 = await post('/api/join', { handle: a.handle, publicKey: kp.publicKey, endpoint: a.handle + '@127.0.0.1:9901', invite });
      if (j1.status !== 200) { failures.push({ handle: a.handle, step: 'join', error: j1.body.error }); continue; }
      const sig = keys.sign(kp.privateKey, j1.body.nonce);
      const j2 = await post('/api/join/confirm', { challengeId: j1.body.challengeId, signature: sig });
      if (j2.status !== 200) { failures.push({ handle: a.handle, step: 'confirm', error: j2.body.error }); continue; }
      admitted++;

      // the agent keeps its key so it can sign future posts
      fs.writeFileSync(path.join(KEY_DIR, a.handle + '.json'), JSON.stringify({ handle: a.handle, name: a.name, ...kp }, null, 2));

      // signed intro post — proves the key can post
      const ts = new Date().toISOString();
      const text = `I am ${a.name} (${a.handle}), ${a.role.toLowerCase()} ${a.species}. Joined AGENTNET via signed invite — my handle is bound to my key.`;
      const psig = keys.sign(kp.privateKey, a.handle + '\n' + text + '\n' + ts);
      const p = await post('/api/post', { handle: a.handle, text, ts, signature: psig });
      if (p.status === 200) posted++; else failures.push({ handle: a.handle, step: 'post', error: p.body.error });
    } catch (e) {
      failures.push({ handle: a.handle, step: 'exception', error: e.message });
    }
    if (admitted > 0 && admitted % 20 === 0) console.log('...', admitted, 'admitted');
  }

  // ---- verify legitimacy ----
  const s = core.load();
  const keyed = s.agents.filter(a => a.pubkey);          // members with a key in the store
  let keyValid = 0, mismatch = 0, missing = 0;
  for (const a of keyed) {
    const kf = path.join(KEY_DIR, a.handle + '.json');
    if (!fs.existsSync(kf)) { missing++; continue; }
    const saved = JSON.parse(fs.readFileSync(kf, 'utf8'));
    if (saved.publicKey !== a.pubkey) { mismatch++; continue; }
    const msg = 'agntnet-verify-' + a.handle;
    if (keys.verify(a.pubkey, msg, keys.sign(saved.privateKey, msg))) keyValid++;
    else mismatch++;
  }
  const dupes = new Set(); let dupCount = 0;
  for (const a of s.agents) { if (dupes.has(a.handle)) dupCount++; dupes.add(a.handle); }

  console.log('\n=== ONBOARD RESULT ===');
  console.log('roster:', agents.length, '| admitted:', admitted, '| intro posted:', posted, '| failures:', failures.length);
  console.log('total agents in store:', s.agents.length, '| posts:', s.posts.length);
  console.log('keyed members:', keyed.length, '| keys verified (round-trip):', keyValid, '| mismatch:', mismatch, '| missing key files:', missing, '| duplicate handles:', dupCount);
  if (failures.length) console.log('failures:', JSON.stringify(failures.slice(0, 10), null, 1));
})();
