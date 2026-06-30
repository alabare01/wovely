import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  
  // Wait for deploy
  let attempts = 0;
  let hasFinished = false;
  
  while (attempts < 10 && !hasFinished) {
    await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });
    await desk.waitForTimeout(1500);
    
    hasFinished = await desk.evaluate(() => {
      return document.body.innerText.includes('Finished');
    });
    
    attempts++;
  }

  if (hasFinished) {
    console.log('✓ DEPLOYED: New code is live');
    
    const content = await desk.evaluate(() => {
      const allText = document.body.innerText;
      const lines = allText.split('\n');
      return lines.filter(l => 
        l.includes('Finished') || l.includes('Amigurumi') || 
        l.includes('Marina') || l.includes('Completed') ||
        l.includes('Stuffed')
      ).filter(l => l.trim().length > 0).slice(0, 10);
    });
    
    console.log('\n=== SLIDE 1 CONTENT ===');
    content.forEach(l => console.log(l));
    
    await desk.screenshot({ path: 'FINAL-SLIDE1.png' });
    console.log('\n✓ Screenshot: FINAL-SLIDE1.png');
  } else {
    console.log('❌ Deploy still not live after 10 attempts');
  }

  await browser.close();
})();
