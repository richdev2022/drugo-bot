/**
 * Unified Session and Token Management
 * Ensures consistent session/token handling across all services
 * - Sets session.data.token for both local and external tokens
 * - Updates tokenLastUsed on API calls
 * - Manages token expiry and refresh
 * - Handles session idle timeout
 */

const { User, Session } = require('../models');

// Session configuration
const SESSION_CONFIG = {
  idleTimeoutMinutes: parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '10', 10),
  tokenExpiryMinutes: parseInt(process.env.TOKEN_EXPIRY_MINUTES || '60', 10),
  tokenRefreshThresholdMinutes: 5
};

/**
 * Initialize or update user session with unified token handling
 * @param {string} phoneNumber - User's phone number
 * @param {Object} userData - User data from login/registration (includes tokens)
 * @param {string} tokenSource - Source of token ('local' or 'external')
 * @returns {Promise<Object>} Updated session
 */
const initializeSession = async (phoneNumber, userData, tokenSource = 'local') => {
  try {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new Error('Invalid phone number');
    }

    // Find or create session
    let session = await Session.findOne({ where: { phoneNumber } });

    if (!session) {
      session = await Session.create({
        phoneNumber,
        state: 'LOGGED_IN',
        data: {}
      });
    } else {
      session.state = 'LOGGED_IN';
    }

    // Initialize session data
    session.data = session.data || {};

    // Store token in unified way
    if (userData && userData.token) {
      session.data.token = userData.token;
      session.data.tokenSource = tokenSource;
      session.data.tokenCreatedAt = new Date().toISOString();
      session.data.tokenLastUsed = new Date().toISOString();
    }

    // Store user reference
    if (userData && userData.userId) {
      session.data.userId = userData.userId;
    }

    // Store external token if available (e.g., drugsngToken)
    if (userData && userData.drugsngToken) {
      session.data.drugsngToken = userData.drugsngToken;
      session.data.drugsngUserId = userData.drugsngUserId;
      session.data.externalTokenCreatedAt = new Date().toISOString();
      session.data.externalTokenLastUsed = new Date().toISOString();
    }

    // Update last activity
    session.lastActivity = new Date();
    await session.save();

    return session;
  } catch (error) {
    console.error('Error initializing session:', error);
    throw error;
  }
};

/**
 * Update token last used timestamp
 * Called whenever an API call is made that requires the token
 * @param {string} phoneNumber - Phone number
 * @param {string} tokenType - Type of token ('token' or 'drugsngToken')
 * @returns {Promise<boolean>} Success status
 */
const updateTokenLastUsed = async (phoneNumber, tokenType = 'token') => {
  try {
    const session = await Session.findOne({ where: { phoneNumber } });
    if (!session) {
      console.warn(`Session not found for phone number: ${phoneNumber}`);
      return false;
    }

    session.data = session.data || {};

    if (tokenType === 'token') {
      session.data.tokenLastUsed = new Date().toISOString();
    } else if (tokenType === 'drugsngToken') {
      session.data.externalTokenLastUsed = new Date().toISOString();
    }

    session.lastActivity = new Date();
    await session.save();

    return true;
  } catch (error) {
    console.error('Error updating token last used:', error);
    return false;
  }
};

/**
 * Check if session is still valid (not expired due to inactivity)
 * @param {Object} session - Session object from database
 * @returns {Object} { isValid: boolean, expiresIn: number (minutes), warnings: string[] }
 */
const validateSessionValidity = (session) => {
  try {
    if (!session || !session.data || !session.data.token) {
      return { isValid: false, expiresIn: null, warnings: ['No session token'] };
    }
    // Session with a token is considered valid; no idle expiry.
    return { isValid: true, expiresIn: null, warnings: [] };
  } catch (error) {
    console.error('Error validating session:', error);
    return { isValid: false, expiresIn: null, warnings: ['Session validation error'] };
  }
};

/**
 * Check if session token needs refresh
 * @param {Object} session - Session object
 * @returns {Object} { needsRefresh: boolean, reason: string }
 */
const checkTokenRefreshNeeded = (session) => {
  try {
    if (!session || !session.data) {
      return { needsRefresh: true, reason: 'No session data' };
    }

    const token = session.data.token;
    const tokenCreatedAt = session.data.tokenCreatedAt;

    if (!token || !tokenCreatedAt) {
      return { needsRefresh: true, reason: 'No token or creation time' };
    }

    const now = new Date();
    const tokenAgeMinutes = (now - new Date(tokenCreatedAt)) / (1000 * 60);
    const maxTokenAgeMinutes = SESSION_CONFIG.tokenExpiryMinutes;
    const refreshThresholdMinutes = SESSION_CONFIG.tokenRefreshThresholdMinutes;

    // Need refresh if token is expiring soon or already expired
    if (tokenAgeMinutes > (maxTokenAgeMinutes - refreshThresholdMinutes)) {
      return { needsRefresh: true, reason: `Token age (${Math.round(tokenAgeMinutes)}m) approaching expiry (${maxTokenAgeMinutes}m)` };
    }

    return { needsRefresh: false, reason: 'Token still valid' };
  } catch (error) {
    console.error('Error checking token refresh:', error);
    return { needsRefresh: true, reason: 'Validation error' };
  }
};

/**
 * Get or refresh session token
 * @param {string} phoneNumber - Phone number
 * @param {Function} refreshFn - Optional function to refresh token (returns new token)
 * @returns {Promise<Object>} { success: boolean, token: string|null, error: string|null }
 */
const getOrRefreshToken = async (phoneNumber, refreshFn = null) => {
  try {
    const session = await Session.findOne({ where: { phoneNumber } });

    if (!session) {
      return { success: false, token: null, error: 'Session not found' };
    }

    // Check validity
    const validity = validateSessionValidity(session);
    if (!validity.isValid) {
      return { success: false, token: null, error: 'Session expired', warnings: validity.warnings };
    }

    // Check if refresh needed
    const refreshCheck = checkTokenRefreshNeeded(session);

    if (refreshCheck.needsRefresh && typeof refreshFn === 'function') {
      try {
        const newToken = await refreshFn();
        session.data.token = newToken;
        session.data.tokenCreatedAt = new Date().toISOString();
        session.data.tokenLastUsed = new Date().toISOString();
        await session.save();
        return { success: true, token: newToken, refreshed: true };
      } catch (error) {
        console.warn('Token refresh failed:', error.message);
        // Continue with existing token if refresh fails
      }
    }

    // Update last used
    await updateTokenLastUsed(phoneNumber);

    return {
      success: true,
      token: session.data.token,
      refreshed: false,
      warnings: validity.warnings
    };
  } catch (error) {
    console.error('Error getting or refreshing token:', error);
    return { success: false, token: null, error: error.message };
  }
};

/**
 * Get session and verify authentication
 * Returns the session if valid, null otherwise
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<Object|null>} Session object or null if invalid/expired
 */
const getAuthenticatedSession = async (phoneNumber) => {
  try {
    const session = await Session.findOne({ where: { phoneNumber } });

    if (!session) {
      console.warn(`No session found for phone: ${phoneNumber}`);
      return null;
    }

    const validity = validateSessionValidity(session);
    if (!validity.isValid) {
      console.log(`Session invalid for phone ${phoneNumber}: ${validity.warnings.join(', ')}`);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date();
    await session.save();

    return session;
  } catch (error) {
    console.error('Error getting authenticated session:', error);
    return null;
  }
};

/**
 * Invalidate session (logout)
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<boolean>} Success status
 */
const invalidateSession = async (phoneNumber) => {
  try {
    const session = await Session.findOne({ where: { phoneNumber } });

    if (!session) {
      return false;
    }

    // Clear sensitive data
    session.state = 'NEW';
    session.data = {};
    await session.save();

    console.log(`Session invalidated for phone: ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error('Error invalidating session:', error);
    return false;
  }
};

/**
 * Get session metadata for logging/debugging
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<Object>} Session metadata
 */
const getSessionMetadata = async (phoneNumber) => {
  try {
    const session = await Session.findOne({ where: { phoneNumber } });

    if (!session) {
      return { found: false };
    }

    const validity = validateSessionValidity(session);
    const refreshCheck = checkTokenRefreshNeeded(session);

    return {
      found: true,
      phoneNumber,
      state: session.state,
      lastActivity: session.lastActivity,
      tokenSource: session.data?.tokenSource,
      tokenAgeMinutes: session.data?.tokenCreatedAt ? (new Date() - new Date(session.data.tokenCreatedAt)) / (1000 * 60) : null,
      validity: {
        isValid: validity.isValid,
        expiresIn: validity.expiresIn,
        warnings: validity.warnings
      },
      refreshCheck,
      hasLocalToken: !!session.data?.token,
      hasExternalToken: !!session.data?.drugsngToken
    };
  } catch (error) {
    console.error('Error getting session metadata:', error);
    return { found: false, error: error.message };
  }
};

/**
 * Cleanup expired sessions (should be run periodically)
 * @returns {Promise<number>} Number of sessions cleaned up
 */
const cleanupExpiredSessions = async () => {
  try {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - SESSION_CONFIG.idleTimeoutMinutes * 60 * 1000);

    const result = await Session.destroy({
      where: {
        lastActivity: {
          [require('sequelize').Op.lt]: cutoffTime
        },
        state: 'NEW' // Only delete sessions that are already logged out
      }
    });

    console.log(`Cleaned up ${result} expired sessions`);
    return result;
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return 0;
  }
};

/**
 * Ensure session data has required fields
 * @param {Object} session - Session object
 * @returns {Object} Normalized session with required fields
 */
const normalizeSessionData = (session) => {
  if (!session) return null;

  session.data = session.data || {};
  session.data.tokenLastUsed = session.data.tokenLastUsed || session.lastActivity?.toISOString();
  session.data.tokenCreatedAt = session.data.tokenCreatedAt || session.createdAt?.toISOString();

  return session;
};

module.exports = {
  initializeSession,
  updateTokenLastUsed,
  validateSessionValidity,
  checkTokenRefreshNeeded,
  getOrRefreshToken,
  getAuthenticatedSession,
  invalidateSession,
  getSessionMetadata,
  cleanupExpiredSessions,
  normalizeSessionData,
  SESSION_CONFIG
};
