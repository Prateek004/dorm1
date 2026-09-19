'use strict';

const jwt    = require('jsonwebtoken');
const { getDb } = require('../db/connection');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'change_this_secret_dev_only_32chars!';
}

/** Verifies JWT and loads user from DB on every request */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }
  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.sub);
  if (!user) return res.status(401).json({ error: 'User not found or inactive' });

  // Super-admin bypasses account checks
  if (user.role !== 'superadmin' && user.account_id) {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(user.account_id);
    if (account) {
      if (account.plan === 'suspended') {
        return res.status(403).json({ error: 'Account suspended. Contact support.' });
      }
      if (account.plan === 'trial' && new Date(account.trial_ends_at) < new Date()) {
        return res.status(403).json({ error: 'Trial expired. Contact support to continue.' });
      }
    }
  }

  req.user = user;
  next();
}

const ROLE_RANK = { superadmin: 4, owner: 3, manager: 2, reception: 1 };

function requireRole(minRole) {
  return (req, res, next) => {
    if ((ROLE_RANK[req.user.role] || 0) < (ROLE_RANK[minRole] || 0)) {
      return res.status(403).json({ error: `Requires ${minRole} role or above` });
    }
    next();
  };
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
}

function sameProperty(req, res, next) {
  // Super-admin can access everything
  if (req.user.role === 'superadmin') return next();
  if (!req.user.property_id) return res.status(403).json({ error: 'No property assigned' });
  next();
}

function assertOwnsResource(table) {
  return (req, res, next) => {
    if (req.user.role === 'superadmin') return next();
    const db  = getDb();
    const row = db.prepare(`SELECT property_id FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Resource not found' });
    if (row.property_id !== req.user.property_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

function stripFinancial(req, res, next) {
  if (req.user.role === 'reception') {
    const orig = res.json.bind(res);
    res.json = (data) => {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const strip = ['amount_paise','total_paid_paise','total_refunded_paise','balance_paise',
                       'deposit_paise','monthly_rent_paise','net_refund_paise','pending_dues_paise'];
        strip.forEach(k => { if (k in data) delete data[k]; });
      }
      return orig(data);
    };
  }
  next();
}

module.exports = { authenticate, requireRole, requireSuperAdmin, sameProperty, assertOwnsResource, stripFinancial };
