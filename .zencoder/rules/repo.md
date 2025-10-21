---
description: Repository Information Overview
alwaysApply: true
---

# Drugs.ng WhatsApp Bot Information

## Summary

A WhatsApp Business API integration bot for Drugs.ng healthcare services, built with Express.js, PostgreSQL (Neon), and NLP capabilities. The bot enables customers to interact with Drugs.ng services via WhatsApp, including product catalog browsing, order management, doctor appointments, and payment processing.

## Structure

- **config/**: Database, WhatsApp API, and environment configurations
- **models/**: Sequelize ORM models for database entities
- **services/**: Core business logic for NLP, payments, security, and API integrations
- **utils/**: Utility functions for error handling, rate limiting, and validation
- **scripts/**: Deployment and setup scripts

## Language & Runtime

**Language**: JavaScript (Node.js)
**Version**: Node.js ≥ 16.x (18.x recommended for Vercel)
**Build System**: npm
**Package Manager**: npm

## Dependencies

**Main Dependencies**:

- express: ^4.18.2 - Web server framework
- sequelize: ^6.31.1 - ORM for PostgreSQL
- pg: ^8.11.0 - PostgreSQL client
- axios: ^1.4.0 - HTTP client for API requests
- bcryptjs: ^2.4.3 - Password hashing
- crypto-js: ^4.1.1 - Data encryption
- dialogflow: ^1.2.0 - NLP processing (optional)
- flutterwave-node-v3: ^1.0.8 - Payment gateway
- paystack: ^2.0.1 - Payment gateway
- dotenv: ^16.0.3 - Environment variable management
- rate-limiter-flexible: ^2.4.1 - API rate limiting

**Development Dependencies**:

- nodemon: ^2.0.22 - Development server with hot reload

## Build & Installation

```bash
# Install dependencies
npm install

# Verify setup
npm run setup

# Development mode with hot reload
npm run dev

# Production mode
npm start
```

## Database

**Type**: PostgreSQL (Neon Cloud)
**ORM**: Sequelize
**Models**:

- Users: Customer profiles
- Products: Pharmaceutical products
- Orders: Customer orders
- Carts: Shopping carts
- Appointments: Doctor appointments
- SupportChats: Customer support conversations
- SupportTeams: Support agent accounts

**Connection Configuration**:

- Connection pooling: Min 0, Max 10 connections
- SSL enabled for security
- Auto-creates tables on first run

## API Endpoints

**WhatsApp Webhook**:

- GET /webhook - Verify webhook (Meta challenge)
- POST /webhook - Receive and process messages

**Payment Webhooks**:

- POST /webhook/flutterwave - Flutterwave payment status
- POST /webhook/paystack - Paystack payment status

**Root Endpoint**:

- GET / - API status and information

## Deployment

**Platform**: Vercel (serverless)
**Configuration**: vercel.json
**Node Version**: 18.x
**Function Timeout**: 30 seconds
**Environment**: Production

**Deployment Process**:

1. Push code to GitHub repository
2. Import repository in Vercel dashboard
3. Configure environment variables in Vercel
4. Deploy application
5. Configure WhatsApp webhook with Vercel URL

## Security

**Data Protection**:

- AES-256 encryption for sensitive data
- bcrypt password hashing (10 rounds)
- WhatsApp webhook verification with token
- Payment webhooks verified with HMAC signatures

**API Security**:

- Rate limiting to prevent abuse
- Input validation on all endpoints
- HTTPS required for webhooks
