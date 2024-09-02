async function checkTweetId(id) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "checkTweetId", id: id },
      (response) => {
        if (response.error) {
          console.error(`Error response for tweet ${id}:`, response.error);
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      }
    );
  });
}

const processedTweetIds = new Set();
const removedTweetIds = new Set(
  JSON.parse(localStorage.getItem("removedTweetIds") || "[]")
);

async function processTweets() {
  const tweetElements = document.querySelectorAll(
    'article[data-testid="tweet"]'
  );
  console.log(`Found ${tweetElements.length} tweets`);

  for (const tweet of tweetElements) {
    const tweetLink = tweet.querySelector('a[href*="/status/"]');
    if (tweetLink) {
      const href = tweetLink.getAttribute("href");
      const match = href.match(/\/status\/(\d+)/);
      if (match) {
        const id = match[1];
        // Check if we've already processed this tweet or if it's in the removed list
        if (!processedTweetIds.has(id) && !removedTweetIds.has(id)) {
          try {
            const isInDatabase = await checkTweetId(id);
            if (isInDatabase) {
              removeTweet(tweet, id);
            } else {
              addThumbsDownButton(tweet, id);
            }
          } catch (error) {
            console.error(`Error processing tweet ${id}:`, error);
          }
          processedTweetIds.add(id);
        } else if (removedTweetIds.has(id)) {
          removeTweet(tweet, id);
        }
      }
    }
  }
  console.log("Finished processing tweets");
}

// Function to check if tweets are loaded
function areTweetsLoaded() {
  return document.querySelectorAll('article[data-testid="tweet"]').length > 0;
}

// Function to wait for tweets to load
function waitForTweetsToLoad(callback, maxAttempts = 10, interval = 1000) {
  let attempts = 0;

  function checkTweets() {
    if (areTweetsLoaded()) {
      callback();
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(checkTweets, interval);
    } else {
      console.log("Max attempts reached. Tweets not found.");
    }
  }

  checkTweets();
}

waitForTweetsToLoad(processTweets);

const observer = new MutationObserver((mutations) => {
  let shouldProcess = false;

  mutations.forEach((mutation) => {
    if (mutation.type === "childList") {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node.matches('article[data-testid="tweet"]') ||
            node.querySelector('article[data-testid="tweet"]'))
        ) {
          shouldProcess = true;
        }
      });
    } else if (mutation.type === "attributes") {
      shouldProcess = true;
    }
  });

  if (shouldProcess) {
    processTweets();
  }
});

// observe document
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: false,
});
window.addEventListener("scroll", processTweets);

console.log("Content script loaded successfully");

function removeTweet(tweet, id) {
  tweet.style.transition = "opacity 0.3s ease-out";
  tweet.style.opacity = "0";
  setTimeout(() => tweet.remove(), 300);

  removedTweetIds.add(id);
  localStorage.setItem("removedTweetIds", JSON.stringify([...removedTweetIds]));
}

function addThumbsDownButton(tweet, id) {
  const button = document.createElement("button");
  button.innerHTML = "👎";
  button.className = "thumbs-down-button";
  button.title = "Remove political tweet";
  button.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    z-index: 1000;
    opacity: 0.7;
    transition: opacity 0.2s ease-in-out;
  `;

  button.onmouseover = () => (button.style.opacity = "1");
  button.onmouseout = () => (button.style.opacity = "0.7");

  button.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    button.disabled = true;
    button.style.cursor = "default";
    button.innerHTML = "⏳";

    try {
      await addTweetToDatabase(id);
      console.log(`Added tweet ${id} to database`);
      removeTweet(tweet, id);
    } catch (error) {
      console.error(`Error adding tweet ${id} to database:`, error);
      button.innerHTML = "❌";
      setTimeout(() => {
        button.disabled = false;
        button.style.cursor = "pointer";
        button.innerHTML = "👎";
      }, 2000);
    }
  };

  tweet.style.position = "relative";
  tweet.appendChild(button);
}

async function addTweetToDatabase(id) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "addTweetId", id: id }, (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}
