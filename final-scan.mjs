import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  
  // Try multiple times to catch the deploy
  for (let i = 0; i < 12; i++) {
    await mobile.goto('https://wovely.app', { waitUntil: 'networkidle' });
    await mobile.waitForTimeout(1000);
    
    const imgs = await mobile.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .filter(img => img.offsetHeight > 0)
        .map(img => img.src.split('/').pop());
    });

    if (imgs.includes('manatee_hero.png') && imgs.length >= 4) {
      console.log(`✓ LIVE (attempt ${i + 1}): All images deployed`);
      console.log(`Images: ${imgs.join(', ')}`);
      break;
    }

    if (i === 11) {
      console.log(`Still loading... Current: ${imgs.join(', ')}`);
    }
  }

  await mobile.screenshot({ path: 'FINAL-SCAN.png' });
  console.log('\nScreenshot: FINAL-SCAN.png');

  await browser.close();
})();
