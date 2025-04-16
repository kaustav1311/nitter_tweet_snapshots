const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Get date from environment or current day
const DATE = process.env.SNAPSHOT_DATE || new Date().toISOString().split('T')[0].replace(/-/g, '');
const INPUT_PATH = path.join(__dirname, `../public/community_feed/twitter_${DATE}.json`);
const OUTPUT_DIR = path.join(__dirname, `../screenshots/${DATE}`);

// Configure timeout constants
const PAGE_TIMEOUT = 40000;
const ELEMENT_TIMEOUT = 20000;

async function readTweetList() {
  try {
    if (!fs.existsSync(INPUT_PATH)) {
      console.error(`❌ Input file not found: ${INPUT_PATH}`);
      console.log('Available files in directory:');
      const dir = path.join(__dirname, '../public/community_feed/');
      if (fs.existsSync(dir)) {
        console.log(fs.readdirSync(dir));
      }
      throw new Error('Input file not found');
    }
    
    const raw = fs.readFileSync(INPUT_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading tweet list: ${err.message}`);
    throw err;
  }
}

async function takeTweetScreenshot(tweet, browser, retryCount = 0) {
  const id = tweet.id;
  const url = tweet.link;
  const filePath = path.join(OUTPUT_DIR, `tweet_${id}.png`);
  let page = null;

  try {
    page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1000 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36");
    
    // Set longer timeouts for redirects, especially on Twitter
    await page.setDefaultNavigationTimeout(PAGE_TIMEOUT);
    
    console.log(`🔍 Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });

    if (url.includes('x.com') || url.includes('twitter.com')) {
      // Remove login modals and other overlays
      await page.evaluate(() => {
        const selectors = [
          '[data-testid="sheetDialog"]',
          '[data-testid="app-bar-close"]',
          '[role="dialog"]',
          '[aria-label="Close"]',
          '[data-testid="mask"]',
          '[data-testid="SignupModal"]'
        ];
        selectors.forEach(sel => {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => el.remove());
        });
        
        // Also remove fixed position elements that might overlay the tweet
        const fixedElements = document.querySelectorAll('[style*="position: fixed"]');
        fixedElements.forEach(el => {
          if (!el.closest('[data-testid="tweet"]')) {
            el.remove();
          }
        });
      });

      // Wait for tweet content to load
      console.log(`⏳ Waiting for tweet content for ${id}`);
      await page.waitForSelector('[data-testid="tweet"]', { timeout: ELEMENT_TIMEOUT })
        .catch(e => console.warn(`Warning: Selector wait timed out for ${id}, but proceeding: ${e.message}`));
      
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

      // Get the tweet element for screenshot - retry with multiple selectors
      const selectors = ['[data-testid="tweet"]', 'article', '.css-1dbjc4n.r-18u37iz'];
      let tweetElement = null;
      
      for (const selector of selectors) {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          tweetElement = elements[0];
          console.log(`Found tweet element with selector: ${selector}`);
          break;
        }
      }

      if (!tweetElement) {
        console.log('Taking full page screenshot as fallback');
        await page.screenshot({ path: filePath });
        console.log(`✅ Saved full page screenshot: tweet_${id}.png`);
      } else {
        // Get dimensions and take screenshot
        const box = await tweetElement.boundingBox();
        await tweetElement.screenshot({ path: filePath, clip: box });
        console.log(`✅ Saved: tweet_${id}.png ${hasVideo ? '(video content)' : ''}`);
      }
    } else {
      // Nitter site handling with video improvements
      const nitterSelectors = ['.main-tweet', 'article', '.tweet-body', '.timeline-item'];
      let found = false;
      
      for (const selector of nitterSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000 });
          found = true;
          console.log(`Found element with selector: ${selector}`);
          break;
        } catch (e) {
          console.log(`Selector ${selector} not found, trying next...`);
        }
      }
      
      if (!found) {
        console.log('No Nitter elements found, taking full page screenshot');
        await page.screenshot({ path: filePath });
        console.log(`✅ Saved full page screenshot: tweet_${id}.png`);
        await page.close();
        return;
      }
      
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
      
      // Try different selectors to find the tweet element
      let element = null;
      for (const selector of nitterSelectors) {
        element = await page.$(selector);
        if (element) break;
      }
      
      if (!element) {
        console.log('Taking full page screenshot as fallback for Nitter');
        await page.screenshot({ path: filePath });
      } else {
        const box = await element.boundingBox();
        await element.screenshot({ path: filePath, clip: box });
      }
      
      console.log(`✅ Saved: tweet_${id}.png ${hasVideo ? '(video content)' : ''}`);
    }

    await page.close();
  } catch (err) {
    console.error(`❌ Error for tweet ${id}: ${err.message}`);
    
    // If page is still open, close it
    if (page) {
      try {
        // Take a debug screenshot before closing
        const debugPath = path.join(OUTPUT_DIR, `debug_${id}.png`);
        await page.screenshot({ path: debugPath, fullPage: true });
        console.log(`📸 Debug screenshot saved to ${debugPath}`);
        
        await page.close();
      } catch (e) {
        console.error(`Error closing page: ${e.message}`);
      }
    }
    
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

    // Launch browser with explicit Chrome path for GitHub Actions
    const browser = await puppeteer.launch({
      // Use new headless mode
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--autoplay-policy=no-user-gesture-required'
      ],
      // Add timeout for browser launch
      timeout: 60000
    });
    
    console.log('✅ Browser launched successfully');

    // Sort tweets to process potential videos first (they need more time)
    const sortedTweets = [...tweets].sort((a, b) => {
      if (mightContainVideo(a) && !mightContainVideo(b)) return -1;
      if (!mightContainVideo(a) && mightContainVideo(b)) return 1;
      return 0;
    });

    // Process tweets in sequence with a delay between each
    for (const tweet of sortedTweets) {
      await takeTweetScreenshot(tweet, browser);
      // Add a small delay between processing tweets to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await browser.close();
    console.log(`✅ Screenshot processing complete for ${DATE}`);
  } catch (err) {
    console.error('🔥 Screenshot script failed:', err.message);
    console.error('💡 TIP: If this is a Chrome installation issue, try modifying the GitHub workflow file');
    process.exit(1);
  }
})();
