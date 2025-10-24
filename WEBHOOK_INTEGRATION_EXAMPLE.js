/**
 * WEBHOOK INTEGRATION EXAMPLE
 * Shows how to integrate Advanced NLP + Voice Processing into your existing webhook
 * 
 * This is an EXAMPLE file showing the implementation pattern.
 * Adapt and integrate into your existing index.js
 */

// ============ IMPORTS ============

const express = require('express');
const { sendWhatsAppMessage, markMessageAsRead, getMediaInfo } = require('./config/whatsapp');

// New Advanced NLP & Voice Services
const { processUserInput, extractEntities } = require('./services/advancedNLP');
const { VoiceProcessor } = require('./services/voiceProcessor');

// ============ INITIALIZATION ============

const app = express();
app.use(express.json());

// Initialize Voice Processor
const voiceProcessor = new VoiceProcessor({
  provider: process.env.VOICE_PROVIDER || 'whisper'
});

// ============ MESSAGE PROCESSING HANDLERS ============

/**
 * Enhanced Text Message Handler
 * Uses Advanced NLP for better understanding
 */
async function handleTextMessage(userMessage, phoneNumber, messageId) {
  try {
    console.log(`[TEXT] Processing text from ${phoneNumber}: "${userMessage}"`);
    
    // Process through Advanced NLP
    const nlpResult = await processUserInput(userMessage, phoneNumber);
    
    console.log(`[NLP] Intent: ${nlpResult.intent}, Confidence: ${nlpResult.confidence}`);
    
    // Check if we have all required information
    if (!nlpResult.success) {
      return {
        text: 'Sorry, I encountered an error processing your message. Please try again.',
        action: 'ERROR',
        shouldReply: true
      };
    }
    
    // If missing required entities, ask for them
    if (nlpResult.requiresFollowUp) {
      return {
        text: nlpResult.message, // Already generated with missing field names
        action: 'ASK_FOR_INFO',
        shouldReply: true,
        missingFields: nlpResult.missingEntities
      };
    }
    
    // Route to appropriate handler based on intent
    const intentHandler = getIntentHandler(nlpResult.intent);
    const handlerResult = await intentHandler(nlpResult, userMessage, phoneNumber);
    
    return {
      text: handlerResult.text,
      action: nlpResult.actionRequired.action,
      shouldReply: true,
      entities: nlpResult.entities
    };
    
  } catch (error) {
    console.error('[TEXT ERROR]', error);
    return {
      text: 'Sorry, I encountered an error. Please try again later.',
      action: 'ERROR',
      shouldReply: true
    };
  }
}

/**
 * Enhanced Voice Message Handler
 * Transcribes voice to text, then processes through NLP
 */
async function handleVoiceMessage(voiceMessageObject, phoneNumber, messageId) {
  try {
    console.log(`[VOICE] Processing voice from ${phoneNumber}`);
    
    // Step 1: Transcribe voice to text
    const transcriptionResult = await voiceProcessor.processWhatsAppVoiceMessage(
      voiceMessageObject,
      phoneNumber
    );
    
    if (!transcriptionResult.success) {
      console.error('[VOICE ERROR]', transcriptionResult.error);
      return {
        text: `Sorry, I couldn't understand the voice message. Error: ${transcriptionResult.error}. Please try typing instead.`,
        action: 'VOICE_ERROR',
        shouldReply: true
      };
    }
    
    const transcribedText = transcriptionResult.text;
    console.log(`[TRANSCRIBED] "${transcribedText}"`);
    
    // Step 2: Send transcription confirmation
    const confirmText = `📝 I understood: "${transcribedText}"\n\nProcessing your request...`;
    await sendWhatsAppMessage(phoneNumber, confirmText);
    
    // Step 3: Process transcribed text through NLP
    return await handleTextMessage(transcribedText, phoneNumber, messageId);
    
  } catch (error) {
    console.error('[VOICE PROCESSING ERROR]', error);
    return {
      text: 'Sorry, I encountered an error processing your voice message. Please try typing instead.',
      action: 'VOICE_ERROR',
      shouldReply: true
    };
  }
}

/**
 * Intent-specific handlers
 */
async function handleSearchProductsIntent(nlpResult, originalMessage, phoneNumber) {
  const { entities } = nlpResult;
  
  if (!entities.product_name) {
    return {
      text: 'Please tell me which product you are looking for.'
    };
  }
  
  // Example: Call your existing product search function
  // const products = await searchProducts(entities.product_name);
  
  return {
    text: `🔍 Searching for "${entities.product_name}"${entities.quantity ? ` (quantity: ${entities.quantity})` : ''}...`
  };
}

async function handleSearchDoctorsIntent(nlpResult, originalMessage, phoneNumber) {
  const { entities } = nlpResult;
  
  if (!entities.doctor_specialty) {
    return {
      text: 'What type of doctor are you looking for? (e.g., cardiologist, pediatrician)'
    };
  }
  
  return {
    text: `👨‍⚕️ Finding ${entities.doctor_specialty}s for you...`
  };
}

async function handlePlaceOrderIntent(nlpResult, originalMessage, phoneNumber) {
  const { entities } = nlpResult;
  
  if (!entities.delivery_address) {
    return {
      text: 'Please provide your delivery address.'
    };
  }
  
  return {
    text: `✅ Placing order for delivery to: ${entities.delivery_address}`
  };
}

async function handleTrackOrderIntent(nlpResult, originalMessage, phoneNumber) {
  const { entities } = nlpResult;
  
  if (!entities.order_id) {
    return {
      text: 'Please provide your order ID (e.g., rx-12345 or drugsng-abc-123)'
    };
  }
  
  return {
    text: `📦 Tracking order: ${entities.order_id}...`
  };
}

async function handleBookAppointmentIntent(nlpResult, originalMessage, phoneNumber) {
  const { entities } = nlpResult;
  
  if (!entities.doctor_specialty && !entities.doctor_name) {
    return {
      text: 'Which doctor would you like to book an appointment with?'
    };
  }
  
  if (!entities.preferred_date) {
    return {
      text: 'What date would you prefer?'
    };
  }
  
  return {
    text: `📅 Booking appointment for you...`
  };
}

async function handlePaymentIntent(nlpResult, originalMessage, phoneNumber) {
  const { entities } = nlpResult;
  
  if (!entities.order_id) {
    return {
      text: 'Please provide your order ID for payment.'
    };
  }
  
  return {
    text: `💳 Processing payment for order: ${entities.order_id}...`
  };
}

async function handleCustomerSupportIntent(nlpResult, originalMessage, phoneNumber) {
  const { entities } = nlpResult;
  
  return {
    text: `📞 Connecting you to our support team...`
  };
}

/**
 * Router to get intent-specific handler
 */
function getIntentHandler(intent) {
  const handlers = {
    'search_products': handleSearchProductsIntent,
    'search_doctors': handleSearchDoctorsIntent,
    'place_order': handlePlaceOrderIntent,
    'track_order': handleTrackOrderIntent,
    'book_appointment': handleBookAppointmentIntent,
    'payment': handlePaymentIntent,
    'customer_support': handleCustomerSupportIntent
  };
  
  return handlers[intent] || (async (nlp, msg, phone) => ({
    text: 'I understood your request and will process it now.'
  }));
}

// ============ MAIN WEBHOOK ENDPOINT ============

/**
 * Main webhook endpoint
 * Replace or enhance your existing webhook handler with this
 */
app.post('/webhook', async (req, res) => {
  try {
    // Verify webhook token
    const webhookToken = req.get('Authorization')?.split('Bearer ')[1];
    if (webhookToken !== process.env.WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const entry = req.body.entry?.[0];
    if (!entry) return res.status(200).json({ success: true });
    
    const change = entry.changes?.[0];
    if (!change) return res.status(200).json({ success: true });
    
    const messageData = change.value;
    if (!messageData.messages?.[0]) return res.status(200).json({ success: true });
    
    const messageObject = messageData.messages[0];
    const contact = messageData.contacts?.[0];
    const phoneNumber = contact?.wa_id;
    
    if (!phoneNumber) {
      console.warn('No phone number in message');
      return res.status(200).json({ success: true });
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 New message from ${phoneNumber}`);
    console.log(`Message Type: ${messageObject.type}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Mark message as read
    await markMessageAsRead(messageObject.id);
    
    let result = { shouldReply: false, text: '' };
    
    // Route based on message type
    switch (messageObject.type) {
      case 'text':
        result = await handleTextMessage(
          messageObject.text.body,
          phoneNumber,
          messageObject.id
        );
        break;
        
      case 'audio':
        result = await handleVoiceMessage(
          messageObject,
          phoneNumber,
          messageObject.id
        );
        break;
        
      case 'image':
        // Handle image (e.g., prescription upload)
        result = {
          text: 'Image received. Processing...',
          action: 'PROCESS_IMAGE',
          shouldReply: true
        };
        break;
        
      case 'document':
        // Handle document
        result = {
          text: 'Document received. Processing...',
          action: 'PROCESS_DOCUMENT',
          shouldReply: true
        };
        break;
        
      case 'interactive':
        // Handle buttons/menus
        result = {
          text: 'Button pressed. Processing...',
          action: 'PROCESS_INTERACTIVE',
          shouldReply: false
        };
        break;
        
      default:
        console.warn(`Unknown message type: ${messageObject.type}`);
        result = {
          text: `Sorry, I don't support ${messageObject.type} messages yet.`,
          shouldReply: true
        };
    }
    
    // Send response
    if (result.shouldReply && result.text) {
      console.log(`📤 Sending response to ${phoneNumber}:`);
      console.log(`   "${result.text}"\n`);
      
      await sendWhatsAppMessage(phoneNumber, result.text);
    }
    
    // Log result
    console.log(`✅ Message processed. Action: ${result.action}`);
    
    res.status(200).json({
      success: true,
      action: result.action,
      entities: result.entities
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ WEBHOOK VERIFICATION ============

app.get('/webhook', (req, res) => {
  const challenge = req.query['hub.challenge'];
  const token = req.query['hub.verify_token'];
  
  if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Unauthorized');
  }
});

// ============ UTILITY ENDPOINTS ============

/**
 * Test NLP endpoint
 * POST http://localhost:3000/api/test/nlp
 * Body: { "message": "I want to buy paracetamol 2 quantity" }
 */
app.post('/api/test/nlp', async (req, res) => {
  try {
    const { message } = req.body;
    const phoneNumber = '+2348012345678'; // Test phone
    
    const result = await processUserInput(message, phoneNumber);
    
    res.json({
      input: message,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test voice transcription endpoint
 * POST http://localhost:3000/api/test/voice
 * Body: FormData with file (audio file)
 */
app.post('/api/test/voice', async (req, res) => {
  try {
    const { file } = req.files;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    // Transcribe file
    const tempPath = `/tmp/${file.name}`;
    await file.mv(tempPath);
    
    const text = await voiceProcessor.transcribeAudio(tempPath, 'en');
    
    res.json({
      transcribed: text,
      provider: voiceProcessor.provider
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check endpoint
 * GET http://localhost:3000/api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    nlpEnabled: true,
    voiceEnabled: true,
    voiceProvider: voiceProcessor.provider,
    timestamp: new Date()
  });
});

// ============ ERROR HANDLERS ============

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// ============ SERVER START ============

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Drugs.ng WhatsApp Bot with AI NLP      ║
║   Advanced NLP & Voice Processing        ║
╚══════════════════════════════════════════╝
  
  🚀 Server running on port ${PORT}
  
  📝 Webhook: http://localhost:${PORT}/webhook
  🎤 Voice Provider: ${voiceProcessor.provider}
  
  📊 Test Endpoints:
     • POST /api/test/nlp
     • POST /api/test/voice
     • GET /api/health
  
  📚 Full documentation in ADVANCED_NLP_INTEGRATION_GUIDE.md
  `);
});

module.exports = { app, voiceProcessor };