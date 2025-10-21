#!/bin/bash

# Drugs.ng WhatsApp Bot - Automated Vercel Deployment Script
# This script automates the process of deploying to Vercel and setting up environment variables

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Drugs.ng WhatsApp Bot - Vercel Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo -e "Please create .env file with your credentials first"
    exit 1
fi

echo -e "${GREEN}✓ .env file found${NC}"

# Load environment variables from .env
export $(cat .env | grep -v '^#' | xargs)

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}Vercel CLI not found. Installing...${NC}"
    npm install -g vercel
fi

echo -e "${GREEN}✓ Vercel CLI is installed${NC}"
echo ""

# Check if user is authenticated with Vercel
if [ ! -d ~/.vercel ]; then
    echo -e "${YELLOW}Please authenticate with Vercel${NC}"
    vercel login
fi

echo ""
echo -e "${BLUE}Step 1: Initializing Vercel Project${NC}"
echo -e "========================================${NC}"

# Check if .vercel directory exists
if [ ! -d .vercel ]; then
    echo "Setting up new Vercel project..."
    vercel --confirm
else
    echo "Using existing Vercel project"
fi

echo ""
echo -e "${BLUE}Step 2: Adding Environment Variables${NC}"
echo -e "========================================${NC}"

# List of environment variables to add
ENV_VARS=(
    "DATABASE_URL"
    "WHATSAPP_ACCESS_TOKEN"
    "WHATSAPP_PHONE_NUMBER_ID"
    "WHATSAPP_VERIFY_TOKEN"
    "ENCRYPTION_KEY"
    "NODE_ENV"
    "LOG_LEVEL"
    "PORT"
)

# Add each environment variable
for VAR in "${ENV_VARS[@]}"; do
    VALUE="${!VAR}"
    if [ -z "$VALUE" ]; then
        echo -e "${YELLOW}⚠ $VAR is not set in .env${NC}"
    else
        echo -n "Setting $VAR... "
        vercel env add "$VAR" "$VALUE" --confirm 2>/dev/null || echo -e "${YELLOW}(already exists)${NC}"
        echo -e "${GREEN}✓${NC}"
    fi
done

echo ""
echo -e "${BLUE}Step 3: Deploying to Vercel${NC}"
echo -e "========================================${NC}"

echo "Deploying your application..."
DEPLOY_URL=$(vercel --prod 2>&1 | grep -oP '(?<=https:\/\/)[^ ]+' | head -1)

if [ -z "$DEPLOY_URL" ]; then
    DEPLOY_URL="[your-vercel-domain]"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo -e "Your bot is now live at: ${BLUE}https://$DEPLOY_URL${NC}"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Configure WhatsApp Webhook:"
echo -e "   - URL: ${BLUE}https://$DEPLOY_URL/webhook${NC}"
echo -e "   - Token: ${BLUE}drugsng_webhook_verify_secure_2024${NC}"
echo ""
echo "2. Go to: https://business.facebook.com/"
echo "3. WhatsApp → Configuration"
echo "4. Add webhook and verify"
echo ""

echo -e "${GREEN}View logs: vercel logs https://$DEPLOY_URL${NC}"
echo ""
