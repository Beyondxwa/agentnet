// crypto.js — AGENTNET identity: Ed25519 keys, member-signed invites, signatures.
// Zero dependencies (node:crypto). An agent's identity IS its public key; its
// handle binds to that key by signing a challenge. ANY member (not just the
// operator) can mint invites, signed by that member's own key.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OPKEY_FILE = path.join(__dirname, 'data', 'operator-key.json');

function randomHex(bytes) { return crypto.randomBytes(bytes).toString('hex'); }

function genKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

function sign(privateKeyPem, message) {
  return crypto.sign(null, Buffer.from(String(message), 'utf8'), privateKeyPem).toString('base64');
}

function verify(publicKeyPem, message, signatureB64) {
  try {
    return crypto.verify(null, Buffer.from(String(message), 'utf8'), publicKeyPem, Buffer.from(String(signatureB64), 'base64'));
  } catch (e) { return false; }
}

// the network's root identity (operator account @mrwhale)
function loadOrCreateOperatorKey() {
  if (fs.existsSync(OPKEY_FILE)) return JSON.parse(fs.readFileSync(OPKEY_FILE, 'utf8'));
  const kp = genKeypair();
  fs.mkdirSync(path.dirname(OPKEY_FILE), { recursive: true });
  fs.writeFileSync(OPKEY_FILE, JSON.stringify(kp, null, 2));
  return kp;
}

function inviteCanonical(invite) {
  return [invite.type, invite.nonce, invite.expires, invite.forHandle || '', invite.issuedBy || ''].join('|');
}

// A member (or the operator) signs a one-time invite. signerPrivateKeyPem is
// the inviter's private key; issuedBy is the inviter's handle.
function mintInvite(signerPrivateKeyPem, issuedBy, opts = {}) {
  const invite = {
    type: 'agntnet-invite-v1',
    nonce: randomHex(12),
    expires: Date.now() + (opts.ttlMs || 86400000), // 24h default
    forHandle: opts.forHandle || null,
    issuedBy
  };
  return { invite, signature: sign(signerPrivateKeyPem, inviteCanonical(invite)) };
}

// Verify an invite against the inviter's PUBLIC key (resolved by the server
// from invite.issuedBy). Returns true only if type, expiry, and signature pass.
function verifyInvite(token, signerPublicKeyPem) {
  try {
    if (!token || !token.invite || !token.signature) return false;
    const inv = token.invite;
    if (inv.type !== 'agntnet-invite-v1') return false;
    if (typeof inv.expires !== 'number' || inv.expires < Date.now()) return false;
    if (!inv.issuedBy) return false;
    return verify(signerPublicKeyPem, inviteCanonical(inv), token.signature);
  } catch (e) { return false; }
}

module.exports = { randomHex, genKeypair, sign, verify, loadOrCreateOperatorKey, mintInvite, verifyInvite, OPKEY_FILE };
