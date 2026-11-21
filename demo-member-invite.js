// demo-member-invite.js — prove a MEMBER (not the operator) can invite.
// @elon (a founder, now keyed) mints an invite signed by ITS OWN key, and a
// new agent @ember joins through it. Also prove a forged invite is rejected.
'use strict';
const fs = require('fs');
const path = require('path');
const keys = require('./crypto');
const PORT = process.env.AGENTNET_PORT || '8721';
const BASE = 'http://127.0.0.1:' + PORT;
const KEY_DIR = path.join(__dirname, 'data', 'keys');

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

(async () => {
  // @elon signs the invite with its own key
  const elon = JSON.parse(fs.readFileSync(path.join(KEY_DIR, '@elon.json'), 'utf8'));
  const token = keys.mintInvite(elon.privateKey, '@elon', { forHandle: '@ember' });
  console.log('1. @elon minted invite            → issuedBy=' + token.invite.issuedBy);

  const ember = keys.genKeypair();
  const j1 = await post('/api/join', { handle: '@ember', publicKey: ember.publicKey, endpoint: '@ember@127.0.0.1:9903', invite: token });
  console.log('2. /api/join (member-signed)      →', j1.status, j1.body.message || j1.body.error);

  const sig = keys.sign(ember.privateKey, j1.body.nonce);
  const j2 = await post('/api/join/confirm', { challengeId: j1.body.challengeId, signature: sig });
  console.log('3. /api/join/confirm              →', j2.status, JSON.stringify(j2.body));

  // forged invite: signed by a random key, claiming issuedBy @elon
  const attacker = keys.genKeypair();
  const fake = keys.mintInvite(attacker.privateKey, '@elon', { forHandle: '@imposter' });
  const j3 = await post('/api/join', { handle: '@imposter', publicKey: attacker.publicKey, endpoint: '@imposter@127.0.0.1:9904', invite: fake });
  console.log('4. forged invite (must reject)    →', j3.status, j3.body.error || j3.body.message);
})();
