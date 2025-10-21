require('dotenv').config();

// List of required environment variables
const REQUIRED_ENV_VARS = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'ENCRYPTION_KEY'
];

// Database configuration - either DATABASE_URL or individual variables
const REQUIRED_DB_VARS = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

// List of optional environment variables with defaults
const OPTIONAL_ENV_VARS = {
  'PORT': '3000',
  'NODE_ENV': 'development',
  'LOG_LEVEL': 'info',
  'FLUTTERWAVE_PUBLIC_KEY': null,
  'FLUTTERWAVE_SECRET_KEY': null,
  'FLUTTERWAVE_SECRET_HASH': null,
  'PAYSTACK_SECRET_KEY': null,
  'PAYMENT_REDIRECT_URL': 'https://your-domain.com/payment/callback',
  'DRUGSNG_API_BASE_URL': 'https://api.drugsng.com',
  'COMPANY_LOGO': 'https://drugsng.com/logo.png'
};

// Validate environment configuration
const validateEnvironment = () => {
  const errors = [];
  const warnings = [];

  // Check required variables
  REQUIRED_ENV_VARS.forEach(varName => {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  });

  // Check database configuration - either DATABASE_URL or individual variables
  const hasNeonConnection = !!process.env.DATABASE_URL;
  const hasIndividualDbVars = REQUIRED_DB_VARS.every(varName => process.env[varName]);

  if (!hasNeonConnection && !hasIndividualDbVars) {
    errors.push('Database configuration missing. Provide either DATABASE_URL or all individual DB variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)');
  }

  if (hasNeonConnection) {
    console.log('✓ Using Neon PostgreSQL connection');
  } else {
    console.log('✓ Using individual database configuration');
  }
  
  // Set defaults for optional variables
  Object.entries(OPTIONAL_ENV_VARS).forEach(([varName, defaultValue]) => {
    if (!process.env[varName] && defaultValue !== null) {
      process.env[varName] = defaultValue;
    } else if (!process.env[varName] && defaultValue === null) {
      warnings.push(`Optional environment variable not set: ${varName}`);
    }
  });
  
  // Validate specific formats
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 16) {
    errors.push('ENCRYPTION_KEY must be at least 16 characters long');
  }
  
  if (process.env.DB_PORT && isNaN(process.env.DB_PORT)) {
    errors.push('DB_PORT must be a valid number');
  }
  
  if (process.env.PORT && isNaN(process.env.PORT)) {
    errors.push('PORT must be a valid number');
  }
  
  // Check payment provider configuration
  const hasFlutterwave = process.env.FLUTTERWAVE_SECRET_KEY && process.env.FLUTTERWAVE_PUBLIC_KEY;
  const hasPaystack = process.env.PAYSTACK_SECRET_KEY;
  
  if (!hasFlutterwave && !hasPaystack) {
    warnings.push('No payment provider configured (Flutterwave or Paystack). Payment features will be disabled.');
  }
  
  // NLP Configuration - Using built-in custom NLP (no external service required)
  
  return { errors, warnings };
};

// Get all environment variables
const getEnv = () => ({
  PORT: process.env.PORT || '3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Database
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT || 5432,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  
  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  
  // Encryption
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  
  
  // Flutterwave
  FLUTTERWAVE_PUBLIC_KEY: process.env.FLUTTERWAVE_PUBLIC_KEY,
  FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
  FLUTTERWAVE_SECRET_HASH: process.env.FLUTTERWAVE_SECRET_HASH,
  
  // Paystack
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  
  // API Configuration
  PAYMENT_REDIRECT_URL: process.env.PAYMENT_REDIRECT_URL || 'https://your-domain.com/payment/callback',
  DRUGSNG_API_BASE_URL: process.env.DRUGSNG_API_BASE_URL || 'https://api.drugsng.com',
  COMPANY_LOGO: process.env.COMPANY_LOGO || 'https://drugsng.com/logo.png'
});

// Initialize and validate environment on module load
const { errors, warnings } = validateEnvironment();

if (warnings.length > 0) {
  console.warn('\n⚠️  ENVIRONMENT WARNINGS:');
  warnings.forEach(warning => {
    console.warn(`   - ${warning}`);
  });
  console.warn('');
}

if (errors.length > 0) {
  console.error('\n❌ ENVIRONMENT ERRORS:');
  errors.forEach(error => {
    console.error(`   - ${error}`);
  });
  console.error('\nPlease fix the above errors and restart the application.\n');
  process.exit(1);
}

console.log('✓ Environment configuration validated successfully');

module.exports = {
  validateEnvironment,
  getEnv,
  REQUIRED_ENV_VARS,
  OPTIONAL_ENV_VARS
};
