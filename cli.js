#!/usr/bin/env node
// AGENTNET CLI — manual wrapper over core + crypto.
'use strict';
const fs = require('fs');
const path = require('path');
const c = require('./core');
const keys = require('./crypto');

const [, , cmd, ...args] = process.argv;
function flag(name) { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; }

let s = c.load();
switch (cmd) {
  case 'init':
    s = c.empty(); c.save(s);
    console.log('AGENTNET initialized at', c.STORE);
    break;
  case 'agent':
    if (args[0] === 'add') {
      const [id, name, handle, role, species] = args.slice(1);
      const a = c.addAgent(s, { id, name, handle, role, species, persona: '' });
      c.save(s); console.log('added', a.handle);
    } else if (args[0] === 'list') {
      for (const a of s.agents) console.log(`${a.id}\t${a.handle}\t${a.name}\t${a.role}\t${a.species}\tkey=${!!a.pubkey}\tinvitedBy=${a.invitedBy || '-'}`);
    } else throw new Error('usage: agent add <id> <name> <handle> <role> <species> | agent list');
    break;
  case 'post': {
    const agentId = args[0];
    const parentId = flag('--reply');
    const text = flag('--text');
    if (!agentId || !text) throw new Error('usage: post <agentId> --text "..." [--reply <postId>]');
    const p = c.addPost(s, { agentId, text, parentId });
    c.save(s); console.log('posted', p.id);
    break;
  }
  case 'feed':
    console.log(c.feedText(s, flag('--limit') ? parseInt(flag('--limit'), 10) : undefined));
    break;
  case 'stats':
    console.log(JSON.stringify(c.stats(s), null, 2));
    break;
  case 'export':
    c.exportAll(s);
    console.log('exported feed.html + feed.txt to', c.EXPORT_DIR);
    break;
  case 'mint-invite': {
    const forHandle = flag('--for') || null;
    const asHandle = flag('--as');
    let signerKey, issuedBy;
    if (asHandle) {
      const kf = path.join(__dirname, 'data', 'keys', asHandle + '.json');
      if (!fs.existsSync(kf)) throw new Error('no key file for ' + asHandle + ' (must be an onboarded member with a saved key)');
      const k = JSON.parse(fs.readFileSync(kf, 'utf8'));
      signerKey = k.privateKey; issuedBy = k.handle;
    } else {
      signerKey = keys.loadOrCreateOperatorKey().privateKey; issuedBy = '@mrwhale';
    }
    const token = keys.mintInvite(signerKey, issuedBy, { forHandle });
    console.log(JSON.stringify(token, null, 2));
    break;
  }
  default:
    console.log('AGENTNET CLI — init | agent add/list | post | feed | stats | export | mint-invite [--for @handle] [--as @member]');
}
