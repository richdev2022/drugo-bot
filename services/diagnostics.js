const axios = require('axios');
const { DiagnosticTest, DiagnosticBooking, User } = require('../models');
const { sendWhatsAppMessage } = require('../config/whatsapp');

// Drugs.ng API client with timeout
const drugsngAPI = axios.create({
  baseURL: process.env.DRUGSNG_API_BASE_URL || 'https://api.drugsng.com',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Search diagnostic tests
const searchDiagnosticTests = async (query) => {
  try {
    if (!query || typeof query !== 'string') {
      throw new Error('Search query is required');
    }

    // Try to fetch from Drugs.ng API first
    try {
      const response = await drugsngAPI.get('/diagnostics/search', {
        params: { query }
      });
      if (response.data && response.data.tests && response.data.tests.length > 0) {
        return response.data.tests;
      }
    } catch (apiError) {
      console.warn('Could not fetch from Drugs.ng API, using local database:', apiError.message);
    }

    // Fallback to local database
    const tests = await DiagnosticTest.findAll({
      where: {
        isActive: true,
        [require('sequelize').Op.or]: [
          { name: { [require('sequelize').Op.iLike]: `%${query}%` } },
          { category: { [require('sequelize').Op.iLike]: `%${query}%` } },
          { description: { [require('sequelize').Op.iLike]: `%${query}%` } }
        ]
      }
    });

    return tests;
  } catch (error) {
    console.error('Error searching diagnostic tests:', error);
    throw error;
  }
};

// Get all diagnostic test categories
const getDiagnosticCategories = async () => {
  try {
    // Try to fetch from Drugs.ng API first
    try {
      const response = await drugsngAPI.get('/diagnostics/categories');
      if (response.data && response.data.categories) {
        return response.data.categories;
      }
    } catch (apiError) {
      console.warn('Could not fetch from Drugs.ng API, using local database:', apiError.message);
    }

    // Fallback to local database
    const tests = await DiagnosticTest.findAll({
      where: { isActive: true },
      attributes: ['category'],
      raw: true,
      group: ['category']
    });

    return tests.map(t => t.category);
  } catch (error) {
    console.error('Error fetching diagnostic categories:', error);
    throw error;
  }
};

// Book a diagnostic test
const bookDiagnosticTest = async (userId, testId, bookingDetails) => {
  try {
    if (!userId || !testId || !bookingDetails) {
      throw new Error('User ID, test ID, and booking details are required');
    }

    // Verify user exists
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get diagnostic test details
    const test = await DiagnosticTest.findByPk(testId);
    if (!test) {
      throw new Error('Diagnostic test not found');
    }

    // Create booking
    const booking = await DiagnosticBooking.create({
      userId,
      diagnosticTestId: testId,
      sampleCollectionDate: bookingDetails.collectionDate,
      sampleCollectionLocation: bookingDetails.collectionLocation,
      totalAmount: test.price,
      status: 'Pending',
      paymentStatus: 'Pending',
      notes: bookingDetails.notes
    });

    return {
      success: true,
      message: 'Diagnostic test booked successfully',
      bookingId: booking.id,
      testName: test.name,
      amount: test.price,
      collectionDate: booking.sampleCollectionDate,
      collectionLocation: booking.sampleCollectionLocation
    };
  } catch (error) {
    console.error('Error booking diagnostic test:', error);
    throw error;
  }
};

// Get user's diagnostic bookings
const getUserDiagnosticBookings = async (userId) => {
  try {
    const bookings = await DiagnosticBooking.findAll({
      where: { userId },
      include: [
        {
          model: DiagnosticTest,
          attributes: ['id', 'name', 'category', 'sampleType', 'resultTime']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return bookings;
  } catch (error) {
    console.error('Error fetching user diagnostic bookings:', error);
    throw error;
  }
};

// Get diagnostic booking details
const getDiagnosticBookingDetails = async (bookingId) => {
  try {
    const booking = await DiagnosticBooking.findByPk(bookingId, {
      include: [
        {
          model: DiagnosticTest,
          attributes: ['id', 'name', 'category', 'sampleType', 'collectionTime', 'resultTime', 'labPartner', 'description']
        },
        {
          model: User,
          attributes: ['id', 'name', 'email', 'phoneNumber']
        }
      ]
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    return booking;
  } catch (error) {
    console.error('Error fetching diagnostic booking details:', error);
    throw error;
  }
};

// Update booking status
const updateDiagnosticBookingStatus = async (bookingId, status, paymentStatus = null) => {
  try {
    const booking = await DiagnosticBooking.findByPk(bookingId);
    if (!booking) {
      throw new Error('Booking not found');
    }

    booking.status = status;
    if (paymentStatus) {
      booking.paymentStatus = paymentStatus;
    }
    await booking.save();

    return {
      success: true,
      message: 'Booking status updated',
      booking
    };
  } catch (error) {
    console.error('Error updating diagnostic booking status:', error);
    throw error;
  }
};

module.exports = {
  searchDiagnosticTests,
  getDiagnosticCategories,
  bookDiagnosticTest,
  getUserDiagnosticBookings,
  getDiagnosticBookingDetails,
  updateDiagnosticBookingStatus
};
