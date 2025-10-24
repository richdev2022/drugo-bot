/**
 * Advanced NLP Service with Multi-language Support & Intent Recognition
 * Integrates: Natural.js, Compromise, Custom Nigerian Language Support
 */

const axios = require('axios');

// ============ ADVANCED NLP ENGINE ============

class AdvancedNLPEngine {
  constructor() {
    this.intents = this.initializeIntents();
    this.entities = this.initializeEntities();
    this.nigerianLanguages = this.initializeNigerianLanguages();
    this.conversationContext = new Map(); // Track user context
  }

  /**
   * Initialize intent mappings with patterns and requirements
   */
  initializeIntents() {
    return {
      // PRODUCT INTENTS
      search_products: {
        patterns: ['buy', 'purchase', 'i want medicine', 'i want drug', 'i want product', 'i want tablet', 'show me medicine'],
        keywords: ['medicine', 'drug', 'medication', 'pill', 'tablet', 'product', 'paracetamol', 'aspirin', 'amoxicillin', 'ibuprofen'],
        requiredEntities: ['product_name'],
        optionalEntities: ['quantity'],
        examples: [
          'I want to buy paracetamol 2 quantity',
          'find me aspirin',
          'show amoxicillin tablets',
          'do you have insulin'
        ],
        entityPatterns: {
          product_name: /\b([a-z]+(?:\s+[a-z]+)*)\b(?:\s+(\d+)\s+(?:quantity|qty|units?))?/i,
          quantity: /(\d+)\s*(?:quantity|qty|units|pcs|tablets?|pills?)?/i
        }
      },
      
      // DOCTOR INTENTS (MUST have doctor-related keywords to avoid confusion with products)
      // NOTE: Removed "book doctor" pattern to avoid conflict with book_appointment (line 90)
      search_doctors: {
        patterns: ['find doctor', 'need doctor', 'consult doctor', 'see doctor', 'need specialist', 'look for doctor', 'find specialist', 'search doctor'],
        keywords: ['doctor', 'physician', 'specialist', 'cardiologist', 'pediatrician', 'dermatologist', 'neurologist'],
        requiredEntities: ['doctor_specialty'],
        optionalEntities: ['preferred_date', 'preferred_time'],
        examples: [
          'I need a cardiologist',
          'find me a pediatrician tomorrow',
          'book appointment with dermatologist'
        ],
        entityPatterns: {
          doctor_specialty: /\b(cardiologist|pediatrician|dermatologist|neurologist|gynecologist|urologist|orthopedic|ophthalmologist|dentist|psychiatrist)\b/i,
          preferred_date: /(?:tomorrow|today|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}\/\d{1,2}(?:\/\d{4})?)/i,
          preferred_time: /(?:morning|afternoon|evening|\d{1,2}:\d{2}\s*(?:am|pm|a\.m\.|p\.m\.))/i
        }
      },

      // ORDER INTENTS
      // NOTE: Uses specific patterns like "place order", "checkout" to distinguish from search_products
      place_order: {
        patterns: ['place order', 'checkout', 'proceed to checkout', 'confirm order', 'complete order', 'finalize order'],
        keywords: ['order', 'checkout', 'cart', 'deliver', 'address', 'payment'],
        requiredEntities: ['delivery_address'],
        optionalEntities: ['payment_method', 'special_instructions'],
        examples: [
          'I want to place an order',
          'checkout my items',
          'buy and deliver to 123 main street'
        ]
      },

      // TRACK ORDER
      track_order: {
        patterns: ['track', 'where', 'status', 'check', 'update'],
        keywords: ['order', 'delivery', 'package', 'shipped'],
        requiredEntities: ['order_id'],
        optionalEntities: [],
        examples: [
          'track my order 12345',
          'where is my package',
          'what is the status of order rx-12345'
        ],
        entityPatterns: {
          order_id: /(?:order\s*#?|rx|drugsng-)?(\w+-?\d+)/i
        }
      },

      // APPOINTMENT INTENTS
      // NOTE: Requires "appointment", "consultation", or "visit" keywords to distinguish from search_doctors
      book_appointment: {
        patterns: ['book appointment', 'schedule appointment', 'book consultation', 'schedule consultation', 'book visit', 'reserve appointment', 'make appointment'],
        keywords: ['appointment', 'consultation', 'visit', 'consult', 'booking', 'reserve'],
        requiredEntities: ['doctor_name', 'preferred_date', 'preferred_time'],
        optionalEntities: ['symptoms', 'notes'],
        examples: [
          'book appointment with Dr. Smith tomorrow at 10am',
          'schedule consultation with cardiologist next monday'
        ]
      },

      // SUPPORT INTENTS
      customer_support: {
        patterns: ['help', 'support', 'agent', 'speak to', 'complaint', 'issue', 'problem'],
        keywords: ['help', 'support', 'agent', 'complaint', 'issue'],
        requiredEntities: ['issue_description'],
        optionalEntities: ['order_id', 'issue_type'],
        examples: [
          'I need help with my order',
          'connect me to support',
          'I have a complaint about my delivery'
        ]
      },

      // PAYMENT INTENTS
      payment: {
        patterns: ['pay', 'payment', 'process', 'settle', 'charge'],
        keywords: ['pay', 'payment', 'method', 'card', 'bank', 'wallet'],
        requiredEntities: ['order_id'],
        optionalEntities: ['payment_method', 'amount'],
        examples: [
          'pay for order 12345',
          'process payment with card',
          'charge my account'
        ]
      }
    };
  }

  /**
   * Initialize entity extraction patterns
   */
  initializeEntities() {
    return {
      email: /[\w.-]+@[\w.-]+\.\w+/i,
      phone: /(?:\+?\d{1,3}[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/,
      address: /(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|apartment|apt|suite|#)\s*[^,;.]+/i,
      number: /\d+(?:\.\d+)?/,
      date: /(?:tomorrow|today|next\s+\w+|\d{1,2}[-/]\d{1,2}(?:[-/]\d{4})?)/i,
      time: /\d{1,2}:\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)?/i,
      currency_amount: /[\$£€₦]?\s*\d+(?:,\d{3})*(?:\.\d{2})?/
    };
  }

  /**
   * Initialize Nigerian language support
   */
  initializeNigerianLanguages() {
    return {
      yoruba: {
        greetings: ['sannu', 'pẹlẹ o', 'akwaaba', 'bawo', 'ekaaro'],
        affirm: ['bẹẹni', 'yeah', 'true', 'dabi'],
        negate: ['bẹko', 'koda', 'nope', 'ko'],
        products: ['oogun', 'ijeun', 'ibadandun'],
        doctor: ['dofofo', 'oloogun'],
        help: ['ìrànlowó', 'ifẹ', 'ẹbun']
      },
      igbo: {
        greetings: ['kedu', 'kedu ka i', 'kedụ', 'olee'],
        affirm: ['ee', 'o', 'oo', 'nke'],
        negate: ['mba', 'ebe', 'ee nọ'],
        products: ['ogwu', 'ihe ire', 'ihe ahumike'],
        doctor: ['diokta', 'onye ogwu'],
        help: ['nyere m aka', 'i nyere m aka']
      },
      hausa: {
        greetings: ['sannu', 'sannu da', 'kwakawalwa', 'sai sannu'],
        affirm: ['i', 'eh', 'na gari', 'tayi'],
        negate: ['ba', 'a ba', 'kaaba', 'kaba'],
        products: ['maganin', 'kayan', 'abin'],
        doctor: ['likita', 'mai magani'],
        help: ['taimako', 'bakinka']
      }
    };
  }

  /**
   * Main NLP processing function
   * Handles text understanding and intent/entity extraction
   */
  async processUserInput(userMessage, phoneNumber, conversationHistory = []) {
    try {
      // Normalize input
      const normalizedInput = this.normalizeInput(userMessage);
      
      // Detect language
      const detectedLanguage = this.detectLanguage(normalizedInput);
      
      // Translate to English if needed
      let processableText = normalizedInput;
      if (detectedLanguage !== 'english') {
        processableText = await this.translateToEnglish(normalizedInput, detectedLanguage);
      }

      // Extract entities from message
      const extractedEntities = this.extractEntities(processableText);

      // Classify intent with confidence scoring
      const intentResult = this.classifyIntent(processableText, extractedEntities);

      // Check if required entities are present
      const { hasRequiredEntities, missingEntities } = this.validateRequiredEntities(
        intentResult.intent,
        extractedEntities
      );

      // Store conversation context
      this.updateConversationContext(phoneNumber, {
        message: userMessage,
        intent: intentResult.intent,
        entities: extractedEntities,
        timestamp: new Date()
      });

      // Build response
      const response = {
        success: true,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        entities: extractedEntities,
        language: detectedLanguage,
        hasRequiredEntities,
        missingEntities: hasRequiredEntities ? [] : missingEntities,
        requiresFollowUp: !hasRequiredEntities,
        message: this.generateFollowUpMessage(intentResult.intent, extractedEntities, missingEntities),
        actionRequired: this.getActionRequired(intentResult.intent, extractedEntities),
        conversationContext: this.getConversationContext(phoneNumber)
      };

      return response;
    } catch (error) {
      console.error('Advanced NLP processing error:', error);
      return {
        success: false,
        error: error.message,
        intent: 'error',
        requiresFollowUp: false
      };
    }
  }

  /**
   * Normalize user input
   */
  normalizeInput(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-@\.]/g, ''); // Remove special chars except common ones
  }

  /**
   * Detect language (English, Yoruba, Igbo, Hausa)
   */
  detectLanguage(text) {
    const yorubaPatterns = /\b(sannu|pẹlẹ|bawo|oogun|dofofo|iranlowo)\b/i;
    const igboPatterns = /\b(kedu|ee|mba|ogwu|diokta|nyere)\b/i;
    const hausaPatterns = /\b(sannu|likita|maganin|kayan|taimako)\b/i;

    if (yorubaPatterns.test(text)) return 'yoruba';
    if (igboPatterns.test(text)) return 'igbo';
    if (hausaPatterns.test(text)) return 'hausa';
    return 'english';
  }

  /**
   * Translate Nigerian languages to English (placeholder)
   * In production, integrate with a translation API or use a trained model
   */
  async translateToEnglish(text, language) {
    const translations = {
      yoruba: {
        'oogun': 'medicine',
        'dofofo': 'doctor',
        'iriwo': 'order',
        'aje': 'payment'
      },
      igbo: {
        'ogwu': 'medicine',
        'diokta': 'doctor',
        'ike': 'order',
        'ego': 'payment'
      },
      hausa: {
        'maganin': 'medicine',
        'likita': 'doctor',
        'odar': 'order',
        'kudin': 'payment'
      }
    };

    let result = text;
    const dict = translations[language] || {};
    
    for (const [nigerianWord, englishWord] of Object.entries(dict)) {
      result = result.replace(new RegExp(`\\b${nigerianWord}\\b`, 'gi'), englishWord);
    }

    return result;
  }

  /**
   * Extract entities from text using patterns
   */
  extractEntities(text) {
    const entities = {};

    // Use regex patterns from initialized entities
    for (const [entityType, pattern] of Object.entries(this.entities)) {
      const match = text.match(pattern);
      if (match) {
        entities[entityType] = match[0] || match[1];
      }
    }

    // Extract custom entities based on context
    entities.product_name = this.extractProductName(text);
    entities.doctor_specialty = this.extractDoctorSpecialty(text);
    entities.quantity = this.extractQuantity(text);
    entities.order_id = this.extractOrderId(text);

    return Object.fromEntries(
      Object.entries(entities).filter(([_, v]) => v !== undefined && v !== null)
    );
  }

  /**
   * Extract product names with fuzzy matching
   */
  extractProductName(text) {
    const commonProducts = [
      'paracetamol', 'aspirin', 'amoxicillin', 'ibuprofen', 'insulin', 
      'vitamin c', 'panadol', 'chloroquine', 'augmentin', 'flagyl',
      'antihistamine', 'antibiotics', 'pain relief', 'fever reducer'
    ];

    for (const product of commonProducts) {
      if (this.fuzzyMatch(text, product) > 0.7) {
        return product;
      }
    }

    // Extract from custom patterns in intent
    const customPattern = /(?:want|need|looking for|find|buy|search for)\s+(?:a\s+)?([a-z\s]+?)(?:\s+\d+\s+(?:quantity|qty|units|pcs))?(?:\.|,|$)/i;
    const match = text.match(customPattern);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract doctor specialty
   */
  extractDoctorSpecialty(text) {
    const specialties = [
      'cardiologist', 'pediatrician', 'dermatologist', 'neurologist', 
      'gynecologist', 'urologist', 'orthopedic', 'ophthalmologist', 'dentist'
    ];

    for (const specialty of specialties) {
      if (text.includes(specialty)) {
        return specialty;
      }
    }

    return null;
  }

  /**
   * Extract quantity from text
   */
  extractQuantity(text) {
    const quantityPattern = /(\d+)\s*(?:quantity|qty|units|pcs|tablets?|pills?|boxes?)?/i;
    const match = text.match(quantityPattern);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Extract order ID
   */
  extractOrderId(text) {
    const orderPattern = /(?:order\s*#?|rx|drugsng-)?(\w+-?\d+|\d{5,})/i;
    const match = text.match(orderPattern);
    return match ? match[1] : null;
  }

  /**
   * Classify intent with confidence scoring
   */
  classifyIntent(text, entities) {
    let bestMatch = { intent: 'unknown', confidence: 0, score: 0 };

    for (const [intentName, intentData] of Object.entries(this.intents)) {
      let score = 0;
      let keywordMatches = 0;

      // Check pattern matches
      for (const pattern of intentData.patterns) {
        if (text.includes(pattern)) {
          score += 2;
        }
      }

      // Check keyword matches (higher weight)
      for (const keyword of intentData.keywords) {
        if (this.fuzzyMatch(text, keyword) > 0.7) {
          score += 3;
          keywordMatches++;
        }
      }

      // Check entity matches
      for (const entity of intentData.requiredEntities) {
        if (entities[entity]) {
          score += 4; // Weight entity matches most heavily
        }
      }

      // Boost score if we have keyword matches (indicates high confidence)
      if (keywordMatches > 0) {
        score *= 1.5;
      }

      const totalWeight = (intentData.patterns.length * 2) + (intentData.keywords.length * 3) + (intentData.requiredEntities.length * 4);
      const confidence = totalWeight > 0 ? Math.min(score / totalWeight, 1) : 0;

      if (score > bestMatch.score) {
        bestMatch = { intent: intentName, confidence, score };
      }
    }

    return bestMatch;
  }

  /**
   * Fuzzy matching algorithm
   */
  fuzzyMatch(input, target, minSimilarity = 0.7) {
    const inp = input.toLowerCase().trim();
    const tgt = target.toLowerCase().trim();

    if (inp === tgt) return 1;
    if (inp.includes(tgt) || tgt.includes(inp)) return 0.9;

    const maxLen = Math.max(inp.length, tgt.length);
    if (maxLen === 0) return 1;

    const matrix = Array(inp.length + 1)
      .fill(null)
      .map(() => Array(tgt.length + 1).fill(0));

    for (let i = 0; i <= inp.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= tgt.length; j++) matrix[0][j] = j;

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
    const similarity = 1 - distance / maxLen;
    return similarity >= minSimilarity ? similarity : 0;
  }

  /**
   * Validate required entities for intent
   */
  validateRequiredEntities(intent, extractedEntities) {
    const intentData = this.intents[intent];
    if (!intentData) return { hasRequiredEntities: true, missingEntities: [] };

    const missingEntities = [];
    for (const requiredEntity of intentData.requiredEntities) {
      // Check if entity exists in extracted entities
      if (!extractedEntities[requiredEntity]) {
        missingEntities.push(requiredEntity);
      }
    }

    return {
      hasRequiredEntities: missingEntities.length === 0,
      missingEntities
    };
  }

  /**
   * Generate follow-up message if required entities are missing
   */
  generateFollowUpMessage(intent, entities, missingEntities) {
    const messages = {
      search_products: `What medicine or product are you looking for?`,
      search_doctors: `What type of doctor do you need? (e.g., cardiologist, pediatrician)`,
      place_order: `Please provide your delivery address.`,
      track_order: `Could you please provide your order ID?`,
      book_appointment: `Which doctor would you like to book an appointment with?`,
      customer_support: `Could you describe your issue in more detail?`,
      payment: `Please provide your order ID for payment.`
    };

    if (missingEntities.length > 0) {
      return `${messages[intent] || 'I need more information.'} Missing: ${missingEntities.join(', ')}`;
    }

    return messages[intent] || 'How can I help you?';
  }

  /**
   * Determine action required based on intent and entities
   */
  getActionRequired(intent, entities) {
    return {
      intent,
      entities,
      action: this.mapIntentToAction(intent),
      nextStep: this.getNextStep(intent, entities)
    };
  }

  /**
   * Map intent to specific action
   */
  mapIntentToAction(intent) {
    const actionMap = {
      'search_products': 'SEARCH_PRODUCTS',
      'search_doctors': 'SEARCH_DOCTORS',
      'place_order': 'PLACE_ORDER',
      'track_order': 'TRACK_ORDER',
      'book_appointment': 'BOOK_APPOINTMENT',
      'customer_support': 'CONNECT_SUPPORT',
      'payment': 'PROCESS_PAYMENT'
    };
    return actionMap[intent] || 'UNKNOWN';
  }

  /**
   * Get next step in conversation
   */
  getNextStep(intent, entities) {
    const steps = {
      'search_products': entities.product_name ? 'DISPLAY_PRODUCTS' : 'ASK_PRODUCT_NAME',
      'search_doctors': entities.doctor_specialty ? 'DISPLAY_DOCTORS' : 'ASK_SPECIALTY',
      'place_order': entities.delivery_address ? 'CONFIRM_ORDER' : 'ASK_ADDRESS',
      'track_order': entities.order_id ? 'FETCH_ORDER_STATUS' : 'ASK_ORDER_ID',
      'book_appointment': entities.doctor_name ? 'FETCH_AVAILABILITY' : 'ASK_DOCTOR_NAME',
      'customer_support': 'CONNECT_AGENT',
      'payment': entities.order_id ? 'SHOW_PAYMENT_OPTIONS' : 'ASK_ORDER_ID'
    };
    return steps[intent] || 'UNKNOWN';
  }

  /**
   * Update conversation context
   */
  updateConversationContext(phoneNumber, data) {
    if (!this.conversationContext.has(phoneNumber)) {
      this.conversationContext.set(phoneNumber, []);
    }
    const history = this.conversationContext.get(phoneNumber);
    history.push(data);
    // Keep only last 10 messages
    if (history.length > 10) history.shift();
  }

  /**
   * Get conversation context
   */
  getConversationContext(phoneNumber) {
    return this.conversationContext.get(phoneNumber) || [];
  }

  /**
   * Clear conversation context for a user
   */
  clearConversationContext(phoneNumber) {
    this.conversationContext.delete(phoneNumber);
  }
}

// ============ EXPORTS ============

const nlpEngine = new AdvancedNLPEngine();

module.exports = {
  processUserInput: (message, phoneNumber, history) => nlpEngine.processUserInput(message, phoneNumber, history),
  extractEntities: (text) => nlpEngine.extractEntities(text),
  classifyIntent: (text, entities) => nlpEngine.classifyIntent(text, entities),
  detectLanguage: (text) => nlpEngine.detectLanguage(text),
  getNLPEngine: () => nlpEngine
};