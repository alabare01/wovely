import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  
  let attempts = 0;
  let hasMarinaImg = false;
  
  while (attempts < 8 && !hasMarinaImg) {
    await mobile.goto('https://wovely.app', { waitUntil: 'networkidle' });
    await mobile.waitForTimeout(1500);
    
    hasMarinaImg = await mobile.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const maninaImgs = imgs.filter(img => img.src.includes('manatee') && img.offsetHeight > 0);
      return maninaImgs.length >= 2; // Should have at least 2 manatee images (Marina + Finished)
    });
    
    attempts++;
  }

  if (hasMarinaImg) {
    console.log('✓ DEPLOY LIVE: Images showing');
  } else {
    console.log('❌ Still waiting for deploy...');
  }

  // Check blur
  const blurStatus = await mobile.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div')).filter(d => {
      const style = window.getComputedStyle(d);
      return d.textContent.includes('Upload') && style.backdropFilter && style.backdropFilter !== 'none';
    });
    return {
      cardsWithBlur: cards.length,
      sampleBlur: cards[0] ? window.getComputedStyle(cards[0]).backdropFilter : 'none'
    };
  });

  console.log('\nBlur effect status:');
  console.log(`  Cards with blur: ${blurStatus.cardsWithBlur}`);
  console.log(`  Sample blur value: ${blurStatus.sampleBlur}`);

  // Screenshot
  await mobile.screenshot({ path: 'VERIFY-DEPLOY.png' });
  console.log('\nScreenshot: VERIFY-DEPLOY.png');

  await browser.close();
})();
