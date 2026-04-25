#!/bin/bash
# Test SMTP connectivity to Gmail on port 587 with STARTTLS
# This script helps diagnose mail configuration issues

set -e

echo "=== Testing SMTP STARTTLS connection to gmail.com ==="
echo ""
echo "This test will attempt a STARTTLS handshake on port 587."
echo "It should show a normal SMTP banner, then STARTTLS response and certificate details."
echo ""
echo "--- Running openssl s_client with STARTTLS ---"
echo ""

# Use timeout to prevent hanging if connection fails
timeout 10 openssl s_client -starttls smtp -crlf -connect smtp.gmail.com:587 << EOF 2>&1 | head -50
quit
EOF

echo ""
echo "--- Test complete ---"
echo ""
echo "Expected output:"
echo "  1. SMTP banner starting with '220 smtp.gmail.com ESMTP'"
echo "  2. STARTTLS response with '250' status code"
echo "  3. SSL/TLS certificate details (subject, issuer, dates)"
echo ""
echo "If you see SSL errors like 'Unsupported or unrecognized SSL message':"
echo "  - Network/proxy may be interfering with STARTTLS"
echo "  - Try from a different network or check firewall rules"
echo ""
