import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const patternsFolder = 'C:\Users\adam\OneDrive\Desktop\Patterns';
const publicFolder = './public';

// Map PDFs to landing page cards
const pdfMap = {
  'HoneyBeeCrochetPattern.pdf': { card: 'upload', name: 'pattern-honey-bee.png', desc: 'Honey Bee amigurumi' },
  'EN-RealisticOctopusPatternbyCraftyIntentions.pdf': { card: 'finished', name: 'pattern-octopus.png', desc: 'Octopus amigurumi' },
  '1775977254212-arcoiris_-_clues_1-4.pdf': { card: 'mkal', name: 'pattern-mkal-arcoiris.png', desc: 'Arcoiris MKAL' },
  'SUNBURSTGRANNYSQUARECROCHETPATTERN.pdf': { card: 'marina', name: 'pattern-granny-square.png', desc: 'Sunburst Granny Square' }
};

console.log('Extracting images from pattern PDFs...\n');

(async () => {
  for (const [pdfName, config] of Object.entries(pdfMap)) {
    const pdfPath = path.join(patternsFolder, pdfName);
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`⊘ ${pdfName} not found`);
      continue;
    }

    try {
      // Use pdftoppm to extract first page as image
      const cmd = `pdftoppm "${pdfPath}" temp_${config.card} -png -singlefile -f 1 -l 1`;
      await execAsync(cmd);
      
      // Move to public folder
      const tempFile = `temp_${config.card}.png`;
      const destFile = path.join(publicFolder, config.name);
      
      if (fs.existsSync(tempFile)) {
        fs.copyFileSync(tempFile, destFile);
        fs.unlinkSync(tempFile);
        console.log(`✓ ${config.card}: ${config.desc}`);
        console.log(`  Saved to: public/${config.name}\n`);
      }
    } catch (e) {
      console.log(`! ${config.desc}: ${e.message.substring(0, 80)}`);
    }
  }

  console.log('\nTo use these images on the landing page:');
  console.log('- Upload card: /pattern-honey-bee.png');
  console.log('- Marina card: /pattern-granny-square.png');
  console.log('- MKAL card: /pattern-mkal-arcoiris.png');
  console.log('- Finished card: /pattern-octopus.png');
})();
