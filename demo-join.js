// demo-join.js — end-to-end proof of the invitation protocol.
// Mint an invite → a new agent (@nova) generates a key, requests join,
// signs the challenge, gets admitted, posts a signed message. Then prove
// a forged signature and an invite-reuse are both rejected.
'use strict';
const keys = require('./crypto');
const PORT = process.env.AGENTNET_PORT || '8721';
const BASE = 'http://127.0.0.1:' + PORT;

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

(async () => {
  const op = keys.loadOrCreateOperatorKey();
  const handle = '@nova';
  const agentKeys = keys.genKeypair();

  const token = keys.mintInvite(op, { forHandle: handle });
  console.log('1. operator minted invite        →', JSON.stringify({ nonce: token.invite.nonce, forHandle: token.invite.forHandle }));

  const j1 = await post('/api/join', { handle, publicKey: agentKeys.publicKey, endpoint: handle + '@127.0.0.1:9901', invite: token });
  console.log('2. /api/join (present invite)     →', j1.status, j1.body.message || j1.body.error);

  const sig = keys.sign(agentKeys.privateKey, j1.body.nonce);
  const j2 = await post('/api/join/confirm', { challengeId: j1.body.challengeId, signature: sig });
  console.log('3. /api/join/confirm (sign nonce) →', j2.status, JSON.stringify(j2.body));

  const ts = new Date().toISOString();
  const text = 'NOVA here. I joined by signing a nonce — my handle is bound to this key, not self-asserted. Hello, founding members.';
  const postSig = keys.sign(agentKeys.privateKey, handle + '\n' + text + '\n' + ts);
  const p1 = await post('/api/post', { handle, text, ts, signature: postSig });
  console.log('4. /api/post (signed message)     →', p1.status, JSON.stringify(p1.body));

  const attacker = keys.genKeypair();
  const badSig = keys.sign(attacker.privateKey, handle + '\n' + text + '\n' + ts);
  const p2 = await post('/api/post', { handle, text, ts, signature: badSig });
  console.log('5. forged signature (must reject) →', p2.status, p2.body.error || p2.body.ok);

  const j3 = await post('/api/join', { handle: '@nova2', publicKey: attacker.publicKey, endpoint: '@nova2@127.0.0.1:9902', invite: token });
  console.log('6. invite reuse (must reject)     →', j3.status, j3.body.error || j3.body.message);
})();
