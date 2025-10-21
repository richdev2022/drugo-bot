const axios = require('axios');

// Flutterwave API v3 configuration
const flutterwaveAPI = axios.create({
  baseURL: 'https://api.flutterwave.com/v3',
  headers: {
    'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Paystack API configuration
const paystackAPI = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Validate payment provider configuration
const validateFlutterwaveConfig = () => {
  if (!process.env.FLUTTERWAVE_SECRET_KEY) {
    throw new Error('Flutterwave is not configured. Please set FLUTTERWAVE_SECRET_KEY environment variable.');
  }
};

const validatePaystackConfig = () => {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack is not configured. Please set PAYSTACK_SECRET_KEY environment variable.');
  }
};

// Process payment with Flutterwave v3 API
const processFlutterwavePayment = async (paymentDetails) => {
  try {
    validateFlutterwaveConfig();

    // Validate payment details
    if (!paymentDetails.amount || paymentDetails.amount <= 0) {
      throw new Error('Invalid payment amount');
    }
    if (!paymentDetails.email) {
      throw new Error('Customer email is required');
    }
    if (!paymentDetails.orderId) {
      throw new Error('Order ID is required');
    }

    const payload = {
      tx_ref: `drugsng-${paymentDetails.orderId}-${Date.now()}`,
      amount: parseFloat(paymentDetails.amount),
      currency: 'NGN',
      redirect_url: process.env.PAYMENT_REDIRECT_URL || 'https://your-domain.com/payment/callback',
      payment_options: 'card,ussd,bank_transfer,mobilemoney',
      customer: {
        email: paymentDetails.email,
        phonenumber: paymentDetails.phoneNumber || '',
        name: paymentDetails.name || 'Customer'
      },
      customizations: {
        title: 'Drugs.ng Payment',
        description: `Payment for Order #${paymentDetails.orderId}`,
        logo: process.env.COMPANY_LOGO || 'https://drugsng.com/logo.png'
      },
      meta: {
        orderId: paymentDetails.orderId,
        timestamp: new Date().toISOString()
      }
    };

    const response = await flutterwaveAPI.post('/payments', payload);

    if (!response.data.data || !response.data.data.link) {
      throw new Error('Failed to generate payment link');
    }

    return {
      status: 'success',
      data: {
        link: response.data.data.link,
        reference: response.data.data.id,
        tx_ref: payload.tx_ref
      }
    };
  } catch (error) {
    console.error('Flutterwave payment error:', error.response?.data || error.message);
    throw {
      status: 'error',
      message: error.response?.data?.message || error.message,
      code: error.response?.status || 500
    };
  }
};

// Process payment with Paystack API
const processPaystackPayment = async (paymentDetails) => {
  try {
    validatePaystackConfig();

    // Validate payment details
    if (!paymentDetails.amount || paymentDetails.amount <= 0) {
      throw new Error('Invalid payment amount');
    }
    if (!paymentDetails.email) {
      throw new Error('Customer email is required');
    }
    if (!paymentDetails.orderId) {
      throw new Error('Order ID is required');
    }

    const payload = {
      reference: `drugsng-${paymentDetails.orderId}-${Date.now()}`,
      amount: Math.round(parseFloat(paymentDetails.amount) * 100), // Paystack expects amount in kobo
      email: paymentDetails.email,
      currency: 'NGN',
      callback_url: process.env.PAYMENT_REDIRECT_URL || 'https://your-domain.com/payment/callback',
      metadata: {
        orderId: paymentDetails.orderId,
        customerName: paymentDetails.name || 'Customer',
        customerPhone: paymentDetails.phoneNumber || '',
        timestamp: new Date().toISOString()
      }
    };

    const response = await paystackAPI.post('/transaction/initialize', payload);

    if (!response.data.status || !response.data.data) {
      throw new Error('Invalid response from Paystack');
    }

    return {
      status: 'success',
      data: {
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
        reference: response.data.data.reference
      }
    };
  } catch (error) {
    console.error('Paystack payment error:', error.response?.data || error.message);
    throw {
      status: 'error',
      message: error.response?.data?.message || error.message,
      code: error.response?.status || 500
    };
  }
};

// Verify Flutterwave payment
const verifyFlutterwavePayment = async (transactionId) => {
  try {
    validateFlutterwaveConfig();

    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    const response = await flutterwaveAPI.get(`/transactions/${transactionId}/verify`);

    if (!response.data.data) {
      throw new Error('Invalid response from Flutterwave');
    }

    return {
      status: response.data.data.status === 'successful' ? 'success' : 'failed',
      data: {
        id: response.data.data.id,
        amount: response.data.data.amount,
        currency: response.data.data.currency,
        status: response.data.data.status,
        txRef: response.data.data.tx_ref,
        customerEmail: response.data.data.customer?.email,
        timestamp: response.data.data.created_at
      }
    };
  } catch (error) {
    console.error('Flutterwave verification error:', error.response?.data || error.message);
    throw {
      status: 'error',
      message: error.response?.data?.message || error.message,
      code: error.response?.status || 500
    };
  }
};

// Verify Paystack payment
const verifyPaystackPayment = async (reference) => {
  try {
    validatePaystackConfig();

    if (!reference) {
      throw new Error('Reference is required');
    }

    const response = await paystackAPI.get(`/transaction/verify/${reference}`);

    if (!response.data.status || !response.data.data) {
      throw new Error('Invalid response from Paystack');
    }

    return {
      status: response.data.data.status === 'success' ? 'success' : 'failed',
      data: {
        id: response.data.data.id,
        reference: response.data.data.reference,
        amount: response.data.data.amount / 100, // Convert from kobo to naira
        currency: response.data.data.currency,
        status: response.data.data.status,
        customerEmail: response.data.data.customer?.email,
        timestamp: response.data.data.created_at
      }
    };
  } catch (error) {
    console.error('Paystack verification error:', error.response?.data || error.message);
    throw {
      status: 'error',
      message: error.response?.data?.message || error.message,
      code: error.response?.status || 500
    };
  }
};

// Unified payment verification
const verifyPayment = async (reference, provider) => {
  try {
    if (!reference || !provider) {
      throw new Error('Reference and provider are required');
    }

    provider = provider.toLowerCase().trim();

    if (provider === 'flutterwave') {
      return await verifyFlutterwavePayment(reference);
    } else if (provider === 'paystack') {
      return await verifyPaystackPayment(reference);
    } else {
      throw new Error(`Unsupported payment provider: ${provider}`);
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    throw error;
  }
};

module.exports = {
  processFlutterwavePayment,
  processPaystackPayment,
  verifyFlutterwavePayment,
  verifyPaystackPayment,
  verifyPayment
};
