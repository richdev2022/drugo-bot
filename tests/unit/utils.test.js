/**
 * Unit Tests for Utility Functions
 * Tests for:
 * - Order parsing and validation
 * - Pagination formatting
 * - Session/token management
 */

const assert = require('assert');

// Import utilities
const {
  parseOrderIdFromText,
  isValidOrderId,
  extractAndValidateOrderId,
  normalizeOrderId,
  isNumericOrderId
} = require('../../utils/orderParser');

const {
  centralPaginationFormatter,
  attachNumberedOptions,
  parseUserSelection
} = require('../../utils/pagination');

const {
  validateSessionValidity,
  checkTokenRefreshNeeded
} = require('../../utils/sessionTokenManager');

// Test suite for orderParser utilities
describe('Order Parser Utilities', () => {
  describe('parseOrderIdFromText', () => {
    it('should extract order ID from "rx 12345" format', () => {
      const result = parseOrderIdFromText('rx 12345');
      assert.strictEqual(result, '12345');
    });

    it('should extract order ID from "order 12345" format', () => {
      const result = parseOrderIdFromText('order 67890');
      assert.strictEqual(result, '67890');
    });

    it('should extract order ID from "prescription 12345" format', () => {
      const result = parseOrderIdFromText('prescription 11111');
      assert.strictEqual(result, '11111');
    });

    it('should extract order ID with hash: "rx #12345"', () => {
      const result = parseOrderIdFromText('rx #54321');
      assert.strictEqual(result, '54321');
    });

    it('should extract order ID from drugsng-12345-timestamp format', () => {
      const result = parseOrderIdFromText('drugsng-12345-1590000000');
      assert.strictEqual(result, '12345');
    });

    it('should extract order ID from "track 12345" format', () => {
      const result = parseOrderIdFromText('track 99999');
      assert.strictEqual(result, '99999');
    });

    it('should extract longest numeric sequence', () => {
      const result = parseOrderIdFromText('123 456789 111');
      assert.strictEqual(result, '456789');
    });

    it('should return null for empty string', () => {
      const result = parseOrderIdFromText('');
      assert.strictEqual(result, null);
    });

    it('should return null for null input', () => {
      const result = parseOrderIdFromText(null);
      assert.strictEqual(result, null);
    });

    it('should return null for undefined input', () => {
      const result = parseOrderIdFromText(undefined);
      assert.strictEqual(result, null);
    });
  });

  describe('isValidOrderId', () => {
    it('should validate numeric order ID', () => {
      assert.strictEqual(isValidOrderId('12345'), true);
    });

    it('should validate order ID with up to 12 digits', () => {
      assert.strictEqual(isValidOrderId('123456789012'), true);
    });

    it('should reject order ID with more than 12 digits', () => {
      assert.strictEqual(isValidOrderId('1234567890123'), false);
    });

    it('should validate alphanumeric order ID', () => {
      assert.strictEqual(isValidOrderId('ABC123'), true);
    });

    it('should reject empty string', () => {
      assert.strictEqual(isValidOrderId(''), false);
    });

    it('should reject null', () => {
      assert.strictEqual(isValidOrderId(null), false);
    });

    it('should reject non-string', () => {
      assert.strictEqual(isValidOrderId(12345), false);
    });
  });

  describe('extractAndValidateOrderId', () => {
    it('should extract and validate order ID successfully', () => {
      const result = extractAndValidateOrderId('rx 12345');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.orderId, '12345');
      assert.strictEqual(result.error, null);
    });

    it('should return error for invalid order ID', () => {
      const result = extractAndValidateOrderId('invalid');
      assert.strictEqual(result.success, false);
      assert(result.error);
    });

    it('should return error for empty text', () => {
      const result = extractAndValidateOrderId('');
      assert.strictEqual(result.success, false);
    });
  });

  describe('normalizeOrderId', () => {
    it('should convert numeric string to integer', () => {
      const result = normalizeOrderId('12345');
      assert.strictEqual(result, 12345);
    });

    it('should keep alphanumeric as string', () => {
      const result = normalizeOrderId('ABC123');
      assert.strictEqual(result, 'ABC123');
    });

    it('should return null for invalid input', () => {
      const result = normalizeOrderId(null);
      assert.strictEqual(result, null);
    });
  });

  describe('isNumericOrderId', () => {
    it('should identify numeric order ID', () => {
      assert.strictEqual(isNumericOrderId('12345'), true);
    });

    it('should reject alphanumeric order ID', () => {
      assert.strictEqual(isNumericOrderId('ABC123'), false);
    });

    it('should reject non-string', () => {
      assert.strictEqual(isNumericOrderId(12345), false);
    });
  });
});

// Test suite for pagination utilities
describe('Pagination Utilities', () => {
  describe('centralPaginationFormatter', () => {
    it('should format paginated list correctly', () => {
      const items = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ];

      const result = centralPaginationFormatter(items, 1, 2, 'Test List');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.currentPage, 1);
      assert.strictEqual(result.totalPages, 2);
      assert.strictEqual(result.itemCount, 3);
      assert.strictEqual(result.numberedItems.length, 3);
      assert(result.message.includes('Test List'));
      assert(result.message.includes('Page 1/2'));
    });

    it('should handle empty items array', () => {
      const result = centralPaginationFormatter([], 1, 1, 'Empty List');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.itemCount, 0);
    });

    it('should indicate navigation availability', () => {
      const items = [{ id: 1, name: 'Item 1' }];

      const result = centralPaginationFormatter(items, 1, 2);

      assert.strictEqual(result.canGoNext, true);
      assert.strictEqual(result.canGoPrevious, false);
    });

    it('should attach numbers to items', () => {
      const items = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ];

      const result = centralPaginationFormatter(items, 1, 1);

      assert.strictEqual(result.numberedItems[0].index, 1);
      assert.strictEqual(result.numberedItems[1].index, 2);
    });
  });

  describe('attachNumberedOptions', () => {
    it('should attach numbers to items', () => {
      const items = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ];

      const result = attachNumberedOptions(items);

      assert.strictEqual(result[0].displayNumber, 1);
      assert.strictEqual(result[1].displayNumber, 2);
      assert.strictEqual(result[2].displayNumber, 3);
      assert.strictEqual(result[0].selectionKey, '1');
    });

    it('should start numbering from custom index', () => {
      const items = [{ id: 1, name: 'Item 1' }];
      const result = attachNumberedOptions(items, 5);

      assert.strictEqual(result[0].displayNumber, 5);
    });

    it('should handle empty array', () => {
      const result = attachNumberedOptions([]);
      assert.strictEqual(result.length, 0);
    });

    it('should handle non-array input', () => {
      const result = attachNumberedOptions(null);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('parseUserSelection', () => {
    it('should parse number selection', () => {
      const result = parseUserSelection('1', 5, 1, 3);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'select');
      assert.strictEqual(result.index, 0);
    });

    it('should parse "next" command', () => {
      const result = parseUserSelection('next', 5, 1, 3);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'paginate');
      assert.strictEqual(result.direction, 'next');
      assert.strictEqual(result.targetPage, 2);
    });

    it('should parse "previous" command', () => {
      const result = parseUserSelection('previous', 5, 2, 3);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'paginate');
      assert.strictEqual(result.direction, 'previous');
      assert.strictEqual(result.targetPage, 1);
    });

    it('should reject "next" on last page', () => {
      const result = parseUserSelection('next', 5, 3, 3);

      assert.strictEqual(result.valid, false);
      assert(result.error);
    });

    it('should reject "previous" on first page', () => {
      const result = parseUserSelection('previous', 5, 1, 3);

      assert.strictEqual(result.valid, false);
      assert(result.error);
    });

    it('should reject selection out of range', () => {
      const result = parseUserSelection('10', 5, 1, 3);

      assert.strictEqual(result.valid, false);
      assert(result.error);
    });

    it('should accept case-insensitive "next"', () => {
      const result = parseUserSelection('NEXT', 5, 1, 3);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.direction, 'next');
    });

    it('should accept "n" as abbreviation for "next"', () => {
      const result = parseUserSelection('n', 5, 1, 3);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.direction, 'next');
    });

    it('should accept "p" as abbreviation for "previous"', () => {
      const result = parseUserSelection('p', 5, 2, 3);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.direction, 'previous');
    });
  });
});

// Test suite for session/token management
describe('Session and Token Management', () => {
  describe('validateSessionValidity', () => {
    it('should validate active session', () => {
      const session = {
        lastActivity: new Date(),
        data: {
          token: 'test-token',
          tokenLastUsed: new Date().toISOString()
        }
      };

      const result = validateSessionValidity(session);

      assert.strictEqual(result.isValid, true);
      assert(result.expiresIn > 0);
    });

    it('should reject null session', () => {
      const result = validateSessionValidity(null);

      assert.strictEqual(result.isValid, false);
    });

    it('should reject expired session', () => {
      const expiredDate = new Date();
      expiredDate.setMinutes(expiredDate.getMinutes() - 20); // 20 minutes ago

      const session = {
        lastActivity: expiredDate,
        data: {
          token: 'test-token',
          tokenLastUsed: expiredDate.toISOString()
        }
      };

      const result = validateSessionValidity(session);

      assert.strictEqual(result.isValid, false);
    });

    it('should warn when session expiring soon', () => {
      const almostExpiredDate = new Date();
      almostExpiredDate.setMinutes(almostExpiredDate.getMinutes() - 6); // 6 minutes ago (4 min until expiry)

      const session = {
        lastActivity: almostExpiredDate,
        data: {
          token: 'test-token',
          tokenLastUsed: almostExpiredDate.toISOString()
        }
      };

      const result = validateSessionValidity(session);

      assert.strictEqual(result.isValid, true);
      assert(result.warnings.length > 0);
    });

    it('should return remaining time', () => {
      const session = {
        lastActivity: new Date(),
        data: {
          token: 'test-token',
          tokenLastUsed: new Date().toISOString()
        }
      };

      const result = validateSessionValidity(session);

      assert(result.expiresIn > 0);
      assert(result.expiresIn <= 10); // Should be close to 10 minutes (default idle timeout)
    });
  });

  describe('checkTokenRefreshNeeded', () => {
    it('should indicate no refresh needed for fresh token', () => {
      const session = {
        data: {
          token: 'test-token',
          tokenCreatedAt: new Date().toISOString()
        }
      };

      const result = checkTokenRefreshNeeded(session);

      assert.strictEqual(result.needsRefresh, false);
    });

    it('should indicate refresh needed for old token', () => {
      const oldDate = new Date();
      oldDate.setMinutes(oldDate.getMinutes() - 56); // 56 minutes ago (4 min threshold)

      const session = {
        data: {
          token: 'test-token',
          tokenCreatedAt: oldDate.toISOString()
        }
      };

      const result = checkTokenRefreshNeeded(session);

      assert.strictEqual(result.needsRefresh, true);
    });

    it('should indicate refresh needed for missing token', () => {
      const session = {
        data: {}
      };

      const result = checkTokenRefreshNeeded(session);

      assert.strictEqual(result.needsRefresh, true);
    });

    it('should indicate refresh needed for null session', () => {
      const result = checkTokenRefreshNeeded(null);

      assert.strictEqual(result.needsRefresh, true);
    });
  });
});

// Summary
console.log('\n✅ All unit tests defined. Run with: npm test\n');

module.exports = {
  parseOrderIdFromText,
  isValidOrderId,
  extractAndValidateOrderId,
  normalizeOrderId,
  isNumericOrderId,
  centralPaginationFormatter,
  attachNumberedOptions,
  parseUserSelection,
  validateSessionValidity,
  checkTokenRefreshNeeded
};
