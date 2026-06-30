import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  
  console.log('=== SLIDE 1: Your patterns in one place ===\n');
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2000);

  const slide1 = await desk.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n').filter(l => 
      l.includes('Finished') || l.includes('Marina') || l.includes('Amigurumi') || 
      l.includes('by ') || l.includes('Completed')
    );
    return lines.filter(l => l.trim().length > 0);
  });

  slide1.forEach(l => console.log(l));

  await desk.screenshot({ path: 'final-slide1.png' });
  console.log('\n✓ Screenshot: final-slide1.png');

  // Slide 2
  console.log('\n=== SLIDE 2: Track every stitch ===\n');
  await desk.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('div')).filter(d => 
      d.style.height === '8px' && d.style.borderRadius === '4px'
    );
    if (dots[1]) dots[1].click();
  });

  await desk.waitForTimeout(500);

  const slide2 = await desk.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n').filter(l => l.includes('Marina') || l.includes('Rnd'));
    return lines.filter(l => l.trim().length > 0).slice(0, 5);
  });

  slide2.forEach(l => console.log(l));

  // Slide 3
  console.log('\n=== SLIDE 3: MKAL (now simplified) ===\n');
  await desk.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('div')).filter(d => 
      d.style.height === '8px' && d.style.borderRadius === '4px'
    );
    if (dots[2]) dots[2].click();
  });

  await desk.waitForTimeout(500);

  const slide3 = await desk.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n').filter(l => l.includes('Spring') || l.includes('Clue'));
    return lines.filter(l => l.trim().length > 0).slice(0, 5);
  });

  slide3.forEach(l => console.log(l));

  await desk.screenshot({ path: 'final-slide3.png' });
  console.log('✓ Screenshot: final-slide3.png');

  await browser.close();
})();
