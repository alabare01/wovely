import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2000);

  // Go to slide 1
  await desk.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('div')).filter(d => 
      d.style.height === '8px' && d.style.borderRadius === '4px'
    );
    if (dots[0]) dots[0].click();
  });

  await desk.waitForTimeout(500);

  const slideText = await desk.evaluate(() => {
    const allText = document.body.innerText;
    return allText;
  });

  // Check if "Baby Blanket" appears
  if (slideText.includes('Baby Blanket')) {
    console.log('❌ PROBLEM: "Baby Blanket" still visible on Slide 1');
  } else {
    console.log('✓ FIXED: "Baby Blanket" is GONE');
  }

  if (slideText.includes('Marina the Manatee')) {
    console.log('✓ Marina the Manatee IS visible');
  }

  // Screenshot
  await desk.screenshot({ path: 'slide1-live.png' });
  console.log('✓ Screenshot saved: slide1-live.png');

  await browser.close();
})();
