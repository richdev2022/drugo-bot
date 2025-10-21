const { User, OTP } = require('../models');
const bcryptjs = require('bcryptjs');
const { sendOTPEmail, sendPasswordResetEmail } = require('../config/brevo');
const { generateOTP, getOTPExpiry, isOTPValid } = require('../utils/otp');
const { isValidEmail, isValidPhoneNumber, sanitizeInput } = require('../utils/validation');

// Request OTP for registration
const requestRegistrationOTP = async (email, fullName = 'User') => {
  try {
    if (!email || !isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      throw new Error('Email already registered. Please login instead.');
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = getOTPExpiry();

    // Save OTP to database
    await OTP.create({
      email: email.toLowerCase(),
      code: otp,
      purpose: 'registration',
      expiresAt
    });

    // Send OTP email
    await sendOTPEmail(email, otp, fullName);

    return {
      success: true,
      message: `OTP has been sent to ${email}. It's valid for 5 minutes.`,
      email: email
    };
  } catch (error) {
    console.error('Error requesting registration OTP:', error);
    throw error;
  }
};

// Verify registration OTP
const verifyRegistrationOTP = async (email, otp) => {
  try {
    if (!email || !otp) {
      throw new Error('Email and OTP are required');
    }

    // Find the OTP record
    const otpRecord = await OTP.findOne({
      where: {
        email: email.toLowerCase(),
        code: otp,
        purpose: 'registration',
        isUsed: false
      }
    });

    if (!otpRecord) {
      throw new Error('Invalid OTP');
    }

    if (!isOTPValid(otpRecord.expiresAt)) {
      throw new Error('OTP has expired');
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    otpRecord.usedAt = new Date();
    await otpRecord.save();

    return {
      success: true,
      message: 'OTP verified successfully',
      email: email
    };
  } catch (error) {
    console.error('Error verifying registration OTP:', error);
    throw error;
  }
};

// Complete user registration after OTP verification
const completeRegistration = async (userData) => {
  try {
    if (!userData || !userData.name || !userData.email || !userData.password || !userData.phoneNumber) {
      throw new Error('Missing required user data');
    }

    // Validate inputs
    if (!isValidEmail(userData.email)) {
      throw new Error('Invalid email format');
    }

    if (!isValidPhoneNumber(userData.phoneNumber)) {
      throw new Error('Invalid phone number format');
    }

    if (userData.password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Verify OTP was used for this email
    const usedOTP = await OTP.findOne({
      where: {
        email: userData.email.toLowerCase(),
        purpose: 'registration',
        isUsed: true
      },
      order: [['usedAt', 'DESC']],
      limit: 1
    });

    if (!usedOTP) {
      throw new Error('Please verify your email with OTP first');
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        email: userData.email.toLowerCase()
      }
    });

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Create user
    const user = await User.create({
      name: sanitizeInput(userData.name),
      email: sanitizeInput(userData.email).toLowerCase(),
      password: userData.password,
      phoneNumber: userData.phoneNumber
    });

    return {
      success: true,
      message: 'Registration completed successfully',
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber
      }
    };
  } catch (error) {
    console.error('Error completing registration:', error);
    throw error;
  }
};

// Login user with email and password (no OTP required)
const loginUser = async (credentials) => {
  try {
    if (!credentials || !credentials.email || !credentials.password) {
      throw new Error('Email and password are required');
    }

    // Find user by email
    const user = await User.findOne({
      where: { email: credentials.email.toLowerCase() }
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Compare password
    const isPasswordValid = await bcryptjs.compare(credentials.password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is inactive');
    }

    return {
      success: true,
      message: 'Login successful',
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber
      }
    };
  } catch (error) {
    console.error('Error logging in user:', error);
    throw error;
  }
};

// Request password reset OTP
const requestPasswordResetOTP = async (email) => {
  try {
    if (!email || !isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check if user exists
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      // Don't reveal if email exists or not for security
      return {
        success: true,
        message: 'If this email exists, an OTP has been sent'
      };
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = getOTPExpiry();

    // Save OTP to database
    await OTP.create({
      email: email.toLowerCase(),
      code: otp,
      purpose: 'password_reset',
      expiresAt
    });

    // Send OTP email
    await sendPasswordResetEmail(email, otp, user.name);

    return {
      success: true,
      message: 'OTP has been sent to your email for password reset'
    };
  } catch (error) {
    console.error('Error requesting password reset OTP:', error);
    throw error;
  }
};

// Verify password reset OTP
const verifyPasswordResetOTP = async (email, otp) => {
  try {
    if (!email || !otp) {
      throw new Error('Email and OTP are required');
    }

    // Find the OTP record
    const otpRecord = await OTP.findOne({
      where: {
        email: email.toLowerCase(),
        code: otp,
        purpose: 'password_reset',
        isUsed: false
      }
    });

    if (!otpRecord) {
      throw new Error('Invalid OTP');
    }

    if (!isOTPValid(otpRecord.expiresAt)) {
      throw new Error('OTP has expired');
    }

    return {
      success: true,
      message: 'OTP verified. You can now reset your password',
      email: email
    };
  } catch (error) {
    console.error('Error verifying password reset OTP:', error);
    throw error;
  }
};

// Complete password reset
const completePasswordReset = async (email, otp, newPassword) => {
  try {
    if (!email || !otp || !newPassword) {
      throw new Error('Email, OTP, and new password are required');
    }

    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Verify OTP
    const otpRecord = await OTP.findOne({
      where: {
        email: email.toLowerCase(),
        code: otp,
        purpose: 'password_reset',
        isUsed: false
      }
    });

    if (!otpRecord) {
      throw new Error('Invalid OTP');
    }

    if (!isOTPValid(otpRecord.expiresAt)) {
      throw new Error('OTP has expired');
    }

    // Find user and update password
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      throw new Error('User not found');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Mark OTP as used
    otpRecord.isUsed = true;
    otpRecord.usedAt = new Date();
    await otpRecord.save();

    return {
      success: true,
      message: 'Password has been reset successfully'
    };
  } catch (error) {
    console.error('Error completing password reset:', error);
    throw error;
  }
};

module.exports = {
  requestRegistrationOTP,
  verifyRegistrationOTP,
  completeRegistration,
  loginUser,
  requestPasswordResetOTP,
  verifyPasswordResetOTP,
  completePasswordReset
};
