import fs from 'fs';

const API_KEY = process.env.GEMINI_API_KEY;
const pdfPath = 'C:\Users\adam\OneDrive\Desktop\Patterns\HoneyBeeCrochetPattern.pdf';

console.log('Sending PDF to Gemini for analysis...');

const pdfBuffer = fs.readFileSync(pdfPath);
const base64 = pdfBuffer.toString('base64');

const payload = {
  contents: [{
    parts: [
      {
        inline_data: {
          mime_type: 'application/pdf',
          data: base64
        }
      },
      {
        text: 'What is the main subject/pattern shown in this crochet pattern PDF? Describe it in 1-2 sentences for a landing page.'
      }
    ]
  }]
};

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(r => r.json())
.then(data => {
  if (data.contents?.[0]?.parts?.[0]?.text) {
    console.log('✓ Gemini response:');
    console.log(data.contents[0].parts[0].text);
  } else {
    console.log('Response:', JSON.stringify(data, null, 2));
  }
})
.catch(e => console.error('Error:', e.message));
