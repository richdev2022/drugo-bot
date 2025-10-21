// Simple in-memory cache for database operations
const cache = new Map();

// Set cache value with optional expiration
const setToCache = (key, value, expirationMs = 3600000) => {
  const expirationTime = Date.now() + expirationMs;
  cache.set(key, {
    value,
    expirationTime
  });
  return value;
};

// Get cache value
const getFromCache = (key) => {
  if (!cache.has(key)) {
    return null;
  }
  
  const cacheItem = cache.get(key);
  
  // Check if expired
  if (cacheItem.expirationTime < Date.now()) {
    cache.delete(key);
    return null;
  }
  
  return cacheItem.value;
};

// Clear cache
const clearCache = () => {
  cache.clear();
};

// Clear specific key
const clearCacheKey = (key) => {
  cache.delete(key);
};

module.exports = {
  setToCache,
  getFromCache,
  clearCache,
  clearCacheKey
};