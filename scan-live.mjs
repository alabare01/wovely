import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  
  // Desktop
  console.log('=== DESKTOP INSPECTION ===\n');
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(3000);

  const deskText = await desk.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n');
    return lines.filter(l => l.includes('Blanket') || l.includes('Marina') || l.includes('Manatee') || l.includes('by ') || l.includes('Round'));
  });

  console.log('Text with project names/authors:');
  deskText.forEach(t => {
    if (t.trim().length > 0) console.log(`  "${t.trim()}"`);
  });

  // Check background images
  const deskBg = await desk.evaluate(() => {
    return Array.from(document.querySelectorAll('div')).map(d => {
      const bg = window.getComputedStyle(d).backgroundImage;
      if (bg && bg.includes('wovely_landing_bg')) {
        return {
          bg: bg.substring(0, 60),
          offsetHeight: d.offsetHeight,
          offsetWidth: d.offsetWidth
        };
      }
      return null;
    }).filter(Boolean);
  });

  console.log('\nBackground image divs found:');
  if (deskBg.length === 0) {
    console.log('  NONE - background image NOT being used');
  } else {
    deskBg.forEach(b => console.log(`  ${b.bg}... (${b.offsetWidth}x${b.offsetHeight})`));
  }

  // Mobile
  console.log('\n=== MOBILE INSPECTION ===\n');
  const mob = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mob.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await mob.waitForTimeout(3000);

  const mobText = await mob.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n');
    return lines.filter(l => l.includes('Blanket') || l.includes('Marina') || l.includes('Manatee') || l.includes('by ') || l.includes('Upload'));
  });

  console.log('Text on mobile:');
  mobText.forEach(t => {
    if (t.trim().length > 0) console.log(`  "${t.trim()}"`);
  });

  // Check for images
  const mobImg = await mob.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map(img => ({
      alt: img.alt,
      src: img.src.split('/').pop(),
      visible: img.offsetHeight > 0
    }));
  });

  console.log('\nImages on mobile:');
  mobImg.forEach(img => console.log(`  ${img.alt}: ${img.src} (visible: ${img.visible})`));

  await browser.close();
})();
