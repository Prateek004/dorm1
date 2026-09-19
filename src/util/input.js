'use strict';

/**
 * Input parsing helpers.
 * Every function returns null on bad input — never NaN, never throws.
 */

/** Parse integer paise. Returns null if non-numeric or not finite. */
function paise(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** Parse integer (non-paise). Returns null if non-numeric. */
function int(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

/** Trim and cap a text field. Returns null for missing/empty. */
function text(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.substring(0, max);
}

/** Sanitise a CSV cell — strips commas and newlines to prevent injection. */
function csvCell(v) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[,\r\n"]/g, ' ').trim();
}

module.exports = { paise, int, text, csvCell };
