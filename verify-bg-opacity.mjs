import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2000);

  // Go to slide 3 (MKAL)
  await desk.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('div')).filter(d => 
      d.style.height === '8px' && d.style.borderRadius === '4px'
    );
    if (dots[2]) dots[2].click();
  });

  await desk.waitForTimeout(500);

  const result = await desk.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    const mkalDiv = divs.find(d => {
      const bg = window.getComputedStyle(d).backgroundImage;
      return bg && bg.includes('wovely_landing_bg');
    });

    if (mkalDiv) {
      // Check the overlay child
      const overlayDiv = Array.from(mkalDiv.children).find(c => {
        const bg = window.getComputedStyle(c).background || window.getComputedStyle(c).backgroundColor;
        return bg && bg.includes('rgba');
      });

      if (overlayDiv) {
        const overlayStyle = window.getComputedStyle(overlayDiv);
        return {
          backgroundFound: true,
          backgroundImage: window.getComputedStyle(mkalDiv).backgroundImage.substring(0, 60),
          overlayBackground: overlayStyle.background,
          overlayOpacity: overlayStyle.opacity,
          containerHeight: mkalDiv.offsetHeight
        };
      }
    }

    return { error: 'DIV not found' };
  });

  console.log(JSON.stringify(result, null, 2));

  // Take a screenshot of slide 3
  await desk.screenshot({ path: 'slide3-live.png' });
  console.log('\nScreenshot saved: slide3-live.png');

  await browser.close();
})();
