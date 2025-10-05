const API_KEY = "AIzaSyCTmURU_Px4fSlPs7TYowVv-f-L0KgaSH4"; // replace this
// Categories keywords & weights
const categories = {
  casual: { keywords: ["electronics","DIY","retro","fun"], threshold: 0.7 },
  theory: { keywords: ["electronics","op-amps","transistors","circuit","embedded","tutorial","lecture"], threshold: 0.6 },
  building: { keywords: ["DIY","electronics","Arduino","Raspberry Pi","robotics","maker"], threshold: 0.7 },
  surprise: { keywords: ["electronics","creative","hacks","projects"], threshold: 0.7 },
  entertainment: { keywords: ["electronics","fun","casual","shorts","hacks"], threshold: 0.7 }
};

// Whitelisted channels (sample, expand as needed)
const whitelistedChannels = [
  "UCJ0-OtVpF0wOKEqT2Z1HEtA", // ElectroBOOM
  "UC6mIxFTvXkWQVEHPsEdflzQ", // GreatScott!
  "UCqYPhGiJ4vIYdHc8C_QdHDQ", // Ben Eater
  "UCa6eh7gCkpPo5XXUDfygQQA"  // DIY Perks
];

async function searchTopic() {
  const topic = document.getElementById('topicInput').value.trim();
  if(!topic) return alert("Enter a topic!");

  // Clear previous results
  Object.keys(categories).forEach(cat => {
    document.getElementById(`${cat}-list`).innerHTML = "";
  });

  // Search for each category
  for(const cat in categories){
    const results = await fetchVideos(topic, cat);
    renderVideos(results, cat);
  }
}

async function fetchVideos(query, category){
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(query)}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if(!data.items) return [];

  // Filter using weighted score
  return data.items.filter(video => {
    const score = calculateScore(video, category);
    return score >= categories[category].threshold;
  });
}

function calculateScore(video, category){
  let score = 0;
  const keywords = categories[category].keywords;
  const title = video.snippet.title.toLowerCase();
  const desc = video.snippet.description.toLowerCase();
  const tags = video.snippet.tags ? video.snippet.tags.map(t=>t.toLowerCase()) : [];

  // Primary checks
  if(title.includes("electronics")) score += 0.5;
  if(desc.includes("electronics")) score += 0.2;
  if(tags.includes("electronics")) score += 0.3;

  // Secondary keyword matches
  keywords.forEach(kw=>{
    if(title.includes(kw) || desc.includes(kw) || tags.includes(kw)){
      score += 0.1;
    }
  });

  // Channel whitelist bonus
  if(whitelistedChannels.includes(video.snippet.channelId)) score += 0.2;

  return score;
}

function renderVideos(videos, category){
  const container = document.getElementById(`${category}-list`);
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
