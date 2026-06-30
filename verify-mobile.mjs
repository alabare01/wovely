import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mobile.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);

  // Check feature cards
  const cards = await mobile.evaluate(() => {
    const cardDivs = Array.from(document.querySelectorAll('div')).filter(d => d.textContent.includes('by') && d.textContent.includes('Track'));
    return cardDivs.slice(0, 2).map(card => ({
      text: card.textContent.substring(0, 150)
    }));
  });

  console.log('=== MOBILE CARDS TEXT ===');
  cards.forEach((card, i) => {
    console.log(`Card ${i}:\n${card.text}\n`);
  });

  // Check images actually loaded
  const images = await mobile.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt,
      width: img.width,
      height: img.height,
      loaded: img.complete && img.naturalHeight > 0
    }));
  });

  console.log('\n=== IMAGES STATUS ===');
  images.forEach(img => {
    console.log(`${img.alt}: loaded=${img.loaded}, size=${img.width}x${img.height}`);
  });

  await browser.close();
})();
