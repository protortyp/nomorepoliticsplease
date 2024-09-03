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
const collapsedTweetIds = new Set(
  JSON.parse(localStorage.getItem("collapsedTweetIds") || "[]")
);

async function processTweets() {
  const tweetElements = document.querySelectorAll(
    'article[data-testid="tweet"]'
  );

  for (const tweet of tweetElements) {
    const tweetLink = tweet.querySelector('a[href*="/status/"]');
    if (tweetLink) {
      const href = tweetLink.getAttribute("href");
      const match = href.match(/\/status\/(\d+)/);
      if (match) {
        const id = match[1];
        // check if we've already processed this tweet or if it's in the collapsed list
        if (!processedTweetIds.has(id)) {
          try {
            const isInDatabase = await checkTweetId(id);
            if (isInDatabase || collapsedTweetIds.has(id)) {
              collapseTweet(tweet, id);
            } else {
              addThumbsDownButton(tweet, id);
            }
          } catch (error) {
            console.error(`Error processing tweet ${id}:`, error);
          }
          processedTweetIds.add(id);
        }
      }
    }
  }
}

// function to check if tweets are loaded
function areTweetsLoaded() {
  return document.querySelectorAll('article[data-testid="tweet"]').length > 0;
}

// function to wait for tweets to load
function waitForTweetsToLoad(callback, maxAttempts = 20, interval = 1000) {
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

function initializeExtension() {
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
}

initializeExtension();
window.addEventListener("popstate", initializeExtension);
window.addEventListener("pushstate", initializeExtension);
window.addEventListener("replacestate", initializeExtension);

function collapseTweet(tweet, id) {
  console.log("collapse tweet!");
  if (!tweet.classList.contains("collapsed-tweet")) {
    tweet.classList.add("collapsed-tweet");

    // store the original content
    const tweetContent = tweet.querySelector('[data-testid="tweetText"]');
    if (!tweetContent) return;

    const originalContent = tweet.innerHTML;

    // check if a collapse banner already exists
    if (!tweet.querySelector(".collapse-banner")) {
      // create collapse banner
      const collapseBanner = document.createElement("div");
      collapseBanner.className = "collapse-banner";
      collapseBanner.style.cssText = `display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border: 2px solid rgb(22, 24, 28);
        border-radius: 16px;
        font-size: 15px;
        line-height: 20px;
        color: rgb(247, 249, 249);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        width: 100%;
        box-sizing: border-box;
        margin-top: 8px;`;

      const bannerText = document.createElement("span");
      bannerText.textContent =
        "This Tweet was flagged as potentially political by the community";
      bannerText.style.cssText = `flex-grow: 1;
        text-align: left;`;
      collapseBanner.appendChild(bannerText);

      const viewButton = document.createElement("button");
      viewButton.textContent = "View";
      viewButton.style.cssText = `background-color: transparent;
        border: 1px solid rgb(83, 100, 113);
        border-radius: 9999px;
        padding: 0 16px;
        height: 32px;
        color: rgb(239, 243, 244);
        font-weight: 700;
        cursor: pointer;
        margin-left: 16px;`;
      collapseBanner.appendChild(viewButton);

      // hide the content below the banner, including retweets
      const contentToHide = tweet.querySelectorAll(
        '[data-testid="tweetText"], [data-testid="card.wrapper"], [data-testid="tweetPhoto"], [data-testid="tweetVideo"], [data-testid="socialContext"]'
      );
      contentToHide.forEach((element) => {
        element.style.display = "none";
      });

      // hide nested retweets
      const retweetContainers = tweet.querySelectorAll(
        'div[data-testid="tweet"]'
      );
      retweetContainers.forEach((container) => {
        container.style.display = "none";
      });

      // hide quoted tweets
      const quotedTweetContainers = tweet.querySelectorAll(
        "div[aria-labelledby]"
      );
      quotedTweetContainers.forEach((container) => {
        container.style.display = "none";
      });

      // insert the collapse banner after the user information
      const userInfo = tweet.querySelector('[data-testid="User-Name"]');
      if (userInfo && userInfo.parentNode) {
        userInfo.parentNode.insertBefore(collapseBanner, userInfo.nextSibling);
      } else {
        tweet.insertBefore(collapseBanner, tweet.firstChild);
      }

      // add event listener to view button
      viewButton.addEventListener("click", (e) => {
        e.stopPropagation();
        tweet.innerHTML = originalContent;
        tweet.classList.remove("collapsed-tweet");
      });
    }
  }

  collapsedTweetIds.add(id);
  localStorage.setItem(
    "collapsedTweetIds",
    JSON.stringify([...collapsedTweetIds])
  );
}

function addThumbsDownButton(tweet, id) {
  const button = document.createElement("button");
  button.innerHTML = "👎";
  button.className = "thumbs-down-button";
  button.title = "Collapse political tweet";
  button.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    z-index: 1001;
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
      collapseTweet(tweet, id);
      try {
        tweet.removeChild(button);
      } catch (error) {
        console.error("Error removing thumbs down button:", error);
      }
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
