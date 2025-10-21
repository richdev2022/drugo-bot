// Utilities for parsing and validating order IDs from free text
const { sanitizeInput } = require('./validation');

/**
 * Try several patterns to extract an order ID from text
 * Supports multiple formats: rx 12345, order 12345, prescription 12345, drugsng-12345-timestamp, etc.
 * @param {string} text - Text to parse
 * @returns {string|null} Extracted order ID or null if not found
 */
const parseOrderIdFromText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim();

  // Common caption patterns: rx 12345, order 12345, prescription 12345, rx#12345, etc.
  const captionMatch = s.match(/(?:\brx\b|\border\b|\bprescription\b)\s*#?([A-Za-z0-9_-]{2,50})/i);
  if (captionMatch && captionMatch[1]) return captionMatch[1];

  // txRef or reference patterns like drugsng-12345-1590000000 or drugsng_12345
  const txRefMatch = s.match(/(?:drugsng[-_])([0-9]+)(?:[-_][0-9]+)?/i);
  if (txRefMatch && txRefMatch[1]) return txRefMatch[1];

  // Track or status patterns: track 12345, status 12345
  const trackMatch = s.match(/(?:\btrack\b|\bstatus\b)\s*#?([A-Za-z0-9_-]{2,50})/i);
  if (trackMatch && trackMatch[1]) return trackMatch[1];

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

/**
 * Validate order ID format
 * Primarily numeric IDs used in DB (1-12 digits)
 * Also accepts alphanumeric IDs for external systems
 * @param {string} id - Order ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
const isValidOrderId = (id) => {
  if (!id || typeof id !== 'string') return false;
  const clean = sanitizeInput(id);
  if (/^[0-9]{1,12}$/.test(clean)) return true;
  // Allow alphanumeric if necessary (for external system IDs)
  if (/^[A-Za-z0-9_-]{3,50}$/.test(clean)) return true;
  return false;
};

/**
 * Extract order ID from text and validate it in one step
 * @param {string} text - Text to parse
 * @returns {Object} { success: boolean, orderId: string|null, error: string|null }
 */
const extractAndValidateOrderId = (text) => {
  try {
    const orderId = parseOrderIdFromText(text);

    if (!orderId) {
      return {
        success: false,
        orderId: null,
        error: 'Could not extract order ID from text'
      };
    }

    if (!isValidOrderId(orderId)) {
      return {
        success: false,
        orderId,
        error: `Invalid order ID format: ${orderId}`
      };
    }

    return {
      success: true,
      orderId,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      orderId: null,
      error: error.message
    };
  }
};

/**
 * Convert order ID to integer if it's numeric
 * @param {string} orderId - Order ID to convert
 * @returns {number|string} Integer if numeric, otherwise original string
 */
const normalizeOrderId = (orderId) => {
  if (!orderId || typeof orderId !== 'string') return null;
  const clean = sanitizeInput(orderId);
  const num = parseInt(clean, 10);
  return !isNaN(num) ? num : clean;
};

/**
 * Check if an order ID is numeric
 * @param {string} orderId - Order ID to check
 * @returns {boolean} True if numeric, false otherwise
 */
const isNumericOrderId = (orderId) => {
  if (!orderId || typeof orderId !== 'string') return false;
  return /^[0-9]{1,12}$/.test(sanitizeInput(orderId));
};

module.exports = {
  parseOrderIdFromText,
  isValidOrderId,
  extractAndValidateOrderId,
  normalizeOrderId,
  isNumericOrderId
};
