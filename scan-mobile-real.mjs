import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mobile.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);

  console.log('=== MOBILE CARD ANALYSIS ===\n');

  const cards = await mobile.evaluate(() => {
    const cardDivs = Array.from(document.querySelectorAll('div')).filter(d => 
      d.textContent.includes('Upload') || d.textContent.includes('Marina') || 
      d.textContent.includes('Spring') || d.textContent.includes('Finished')
    );

    return cardDivs.map((card, i) => {
      const backdropFilter = window.getComputedStyle(card).backdropFilter;
      const imgs = Array.from(card.querySelectorAll('img')).map(img => ({
        src: img.src.split('/').pop(),
        height: img.height,
        width: img.width,
        visible: img.offsetHeight > 0
      }));
      
      const titleText = Array.from(card.querySelectorAll('div')).find(d => 
        d.textContent.includes('Upload') || d.textContent.includes('Marina') ||
        d.textContent.includes('Spring') || d.textContent.includes('Finished')
      )?.textContent.split('\n')[0] || 'Unknown';

      return {
        title: titleText,
        backdropFilter: backdropFilter || 'NONE',
        imageCount: imgs.length,
        images: imgs
      };
    }).slice(0, 4);
  });

  cards.forEach((card, i) => {
    console.log(`CARD ${i + 1}: ${card.title}`);
    console.log(`  Blur effect: ${card.backdropFilter}`);
    console.log(`  Images: ${card.imageCount}`);
    card.images.forEach(img => {
      console.log(`    - ${img.src} (${img.width}x${img.height}, visible: ${img.visible})`);
    });
    console.log();
  });

  await mobile.screenshot({ path: 'SCAN-MOBILE.png' });
  console.log('Screenshot: SCAN-MOBILE.png');

  await browser.close();
})();
