'use strict';

import bcrypt from 'bcryptjs';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

export function isConfigured() {
  return Boolean(
    process.env.SESSION_SECRET &&
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_PASSWORD_HASH
  );
}

export function getSessionName() {
  return process.env.SESSION_NAME || 'varnam_admin';
}

export function getAdminEmail() {
  return process.env.ADMIN_EMAIL;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  if (!hash) {return false;}
  return bcrypt.compare(password, hash);
}

export function issueCsrfToken(req) {
  const token = crypto.randomBytes(24).toString('hex');
  if (req.session) {req.session.csrfToken = token;}
  return token;
}

export function validateCsrfToken(req, token) {
  const expected = req.session && req.session.csrfToken;
  if (!expected || !token) {return false;}
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {return false;}
  let diff = 0;
  for (let i = 0; i < a.length; i++) {diff |= a[i] ^ b[i];}
  return diff === 0;
}

export function consumeCsrfToken(req) {
  const token = req.session && req.session.csrfToken;
  if (req.session) {req.session.csrfToken = null;}
  return token;
}

export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  return session({
    name: getSessionName(),
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: Number(process.env.SESSION_MAX_AGE_MS || 1000 * 60 * 60 * 8),
      path: '/',
    },
  });
}

export function requireAuth(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.status(401).json({ error: 'authentication_required', message: 'Sign in to continue.' });
  }
  return next();
}

export function requireAuthPage(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.redirect('/admin/login');
  }
  return next();
}

export function requireGuest(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect('/admin');
  }
  return next();
}

// CSRF guard for state-changing requests. Token arrives as the X-XSRF-TOKEN
// header (fetch clients) or the _csrf field (server-rendered forms).
export function csrfGuard(req, res, next) {
  if (!isConfigured()) {return next();}
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {return next();}
  const token =
    req.headers['x-xsrf-token'] ||
    req.headers['xsrf-token'] ||
    req.body._csrf ||
    req.query._csrf;
  if (!validateCsrfToken(req, token)) {
    return res.status(403).json({ error: 'csrf_invalid', message: 'Invalid or missing CSRF token.' });
  }
  next();
}

export function rateLimiter(windowMs, max) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many requests. Try again later.' },
  });
}

export const loginRateLimit = rateLimiter(15 * 60 * 1000, 20); // 20 attempts per 15 min
export const writeRateLimit = rateLimiter(60 * 1000, 60); // 60 writes per minute
