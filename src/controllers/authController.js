'use strict';

const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb }      = require('../db/connection');
const { scheduleWhatsApp } = require('../services/whatsappService');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const DUMMY_HASH    = '$2a$12$eLr2FWz7m3VbmJBbCzKQWOaOEDtB7lGS6cLUvp5Kx3kH1AHdmq0W6';
const OTP_TTL_MINS  = 10;
const TRIAL_DAYS    = 30;

function getJwtSecret() {
  return process.env.JWT_SECRET || 'change_this_secret_dev_only_32chars!';
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** POST /api/v1/auth/login */
function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  let db;
  try { db = getDb(); } catch (err) {
    console.error('[AUTH] DB not ready:', err.message);
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());
  const hashToCheck = user ? user.password_hash : DUMMY_HASH;
  const valid = bcrypt.compareSync(password, hashToCheck);

  if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password' });

  // Super-admin: no account check needed
  if (user.role === 'superadmin') {
    const token = jwt.sign(
      { sub: user.id, role: user.role, property: null, account: null },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, role: user.role, property_id: null } });
  }

  // Check account status
  if (user.account_id) {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(user.account_id);
    if (account) {
      if (account.plan === 'suspended') {
        return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });
      }
      if (account.plan === 'trial' && new Date(account.trial_ends_at) < new Date()) {
        return res.status(403).json({ error: 'Your free trial has ended. Contact support to continue.' });
      }
    }
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, property: user.property_id, account: user.account_id },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  return res.json({
    token,
    user: {
      id:          user.id,
      name:        user.name,
      email:       user.email,
      mobile:      user.mobile,
      role:        user.role,
      property_id: user.property_id,
    },
  });
}

/**
 * POST /api/v1/auth/register
 * Self-serve signup: creates account + property + owner user in one shot.
 * Body: { business_name, owner_name, mobile, email, password, pg_name, city, state }
 */
function register(req, res) {
  const db = getDb();
  const { business_name, owner_name, mobile, email, password, pg_name, city, state } = req.body;

  if (!business_name || !owner_name || !mobile || !password || !pg_name) {
    return res.status(400).json({ error: 'business_name, owner_name, mobile, password, pg_name are required' });
  }
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Check duplicates
  const existingMobile = db.prepare('SELECT id FROM accounts WHERE owner_mobile = ?').get(mobile);
  if (existingMobile) return res.status(409).json({ error: 'This mobile number is already registered' });

  if (email) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existingEmail) return res.status(409).json({ error: 'This email is already registered' });
  }

  const now          = new Date().toISOString();
  const trialEndsAt  = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const accountId    = uuidv4();
  const propertyId   = uuidv4();
  const ownerId      = uuidv4();
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);

  // Generate property code from pg_name
  const propCode = pg_name.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase() || 'PROP';

  db.transaction(() => {
    db.prepare(`
      INSERT INTO accounts (id, business_name, owner_name, owner_mobile, owner_email, plan, trial_ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, ?)
    `).run(accountId, business_name.trim(), owner_name.trim(), mobile, email ? email.toLowerCase().trim() : null, trialEndsAt, now, now);

    db.prepare(`
      INSERT INTO properties (id, account_id, name, address, city, state, pincode, owner_id, property_code, created_at, updated_at)
      VALUES (?, ?, ?, '', ?, ?, '', ?, ?, ?, ?)
    `).run(propertyId, accountId, pg_name.trim(), city || '', state || '', ownerId, propCode, now, now);

    db.prepare(`
      INSERT INTO users (id, account_id, property_id, name, email, mobile, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', 1, ?, ?)
    `).run(ownerId, accountId, propertyId, owner_name.trim(), email ? email.toLowerCase().trim() : null, mobile, passwordHash, now, now);
  })();

  console.log(`[REGISTER] New account: ${business_name} (${mobile})`);

  // Log them in immediately
  const token = jwt.sign(
    { sub: ownerId, role: 'owner', property: propertyId, account: accountId },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  return res.status(201).json({
    message: 'Account created successfully',
    trial_ends_at: trialEndsAt,
    token,
    user: { id: ownerId, name: owner_name.trim(), email: email || null, mobile, role: 'owner', property_id: propertyId },
  });
}

/**
 * POST /api/v1/auth/forgot-password
 * Sends a 6-digit OTP to the registered mobile via WhatsApp.
 * Body: { mobile }
 */
function forgotPassword(req, res) {
  const db = getDb();
  const { mobile } = req.body;

  if (!mobile) return res.status(400).json({ error: 'mobile is required' });

  // Always return 200 to avoid mobile enumeration
  const user = db.prepare("SELECT * FROM users WHERE mobile = ? AND role != 'superadmin' AND is_active = 1").get(mobile);

  if (user) {
    const otp      = generateOtp();
    const otpHash  = bcrypt.hashSync(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINS * 60 * 1000).toISOString();
    const now      = new Date().toISOString();

    // Invalidate previous OTPs for this mobile
    db.prepare("UPDATE otp_store SET used = 1 WHERE mobile = ? AND used = 0").run(mobile);

    db.prepare(`
      INSERT INTO otp_store (id, mobile, otp_hash, expires_at, used, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(uuidv4(), mobile, otpHash, expiresAt, now);

    // Send via WhatsApp (fire and forget)
    scheduleWhatsApp({
      propertyId: user.property_id || 'system',
      residentId: null,
      recipientMobile: mobile,
      recipientType: 'owner',
      eventType: 'otp_password_reset',
      templateData: { otp, name: user.name, expiry_mins: OTP_TTL_MINS },
    }).catch(err => console.error('[OTP] WhatsApp send failed:', err.message));
  }

  return res.json({ message: 'If this mobile is registered, an OTP has been sent via WhatsApp.' });
}

/**
 * POST /api/v1/auth/reset-password
 * Body: { mobile, otp, new_password }
 */
function resetPassword(req, res) {
  const db = getDb();
  const { mobile, otp, new_password } = req.body;

  if (!mobile || !otp || !new_password) {
    return res.status(400).json({ error: 'mobile, otp, and new_password are required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const otpRow = db.prepare(`
    SELECT * FROM otp_store
    WHERE mobile = ? AND used = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(mobile);

  if (!otpRow || !bcrypt.compareSync(otp, otpRow.otp_hash)) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  // Mark OTP used
  db.prepare("UPDATE otp_store SET used = 1 WHERE id = ?").run(otpRow.id);

  const user = db.prepare("SELECT * FROM users WHERE mobile = ? AND is_active = 1").get(mobile);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(bcrypt.hashSync(new_password, BCRYPT_ROUNDS), user.id);

  return res.json({ message: 'Password reset successfully. Please log in.' });
}

/** POST /api/v1/auth/change-password */
function changePassword(req, res) {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password are required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(bcrypt.hashSync(new_password, BCRYPT_ROUNDS), req.user.id);
  return res.json({ message: 'Password updated successfully' });
}

/** GET /api/v1/auth/me */
function me(req, res) {
  const db   = getDb();
  const user = db.prepare(
    'SELECT id, name, email, mobile, role, property_id, account_id FROM users WHERE id = ?'
  ).get(req.user.id);
  return res.json(user);
}

module.exports = { login, register, forgotPassword, resetPassword, changePassword, me };
