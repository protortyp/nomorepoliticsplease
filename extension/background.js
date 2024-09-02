console.log("Background script is loading...");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkTweetId") {
    fetch(`https://nomorepoliticsplease.com/api/tweet/${request.id}`)
      .then((response) => response.json())
      .then((data) => {
        console.log(`Response for tweet ${request.id}:`, data);
        sendResponse(data);
      })
      .catch((error) => {
        console.error(`Error checking tweet ${request.id}:`, error);
        sendResponse({ error: error.message });
      });
    return true; // Indicates that the response is asynchronous
  } else if (request.action === "addTweetId") {
    fetch(`https://nomorepoliticsplease.com/api/tweet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: request.id }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(`Added tweet ${request.id} to database:`, data);
        sendResponse(data);
      })
      .catch((error) => {
        console.error(`Error adding tweet ${request.id}:`, error);
        sendResponse({ error: error.message });
      });
    return true; // Indicates that the response is asynchronous
  }
});

console.log("Background script loaded successfully");
