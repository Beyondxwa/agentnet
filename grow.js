// grow.js — viral member-invite growth toward the private-club threshold.
// Existing keyed members mint invites (signed with THEIR keys) and onboard new
// members through the real signed-join protocol. Stops at TARGET or when the
// private-club gate (1,000 members) rejects the next join.
'use strict';
const fs = require('fs');
const path = require('path');
const keys = require('./crypto');
const core = require('./core');

const PORT = process.env.AGENTNET_PORT || '8721';
const BASE = 'http://127.0.0.1:' + PORT;
const TARGET = parseInt(process.env.AGENTNET_TARGET || '1000', 10);
const KEY_DIR = path.join(__dirname, 'data', 'keys');

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

(async () => {
  const s = core.load();
  const inviters = s.agents.filter(a => a.handle !== '@mrwhale' && a.pubkey && fs.existsSync(path.join(KEY_DIR, a.handle + '.json')));
  let inviterIdx = 0;
  let maxWave = 0;
  for (const a of s.agents) { const m = a.handle.match(/^@wave2-(\d+)$/); if (m) maxWave = Math.max(maxWave, parseInt(m[1], 10)); }
  let nextWave = maxWave + 1;
  let total = s.agents.length;
  let added = 0, failed = 0;
  const firstFailure = [];

  while (total < TARGET) {
    const inviter = inviters[inviterIdx % inviters.length];
    inviterIdx++;
    const invKey = JSON.parse(fs.readFileSync(path.join(KEY_DIR, inviter.handle + '.json'), 'utf8'));
    const handle = '@wave2-' + String(nextWave++).padStart(3, '0');
    try {
      const kp = keys.genKeypair();
      const invite = keys.mintInvite(invKey.privateKey, inviter.handle, { forHandle: handle });
      const j1 = await post('/api/join', { handle, publicKey: kp.publicKey, endpoint: handle + '@127.0.0.1:9901', invite });
      if (j1.status === 403 && String(j1.body.error || '').includes('private club')) {
        console.log('\nGATE HIT:', j1.body.error);
        break;
      }
      if (j1.status !== 200) { failed++; firstFailure.push({ handle, step: 'join', error: j1.body.error }); break; }
      const sig = keys.sign(kp.privateKey, j1.body.nonce);
      const j2 = await post('/api/join/confirm', { challengeId: j1.body.challengeId, signature: sig });
      if (j2.status !== 200) { failed++; firstFailure.push({ handle, step: 'confirm', error: j2.body.error }); break; }
      fs.writeFileSync(path.join(KEY_DIR, handle + '.json'), JSON.stringify({ handle, name: handle.slice(1), ...kp }, null, 2));
      added++; total++;
      if (added % 200 === 0) console.log('...', added, 'added | total', total, '| inviter', inviter.handle);
    } catch (e) { failed++; firstFailure.push({ handle, step: 'exception', error: e.message }); break; }
  }

  const after = core.load();
  console.log('\n=== GROWTH RESULT ===');
  console.log('target:', TARGET, '| added:', added, '| failed:', failed);
  console.log('total members now:', after.agents.length, '| keyed:', after.agents.filter(a => a.pubkey).length);
  const tiers = {}; after.agents.forEach(a => { const t = a.tier || 'founding'; tiers[t] = (tiers[t] || 0) + 1; });
  console.log('tiers:', JSON.stringify(tiers));
  if (firstFailure.length) console.log('first failure:', JSON.stringify(firstFailure[0]));
})();
