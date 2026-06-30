import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2000);

  const cardInfo = await desk.evaluate(() => {
    // Find all cards on Slide 1
    const allDivs = Array.from(document.querySelectorAll('div'));
    const cards = allDivs.filter(d => {
      const styles = window.getComputedStyle(d);
      return styles.display === 'grid' && d.textContent.includes('Finished') || d.textContent.includes('Marina');
    });

    if (cards.length === 0) {
      return { error: 'No grid divs found' };
    }

    const gridDiv = cards[0];
    return {
      gridDisplay: window.getComputedStyle(gridDiv).gridTemplateColumns,
      gridGap: window.getComputedStyle(gridDiv).gap,
      childCount: gridDiv.children.length,
      children: Array.from(gridDiv.children).map((child, i) => ({
        index: i,
        textContent: child.textContent.substring(0, 100),
        offsetWidth: child.offsetWidth,
        offsetHeight: child.offsetHeight,
        display: window.getComputedStyle(child).display
      }))
    };
  });

  console.log(JSON.stringify(cardInfo, null, 2));

  await browser.close();
})();
