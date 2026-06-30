import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app');
  await desk.waitForTimeout(2000);
  await desk.screenshot({ path: 'NOW.png' });
  console.log('Saved NOW.png');
  await browser.close();
})();
