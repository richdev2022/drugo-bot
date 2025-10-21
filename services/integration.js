const { sendWhatsAppMessage } = require('../config/whatsapp');
const { sendBookingConfirmationEmail } = require('../config/brevo');
const authService = require('./auth');
const diagnosticsService = require('./diagnostics');
const healthcareService = require('./healthcareProducts');
const prescriptionService = require('./prescription');
const supportRatingService = require('./supportRating');
const drugsngService = require('./drugsng');

// Handle registration OTP request
const handleRegistrationOTPRequest = async (phoneNumber, email, fullName = 'User') => {
  try {
    const result = await authService.requestRegistrationOTP(email, fullName);
    await sendWhatsAppMessage(phoneNumber, result.message);
    return result;
  } catch (error) {
    console.error('Error requesting registration OTP:', error);
    await sendWhatsAppMessage(phoneNumber, `❌ ${error.message}`);
    throw error;
  }
};

// Handle registration OTP verification
const handleRegistrationOTPVerification = async (phoneNumber, email, otp) => {
  try {
    const result = await authService.verifyRegistrationOTP(email, otp);
    await sendWhatsAppMessage(phoneNumber, result.message);
    return result;
  } catch (error) {
    console.error('Error verifying registration OTP:', error);
    await sendWhatsAppMessage(phoneNumber, `❌ ${error.message}`);
    throw error;
  }
};

// Handle password reset OTP request
const handlePasswordResetOTPRequest = async (phoneNumber, email) => {
  try {
    const result = await authService.requestPasswordResetOTP(email);
    await sendWhatsAppMessage(phoneNumber, result.message);
    return result;
  } catch (error) {
    console.error('Error requesting password reset OTP:', error);
    await sendWhatsAppMessage(phoneNumber, `❌ Error sending OTP. Please try again.`);
    throw error;
  }
};

// Handle diagnostic test search
const handleDiagnosticTestSearch = async (phoneNumber, query) => {
  try {
    const tests = await diagnosticsService.searchDiagnosticTests(query);
    
    if (tests.length === 0) {
      const msg = `Sorry, we couldn't find any diagnostic tests matching "${query}". Please try a different search term.`;
      await sendWhatsAppMessage(phoneNumber, msg);
      return { success: false, message: msg };
    }

    let message = `Here are some diagnostic tests matching "${query}":\n\n`;
    tests.slice(0, 5).forEach((test, index) => {
      message += `${index + 1}. ${test.name}\n`;
      message += `   Price: ₦${test.price}\n`;
      message += `   Sample Type: ${test.sampleType}\n`;
      message += `   Result Time: ${test.resultTime}\n\n`;
    });
    message += `To book a test, reply with "book [test number] [collection date]"`;

    await sendWhatsAppMessage(phoneNumber, message);
    return { success: true, tests: tests.slice(0, 5) };
  } catch (error) {
    console.error('Error searching diagnostic tests:', error);
    await sendWhatsAppMessage(phoneNumber, '❌ Error searching diagnostic tests. Please try again later.');
    throw error;
  }
};

// Handle healthcare product search
const handleHealthcareProductSearch = async (phoneNumber, query) => {
  try {
    const products = await healthcareService.searchHealthcareProducts(query);
    
    if (products.length === 0) {
      const msg = `Sorry, we couldn't find any healthcare products matching "${query}". Please try a different search term.`;
      await sendWhatsAppMessage(phoneNumber, msg);
      return { success: false, message: msg };
    }

    let message = `Here are some healthcare products matching "${query}":\n\n`;
    products.slice(0, 5).forEach((product, index) => {
      message += `${index + 1}. ${product.name}\n`;
      message += `   Price: ₦${product.price}\n`;
      message += `   Category: ${product.category}\n\n`;
    });
    message += `To add to cart, reply with "add [product number] [quantity]"`;

    await sendWhatsAppMessage(phoneNumber, message);
    return { success: true, products: products.slice(0, 5) };
  } catch (error) {
    console.error('Error searching healthcare products:', error);
    await sendWhatsAppMessage(phoneNumber, '❌ Error searching healthcare products. Please try again later.');
    throw error;
  }
};

// Handle post-payment booking notification
const handlePostPaymentNotification = async (userId, doctorId, appointmentId, doctorPhoneNumber) => {
  try {
    const { Appointment, User, Doctor } = require('../models');
    
    const appointment = await Appointment.findByPk(appointmentId, {
      include: [
        { model: User, attributes: ['phoneNumber', 'name', 'email'] },
        { model: Doctor, attributes: ['name', 'phoneNumber'] }
      ]
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    // Send confirmation email to customer
    if (appointment.User && appointment.User.email) {
      await sendBookingConfirmationEmail(appointment.User.email, {
        doctorName: appointment.Doctor.name,
        specialty: appointment.Doctor.specialty,
        dateTime: new Date(appointment.dateTime).toLocaleString(),
        bookingId: appointmentId
      }, appointment.User.name);
    }

    // Send WhatsApp notification to customer
    const customerMsg = `✅ Your appointment has been confirmed!\n\nDoctor: ${appointment.Doctor.name}\nDate & Time: ${new Date(appointment.dateTime).toLocaleString()}\nBooking ID: ${appointmentId}`;
    await sendWhatsAppMessage(appointment.User.phoneNumber, customerMsg);

    // Send notification to doctor if they have WhatsApp
    if (doctorPhoneNumber) {
      const doctorMsg = `📅 New Appointment Booking!\n\nPatient: ${appointment.User.name}\nDate & Time: ${new Date(appointment.dateTime).toLocaleString()}\nPhone: ${appointment.User.phoneNumber}`;
      await sendWhatsAppMessage(doctorPhoneNumber, doctorMsg);
    }

    return { success: true, message: 'Notifications sent' };
  } catch (error) {
    console.error('Error sending post-payment notification:', error);
    throw error;
  }
};

// Handle support chat end with rating
const handleSupportChatEnd = async (customerPhoneNumber, supportTeamId) => {
  try {
    const result = await supportRatingService.endSupportChat(customerPhoneNumber, supportTeamId);
    return result;
  } catch (error) {
    console.error('Error ending support chat:', error);
    throw error;
  }
};

// Handle support rating submission
const handleSupportRating = async (phoneNumber, supportChatId, supportTeamId, rating, feedback) => {
  try {
    const result = await supportRatingService.rateSupportChat(supportChatId, phoneNumber, supportTeamId, rating, feedback);
    return result;
  } catch (error) {
    console.error('Error submitting support rating:', error);
    await sendWhatsAppMessage(phoneNumber, `❌ ${error.message}`);
    throw error;
  }
};

module.exports = {
  handleRegistrationOTPRequest,
  handleRegistrationOTPVerification,
  handlePasswordResetOTPRequest,
  handleDiagnosticTestSearch,
  handleHealthcareProductSearch,
  handlePostPaymentNotification,
  handleSupportChatEnd,
  handleSupportRating
};
