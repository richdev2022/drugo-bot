const { SupportRating, SupportTeam, SupportChat, Session } = require('../models');
const { sendWhatsAppMessage } = require('../config/whatsapp');

// Rate support chat
const rateSupportChat = async (supportChatId, customerPhoneNumber, supportTeamId, rating, feedback = null) => {
  try {
    if (!supportChatId || !customerPhoneNumber || !supportTeamId || !rating) {
      throw new Error('Support chat ID, customer phone number, support team ID, and rating are required');
    }

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error('Rating must be an integer between 1 and 5');
    }

    // Check if already rated
    const existingRating = await SupportRating.findOne({
      where: { supportChatId }
    });

    if (existingRating) {
      throw new Error('This support chat has already been rated');
    }

    // Create rating
    const supportRating = await SupportRating.create({
      supportChatId,
      customerPhoneNumber,
      supportTeamId,
      rating,
      feedback,
      ratedAt: new Date()
    });

    // Send confirmation to customer
    const ratingMessage = `Thank you for rating our support! Your feedback helps us improve. Rating: ${rating}/5${feedback ? `\n\nYour feedback: ${feedback}` : ''}`;
    await sendWhatsAppMessage(customerPhoneNumber, ratingMessage);

    // Notify support team about the rating
    const supportTeam = await SupportTeam.findByPk(supportTeamId);
    if (supportTeam) {
      const notificationMessage = `📊 New Support Rating\n\nCustomer: ${customerPhoneNumber}\nRating: ${rating}/5${feedback ? `\nFeedback: ${feedback}` : ''}`;
      await sendWhatsAppMessage(supportTeam.phoneNumber, notificationMessage);
    }

    return {
      success: true,
      message: 'Thank you for your feedback!',
      rating: supportRating
    };
  } catch (error) {
    console.error('Error rating support chat:', error);
    throw error;
  }
};

// End support chat with rating option
const endSupportChat = async (customerPhoneNumber, supportTeamId = null) => {
  try {
    if (!customerPhoneNumber) {
      throw new Error('Customer phone number is required');
    }

    // Get customer session
    const session = await Session.findOne({
      where: { phoneNumber: customerPhoneNumber }
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Update session state
    session.state = 'LOGGED_IN';
    session.supportTeamId = null;
    await session.save();

    // Send rating prompt to customer
    const ratingPrompt = `Thank you for chatting with our support team! Would you like to rate your experience?\n\nRate from 1-5:\n1️⃣ - Poor\n2️⃣ - Fair\n3️⃣ - Good\n4️⃣ - Very Good\n5️⃣ - Excellent\n\nReply with your rating (1-5) or type 'skip' to skip`;

    await sendWhatsAppMessage(customerPhoneNumber, ratingPrompt);

    return {
      success: true,
      message: 'Support chat ended. Customer will be prompted to rate.'
    };
  } catch (error) {
    console.error('Error ending support chat:', error);
    throw error;
  }
};

// Get support team ratings
const getSupportTeamRatings = async (supportTeamId, limit = 20) => {
  try {
    const ratings = await SupportRating.findAll({
      where: { supportTeamId },
      include: [
        {
          model: SupportTeam,
          attributes: ['id', 'name', 'role']
        }
      ],
      order: [['ratedAt', 'DESC']],
      limit
    });

    if (ratings.length === 0) {
      return {
        teamId: supportTeamId,
        ratings: [],
        averageRating: 0,
        totalRatings: 0
      };
    }

    const averageRating = (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(2);

    return {
      teamId: supportTeamId,
      ratings,
      averageRating: parseFloat(averageRating),
      totalRatings: ratings.length
    };
  } catch (error) {
    console.error('Error fetching support team ratings:', error);
    throw error;
  }
};

// Get all support team statistics
const getSupportStatistics = async () => {
  try {
    const allRatings = await SupportRating.findAll({
      include: [
        {
          model: SupportTeam,
          attributes: ['id', 'name', 'role']
        }
      ]
    });

    if (allRatings.length === 0) {
      return {
        totalRatings: 0,
        averageRating: 0,
        ratingDistribution: {}
      };
    }

    const averageRating = (allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length).toFixed(2);

    // Distribution of ratings
    const ratingDistribution = {
      1: allRatings.filter(r => r.rating === 1).length,
      2: allRatings.filter(r => r.rating === 2).length,
      3: allRatings.filter(r => r.rating === 3).length,
      4: allRatings.filter(r => r.rating === 4).length,
      5: allRatings.filter(r => r.rating === 5).length
    };

    return {
      totalRatings: allRatings.length,
      averageRating: parseFloat(averageRating),
      ratingDistribution
    };
  } catch (error) {
    console.error('Error fetching support statistics:', error);
    throw error;
  }
};

module.exports = {
  rateSupportChat,
  endSupportChat,
  getSupportTeamRatings,
  getSupportStatistics
};
