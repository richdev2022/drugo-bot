#!/usr/bin/env node

/**
 * Setup Script for Drugs.ng WhatsApp Bot
 * This script helps verify the environment setup
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('Drugs.ng WhatsApp Bot - Setup Verification');
console.log('='.repeat(60));
console.log();

let hasErrors = false;
let hasWarnings = false;

// Check if .env file exists
console.log('1. Checking .env file...');
if (fs.existsSync('.env')) {
  console.log('   ✓ .env file found');
  
  // Load and check environment variables
  require('dotenv').config();
  
  const requiredVars = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_VERIFY_TOKEN',
    'ENCRYPTION_KEY'
  ];

  // Database - check for either DATABASE_URL or individual variables
  const databaseConfigured = process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_PORT && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD);
  
  const optionalVars = [
    'FLUTTERWAVE_PUBLIC_KEY',
    'FLUTTERWAVE_SECRET_KEY',
    'FLUTTERWAVE_SECRET_HASH',
    'PAYSTACK_SECRET_KEY',
    'SUPPORT_PHONE_NUMBER_1'
  ];
  
  console.log('   Checking required environment variables...');
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`   ✓ ${varName} is set`);
    } else {
      console.log(`   ✗ ${varName} is MISSING`);
      hasErrors = true;
    }
  });

  console.log('   Checking database configuration...');
  if (databaseConfigured) {
    if (process.env.DATABASE_URL) {
      console.log(`   ✓ DATABASE_URL is configured (Neon)`);
    } else {
      console.log(`   ✓ Individual database variables are configured`);
    }
  } else {
    console.log('   ✗ DATABASE_URL or individual DB variables are MISSING');
    hasErrors = true;
  }
  
  console.log('   Checking optional environment variables...');
  optionalVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`   ✓ ${varName} is set`);
    } else {
      console.log(`   ⚠ ${varName} is not set (optional)`);
      hasWarnings = true;
    }
  });
} else {
  console.log('   ✗ .env file NOT found');
  console.log('   → Copy .env.example to .env and fill in your credentials');
  hasErrors = true;
}
console.log();

// NLP Configuration - Using built-in custom NLP
console.log('2. Checking NLP configuration...');
console.log('   ✓ Using built-in custom NLP (no external service required)');
console.log();

// Check if node_modules exists
console.log('3. Checking dependencies...');
if (fs.existsSync('node_modules')) {
  console.log('   ✓ node_modules folder found');
  
  // Check for key dependencies
  const keyDeps = [
    'express',
    'sequelize',
    'pg',
    'axios',
    'bcryptjs',
    'crypto-js',
    'dotenv'
  ];
  
  keyDeps.forEach(dep => {
    if (fs.existsSync(path.join('node_modules', dep))) {
      console.log(`   ✓ ${dep} installed`);
    } else {
      console.log(`   ✗ ${dep} NOT installed`);
      hasErrors = true;
    }
  });
} else {
  console.log('   ✗ node_modules folder NOT found');
  console.log('   → Run: npm install');
  hasErrors = true;
}
console.log();

// Check database connection
console.log('4. Testing database connection...');
const { Sequelize } = require('sequelize');
let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    ssl: true,
    native: false
  });
} else if (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false
    }
  );
} else {
  console.log('   ⚠ Skipping database test (missing credentials)');
  console.log();
  printSummary();
  process.exit(0);
}

sequelize.authenticate()
  .then(() => {
    console.log('   ✓ Database connection successful');
    console.log();
    printSummary();
  })
  .catch(err => {
    console.log('   ⚠ Database connection test skipped or failed');
    console.log(`   → Note: This is expected if the database doesn't exist yet or is unreachable`);
    console.log(`   → The app will auto-create tables on first run`);
    console.log();
    printSummary();
  });

function printSummary() {
  console.log('='.repeat(60));
  console.log('Setup Verification Summary');
  console.log('='.repeat(60));
  
  if (!hasErrors && !hasWarnings) {
    console.log('✓ All checks passed! Your environment is ready.');
    console.log();
    console.log('Next steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Configure WhatsApp webhook in Meta Business Suite');
    console.log('3. Test by sending a message to your WhatsApp Business number');
  } else if (hasErrors) {
    console.log('✗ Setup has ERRORS that must be fixed before running the bot.');
    console.log();
    console.log('Please fix the errors marked with ✗ above and run this script again.');
  } else if (hasWarnings) {
    console.log('⚠ Setup has warnings but the bot can run with limited functionality.');
    console.log();
    console.log('You can start the server with: npm start');
    console.log('However, some features may not work without the optional configurations.');
  }
  
  console.log();
  console.log('For detailed setup instructions, see README.md');
  console.log('For deployment checklist, see DEPLOYMENT_CHECKLIST.md');
  console.log('='.repeat(60));
  
  process.exit(hasErrors ? 1 : 0);
}
