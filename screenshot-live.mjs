import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();

  // Desktop
  console.log('Screenshotting LIVE desktop...');
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle', timeout: 30000 });
  await desk.waitForTimeout(2000);
  await desk.screenshot({ path: 'live-desktop.png' });
  console.log('✓ Saved live desktop screenshot');

  // Mobile
  console.log('Screenshotting LIVE mobile...');
  const mob = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mob.goto('https://wovely.app', { waitUntil: 'networkidle', timeout: 30000 });
  await mob.waitForTimeout(2000);
  await mob.screenshot({ path: 'live-mobile.png' });
  console.log('✓ Saved live mobile screenshot');

  await browser.close();
  console.log('✓ Done');
})();
