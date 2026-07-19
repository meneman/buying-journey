const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node crawl-and-extract.js <url> [screenshotPath]');
    process.exit(1);
  }

  const screenshotPath = process.argv[3];
  
  console.log(`Launching headless browser for URL: ${url}...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('Extracting page content...');
    const pageTitle = await page.title();
    const pageText = await page.evaluate(() => document.body.innerText);

    console.log('=== CRAWL SUCCESSFUL ===');
    console.log(`Title: ${pageTitle}`);
    
    // Save to temp file
    const outputDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFilePath = path.join(outputDir, 'last-crawl.json');
    const result = {
      url,
      title: pageTitle,
      text: pageText,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(outputFilePath, JSON.stringify(result, null, 2));
    console.log(`Extracted text saved to: ${outputFilePath}`);

    if (screenshotPath) {
      console.log(`Taking screenshot to: ${screenshotPath}...`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

  } catch (error) {
    console.error('Crawl Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
