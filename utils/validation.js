// Email validation
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Phone number validation (Nigerian format)
const isValidPhoneNumber = (phoneNumber) => {
  // Accept formats: +234, 0, or just the number
  const phoneRegex = /^(\+234|234|0)?[789]\d{9}$/;
  return phoneRegex.test(phoneNumber.replace(/\s/g, ''));
};

// Normalize phone number to international format
const normalizePhoneNumber = (phoneNumber) => {
  let normalized = phoneNumber.replace(/\s/g, '');
  
  if (normalized.startsWith('0')) {
    normalized = '234' + normalized.substring(1);
  } else if (!normalized.startsWith('+234') && !normalized.startsWith('234')) {
    normalized = '234' + normalized;
  }
  
  if (normalized.startsWith('234')) {
    normalized = '+' + normalized;
  }
  
  return normalized;
};

// Password validation
const isValidPassword = (password) => {
  // At least 6 characters
  return password && password.length >= 6;
};

// Validate order data
const isValidOrderData = (orderData) => {
  if (!orderData) return false;
  if (!orderData.address || orderData.address.trim().length < 5) return false;
  if (!orderData.paymentMethod) return false;
  const validMethods = ['Flutterwave', 'Paystack', 'Cash on Delivery'];
  return validMethods.includes(orderData.paymentMethod);
};

// Sanitize string input
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, 1000); // Limit to 1000 characters
};

// Validate user registration data
const isValidRegistrationData = (data) => {
  if (!data) return { valid: false, error: 'No data provided' };
  
  if (!data.name || data.name.trim().length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }
  
  if (!isValidEmail(data.email)) {
    return { valid: false, error: 'Invalid email address' };
  }
  
  if (!isValidPassword(data.password)) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  
  if (!isValidPhoneNumber(data.phoneNumber)) {
    return { valid: false, error: 'Invalid phone number' };
  }
  
  return { valid: true };
};

// Validate login credentials
const isValidLoginData = (data) => {
  if (!data) return { valid: false, error: 'No credentials provided' };
  
  if (!isValidEmail(data.email)) {
    return { valid: false, error: 'Invalid email address' };
  }
  
  if (!data.password || data.password.length === 0) {
    return { valid: false, error: 'Password is required' };
  }
  
  return { valid: true };
};

// Validate payment details
const isValidPaymentDetails = (details) => {
  if (!details) return { valid: false, error: 'No payment details provided' };
  
  if (!details.amount || isNaN(details.amount) || details.amount <= 0) {
    return { valid: false, error: 'Invalid payment amount' };
  }
  
  if (!details.email || !isValidEmail(details.email)) {
    return { valid: false, error: 'Invalid customer email' };
  }
  
  if (!details.orderId) {
    return { valid: false, error: 'Order ID is required' };
  }
  
  return { valid: true };
};

// Validate appointment booking
const isValidAppointmentData = (data) => {
  if (!data) return { valid: false, error: 'No appointment data provided' };
  
  if (!data.doctorId || isNaN(data.doctorId)) {
    return { valid: false, error: 'Invalid doctor ID' };
  }
  
  if (!data.dateTime) {
    return { valid: false, error: 'Date and time are required' };
  }
  
  const appointmentDate = new Date(data.dateTime);
  const now = new Date();
  
  if (appointmentDate <= now) {
    return { valid: false, error: 'Appointment date must be in the future' };
  }
  
  return { valid: true };
};

module.exports = {
  isValidEmail,
  isValidPhoneNumber,
  normalizePhoneNumber,
  isValidPassword,
  isValidOrderData,
  sanitizeInput,
  isValidRegistrationData,
  isValidLoginData,
  isValidPaymentDetails,
  isValidAppointmentData
};
