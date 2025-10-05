const API_KEY = "AIzaSyCTmURU_Px4fSlPs7TYowVv-f-L0KgaSH4"; // replace this


async function searchTopic() {
  const topic = document.getElementById('topicInput').value.trim();
  if (!topic) return alert("Enter a topic!");

  // Clear previous results
  const categories = ["casual","theory","building","surprise","entertainment"];
  categories.forEach(cat => {
    document.getElementById(`${cat}-list`).innerHTML = "";
  });

  // Fetch and render for each category
  for (const cat of categories) {
    const videos = await fetchVideos(topic);
    renderVideos(videos, cat);
  }
}

async function fetchVideos(query) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("RAW API DATA", data); // see raw results in console
    return data.items || [];
  } catch (err) {
    console.error("Fetch error:", err);
    return [];
  }
}

function renderVideos(videos, category) {
  const container = document.getElementById(`${category}-list`);
  if (!videos.length) {
    container.innerHTML = "<p>No videos found.</p>";
    return;
  }

  videos.forEach(video => {
    const videoId = video.id.videoId;
    const title = video.snippet.title;
    const thumbnail = video.snippet.thumbnails.medium.url;
    const channel = video.snippet.channelTitle;

    const card = document.createElement("div");
    card.className = "video-card";
    card.innerHTML = `
      <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank">
        <img src="${thumbnail}" alt="${title}" />
        <p>${title}</p>
        <small>${channel}</small>
      </a>
    `;
    container.appendChild(card);
  });
}
