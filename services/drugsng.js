const axios = require('axios');
const CryptoJS = require('crypto-js');
const { User, Product, Doctor, Order, OrderItem, Appointment } = require('../models');
const { encryptData } = require('./security');
const { isValidEmail, isValidPhoneNumber, sanitizeInput } = require('../utils/validation');
const { uploadImageFromUrl } = require('./cloudinary');

// Drugs.ng API client with timeout
const drugsngAPI = axios.create({
  baseURL: process.env.DRUGSNG_API_BASE_URL || 'https://api.drugsng.com',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000 // 10 second timeout
});

const generatePlaceholderUrl = (name) => {
  const text = encodeURIComponent((name || 'Medicine').substring(0, 20));
  return `https://via.placeholder.com/512x512.png?text=${text}`;
};

const ensureDbProductHasImage = async (product) => {
  if (product.imageUrl) return product.imageUrl;
  try {
    const uploaded = await uploadImageFromUrl(generatePlaceholderUrl(product.name), {
      folder: 'drugs-ng/products/medicines',
      filename: `product-${product.id}-${Date.now()}`
    });
    product.imageUrl = uploaded.url;
    await product.save();
    return product.imageUrl;
  } catch (e) {
    console.warn('Placeholder upload failed:', e.message);
    return null;
  }
};

// Register new user in both PostgreSQL and Drugs.ng API
const registerUser = async (userData) => {
  try {
    // Validate inputs
    if (!userData || !userData.name || !userData.email || !userData.password || !userData.phoneNumber) {
      throw new Error('Missing required user data');
    }

    if (!isValidEmail(userData.email)) {
      throw new Error('Invalid email format');
    }

    if (!isValidPhoneNumber(userData.phoneNumber)) {
      throw new Error('Invalid phone number format');
    }

    if (userData.password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // First, save user to PostgreSQL
    const user = await User.create({
      name: sanitizeInput(userData.name),
      email: sanitizeInput(userData.email).toLowerCase(),
      password: userData.password,
      phoneNumber: userData.phoneNumber
    });
    
    // Then, try to register with Drugs.ng API
    try {
      const encryptedData = encryptData(userData);
      const response = await drugsngAPI.post('/auth/register', encryptedData);
      
      // Update user with Drugs.ng details
      await user.update({
        drugsngUserId: response.data.userId,
        drugsngToken: response.data.token
      });
      
      return {
        success: true,
        userId: user.id,
        drugsngUserId: response.data.userId,
        token: response.data.token,
        message: 'Registration successful'
      };
    } catch (apiError) {
      console.error('Drugs.ng API registration failed:', apiError);
      // Return PostgreSQL user even if API fails
      return {
        success: true,
        userId: user.id,
        drugsngUserId: null,
        token: null,
        message: 'Registration successful locally. API sync will be attempted later.'
      };
    }
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
  }
};

// Login user
const loginUser = async (credentials) => {
  try {
    // Validate inputs
    if (!credentials || !credentials.email || !credentials.password) {
      throw new Error('Email and password are required');
    }

    if (!isValidEmail(credentials.email)) {
      throw new Error('Invalid email format');
    }

    // First, check PostgreSQL
    const user = await User.findOne({
      where: {
        email: sanitizeInput(credentials.email).toLowerCase()
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check password
    const isPasswordValid = await require('bcryptjs').compare(credentials.password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }
    
    // If user has Drugs.ng token, try to validate with API
    if (user.drugsngToken) {
      try {
        const encryptedCredentials = encryptData(credentials);
        const response = await drugsngAPI.post('/auth/login', encryptedCredentials);
        
        // Update token if needed
        if (response.data.token !== user.drugsngToken) {
          await user.update({ drugsngToken: response.data.token });
        }
        
        return {
          success: true,
          userId: user.id,
          drugsngUserId: user.drugsngUserId,
          token: response.data.token,
          message: 'Login successful'
        };
      } catch (apiError) {
        console.error('Drugs.ng API login failed:', apiError);
        // Return PostgreSQL user even if API fails
        return {
          success: true,
          userId: user.id,
          drugsngUserId: user.drugsngUserId,
          token: null,
          message: 'Login successful locally. Some features may be limited.'
        };
      }
    } else {
      // User doesn't have Drugs.ng account
      return {
        success: true,
        userId: user.id,
        drugsngUserId: null,
        token: null,
        message: 'Login successful locally. Some features may be limited.'
      };
    }
  } catch (error) {
    console.error('Error logging in user:', error);
    throw error;
  }
};

// List all products with pagination
const listAllProductsPaginated = async (page = 1, pageSize = 5) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeSize = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));

  // Try Drugs.ng API first
  try {
    const response = await drugsngAPI.get('/products', {
      params: { page: safePage, limit: safeSize }
    });
    const items = Array.isArray(response.data?.products) ? response.data.products : (Array.isArray(response.data) ? response.data : []);
    const total = response.data?.total || items.length;
    const totalPages = response.data?.totalPages || Math.max(1, Math.ceil(total / safeSize));
    return { items, total, totalPages, page: safePage, pageSize: safeSize, source: 'api' };
  } catch (apiError) {
    console.warn('Drugs.ng API list failed, using local DB:', apiError.message);
  }

  // Fallback to PostgreSQL
  const { Op } = require('sequelize');
  const offset = (safePage - 1) * safeSize;
  const { rows, count } = await Product.findAndCountAll({
    where: { isActive: true },
    order: [['id', 'ASC']],
    offset,
    limit: safeSize
  });

  // Ensure images for DB items
  for (const p of rows) {
    if (!p.imageUrl) {
      await ensureDbProductHasImage(p);
    }
  }

  const items = rows.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    price: p.price,
    stock: p.stock,
    imageUrl: p.imageUrl
  }));
  const total = count;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  return { items, total, totalPages, page: safePage, pageSize: safeSize, source: 'db' };
};

// Search products (and doctors if applicable)
const searchProducts = async (query) => {
  // Validate input first
  if (!query || typeof query !== 'string') {
    throw new Error('Search query is required');
  }

  const sanitizedQuery = sanitizeInput(query);
  if (sanitizedQuery.length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }

  // Try Drugs.ng API first
  try {
    const response = await drugsngAPI.get(`/products?search=${encodeURIComponent(sanitizedQuery)}`);
    return response.data;
  } catch (apiError) {
    console.warn('Drugs.ng API search failed, using fallback');
  }

  // Fallback to PostgreSQL - search products
  try {
    const { Op } = require('sequelize');
    const products = await Product.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: `%${sanitizedQuery}%` } },
          { category: { [Op.iLike]: `%${sanitizedQuery}%` } },
          { description: { [Op.iLike]: `%${sanitizedQuery}%` } }
        ],
        isActive: true
      },
      limit: 10
    });

    // Check if query matches doctor keywords - if so, also search doctors
    const doctorKeywords = ['doctor', 'specialist', 'cardiologist', 'pediatrician', 'dermatologist', 'neurologist', 'physician'];
    const queryLower = sanitizedQuery.toLowerCase();
    const isDoctorSearch = doctorKeywords.some(kw => queryLower.includes(kw));

    if (isDoctorSearch && products.length === 0) {
      const doctors = await Doctor.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: `%${sanitizedQuery}%` } },
            { specialty: { [Op.iLike]: `%${sanitizedQuery}%` } },
            { department: { [Op.iLike]: `%${sanitizedQuery}%` } }
          ],
          isActive: true,
          available: true
        },
        limit: 10
      });

      if (doctors.length > 0) {
        return doctors.map(doctor => ({
          id: doctor.id,
          type: 'doctor',
          name: `Dr. ${doctor.name}`,
          specialty: doctor.specialty,
          department: doctor.department,
          location: doctor.location,
          rating: doctor.rating,
          imageUrl: doctor.imageUrl
        }));
      }
    }

    // Ensure images for DB items
    for (const p of products) {
      if (!p.imageUrl) {
        await ensureDbProductHasImage(p);
      }
    }

    return products.map(product => ({
      id: product.id,
      type: 'product',
      name: product.name,
      category: product.category,
      description: product.description,
      price: product.price,
      stock: product.stock,
      imageUrl: product.imageUrl
    }));
  } catch (dbError) {
    console.error('Fallback search error:', dbError);
    throw new Error('Unable to search products. Please try again later.');
  }
};

// Add to cart
const addToCart = async (userId, productId, quantity) => {
  try {
    // Try Drugs.ng API first
    const response = await drugsngAPI.post('/cart', { userId, productId, quantity });
    return response.data;
  } catch (error) {
    console.error('Error adding to cart from API:', error);
    // Fallback to PostgreSQL - create a pending order
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const product = await Product.findByPk(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    
    // Check if there's a pending order for this user
    let order = await Order.findOne({
      where: {
        userId: userId,
        status: 'Processing'
      }
    });
    
    if (!order) {
      // Create new order
      order = await Order.create({
        userId: userId,
        status: 'Processing',
        totalAmount: 0,
        paymentMethod: 'Cash on Delivery',
        paymentStatus: 'Pending',
        shippingAddress: 'To be provided',
        drugsngOrderId: null
      });
    }
    
    // Check if product already in order
    let orderItem = await OrderItem.findOne({
      where: {
        orderId: order.id,
        productId: productId
      }
    });
    
    if (orderItem) {
      // Update quantity
      orderItem.quantity += quantity;
      orderItem.price = product.price;
      await orderItem.save();
    } else {
      // Add new order item
      orderItem = await OrderItem.create({
        orderId: order.id,
        productId: productId,
        quantity: quantity,
        price: product.price
      });
    }
    
    // Update order total
    const orderItems = await OrderItem.findAll({ where: { orderId: order.id } });
    const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    await order.update({ totalAmount });
    
    return {
      success: true,
      message: 'Added to cart (offline mode)',
      orderId: order.id
    };
  }
};

// Place order
const placeOrder = async (userId, orderData) => {
  try {
    // Try Drugs.ng API first
    const response = await drugsngAPI.post('/orders', { userId, ...orderData });
    return response.data;
  } catch (error) {
    console.error('Error placing order from API:', error);
    // Fallback to PostgreSQL
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Get pending order
    let order = await Order.findOne({
      where: {
        userId: userId,
        status: 'Processing'
      },
      include: [OrderItem]
    });
    
    if (!order || order.OrderItems.length === 0) {
      throw new Error('No items in cart');
    }
    
    // Update order with shipping details
    await order.update({
      shippingAddress: orderData.address,
      paymentMethod: orderData.paymentMethod,
      drugsngOrderId: null
    });
    
    return {
      success: true,
      orderId: order.id,
      status: order.status,
      message: 'Order placed (offline mode)'
    };
  }
};

// Track order
const trackOrder = async (orderId) => {
  try {
    // Try Drugs.ng API first
    const response = await drugsngAPI.get(`/orders/${orderId}`);
    return response.data;
  } catch (error) {
    console.error('Error tracking order from API:', error);
    // Fallback to PostgreSQL
    const order = await Order.findByPk(orderId, {
      include: [
        {
          model: OrderItem,
          include: [Product]
        }
      ]
    });
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    return {
      id: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      paymentStatus: order.paymentStatus,
      shippingAddress: order.shippingAddress,
      orderDate: order.orderDate,
      items: order.OrderItems.map(item => ({
        name: item.Product.name,
        quantity: item.quantity,
        price: item.price
      }))
    };
  }
};

// Search doctors
const searchDoctors = async (specialty, location) => {
  try {
    // Try Drugs.ng API first
    const response = await drugsngAPI.get(`/doctors?specialty=${specialty}&location=${location}`);
    return response.data;
  } catch (error) {
    console.error('Error searching doctors from API:', error);
    // Fallback to PostgreSQL
    const doctors = await Doctor.findAll({
      where: {
        [require('sequelize').Op.and]: [
          { specialty: { [require('sequelize').Op.iLike]: `%${specialty}%` } },
          { location: { [require('sequelize').Op.iLike]: `%${location}%` } },
          { available: true },
          { isActive: true }
        ]
      },
      limit: 10
    });
    
    return doctors.map(doctor => ({
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      location: doctor.location,
      available: doctor.available,
      rating: doctor.rating,
      imageUrl: doctor.imageUrl
    }));
  }
};

// Book appointment
const bookAppointment = async (userId, doctorId, dateTime) => {
  try {
    // Try Drugs.ng API first
    const response = await drugsngAPI.post('/appointments', { userId, doctorId, dateTime });
    return response.data;
  } catch (error) {
    console.error('Error booking appointment from API:', error);
    // Fallback to PostgreSQL
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }
    
    const appointment = await Appointment.create({
      userId: userId,
      doctorId: doctorId,
      dateTime: dateTime,
      status: 'Scheduled',
      drugsngAppointmentId: null
    });
    
    return {
      success: true,
      appointmentId: appointment.id,
      status: appointment.status,
      message: 'Appointment booked (offline mode)'
    };
  }
};

// Paginated doctors search (API first, DB fallback)
const searchDoctorsPaginated = async (specialty, location, page = 1, pageSize = 5) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeSize = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));

  try {
    const response = await drugsngAPI.get('/doctors', { params: { specialty, location, page: safePage, limit: safeSize } });
    const items = Array.isArray(response.data?.doctors) ? response.data.doctors : (Array.isArray(response.data) ? response.data : []);
    const total = response.data?.total || items.length;
    const totalPages = response.data?.totalPages || Math.max(1, Math.ceil(total / safeSize));
    return { items, total, totalPages, page: safePage, pageSize: safeSize, source: 'api' };
  } catch (apiError) {
    console.warn('Drugs.ng API doctors list failed, using local DB:', apiError.message);
  }

  // Fallback to PostgreSQL
  const { Op } = require('sequelize');
  const offset = (safePage - 1) * safeSize;
  const where = {
    isActive: true,
    available: true,
    [Op.and]: []
  };

  // Search by name, specialty, or location
  if (specialty) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${specialty}%` } },
      { specialty: { [Op.iLike]: `%${specialty}%` } },
      { department: { [Op.iLike]: `%${specialty}%` } }
    ];
  }
  if (location) where[Op.and].push({ location: { [Op.iLike]: `%${location}%` } });

  const { rows, count } = await Doctor.findAndCountAll({ where, limit: safeSize, offset, order: [['rating','DESC']] });

  const items = rows.map((doctor, index) => ({
    displayNumber: (safePage - 1) * safeSize + index + 1,
    id: doctor.id,
    name: doctor.name,
    specialty: doctor.specialty,
    location: doctor.location,
    available: doctor.available,
    rating: doctor.rating,
    imageUrl: doctor.imageUrl
  }));
  const total = count;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  return {
    items,
    total,
    totalPages,
    page: safePage,
    pageSize: safeSize,
    source: 'db',
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1
  };
};

/**
 * Search doctors with formatted output for WhatsApp pagination
 * Includes numbered options for easy selection
 * @param {string} specialty - Doctor specialty to search for
 * @param {string} location - Location to search in
 * @param {number} page - Page number
 * @param {number} pageSize - Items per page
 * @returns {Object} Formatted doctor list with pagination metadata
 */
const searchDoctorsFormatted = async (specialty, location, page = 1, pageSize = 5) => {
  try {
    const result = await searchDoctorsPaginated(specialty, location, page, pageSize);

    if (!result.items || result.items.length === 0) {
      return {
        success: false,
        message: `No doctors found for specialty: ${specialty || 'any'}, location: ${location || 'any'}`
      };
    }

    const message = `👨‍⚕️ Doctors (Page ${result.page}/${result.totalPages})\n\n${result.items.map(d => {
      let text = `${d.displayNumber}. Dr. ${d.name}`;
      if (d.specialty) text += `\n   Specialty: ${d.specialty}`;
      if (d.location) text += `\n   Location: ${d.location}`;
      if (d.rating) text += `\n   Rating: ${d.rating}/5 ⭐`;
      return text;
    }).join('\n\n')}`;

    return {
      success: true,
      message,
      doctors: result.items,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        total: result.total,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    };
  } catch (error) {
    console.error('Error searching doctors for formatted output:', error);
    return {
      success: false,
      message: `Error searching doctors: ${error.message}`
    };
  }
};

/**
 * Validate appointment date and time with timezone awareness
 * Ensures appointment is in the future and within business hours
 * @param {Date|string} dateTime - Appointment date/time
 * @param {string} timezone - Timezone (e.g., 'Africa/Lagos')
 * @returns {Object} { valid: boolean, error: string|null, warnings: string[] }
 */
const validateAppointmentDateTime = (dateTime, timezone = 'Africa/Lagos') => {
  const warnings = [];

  try {
    const appointmentDate = new Date(dateTime);
    const now = new Date();

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
      return {
        valid: false,
        error: 'Invalid date/time format. Please use YYYY-MM-DD HH:MM format (e.g., 2024-12-25 14:30)'
      };
    }

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
      warnings.push('⚠️ Appointment is on a weekend. Please note that weekend appointments may have limited availability.');
    }

    // Check if appointment is too far in the future (e.g., more than 3 months)
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 3);
    if (appointmentDate > maxDate) {
      return {
        valid: false,
        error: 'Cannot book appointments more than 3 months in advance'
      };
    }

    return {
      valid: true,
      error: null,
      warnings
    };
  } catch (error) {
    return {
      valid: false,
      error: `Validation error: ${error.message}`
    };
  }
};

/**
 * Book appointment with enhanced validation and session preservation
 * @param {number} userId - User ID
 * @param {number} doctorId - Doctor ID
 * @param {Date|string} dateTime - Appointment date/time
 * @param {string} timezone - Timezone
 * @returns {Object} Booking result with validation details
 */
const bookAppointmentValidated = async (userId, doctorId, dateTime, timezone = 'Africa/Lagos') => {
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
        warnings: validation.warnings
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

    if (!doctor.available) {
      throw new Error('Doctor is not currently available');
    }

    // Create appointment
    const appointment = await Appointment.create({
      userId,
      doctorId,
      dateTime: new Date(dateTime),
      status: 'Scheduled',
      drugsngAppointmentId: null
    });

    // Try to sync with Drugs.ng API
    let syncedWithAPI = false;
    try {
      const response = await drugsngAPI.post('/appointments', {
        userId,
        doctorId,
        dateTime,
        timezone
      });
      if (response.data.appointmentId) {
        appointment.drugsngAppointmentId = response.data.appointmentId;
        await appointment.save();
        syncedWithAPI = true;
      }
    } catch (apiError) {
      console.warn('Failed to sync appointment with Drugs.ng API:', apiError.message);
    }

    return {
      success: true,
      appointmentId: appointment.id,
      doctorName: doctor.name,
      appointmentDate: appointment.dateTime,
      status: appointment.status,
      syncedWithAPI,
      warnings: validation.warnings,
      message: `✅ Appointment confirmed with Dr. ${doctor.name} on ${appointment.dateTime.toLocaleDateString('en-NG')} at ${appointment.dateTime.toLocaleTimeString('en-NG')}`
    };
  } catch (error) {
    console.error('Error booking appointment with validation:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  registerUser,
  loginUser,
  listAllProductsPaginated,
  searchProducts,
  addToCart,
  placeOrder,
  trackOrder,
  searchDoctors,
  searchDoctorsPaginated,
  searchDoctorsFormatted,
  bookAppointment,
  bookAppointmentValidated,
  validateAppointmentDateTime
};
