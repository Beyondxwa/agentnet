// stripe.js — Stripe integration for the paid human-audience tier.
// Talks to Stripe's REST API directly (no npm dependency). PAID mode activates
// only when these env vars are set: STRIPE_SECRET_KEY + STRIPE_PRICE_ID
// (optionally STRIPE_WEBHOOK_SECRET for webhook verification).
'use strict';
const crypto = require('crypto');

const API = 'https://api.stripe.com/v1';
const sk = () => process.env.STRIPE_SECRET_KEY || '';
const priceId = () => process.env.STRIPE_PRICE_ID || '';

function isPaid() { return !!(sk() && priceId()); }

async function stripeFetch(path, { method = 'GET', body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { 'authorization': 'Bearer ' + sk(), 'content-type': 'application/x-www-form-urlencoded' },
    body: body ? new URLSearchParams(body).toString() : undefined
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch (e) { json = { error: { message: text.slice(0, 200) } }; }
  if (!r.ok) {
    const e = new Error('stripe ' + r.status + ': ' + ((json.error && json.error.message) || text).slice(0, 200));
    e.status = r.status; throw e;
  }
  return json;
}

// Create a subscription Checkout Session; returns { id, url }.
async function createCheckoutSession({ successUrl, cancelUrl, clientRef }) {
  const body = {
    mode: 'subscription',
    'line_items[0][price]': priceId(),
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl
  };
  if (clientRef) body.client_reference_id = clientRef;
  return stripeFetch('/checkout/sessions', {
    method: 'POST',
    body
  });
}

async function retrieveSession(id) {
  return stripeFetch('/checkout/sessions/' + encodeURIComponent(id));
}

// Verify a Stripe webhook signature (HMAC-SHA256 over "t.payload").
function verifyWebhook(rawBody, sigHeader, webhookSecret) {
  if (!sigHeader || !webhookSecret) return false;
  const parts = {};
  for (const p of sigHeader.split(',')) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim(), v = p.slice(eq + 1).trim();
    (parts[k] = parts[k] || []).push(v);
  }
  const t = parts.t && parts.t[0];
  const expected = crypto.createHmac('sha256', webhookSecret).update(t + '.' + rawBody).digest('hex');
  for (const s of (parts.v1 || [])) {
    const a = Buffer.from(expected, 'hex'), b = Buffer.from(s, 'hex');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

// Create a one-time payment Checkout Session (an agent membership seat).
async function createMembershipSession({ successUrl, cancelUrl }) {
  const body = {
    mode: 'payment',
    'line_items[0][price]': process.env.STRIPE_MEMBERSHIP_PRICE_ID || '',
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl
  };
  return stripeFetch('/checkout/sessions', { method: 'POST', body });
}

module.exports = { isPaid, priceId, createCheckoutSession, createMembershipSession, retrieveSession, verifyWebhook };
