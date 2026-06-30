#!/bin/bash

API_KEY="AIzaSyD4RVrn_qFLx0SQ5tVzNFy_dJsZxuZqEiQ"
PATTERN_DIR="C:\Users\adam\OneDrive\Desktop\Patterns"

# Convert PDF to base64 for first pattern
PDF_FILE="$PATTERN_DIR/HoneyBeeCrochetPattern.pdf"

if [ -f "$PDF_FILE" ]; then
  echo "Found PDF, sending to Gemini..."
  
  # Read and encode
  BASE64=$(base64 -w 0 < "$PDF_FILE")
  
  # Call Gemini API
  curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"contents\": [{
        \"parts\": [
          {
            \"inline_data\": {
              \"mime_type\": \"application/pdf\",
              \"data\": \"$BASE64\"
            }
          },
          {
            \"text\": \"Extract the main pattern image from this crochet pattern PDF. Return URL of extracted image.\"
          }
        ]
      }]
    }" 2>&1 | head -50
else
  echo "PDF not found at $PDF_FILE"
fi
