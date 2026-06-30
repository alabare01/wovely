import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app');
  await desk.waitForTimeout(2000);

  const labels = await desk.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n');
    // Get lines that have project names/details
    return lines.filter(l => 
      l.includes('Finished') || l.includes('Marina') || l.includes('Amigurumi') ||
      l.includes('Completed') || l.includes('Stuffed') || l.includes('by ')
    ).slice(0, 15);
  });

  console.log('=== CARD LABELS ON SLIDE 1 ===\n');
  labels.forEach(l => {
    if (l.trim().length > 0) {
      console.log(l);
    }
  });

  await browser.close();
})();
