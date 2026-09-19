'use strict';

const { getDb } = require('../db/connection');

/** GET /api/v1/admin/accounts — list all tenants */
function listAccounts(req, res) {
  const db = getDb();
  const accounts = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM users u WHERE u.account_id = a.id AND u.role = 'owner') as owner_count,
      (SELECT COUNT(*) FROM residents r JOIN properties p ON p.id = r.property_id WHERE p.account_id = a.id AND r.status = 'active') as active_residents,
      (SELECT COUNT(*) FROM properties p WHERE p.account_id = a.id) as property_count
    FROM accounts a
    ORDER BY a.created_at DESC
  `).all();
  return res.json(accounts);
}

/** GET /api/v1/admin/accounts/:id */
function getAccount(req, res) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const properties = db.prepare('SELECT * FROM properties WHERE account_id = ?').all(account.id);
  const users = db.prepare('SELECT id, name, email, mobile, role, is_active FROM users WHERE account_id = ?').all(account.id);

  return res.json({ account, properties, users });
}

/** PATCH /api/v1/admin/accounts/:id/suspend */
function suspendAccount(req, res) {
  const db = getDb();
  const { reason } = req.body;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE accounts SET plan = 'suspended', suspended_at = ?, suspend_reason = ?, updated_at = ? WHERE id = ?
  `).run(now, reason || null, now, account.id);

  return res.json({ message: 'Account suspended' });
}

/** PATCH /api/v1/admin/accounts/:id/activate */
function activateAccount(req, res) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const now = new Date().toISOString();
  // Extend trial by 30 days from today if activating from trial/suspended
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE accounts SET plan = 'active', suspended_at = NULL, suspend_reason = NULL, trial_ends_at = ?, updated_at = ? WHERE id = ?
  `).run(trialEndsAt, now, account.id);

  return res.json({ message: 'Account activated' });
}

/** GET /api/v1/admin/stats */
function adminStats(req, res) {
  const db = getDb();
  const totalAccounts   = db.prepare("SELECT COUNT(*) as n FROM accounts").get().n;
  const trialAccounts   = db.prepare("SELECT COUNT(*) as n FROM accounts WHERE plan = 'trial'").get().n;
  const activeAccounts  = db.prepare("SELECT COUNT(*) as n FROM accounts WHERE plan = 'active'").get().n;
  const suspendedAccounts = db.prepare("SELECT COUNT(*) as n FROM accounts WHERE plan = 'suspended'").get().n;
  const totalResidents  = db.prepare("SELECT COUNT(*) as n FROM residents WHERE status = 'active'").get().n;
  const expiredTrials   = db.prepare("SELECT COUNT(*) as n FROM accounts WHERE plan = 'trial' AND trial_ends_at < datetime('now')").get().n;

  return res.json({
    total_accounts: totalAccounts,
    trial: trialAccounts,
    active: activeAccounts,
    suspended: suspendedAccounts,
    expired_trials: expiredTrials,
    total_active_residents: totalResidents,
  });
}

module.exports = { listAccounts, getAccount, suspendAccount, activateAccount, adminStats };
