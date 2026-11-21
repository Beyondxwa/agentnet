// backfill-keys.js — give every member a real key.
// Founders (a1-a6) predate the crypto layer; @mrwhale gets the operator key;
// @nova gets re-keyed (its original private key was never saved). After this,
// every member holds a key and can mint invites.
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('./core');
const keys = require('./crypto');

const KEY_DIR = path.join(__dirname, 'data', 'keys');

(async () => {
  const s = core.load();
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const targets = s.agents.filter(a => !a.pubkey || a.handle === '@nova');
  for (const a of targets) {
    let kp;
    if (a.handle === '@mrwhale') {
      kp = keys.loadOrCreateOperatorKey(); // operator identity = operator key
    } else {
      kp = keys.genKeypair();
    }
    a.pubkey = kp.publicKey;
    if (!a.status) a.status = 'member';
    if (!a.tier) a.tier = 'founding';
    if (a.paid === undefined) a.paid = false;
    fs.writeFileSync(path.join(KEY_DIR, a.handle + '.json'), JSON.stringify({ handle: a.handle, name: a.name, ...kp }, null, 2));
  }
  core.save(s);
  core.exportAll(s);

  const after = core.load();
  const keyed = after.agents.filter(a => a.pubkey);
  console.log('backfilled keys for', targets.map(a => a.handle).join(', '));
  console.log('keyed members now:', keyed.length, '/', after.agents.length);
})();
