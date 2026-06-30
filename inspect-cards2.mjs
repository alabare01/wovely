import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await desk.goto('https://wovely.app', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2000);

  const cardInfo = await desk.evaluate(() => {
    // Find all text nodes with "Finished" or "Marina"
    const allText = document.body.innerText;
    const hasFinished = allText.includes('Finished');
    const hasMarina = allText.includes('Marina');
    const hasAmigurumi = allText.includes('Stuffed toys');

    // Look for the grid container more carefully
    const allDivs = Array.from(document.querySelectorAll('div'));
    const possibleGrids = allDivs.filter(d => {
      const style = window.getComputedStyle(d);
      return style.display === 'grid';
    });

    return {
      pageHasFinished: hasFinished,
      pageHasMarina: hasMarina,
      pageHasStuffedToys: hasAmigurumi,
      gridDivsFound: possibleGrids.length,
      grids: possibleGrids.map(g => ({
        templateColumns: window.getComputedStyle(g).gridTemplateColumns,
        childrenCount: g.children.length,
        visible: g.offsetHeight > 0
      }))
    };
  });

  console.log(JSON.stringify(cardInfo, null, 2));

  await browser.close();
})();
