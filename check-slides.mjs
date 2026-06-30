import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2000);

  console.log('=== CAROUSEL SLIDES ===\n');

  // Check all 3 slides
  for (let i = 0; i < 3; i++) {
    // Click dot to go to slide i
    await desk.evaluate((idx) => {
      const dots = Array.from(document.querySelectorAll('div')).filter(d => 
        d.style.height === '8px' && d.style.borderRadius === '4px'
      );
      if (dots[idx]) dots[idx].click();
    }, i);

    await desk.waitForTimeout(500);

    const slideContent = await desk.evaluate(() => {
      const h2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.length > 0);
      const allText = document.body.innerText;
      const lines = allText.split('\n').filter(l => 
        l.includes('Blanket') || l.includes('Marina') || l.includes('Manatee') || 
        l.includes('by ') || l.includes('Round') || l.includes('Clue') || l.includes('MKAL')
      );
      return {
        title: h2 ? h2.textContent.substring(0, 60) : 'No title found',
        content: lines
      };
    });

    console.log(`SLIDE ${i + 1}:`);
    console.log(`  Title: ${slideContent.title}`);
    console.log(`  Content:`);
    slideContent.content.forEach(c => {
      if (c.trim().length > 0) console.log(`    "${c.trim()}"`);
    });
    console.log();
  }

  await browser.close();
})();
