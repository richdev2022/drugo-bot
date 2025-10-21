/**
 * Enhanced Order Management Service
 * Handles order operations with:
 * - Standardized pagination
 * - Session preservation
 * - Retry logic for external API calls
 * - Improved error messages
 */

const axios = require('axios');
const { Order, OrderItem, Product, User, Cart } = require('../models');
const { sendWhatsAppMessage } = require('../config/whatsapp');

// API configuration
const drugsngAPI = axios.create({
  baseURL: process.env.DRUGSNG_API_BASE_URL || 'https://api.drugsng.com',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  jitterFactor: 0.1
};

/**
 * Exponential backoff retry with jitter
 * @param {Function} fn - Async function to retry
 * @param {Object} config - Retry configuration
 * @returns {*} Function result
 */
const retryWithBackoff = async (fn, config = RETRY_CONFIG) => {
  let lastError = null;
  let delay = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < config.maxRetries) {
        // Add jitter to prevent thundering herd
        const jitter = delay * config.jitterFactor * Math.random();
        const waitTime = delay + jitter;

        console.log(`Retry attempt ${attempt + 1}/${config.maxRetries} for function. Waiting ${Math.round(waitTime)}ms...`);

        await new Promise(resolve => setTimeout(resolve, waitTime));
        delay *= config.backoffMultiplier;
      }
    }
  }

  throw lastError;
};

/**
 * Add item to cart with session preservation
 * Stores cart state in session for later retrieval
 * @param {number} userId - User ID
 * @param {number} productId - Product ID
 * @param {number} quantity - Quantity to add
 * @param {Object} session - User session object
 * @returns {Object} Result with cart summary
 */
const addToCartWithSession = async (userId, productId, quantity, session = {}) => {
  try {
    if (!userId || !productId || !quantity || quantity < 1) {
      throw new Error('Invalid input: userId, productId, and quantity (>0) are required');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (product.stock < quantity) {
      throw new Error(`Insufficient stock. Available: ${product.stock}, Requested: ${quantity}`);
    }

    // Find or create pending order
    let order = await Order.findOne({
      where: {
        userId,
        status: 'Processing'
      }
    });

    if (!order) {
      order = await Order.create({
        userId,
        status: 'Processing',
        totalAmount: 0,
        paymentMethod: 'Cash on Delivery',
        paymentStatus: 'Pending',
        shippingAddress: 'To be provided',
        drugsngOrderId: null
      });
    }

    // Find or create order item
    let orderItem = await OrderItem.findOne({
      where: {
        orderId: order.id,
        productId
      }
    });

    if (orderItem) {
      orderItem.quantity += quantity;
    } else {
      orderItem = await OrderItem.create({
        orderId: order.id,
        productId,
        quantity,
        price: product.price
      });
    }

    await orderItem.save();

    // Update order total
    const orderItems = await OrderItem.findAll({
      where: { orderId: order.id },
      include: [Product]
    });

    const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    await order.update({ totalAmount });

    // Preserve cart in session
    if (session && typeof session === 'object') {
      session.cartOrderId = order.id;
      session.cartItemCount = orderItems.length;
      session.cartTotal = totalAmount;
    }

    return {
      success: true,
      orderId: order.id,
      productName: product.name,
      quantity,
      cartItemCount: orderItems.length,
      cartTotal: totalAmount,
      message: `✅ Added ${quantity}x ${product.name} to cart. Cart total: ₦${totalAmount.toFixed(2)}`
    };
  } catch (error) {
    console.error('Error adding to cart:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'ADD_TO_CART_FAILED'
    };
  }
};

/**
 * Place order with retry logic for external API
 * Preserves order state throughout the process
 * @param {number} userId - User ID
 * @param {Object} orderData - Order data (address, paymentMethod)
 * @param {Object} session - User session
 * @returns {Object} Order result
 */
const placeOrderWithRetry = async (userId, orderData, session = {}) => {
  try {
    if (!userId || !orderData || !orderData.address || !orderData.paymentMethod) {
      throw new Error('Invalid input: userId, address, and paymentMethod are required');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get pending order
    const order = await Order.findOne({
      where: {
        userId,
        status: 'Processing'
      },
      include: [OrderItem]
    });

    if (!order || !order.OrderItems || order.OrderItems.length === 0) {
      throw new Error('No items in cart. Please add items before placing an order.');
    }

    // Update order with shipping details
    await order.update({
      shippingAddress: orderData.address,
      paymentMethod: orderData.paymentMethod,
      status: 'Processing'
    });

    // Try to sync with Drugs.ng API with retry logic
    let syncedWithAPI = false;
    let drugsngOrderId = null;

    try {
      const result = await retryWithBackoff(async () => {
        const response = await drugsngAPI.post('/orders', {
          userId,
          address: orderData.address,
          paymentMethod: orderData.paymentMethod,
          items: order.OrderItems.map(item => ({
            productId: item.productId,
            quantity: item.quantity
          }))
        });
        return response.data;
      });

      if (result.orderId) {
        drugsngOrderId = result.orderId;
        await order.update({ drugsngOrderId });
        syncedWithAPI = true;
      }
    } catch (apiError) {
      console.warn('Failed to sync order with Drugs.ng API after retries:', apiError.message);
    }

    // Preserve order in session
    if (session && typeof session === 'object') {
      session.lastOrderId = order.id;
      session.lastOrderTotal = order.totalAmount;
      session.lastOrderDate = new Date().toISOString();
      session.cartOrderId = null;
      session.cartItemCount = 0;
      session.cartTotal = 0;
    }

    return {
      success: true,
      orderId: order.id,
      drugsngOrderId,
      totalAmount: order.totalAmount,
      paymentMethod: orderData.paymentMethod,
      status: order.status,
      syncedWithAPI,
      message: `✅ Order #${order.id} placed successfully for ₦${order.totalAmount.toFixed(2)}`
    };
  } catch (error) {
    console.error('Error placing order:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'PLACE_ORDER_FAILED'
    };
  }
};

/**
 * Get cart with pagination support
 * @param {number} userId - User ID
 * @param {Object} paginationOptions - Pagination options
 * @returns {Object} Paginated cart items
 */
const getCartPaginated = async (userId, paginationOptions = {}) => {
  try {
    const { page = 1, pageSize = 5 } = paginationOptions;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeSize = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));
    const offset = (safePage - 1) * safeSize;

    const order = await Order.findOne({
      where: {
        userId,
        status: 'Processing'
      },
      include: [{ model: OrderItem, include: [Product] }]
    });

    if (!order || !order.OrderItems) {
      return {
        success: true,
        empty: true,
        message: 'Your cart is empty'
      };
    }

    const items = order.OrderItems;
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
    const paginatedItems = items.slice(offset, offset + safeSize);

    const cartItems = paginatedItems.map((item, index) => ({
      displayNumber: offset + index + 1,
      productId: item.productId,
      productName: item.Product.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
      imageUrl: item.Product.imageUrl
    }));

    const cartTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return {
      success: true,
      empty: false,
      orderId: order.id,
      items: cartItems,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalItems,
        pageSize: safeSize,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1
      },
      cartTotal,
      itemCount: totalItems,
      message: `Cart (${totalItems} items) - Total: ₦${cartTotal.toFixed(2)}`
    };
  } catch (error) {
    console.error('Error getting cart:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'GET_CART_FAILED'
    };
  }
};

/**
 * Process payment with retry logic for external payment providers
 * @param {number} orderId - Order ID
 * @param {string} provider - Payment provider (Flutterwave or Paystack)
 * @param {Object} paymentDetails - Payment details
 * @returns {Object} Payment result
 */
const processPaymentWithRetry = async (orderId, provider, paymentDetails) => {
  try {
    if (!orderId || !provider || !paymentDetails) {
      throw new Error('Invalid input: orderId, provider, and paymentDetails are required');
    }

    const validProviders = ['Flutterwave', 'Paystack'];
    if (!validProviders.includes(provider)) {
      throw new Error(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Validate payment details
    if (!paymentDetails.amount || paymentDetails.amount <= 0) {
      throw new Error('Invalid payment amount');
    }

    if (!paymentDetails.email) {
      throw new Error('Email is required for payment');
    }

    // Try to process payment with retry logic
    let paymentResult = null;

    try {
      paymentResult = await retryWithBackoff(async () => {
        // This would call the actual payment provider
        // For now, we'll return a mock result that can be replaced
        const { processFlutterwavePayment, processPaystackPayment } = require('./payment');

        if (provider === 'Flutterwave') {
          return await processFlutterwavePayment({
            orderId,
            amount: paymentDetails.amount,
            email: paymentDetails.email,
            name: paymentDetails.name,
            phoneNumber: paymentDetails.phoneNumber
          });
        } else {
          return await processPaystackPayment({
            orderId,
            amount: paymentDetails.amount,
            email: paymentDetails.email,
            name: paymentDetails.name,
            phoneNumber: paymentDetails.phoneNumber
          });
        }
      });
    } catch (paymentError) {
      console.error(`Payment processing failed with ${provider}:`, paymentError.message);
      return {
        success: false,
        error: `Payment processing failed: ${paymentError.message}. Please try again or contact support.`,
        errorCode: 'PAYMENT_FAILED',
        orderId,
        provider
      };
    }

    // Update order with payment reference
    if (paymentResult && paymentResult.data) {
      await order.update({
        paymentReference: paymentResult.data.reference || paymentResult.data.tx_ref
      });
    }

    return {
      success: true,
      orderId,
      provider,
      paymentLink: paymentResult.data?.link || paymentResult.data?.authorization_url,
      reference: paymentResult.data?.reference || paymentResult.data?.tx_ref,
      message: `✅ Payment link generated. Please complete the payment to finalize your order.`
    };
  } catch (error) {
    console.error('Error processing payment:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'PAYMENT_PROCESS_FAILED'
    };
  }
};

/**
 * Remove item from cart
 * @param {number} userId - User ID
 * @param {number} productId - Product ID
 * @returns {Object} Result
 */
const removeFromCart = async (userId, productId) => {
  try {
    const order = await Order.findOne({
      where: {
        userId,
        status: 'Processing'
      }
    });

    if (!order) {
      throw new Error('Cart not found');
    }

    const orderItem = await OrderItem.findOne({
      where: {
        orderId: order.id,
        productId
      }
    });

    if (!orderItem) {
      throw new Error('Item not found in cart');
    }

    await orderItem.destroy();

    // Update order total
    const remainingItems = await OrderItem.findAll({
      where: { orderId: order.id },
      include: [Product]
    });

    if (remainingItems.length === 0) {
      // If cart is empty, keep the order for reference
      await order.update({ totalAmount: 0 });
    } else {
      const totalAmount = remainingItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      await order.update({ totalAmount });
    }

    return {
      success: true,
      cartItemCount: remainingItems.length,
      cartTotal: remainingItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      message: `✅ Item removed from cart`
    };
  } catch (error) {
    console.error('Error removing from cart:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'REMOVE_FROM_CART_FAILED'
    };
  }
};

/**
 * Clear cart (remove all items)
 * @param {number} userId - User ID
 * @returns {Object} Result
 */
const clearCart = async (userId) => {
  try {
    const order = await Order.findOne({
      where: {
        userId,
        status: 'Processing'
      }
    });

    if (!order) {
      return {
        success: true,
        message: 'Cart is already empty'
      };
    }

    await OrderItem.destroy({
      where: { orderId: order.id }
    });

    await order.update({ totalAmount: 0 });

    return {
      success: true,
      message: '✅ Cart cleared'
    };
  } catch (error) {
    console.error('Error clearing cart:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'CLEAR_CART_FAILED'
    };
  }
};

module.exports = {
  addToCartWithSession,
  placeOrderWithRetry,
  getCartPaginated,
  processPaymentWithRetry,
  removeFromCart,
  clearCart,
  retryWithBackoff
};
