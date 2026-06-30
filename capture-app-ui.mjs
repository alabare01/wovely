import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();

  console.log('Capturing actual app screenshots for landing page...\n');

  // Try to get screenshots of the real app UI
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

  try {
    await page.goto('https://wovely.app/dashboard', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Check if we're logged in
    const isLoggedIn = await page.evaluate(() => {
      return !document.body.innerText.includes('Create account') && 
             !document.body.innerText.includes('Sign in');
    });

    if (isLoggedIn) {
      console.log('✓ Logged in - capturing app UI screenshots');
      
      // Dashboard
      await page.screenshot({ path: 'app-dashboard.png' });
      console.log('  - Saved: app-dashboard.png (dashboard)');
      
      // Try to navigate to a pattern
      await page.click('button:has-text("patterns")', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'app-patterns.png' });
      console.log('  - Saved: app-patterns.png');
      
    } else {
      console.log('❌ Not logged in - need auth to capture app UI');
      console.log('Need actual screenshots of:');
      console.log('  1. Row manager/tracker (for Marina card)');
      console.log('  2. Collections view (for MKAL card)');
      console.log('  3. Pattern card/gallery view (for Upload card)');
      console.log('  4. Sharing/finished view (for Finished card)');
    }
  } catch (e) {
    console.log('Could not access app:', e.message);
    console.log('\nAlternative: Upload these images to the public folder:');
    console.log('  - upload-experience.png (add/import UI)');
    console.log('  - row-tracker-ui.png (Marina tracking)');
    console.log('  - collections-ui.png (MKAL view)');
    console.log('  - sharing-ui.png (finished projects)');
  }

  await browser.close();
})();
