import * as fs from 'fs';
import * as path from 'path';

const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD4RVrn_qFLx0SQ5tVzNFy_dJsZxuZqEiQ';

const patternsFolder = 'C:\Users\adam\OneDrive\Desktop\Patterns';

const cardMap = {
  'HoneyBeeCrochetPattern.pdf': {
    card: 'upload',
    prompt: 'Extract a clear image from the first page of this crochet pattern PDF. This will be used on a landing page card for "Upload from anywhere" - showing an actual pattern. Return just the image.'
  },
  'EN-RealisticOctopusPatternbyCraftyIntentions.pdf': {
    card: 'finished',
    prompt: 'Extract the finished product image or project photo from this crochet pattern PDF. For landing page "Finished projects" card. Return just the image.'
  },
  '1775977254212-arcoiris_-_clues_1-4.pdf': {
    card: 'mkal',
    prompt: 'Extract a clear image showing the MKAL (mystery CAL) pattern structure. For landing page "MKAL collections" card. Return just the image.'
  },
  'SUNBURSTGRANNYSQUARECROCHETPATTERN.pdf': {
    card: 'marina',
    prompt: 'Extract a detailed stitch diagram or pattern chart from this PDF. For landing page "Track every stitch" card showing tracking detail. Return just the image.'
  }
};

async function callGemini(pdfPath, cardType, prompt) {
  try {
    // Read PDF
    const fileBuffer = fs.readFileSync(pdfPath);
    const base64 = fileBuffer.toString('base64');
    
    // Call Gemini Vision API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: base64
              }
            },
            { text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.log(`! ${path.basename(pdfPath)}: ${err.substring(0, 100)}`);
      return null;
    }

    const data = await response.json();
    console.log(`✓ ${cardType}: ${path.basename(pdfPath)}`);
    return data;
  } catch (e) {
    console.log(`! Error: ${e.message}`);
    return null;
  }
}

console.log('Processing PDFs with Gemini Vision...\n');

for (const [pdfName, config] of Object.entries(cardMap)) {
  const fullPath = path.join(patternsFolder, pdfName);
  if (fs.existsSync(fullPath)) {
    await callGemini(fullPath, config.card, config.prompt);
  }
}
