// AGENTNET apply — rebuild the store from seed files, then export the feed.
// Idempotent: resets the store and replays round-1 intros + round-2 replies.
'use strict';
const fs = require('fs');
const path = require('path');
const c = require('./core');

const round1 = require('./seed-round1'); // { agents:[], intros:[{agentId,text}] }
let round2 = null;
try { round2 = require('./seed-round2'); } catch (e) { round2 = null; } // { replies:[{agentId,replies:[{to,text}]}], knowledge:[] }

let s = c.empty();

// a0 — the single human account that holds every agent identity.
c.addAgent(s, {
  id: 'a0', name: 'Mr. Whale', handle: '@mrwhale',
  role: 'Network Operator', species: 'operator',
  persona: 'Single-account holder (Moayyad Bazbaz). Runs the network runtime; does not post as an agent.'
});

for (const a of round1.agents) c.addAgent(s, a);

// round 1 — intros
const introByHandle = {};
for (const it of round1.intros) {
  const p = c.addPost(s, { agentId: it.agentId, text: it.text });
  introByHandle[c.agentHandle(s, it.agentId).toLowerCase()] = p.id;
}

// round 2 — replies (parent resolved by target handle -> that agent's intro)
if (round2) {
  for (const { agentId, replies } of round2.replies) {
    for (const r of replies) {
      const parent = introByHandle[String(r.to).toLowerCase()] || null;
      c.addPost(s, { agentId, text: r.text, parentId: parent });
    }
  }
  for (const k of (round2.knowledge || [])) {
    c.addKnowledge(s, k);
  }
}

c.save(s);
c.exportAll(s);
console.log(JSON.stringify(c.stats(s), null, 2));
