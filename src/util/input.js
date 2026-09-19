'use strict';

function paise(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function int(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function text(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.substring(0, max);
}

function csvCell(v) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[,\r\n"]/g, ' ').trim();
}

module.exports = { paise, int, text, csvCell };
