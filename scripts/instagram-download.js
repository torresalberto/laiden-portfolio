const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const TARGET_USER = args[0] || process.env.INSTAGRAM_USER || 'laiden';
const OUTPUT_DIR = args[1] || process.env.INSTAGRAM_OUTPUT || './images/download';
const MAX_IMAGES = parseInt(args[2] || process.env.INSTAGRAM_MAX || '100');
const SKIP = parseInt(args[3] || process.env.INSTAGRAM_SKIP || '0');
const LOGIN_USER = args[4] || process.env.INSTAGRAM_LOGIN_USER || null;
const LOGIN_PASS = args[5] || process.env.INSTAGRAM_LOGIN_PASS || null;

console.log(`📥 Instagram Downloader`);
console.log(`   Target:   @${TARGET_USER}`);
console.log(`   Output:   ${OUTPUT_DIR}`);
console.log(`   Max:      ${MAX_IMAGES} images`);
console.log(`   Skip:     ${SKIP} images`);
if (LOGIN_USER) console.log(`   Logged in as: @${LOGIN_USER}`);
console.log(`---`);

async function downloadInstagramImages() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const page = await browser.newPage();
  
  await page.setViewport({ width: 1080, height: 1920 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Basic stealth only
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    if (LOGIN_USER && LOGIN_PASS) {
      console.log(`Logging in as @${LOGIN_USER}...`);
      console.log('Navigating to login page...');
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      // Wait for page to fully load
      await new Promise(r => setTimeout(r, 5000));
      
      // Try multiple selectors for username/password fields
      const selectors = {
        username: [
          'input[name="username"]',
          'input[type="text"]', 
          'input[id="username"]',
          'input[aria-label="Phone number, username, or email"]'
        ],
        password: [
          'input[name="password"]',
          'input[type="password"]',
          'input[id="password"]',
          'input[aria-label="Password"]'
        ]
      };
      
      let usernameInput = null;
      let passwordInput = null;
      
      for (const sel of selectors.username) {
        usernameInput = await page.$(sel);
        if (usernameInput) break;
      }
      for (const sel of selectors.password) {
        passwordInput = await page.$(sel);
        if (passwordInput) break;
      }
      
      if (usernameInput && passwordInput) {
        console.log('Found login form, entering credentials...');
        await usernameInput.type(LOGIN_USER, { delay: 150 });
        await new Promise(r => setTimeout(r, 500));
        await passwordInput.type(LOGIN_PASS, { delay: 150 });
        await new Promise(r => setTimeout(r, 500));
        
        // Click submit
        await page.keyboard.press('Enter');
        
        console.log('Waiting for login to complete...');
        await new Promise(r => setTimeout(r, 8000));
        
        const currentUrl = page.url();
        console.log('Current URL after login:', currentUrl);
        
        if (currentUrl.includes('login') || currentUrl.includes('challenge')) {
          console.log('⚠️ Login may need verification, continuing anyway...');
        } else {
          console.log('✅ Logged in!');
        }
      } else {
        console.log('Could not find login form');
      }
    } else {
      console.log('No login credentials provided, navigating directly...');
      await page.goto(`https://www.instagram.com/${TARGET_USER}/`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      await new Promise(r => setTimeout(r, 5000));
    }
    
      // Navigate to target profile after short wait
      console.log(`Navigating to @${TARGET_USER}...`);
      await page.goto(`https://www.instagram.com/${TARGET_USER}/`, {
        waitUntil: 'load',
        timeout: 30000
      });
      
      // Wait for page to fully render
      await new Promise(r => setTimeout(r, 8000));
      
      // Check if we're on the right page
      const currentUrl = page.url();
      console.log('Current URL:', currentUrl);
      
      // Debug: see what HTML we have
      const pageHtml = await page.content();
      console.log('Page HTML length:', pageHtml.length);
      const hasMain = pageHtml.includes('main') || pageHtml.includes('article');
      console.log('Has main/article elements:', hasMain);
    
    const title = await page.title();
    console.log('Page title:', title);
    
    console.log('Scrolling to load older posts...');
    let prevCount = 0;
    for (let i = 0; i < 500; i++) {
      await page.evaluate('window.scrollBy(0, 1500)');
      await new Promise(r => setTimeout(r, 300));
      
      // Check how many posts are visible - try multiple selectors
      let currentCount = await page.evaluate(`
        document.querySelectorAll('article').length || 
        document.querySelectorAll('div[role="presentation"]').length ||
        document.querySelectorAll('main article').length ||
        document.querySelectorAll('._aano').length
      `);
      if (currentCount !== prevCount) {
        console.log(`   Posts loaded: ${currentCount}`);
        prevCount = currentCount;
      }
      if (i % 20 === 0) console.log(`   Scroll iteration ${i}/500...`);
    }
    await page.evaluate('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 2000));
    
    // Try clicking "Load more" or loading hidden posts
    await page.evaluate(() => {
      // Click any "See more" buttons
      document.querySelectorAll('button, div[role="button"]').forEach(btn => {
        const text = btn.innerText || btn.textContent || '';
        if (text.includes('more') || text.includes('More')) {
          btn.click();
        }
      });
    });
    await new Promise(r => setTimeout(r, 2000));
    
      const imageUrls = await page.evaluate(() => {
      const urls = [];
      const seenUrls = new Set();
      
      // Get ALL img elements on page
      const images = document.querySelectorAll('img');
      console.log(`Found ${images.length} total <img> elements`);
      
      // Also get all elements with background-image
      const divs = document.querySelectorAll('div[style*="background-image"]');
      console.log(`Found ${divs.length} divs with background-image`);
      
      // Collect image URLs
      images.forEach((img, index) => {
        let url = img.src;
        
        // Try to get highest res from srcset
        if (img.srcset) {
          const srcset = img.srcset.split(',');
          // Get the largest image
          for (let i = srcset.length - 1; i >= 0; i--) {
            const part = srcset[i].trim();
            const urlPart = part.split(' ')[0];
            if (urlPart && !urlPart.includes('data:')) {
              url = urlPart;
              break;
            }
          }
        }
        
        if (url && !url.includes('data:')) {
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            urls.push({ src: url, alt: (img.alt || '').substring(0, 50), index });
          }
        }
      });
      
      // Background images
      divs.forEach((div, index) => {
        const style = div.getAttribute('style');
        const match = style.match(/url\("([^"]+)"\)/);
        if (match && match[1] && !match[1].includes('data:')) {
          const bgUrl = match[1];
          if (!seenUrls.has(bgUrl)) {
            seenUrls.add(bgUrl);
            urls.push({ src: bgUrl, alt: `bg-${index}`, index: 999 + index });
          }
        }
      });
      
      return urls;
    });
    
    console.log(`Found ${imageUrls.length} unique image URLs`);
    
    // Filter for high-res post images (exclude profile pics, icons)
    const filteredUrls = imageUrls.filter((img, idx) => {
      const src = img.src.toLowerCase();
      const isNotProfile = !src.includes('profile') && !src.includes('s150x150');
      const isNotIcon = !src.includes('emoji') && !src.includes('sprites') && !src.includes('icons');
      const isNotSmall = !src.includes('s64x64') && !src.includes('s48x48');
      const isPostImage = src.includes('instagram') || src.includes('cdninstagram') || src.includes('scontent');
      const hasGoodSize = src.match(/(\d+)x(\d+)/) && parseInt(src.match(/(\d+)x(\d+)/)[1]) > 200;
      
      if (idx < 5) {
        console.log(`  ${idx}: ${src.substring(0, 80)}... isPost:${isPostImage} isNotProfile:${isNotProfile}`);
      }
      
      return isNotProfile && isNotIcon && isNotSmall && (isPostImage || hasGoodSize);
    });
    
    console.log(`Filtered to ${filteredUrls.length} good images`);
    
    console.log(`Found ${imageUrls.length} images`);
    
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    let downloaded = 0;
    let skipped = 0;
    let fileCounter = 1;
    const MIN_SIZE_KB = 5; // Only keep images larger than 5KB
    
    console.log(`Skipping first ${SKIP} images...`);
    console.log(`Minimum size filter: ${MIN_SIZE_KB}KB`);
    
    for (let i = SKIP; i < Math.min(imageUrls.length, SKIP + MAX_IMAGES + 30); i++) {
      const imgData = imageUrls[i];
      try {
        const response = await page.goto(imgData.src, { timeout: 15000 });
        const buffer = await response.buffer();
        const sizeKB = buffer.length / 1024;
        
        // Skip small images
        if (sizeKB < MIN_SIZE_KB) {
          skipped++;
          console.log(`  Skipped #${i+1} (${sizeKB.toFixed(1)}KB - too small)`);
          continue;
        }
        
        const ext = imgData.src.includes('.jpg') ? 'jpg' : 'png';
        const filename = `${String(fileCounter).padStart(3, '0')}_${TARGET_USER}_${Date.now()}.${ext}`;
        const filepath = path.join(OUTPUT_DIR, filename);
        
        fs.writeFileSync(filepath, buffer);
        console.log(`Downloaded: ${filename} (${sizeKB.toFixed(0)}KB)`);
        downloaded++;
        fileCounter++;
        
        if (downloaded >= MAX_IMAGES) break;
      } catch (err) {
        console.log(`Failed #${i+1}: ${err.message}`);
      }
    }
    
    console.log(`\nSkipped ${skipped} small images`);
    
    console.log(`\n✅ Total downloaded: ${downloaded}`);
    console.log(`📁 Location: ${OUTPUT_DIR}`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

downloadInstagramImages();
