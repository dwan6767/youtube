const API_KEY = "AIzaSyAQgMkTamhvG2QwAVPsUOe41_kQdqSbJ2Y"; // replace this


// Categories with example keywords
const categories = {
  casual: ["8 bit guy", "Ben Eater", "hobby electronics"],
  theory: ["electronics tutorial", "circuit theory", "signal processing"],
  building: ["GreatScott!", "Arduino project", "DIY circuits"],
  surprise: ["weird electronics", "retro tech", "unusual circuits"],
  entertainment: ["electronics shorts", "fun gadgets", "tech hacks"]
};

let currentCategory = "casual";

// Switch category
function showCategory(category) {
  currentCategory = category;
  searchCategory();
}

// Search videos for the current category
async function searchCategory() {
  const topicInput = document.getElementById('topicInput').value.trim();
  const queryPrefix = topicInput ? topicInput + " " : "";

  const container = document.getElementById('results');
  container.innerHTML = '';

  for (let keyword of categories[currentCategory]) {
    await fetchVideos(`${queryPrefix}${keyword}`, container);
  }
}

// Fetch videos using YouTube API
async function fetchVideos(query, container) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      container.innerHTML += "<p>No videos found.</p>";
      return;
    }

    data.items.forEach(item => {
      const videoId = item.id.videoId;
      const title = item.snippet.title;
      const thumbnail = item.snippet.thumbnails.medium.url;

      const videoCard = `
        <div class="video-card">
          <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank">
            <img src="${thumbnail}" alt="${title}">
            <p>${title}</p>
          </a>
        </div>
      `;
      container.innerHTML += videoCard;
    });
  } catch (err) {
    console.error("Error fetching videos:", err);
  }
}

// Load initial category
searchCategory();