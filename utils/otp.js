// Generate a random 4-digit OTP
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Calculate OTP expiry time (5 minutes from now)
const getOTPExpiry = () => {
  const now = new Date();
  return new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
};

// Check if OTP is still valid
const isOTPValid = (expiryTime) => {
  if (!expiryTime) return false;
  const now = new Date();
  return now <= new Date(expiryTime);
};

// Get formatted OTP expiry message
const getOTPExpiryMessage = (expiryTime) => {
  if (!expiryTime) return 'OTP expired';
  const now = new Date();
  const expiryDate = new Date(expiryTime);
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffSecs = Math.floor((diffMs % 60000) / 1000);
  
  if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ${diffSecs} second${diffSecs !== 1 ? 's' : ''}`;
  } else if (diffSecs > 0) {
    return `${diffSecs} second${diffSecs !== 1 ? 's' : ''}`;
  } else {
    return 'OTP expired';
  }
};

module.exports = {
  generateOTP,
  getOTPExpiry,
  isOTPValid,
  getOTPExpiryMessage
};
