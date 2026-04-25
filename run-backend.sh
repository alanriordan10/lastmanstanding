#!/bin/bash
# Fast backend build and run script for mail testing

set -e

cd /home/alan/IdeaProjects/LastManStanding

echo "=== Building Backend ==="
cd backend
mvn clean package -DskipTests -q

if [ ! -f "target/lastmanstanding-0.0.1-SNAPSHOT.jar" ]; then
    echo "❌ Build failed: JAR not created"
    exit 1
fi

echo "✅ Build successful"
echo ""
echo "=== Starting Backend ==="
echo "Loading .env and starting app..."
echo "Mail will be enabled and configuration will be verified on startup"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Load env and run
export $(grep -v '^#' ../.env | xargs -d '\n')
java -jar target/lastmanstanding-0.0.1-SNAPSHOT.jar
