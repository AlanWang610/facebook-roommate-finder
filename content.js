// Global variables
let isScrapingActive = false;
let scrapedPosts = [];
let maxPosts = 100;
let observer = null;
let processingQueue = [];
let isProcessingPost = false;
let debugMode = true; // Set to true to see more detailed logs

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startScraping') {
    maxPosts = message.maxPosts || 100;
    startScraping();
  } else if (message.action === 'stopScraping') {
    stopScraping();
  } else if (message.action === 'downloadCSV') {
    downloadCSV();
  }
});

// Function to start scraping
function startScraping() {
  if (isScrapingActive) return;
  
  isScrapingActive = true;
  scrapedPosts = [];
  processingQueue = [];
  isProcessingPost = false;
  
  updateStatus(`Scraping started. Target: ${maxPosts} posts.`);
  
  // Find initial posts and add them to the queue
  findAndQueuePosts();
  
  // Start processing the queue
  processNextPost();
  
  // Set up observer to detect when new posts are loaded
  setupScrollObserver();
}

// Function to stop scraping
function stopScraping() {
  isScrapingActive = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  updateStatus(`Scraping stopped. Collected ${scrapedPosts.length} posts.`);
}

// Function to find posts and add them to the processing queue
function findAndQueuePosts() {
  if (!isScrapingActive) return;
  
  // Find all posts using multiple selectors to be more robust
  const posts = document.querySelectorAll('div[role="article"], div.x1yztbdb');
  
  if (debugMode) {
    console.log(`[FB Scraper Debug] Found ${posts.length} potential posts on the page`);
  }
  
  let newPostsCount = 0;
  
  for (const post of posts) {
    // Generate a unique ID for the post if it doesn't have one
    const postId = post.id || post.getAttribute('aria-labelledby') || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if we've already queued or scraped this post
    if (!processingQueue.some(p => p.id === postId) && !scrapedPosts.some(p => p.id === postId)) {
      // Add to our processing queue
      processingQueue.push({
        id: postId,
        element: post
      });
      
      newPostsCount++;
    }
  }
  
  if (newPostsCount > 0) {
    updateStatus(`Found ${newPostsCount} new posts to process. Queue size: ${processingQueue.length}`);
  } else if (debugMode) {
    console.log(`[FB Scraper Debug] No new posts found to queue`);
  }
}

// Function to process the next post in the queue
async function processNextPost() {
  if (!isScrapingActive || isProcessingPost) return;
  
  // Check if we've reached the maximum
  if (scrapedPosts.length >= maxPosts) {
    stopScraping();
    updateStatus(`Reached target of ${maxPosts} posts. Scraping complete.`);
    return;
  }
  
  // If the queue is empty, try to find more posts and scroll
  if (processingQueue.length === 0) {
    findAndQueuePosts();
    
    // If still empty, scroll to load more and try again later
    if (processingQueue.length === 0) {
      if (debugMode) {
        console.log(`[FB Scraper Debug] Queue empty, scrolling to load more posts`);
      }
      
      window.scrollTo(0, document.body.scrollHeight);
      setTimeout(() => processNextPost(), 2000);
      return;
    }
  }
  
  // Get the next post from the queue
  const postData = processingQueue.shift();
  isProcessingPost = true;
  
  if (debugMode) {
    console.log(`[FB Scraper Debug] Processing post: ${postData.id}`);
  }
  
  try {
    // Process this post
    const success = await processPost(postData);
    
    if (debugMode) {
      console.log(`[FB Scraper Debug] Post processing ${success ? 'successful' : 'failed'}`);
    }
    
    // Add random delay before processing the next post (1-1.2 seconds)
    const delay = 1000 + Math.random() * 200;
    setTimeout(() => {
      isProcessingPost = false;
      processNextPost();
    }, delay);
  } catch (error) {
    console.error(`[FB Scraper] Error processing post: ${error}`);
    isProcessingPost = false;
    processNextPost(); // Continue with the next post
  }
}

// Function to process a single post
async function processPost(postData) {
  const post = postData.element;
  
  // First, expand any "See more" buttons in this post
  const expandedCount = await expandSeeMoreInPost(post);
  
  if (debugMode) {
    console.log(`[FB Scraper Debug] Expanded ${expandedCount} "See more" buttons in post`);
  }
  
  // Try multiple selectors for finding the author name
  let nameElement = post.querySelector('div[data-ad-rendering-role="profile_name"] strong');
  if (!nameElement) {
    nameElement = post.querySelector('a[role="link"] strong');
  }
  if (!nameElement) {
    nameElement = post.querySelector('h3 a[role="link"]');
  }
  
  const name = nameElement ? nameElement.textContent.trim() : 'Unknown';
  
  if (debugMode) {
    console.log(`[FB Scraper Debug] Found author: ${name}`);
  }
  
  // Try multiple selectors for finding the post text
  let messageElement = post.querySelector('[data-ad-comet-preview="message"]');
  if (!messageElement) {
    messageElement = post.querySelector('div[dir="auto"]');
  }
  if (!messageElement) {
    messageElement = post.querySelector('span.x193iq5w');
  }
  
  // If we still can't find the text, try to get all text content from the post
  let text = '';
  if (messageElement) {
    text = messageElement.textContent.trim();
  } else {
    // As a fallback, get all text from the post excluding profile name area
    const nameArea = post.querySelector('h3');
    if (nameArea) {
      nameArea.remove(); // Temporarily remove name area
      text = post.textContent.trim();
      post.prepend(nameArea); // Put it back
    } else {
      text = post.textContent.trim();
    }
  }
  
  if (debugMode) {
    console.log(`[FB Scraper Debug] Found text (${text.length} chars): ${text.substring(0, 50)}...`);
  }
  
  // Only add to our collection if we found some text AND a valid author name
  if (text.length > 0 && name !== 'Unknown') {
    scrapedPosts.push({
      id: postData.id,
      name: name,
      text: text
    });
    
    updateStatus(`Scraped ${scrapedPosts.length} posts so far. Queue size: ${processingQueue.length}`);
    return true;
  } else {
    if (debugMode) {
      if (name === 'Unknown') {
        console.log(`[FB Scraper Debug] Skipping post - unknown author`);
      }
      if (text.length === 0) {
        console.log(`[FB Scraper Debug] Skipping post - no text content found`);
      }
    }
    return false;
  }
}

// Function to expand "See more" buttons in a specific post
async function expandSeeMoreInPost(post) {
  // Find all "See more" buttons in this post using multiple selectors
  const seeMoreButtons = [
    ...Array.from(post.querySelectorAll('div[role="button"]')).filter(
      button => button.textContent.toLowerCase().includes('see more')
    ),
    ...Array.from(post.querySelectorAll('span[role="button"]')).filter(
      button => button.textContent.toLowerCase().includes('see more')
    ),
    ...Array.from(post.querySelectorAll('div.x1i10hfl')).filter(
      button => button.textContent.toLowerCase().includes('see more')
    )
  ];
  
  if (debugMode) {
    console.log(`[FB Scraper Debug] Found ${seeMoreButtons.length} "See more" buttons`);
  }
  
  // Click each button
  for (const button of seeMoreButtons) {
    try {
      button.click();
      // Small delay to let the content expand
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[FB Scraper] Error clicking "See more" button: ${error}`);
    }
  }
  
  return seeMoreButtons.length;
}

// Function to set up an observer to detect when new posts are loaded
function setupScrollObserver() {
  if (observer) {
    observer.disconnect();
  }
  
  observer = new MutationObserver((mutations) => {
    let shouldFindPosts = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldFindPosts = true;
        break;
      }
    }
    
    if (shouldFindPosts && isScrapingActive) {
      // Find new posts to process
      findAndQueuePosts();
      
      // If we're not currently processing a post, start processing
      if (!isProcessingPost) {
        processNextPost();
      }
    }
  });
  
  // Try to find the feed container using multiple selectors
  const feedContainer = document.querySelector('div[role="feed"], div.x1lliihq');
  if (feedContainer) {
    observer.observe(feedContainer, { childList: true, subtree: true });
    if (debugMode) {
      console.log(`[FB Scraper Debug] Set up observer on feed container`);
    }
  } else {
    // If we can't find the feed container, observe the entire body
    observer.observe(document.body, { childList: true, subtree: false });
    if (debugMode) {
      console.log(`[FB Scraper Debug] Could not find feed container, observing body instead`);
    }
  }
}

// Function to download the scraped data as CSV
function downloadCSV() {
  if (scrapedPosts.length === 0) {
    updateStatus('No posts to download.');
    return;
  }
  
  // Create CSV content
  let csvContent = 'name,text\n';
  
  for (const post of scrapedPosts) {
    // Escape quotes in the text and wrap in quotes
    const escapedName = `"${post.name.replace(/"/g, '""')}"`;
    const escapedText = `"${post.text.replace(/"/g, '""')}"`;
    
    csvContent += `${escapedName},${escapedText}\n`;
  }
  
  // Create a blob and download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.setAttribute('href', url);
  link.setAttribute('download', `facebook_group_posts_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  updateStatus(`Downloaded ${scrapedPosts.length} posts as CSV.`);
}

// Function to update status in the popup
function updateStatus(status) {
  chrome.runtime.sendMessage({ action: 'updateStatus', status: status });
  console.log(`[FB Scraper] ${status}`);
}

// Check if we're on a Facebook group page
if (window.location.href.match(/https:\/\/www\.facebook\.com\/groups\/.*/)) {
  console.log('[FB Scraper] Extension loaded on a Facebook group page.');
} 
