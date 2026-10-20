const crypto = require('crypto');
const util = require('util');

const SESSION_COOKIE = 'mi_finanzas_session';
const CSRF_COOKIE = 'mi_finanzas_csrf';
const SESSION_DURATION_SECONDS = 60 * 60 * 8;
const SCRYPT_KEY_LENGTH = 64;

function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET es obligatorio en producción');
  }

  return 'development-only-session-secret-change-me';
}

// Versión asíncrona: scrypt corre en el pool de hilos y no bloquea otras peticiones.
const scrypt = util.promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, SCRYPT_KEY_LENGTH)).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHash] = storedHash.split(':');

  if (algorithm !== 'scrypt' || !salt || !expectedHash) {
    return false;
  }

  const actualBuffer = await scrypt(password, salt, SCRYPT_KEY_LENGTH);
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  return expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function createSessionToken(userId) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (typeof token !== 'string') {
    return null;
  }

  const [userId, expiresAtText, signature] = token.split('.');
  const expiresAt = Number(expiresAtText);

  if (!userId || !Number.isInteger(Number(userId)) || !Number.isFinite(expiresAt) || !signature) {
    return null;
  }

  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const payload = `${userId}.${expiresAt}`;
  const expectedSignature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  return { id: Number(userId) };
}

function parseCookies(header) {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(';').map(cookie => cookie.trim().split('='))
  );
}

function createCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  createCsrfToken,
  createSessionToken,
  hashPassword,
  parseCookies,
  verifyPassword,
  verifySessionToken
};