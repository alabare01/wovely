import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

  // Navigate to the live app
  await page.goto('https://wovely.app', { waitUntil: 'networkidle', timeout: 30000 });

  console.log('Waiting for app to load...');
  await page.waitForTimeout(3000);

  // Check if we're logged in or at auth screen
  const isAuth = await page.locator('text=Create account').isVisible().catch(() => false);

  if (isAuth) {
    console.log('❌ App is showing auth screen - need to be logged in to screenshot features');
    console.log('Please log in to https://wovely.app and re-run this script');
  } else {
    console.log('✓ App loaded, attempting to capture feature screenshots...');

    // Try to capture Dashboard
    try {
      await page.screenshot({ path: 'C:\\Users\\adam\\wovely\\app-dashboard.png' });
      console.log('✓ Dashboard screenshot saved');
    } catch (e) {
      console.log('Dashboard screenshot failed:', e.message);
    }
  }

  await browser.close();
})();
