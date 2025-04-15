const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const DATE = new Date().toISOString().split('T')[0].replace(/-/g, '');
const INPUT_PATH = path.join(__dirname, `../public/community_feed/twitter_${DATE}.json`);
const OUTPUT_DIR = path.join(__dirname, `../screenshots/${DATE}`);

async function readTweetList() {
  const raw = fs.readFileSync(INPUT_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function takeTweetScreenshot(tweet, browser) {
  const id = tweet.id;
  const url = tweet.link;
  const filePath = path.join(OUTPUT_DIR, `tweet_${id}.png`);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1000 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    // Remove modals (login, etc.)
    await page.evaluate(() => {
      const selectors = [
        '[data-testid="sheetDialog"]',
        '[data-testid="app-bar-close"]',
        '[role="dialog"]'
      ];
      selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.remove();
      });
    });

    // Wait for tweet card
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
    const tweetElement = await page.$('[data-testid="tweet"]');

    if (!tweetElement) throw new Error('Tweet element not found');

    await tweetElement.screenshot({ path: filePath });
    console.log(`✅ Saved: tweet_${id}.png`);
    await page.close();
  } catch (err) {
    console.error(`❌ Error for tweet ${id}: ${err.message}`);
  }
}

(async () => {
  try {
    const tweets = await readTweetList();
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (const tweet of tweets) {
      await takeTweetScreenshot(tweet, browser);
    }

    await browser.close();
  } catch (err) {
    console.error('🔥 Screenshot script failed:', err.message);
    process.exit(1);
  }
})();

