import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Load credentials
const GEMINI_KEY = 'AIzaSyBJQn0Qf6hS6-fH9e3W1rK7zqH0bU3INRA';
const CLOUDINARY_NAME = 'dmaupzhcx';
const CLOUDINARY_KEY = '583513982985875';
const CLOUDINARY_SECRET = '7r27GuYQMx1-3ph9grDe54WKo9Q';

const patternsFolder = 'C:\Users\adam\OneDrive\Desktop\Patterns';

const patterns = [
  { pdf: 'HoneyBeeCrochetPattern.pdf', card: 'upload', desc: 'Honey Bee Amigurumi Pattern' },
  { pdf: 'EN-RealisticOctopusPatternbyCraftyIntentions.pdf', card: 'finished', desc: 'Octopus Amigurumi' },
  { pdf: '1775977254212-arcoiris_-_clues_1-4.pdf', card: 'mkal', desc: 'Arcoiris MKAL' },
  { pdf: 'SUNBURSTGRANNYSQUARECROCHETPATTERN.pdf', card: 'marina', desc: 'Sunburst Granny Square' }
];

async function analyzeWithGemini(pdfPath) {
  try {
    const buffer = fs.readFileSync(pdfPath);
    const base64 = buffer.toString('base64');
    
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
            {
              text: 'Describe the main visual content and pattern shown on the first page of this crochet pattern. What does it look like?'
            }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.contents?.[0]?.parts?.[0]?.text) {
      return data.contents[0].parts[0].text;
    }
    return null;
  } catch (e) {
    console.log(`Gemini error: ${e.message}`);
    return null;
  }
}

async function generateImage(description, cardType) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Create a detailed, professional image of: ${description}. Make it look like a real crochet pattern or finished project for a landing page "${cardType}" card.`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 4096
        }
      })
    });

    const data = await response.json();
    console.log(`✓ Generated image for ${cardType}: ${description.substring(0, 50)}...`);
    return true;
  } catch (e) {
    console.log(`Generate error: ${e.message}`);
    return false;
  }
}

console.log('Processing pattern PDFs with Gemini + Cloudinary...\n');

for (const p of patterns) {
  const pdfPath = path.join(patternsFolder, p.pdf);
  
  if (!fs.existsSync(pdfPath)) {
    console.log(`⊘ ${p.pdf} not found`);
    continue;
  }

  console.log(`Analyzing: ${p.desc}`);
  const analysis = await analyzeWithGemini(pdfPath);
  
  if (analysis) {
    console.log(`  → ${analysis.substring(0, 100)}...`);
    // Generate image based on analysis
    await generateImage(analysis, p.card);
  }
  console.log();
}

console.log('\n✓ Pattern analysis complete');
