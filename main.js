const API_KEY = "AIzaSyAQgMkTamhvG2QwAVPsUOe41_kQdqSbJ2Y"; // replace this

async function searchTopic() {
  const topic = document.getElementById('topicInput').value.trim();
  if (!topic) return alert("Enter a topic first!");

  document.getElementById('beginner-list').innerHTML = '';
  document.getElementById('intermediate-list').innerHTML = '';
  document.getElementById('advanced-list').innerHTML = '';

  // Fetch videos for each difficulty
  await fetchVideos(`${topic} for beginners`, 'beginner-list');
  await fetchVideos(`${topic} intermediate tutorial`, 'intermediate-list');
  await fetchVideos(`${topic} advanced guide`, 'advanced-list');
}

async function fetchVideos(query, elementId) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  const container = document.getElementById(elementId);
  if (!data.items) {
    container.innerHTML = "<p>No videos found.</p>";
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
}
