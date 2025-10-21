// Utilities for parsing and validating order IDs from free text
const { sanitizeInput } = require('./validation');

// Try several patterns to extract an order id from text
// Returns the extracted id string or null
const parseOrderIdFromText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim();

  // Common caption patterns: rx 12345, order 12345, prescription 12345
  const captionMatch = s.match(/(?:\brx\b|\border\b|\bprescription\b)\s*#?([A-Za-z0-9_-]{2,50})/i);
  if (captionMatch && captionMatch[1]) return captionMatch[1];

  // txRef or reference patterns like drugsng-12345-1590000000 or drugsng_12345
  const txRefMatch = s.match(/(?:drugsng[-_])([0-9]+)(?:[-_][0-9]+)?/i);
  if (txRefMatch && txRefMatch[1]) return txRefMatch[1];

  // Generic numeric ID anywhere in text (prefer longer numbers)
  const numbers = s.match(/\d{3,}/g); // require at least 3 digits to avoid accidental small numbers
  if (numbers && numbers.length > 0) {
    // pick the longest numeric token
    numbers.sort((a, b) => b.length - a.length);
    return numbers[0];
  }

  // Fallback: any alphanumeric token that might be an ID
  const tokens = s.match(/[A-Za-z0-9_-]{3,50}/g);
  if (tokens && tokens.length > 0) return tokens[0];

  return null;
};

// Validate order id format — primarily numeric IDs used in DB
// Accepts numeric strings (1-12 digits). You can relax this if external systems use alphanumeric IDs.
const isValidOrderId = (id) => {
  if (!id || typeof id !== 'string') return false;
  const clean = sanitizeInput(id);
  if (/^[0-9]{1,12}$/.test(clean)) return true;
  // Allow short alphanumeric if necessary (unlikely for DB primary keys)
  if (/^[A-Za-z0-9_-]{3,50}$/.test(clean)) return true;
  return false;
};

module.exports = {
  parseOrderIdFromText,
  isValidOrderId
};
