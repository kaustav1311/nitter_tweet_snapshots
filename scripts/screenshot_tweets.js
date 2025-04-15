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

async function takeTweetScreenshot(tweet, browser, retryCount = 0) {
  const id = tweet.id;
  const url = tweet.link;
  const filePath = path.join(OUTPUT_DIR, `tweet_${id}.png`);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1000 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36");

    // Add longer timeout for media to load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    if (url.includes('x.com') || url.includes('twitter.com')) {
      // Remove login modals and other overlays
      await page.evaluate(() => {
        const selectors = [
          '[data-testid="sheetDialog"]',
          '[data-testid="app-bar-close"]',
          '[role="dialog"]',
          '[aria-label="Close"]',
          '[data-testid="mask"]'
        ];
        selectors.forEach(sel => {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => el.remove());
        });
      });

      // Wait for tweet content to load
      await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
      
      // Check if tweet has video content
      const hasVideo = await page.evaluate(() => {
        return document.querySelector('video, [data-testid="videoPlayer"], [aria-label*="Video"]') !== null;
      });
      
      if (hasVideo) {
        console.log(`Tweet ${id} contains video content`);
        
        // Wait for video thumbnail to load
        await page.waitForTimeout(2000);
        
        // Ensure video preview is visible
        await page.evaluate(() => {
          // Force video elements to show poster/thumbnail
          const videoElements = document.querySelectorAll('video');
          videoElements.forEach(video => {
            // Pause any playing videos
            if (!video.paused) video.pause();
            
            // If video has poster attribute, ensure it's displayed
            if (video.poster) {
              video.currentTime = 0;
              video.load(); // Reload to show poster
            }
          });
          
          // Scroll to make sure video is in view
          const videoContainer = document.querySelector('video, [data-testid="videoPlayer"], [aria-label*="Video"]');
          if (videoContainer) videoContainer.scrollIntoView({ behavior: 'instant', block: 'center' });
          
          // If there's a play button overlay, keep it visible
          const playButtons = document.querySelectorAll('[aria-label*="Play"], [role="button"][aria-label*="video"]');
          playButtons.forEach(btn => {
            // Prevent any click handlers from firing
            btn.style.pointerEvents = 'none';
          });
        });
        
        // Additional wait to ensure thumbnail is visible
        await page.waitForTimeout(1000);
      }

      // Get the tweet element for screenshot
      const tweetElements = await page.$$('[data-testid="tweet"]');
      const tweetElement = tweetElements?.[0];

      if (!tweetElement) throw new Error('Tweet element not found');
      
      // Get dimensions and take screenshot
      const box = await tweetElement.boundingBox();
      await tweetElement.screenshot({ path: filePath, clip: box });
      console.log(`✅ Saved: tweet_${id}.png ${hasVideo ? '(video content)' : ''}`);
    } else {
      // Nitter site handling with video improvements
      await page.waitForSelector('.main-tweet, article, .tweet-body', { timeout: 15000 });
      
      // Check for video content
      const hasVideo = await page.evaluate(() => {
        return document.querySelector('.still-image, .video-container, .gif-player') !== null;
      });
      
      if (hasVideo) {
        console.log(`Tweet ${id} contains video content on Nitter`);
        
        // Ensure video preview is visible (Nitter-specific)
        await page.evaluate(() => {
          // For Nitter's video containers
          const stillImages = document.querySelectorAll('.still-image');
          stillImages.forEach(img => {
            if (img.style.display === 'none') img.style.display = 'block';
          });
          
          // Disable click handlers on play buttons
          const playButtons = document.querySelectorAll('.video-overlay, .play-button');
          playButtons.forEach(btn => {
            btn.style.pointerEvents = 'none';
          });
        });
        
        // Wait for video thumbnail/preview to load
        await page.waitForTimeout(2000);
      }
      
      const element = await page.$('.main-tweet') || await page.$('article') || await page.$('.tweet-body');
      if (!element) throw new Error('Nitter tweet element not found');
      const box = await element.boundingBox();
      await element.screenshot({ path: filePath, clip: box });
      console.log(`✅ Saved: tweet_${id}.png ${hasVideo ? '(video content)' : ''}`);
    }

    await page.close();
  } catch (err) {
    console.error(`❌ Error for tweet ${id}: ${err.message}`);
    
    // Retry logic (max 2 retries)
    if (retryCount < 2) {
      console.log(`Retrying screenshot for tweet ${id} (attempt ${retryCount + 1})...`);
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      return takeTweetScreenshot(tweet, browser, retryCount + 1);
    } else {
      console.error(`Failed to capture tweet ${id} after ${retryCount + 1} attempts.`);
    }
  }
}

// Check if tweet potentially contains video based on ID or metadata
function mightContainVideo(tweet) {
  // If we have explicit metadata (from fetch script)
  if (tweet.has_video) return true;
  
  // Otherwise make best guess based on URL
  if (tweet.link && tweet.link.includes('video')) return true;
  
  return false;
}

(async () => {
  try {
    const tweets = await readTweetList();
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log(`📸 Processing ${tweets.length} tweets for ${DATE}`);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--autoplay-policy=no-user-gesture-required' // Help with video loading
      ]
    });

    // Sort tweets to process potential videos first (they need more time)
    const sortedTweets = [...tweets].sort((a, b) => {
      if (mightContainVideo(a) && !mightContainVideo(b)) return -1;
      if (!mightContainVideo(a) && mightContainVideo(b)) return 1;
      return 0;
    });

    // Process tweets in sequence
    for (const tweet of sortedTweets) {
      await takeTweetScreenshot(tweet, browser);
    }

    await browser.close();
    console.log(`✅ Screenshot processing complete for ${DATE}`);
  } catch (err) {
    console.error('🔥 Screenshot script failed:', err.message);
    process.exit(1);
  }
})();
