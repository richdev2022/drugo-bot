/**
 * Enhanced Appointment Management Service
 * Handles appointment booking with:
 * - Paginated doctor search
 * - Timezone-aware validation
 * - Session preservation
 * - Better error handling
 */

const axios = require('axios');
const { Appointment, Doctor, User } = require('../models');
const { Op } = require('sequelize');

// API configuration
const drugsngAPI = axios.create({
  baseURL: process.env.DRUGSNG_API_BASE_URL || 'https://api.drugsng.com',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Common timezone configurations
const TIMEZONES = {
  'Africa/Lagos': { offset: 1, name: 'West Africa Time (WAT)' },
  'Africa/Nairobi': { offset: 3, name: 'East Africa Time (EAT)' },
  'UTC': { offset: 0, name: 'Coordinated Universal Time (UTC)' },
  'Europe/London': { offset: 0, name: 'Greenwich Mean Time (GMT)' },
  'Europe/Paris': { offset: 1, name: 'Central European Time (CET)' }
};

/**
 * Parse appointment date/time string
 * Supports formats: YYYY-MM-DD HH:MM, DD/MM/YYYY HH:MM, etc.
 * @param {string} dateTimeString - Date/time string
 * @returns {Date|null} Parsed date or null if invalid
 */
const parseAppointmentDateTime = (dateTimeString) => {
  if (!dateTimeString || typeof dateTimeString !== 'string') return null;

  const s = dateTimeString.trim();

  // Try YYYY-MM-DD HH:MM format
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day, hour, minute] = isoMatch;
    return new Date(year, parseInt(month) - 1, day, hour, minute);
  }

  // Try DD/MM/YYYY HH:MM format
  const slashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (slashMatch) {
    const [, day, month, year, hour, minute] = slashMatch;
    return new Date(year, parseInt(month) - 1, day, hour, minute);
  }

  // Try natural language: "tomorrow 2pm", "next monday 3:30pm", etc.
  const naturalMatch = s.match(/^(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (naturalMatch) {
    const now = new Date();
    const [, daySpec, hour, minute, meridiem] = naturalMatch;
    let targetDate = new Date(now);

    if (daySpec.toLowerCase() === 'today') {
      // Use today's date
    } else if (daySpec.toLowerCase() === 'tomorrow') {
      targetDate.setDate(targetDate.getDate() + 1);
    } else {
      // Parse "next monday" style
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayMatch = daySpec.match(/next\s+(\w+)/i);
      if (dayMatch) {
        const targetDay = dayNames.indexOf(dayMatch[1].toLowerCase());
        if (targetDay !== -1) {
          const currentDay = targetDate.getDay();
          const daysAhead = targetDay - currentDay;
          const addDays = daysAhead <= 0 ? daysAhead + 7 : daysAhead;
          targetDate.setDate(targetDate.getDate() + addDays);
        }
      }
    }

    let h = parseInt(hour, 10);
    const m = minute ? parseInt(minute, 10) : 0;

    if (meridiem) {
      if (meridiem.toLowerCase() === 'pm' && h !== 12) h += 12;
      if (meridiem.toLowerCase() === 'am' && h === 12) h = 0;
    }

    targetDate.setHours(h, m, 0, 0);
    return targetDate;
  }

  return null;
};

/**
 * Validate appointment date and time
 * @param {Date|string} dateTime - Appointment date/time
 * @param {string} timezone - Timezone (e.g., 'Africa/Lagos')
 * @returns {Object} Validation result
 */
const validateAppointmentDateTime = (dateTime, timezone = 'Africa/Lagos') => {
  const warnings = [];

  try {
    let appointmentDate;

    // Parse if string
    if (typeof dateTime === 'string') {
      appointmentDate = parseAppointmentDateTime(dateTime);
      if (!appointmentDate) {
        return {
          valid: false,
          error: 'Invalid date/time format. Use YYYY-MM-DD HH:MM or DD/MM/YYYY HH:MM, or natural language like "tomorrow 2pm"'
        };
      }
    } else {
      appointmentDate = new Date(dateTime);
    }

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
      return {
        valid: false,
        error: 'Invalid date/time'
      };
    }

    const now = new Date();

    // Check if appointment is in the future
    if (appointmentDate <= now) {
      return {
        valid: false,
        error: 'Appointment date must be in the future'
      };
    }

    // Check if appointment is within business hours (8 AM to 6 PM)
    const hours = appointmentDate.getHours();
    if (hours < 8 || hours >= 18) {
      warnings.push('⚠️ Appointment is outside normal business hours (8 AM - 6 PM). It may be rescheduled.');
    }

    // Check if it's a weekend
    const dayOfWeek = appointmentDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      warnings.push('⚠️ Appointment is on a weekend. Availability may be limited.');
    }

    // Check if appointment is too far in the future (more than 3 months)
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 3);
    if (appointmentDate > maxDate) {
      return {
        valid: false,
        error: 'Cannot book appointments more than 3 months in advance'
      };
    }

    // Check if appointment is too soon (less than 1 hour from now)
    const minDate = new Date(now.getTime() + 60 * 60 * 1000);
    if (appointmentDate < minDate) {
      return {
        valid: false,
        error: 'Appointment must be at least 1 hour from now'
      };
    }

    return {
      valid: true,
      error: null,
      warnings,
      parsedDateTime: appointmentDate
    };
  } catch (error) {
    return {
      valid: false,
      error: `Validation error: ${error.message}`
    };
  }
};

/**
 * Search doctors with pagination and formatting for selection
 * @param {string} specialty - Doctor specialty
 * @param {string} location - Location
 * @param {number} page - Page number
 * @param {number} pageSize - Items per page
 * @returns {Object} Paginated doctors with formatting
 */
const searchDoctorsForAppointment = async (specialty, location, page = 1, pageSize = 5) => {
  try {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeSize = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));
    const offset = (safePage - 1) * safeSize;

    // Build where clause
    const where = {
      isActive: true,
      available: true,
      [Op.and]: []
    };

    if (specialty && specialty.trim()) {
      where[Op.and].push({ specialty: { [Op.iLike]: `%${specialty.trim()}%` } });
    }

    if (location && location.trim()) {
      where[Op.and].push({ location: { [Op.iLike]: `%${location.trim()}%` } });
    }

    const { rows, count } = await Doctor.findAndCountAll({
      where,
      limit: safeSize,
      offset,
      order: [['rating', 'DESC']],
      attributes: ['id', 'name', 'specialty', 'location', 'available', 'rating', 'imageUrl']
    });

    const total = count;
    const totalPages = Math.max(1, Math.ceil(total / safeSize));

    if (rows.length === 0) {
      return {
        success: false,
        message: `No doctors found for specialty: "${specialty || 'any'}", location: "${location || 'any'}"`,
        totalPages: 0,
        currentPage: safePage
      };
    }

    const doctors = rows.map((doctor, index) => ({
      displayNumber: offset + index + 1,
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      location: doctor.location,
      available: doctor.available,
      rating: doctor.rating,
      imageUrl: doctor.imageUrl
    }));

    // Format message for WhatsApp
    const message = `👨‍⚕️ Available Doctors (Page ${safePage}/${totalPages})\n\n${doctors.map(d => {
      let text = `${d.displayNumber}. Dr. ${d.name}`;
      if (d.specialty) text += `\n   Specialty: ${d.specialty}`;
      if (d.location) text += `\n   Location: ${d.location}`;
      if (d.rating) text += `\n   Rating: ${d.rating}/5 ⭐`;
      return text;
    }).join('\n\n')}\n\n📍 *Navigation:*\n${safePage > 1 ? '• Type "Previous" to go to previous page\n' : ''}${safePage < totalPages ? '• Type "Next" to go to next page\n' : ''}• Type a number (${doctors.map(d => d.displayNumber).join('-')}) to select a doctor`;

    return {
      success: true,
      message,
      doctors,
      pagination: {
        currentPage: safePage,
        totalPages,
        total,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1
      }
    };
  } catch (error) {
    console.error('Error searching doctors for appointment:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'DOCTOR_SEARCH_FAILED'
    };
  }
};

/**
 * Book appointment with all validations
 * @param {number} userId - User ID
 * @param {number} doctorId - Doctor ID
 * @param {Date|string} dateTime - Appointment date/time
 * @param {string} timezone - Timezone
 * @param {Object} session - User session (for preservation)
 * @returns {Object} Booking result
 */
const bookAppointmentValidated = async (userId, doctorId, dateTime, timezone = 'Africa/Lagos', session = {}) => {
  try {
    // Validate inputs
    if (!userId || isNaN(userId)) {
      throw new Error('Invalid user ID');
    }

    if (!doctorId || isNaN(doctorId)) {
      throw new Error('Invalid doctor ID');
    }

    // Validate date and time
    const validation = validateAppointmentDateTime(dateTime, timezone);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        errorCode: 'INVALID_APPOINTMENT_DATETIME'
      };
    }

    // Verify user exists
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify doctor exists and is available
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }

    if (!doctor.available || !doctor.isActive) {
      return {
        success: false,
        error: 'Doctor is not currently available',
        errorCode: 'DOCTOR_UNAVAILABLE'
      };
    }

    // Check if user already has an appointment at this time with this doctor
    const existingAppointment = await Appointment.findOne({
      where: {
        userId,
        doctorId,
        dateTime: validation.parsedDateTime,
        status: { [Op.ne]: 'Cancelled' }
      }
    });

    if (existingAppointment) {
      return {
        success: false,
        error: 'You already have an appointment with this doctor at this time',
        errorCode: 'DUPLICATE_APPOINTMENT'
      };
    }

    // Create appointment
    const appointment = await Appointment.create({
      userId,
      doctorId,
      dateTime: validation.parsedDateTime,
      status: 'Scheduled',
      drugsngAppointmentId: null
    });

    // Try to sync with Drugs.ng API
    let syncedWithAPI = false;
    try {
      const response = await drugsngAPI.post('/appointments', {
        userId,
        doctorId,
        dateTime: validation.parsedDateTime,
        timezone
      }, { timeout: 5000 });

      if (response.data.appointmentId) {
        appointment.drugsngAppointmentId = response.data.appointmentId;
        await appointment.save();
        syncedWithAPI = true;
      }
    } catch (apiError) {
      console.warn('Failed to sync appointment with Drugs.ng API:', apiError.message);
    }

    // Preserve appointment in session
    if (session && typeof session === 'object') {
      session.lastAppointmentId = appointment.id;
      session.lastAppointmentDate = validation.parsedDateTime.toISOString();
      session.lastDoctorId = doctorId;
    }

    const appointmentDateFormatted = validation.parsedDateTime.toLocaleDateString('en-NG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const appointmentTimeFormatted = validation.parsedDateTime.toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      success: true,
      appointmentId: appointment.id,
      doctorName: doctor.name,
      doctorSpecialty: doctor.specialty,
      appointmentDate: appointmentDateFormatted,
      appointmentTime: appointmentTimeFormatted,
      status: appointment.status,
      syncedWithAPI,
      warnings: validation.warnings,
      message: `✅ Appointment confirmed!\n\n👨‍⚕️ Dr. ${doctor.name}\n📅 ${appointmentDateFormatted}\n🕐 ${appointmentTimeFormatted}\n\nAppointment ID: #${appointment.id}\n\nPlease arrive 10 minutes early.${validation.warnings.length > 0 ? '\n\n⚠️ ' + validation.warnings.join('\n⚠️ ') : ''}`
    };
  } catch (error) {
    console.error('Error booking appointment:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'BOOK_APPOINTMENT_FAILED'
    };
  }
};

/**
 * Get user's appointments with pagination
 * @param {number} userId - User ID
 * @param {Object} options - Pagination and filter options
 * @returns {Object} Paginated appointments
 */
const getUserAppointmentsPaginated = async (userId, options = {}) => {
  try {
    const { page = 1, pageSize = 5, status = null } = options;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeSize = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));
    const offset = (safePage - 1) * safeSize;

    const where = { userId };
    if (status) {
      where.status = status;
    }

    const { rows, count } = await Appointment.findAndCountAll({
      where,
      include: [{ model: Doctor, attributes: ['id', 'name', 'specialty', 'location'] }],
      order: [['dateTime', 'ASC']],
      limit: safeSize,
      offset
    });

    const total = count;
    const totalPages = Math.max(1, Math.ceil(total / safeSize));

    const appointments = rows.map((apt, index) => ({
      displayNumber: offset + index + 1,
      id: apt.id,
      doctorName: apt.Doctor.name,
      doctorSpecialty: apt.Doctor.specialty,
      doctorLocation: apt.Doctor.location,
      dateTime: apt.dateTime,
      status: apt.status,
      dateFormatted: apt.dateTime.toLocaleDateString('en-NG'),
      timeFormatted: apt.dateTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
    }));

    return {
      success: true,
      appointments,
      pagination: {
        currentPage: safePage,
        totalPages,
        total,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1
      },
      empty: appointments.length === 0
    };
  } catch (error) {
    console.error('Error getting user appointments:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'GET_APPOINTMENTS_FAILED'
    };
  }
};

/**
 * Cancel appointment
 * @param {number} appointmentId - Appointment ID
 * @param {number} userId - User ID (for verification)
 * @returns {Object} Cancellation result
 */
const cancelAppointment = async (appointmentId, userId) => {
  try {
    const appointment = await Appointment.findByPk(appointmentId, {
      include: [Doctor]
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.userId !== userId) {
      throw new Error('Unauthorized: You can only cancel your own appointments');
    }

    if (appointment.status === 'Cancelled') {
      return {
        success: false,
        error: 'Appointment is already cancelled'
      };
    }

    if (appointment.status === 'Completed') {
      return {
        success: false,
        error: 'Cannot cancel a completed appointment'
      };
    }

    // Check if appointment is within 24 hours
    const hoursUntilAppointment = (appointment.dateTime - new Date()) / (1000 * 60 * 60);
    const warnings = [];

    if (hoursUntilAppointment < 24) {
      warnings.push('⚠️ Cancellation within 24 hours may incur charges');
    }

    await appointment.update({ status: 'Cancelled' });

    return {
      success: true,
      appointmentId,
      doctorName: appointment.Doctor.name,
      cancelledAt: new Date(),
      warnings,
      message: '✅ Appointment cancelled successfully'
    };
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'CANCEL_APPOINTMENT_FAILED'
    };
  }
};

module.exports = {
  parseAppointmentDateTime,
  validateAppointmentDateTime,
  searchDoctorsForAppointment,
  bookAppointmentValidated,
  getUserAppointmentsPaginated,
  cancelAppointment,
  TIMEZONES
};
