// Simple fuzzy matching function for misspellings and partial matches
const fuzzyMatch = (input, target, minSimilarity = 0.7) => {
  const inp = input.toLowerCase().trim();
  const tgt = target.toLowerCase().trim();

  // Exact match
  if (inp === tgt) return 1;

  // Check if one contains the other
  if (inp.includes(tgt) || tgt.includes(inp)) return 0.9;

  // Levenshtein distance-based similarity
  const maxLen = Math.max(inp.length, tgt.length);
  if (maxLen === 0) return 1;

  const matrix = Array(inp.length + 1).fill(null).map(() => Array(tgt.length + 1).fill(0));

  for (let i = 0; i <= inp.length; i++) matrix[i][0] = i;
  for (j = 0; j <= tgt.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= inp.length; i++) {
    for (let j = 1; j <= tgt.length; j++) {
      const cost = inp[i - 1] === tgt[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[inp.length][tgt.length];
  const similarity = 1 - (distance / maxLen);
  return similarity >= minSimilarity ? similarity : 0;
};

// Extract keywords from long text for intent detection
const extractKeywords = (text) => {
  const words = text.toLowerCase().split(/\s+/);
  const productKeywords = ['medicine', 'drug', 'medication', 'pill', 'tablet', 'paracetamol', 'insulin', 'amoxicillin', 'blood', 'pressure', 'monitor', 'vitamin'];
  const doctorKeywords = ['doctor', 'physician', 'specialist', 'cardiologist', 'pediatrician', 'dermatologist', 'neurologist', 'consultant'];
  const orderKeywords = ['order', 'buy', 'purchase', 'checkout', 'cart', 'add'];
  const appointmentKeywords = ['appointment', 'book', 'schedule', 'consult', 'visit', 'meeting'];
  const trackKeywords = ['track', 'status', 'where', 'delivery', 'shipped', 'arrive'];

  const foundKeywords = {
    products: [],
    doctors: [],
    orders: [],
    appointments: [],
    tracking: []
  };

  words.forEach(word => {
    productKeywords.forEach(kw => {
      if (fuzzyMatch(word, kw, 0.75) > 0.75) foundKeywords.products.push(word);
    });
    doctorKeywords.forEach(kw => {
      if (fuzzyMatch(word, kw, 0.75) > 0.75) foundKeywords.doctors.push(word);
    });
    orderKeywords.forEach(kw => {
      if (fuzzyMatch(word, kw, 0.75) > 0.75) foundKeywords.orders.push(word);
    });
    appointmentKeywords.forEach(kw => {
      if (fuzzyMatch(word, kw, 0.75) > 0.75) foundKeywords.appointments.push(word);
    });
    trackKeywords.forEach(kw => {
      if (fuzzyMatch(word, kw, 0.75) > 0.75) foundKeywords.tracking.push(word);
    });
  });

  return foundKeywords;
};

const FEATURE_COMMANDS = {
  '1': { intent: 'search_products', label: 'Search Medicines' },
  '2': { intent: 'search_doctors', label: 'Find Doctors' },
  '3': { intent: 'track_order', label: 'Track Orders' },
  '4': { intent: 'book_appointment', label: 'Book Appointment' },
  '5': { intent: 'view_cart', label: 'View Cart' },
  '6': { intent: 'support', label: 'Customer Support' },
  '7': { intent: 'prescription_upload', label: 'Upload Prescription' },
  '8': { intent: 'healthcare_products', label: 'Browse Healthcare Products' }
};

const HELP_MESSAGE = `🏥 *Drugs.ng WhatsApp Bot - Available Services:*

1️⃣ *Search Medicines* - Type "1" or "find paracetamol"
2️⃣ *Find Doctors* - Type "2" or "find a cardiologist"
3️⃣ *Track Orders* - Type "3" or "track 12345"
4️⃣ *Book Appointment* - Type "4" or "book a doctor"
5️⃣ *View Cart* - Type "5" or "cart"
6️⃣ *Customer Support* - Type "6" or "connect me to support"
7️⃣ *Upload Prescription* - Type "7" or "upload prescription"
8️⃣ *Healthcare Products* - Type "8" or "browse health products"

Simply reply with a number (1-8) or describe what you need!`;

const { parseOrderIdFromText, isValidOrderId } = require('../utils/orderParser');

const processMessage = async (message, phoneNumber, session) => {
  try {
    if (!message || typeof message !== 'string') {
      return createResponse('unknown', {}, 'Invalid message format');
    }

    const lowerMessage = message.toLowerCase().trim();

    // 🔴 CRITICAL: Check if user is in ANY pagination context FIRST
    // This prevents ANY intent processing while user is selecting from a paginated list
    const isInPaginationContext = session && session.data && (
      !!session.data.doctorSpecialtyPagination ||
      !!session.data.doctorPagination ||
      !!session.data.productPagination ||
      !!session.data.cartPagination
    );

    // If numeric input in pagination context, let webhook pagination handlers manage it
    if (/^\d+$/.test(lowerMessage)) {
      if (isInPaginationContext) {
        console.log(`⚠️  NLP: Numeric input in pagination context detected. Allowing webhook to handle it.`);
        return createResponse('pagination_selection', {}, null, 'numeric-context');
      }
      
      const commandKey = lowerMessage.trim();
      if (FEATURE_COMMANDS[commandKey]) {
        return createResponse(FEATURE_COMMANDS[commandKey].intent, {}, null, 'numeric');
      }
    }

    // If user is in pagination context, only allow navigation commands (next, prev, back, etc.)
    // Otherwise, ANY keyword match will interrupt the pagination flow
    if (isInPaginationContext) {
      const navigationKeywords = ['next', 'prev', 'previous', 'back', 'cancel', 'exit', 'stop'];
      const isNavigationCommand = navigationKeywords.some(kw => lowerMessage.includes(kw));
      
      if (!isNavigationCommand) {
        console.log(`⚠️  NLP: User in pagination context (${Object.keys({
          doctorSpecialtyPagination: session.data.doctorSpecialtyPagination || false,
          doctorPagination: session.data.doctorPagination || false,
          productPagination: session.data.productPagination || false,
          cartPagination: session.data.cartPagination || false
        }).filter(k => session.data[k]).join(', ')}). Ignoring intent and returning pagination_selection.`);
        return createResponse('pagination_selection', {}, null, 'pagination-context');
      }
    }

    // Help intent - with fuzzy matching
    const helpKeywords = ['help', 'menu', 'what can you do', 'capabilities', 'features', '?'];
    if (helpKeywords.some(kw => fuzzyMatch(lowerMessage, kw, 0.85) > 0.85 || lowerMessage === kw)) {
      return createResponse('help', {}, HELP_MESSAGE);
    }

    // Logout intent - with fuzzy matching
    const logoutKeywords = ['logout', 'exit', 'bye', 'goodbye', 'sign out', 'log out'];
    if (logoutKeywords.some(kw => fuzzyMatch(lowerMessage, kw, 0.80) > 0.80 || lowerMessage === kw)) {
      return createResponse('logout', {}, null);
    }

    // Greeting intents - with fuzzy matching
    const greetingKeywords = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'start', 'begin'];
    if (greetingKeywords.some(kw => fuzzyMatch(lowerMessage, kw, 0.80) > 0.80 || lowerMessage === kw)) {
      return createResponse('greeting', {}, null);
    }

    // Registration intents
    if (/^(register|signup|sign up|create account|new account)/.test(lowerMessage)) {
      return handleRegistrationIntent(message);
    }

    // Login intents
    if (/^(login|signin|sign in|log in|authenticate)/.test(lowerMessage)) {
      return handleLoginIntent(message);
    }

    // ⚠️ CRITICAL: Doctor search intents MUST BE FIRST to prevent "look for doctor" being misclassified as product search
    // This pattern is now more specific to avoid catching phrases like "add product..."
    if (/\b(doctor|physician|specialist|cardiologist|pediatrician|dermatologist|gynecologist|neurologist|orthopedic)\b/i.test(lowerMessage) ||
        /^(find|search|need|look for|consult).*?(doctor|physician|specialist)/i.test(lowerMessage) ||
        lowerMessage === '2') {
      return handleDoctorSearchIntent(message);
    }

    // Product search intents - ONLY check after doctor search confirmed as negative
    // This now correctly handles "search for [product name]"
    if (/\b(medicine|drug|medication|pill|tablet|paracetamol|aspirin|ibuprofen|amoxicillin|insulin|antibiotic|vaccine|panadol)\b/.test(lowerMessage) ||
        (/^(search|find|show|look|give|send).*?(medicine|drug|product|medication|pill|tablet)/i.test(lowerMessage) && !/\b(doctor|physician|specialist|cardiologist|pediatrician|dermatologist)\b/i.test(lowerMessage)) ||
        lowerMessage === '1') {
      return handleProductSearchIntent(message);
    }

    // Add to cart intents
    // Enhanced to capture "add [product name] [quantity]"
    if (/^(add|put|move).*?(cart|basket)/.test(lowerMessage) || /^(add)\s+([\w\s]+?)(?:\s+(?:qty|quantity))?\s*(\d+)?$/i.test(lowerMessage) || /^(add)\s+\d+(?:\s+\d+)?$/.test(lowerMessage)) {
      return handleAddToCartIntent(message);
    }

    // Order/Checkout intents
    if (/^(order|checkout|place order|buy|purchase|proceed to|complete|confirm order)/.test(lowerMessage)) {
      return handlePlaceOrderIntent(message);
    }

    // Track order intents
    if (/^(track|where is|status of|check|trace|update on).*?(order|delivery|package)/.test(lowerMessage) ||
        lowerMessage === '3') {
      return handleTrackOrderIntent(message);
    }

    // Appointment booking intents
    if (/^(book|schedule|make|arrange|reserve).*?(appointment|consultation|visit)/.test(lowerMessage) ||
        lowerMessage === '4') {
      return handleBookAppointmentIntent(message);
    }

    // Payment intents
    if (/^(pay|payment|process payment|pay for|settle)/.test(lowerMessage)) {
      return handlePaymentIntent(message);
    }

    // View cart intents
    if (/^(cart|view cart|show cart|my cart)$/.test(lowerMessage) || lowerMessage === '5') {
      return createResponse('view_cart', {}, 'Showing your cart...');
    }

    // Support/Chat intents
    if (/^(support|agent|help me|speak to|chat with|contact|complaint|issue|problem|help|talk to agent)/.test(lowerMessage) ||
        lowerMessage === '6') {
      return createResponse('support', {}, 'Connecting you to our support team...');
    }

    // Diagnostic tests intents
    // NOTE: More specific pattern to avoid false positives with "test" as a verb
    if (/^(diagnostic|screening|check up|blood test|lab test|medical test|covid test|malaria test|typhoid test|thyroid test)/.test(lowerMessage)) {
      return handleDiagnosticTestIntent(message);
    }

    // Healthcare products intents
    if (/^(healthcare|health care|health products|browse products|equipment|devices|supplies)/.test(lowerMessage) ||
        lowerMessage === '8' || lowerMessage === 'browse health products') {
      return handleHealthcareProductIntent(message);
    }

    // Password reset intents
    if (/^(forgot|reset|change).*password/.test(lowerMessage)) {
      const parameters = {};
      const emailMatch = lowerMessage.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        parameters.email = emailMatch[0];
      }
      const fulfillmentText = parameters.email ? `Understood. Sending a password reset link to ${parameters.email}...` : "I can help with that. What's the email address for your account?";
      return createResponse('password_reset', parameters, fulfillmentText);
    }

    // Prescription upload intents
    if (/^(upload|prescription|script|rx|medicine prescription)/.test(lowerMessage) || lowerMessage === '7') {
      return createResponse('prescription_upload', {}, 'Please upload your prescription document (image or PDF) by sending it as an attachment.');
    }

    // Default: Try to extract intent from keywords
    const extractedIntent = extractIntentFromMessage(lowerMessage);
    if (extractedIntent && extractedIntent.intent !== 'unknown') {
      return extractedIntent;
    }

    return createResponse('unknown', {}, "I didn't understand that. Type 'help' to see what I can do.");
  } catch (error) {
    console.error('NLP processing error:', error);
    return createResponse('error', {}, 'I encountered an error processing your message. Please try again.');
  }
};

const createResponse = (intent, parameters = {}, fulfillmentText = null, source = 'custom-nlp') => {
  const defaultMessages = {
    help: HELP_MESSAGE,
    greeting: null,
    register: "I'll help you register. Please provide your full name, email, and a password.\n\nExample: register John Doe john@example.com mypassword",
    login: "I'll help you login. Please provide your email and password.\n\nExample: login john@example.com mypassword",
    search_products: "What medicine or product are you looking for?",
    add_to_cart: 'Please specify the product number and quantity.\n\nExample: add 1 2 (adds 2 units of product 1)',
    place_order: 'I can help you place an order. Please provide your delivery address and payment method.',
    view_cart: 'Showing your cart...',
    track_order: 'Please provide your order ID to track it.\n\nExample: track 12345 (or send part of your payment reference like drugsng-12345-... or caption: rx 12345)',
    search_doctors: 'What type of doctor are you looking for? (e.g., cardiologist, pediatrician)',
    book_appointment: 'I can help you book an appointment. Please provide the doctor and your preferred date and time.',
    payment: 'I can help you make a payment. Please provide your order ID and preferred payment method.',
    support: 'Connecting you to our support team. Please describe your issue.',
    diagnostic_tests: 'What diagnostic test would you like to book? (e.g., blood test, malaria test, thyroid test)',
    healthcare_products: 'What healthcare product would you like to browse? (e.g., first aid kit, thermometer, oximeter)',
    password_reset: "I'll help you reset your password. Please provide your email address.",
    prescription_upload: 'Please upload your prescription document (image or PDF) by sending it as an attachment.',
    logout: 'You have been logged out. Type "help" to get started again.',
    unknown: "I'm not sure how to help with that. Type 'help' to see available options.",
    error: 'I encountered an error. Please try again.'
  };

  return {
    intent,
    parameters,
    fulfillmentText: fulfillmentText || defaultMessages[intent] || defaultMessages['unknown'],
    confidence: 0.9,
    source
  };
};

const handleRegistrationIntent = (message) => {
  const parameters = {};

  // Try to extract registration data
  const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    parameters.email = emailMatch[0];
  }

  const afterRegister = message.replace(/^(register|signup|sign up|create account|new account)\s+/i, '').trim();
  const parts = afterRegister.split(/\s+/);

  let emailIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('@')) {
      emailIndex = i;
      break;
    }
  }

  if (emailIndex > 0) {
    parameters.name = parts.slice(0, emailIndex).join(' ');
  }

  if (emailIndex !== -1) {
    parameters.email = parts[emailIndex];
  }

  if (emailIndex !== -1 && emailIndex + 1 < parts.length) {
    parameters.password = parts.slice(emailIndex + 1).join(' ');
  }

  return createResponse('register', parameters);
};

const handleLoginIntent = (message) => {
  const parameters = {};

  const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    parameters.email = emailMatch[0];
  }

  const afterLogin = message.replace(/^(login|signin|sign in|log in|authenticate)\s+/i, '').trim();
  const parts = afterLogin.split(/\s+/);

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('@')) {
      parameters.email = parts[i];
      if (i + 1 < parts.length) {
        parameters.password = parts.slice(i + 1).join(' ');
      }
      break;
    }
  }

  return createResponse('login', parameters);
};

const handleProductSearchIntent = (message) => {
  const parameters = {};
  const lowerMessage = message.toLowerCase();

  const searchKeywords = ['search', 'find', 'show', 'look for', 'do you have', 'give me', 'send me'];
  const productKeywords = ['medicine', 'drug', 'product', 'medication', 'pill', 'tablet'];

  let productName = message;

  for (const keyword of searchKeywords) {
    const index = lowerMessage.indexOf(keyword);
    if (index !== -1) {
      productName = message.substring(index + keyword.length).trim();
      break;
    }
  }

  // Remove common words and product type keywords
  productName = productName.replace(/^(for|a|an|the)\s+/i, '').trim();
  for (const keyword of productKeywords) {
    productName = productName.replace(new RegExp(`\\b${keyword}\\b`, 'i'), '').trim();
  }

  if (productName) {
    parameters.product = productName;
  }

  return createResponse('search_products', parameters);
};

const handleAddToCartIntent = (message) => {
  const parameters = {};
  const lowerMessage = message.toLowerCase();

  // Match "add [product name] [quantity]" or "add [product name] quantity [quantity]"
  const nameAndQtyMatch = lowerMessage.match(/add\s+(.+?)(?:\s+quantity|\s+qty)?\s+(\d+)/i);
  if (nameAndQtyMatch) {
    parameters.productName = nameAndQtyMatch[1].trim();
    parameters.quantity = nameAndQtyMatch[2];
  } else {
    // Match "add [index] [quantity]"
    const indexAndQtyMatch = lowerMessage.match(/add\s+(\d+)\s+(\d+)/);
    if (indexAndQtyMatch) {
      parameters.productIndex = indexAndQtyMatch[1];
      parameters.quantity = indexAndQtyMatch[2];
    } else {
      // Fallback for "add [index]" (defaults quantity to 1)
      const indexOnlyMatch = lowerMessage.match(/add\s+(\d+)/);
      if (indexOnlyMatch) {
        parameters.productIndex = indexOnlyMatch[1];
        parameters.quantity = '1';
      }
    }
  }

  console.log(`✓ Detected add_to_cart intent: productIndex=${parameters.productIndex}, quantity=${parameters.quantity}`);
  return createResponse('add_to_cart', parameters);
};

const handlePlaceOrderIntent = (message) => {
  const parameters = {};

  // Look for address patterns (usually contains comma or specific location words)
  const addressMatch = message.match(/(?:at|to|address|location)?\s*([^,]+(,[^,]+)?)/i);
  if (addressMatch) {
    parameters.address = addressMatch[1].trim();
  }

  // Look for payment method
  if (/flutterwave/i.test(message)) {
    parameters.paymentMethod = 'Flutterwave';
  } else if (/paystack/i.test(message)) {
    parameters.paymentMethod = 'Paystack';
  } else if (/cash/i.test(message)) {
    parameters.paymentMethod = 'Cash on Delivery';
  }

  return createResponse('place_order', parameters);
};

const handleTrackOrderIntent = (message) => {
  const parameters = {};
  // Try robust parsing for order id (supports: "rx 123", txRef like drugsng-12345-..., or plain numeric id)
  const parsed = parseOrderIdFromText(message);
  if (parsed) {
    parameters.orderId = parsed;
  }

  return createResponse('track_order', parameters);
};

const handleDoctorSearchIntent = (message) => {
  const parameters = {};
  const lowerMessage = message.toLowerCase();

  const specialties = [
    'cardiologist', 'pediatrician', 'dermatologist', 'gynecologist',
    'general practitioner', 'neurologist', 'orthopedic', 'ophthalmologist',
    'pulmonologist', 'gastroenterologist', 'urologist', 'psychiatrist'
  ];

  for (const specialty of specialties) {
    if (lowerMessage.includes(specialty)) {
      parameters.specialty = specialty;
      break;
    }
  }

  // Extract location
  const locationMatch = lowerMessage.match(/in\s+([A-Za-z\s]+?)(?:\s+on|\s+at|$)/i);
  if (locationMatch) {
    parameters.location = locationMatch[1].trim();
  }

  return createResponse('search_doctors', parameters);
};

const handleBookAppointmentIntent = (message) => {
  const parameters = {};

  const numbers = message.match(/\d+/g);
  if (numbers && numbers.length >= 1) {
    parameters.doctorIndex = numbers[0];
  }

  // Try to extract date (YYYY-MM-DD format)
  const dateMatch = message.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/);
  if (dateMatch) {
    parameters.date = dateMatch[1];
  }

  // Try to extract time (HH:MM format)
  const timeMatch = message.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (timeMatch) {
    parameters.time = timeMatch[0].trim();
  }

  return createResponse('book_appointment', parameters);
};

const handlePaymentIntent = (message) => {
  const parameters = {};
  const lowerMessage = message.toLowerCase();

  const parsed = parseOrderIdFromText(message);
  if (parsed) {
    parameters.orderId = parsed;
  }

  if (/flutterwave/i.test(lowerMessage)) {
    parameters.provider = 'Flutterwave';
  } else if (/paystack/i.test(lowerMessage)) {
    parameters.provider = 'Paystack';
  }

  return createResponse('payment', parameters);
};

const handleDiagnosticTestIntent = (message) => {
  const parameters = {};
  const lowerMessage = message.toLowerCase();

  const testKeywords = [
    'blood test', 'covid test', 'malaria test', 'typhoid test', 'thyroid test',
    'glucose test', 'lipid profile', 'urinalysis', 'full blood count'
  ];

  for (const test of testKeywords) {
    if (lowerMessage.includes(test)) {
      parameters.testType = test;
      break;
    }
  }

  return createResponse('diagnostic_tests', parameters);
};

const handleHealthcareProductIntent = (message) => {
  const parameters = {};
  const lowerMessage = message.toLowerCase();

  const categories = [
    'first aid', 'medical devices', 'thermometer', 'oximeter', 'glucose meter',
    'bandage', 'gauze', 'cream', 'gel', 'kit'
  ];

  for (const category of categories) {
    if (lowerMessage.includes(category)) {
      parameters.category = category;
      break;
    }
  }

  return createResponse('healthcare_products', parameters);
};

const extractIntentFromMessage = (lowerMessage) => {
  // Extract keywords from message
  const foundKeywords = extractKeywords(lowerMessage);

  // Determine intent based on found keywords
  // CRITICAL: Check doctors FIRST to avoid "look for doctor" being misclassified
  if (foundKeywords.doctors.length > 0) {
    return createResponse('search_doctors', {});
  }

  if (foundKeywords.products.length > 0) {
    const productName = lowerMessage.split(/\s+/).filter(word =>
      foundKeywords.products.includes(word)
    ).join(' ');
    return createResponse('search_products', { product: productName || undefined });
  }

  if (foundKeywords.appointments.length > 0) {
    return createResponse('book_appointment', {});
  }

  if (foundKeywords.orders.length > 0) {
    return createResponse('place_order', {});
  }

  if (foundKeywords.tracking.length > 0) {
    // Try to extract order ID using robust parser
    const parsed = parseOrderIdFromText(lowerMessage);
    return createResponse('track_order', { orderId: parsed || undefined });
  }

  // Fallback: use pattern matching for additional context
  const keywords = [
    {
      patterns: [/medicine|drug|pharmacy|health|medicinal/],
      intent: 'search_products'
    },
    {
      patterns: [/doctor|physician|clinic|medical|health professional/],
      intent: 'search_doctors'
    },
    {
      patterns: [/appointment|consultation|visit|schedule/],
      intent: 'book_appointment'
    },
    {
      patterns: [/order|purchase|buy|checkout|cart/],
      intent: 'place_order'
    },
    {
      patterns: [/deliver|shipping|progress|arrive|when|where/],
      intent: 'track_order'
    }
  ];

  for (const { patterns, intent } of keywords) {
    for (const pattern of patterns) {
      if (pattern.test(lowerMessage)) {
        return createResponse(intent, {});
      }
    }
  }

  return null;
};

const formatResponseWithOptions = (message, isLoggedIn) => {
  let optionsText = '\n\n---\n';

  if (isLoggedIn) {
    optionsText += '📋 *Options:* Type "help" for menu | "logout" to sign out';
  } else {
    optionsText += '📋 *Options:* Type "help" for menu | "login" to sign in | "register" to create account';
  }

  return message + optionsText;
};

module.exports = {
  processMessage,
  formatResponseWithOptions,
  HELP_MESSAGE,
  fuzzyMatch,
  FEATURE_COMMANDS
};
