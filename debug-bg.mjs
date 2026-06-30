import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });

  // Go to slide 3 (MKAL)
  await desk.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('div')).filter(d => 
      d.style.height === '8px' && d.style.borderRadius === '4px'
    );
    if (dots[2]) dots[2].click();
  });

  await desk.waitForTimeout(500);

  const bgInfo = await desk.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    const mkalDiv = divs.find(d => {
      const bg = window.getComputedStyle(d).backgroundImage;
      return bg && bg.includes('wovely_landing_bg');
    });

    if (!mkalDiv) {
      return { error: 'MKAL div not found' };
    }

    const style = window.getComputedStyle(mkalDiv);
    return {
      found: true,
      backgroundImage: style.backgroundImage.substring(0, 80),
      backgroundSize: style.backgroundSize,
      backgroundPosition: style.backgroundPosition,
      height: mkalDiv.offsetHeight,
      width: mkalDiv.offsetWidth,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      hasMinHeight: mkalDiv.style.minHeight,
      childCount: mkalDiv.children.length
    };
  });

  console.log('=== MKAL MOCKUP DIV DEBUG ===');
  console.log(JSON.stringify(bgInfo, null, 2));

  await browser.close();
})();
