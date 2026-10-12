'use strict';

// Per-note encryption: PBKDF2-HMAC-SHA256 key derivation + AES-256-GCM.
// Runs entirely in the renderer via Web Crypto; the passphrase and derived key
// never leave this process, and only the ciphertext blob is persisted.
//
// Blob layout (then base64-encoded for storage):
//   [0]      version (1)
//   [1..17)  salt (16 bytes)
//   [17..29) iv   (12 bytes)
//   [29.. )  AES-GCM ciphertext + 16-byte auth tag

const VERSION = 1;
const ITERATIONS = 250000;
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function b64encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encryptText(text, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  const blob = new Uint8Array(1 + 16 + 12 + ct.length);
  blob[0] = VERSION;
  blob.set(salt, 1);
  blob.set(iv, 17);
  blob.set(ct, 29);
  return b64encode(blob);
}

// Throws if the passphrase is wrong (GCM auth fails) or the blob is malformed.
export async function decryptText(b64, passphrase) {
  const blob = b64decode(b64);
  if (blob[0] !== VERSION) throw new Error('Unsupported encryption version');
  const salt = blob.slice(1, 17);
  const iv = blob.slice(17, 29);
  const ct = blob.slice(29);
  const key = await deriveKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return dec.decode(pt);
}
