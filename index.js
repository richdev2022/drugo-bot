// Initialize environment and configuration first
const { getEnv } = require('./config/env');
const ENV = getEnv();

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { sequelize, initializeDatabase, Session } = require('./models');
const { sendWhatsAppMessage, markMessageAsRead, downloadMedia, isPermissionError, sendInteractiveMessage, sendListMessage, sendLocationRequestMessage, sendTypingIndicator, sendTypingStop } = require('./config/whatsapp');
const adminService = require('./services/admin');
const { processMessage, formatResponseWithOptions } = require('./services/nlp');
const { parseNavigationCommand, buildPaginatedListMessage } = require('./utils/pagination');
const {
  registerUser,
  loginUser,
  listAllProductsPaginated,
  searchProducts,
  addToCart,
  placeOrder,
  trackOrder,
  searchDoctors,
  searchDoctorsPaginated,
  bookAppointment
} = require('./services/drugsng');
const { processFlutterwavePayment, processPaystackPayment, verifyPayment } = require('./services/payment');
const { encryptData, decryptData, generateToken } = require('./services/security');
const { handleApiError, handleDbError, handleValidationError, createErrorResponse, createSuccessResponse } = require('./utils/errorHandler');
const { checkRateLimit } = require('./utils/rateLimiter');
const { isValidRegistrationData, isValidLoginData, sanitizeInput, normalizePhoneNumber } = require('./utils/validation');
const { parseOrderIdFromText, isValidOrderId } = require('./utils/orderParser');
const {
  notifySupportTeams,
  notifySupportTeam,
  startSupportChat,
  sendSupportMessage,
  endSupportChat,
  getUnreadSupportMessages
} = require('./services/support');
const { uploadSingleFile, validateUploadedFile, getFileMetadata } = require('./utils/uploadHandler');
const {
  uploadProductImage,
  updateProductImage,
  getProductImageUrl
} = require('./services/healthcareProducts');
const { uploadAndSavePrescription, savePrescription, extractPrescriptionFromBuffer } = require('./services/prescription');
const {
  uploadDoctorImage,
  updateDoctorImage,
  getDoctorImageUrl,
  getDoctorsWithImages
} = require('./services/doctorImages');

const { uploadImage } = require('./services/cloudinary');

// --- New AI/Voice Services ---
// Note: These are placeholders. You need to implement the actual services.
const { processUserInput } = require('./services/advancedNLP'); // Assuming this is your new advanced NLP
const { VoiceProcessor } = require('./services/voiceProcessor');

const app = express();
const PORT = ENV.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Voice Processor
const voiceProcessor = new VoiceProcessor({
  provider: process.env.VOICE_PROVIDER || 'whisper' // or your preferred provider
});

// Swagger / OpenAPI documentation setup (optional dependencies)
let swaggerSpec = null;
try {
  swaggerSpec = require('./config/swagger');
} catch (err) {
  console.warn('Swagger spec not found or failed to load:', err.message);
}

try {
  const swaggerUi = require('swagger-ui-express');
  if (swaggerSpec) {
    app.use('/api/docs/swagger.json', (req, res) => res.json(swaggerSpec));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
    console.log('��� Swagger UI mounted at /api/docs');
  }
} catch (err) {
  console.warn('swagger-ui-express not installed. To enable docs install swagger-ui-express.');
}

// Serve a lightweight Swagger UI page using CDN as a fallback when swagger-ui-express is not installed
if (swaggerSpec) {
  app.get('/api/docs', (req, res) => {
    const swaggerJsonUrl = '/api/docs/swagger.json';
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Drugs.ng API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@4/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function() {
        const ui = SwaggerUIBundle({
          url: '${swaggerJsonUrl}',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout'
        });
        window.ui = ui;
      };
    </script>
    <div style="position:fixed;right:12px;bottom:12px;z-index:9999">
      <a href="/api/docs/postman" style="display:inline-block;padding:8px 12px;background:#0b74de;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Download Postman Collection</a>
    </div>
  </body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });
}

// Postman collection download endpoint (converts OpenAPI to Postman v2.1 if converter is available)
app.get('/api/docs/postman', async (req, res) => {
  try {
    if (!swaggerSpec) return res.status(404).json({ success: false, message: 'Swagger spec not available' });
    const converter = (() => {
      try { return require('openapi-to-postmanv2'); } catch (e) { return null; }
    })();

    if (!converter) {
      // Fallback: return OpenAPI JSON for manual conversion
      res.setHeader('Content-Disposition', 'attachment; filename="openapi.json"');
      return res.json(swaggerSpec);
    }

    // Use converter to convert to Postman collection
    const openapi = swaggerSpec;
    converter.convert({ type: 'json', data: openapi }, {}, (err, conversionResult) => {
      if (err || !conversionResult) {
        console.error('OpenAPI -> Postman conversion failed:', err || conversionResult);
        return res.status(500).json({ success: false, message: 'Conversion failed' });
      }
      if (!conversionResult.result || conversionResult.result.collection === undefined) {
        return res.status(500).json({ success: false, message: 'Conversion returned invalid result' });
      }
      const collection = conversionResult.output[0].data;
      res.setHeader('Content-Disposition', 'attachment; filename="postman_collection.json"');
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(collection, null, 2));
    });
  } catch (error) {
    console.error('Error generating Postman collection:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize database and then start server
async function startServer() {
  try {
    // Start server first
    app.listen(PORT, () => {
      console.log(`Drugs.ng WhatsApp Bot server running on port ${PORT}`);
      const webhookUrl = process.env.NODE_ENV === 'production' 
        ? 'https://drugs-ng-whatsapp-bot.vercel.app/webhook'
        : `http://localhost:${PORT}/webhook`;
      console.log(`Webhook endpoint: ${webhookUrl}`);
    });

    // Try to connect to database in the background with retries
    let retries = 5;
    let connected = false;
    
    while (retries > 0 && !connected) {
      try {
        await sequelize.authenticate();
        console.log('PostgreSQL connection established successfully.');
        connected = true;
        
        // Initialize database
        await initializeDatabase();
        console.log('Database initialized successfully.');
      } catch (dbError) {
        retries--;
        if (retries === 0) {
          console.warn('Database connection failed after multiple attempts - starting server in limited mode:', dbError.message);
          console.warn('Please configure database credentials to enable full functionality.');
        } else {
          console.log(`Database connection attempt failed. Retrying... (${retries} attempts left)`);
          // Wait for 2 seconds before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Admin auth middleware
const adminAuthMiddleware = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '') || null;
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const admin = await adminService.verifyAdminToken(token);
    if (!admin) return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ success: false, message: 'Auth failed' });
  }
};

// Admin endpoints
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await adminService.adminLogin(email, password);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/request-reset', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await adminService.requestAdminPasswordResetOTP(email);
    res.json(result);
  } catch (error) {
    console.error('Admin request reset error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/verify-reset', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await adminService.verifyAdminPasswordResetOTP(email, otp);
    res.json(result);
  } catch (error) {
    console.error('Admin verify reset error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const result = await adminService.completeAdminPasswordReset(email, otp, newPassword);
    res.json(result);
  } catch (error) {
    console.error('Admin reset password error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Admin endpoint to create/provide backup OTP for user registration
app.post('/api/admin/backup-otp', adminAuthMiddleware, async (req, res) => {
  try {
    const { email, action } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    if (action === 'create') {
      // Admin can create a new backup OTP for a user
      const { generateOTP, getOTPExpiry } = require('./utils/otp');
      const { OTP } = require('./models');

      const backupOtp = generateOTP();
      const expiresAt = getOTPExpiry();

      await OTP.create({
        email: email.toLowerCase(),
        code: backupOtp,
        purpose: 'registration',
        isBackupOTP: true,
        createdByAdmin: req.admin.id,
        expiresAt: expiresAt
      });

      return res.json({
        success: true,
        message: `Backup OTP created for ${email}`,
        otp: backupOtp,
        expiresAt: expiresAt,
        note: 'Share this OTP with the user via secure channel. Valid for 5 minutes.'
      });
    } else if (action === 'list') {
      // Admin can view pending OTPs for an email
      const { OTP } = require('./models');

      const otps = await OTP.findAll({
        where: {
          email: email.toLowerCase(),
          purpose: 'registration',
          isUsed: false
        },
        attributes: ['code', 'createdAt', 'expiresAt', 'isBackupOTP', 'createdByAdmin'],
        order: [['createdAt', 'DESC']],
        limit: 5
      });

      return res.json({
        success: true,
        email: email,
        pendingOTPs: otps,
        total: otps.length
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action. Use "create" or "list"' });
    }
  } catch (error) {
    console.error('Admin backup OTP error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Protected admin management routes (require adminAuthMiddleware)
app.post('/api/admin/staff', adminAuthMiddleware, async (req, res) => {
  try {
    const data = req.body;
    const result = await adminService.createStaff(data, req.admin);
    res.json(result);
  } catch (error) {
    console.error('Create staff error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Export endpoint must come before generic :table route
app.get('/api/admin/:table/export', adminAuthMiddleware, async (req, res) => {
  try {
    const table = req.params.table;
    const result = await adminService.exportTable(table, req.query, req.admin);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.payload);
  } catch (error) {
    console.error('Admin export table error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/:table', adminAuthMiddleware, async (req, res) => {
  try {
    const table = req.params.table;
    const result = await adminService.fetchTable(table, req.query, req.admin);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin fetch table error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/:table', adminAuthMiddleware, async (req, res) => {
  try {
    const table = req.params.table;
    const created = await adminService.addRecord(table, req.body, req.admin);
    res.json({ success: true, data: created });
  } catch (error) {
    console.error('Admin add record error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/:table/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const table = req.params.table;
    const id = req.params.id;
    const updated = await adminService.updateRecord(table, id, req.body, req.admin);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Admin update record error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/:table/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const table = req.params.table;
    const id = req.params.id;
    const result = await adminService.deleteRecord(table, id, req.admin);
    res.json(result);
  } catch (error) {
    console.error('Admin delete record error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});


// Root endpoint for status check
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Drugs.ng WhatsApp Bot API is running',
    version: '1.0.0',
    databaseConnected: sequelize.authenticate().then(() => true).catch(() => false)
  });
});

// WhatsApp webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// WhatsApp webhook handler
app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;

    // Check if this is a WhatsApp message
    if (data.object === 'whatsapp_business_account') {
      // Process each entry
      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            // Check if messages array exists before accessing
            if (!change.value.messages || change.value.messages.length === 0) {
              continue;
            }

            const message = change.value.messages[0];
            const contact = change.value.contacts?.[0];
            const phoneNumber = message.from || contact?.wa_id;
            const messageId = message.id;
            const messageType = message.type;

            console.log(`\n${'='.repeat(60)}`);
            console.log(`📨 New message from ${phoneNumber}`);
            console.log(`Message Type: ${messageType}`);
            console.log(`${'='.repeat(60)}\n`);

            // Mark message as read
            await markMessageAsRead(messageId);

            // Route to the correct handler based on message type
            switch (messageType) {
              case 'text':
                await handleTextMessage(message.text.body, phoneNumber, messageId);
                break;
              case 'audio':
                await handleVoiceMessage(message, phoneNumber, messageId);
                break;
              case 'image':
              case 'document':
                await handleMediaMessage(message, phoneNumber, messageId);
                break;
              case 'location':
                await handleLocationMessage(message, phoneNumber, messageId);
                break;
              case 'interactive':
                await handleInteractiveMessage(message, phoneNumber, messageId);
                break;
              default:
                console.warn(`Unknown message type: ${messageType}`);
                await sendWhatsAppMessage(phoneNumber, `Sorry, I don't support ${messageType} messages yet.`);
            }
          }
        }
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Webhook error:', error);
    // It's crucial to send a 200 OK to WhatsApp, otherwise they will keep retrying and might disable the webhook.
    // The error is logged for debugging.
    res.sendStatus(200);
  }
});

// Flutterwave payment webhook
app.post('/webhook/flutterwave', async (req, res) => {
  try {
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
    const signature = req.headers['verif-hash'];

    // Validate webhook signature
    if (!secretHash || !signature || signature !== secretHash) {
      console.warn('Invalid Flutterwave webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = req.body;

    // Validate payload
    if (!payload || typeof payload !== 'object') {
      console.warn('Invalid Flutterwave webhook payload');
      return res.status(400).json({ error: 'Invalid payload' });
    }

    if (payload.status === 'successful') {
      const txRef = payload.txRef || payload.tx_ref;
      let orderId = null;

      // Extract order ID from tx_ref format: drugsng-{orderId}-{timestamp}
      if (txRef && typeof txRef === 'string') {
        const parts = txRef.split('-');
        if (parts.length >= 2 && !isNaN(parts[1])) {
          orderId = parts[1];
        }
      }

      // Fallback to metadata if available
      if (!orderId && payload.meta && payload.meta.orderId) {
        orderId = payload.meta.orderId;
      }

      if (orderId) {
        try {
          // Update order status
          const order = await sequelize.models.Order.findByPk(orderId);
          if (order) {
            order.paymentStatus = 'Paid';
            order.paymentReference = payload.id || payload.transaction_id;
            order.status = 'Shipped'; // Update status to shipped after successful payment
            await order.save();

            // Notify customer
            const user = await sequelize.models.User.findByPk(order.userId);
            if (user) {
              await sendWhatsAppMessage(
                user.phoneNumber,
                `✅ Payment confirmed! Your order #${orderId} has been received and is being processed. You'll receive updates on delivery.`
              );
            }
          } else {
            console.warn(`Order not found for payment: ${orderId}`);
          }
        } catch (dbError) {
          console.error('Database error processing Flutterwave webhook:', dbError);
        }
      } else {
        console.warn('Could not extract order ID from Flutterwave webhook');
      }
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Flutterwave webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Paystack payment webhook
app.post('/webhook/paystack', async (req, res) => {
  try {
    const crypto = require('crypto');
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;

    // Validate webhook signature
    if (!paystackSecret) {
      console.warn('Paystack webhook secret not configured');
      return res.status(400).json({ error: 'Paystack not configured' });
    }

    const signature = req.headers['x-paystack-signature'];
    const hash = crypto.createHmac('sha512', paystackSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (!signature || hash !== signature) {
      console.warn('Invalid Paystack webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // Validate event
    if (!event || !event.event || !event.data) {
      console.warn('Invalid Paystack webhook payload');
      return res.status(400).json({ error: 'Invalid payload' });
    }

    if (event.event === 'charge.success') {
      const reference = event.data.reference;
      let orderId = null;

      // Try to get order ID from metadata first
      if (event.data.metadata && event.data.metadata.orderId) {
        orderId = event.data.metadata.orderId;
      } else if (reference && typeof reference === 'string') {
        // Fallback: Extract from reference format: drugsng-{orderId}-{timestamp}
        const parts = reference.split('-');
        if (parts.length >= 2 && !isNaN(parts[1])) {
          orderId = parts[1];
        }
      }

      if (orderId) {
        try {
          // Update order status
          const order = await sequelize.models.Order.findByPk(orderId);
          if (order) {
            order.paymentStatus = 'Paid';
            order.paymentReference = reference;
            order.status = 'Shipped'; // Update status to shipped after successful payment
            await order.save();

            // Notify customer
            const user = await sequelize.models.User.findByPk(order.userId);
            if (user) {
              await sendWhatsAppMessage(
                user.phoneNumber,
                `✅ Payment confirmed! Your order #${orderId} has been received and is being processed. You'll receive updates on delivery.`
              );
            }
          } else {
            console.warn(`Order not found for payment: ${orderId}`);
          }
        } catch (dbError) {
          console.error('Database error processing Paystack webhook:', dbError);
        }
      } else {
        console.warn('Could not extract order ID from Paystack webhook');
      }
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Healthcare Product Image Upload
app.post('/api/healthcare-products/upload-image', uploadSingleFile, async (req, res) => {
  try {
    const validation = validateUploadedFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const { productId, filename } = req.body;
    const metadata = getFileMetadata(req.file);

    // Upload image to Cloudinary
    const result = await uploadProductImage(req.file.buffer, productId, filename);

    res.json({
      success: true,
      message: 'Healthcare product image uploaded successfully',
      data: {
        url: result.url,
        publicId: result.publicId,
        fileSize: metadata.size,
        mimeType: metadata.mimeType
      }
    });
  } catch (error) {
    console.error('Healthcare product image upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload healthcare product image'
    });
  }
});

// Get Healthcare Product Image URL
app.get('/api/healthcare-products/:productId/image', async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required'
      });
    }

    const result = await getProductImageUrl(productId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get product image error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get product image'
    });
  }
});

// Update Healthcare Product Image
app.put('/api/healthcare-products/:productId/image', uploadSingleFile, async (req, res) => {
  try {
    const { productId } = req.params;
    const { filename } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required'
      });
    }

    const validation = validateUploadedFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const result = await updateProductImage(productId, req.file.buffer, filename);

    res.json({
      success: true,
      message: 'Product image updated successfully',
      data: {
        productId: result.productId,
        imageUrl: result.imageUrl
      }
    });
  } catch (error) {
    console.error('Update product image error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update product image'
    });
  }
});

// Prescription File Upload
app.post('/api/prescriptions/upload', uploadSingleFile, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const validation = validateUploadedFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const metadata = getFileMetadata(req.file);

    // Upload prescription to Cloudinary
    const result = await uploadAndSavePrescription(orderId, req.file.buffer, metadata.originalName);

    res.json({
      success: true,
      message: 'Prescription uploaded successfully',
      data: {
        prescriptionId: result.prescriptionId,
        fileUrl: result.fileUrl,
        verificationStatus: result.verificationStatus
      }
    });
  } catch (error) {
    console.error('Prescription upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload prescription'
    });
  }
});

// Doctor Profile Image Upload
app.post('/api/doctors/upload-image', uploadSingleFile, async (req, res) => {
  try {
    const { doctorId, filename } = req.body;

    const validation = validateUploadedFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const metadata = getFileMetadata(req.file);

    // Upload image to Cloudinary
    const result = await uploadDoctorImage(req.file.buffer, doctorId, filename);

    res.json({
      success: true,
      message: 'Doctor image uploaded successfully',
      data: {
        url: result.url,
        publicId: result.publicId,
        fileSize: metadata.size,
        mimeType: metadata.mimeType
      }
    });
  } catch (error) {
    console.error('Doctor image upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload doctor image'
    });
  }
});

// Get Doctor Profile Image
app.get('/api/doctors/:doctorId/image', async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        error: 'Doctor ID is required'
      });
    }

    const result = await getDoctorImageUrl(doctorId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get doctor image error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get doctor image'
    });
  }
});

// Update Doctor Profile Image
app.put('/api/doctors/:doctorId/image', uploadSingleFile, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { filename } = req.body;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        error: 'Doctor ID is required'
      });
    }

    const validation = validateUploadedFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const result = await updateDoctorImage(doctorId, req.file.buffer, filename);

    res.json({
      success: true,
      message: 'Doctor image updated successfully',
      data: {
        doctorId: result.doctorId,
        doctorName: result.doctorName,
        imageUrl: result.imageUrl
      }
    });
  } catch (error) {
    console.error('Update doctor image error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update doctor image'
    });
  }
});

// Get All Doctors with Images
app.get('/api/doctors/with-images', async (req, res) => {
  try {
    const { specialty, location, available } = req.query;

    const filters = {};
    if (specialty) filters.specialty = specialty;
    if (location) filters.location = location;
    if (available !== undefined) filters.available = available === 'true';

    const doctors = await getDoctorsWithImages(filters);

    res.json({
      success: true,
      count: doctors.length,
      data: doctors
    });
  } catch (error) {
    console.error('Get doctors with images error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get doctors'
    });
  }
});

// Payment callback page (for redirect after payment)
app.get('/payment/callback', async (req, res) => {
  try {
    const { status, tx_ref, transaction_id, reference } = req.query;

    // Validate parameters
    const isSuccess = status === 'successful' || status === 'success';
    const provider = tx_ref ? 'flutterwave' : 'paystack';
    const refId = tx_ref || transaction_id || reference || 'Unknown';

    // Log payment callback
    console.log(`Payment callback: status=${status}, provider=${provider}, reference=${refId}`);

    let htmlContent = '';
    if (isSuccess) {
      htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Successful</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f8ff; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #28a745; }
            .checkmark { font-size: 60px; }
            p { color: #666; line-height: 1.6; }
            .reference { background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 20px 0; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="checkmark">✅</div>
            <h1>Payment Successful!</h1>
            <p>Your payment has been confirmed. You will receive a confirmation message on WhatsApp shortly.</p>
            <div class="reference">
              <small>Reference: ${refId}</small>
            </div>
            <p><strong>You can close this page now.</strong></p>
          </div>
        </body>
        </html>
      `;
    } else {
      htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Failed</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #ffe8e8; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #dc3545; }
            .cross { font-size: 60px; }
            p { color: #666; line-height: 1.6; }
            .reference { background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 20px 0; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="cross">❌</div>
            <h1>Payment Failed</h1>
            <p>Your payment could not be processed. Please try again or contact our support team.</p>
            <div class="reference">
              <small>Reference: ${refId}</small>
            </div>
            <p><strong>You can close this page and return to WhatsApp.</strong></p>
          </div>
        </body>
        </html>
      `;
    }

    res.send(htmlContent);
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>⚠️ An Error Occurred</h1>
        <p>There was an issue processing your payment callback. Please contact support.</p>
      </body>
      </html>
    `);
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Drugs.ng WhatsApp Bot',
    version: '1.0.0',
    status: 'running',
    description: 'WhatsApp Bot for Drugs.ng Healthcare Services',
    endpoints: {
      webhook: '/webhook',
      health: '/health',
      paymentCallback: '/payment/callback',
      webhooks: {
        flutterwave: '/webhook/flutterwave',
        paystack: '/webhook/paystack'
      },
      imageUpload: {
        healthcare: {
          uploadProductImage: 'POST /api/healthcare-products/upload-image',
          getProductImage: 'GET /api/healthcare-products/:productId/image',
          updateProductImage: 'PUT /api/healthcare-products/:productId/image'
        },
        prescriptions: {
          uploadPrescription: 'POST /api/prescriptions/upload'
        },
        doctors: {
          uploadDoctorImage: 'POST /api/doctors/upload-image',
          getDoctorImage: 'GET /api/doctors/:doctorId/image',
          updateDoctorImage: 'PUT /api/doctors/:doctorId/image',
          getAllDoctorsWithImages: 'GET /api/doctors/with-images'
        }
      }
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Handle customer message
const handleCustomerMessage = async (phoneNumber, messageText) => {
  try {
    console.log(`\n🔄 [${phoneNumber}] Processing customer message: "${messageText}"`);

    // Check rate limit
    const rateLimitResult = await checkRateLimit(phoneNumber);
    if (!rateLimitResult.allowed) {
      console.log(`⚠️  Rate limit exceeded for ${phoneNumber}`);
      await sendWhatsAppMessage(phoneNumber, rateLimitResult.message);
      return;
    }

    // Get or create user session
    let session = await sequelize.models.Session.findOne({
      where: { phoneNumber }
    });

    if (!session) {
      console.log(`📝 Creating new session for ${phoneNumber}`);
      session = await sequelize.models.Session.create({
        phoneNumber,
        state: 'NEW',
        data: {},
        lastActivity: new Date()
      });
    } else {
      console.log(`📝 Found existing session for ${phoneNumber}, state: ${session.state}`);
      // Diagnostic logging for session data
      console.log(`   Session details:`);
      console.log(`   - token column: ${session.token ? '✓ Present' : '✗ Empty'}`);
      console.log(`   - data.token: ${session.data?.token ? '✓ Present' : '✗ Empty'}`);
      console.log(`   - userId: ${session.userId || 'empty'}`);
      console.log(`   - loginTime: ${session.loginTime || 'empty'}`);
      console.log(`   - lastActivity: ${session.lastActivity ? new Date(session.lastActivity).toISOString() : 'empty'}`);
    }

    // CRITICAL: Check for session expiry BEFORE updating lastActivity
    // This ensures we detect idle timeout properly
    const hadExpired = await handleSessionExpiry(phoneNumber, session);
    if (hadExpired) {
      // Session was expired and auto-logged out, reload fresh session
      session = await sequelize.models.Session.findOne({
        where: { phoneNumber }
      });
      console.log(`🔄 Reloaded session after expiry check`);
    }

    // Determine if user is authenticated
    const isLoggedIn = isAuthenticatedSession(session);

    // --- STRICT AUTHENTICATION GUARD ---
    // If user is not logged in, only allow login, register, or greeting intents.
    const nlpPreview = await processMessage(messageText, phoneNumber, session);
    if (!isLoggedIn && !['login', 'register', 'greeting', 'help'].includes(nlpPreview.intent)) {
        console.log(`[AUTH_GUARD] Blocked intent '${nlpPreview.intent}' for logged-out user.`);
        await sendAuthRequiredMessage(phoneNumber, `access the '${nlpPreview.intent.replace(/_/g, ' ')}' feature`);
        return;
    }

    // NOW update last activity to current time
    // This must happen AFTER expiry check so we properly detect idle
    session.lastActivity = new Date();
    session._lastActivityExplicitlySet = true; // Mark as explicitly set to prevent hook override
    // CRITICAL: No need to set data field - Sequelize will preserve it when we only update lastActivity
    await session.save();
    console.log(`⏰ Updated lastActivity to ${session.lastActivity.toISOString()}`);

    // If logged in, ensure token exists
    if (session.state === 'LOGGED_IN' && session.token) {
      console.log(`✓ Session has valid token`);
    }

    // Check if in support chat
  if (session.state === 'SUPPORT_CHAT') {
    console.log(`💬 ${phoneNumber} is in support chat`);

    // Allow user to close chat manually
    if (/^(close|exit|end chat|stop support)$/i.test(messageText.trim())) {
      await endSupportChat(phoneNumber);
      await sendWhatsAppMessage(phoneNumber, 'Exited support chat. You are now back with the bot. Type "help" to continue.');
      return;
    }

    try {
      await sendSupportMessage(phoneNumber, messageText, true);
    } catch (err) {
      console.error('Forward to support failed:', err.message);
      try {
        await endSupportChat(phoneNumber);
        await sendWhatsAppMessage(phoneNumber, 'Support chat is unavailable right now. You are back with the bot. Type "help" for options.');
      } catch (_) {}
    }
    return;
  }

  // Quick attach command for prescriptions: "rx 12345" or "attach 12345" or "link 12345"
  const attachMatch = messageText.trim().match(/^(?:rx|attach|link)\s+#?(\d+)/i);
  if (attachMatch) {
    const orderId = attachMatch[1];
    if (session.data && session.data.pendingPrescriptionUrl) {
      try {
        const result = await savePrescription(orderId, session.data.pendingPrescriptionUrl, session.data.pendingPrescriptionExtractedText || null);
        // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
        session.data = { ...session.data, pendingPrescriptionUrl: null, pendingPrescriptionExtractedText: null };
        await session.save();
        await sendWhatsAppMessage(phoneNumber, `✅ Prescription attached to order #${orderId}. Status: ${result.verificationStatus || 'Pending'}.`);
      } catch (err) {
        await sendWhatsAppMessage(phoneNumber, `❌ Could not attach to order #${orderId}: ${err.message}`);
      }
      return;
    } else {
      await sendWhatsAppMessage(phoneNumber, 'No prescription file is pending.\n\nPlease send an image or PDF of your prescription first. Supported types: JPG, PNG, WEBP, GIF, PDF.\n\nTip: Add a caption with your Order ID to auto-attach, e.g. rx 12345 (also accepts "order 12345" or "prescription 12345"). If you don’t know your Order ID, check your order confirmation message or type "support" for help.');
      return;
    }
  }

  // 🔴 CRITICAL: Reload session data EARLY to ensure we have latest state for all pagination checks
  // This is needed because session.data might be cached from earlier operations
  try {
    await session.reload({ where: { phoneNumber } });
    console.log(`🔄 Reloaded fresh session data. doctorSpecialtyPagination=${!!session.data.doctorSpecialtyPagination}, doctorPagination=${!!session.data.doctorPagination}, productPagination=${!!session.data.productPagination}, cartPagination=${!!session.data.cartPagination}`);
  } catch (e) {
    console.warn(`⚠️  Could not reload session data:`, e.message);
  }

  // Pagination navigation for products list
  if (session.data && session.data.productPagination) {
    const { currentPage, totalPages, pageSize } = session.data.productPagination;
    const targetPage = parseNavigationCommand(messageText, currentPage, totalPages);
    if (targetPage) {
      const pageData = await listAllProductsPaginated(targetPage, pageSize);
      // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
      session.data = { ...session.data, productPagination: { currentPage: pageData.page, totalPages: pageData.totalPages, pageSize: pageData.pageSize }, productPageItems: pageData.items };
      const isLoggedIn = isAuthenticatedSession(session);
      const msg = buildPaginatedListMessage(pageData.items, pageData.page, pageData.totalPages, '📦 Medicines', 'products', (product) => {
        let s = `${product.name}`;
        if (product.price) s += `\n   Price: ₦${product.price}`;
        if (product.category) s += `\n   Category: ${product.category}`;
        // if (product.imageUrl) s += `\n   Image: ${product.imageUrl}`; // Keep it clean for lists
        return s;
      });
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg, isLoggedIn));
      return;
    }
  }

  // Pagination navigation for specialties list
  if (session.data && session.data.doctorSpecialtyPagination) {
    const { currentPage, totalPages, pageSize } = session.data.doctorSpecialtyPagination;
    const targetPage = parseNavigationCommand(messageText, currentPage, totalPages);
    const isLoggedIn = isAuthenticatedSession(session);

    if (targetPage) {
      const start = (targetPage - 1) * pageSize;
      const items = DOCTOR_SPECIALTIES.slice(start, start + pageSize).map((s) => ({ name: s }));
      // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
      session.data = { ...session.data, doctorSpecialtyPagination: { currentPage: targetPage, totalPages, pageSize }, doctorSpecialtyPageItems: items };
      const msg = buildPaginatedListMessage(items, targetPage, totalPages, '🗂️ Doctor Specialties', 'doctor_specialties', (it) => it.name);
      await sendWhatsAppMessage(phoneNumber, msg + '\nType a number to choose a specialty.');
      return;
    }

    const selectMatch = messageText.trim().match(/^\d+$/);
    if (selectMatch) {
      const idx = parseInt(selectMatch[0], 10) - 1;
      const items = session.data.doctorSpecialtyPageItems || [];
      console.log(`🏥 Doctor specialty selection: user input=${selectMatch[0]}, idx=${idx}, items count=${items.length}`);
      
      if (idx >= 0 && idx < items.length && items[idx] && items[idx].name) {
        const specialty = items[idx].name;
        console.log(`✅ Specialty selected: ${specialty}`);
        
        // Clear specialty pagination state
        // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
        const newData = { ...session.data };
        delete newData.doctorSpecialtyPagination;
        delete newData.doctorSpecialtyPageItems;
        session.data = newData;
        await session.save();
        
        // Proceed to doctor search for chosen specialty
        const pageSize = 5;
        const location = 'Lagos';
        try {
          const pageData = await searchDoctorsPaginated(specialty, location, 1, pageSize);
          if (!pageData || !pageData.items || pageData.items.length === 0) {
            console.warn(`⚠️  No doctors found for specialty: ${specialty} in ${location}`);
            await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`Sorry, we couldn't find any ${specialty} in ${location}. Try another specialty.`, isLoggedIn));
            return;
          }
          
          // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
          session.data = { 
            ...session.data, 
            doctorPagination: { currentPage: pageData.page, totalPages: pageData.totalPages, pageSize: pageData.pageSize },
            doctorPageItems: pageData.items,
            doctorSearchResults: pageData.items,
            lastDoctorSearch: { specialty, location }
          };
          await session.save();
          
          const msg = buildPaginatedListMessage(pageData.items, pageData.page, pageData.totalPages, `Here are some ${specialty} doctors in ${location}:`, 'doctors', (doctor) => {
            let s = `Dr. ${doctor.name}`;
            if (doctor.specialty) s += `\n   Specialty: ${doctor.specialty}`;
            if (doctor.location) s += `\n   Location: ${doctor.location}`;
            if (doctor.rating) s += `\n   Rating: ${doctor.rating}/5`;
            return s;
          });
          await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg, isLoggedIn));
        } catch (err) {
          console.error(`❌ Error searching doctors for specialty ${specialty}:`, err.message);
          await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`Sorry, we encountered an error searching for ${specialty} doctors. Please try again.`, isLoggedIn));
        }
        return;
      } else {
        console.warn(`❌ Invalid specialty selection: idx=${idx}, items=[${items.map(i => i.name).join(', ')}]`);
        await sendWhatsAppMessage(phoneNumber, `Please select a valid specialty number between 1 and ${items.length}.`);
        return;
      }
    }
  }

  // Pagination navigation for doctors list
  if (session.data && session.data.doctorPagination) {
    const { currentPage, totalPages, pageSize } = session.data.doctorPagination;
    const targetPage = parseNavigationCommand(messageText, currentPage, totalPages);
    if (targetPage) {
      const lastSearch = session.data.lastDoctorSearch || {};
      const pageData = await searchDoctorsPaginated(lastSearch.specialty || '', lastSearch.location || '', targetPage, pageSize);
      // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
      session.data = {
        ...session.data,
        doctorPagination: {
          currentPage: pageData.page,
          totalPages: pageData.totalPages,
          pageSize: pageData.pageSize
        },
        doctorPageItems: pageData.items
      };
      await session.save();
      const isLoggedInNow = isAuthenticatedSession(session);
      const msg = buildPaginatedListMessage(pageData.items, pageData.page, pageData.totalPages, '👨‍⚕️ Doctors', 'doctors', (doctor) => {
        let s = `Dr. ${doctor.name}`;
        if (doctor.specialty) s += `\n   Specialty: ${doctor.specialty}`;
        if (doctor.location) s += `\n   Location: ${doctor.location}`;
        if (doctor.rating) s += `\n   Rating: ${doctor.rating}/5`;
        return s;
      });
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg, isLoggedInNow));
      return;
    }
  }

  // Pagination navigation for cart items
  if (session.data && session.data.cartPagination) {
    const { currentPage, totalPages, pageSize } = session.data.cartPagination;
    const targetPage = parseNavigationCommand(messageText, currentPage, totalPages);
    if (targetPage) {
      try {
        const userId = session.data.userId;
        const result = await require('./services/orderManagement').getCartPaginated(userId, { page: targetPage, pageSize });
        // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
        session.data = { ...session.data, cartPagination: { currentPage: result.pagination.currentPage, totalPages: result.pagination.totalPages, pageSize: result.pagination.pageSize } };
        await session.save();

        let msg = `🧺 Cart (Page ${result.pagination.currentPage}/${result.pagination.totalPages})\n\n`;
        result.items.forEach((item, idx) => {
          msg += `${idx + 1}. ${item.productName} x${item.quantity} — ₦${(item.subtotal).toLocaleString()}\n`;
        });
        msg += `\nTotal: ₦${(result.cartTotal).toLocaleString()}\n`;
        msg += `\n�� *Navigation:*${result.pagination.currentPage > 1 ? `\n• Type "Previous" to go to page ${result.pagination.currentPage - 1}` : ''}${result.pagination.currentPage < result.pagination.totalPages ? `\n• Type "Next" to go to page ${result.pagination.currentPage + 1}` : ''}`;
        msg += `\n• To checkout: type "checkout [address] [flutterwave|paystack|cash]"`;
        await sendWhatsAppMessage(phoneNumber, msg);
        return;
      } catch (err) {
        console.error('Cart pagination error:', err);
      }
    }
  }

  // Check if waiting for OTP verification during registration
  // This must bypass NLP to prevent dynamic OTP codes from being misinterpreted
  if (session.state === 'REGISTERING' || (session.data && session.data.waitingForOTPVerification)) {
    const otpMatch = messageText.trim().match(/^\d{4}$/);
    const resendMatch = messageText.toLowerCase().trim().match(/^(resend|retry|send again)$/);

    if (otpMatch) {
      console.log(`🔐 Processing OTP verification with code: ${otpMatch[0]}`);
      await handleRegistrationOTPVerification(phoneNumber, session, otpMatch[0]);
      return;
    } else if (resendMatch) {
      console.log(`🔄 Processing OTP resend request`);
      await handleResendOTP(phoneNumber, session);
      return;
    } else if (session.state === 'REGISTERING' && session.data && session.data.waitingForOTPVerification) {
      // User is in REGISTERING state but entered invalid input
      await sendWhatsAppMessage(phoneNumber, "❌ Please enter your 4-digit OTP code. If you need to resend the OTP, type 'resend'.");
      return;
    }
  }

  // Process with NLP
  console.log(`🤖 Processing with NLP...`);
  const nlpResult = await processMessage(messageText, phoneNumber, session);
  const { intent, parameters, fulfillmentText } = nlpResult;
  console.log(`✨ NLP Result: intent="${intent}", source="${nlpResult.source}", confidence=${nlpResult.confidence}`);

  // --- STRICT AUTHENTICATION GUARD (Corrected Position) ---
  // If user is not logged in, only allow login, register, or greeting intents.
  const allowedLoggedOutIntents = ['login', 'register', 'greeting', 'help'];
  if (!isLoggedIn && !allowedLoggedOutIntents.includes(intent)) {
      console.log(`[AUTH_GUARD] Blocked intent '${intent}' for logged-out user.`);
      await sendAuthRequiredMessage(phoneNumber, `access the '${intent.replace(/_/g, ' ')}' feature`);
      return;
  }

  // Handle different intents
    console.log(`🎯 Handling intent: ${intent}`);
    switch (intent) {
      case 'greeting':
        await handleGreeting(phoneNumber, session);
        break;

      case 'register':
        console.log(`📝 Handling registration`);
        await handleRegistration(phoneNumber, session, parameters);
        break;

      case 'login':
        console.log(`🔐 Handling login`);
        await handleLogin(phoneNumber, session, parameters);
        break;

      case 'logout':
        console.log(`🔒 Handling logout`);
        await handleLogout(phoneNumber, session);
        break;

      case 'search_products':
        console.log(`🔍 Handling product search`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'search for products');
        } else {
          await handleProductSearch(phoneNumber, session, parameters);
        }
        break;

      case 'add_to_cart':
        console.log(`🛒 Handling add to cart`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'add items to your cart');
        } else {
          await handleAddToCart(phoneNumber, session, parameters);
        }
        break;

      case 'view_cart':
        console.log(`🧺 Handling view cart`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'view your cart');
        } else {
          await handleViewCart(phoneNumber, session, parameters);
        }
        break;

      case 'place_order':
        console.log(`📦 Handling place order`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'place an order');
        } else {
          await handlePlaceOrder(phoneNumber, session, parameters);
        }
        break;

      case 'prescription_upload':
        console.log(`📄 Handling prescription upload prompt`);
        await sendWhatsAppMessage(phoneNumber, 'Please upload your prescription document (image or PDF) by sending it as an attachment. You can caption it with your Order ID, e.g., rx 12345.');
        break;

      case 'track_order':
        console.log(`📍 Handling track order`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'track an order');
        } else {
          await handleTrackOrder(phoneNumber, session, parameters);
        }
        break;

      case 'search_doctors':
        console.log(`👨‍⚕️ Handling doctor search`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'search for doctors');
        } else {
          await handleDoctorSearch(phoneNumber, session, parameters);
        }
        break;

      case 'book_appointment':
        console.log(`📅 Handling book appointment`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'book an appointment');
        } else {
          await handleBookAppointment(phoneNumber, session, parameters);
        }
        break;

      case 'payment':
        console.log(`💳 Handling payment`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'make a payment');
        } else {
          await handlePayment(phoneNumber, session, parameters);
        }
        break;

      case 'help':
        console.log(`ℹ️  Sending help message`);
        await handleHelp(phoneNumber, isLoggedIn);
        break;

      case 'support':
        console.log(`🆘 Handling support request`);
        await handleSupportRequest(phoneNumber, session, parameters);
        break;

      case 'diagnostic_tests':
        console.log(`🔬 Handling diagnostic tests search`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'search for diagnostic tests');
        } else {
          await handleDiagnosticTestSearch(phoneNumber, session, parameters);
        }
        break;

      case 'healthcare_products':
        console.log(`🛒 Handling healthcare products browse`);
        if (!isLoggedIn) {
          await sendAuthRequiredMessage(phoneNumber, 'browse healthcare products');
        } else {
          await handleHealthcareProductBrowse(phoneNumber, session, parameters);
        }
        break;

      default:
        console.log(`❓ Unknown intent, sending fallback response`);
        await sendInteractiveMessage(phoneNumber, fulfillmentText || "I'm not sure how to help with that. Type 'help' for menu.", getStandardButtons(isLoggedIn));
    }
    console.log(`✅ Successfully processed message from ${phoneNumber}\n`);
  } catch (error) {
    console.error(`❌ Error processing customer message from ${phoneNumber}:`, error.message);
    try {
      await sendWhatsAppMessage(phoneNumber, "Sorry, something went wrong. Please try again later.");
    } catch (sendError) {
      console.error(`❌ Failed to send error message to ${phoneNumber}:`, sendError.message);
    }
  }
};

// Handle support team message
const handleSupportTeamMessage = async (supportPhoneNumber, messageText) => {
  try {
    // Get support team
    const supportTeam = await sequelize.models.SupportTeam.findOne({
      where: { phoneNumber: supportPhoneNumber }
    });
    
    if (!supportTeam) {
      console.error('Support team not found for phone number:', supportPhoneNumber);
      return;
    }
    
    // Check if this is a command
    if (messageText.startsWith('/')) {
      await handleSupportCommand(supportTeam, messageText);
      return;
    }
    
    // Get active chat with customer
    const activeChat = await sequelize.models.SupportChat.findOne({
      where: {
        supportTeamId: supportTeam.id,
        isFromCustomer: false,
        isRead: false
      },
      order: [['timestamp', 'DESC']]
    });
    
    if (!activeChat) {
      await sendWhatsAppMessage(supportTeam.phoneNumber, "No active chat found. Please wait for a customer to initiate a chat.");
      return;
    }
    
    // Forward message to customer
    await sendSupportMessage(activeChat.customerPhoneNumber, messageText, false);
  } catch (error) {
    console.error('Error processing support team message:', error);
    await sendWhatsAppMessage(supportTeam.phoneNumber, "Sorry, something went wrong. Please try again later.");
  }
};

// Handle support team commands
const handleSupportCommand = async (supportTeam, commandText) => {
  try {
    const command = commandText.substring(1).trim().toLowerCase();
    
    switch (command) {
      case 'chats':
        // Get unread messages
        const unreadMessages = await getUnreadSupportMessages(supportTeam.id);
        
        if (unreadMessages.length === 0) {
          await sendWhatsAppMessage(supportTeam.phoneNumber, "No unread messages.");
          return;
        }
        
        let message = `You have ${unreadMessages.length} unread messages:\n\n`;
        unreadMessages.forEach(msg => {
          message += `👤 ${msg.customerPhoneNumber}: ${msg.message}\n\n`;
        });
        
        await sendWhatsAppMessage(supportTeam.phoneNumber, message);
        break;
        
      case 'end':
        // End the most recent chat
        const recentChat = await sequelize.models.SupportChat.findOne({
          where: {
            supportTeamId: supportTeam.id,
            isFromCustomer: true
          },
          order: [['timestamp', 'DESC']]
        });
        
        if (!recentChat) {
          await sendWhatsAppMessage(supportTeam.phoneNumber, "No active chat found.");
          return;
        }
        
        await endSupportChat(recentChat.customerPhoneNumber);
        break;
        
      default:
        await sendWhatsAppMessage(supportTeam.phoneNumber, "Unknown command. Available commands: /chats, /end");
    }
  } catch (error) {
    console.error('Error handling support command:', error);
    await sendWhatsAppMessage(supportTeam.phoneNumber, "Sorry, something went wrong. Please try again later.");
  }
};

// Send authentication required message
// Helper to check if a session is authenticated using token validity AND idle timeout
const isAuthenticatedSession = (session) => {
  try {
    if (!session) {
      console.log(`✗ Session check failed: session is null`);
      return false;
    }
    
    // Must have token (check both dedicated column and data object for backward compatibility)
    const tokenInColumn = !!session.token;
    const tokenInData = !!(session.data && session.data.token);
    const hasToken = tokenInColumn || tokenInData;
    
    if (!hasToken) {
      console.log(`✗ [${session.phoneNumber}] Session check FAILED: NO TOKEN`);
      console.log(`  - token column: ${session.token || 'empty'}`);
      console.log(`  - data.token: ${session.data?.token || 'empty'}`);
      return false;
    }
    
    if (session.state !== 'LOGGED_IN') {
      console.log(`✗ [${session.phoneNumber}] Session check FAILED: state is "${session.state}" (not LOGGED_IN)`);
      return false;
    }
    
    // Check if session has been idle for more than configured timeout (default 20 minutes)
    const SESSION_IDLE_TIMEOUT_MINUTES = parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '20', 10);
    const SESSION_IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
    
    const lastActivity = session.lastActivity ? new Date(session.lastActivity).getTime() : null;
    
    if (!lastActivity) {
      console.log(`✗ [${session.phoneNumber}] Session check FAILED: no lastActivity timestamp`);
      return false;
    }
    
    const now = new Date().getTime();
    const idleTime = now - lastActivity;
    
    if (idleTime > SESSION_IDLE_TIMEOUT_MS) {
      const idleMinutes = Math.round(idleTime / 60000);
      console.log(`⏱️  [${session.phoneNumber}] Session EXPIRED: Idle for ${idleMinutes}m (timeout: ${SESSION_IDLE_TIMEOUT_MINUTES}m)`);
      return false;
    }
    
    // Session is valid and active
    const idleSeconds = Math.round(idleTime / 1000);
    const tokenSource = tokenInColumn ? 'database column' : 'data.token';
    console.log(`✓ [${session.phoneNumber}] Session VALID - Token in ${tokenSource}, state=LOGGED_IN, idle=${idleSeconds}s`);
    return true;
  } catch (e) {
    console.error('❌ Error checking session validity:', e);
    return false;
  }
};

// Helper to auto-invalidate session if idle, and send notification
const handleSessionExpiry = async (phoneNumber, session) => {
  try {
    if (!session) {
      console.log(`[${phoneNumber}] No session to check for expiry`);
      return false;
    }
    
    // Check token source for debugging
    const hasTokenInColumn = !!session.token;
    const hasTokenInData = !!(session.data && session.data.token);
    const tokenSource = hasTokenInColumn ? 'database column' : hasTokenInData ? 'data.token' : 'NO TOKEN';
    
    console.log(`🔍 Checking expiry for [${phoneNumber}]: state=${session.state}, token_source=${tokenSource}`);
    console.log(`   lastActivity=${session.lastActivity ? new Date(session.lastActivity).toISOString() : 'NULL'}`);
    
    // If session is still valid, return early - no expiry needed
    if (isAuthenticatedSession(session)) {
      console.log(`✓ Session still valid, skipping expiry`);
      return false;
    }
    
    // Session failed validation - but only invalidate if it was logged in
    // We don't want to invalidate NEW sessions that never had a token
    if (session.state === 'LOGGED_IN' || hasTokenInColumn || hasTokenInData) {
      console.log(`🔒 Auto-invalidating expired session for [${phoneNumber}]`);
      console.log(`   Previous: state=${session.state}, token_source=${tokenSource}`);
      
      // Clear all session data
      session.state = 'NEW';
      session.token = null;
      session.userId = null;
      session.loginTime = null;
      session.data = {};
      session._lastActivityExplicitlySet = true;
      await session.save();
      
      console.log(`   ✓ Session reset to NEW state`);
      
      // Send expiry message
      const expiredMessage = `⏱️ *Session Expired*\n\nYour session has been idle for more than 20 minutes and has been closed for security.\n\nTo continue, please login again:\nExample: login john@example.com mypassword`;
      await sendWhatsAppMessage(phoneNumber, expiredMessage);
      return true;
    } else {
      console.log(`ℹ️  Session not in expirable state (state=${session.state}, no token), skipping reset`);
      return false;
    }
  } catch (err) {
    console.error('❌ Error handling session expiry:', err);
  }
  return false;
};

const sendAuthRequiredMessage = async (phoneNumber, feature = 'this feature') => {
  const bodyText = `🔐 *Authentication Required*\n\nYou need to be logged in to ${feature}.`;
  const buttons = [{ id: 'show_login_prompt', title: '🔒 Login' }, { id: 'show_register_prompt', title: '📝 Register' }, { id: 'show_help_menu', title: '📋 Main Menu' }];
  await sendInteractiveMessage(phoneNumber, bodyText, buttons);
};
// Handle logout
const handleLogout = async (phoneNumber, session) => {
  console.log(`���� Handling logout for ${phoneNumber}`);
  try {
    session.state = 'NEW';
    session.token = null;
    session.userId = null;
    session.loginTime = null;
    session.data = {};
    session.changed('token', true);
    session.changed('userId', true);
    session.changed('loginTime', true);
    await session.save();

    await sendTypingIndicator(phoneNumber);
    const bodyText = "👋 *See you soon!* 🌟\n\nYou have been logged out successfully. Your data is safe with us.\n\n💭 *What would you like to do?*";
    const buttons = [
      { id: 'show_login_prompt', title: '🔐 Login Again' },
      { id: 'show_register_prompt', title: '✍️ Create Account' },
      { id: 'show_help_menu', title: '📋 Main Menu' }
    ];
    await sendInteractiveMessage(phoneNumber, bodyText, buttons);
    await sendTypingStop(phoneNumber);
  } catch (error) {
    console.error('Error during logout:', error);
    await sendTypingStop(phoneNumber);
    await sendWhatsAppMessage(phoneNumber, "❌ Sorry, there was an error logging you out. Please try again or contact support.");
  }
};

// Handle greeting
const handleGreeting = async (phoneNumber, session) => {
  console.log(`👋 Handling greeting for ${phoneNumber}, session state: ${session.state}`);
  await sendTypingIndicator(phoneNumber);
  
  if (isAuthenticatedSession(session)) {
    console.log(`📤 Sending returning user welcome`);
    await handleHelp(phoneNumber, true);
  } else {
    const bodyText = "👋 *Welcome to Drugs.ng!* 🏥\n\nI'm *Drugo*, your AI-powered health assistant. I'm here to help you:\n\n💊 Shop medicines & health products\n👨‍⚕️ Find & book doctor appointments\n🔬 Schedule lab tests\n📦 Track your orders\n💬 Chat with our support team\n\n✨ *Ready to get started?*";
    const buttons = [
        { id: 'show_login_prompt', title: '🔐 Login' },
        { id: 'show_register_prompt', title: '✍️ Register' },
    ]
    console.log(`📤 Sending new user greeting with interactive buttons.`);
    await sendInteractiveMessage(phoneNumber, bodyText, buttons);
  }
  await sendTypingStop(phoneNumber);
};

// Handle registration
const handleRegistration = async (phoneNumber, session, parameters) => {
  if (session.state === 'NEW' || session.state === 'REGISTERING' || session.state === 'LOGGING_IN') {
    // If we have all required parameters (name, email, password)
    if (parameters.name && parameters.email && parameters.password) {
      const userData = {
        name: sanitizeInput(parameters.name).replace(/\b\w/g, l => l.toUpperCase()), // Capitalize name
        email: sanitizeInput(parameters.email).toLowerCase(),
        password: sanitizeInput(parameters.password),
        phoneNumber: normalizePhoneNumber(phoneNumber)
      };

      // Validate input
      const validation = isValidRegistrationData(userData);
      if (!validation.valid) {
        await sendWhatsAppMessage(phoneNumber, `❌ Registration failed: ${validation.error}`);
        return;
      }

      // Check if email already exists
      try {
        const existingUser = await sequelize.models.User.findOne({
          where: { email: userData.email }
        });

        if (existingUser) {
          await sendInteractiveMessage(phoneNumber, `❌ This email is already registered.`, [{ id: 'show_login_prompt', title: '🔒 Login Instead' }]);
          return;
        }
      } catch (error) {
        console.error('Error checking existing user:', error);
      }

      // NOTE: Do NOT store full user data in session yet. Only store temporary registration data.
      // The user will only be created after successful OTP verification.
      session.state = 'REGISTERING';
      session.data.registrationData = userData;
      session.data.userId = null;
      session.data.token = null;
      await session.save();

      // Request OTP to be sent to email
      try {
        const { generateOTP, getOTPExpiry } = require('./utils/otp');
        const { OTP } = require('./models');

        // Generate and save OTP
        const otp = generateOTP();
        const expiresAt = getOTPExpiry();

        const { encryptData } = require('./services/security');
        const encryptedRegistration = (() => {
          try {
            return encryptData({ name: userData.name, email: userData.email, password: userData.password, phoneNumber: userData.phoneNumber }).encryptedData;
          } catch (e) {
            console.warn('Failed to encrypt registration snapshot for OTP meta:', e.message);
            return null;
          }
        })();

        await OTP.create({
          email: userData.email,
          code: otp,
          purpose: 'registration',
          expiresAt: expiresAt,
          meta: encryptedRegistration ? { registrationData: encryptedRegistration } : null
        });

        // Try to send OTP email
        let emailSent = true;
        const { sendOTPEmail } = require('./config/brevo');
        try {
          await sendOTPEmail(userData.email, otp, userData.name);
          await sendWhatsAppMessage(phoneNumber, `✅ An OTP has been sent to *${userData.email}*.\n\nPlease reply with the 4-digit code to complete your registration. The code is valid for 5 minutes.`);
        } catch (emailError) {
          emailSent = false;
          console.error('Error sending OTP email via Brevo:', emailError);
          await sendWhatsAppMessage(phoneNumber, `⚠️ We couldn't send an OTP to your email right now. Please contact support by typing "support" to get a backup code.`);
        }

        // Store that we're waiting for OTP verification (even if email send failed)
        session.data.waitingForOTPVerification = true;
        session.data.registrationAttempts = (session.data.registrationAttempts || 0) + 1;
        session.data.emailSendFailed = !emailSent;
        await session.save();

      } catch (error) {
        console.error('Error in OTP generation/verification setup:', error);
        await sendWhatsAppMessage(phoneNumber, `❌ We couldn't process your registration right now. Please try again later.`);
        session.data.registrationData = null;
        session.data.waitingForOTPVerification = false;
        await session.save();
      }
    } else {
      // Request missing parameters
      let message = "📝 To get started, please provide your details in a single message.\n\n";
      message += "Example: `register John Doe john@example.com MyPassword123`\n\n";
      message += "We need your:\n";
      if (!parameters.name) message += "• Full Name\n";
      if (!parameters.email) message += "• Email Address\n";
      if (!parameters.password) message += "• A secure password (at least 6 characters)\n";
      await sendWhatsAppMessage(phoneNumber, message);
    }
  } else {
    await sendTypingIndicator(phoneNumber);
    const bodyText = "✅ *Already Logged In!* 🎉\n\nYou have an active session. No need to register again.\n\n💡 What would you like to do next?";
    const buttons = [
      { id: 'show_help_menu', title: '📋 Main Menu' },
      { id: 'show_logout_prompt', title: '🔐 Logout' }
    ];
    await sendInteractiveMessage(phoneNumber, bodyText, buttons);
    await sendTypingStop(phoneNumber);
  }
};

// Handle login
const handleLogin = async (phoneNumber, session, parameters) => {
  if (session.state === 'NEW' || session.state === 'LOGGING_IN' || session.state === 'REGISTERING') {
    session.state = 'LOGGING_IN';
    await session.save();

    // If we have all required parameters
    if (parameters.email && parameters.password) {
      try {
        const credentials = {
          email: sanitizeInput(parameters.email).toLowerCase(),
          password: sanitizeInput(parameters.password)
        };

        // Validate credentials
        const validation = isValidLoginData(credentials);
        if (!validation.valid) {
          await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`❌ Login failed: ${validation.error}`, false));
          return;
        }

        // Login user
        const result = await loginUser(credentials);

        // Generate or use provided token
        const sessionToken = result.token || generateToken();
        console.log(`🔐 Generated session token for login: ${sessionToken.substring(0, 10)}...`);

        // Update session with proper token storage
        session.state = 'LOGGED_IN';
        session.token = sessionToken;  // Store in dedicated token column
        session.userId = result.userId;  // Store user reference
        session.loginTime = new Date();  // Track login time
        session.lastActivity = new Date();  // Reset activity timer
        session._lastActivityExplicitlySet = true; // Mark to prevent hook override
        session.data = Object.assign(session.data || {}, {
          userId: result.userId,
          token: sessionToken  // Also keep in data for compatibility
        });
        
        // Explicitly tell Sequelize about the changes
        session.changed('token', true);
        session.changed('userId', true);
        session.changed('loginTime', true);
        session.changed('data', true);
        session.changed('state', true);
        session.changed('lastActivity', true);
        
        console.log(`📝 BEFORE SAVE: state=LOGGED_IN, token=${sessionToken.substring(0, 10)}..., userId=${result.userId}, lastActivity=${session.lastActivity.toISOString()}`);
        await session.save();
        console.log(`💾 Session saved to database`);
        
        // CRITICAL: Verify token was actually persisted in the database
        const verifySession = await sequelize.models.Session.findOne({ where: { phoneNumber } });
        if (!verifySession) {
          throw new Error('❌ CRITICAL: Session disappeared after save!');
        }
        
        const tokenInColumn = !!verifySession.token;
        const tokenInData = !!(verifySession.data && verifySession.data.token);
        const verifyToken = verifySession.token || (verifySession.data && verifySession.data.token);
        
        console.log(`✅ Verification from DB:`);
        console.log(`   - token column: ${tokenInColumn ? '✓ Present' : '✗ Missing'} ${verifySession.token ? `(${verifySession.token.substring(0, 10)}...)` : ''}`);
        console.log(`   - data.token: ${tokenInData ? '✓ Present' : '✗ Missing'} ${verifySession.data?.token ? `(${verifySession.data.token.substring(0, 10)}...)` : ''}`);
        console.log(`   - state: ${verifySession.state}`);
        console.log(`   - userId: ${verifySession.userId}`);
        
        // If token is missing after save, try again
        if (!verifyToken) {
          console.warn(`⚠️  WARNING: Token not persisted in DB! Attempting retry...`);
          verifySession.token = sessionToken;
          verifySession.data = Object.assign(verifySession.data || {}, { token: sessionToken });
          verifySession.changed('token', true);
          verifySession.changed('data', true);
          await verifySession.save();
          console.log(`🔄 Retried token save`);
          
          // Verify again
          const retrySession = await sequelize.models.Session.findOne({ where: { phoneNumber } });
          const retryToken = retrySession.token || (retrySession.data && retrySession.data.token);
          console.log(`🔄 After retry - token in DB: ${retryToken ? '✓ YES' : '✗ NO'}`);
        }

        await sendTypingIndicator(phoneNumber);
        const bodyText = "🎉 *Welcome back!* 👋\n\n✅ You've successfully logged in.\n\n🚀 You can now:\n💊 Browse & buy medicines\n👨‍⚕️ Find & book doctors\n🔬 Schedule lab tests\n📦 Track orders\n💬 Chat with support\n\n📋 Ready to explore? Select an option below:";
        const buttons = [
          { id: 'show_help_menu', title: '📋 Main Menu' },
          { id: 'search_products', title: '💊 Browse Medicines' }
        ];
        await sendInteractiveMessage(phoneNumber, bodyText, buttons);
        await sendTypingStop(phoneNumber);
      } catch (error) {
        console.error('Login error:', error);
        const errorMessage = handleApiError(error, 'login').message;
        await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`❌ Login failed: ${errorMessage}`, false));
      }
    } else {
      // Request missing parameters
      let message = "🔐 To log in, please send your credentials in one message.\n\n";
      message += "Example: `login john@example.com mypassword`\n\n";
      message += "📧 Your email and password are required.";
      if (!parameters.email) message += "• Email address\n";
      if (!parameters.password) message += "• Password\n";

      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(message, false));
    }
  } else {
    await sendTypingIndicator(phoneNumber);
    const bodyText = "🔑 *Already Logged In!* ✨\n\nYou already have an active session.\n\n🚀 Ready to explore?\n✓ Browse medicines\n✓ Book appointments\n✓ Track orders\n✓ Chat support";
    const buttons = [
      { id: 'show_help_menu', title: '📋 Main Menu' },
      { id: 'search_products', title: '💊 Shop Now' }
    ];
    await sendInteractiveMessage(phoneNumber, bodyText, buttons);
    await sendTypingStop(phoneNumber);
  }
};

// Handle product search
const handleProductSearch = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);

    // If no specific query, list all medicines with pagination first
    if (!parameters.product) {
      const pageSize = 5;
      const pageData = await listAllProductsPaginated(1, pageSize);
      // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
      session.data = { ...session.data, productPagination: { currentPage: pageData.page, totalPages: pageData.totalPages, pageSize: pageData.pageSize }, productPageItems: pageData.items };
      await session.save();

      console.log(`✅ Saved product list (no search) to session for ${phoneNumber}:`);
      console.log(`   - productPageItems: ${pageData.items.length} items`);
      console.log(`   - Session data keys: ${Object.keys(session.data).join(', ')}`);

      const msg = buildPaginatedListMessage(pageData.items, pageData.page, pageData.totalPages, '📦 Medicines', (p) => `${p.name}\n   Price: ₦${p.price}`);
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg, isLoggedIn));
      return;
    }

    const products = await searchProducts(parameters.product);

    if (products.length === 0) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`Sorry, we couldn't find any products matching "${parameters.product}". Please try a different search term.`, isLoggedIn));
      return;
    }

    let message = `Here are some products matching "${parameters.product}":\n\n`;

    const pageSize = 5;
    const paginatedResults = products.slice(0, pageSize);
    paginatedResults.forEach((product, index) => {
      message += `${index + 1}. ${product.name}\n`;
      message += `   Price: ₦${product.price}\n`;
      message += `   Category: ${product.category}\n`;
      if (product.imageUrl) message += `   Image: ${product.imageUrl}\n`;
      message += `\n`;
    });

    message += `To add a product to your cart, reply with "add [product number] [quantity]"\nExample: "add 1 2" to add 2 units of the first product.`;

    // Save search results and pagination state for Next/Previous support
    // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
    session.data = { ...session.data, searchResults: paginatedResults, productPagination: { currentPage: 1, totalPages: Math.max(1, Math.ceil(products.length / pageSize)), pageSize: pageSize }, productPageItems: paginatedResults };
    await session.save();

    console.log(`✅ Saved product search to session for ${phoneNumber}:`);
    console.log(`   - productPageItems: ${paginatedResults.length} items`);
    console.log(`   - searchResults: ${paginatedResults.length} items`);
    console.log(`   - Session data keys: ${Object.keys(session.data).join(', ')}`);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(message, isLoggedIn));
  } catch (error) {
    console.error('Error searching products:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Sorry, we encountered an error while searching for products. Please try again later.", isAuthenticatedSession(session)));
  }
};

// Handle add to cart
const handleAddToCart = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);

    // Ensure session has latest data and userId
    try {
      await session.reload();
    } catch (reloadError) {
      console.warn(`⚠️ Session reload failed for ${phoneNumber}:`, reloadError.message);
    }
    
    const userIdFromSession = session.data && session.data.userId;
    if (!userIdFromSession) {
      await sendAuthRequiredMessage(phoneNumber, 'add items to your cart');
      return;
    }

    if (!parameters.productIndex || !parameters.quantity) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Please specify which product and quantity to add. Example: 'add 1 2' to add 2 units of the first product from your list.", isLoggedIn));
      return;
    }

    const productIndex = parseInt(parameters.productIndex, 10) - 1;
    const quantity = parseInt(parameters.quantity, 10);

    console.log(`📦 Available product lists in session.data for ${phoneNumber}:`);
    console.log(`   - searchResults: ${session.data.searchResults ? session.data.searchResults.length : 0} items`);
    console.log(`   - productPageItems: ${session.data.productPageItems ? session.data.productPageItems.length : 0} items`);
    console.log(`   - healthcareProductPageItems: ${session.data.healthcareProductPageItems ? session.data.healthcareProductPageItems.length : 0} items`);
    console.log(`   - Requested product index: ${productIndex + 1} (zero-indexed: ${productIndex})`);

    const candidates = (session.data.searchResults || [])
      .concat(session.data.productPageItems || [])
      .concat(session.data.healthcareProductPageItems || []);

    console.log(`   - Total candidates available: ${candidates.length}`);

    if (!candidates[productIndex]) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Please list products first (e.g., 'search medicines' or 'browse health products'), then use 'add [number] [qty]'.", isLoggedIn));
      return;
    }

    const product = candidates[productIndex];
    await addToCart(session.data.userId, product.id, quantity);

    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`Added ${quantity} units of ${product.name} to your cart. Type 'cart' to view your cart or 'checkout [address] [flutterwave|paystack|cash]' to place your order.`, isLoggedIn));
  } catch (error) {
    console.error('Error adding to cart:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Sorry, we encountered an error while adding to your cart. Please try again later.", isAuthenticatedSession(session)));
  }
};

// Handle place order
const handlePlaceOrder = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);

    try {
      await session.reload();
    } catch (_) {}
    const userIdFromSession = session.data && session.data.userId;
    if (!userIdFromSession) {
      await sendAuthRequiredMessage(phoneNumber, 'place an order');
      return;
    }

    // Step 1: Collect Address via Location Sharing if not present
    if (!parameters.address) {
      let message = "📦 To place your order, send address and payment method:\n";
      message += "Example: 'order 123 Main St, Lagos Flutterwave'\n\n";
      message += "Payment methods:\n";
      message += "• Flutterwave\n";
      message += "• Paystack\n";
      message += "• Cash on Delivery\n";
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(message, isLoggedIn));
      return;
    }

    const orderData = {
      address: sanitizeInput(parameters.address),
      paymentMethod: sanitizeInput(parameters.paymentMethod)
    };

    // Validate order data
    const { isValidOrderData } = require('./utils/validation');
    if (!isValidOrderData(orderData)) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ Invalid delivery address or payment method. Please try again.", isLoggedIn));
      return;
    }

    const result = await placeOrder(session.data.userId, orderData);

    // Notify support team
    await notifySupportTeam(phoneNumber, 'orders', 'New Order Placed', {
      orderId: result.orderId,
      paymentMethod: orderData.paymentMethod,
      amount: result.totalAmount || 'TBD'
    });

    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`✅ Your order has been placed successfully!\n\nOrder ID: #${result.orderId}`, isLoggedIn));

    // Generate payment link if online payment is selected
    const validPaymentMethods = ['Flutterwave', 'Paystack'];
    if (validPaymentMethods.some(method => orderData.paymentMethod.toLowerCase().includes(method.toLowerCase()))) {
      try {
        const user = await sequelize.models.User.findByPk(session.data.userId);
        const order = await sequelize.models.Order.findByPk(result.orderId);

        if (user && order && order.totalAmount > 0) {
          const paymentDetails = {
            amount: order.totalAmount,
            email: user.email,
            phoneNumber: normalizePhoneNumber(user.phoneNumber),
            name: user.name,
            orderId: order.id
          };

          let paymentResponse;
          try {
            if (orderData.paymentMethod.toLowerCase().includes('flutterwave')) {
              paymentResponse = await processFlutterwavePayment(paymentDetails);
              if (paymentResponse.status === 'success' && paymentResponse.data.link) {
                await sendWhatsAppMessage(phoneNumber, `💳 Complete your payment:\n${paymentResponse.data.link}\n\nAmount: ₦${order.totalAmount.toLocaleString()}`);
              }
            } else if (orderData.paymentMethod.toLowerCase().includes('paystack')) {
              paymentResponse = await processPaystackPayment(paymentDetails);
              if (paymentResponse.status === 'success' && paymentResponse.data.authorization_url) {
                await sendWhatsAppMessage(phoneNumber, `💳 Complete your payment:\n${paymentResponse.data.authorization_url}\n\nAmount: ₦${order.totalAmount.toLocaleString()}`);
              }
            }
          } catch (paymentError) {
            console.error('Payment link generation error:', paymentError);
            await sendWhatsAppMessage(phoneNumber, `⚠️  Payment link generation failed. You can pay later or contact support.\nOrder ID: #${result.orderId}`);
          }
        } else {
          await sendWhatsAppMessage(phoneNumber, `Your order is ready. Payment method: ${orderData.paymentMethod}`);
        }
      } catch (error) {
        console.error('Payment handling error:', error);
        await sendWhatsAppMessage(phoneNumber, `Order placed but payment link could not be generated. Contact support with Order ID: #${result.orderId}`);
      }
    } else if (orderData.paymentMethod.toLowerCase().includes('cash')) {
      await sendWhatsAppMessage(phoneNumber, `💵 You've selected Cash on Delivery.\n\nPlease have the exact amount ready when your order arrives. You'll receive delivery updates shortly.`);
    }
  } catch (error) {
    console.error('Error placing order:', error);
    const errorMessage = handleApiError(error, 'place_order').message;
    await sendWhatsAppMessage(phoneNumber, `❌ Failed to place order: ${errorMessage}`);
  }
};

// Handle view cart
const { getCartPaginated } = require('./services/orderManagement');

const handleViewCart = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);
    try { await session.reload(); } catch (_) {}
    const userId = session.data && session.data.userId;
    if (!userId) { await sendAuthRequiredMessage(phoneNumber, 'view your cart'); return; }

    const result = await getCartPaginated(userId, { page: 1, pageSize: 5 });
    if (!result.success) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions('Sorry, could not fetch your cart right now.', isLoggedIn));
      return;
    }
    if (result.empty) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions('Your cart is empty. Browse products and add items with "add [number] [qty]".', isLoggedIn));
      return;
    }

    // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
    session.data = { ...session.data, cartPagination: { currentPage: result.pagination.currentPage, totalPages: result.pagination.totalPages, pageSize: result.pagination.pageSize } };
    await session.save();

    let msg = `🧺 Cart (Page ${result.pagination.currentPage}/${result.pagination.totalPages})\n\n`;
    result.items.forEach((item, idx) => {
      msg += `${idx + 1}. ${item.productName} x${item.quantity} — ₦${(item.subtotal).toLocaleString()}\n`;
    });
    msg += `\nTotal: ₦${(result.cartTotal).toLocaleString()}\n`;
    msg += `\n📍 *Navigation:*${result.pagination.currentPage > 1 ? `\n• Type "Previous" to go to page ${result.pagination.currentPage - 1}` : ''}${result.pagination.currentPage < result.pagination.totalPages ? `\n• Type "Next" to go to page ${result.pagination.currentPage + 1}` : ''}`;
    msg += `\n• To checkout: type "checkout [address] [flutterwave|paystack|cash]"`;
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg, isLoggedIn));
  } catch (error) {
    console.error('Error viewing cart:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions('Sorry, we encountered an error while fetching your cart.', isAuthenticatedSession(session)));
  }
};

// Handle track order
const handleTrackOrder = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);

    if (!parameters.orderId) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("📍 To track your order, provide the order ID.\n\nExample: 'track 12345'", isLoggedIn));
      return;
    }

    // Parse and validate order id
    const rawInput = parameters.orderId || '';
    const parsed = parseOrderIdFromText(rawInput) || rawInput;
    const orderId = sanitizeInput(parsed);

    if (!isValidOrderId(orderId)) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ The order ID you provided doesn't look valid. Please provide a numeric Order ID (e.g., 12345) or a reference like 'drugsng-12345-...'.\n\nExample: track 12345", isLoggedIn));
      return;
    }

    const orderDetails = await trackOrder(orderId);

    if (!orderDetails) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`❌ Order #${orderId} not found. Please verify the order ID.`, isLoggedIn));
      return;
    }

    const statusEmoji = {
      'Processing': '⏳',
      'Shipped': '🚚',
      'Delivered': '✅',
      'Cancelled': '❌'
    };

    let message = `${statusEmoji[orderDetails.status] || '📦'} *Order #${orderDetails.id} Status*\n\n`;
    message += `Status: ${orderDetails.status}\n`;
    message += `Placed: ${new Date(orderDetails.orderDate).toLocaleDateString()}\n`;
    message += `Amount: ₦${orderDetails.totalAmount?.toLocaleString() || '0'}\n`;
    message += `Payment: ${orderDetails.paymentStatus}\n\n`;

    message += `*Items:*\n`;
    if (orderDetails.items && orderDetails.items.length > 0) {
      orderDetails.items.forEach(item => {
        message += `• ${item.name} x${item.quantity} = ₦${(item.price * item.quantity).toLocaleString()}\n`;
      });
    } else {
      message += `• No items found\n`;
    }

    message += `\n*Delivery Address:*\n${orderDetails.shippingAddress || 'Not provided'}\n\n`;
    message += `Need help? Type 'support' to chat with our team.`;

    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(message, isLoggedIn));
  } catch (error) {
    console.error('Error tracking order:', error);
    const errorMessage = handleApiError(error, 'track_order').message;
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`❌ ${errorMessage}`, isAuthenticatedSession(session)));
  }
};

// Doctor specialties seed
const DOCTOR_SPECIALTIES = [
  'Cardiologist', 'Pediatrician', 'Dermatologist', 'Gynecologist', 'General Practitioner',
  'Neurologist', 'Orthopedic', 'Ophthalmologist', 'Pulmonologist', 'Gastroenterologist',
  'Urologist', 'Psychiatrist'
];

// Handle doctor search
const handleDoctorSearch = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);

    if (!parameters.specialty) {
      // Show paginated specialties list
      const pageSize = 6;
      const page = 1;
      const totalPages = Math.max(1, Math.ceil(DOCTOR_SPECIALTIES.length / pageSize));
      const items = DOCTOR_SPECIALTIES.slice(0, pageSize).map((s) => ({ name: s }));
      // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
      session.data = { ...session.data, doctorSpecialtyPagination: { currentPage: page, totalPages, pageSize }, doctorSpecialtyPageItems: items };
      await session.save();

      const msg = buildPaginatedListMessage(items, page, totalPages, '🗂️ Doctor Specialties', (it) => it.name);
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg + '\nType a number to choose a specialty.', isLoggedIn));
      return;
    }

    const pageSize = 5;
    const location = parameters.location || 'Lagos';
    const pageData = await searchDoctorsPaginated(parameters.specialty, location, 1, pageSize);

    if (!pageData.items || pageData.items.length === 0) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`Sorry, we couldn't find any ${parameters.specialty} in ${location}. Please try a different specialty or location.`, isLoggedIn));
      return;
    }

    // Save pagination and last search
    // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
    session.data = { 
      ...session.data, 
      doctorPagination: { currentPage: pageData.page, totalPages: pageData.totalPages, pageSize: pageData.pageSize },
      doctorPageItems: pageData.items,
      doctorSearchResults: pageData.items,
      lastDoctorSearch: { specialty: parameters.specialty, location }
    };
    await session.save();

    const msg = buildPaginatedListMessage(pageData.items, pageData.page, pageData.totalPages, `Here are some ${parameters.specialty} doctors in ${location}:`, (doctor) => {
      let s = `Dr. ${doctor.name}`;
      if (doctor.specialty) s += `\n   Specialty: ${doctor.specialty}`;
      if (doctor.location) s += `\n   Location: ${doctor.location}`;
      if (doctor.rating) s += `\n   Rating: ${doctor.rating}/5`;
      return s;
    });

    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg, isLoggedIn));
  } catch (error) {
    console.error('Error searching doctors:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Sorry, we encountered an error while searching for doctors. Please try again later.", isAuthenticatedSession(session)));
  }
};
// Handle book appointment
const handleBookAppointment = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);

    try {
      await session.reload();
    } catch (_) {}
    const userIdFromSession = session.data && session.data.userId;
    if (!userIdFromSession) {
      await sendAuthRequiredMessage(phoneNumber, 'book an appointment');
      return;
    }

    if (!parameters.doctorIndex || !parameters.date || !parameters.time) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Please specify which doctor, date, and time for your appointment. Example: 'book 1 2023-06-15 14:00' to book the first doctor on June 15th at 2 PM.", isLoggedIn));
      return;
    }

    const doctorIndex = parseInt(parameters.doctorIndex) - 1;
    const dateTime = new Date(`${parameters.date}T${parameters.time}`);

    const doctorList = (session.data.doctorPageItems || session.data.doctorSearchResults || []);
    if (!doctorList[doctorIndex]) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Please search for doctors first before booking an appointment.", isLoggedIn));
      return;
    }
    const doctor = doctorList[doctorIndex];
    const result = await bookAppointment(session.data.userId, doctor.id, dateTime);

    // Notify support team
    await notifySupportTeam(phoneNumber, 'medical', 'New Appointment Booked', {
      doctorName: doctor.name,
      dateTime: dateTime.toISOString()
    });

    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`Your appointment with Dr. ${doctor.name} has been scheduled for ${dateTime.toLocaleString()}. Appointment ID: ${result.appointmentId}. You will receive a confirmation shortly.`, isLoggedIn));
  } catch (error) {
    console.error('Error booking appointment:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Sorry, we encountered an error while booking your appointment. Please try again later.", isAuthenticatedSession(session)));
  }
};
// Handle payment
const handlePayment = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);

    try {
      await session.reload();
    } catch (_) {}
    const userIdFromSession = session.data && session.data.userId;
    if (!userIdFromSession) {
      await sendAuthRequiredMessage(phoneNumber, 'make a payment');
      return;
    }

    if (!parameters.orderId || !parameters.provider) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Please provide your order ID and payment provider. Example: 'pay 12345 flutterwave'", isLoggedIn));
      return;
    }

    let result;
    const paymentDetails = {
      amount: 0,
      email: '',
      orderId: parameters.orderId
    };

    // Get order details to populate payment info
    try {
      const orderDetails = await trackOrder(parameters.orderId);
      paymentDetails.amount = orderDetails.totalAmount;

      // Get user email
      const user = await sequelize.models.User.findByPk(session.data.userId);
      paymentDetails.email = user.email;
    } catch (error) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Sorry, we couldn't find that order. Please check the order ID and try again.", isLoggedIn));
      return;
    }

    if (parameters.provider.toLowerCase() === 'flutterwave') {
      result = await processFlutterwavePayment(paymentDetails);
      const paymentMsg = formatResponseWithOptions(`Please complete your payment using this link: ${result.data.link}`, isLoggedIn);
      await sendWhatsAppMessage(phoneNumber, paymentMsg);
    } else if (parameters.provider.toLowerCase() === 'paystack') {
      result = await processPaystackPayment(paymentDetails);
      const paymentMsg = formatResponseWithOptions(`Please complete your payment using this link: ${result.data.authorization_url}`, isLoggedIn);
      await sendWhatsAppMessage(phoneNumber, paymentMsg);
    } else {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Sorry, we only support Flutterwave and Paystack for online payments.", isLoggedIn));
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Sorry, we encountered an error while processing your payment. Please try again later.", isAuthenticatedSession(session)));
  }
};
// Handle help
const handleHelp = async (phoneNumber, isLoggedIn) => {
  await sendTypingIndicator(phoneNumber);
  const bodyText = `🏥 *Drugs.ng - Your Health Hub* 💊\n\n👋 Welcome back! I'm *Drugo*, your AI health assistant.\n\n✨ *You can:*\n🗣️ Type your request naturally\n🎤 Record a voice note\n📋 Browse the menu below\n\n🚀 *I'm here to help with:*\n💊 Medicines & products\n👨‍⚕️ Doctor consultations\n🔬 Lab tests\n📦 Order tracking\n💬 Support\n\n*What can I help you with today?*`;
  const buttonText = "View Menu";
  
  const accountRows = [
    { id: "support", title: "💬 Contact Support", description: "Chat with a human agent" }
  ];

  if (isLoggedIn) {
    accountRows.push({ id: "logout", title: "🔒 Logout", description: "End your current session" });
  }
  
  const sections = [
    {
      title: "Shop & Orders",
      rows: [
        { id: "search_products", title: "💊 Search Medicines", description: "Find and buy medicines" },
        { id: "healthcare_products", title: "🛒 Browse Health Products", description: "Shop for devices, supplements, etc." },
        { id: "view_cart", title: "🛒 View Cart", description: "Check items in your cart" },
        { id: "track_order", title: "📍 Track My Order", description: "Get the status of your delivery" },
        { id: "prescription_upload", title: "📄 Upload Prescription", description: "Send a prescription file" }
      ]
    },
    {
      title: "Health Services",
      rows: [
        { id: "search_doctors", title: "👨‍⚕️ Find a Doctor", description: "Search for a specialist" },
        { id: "book_appointment", title: "📅 Book Appointment", description: "Schedule a consultation" },
        { id: "diagnostic_tests", title: "🔬 Book a Lab Test", description: "Schedule a diagnostic test" }
      ]
    },
    { title: "Account & Support", rows: accountRows }
  ];

  await sendListMessage(phoneNumber, bodyText, buttonText, sections);
};

// Handle support request
const handleSupportRequest = async (phoneNumber, session, parameters) => {
  try {
    const isLoggedIn = isAuthenticatedSession(session);
    const supportRole = parameters.supportType || 'general';
    await startSupportChat(phoneNumber, supportRole);

    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`You've been connected to our ${supportRole} support team. Please describe your issue and a support agent will assist you shortly.`, isLoggedIn));
  } catch (error) {
    console.error('Error starting support chat:', error);
    // Revert session state on failure
    try {
      session.state = 'LOGGED_IN';
      session.supportTeamId = null;
      await session.save();
    } catch (_) { }
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("Support is currently unavailable. You are back with the bot. Type 'help' for menu.", isAuthenticatedSession(session)));
  }
};

// Handle resend OTP
const handleResendOTP = async (phoneNumber, session) => {
  try {
    // Reload session to ensure we have the latest data
    const freshSession = await sequelize.models.Session.findOne({
      where: { phoneNumber }
    });

    let registrationData = (freshSession && freshSession.data && freshSession.data.registrationData) || (session.data && session.data.registrationData);

    if (!registrationData || !registrationData.email) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ No active registration found. Please start over by typing 'register'.", false));
      if (freshSession) {
        freshSession.data.waitingForOTPVerification = false;
        freshSession.data.registrationData = null;
        await freshSession.save();
      }
      return;
    }

    // Update session reference to use fresh session for subsequent saves
    session = freshSession || session;

    const { OTP } = require('./models');
    const { generateOTP, getOTPExpiry } = require('./utils/otp');
    const { sendOTPEmail } = require('./config/brevo');

    // Generate a new OTP
    const newOtp = generateOTP();
    const expiresAt = getOTPExpiry();

    // Mark old OTPs as used so they can't be reused
    await OTP.update(
      { isUsed: true },
      {
        where: {
          email: registrationData.email,
          purpose: 'registration',
          isUsed: false
        }
      }
    );

    // Create new OTP record
    const { encryptData } = require('./services/security');
    const encryptedRegistration = (() => {
      try {
        return encryptData({ name: registrationData.name, email: registrationData.email, password: registrationData.password, phoneNumber: registrationData.phoneNumber }).encryptedData;
      } catch (e) {
        console.warn('Failed to encrypt registration snapshot for OTP meta (resend):', e.message);
        return null;
      }
    })();

    await OTP.create({
      email: registrationData.email,
      code: newOtp,
      purpose: 'registration',
      expiresAt: expiresAt,
      meta: encryptedRegistration ? { registrationData: encryptedRegistration } : null
    });

    // Try to send the new OTP via email
    try {
      await sendOTPEmail(registrationData.email, newOtp, registrationData.name);
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`✅ A new OTP has been sent to ${registrationData.email}. Please reply with the 4-digit code. It's valid for 5 minutes.`, false));

      // Reset attempt counter and mark as waiting for OTP
      session.data.waitingForOTPVerification = true;
      session.data.registrationAttempts = 0;
      session.data.emailSendFailed = false;
      await session.save();
    } catch (emailError) {
      console.error('Error sending resend OTP email:', emailError);
      const fallbackMsg = `⚠️ **Email service temporarily unavailable.**\n\n✅ **You can still continue:**\n1️ A new OTP code has been generated and saved\n2️⃣ Contact our support team to get your backup OTP code\n3️⃣ Reply with your 4-digit code when you have it\n\nNeed help? Type 'support' to reach our team.`;
      await sendWhatsAppMessage(phoneNumber, fallbackMsg);

      session.data.waitingForOTPVerification = true;
      session.data.emailSendFailed = true;
      await session.save();
    }
  } catch (error) {
    console.error('Error resending OTP:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ Error resending OTP. Please try again or type 'support' for help.", false));
  }
};

// Handle registration OTP verification
const handleRegistrationOTPVerification = async (phoneNumber, session, otpCode) => {
  try {
    const { OTP } = require('./models');
    const otp = (otpCode || '').trim();

    // Verify OTP format - must be exactly 4 digits
  if (!/^\d{4}$/.test(otp)) {
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ Invalid OTP format. Please enter exactly 4 digits.", false));
    return;
  }

  // Reload session from database to ensure we have the latest data
  const freshSession = await sequelize.models.Session.findOne({
    where: { phoneNumber }
  });

  let registrationData = (freshSession && freshSession.data && freshSession.data.registrationData) || (session.data && session.data.registrationData);

  // Try to find OTP record by code (most reliable source of truth for this code)
  const otpRecordByCode = await OTP.findOne({
    where: {
      code: otp,
      purpose: 'registration'
    },
    order: [['createdAt', 'DESC']]
  });

  // If we don't have registrationData in session, attempt to recover it from OTP metadata
  if ((!registrationData || !registrationData.email) && otpRecordByCode) {
    try {
      const { decryptData } = require('./services/security');
      if (otpRecordByCode.meta && otpRecordByCode.meta.registrationData) {
        const decrypted = decryptData(otpRecordByCode.meta.registrationData);
        if (decrypted && decrypted.email) {
          registrationData = {
            name: decrypted.name,
            email: decrypted.email,
            password: decrypted.password,
            phoneNumber: decrypted.phoneNumber || normalizePhoneNumber(phoneNumber)
          };
        }
      }
    } catch (e) {
      console.warn('Failed to decrypt registration snapshot from OTP meta:', e.message);
      // continue - we'll handle missing registrationData below
    }
  }

  // If still missing registration data, we can't proceed safely
  if (!registrationData || !registrationData.email) {
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ Registration session expired. Please start again by typing 'register'.", false));
    if (freshSession) {
      freshSession.data.waitingForOTPVerification = false;
      freshSession.data.registrationData = null;
      await freshSession.save();
    }
    return;
  }

  // Update session reference to use fresh session for subsequent saves
  session = freshSession || session;

  // Direct database lookup: Find the OTP record that matches email and code
  // Prefer otpRecordByCode but ensure it matches the target email
  let otpRecord = null;
  if (otpRecordByCode && otpRecordByCode.email === registrationData.email) {
    otpRecord = otpRecordByCode;
  } else {
    otpRecord = await OTP.findOne({
      where: {
        email: registrationData.email,
        code: otp,
        purpose: 'registration'
      },
      order: [['createdAt','DESC']]
    });
  }

    if (!otpRecord) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ Invalid OTP. The code you entered doesn't match our records.\n\n💡 **What to do:**\n1️⃣ Double-check the 4-digit code from your email\n2️⃣ Type 'resend' if you need a new OTP code\n3️⃣ Contact support if you need a backup OTP\n\nNeed help? Type 'support' to reach our team.", false));
      return;
    }

    // Check if OTP is already used
    if (otpRecord.isUsed) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ This OTP has already been used. Please type 'resend' to get a new OTP code.", false));
      return;
    }

    // Check if OTP is expired
    if (new Date() > otpRecord.expiresAt) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ OTP has expired (valid for only 5 minutes).\n\n💡 **What to do:**\nType 'resend' to receive a fresh OTP code.\n\nNeed help? Type 'support' to reach our team.", false));
      return;
    }

    // Mark OTP as used BEFORE creating user (for security)
    otpRecord.isUsed = true;
    otpRecord.usedAt = new Date();
    await otpRecord.save();

    // NOW complete user registration (only AFTER OTP is verified)
    try {
      const result = await registerUser(registrationData);

      // Generate registration token
      const registrationToken = result.token || generateToken();

      // ONLY NOW update session with user data (after successful registration)
      session.state = 'LOGGED_IN';
      session.token = registrationToken;  // Store in dedicated column
      session.userId = result.userId;
      session.loginTime = new Date();
      session.lastActivity = new Date();
      session._lastActivityExplicitlySet = true;
      session.data = Object.assign(session.data || {}, {
        userId: result.userId,
        token: registrationToken,  // Also in data for compatibility
        tokenLastUsed: new Date().toISOString(),
        waitingForOTPVerification: false,
        registrationData: null,
        emailSendFailed: false
      });
      
      // Mark all fields as changed for Sequelize
      session.changed('token', true);
      session.changed('userId', true);
      session.changed('loginTime', true);
      session.changed('lastActivity', true);
      session.changed('state', true);
      session.changed('data', true);
      
      console.log(`📝 Registration complete, saving token: ${registrationToken.substring(0, 10)}...`);
      await session.save();

      // Notify support teams
      await notifySupportTeams(phoneNumber, 'New User Registration', {
        name: registrationData.name,
        email: registrationData.email
      });

      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`✅ Registration successful! Welcome to Drugs.ng, ${registrationData.name}. You can now access all our services. Type 'help' to get started!`, true));
    } catch (error) {
      console.error('Registration completion error:', error);
      const errorMessage = handleApiError(error, 'registration').message;
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`❌ Registration failed: ${errorMessage}. Please try again or type 'resend' to get a new OTP.`, false));

      // Reset OTP used flag since registration failed, but keep session in REGISTERING state
      otpRecord.isUsed = false;
      otpRecord.usedAt = null;
      await otpRecord.save();

      session.data.waitingForOTPVerification = true;
      await session.save();
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ Error verifying OTP. Please try again or type 'support' for help.", false));
  }
};

// Handle diagnostic test search
const handleDiagnosticTestSearch = async (phoneNumber, session, parameters) => {
  try {
    const { DiagnosticTest } = require('./models');
    const isLoggedIn = isAuthenticatedSession(session);

    const page = parseInt(parameters.page || '1', 10) || 1;
    const pageSize = 5;
    const where = { isActive: true };

    if (parameters.testType) {
      where[sequelize.Op.or] = [
        { name: { [sequelize.Op.iLike]: `%${parameters.testType}%` } },
        { category: { [sequelize.Op.iLike]: `%${parameters.testType}%` } }
      ];
    }

    const offset = (page - 1) * pageSize;
    const { rows, count } = await DiagnosticTest.findAndCountAll({ where, limit: pageSize, offset, order: [['id','ASC']] });

    if (!rows || rows.length === 0) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`❌ No diagnostic tests found${parameters.testType ? ` for "${parameters.testType}"` : ''}. Please try a different search or type 'help' for more options.`, isLoggedIn));
      return;
    }

    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
    session.data = { 
      ...session.data, 
      diagnosticTestPagination: { currentPage: page, totalPages, pageSize },
      diagnosticTestPageItems: rows,
      lastDiagnosticSearch: { testType: parameters.testType || null }
    };
    await session.save();

    const msg = buildPaginatedListMessage(rows, page, totalPages, '🔬 Diagnostic Tests', (test) => {
      let s = `${test.name} - ₦${test.price}`;
      s += `\n   Category: ${test.category}`;
      s += `\n   Sample: ${test.sampleType || 'N/A'} | Time: ${test.resultTime || 'N/A'}`;
      if (test.description) s += `\n   ${test.description}`;
      return s;
    });
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg, isLoggedIn));
  } catch (error) {
    console.error('Error searching diagnostic tests:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ Error retrieving diagnostic tests. Please try again later.", isAuthenticatedSession(session)));
  }
};

// Handle healthcare product browse
const handleHealthcareProductBrowse = async (phoneNumber, session, parameters) => {
  try {
    const { HealthcareProduct } = require('./models');
    const isLoggedIn = isAuthenticatedSession(session);

    const page = parseInt(parameters.page || '1', 10) || 1;
    const pageSize = 5;
    const where = { isActive: true };

    if (parameters.category) {
      where[sequelize.Op.or] = [
        { name: { [sequelize.Op.iLike]: `%${parameters.category}%` } },
        { category: { [sequelize.Op.iLike]: `%${parameters.category}%` } }
      ];
    }

    const offset = (page - 1) * pageSize;
    const { rows, count } = await HealthcareProduct.findAndCountAll({ where, limit: pageSize, offset, order: [['id','ASC']] });

    if (!rows || rows.length === 0) {
      await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(`❌ No healthcare products found${parameters.category ? ` in "${parameters.category}"` : ''}. Please try a different search or type 'help' for more options.`, isLoggedIn));
      return;
    }

    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    // 🔴 CRITICAL: Use spread operator to ensure Sequelize detects JSONB field change
    session.data = { 
      ...session.data, 
      healthcareProductPagination: { currentPage: page, totalPages, pageSize },
      healthcareProductPageItems: rows,
      lastHealthcareProductSearch: { category: parameters.category || null }
    };
    await session.save();

    const msg = buildPaginatedListMessage(rows, page, totalPages, '🛒 Healthcare Products', (product) => {
      let s = `${product.name} - ₦${product.price}`;
      s += `\n   Category: ${product.category}${product.brand ? ` | Brand: ${product.brand}` : ''}`;
      s += `\n   Stock: ${product.stock > 0 ? product.stock + ' units' : 'Out of stock'}`;
      if (product.description) s += `\n   ${product.description}`;
      if (product.usage) s += `\n   Usage: ${product.usage}`;
      return s;
    });
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions(msg, isLoggedIn));
  } catch (error) {
    console.error('Error browsing healthcare products:', error);
    await sendWhatsAppMessage(phoneNumber, formatResponseWithOptions("❌ Error retrieving healthcare products. Please try again later.", isAuthenticatedSession(session)));
  }
};
/**
 * NEW: Handles incoming text messages using the new modular flow.
 */
const handleTextMessage = async (messageText, phoneNumber, messageId) => {
  // This function now acts as the primary entry point for text, replacing the old `handleCustomerMessage`.
  // It will call the same logic, but structured in a more modern way.
  const supportTeam = await sequelize.models.SupportTeam.findOne({ where: { phoneNumber } });
  if (supportTeam) {
    console.log(`👨‍💼 Support team message from ${phoneNumber}`);
    await handleSupportTeamMessage(phoneNumber, messageText);
  } else {
    console.log(`👤 Customer message from ${phoneNumber}`);
    await handleCustomerMessage(phoneNumber, messageText, messageId);
  }
};

/**
 * NEW: Handles incoming voice messages.
 */
const handleVoiceMessage = async (voiceMessageObject, phoneNumber, messageId) => {
  try {
    console.log(`[VOICE] Processing voice from ${phoneNumber}`);
    const transcriptionResult = await voiceProcessor.processWhatsAppVoiceMessage(voiceMessageObject, phoneNumber);

    if (!transcriptionResult.success) {
      console.error('[VOICE ERROR]', transcriptionResult.error);
      await sendWhatsAppMessage(phoneNumber, `Sorry, I couldn't understand the voice message. Error: ${transcriptionResult.error}. Please try typing instead.`);
      return;
    }

    const transcribedText = transcriptionResult.text;
    console.log(`[TRANSCRIBED] "${transcribedText}"`);

    const confirmText = `📝 I understood: "${transcribedText}"\n\nProcessing your request...`;
    await sendWhatsAppMessage(phoneNumber, confirmText);

    // Process the transcribed text through the same flow as a regular text message
    await handleTextMessage(transcribedText, phoneNumber, messageId);

  } catch (error) {
    console.error('[VOICE PROCESSING ERROR]', error);
    await sendWhatsAppMessage(phoneNumber, 'Sorry, an error occurred while processing your voice message. Please try typing.');
  }
};

/**
 * NEW: Handles incoming media (image/document) for prescriptions.
 */
const handleMediaMessage = async (message, phoneNumber, messageId) => {
  // Provide immediate feedback to the user
  await sendWhatsAppMessage(phoneNumber, 'Processing your file, please wait... ⏳');

  try {
    let mediaId, mimeType, filename, caption = '';

    if (message.type === 'image') {
      mediaId = message.image.id;
      mimeType = message.image.mime_type || 'image/jpeg';
      caption = message.image.caption || '';
      filename = `prescription-${Date.now()}`;
    } else { // document
      mediaId = message.document.id;
      mimeType = message.document.mime_type || 'application/pdf';
      filename = message.document.filename || `prescription-${Date.now()}.pdf`;
      caption = message.document.caption || message.caption || '';
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(mimeType)) {
      await sendWhatsAppMessage(phoneNumber, 'Unsupported file type. Please send an image (JPG, PNG, WEBP) or a PDF.');
      return;
    }

    const { buffer } = await downloadMedia(mediaId);
    const uploadResult = await uploadImage(buffer, { folder: 'drugs-ng/prescriptions', filename, resourceType: 'auto' });
    const ocr = await extractPrescriptionFromBuffer(buffer).catch(err => console.warn('OCR failed:', err.message));
    const extractedText = ocr?.extractedText || null;

    const match = caption.match(/(?:rx|order|prescription)\s*#?(\d+)/i);
    if (match && match[1]) {
      const orderId = match[1];
      try {
        const result = await savePrescription(orderId, uploadResult.url, extractedText);
        await sendWhatsAppMessage(phoneNumber, `✅ Prescription received and attached to order #${orderId}. Status: ${result.verificationStatus || 'Pending'}.`);
      } catch (err) {
        console.error(`Error attaching prescription to order #${orderId}:`, err);
        await sendWhatsAppMessage(phoneNumber, `❌ We received your prescription, but couldn't attach it to order #${orderId}. Please ensure the order ID is correct. You can try again by replying: \`rx ${orderId}\``);
      }
    } else {
      const [session] = await Session.findOrCreate({ where: { phoneNumber }, defaults: { state: 'NEW', data: {} } });
      session.set('data', {
        ...session.data,
        pendingPrescriptionUrl: uploadResult.url,
        ...(extractedText && { pendingPrescriptionExtractedText: extractedText })
      });
      await session.save();
      await sendWhatsAppMessage(phoneNumber, '📄 Prescription received.\n\nTo attach it to an order, reply now with your Order ID (e.g., `rx 12345`).');
    }
  } catch (err) {
    console.error('Media handling error:', err);
    let userMessage = 'Sorry, there was a problem processing your file. Please try again.';
    if (err.message && err.message.includes('Timeout')) {
      userMessage = 'The file upload timed out. Please check your connection and try again with a smaller file if possible.';
    }
    await sendWhatsAppMessage(phoneNumber, userMessage);
  }
};

/**
 * NEW: Handles incoming location messages for delivery address.
 */
const handleLocationMessage = async (message, phoneNumber, messageId) => {
    const { latitude, longitude, name, address } = message.location;
    console.log(`[LOCATION] Received from ${phoneNumber}: Lat=${latitude}, Lon=${longitude}`);

    const session = await Session.findOne({ where: { phoneNumber } });
    if (session && session.data.isSettingAddress) {
        const fullAddress = [name, address].filter(Boolean).join(', ');
        session.set('data', { ...session.data, deliveryAddress: { latitude, longitude, description: fullAddress }, isSettingAddress: false });
        await session.save();
        await sendWhatsAppMessage(phoneNumber, `✅ Delivery address set to: ${fullAddress}\n\nYou can now proceed to checkout.`);
    } else {
        await sendWhatsAppMessage(phoneNumber, `Thanks for sharing your location!`);
    }
};

const handleInteractiveMessage = async (message, phoneNumber, messageId) => {
  const interactive = message.interactive;
  let replyId;

  if (interactive.type === 'button_reply') {
    replyId = interactive.button_reply.id;
  } else if (interactive.type === 'list_reply') {
    replyId = interactive.list_reply.id;
  } else {
    console.warn(`Unknown interactive type: ${interactive.type}`);
    return;
  }

  console.log(`[INTERACTIVE] User clicked button/list with ID: "${replyId}"`);

  // --- PAGINATION CONTEXT CLEARING ---
  // If user selects a top-level menu item, clear any existing pagination context
  // to prevent them from getting "stuck".
  const topLevelMenuActions = ['search_products', 'healthcare_products', 'view_cart', 'track_order', 'search_doctors', 'book_appointment', 'diagnostic_tests', 'support'];
  if (topLevelMenuActions.includes(replyId)) {
    const sessionForClear = await Session.findOne({ where: { phoneNumber } });
    if (sessionForClear && sessionForClear.data) {
      delete sessionForClear.data.doctorSpecialtyPagination;
      delete sessionForClear.data.doctorPagination;
      delete sessionForClear.data.productPagination;
      delete sessionForClear.data.cartPagination;
      sessionForClear.changed('data', true);
      await sessionForClear.save();
      console.log(`[CONTEXT_CLEAR] Cleared pagination context for user selecting a new menu item.`);
    }
  }
  // Route the reply ID to the appropriate action
  // This is like a mini-router for button clicks.
  switch (replyId) {
    case 'show_help_menu':
      const sessionForHelp = await Session.findOne({ where: { phoneNumber } });
      await handleHelp(phoneNumber, isAuthenticatedSession(sessionForHelp));
      break;
    case 'show_login_prompt':
      const loginBody = "🔐 To login, please send your credentials in one message.\n\nExample: `login john@example.com mypassword`";
      const loginButtons = [
        { id: 'show_password_reset_prompt', title: '🤔 Forgot Password?' }
      ];
      await sendInteractiveMessage(phoneNumber, loginBody, loginButtons);
      break;
    case 'show_register_prompt':
      await sendWhatsAppMessage(phoneNumber, "📝 To get started, please provide your details in one message.\n\nExample: `register John Doe john@example.com MyPassword123`");
      break;
    case 'logout': // from help menu
    case 'logout_session': // from button
        const sessionForLogout = await Session.findOne({ where: { phoneNumber } });
        if (sessionForLogout) {
            await handleLogout(phoneNumber, sessionForLogout);
        } else {
            await sendWhatsAppMessage(phoneNumber, "You are not logged in.");
        }
      break;
    case 'show_password_reset_prompt':
      await sendWhatsAppMessage(phoneNumber, "🔑 To reset your password, please type `reset my password for [your-email]`.\n\nExample: `reset my password for john@example.com`");
      break;
    default:
      // For list replies that map directly to commands like 'search_products'
      await handleCustomerMessage(phoneNumber, replyId, messageId);
      break;
  }
};

const getStandardButtons = (isLoggedIn) => {
  if (isLoggedIn) return [{ id: 'show_help_menu', title: '📋 View Menu' }, { id: 'logout_session', title: '🔒 Logout' }];
  return [{ id: 'show_login_prompt', title: '🔒 Login' }, { id: 'show_register_prompt', title: '📝 Register' }, { id: 'show_help_menu', title: '📋 Main Menu' }];
};

// Start the server
startServer();
