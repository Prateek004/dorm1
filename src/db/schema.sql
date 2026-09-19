-- ============================================================
-- DormBook — SQLite Schema v4.0 (SaaS Multi-tenant)
-- All monetary values in PAISE (integer). UTC timestamps.
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Accounts (one per PG business / SaaS tenant) ──────────
CREATE TABLE IF NOT EXISTS accounts (
  id                TEXT PRIMARY KEY,
  business_name     TEXT NOT NULL,
  plan              TEXT NOT NULL DEFAULT 'trial'
                      CHECK (plan IN ('trial','active','suspended')),
  trial_ends_at     TEXT,
  suspended_at      TEXT,
  suspension_reason TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Properties ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id                               TEXT PRIMARY KEY,
  account_id                       TEXT,
  name                             TEXT NOT NULL,
  address                          TEXT,
  city                             TEXT,
  state                            TEXT,
  pincode                          TEXT,
  owner_id                         TEXT,
  whatsapp_number                  TEXT,
  cleaning_timeout_minutes         INTEGER NOT NULL DEFAULT 120,
  refund_approval_threshold_paise  INTEGER NOT NULL DEFAULT 0,
  daily_summary_time               TEXT    NOT NULL DEFAULT '22:00',
  eod_report_time                  TEXT    NOT NULL DEFAULT '22:00',
  timezone                         TEXT    NOT NULL DEFAULT 'Asia/Kolkata',
  cash_reconciliation_tolerance_paise INTEGER NOT NULL DEFAULT 0,
  booking_lock_hours               INTEGER NOT NULL DEFAULT 24,
  property_code                    TEXT    NOT NULL DEFAULT 'PROP',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- ── Users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  account_id    TEXT,
  property_id   TEXT,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  mobile        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'reception'
                  CHECK (role IN ('superadmin','owner', 'manager', 'reception')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id)  REFERENCES accounts(id),
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- ── OTP Store (for WhatsApp password reset) ───────────────
CREATE TABLE IF NOT EXISTS otp_store (
  id         TEXT PRIMARY KEY,
  mobile     TEXT NOT NULL,
  otp_hash   TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mobile)
);

-- ── Property hierarchy ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS floors (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL,
  floor_number INTEGER NOT NULL,
  label        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  floor_id    TEXT NOT NULL,
  property_id TEXT NOT NULL,
  room_number TEXT NOT NULL,
  room_type   TEXT NOT NULL DEFAULT 'shared'
                CHECK (room_type IN ('shared', 'private', 'dormitory')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (floor_id)    REFERENCES floors(id),
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

CREATE TABLE IF NOT EXISTS beds (
  id                  TEXT PRIMARY KEY,
  room_id             TEXT NOT NULL,
  property_id         TEXT NOT NULL,
  bed_label           TEXT NOT NULL,
  base_rate_paise     INTEGER NOT NULL DEFAULT 0,
  daily_rate_paise    INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available','occupied','reserved','cleaning','pending')),
  cleaning_started_at TEXT,
  booking_request_id  TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (room_id)     REFERENCES rooms(id),
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- ── Residents ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residents (
  id                       TEXT PRIMARY KEY,
  property_id              TEXT NOT NULL,
  bed_id                   TEXT,
  full_name                TEXT NOT NULL,
  mobile                   TEXT NOT NULL,
  aadhaar_number_encrypted TEXT,
  aadhaar_last4            TEXT,
  aadhaar_mobile           TEXT,
  aadhaar_photo_path       TEXT,
  aadhaar_consent          INTEGER NOT NULL DEFAULT 0,
  aadhaar_consent_at       TEXT,
  coming_from              TEXT,
  permanent_address        TEXT,
  purpose_of_visit         TEXT,
  emergency_contact_name   TEXT,
  emergency_contact_mobile TEXT,
  photo_path               TEXT,
  check_in_date            TEXT,
  expected_checkout        TEXT,
  actual_checkout          TEXT,
  rent_due_day             INTEGER NOT NULL DEFAULT 1,
  status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','checked_out')),
  monthly_rent_paise       INTEGER NOT NULL DEFAULT 0,
  rate_type                TEXT    NOT NULL DEFAULT 'daily'
                             CHECK (rate_type IN ('daily','weekly','monthly')),
  rate_paise               INTEGER NOT NULL DEFAULT 0,
  deposit_paise            INTEGER NOT NULL DEFAULT 0,
  notes                    TEXT,
  checkin_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (bed_id)      REFERENCES beds(id),
  FOREIGN KEY (checkin_by)  REFERENCES users(id)
);

-- ── Payment Ledger ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_ledger (
  id              TEXT PRIMARY KEY,
  property_id     TEXT NOT NULL,
  resident_id     TEXT NOT NULL,
  billing_month   TEXT,
  amount_paise    INTEGER NOT NULL,
  direction       TEXT NOT NULL DEFAULT 'credit'
                    CHECK (direction IN ('credit','debit')),
  type            TEXT NOT NULL
                    CHECK (type IN ('rent','deposit','deposit_refund','extra_charge','advance')),
  payment_mode    TEXT NOT NULL DEFAULT 'cash'
                    CHECK (payment_mode IN ('cash','upi','card','bank_transfer')),
  gateway_txn_id  TEXT,
  gateway_status  TEXT CHECK (gateway_status IN ('success','pending','failed',NULL)),
  due_date        TEXT,
  paid_at         TEXT NOT NULL DEFAULT (datetime('now')),
  requires_approval  INTEGER NOT NULL DEFAULT 0,
  approved_by        TEXT,
  approved_at        TEXT,
  approval_status    TEXT NOT NULL DEFAULT 'not_required'
                       CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  sync_status     TEXT NOT NULL DEFAULT 'synced'
                    CHECK (sync_status IN ('synced','pending')),
  notes           TEXT,
  recorded_by     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (resident_id) REFERENCES residents(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- ── Expenses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL,
  category     TEXT NOT NULL,
  description  TEXT,
  amount_paise INTEGER NOT NULL,
  expense_date TEXT NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'cash'
                 CHECK (payment_mode IN ('cash','upi','card','bank_transfer')),
  receipt_path TEXT,
  recorded_by  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

-- ── Stay Extensions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stay_extensions (
  id              TEXT PRIMARY KEY,
  resident_id     TEXT NOT NULL,
  property_id     TEXT NOT NULL,
  old_checkout    TEXT NOT NULL,
  new_checkout    TEXT NOT NULL,
  old_rent_paise  INTEGER,
  new_rent_paise  INTEGER,
  notes           TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (resident_id) REFERENCES residents(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (created_by)  REFERENCES users(id)
);

-- ── Audit Log (insert-only) ────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  amount_paise INTEGER,
  snapshot    TEXT,
  ip_address  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (actor_id)    REFERENCES users(id)
);

-- ── Document Access Log (DPDP compliance)
