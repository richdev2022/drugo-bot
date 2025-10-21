const PORT = process.env.PORT || 3000;

const serverUrl = process.env.NODE_ENV === 'production'
  ? `https://${process.env.PRODUCTION_HOST || 'your-production-host'}`
  : `http://localhost:${PORT}`;

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Drugs.ng WhatsApp Bot API',
    version: '1.0.0',
    description: 'Auto-generated OpenAPI documentation for the Drugs.ng WhatsApp Bot API.\n\nBot: Drugo — helpful assistant for Drugs.ng.'
  },
  servers: [
    { url: serverUrl, description: 'Local / Production server' }
  ],
  tags: [
    { name: 'Admin', description: 'Administrative endpoints (login, password reset, CRUD)' },
    { name: 'Prescriptions', description: 'Prescription upload and OCR endpoints' },
    { name: 'HealthcareProducts', description: 'Product image uploads' }
  ],
  paths: {
    '/api/admin/login': {
      post: {
        tags: ['Admin'],
        summary: 'Admin login',
        description: 'Authenticate admin and return token with expiry',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'owner@example.com' },
                  password: { type: 'string', example: 'MyPassword@123' }
                },
                required: ['email','password']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        token: { type: 'string' },
                        expiresAt: { type: 'string', format: 'date-time' },
                        admin: { type: 'object' }
                      }
                    }
                  }
                },
                examples: {
                  success: {
                    value: { success: true, data: { token: 'abc123', expiresAt: new Date().toISOString(), admin: { id: 1, email: 'owner@example.com' } } }
                  }
                }
              }
            }
          },
          '400': { description: 'Invalid credentials or validation error' }
        }
      }
    },
    '/api/admin/request-reset': {
      post: {
        tags: ['Admin'],
        summary: 'Request admin password reset OTP',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] }
            }
          }
        },
        responses: { '200': { description: 'OTP requested (if email exists)' } }
      }
    },
    '/api/admin/verify-reset': {
      post: {
        tags: ['Admin'],
        summary: 'Verify admin password reset OTP',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, otp: { type: 'string' } }, required: ['email','otp'] } } } },
        responses: { '200': { description: 'OTP verified' } }
      }
    },
    '/api/admin/reset-password': {
      post: {
        tags: ['Admin'],
        summary: 'Complete admin password reset',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, otp: { type: 'string' }, newPassword: { type: 'string' } }, required: ['email','otp','newPassword'] } } } },
        responses: { '200': { description: 'Password reset successful' } }
      }
    },
    '/api/prescriptions/upload': {
      post: {
        tags: ['Prescriptions'],
        summary: 'Upload prescription file',
        description: 'Upload an image or PDF prescription. Runs OCR and attaches to order.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  orderId: { type: 'string', example: '12345' },
                  file: { type: 'string', format: 'binary' }
                },
                required: ['orderId','file']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Prescription uploaded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: { type: 'object', properties: { prescriptionId: { type: 'integer' }, fileUrl: { type: 'string' }, verificationStatus: { type: 'string' } } }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/healthcare-products/upload-image': {
      post: {
        tags: ['HealthcareProducts'],
        summary: 'Upload product image',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { productId: { type: 'string' }, filename: { type: 'string' }, file: { type: 'string', format: 'binary' } }, required: ['file'] } } } },
        responses: { '200': { description: 'Image uploaded' } }
      }
    }
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
  }
};

module.exports = swaggerSpec;
