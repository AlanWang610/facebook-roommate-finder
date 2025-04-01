document.addEventListener('DOMContentLoaded', function() {
  // Load saved settings
  chrome.storage.local.get('maxPosts', function(data) {
    if (data.maxPosts) {
      document.getElementById('maxPosts').value = data.maxPosts;
    }
  });

  // Save settings when changed
  document.getElementById('maxPosts').addEventListener('change', function() {
    const maxPosts = parseInt(document.getElementById('maxPosts').value);
    chrome.storage.local.set({ maxPosts: maxPosts });
  });

  // Start scraping button
  document.getElementById('startScraping').addEventListener('click', function() {
    const maxPosts = parseInt(document.getElementById('maxPosts').value);
    chrome.storage.local.set({ maxPosts: maxPosts });
    
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'startScraping', maxPosts: maxPosts });
    });
    
    document.getElementById('status').textContent = 'Scraping started...';
  });

  // Stop scraping button
  document.getElementById('stopScraping').addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'stopScraping' });
    });
    
    document.getElementById('status').textContent = 'Scraping stopped.';
  });

  // Download CSV button
  document.getElementById('downloadCSV').addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'downloadCSV' });
    });
    
    document.getElementById('status').textContent = 'Downloading CSV...';
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(message) {
  if (message.action === 'updateStatus') {
    document.getElementById('status').textContent = message.status;
  }
}); 
