import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mobile.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);

  // Check what images are actually loaded
  const images = await mobile.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt,
      visible: img.offsetHeight > 0,
      width: img.width,
      height: img.height
    }));
  });

  console.log('=== IMAGES ON MOBILE ===');
  images.forEach(img => {
    console.log(`- src: ${img.src}`);
    console.log(`  alt: ${img.alt}, visible: ${img.visible}, w: ${img.width}, h: ${img.height}`);
  });

  // Check divs with background images
  const bgImages = await mobile.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    return divs
      .filter(d => {
        const bg = window.getComputedStyle(d).backgroundImage;
        return bg && bg !== 'none';
      })
      .map(d => ({
        classes: d.className,
        bg: window.getComputedStyle(d).backgroundImage,
        visible: d.offsetHeight > 0
      }));
  });

  console.log('\n=== BACKGROUND IMAGES ===');
  bgImages.forEach(bg => {
    console.log(`- bg: ${bg.bg}`);
    console.log(`  visible: ${bg.visible}`);
  });

  await browser.close();
})();
