chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.local.set({ maxPosts: 100 });
}); 
