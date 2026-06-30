import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();

  // Desktop version
  console.log('\n=== DESKTOP VERSION (1200px) ===\n');
  const desktopPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desktopPage.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait for components to render
  await desktopPage.waitForTimeout(2000);

  // Check for key elements
  const desktopContent = {
    hasWovelyHeader: await desktopPage.locator('text=Wovely').first().isVisible().catch(() => false),
    hasBevImage: await desktopPage.locator('img[alt="Bev"]').first().isVisible().catch(() => false),
    hasPreview: await desktopPage.locator('h2').filter({ hasText: /Save & Track|Bev Analyzes|Organize/ }).first().isVisible().catch(() => false),
    hasAuthToggle: await desktopPage.locator('text=Create account').first().isVisible().catch(() => false),
    hasSignInBtn: await desktopPage.locator('text=Sign in').first().isVisible().catch(() => false),
    hasAuthForm: await desktopPage.locator('input[type="email"]').first().isVisible().catch(() => false),
    hasGoogleBtn: await desktopPage.locator('text=Continue with Google').first().isVisible().catch(() => false),
    hasTryFreeBtn: await desktopPage.locator('text=Try free').first().isVisible().catch(() => false),
  };

  console.log('Visible Elements:');
  Object.entries(desktopContent).forEach(([key, value]) => {
    console.log(`  ${key}: ${value ? '✓ YES' : '✗ NO'}`);
  });

  // Take screenshot
  await desktopPage.screenshot({ path: 'C:\\Users\\adam\\wovely\\desktop-screenshot.png' });
  console.log('  Screenshot saved: desktop-screenshot.png');

  // Mobile version
  console.log('\n=== MOBILE VERSION (375px) ===\n');
  const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mobilePage.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  await mobilePage.waitForTimeout(2000);

  const mobileContent = {
    hasWovelyHeader: await mobilePage.locator('text=Wovely').first().isVisible().catch(() => false),
    hasBevImage: await mobilePage.locator('img[alt="Bev"]').first().isVisible().catch(() => false),
    hasFeatureText: await mobilePage.locator('text=Track Progress').first().isVisible().catch(() => false),
    hasAuthToggle: await mobilePage.locator('text=Create account').first().isVisible().catch(() => false),
    hasAuthForm: await mobilePage.locator('input[type="email"]').first().isVisible().catch(() => false),
    hasGoogleBtn: await mobilePage.locator('text=Continue with Google').first().isVisible().catch(() => false),
  };

  console.log('Visible Elements:');
  Object.entries(mobileContent).forEach(([key, value]) => {
    console.log(`  ${key}: ${value ? '✓ YES' : '✗ NO'}`);
  });

  // Take screenshot
  await mobilePage.screenshot({ path: 'C:\\Users\\adam\\wovely\\mobile-screenshot.png' });
  console.log('  Screenshot saved: mobile-screenshot.png');

  await browser.close();
  console.log('\n✓ Inspection complete');
})();
