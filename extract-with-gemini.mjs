import * as fs from 'fs';
import * as path from 'path';

// Use fetch to call Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD4RVrn_qFLx0SQ5tVzNFy_dJsZxuZqEiQ';

const patternsFolder = 'C:\Users\adam\OneDrive\Desktop\Patterns';
const pdfFiles = [
  { file: 'HoneyBeeCrochetPattern.pdf', card: 'upload' },
  { file: 'EN-RealisticOctopusPatternbyCraftyIntentions.pdf', card: 'finished' },
  { file: '1775977254212-arcoiris_-_clues_1-4.pdf', card: 'mkal' },
  { file: 'SUNBURSTGRANNYSQUARECROCHETPATTERN.pdf', card: 'marina' }
];

async function extractWithGemini(pdfPath, cardType) {
  try {
    // Read PDF file as base64
    const fileBuffer = fs.readFileSync(pdfPath);
    const base64File = fileBuffer.toString('base64');
    
    // Call Gemini API with file
    const response = await fetch('https://generativelanguage.googleapis.com/upload/files?key=' + GEMINI_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: {
          mimeType: 'application/pdf',
          data: base64File
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    console.log(`✓ Processing ${path.basename(pdfPath)} for ${cardType} card`);
    return true;
  } catch (e) {
    console.log(`! ${path.basename(pdfPath)}: ${e.message}`);
    return false;
  }
}

console.log('Using Gemini API to extract pattern images...\n');

for (const pdf of pdfFiles) {
  const fullPath = path.join(patternsFolder, pdf.file);
  if (fs.existsSync(fullPath)) {
    await extractWithGemini(fullPath, pdf.card);
  }
}

console.log('\n✓ Extraction complete');
