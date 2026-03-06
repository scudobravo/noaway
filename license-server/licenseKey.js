/**
 * License key generation: NOAWAY-XXXX-XXXX-XXXX
 * Uses crypto.randomBytes for secure random generation.
 */

const crypto = require('crypto');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O, 1/I
const SEGMENT_LENGTH = 4;
const SEGMENTS = 4;
const PREFIX = 'NOAWAY';

function randomSegment() {
  const bytes = crypto.randomBytes(SEGMENT_LENGTH);
  let segment = '';
  for (let i = 0; i < SEGMENT_LENGTH; i++) {
    segment += CHARS[bytes[i] % CHARS.length];
  }
  return segment;
}

function generateLicenseKey() {
  const parts = [PREFIX];
  for (let i = 0; i < SEGMENTS; i++) {
    parts.push(randomSegment());
  }
  return parts.join('-');
}

function normalizeKey(input) {
  if (typeof input !== 'string') return '';
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

function isValidFormat(key) {
  const normalized = normalizeKey(key);
  const re = /^NOAWAY-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
  return re.test(normalized);
}

module.exports = {
  generateLicenseKey,
  normalizeKey,
  isValidFormat,
};
