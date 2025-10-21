const { RateLimiterMemory } = require('rate-limiter-flexible');

// Create rate limiter: 5 requests per minute
const rateLimiter = new RateLimiterMemory({
  points: 5, // Number of requests
  duration: 60, // Per 60 seconds
});

// Check if user is rate limited
const checkRateLimit = async (userId) => {
  try {
    await rateLimiter.consume(userId);
    return { allowed: true };
  } catch (rejRes) {
    const msBeforeNext = rejRes.msBeforeNext;
    return {
      allowed: false,
      message: `Too many requests. Please try again in ${Math.round(msBeforeNext / 1000)} seconds.`
    };
  }
};

module.exports = {
  checkRateLimit
};