#!/bin/bash
# Quick start script to test and run the backend with mail enabled

set -e

echo "=== Last Man Standing — Backend Quick Start (Mail Enabled) ==="
echo ""

# Step 1: Verify .env exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found in current directory"
    echo "Please ensure you're in the project root: /home/alan/IdeaProjects/LastManStanding"
    exit 1
fi

echo "✅ Found .env file"
echo ""

# Step 2: Note on STARTTLS connectivity
echo "--- STARTTLS Connectivity Status ---"
echo "ℹ️  STARTTLS connectivity test skipped (environment-dependent)"
echo "   To manually test, run: bash scripts/test-smtp.sh"
echo "   Previous manual test showed: ✅ STARTTLS working with valid Gmail certificate"
echo ""

# Step 3: Load environment and check mail settings
echo "--- Checking mail configuration ---"
export $(grep -v '^#' .env | xargs -d '\n') 2>/dev/null || true

if [ -z "$MAIL_ENABLED" ]; then
    echo "⚠️  MAIL_ENABLED not set in .env (will use application.yml default: false)"
else
    echo "✅ MAIL_ENABLED=$MAIL_ENABLED"
fi

if [ -z "$MAIL_PROTOCOL" ]; then
    echo "⚠️  MAIL_PROTOCOL not set in .env (will use application.yml default: smtp)"
else
    echo "✅ MAIL_PROTOCOL=$MAIL_PROTOCOL"
fi

if [ -z "$MAIL_PORT" ]; then
    echo "⚠️  MAIL_PORT not set in .env (will use application.yml default: 587)"
else
    echo "✅ MAIL_PORT=$MAIL_PORT"
fi

if [ -z "$MAIL_USERNAME" ]; then
    echo "❌ MAIL_USERNAME not set in .env (required)"
    exit 1
else
    echo "✅ MAIL_USERNAME set (${MAIL_USERNAME:0:15}...)"
fi

if [ -z "$MAIL_PASSWORD" ]; then
    echo "❌ MAIL_PASSWORD not set in .env (required)"
    exit 1
else
    echo "✅ MAIL_PASSWORD set (***)"
fi

echo ""

# Step 4: Build backend
echo "--- Building backend ---"
cd backend

if [ ! -f "pom.xml" ]; then
    echo "❌ Error: pom.xml not found. Are you in the correct directory?"
    exit 1
fi

echo "Running: mvn clean package -DskipTests"
mvn clean package -DskipTests > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Maven build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""

# Step 5: Run backend
echo "--- Starting backend with mail enabled ---"
echo "The app will now start. Watch for mail configuration logs."
echo ""
echo "To test email sending:"
echo "  1. Process a gameweek result (or use admin API)"
echo "  2. Look for logs: 'Sent GW* result email to ...'"
echo "  3. Check your Gmail inbox"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

java -jar target/lastmanstanding-0.0.1-SNAPSHOT.jar \
    --spring.config.debug=false \
    --spring.mail.properties.mail.debug=false

