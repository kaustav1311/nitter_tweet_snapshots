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
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36");

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    if (url.includes('x.com') || url.includes('twitter.com')) {
      // Remove login modals
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

      await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
      const tweetElements = await page.$$('[data-testid="tweet"]');
      const tweetElement = tweetElements?.[0];

      if (!tweetElement) throw new Error('Tweet element not found');
      const box = await tweetElement.boundingBox();
      await tweetElement.screenshot({ path: filePath, clip: box });
    } else {
      await page.waitForSelector('.main-tweet, article, .tweet-body', { timeout: 10000 });
      const element = await page.$('.main-tweet') || await page.$('article') || await page.$('.tweet-body');
      if (!element) throw new Error('Nitter tweet element not found');
      const box = await element.boundingBox();
      await element.screenshot({ path: filePath, clip: box });
    }

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
