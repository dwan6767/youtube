const API_KEY = "AIzaSyAQgMkTamhvG2QwAVPsUOe41_kQdqSbJ2Y"; // replace this

/* main.js
   Hybrid: channel-driven + topic-driven -> score by like/view ratio + views -> display top results
   Two modes:
     - USE_PROXY = false -> set API_KEY below (frontend usage — key visible)
     - USE_PROXY = true -> the code will call /api/youtube?endpoint=<endpoint>&params... (recommended)
*/

/* ========================= CONFIG ========================= */
 // <-- Replace if NOT using proxy

let USE_PROXY = false;                // set true if using serverless proxy

const TOP_VIDEOS_PER_CATEGORY = 8;
const SEARCH_MAX_PER_QUERY = 5;
const VIDEO_BATCH_SIZE = 50;

const categoriesOrder = ["casual","theory","building","surprise","entertainment"];
let channelsData = {};
let topicsData = {};
let currentCategory = categoriesOrder[0];

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const navEl = document.getElementById("category-nav");
const topicInput = document.getElementById("topicInput");
const refreshBtn = document.getElementById("refreshBtn");
const proxyCheckbox = document.getElementById("proxyCheckbox");

proxyCheckbox.addEventListener("change", e => USE_PROXY = e.target.checked);
refreshBtn.addEventListener("click", () => runCategory(currentCategory));

/* ------------------- INIT ------------------- */
async function init() {
  try {
    buildNav();
    status("Loading channels.json and topics.json...");
    [channelsData, topicsData] = await Promise.all([
      fetchJSON("channels.json"),
      fetchJSON("topics.json")
    ]);
    status(`Ready — showing "${currentCategory}"`);
    runCategory(currentCategory);
  } catch (err) {
    console.error(err);
    status("Failed to load data. Check console.");
  }
}

/* ------------------- NAV ------------------- */
function buildNav(){
  navEl.innerHTML = "";
  categoriesOrder.forEach(cat=>{
    const btn = document.createElement("button");
    btn.textContent = capitalize(cat);
    btn.dataset.cat = cat;
    btn.addEventListener("click", () => {
      Array.from(navEl.querySelectorAll("button")).forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = cat;
      runCategory(cat);
    });
    if(cat === currentCategory) btn.classList.add("active");
    navEl.appendChild(btn);
  });
}

/* ------------------- HELPERS ------------------- */
async function fetchJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`Failed to load ${url} (${r.status})`);
  return r.json();
}

async function apiFetchJson(pathAndQuery){
  if(USE_PROXY){
    const proxyUrl = `/api/youtube?target=${encodeURIComponent(pathAndQuery)}`;
    const r = await fetch(proxyUrl);
    if(!r.ok) throw new Error(`Proxy error: ${r.status}`);
    return r.json();
  } else {
    const url = pathAndQuery.includes("key=") ? pathAndQuery : `${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}key=${encodeURIComponent(API_KEY)}`;
    const r = await fetch(url);
    if(!r.ok) throw new Error(`YouTube API error ${r.status}`);
    return r.json();
  }
}

function capitalize(s){ return s && s[0].toUpperCase() + s.slice(1); }
function escapeHtml(str){ return (str||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }
function formatNumber(n){
  if(n >= 1_000_000) return (n/1_000_000).toFixed(1) + "M";
  if(n >= 1_000) return (n/1_000).toFixed(1) + "K";
  return n.toString();
}

/* ------------------- CATEGORY DURATION ------------------- */
function getVideoDurationParam(category){
  switch(category){
    case "entertainment": return "short";   // shorts <4min
    case "building":
    case "theory":
    case "casual":
    case "surprise": return "medium";       // medium/long
    default: return "any";
  }
}

/* ------------------- CORE: Hybrid Fetch + Rank ------------------- */
async function runCategory(category){
  status(`Fetching best videos for "${capitalize(category)}"...`);
  resultsEl.innerHTML = "";

  const topicRefine = (topicInput && topicInput.value.trim()) ? topicInput.value.trim() + " " : "";
  const durationParam = getVideoDurationParam(category);

  const channelList = channelsData[category] || [];
  const topicList = topicsData[category] || [];

  let collectedVideoMeta = {};
  let videoIdSet = new Set();

  const collectFromSearchItems = (items, sourceLabel) => {
    for(const it of items){
      if(!it || !it.id) continue;
      const vid = it.id.videoId;
      if(!vid || videoIdSet.has(vid)) continue;
      videoIdSet.add(vid);
      collectedVideoMeta[vid] = {
        videoId: vid,
        title: it.snippet.title,
        channelTitle: it.snippet.channelTitle,
        thumbnail: (it.snippet.thumbnails && it.snippet.thumbnails.medium) ? it.snippet.thumbnails.medium.url : "",
        source: sourceLabel
      };
    }
  };

  // 1. Channel-driven
  for(const ch of channelList){
    try{
      const q = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(ch.id)}&type=video&order=viewCount&maxResults=${SEARCH_MAX_PER_QUERY}&videoDuration=${durationParam}`;
      const data = await apiFetchJson(q);
      if(data && data.items) collectFromSearchItems(data.items,"channel");
    }catch(err){
      console.warn("Channel fetch error", ch.name, err.message);
    }
  }

  // 2. Topic-driven
  for(const keyword of topicList){
    try{
      const q = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=${SEARCH_MAX_PER_QUERY}&videoDuration=${durationParam}&q=${encodeURIComponent(topicRefine + keyword)}`;
      const data = await apiFetchJson(q);
      if(data && data.items) collectFromSearchItems(data.items,"topic");
    }catch(err){
      console.warn("Topic fetch error", keyword, err.message);
    }
  }

  const allIds = Array.from(videoIdSet);
  if(allIds.length === 0){
    status("No videos found for this category.");
    return;
  }

  // 3. Fetch statistics & contentDetails
  let allVideoDetails = {};
  for(let i=0;i<allIds.length;i+=VIDEO_BATCH_SIZE){
    const chunk = allIds.slice(i,i+VIDEO_BATCH_SIZE);
    try{
      const q = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(chunk.join(","))}`;
      const data = await apiFetchJson(q);
      if(data && data.items){
        data.items.forEach(v=>{
          const vid = v.id;
          const stats = v.statistics || {};
          const viewCount = Number(stats.viewCount || 0);
          const likeCount = Number(stats.likeCount || 0);
          const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).getTime() : 0;
          const duration = v.contentDetails?.duration || null;
          allVideoDetails[vid] = Object.assign({}, collectedVideoMeta[vid]||{}, {viewCount,likeCount,publishedAt,duration});
        });
      }
    }catch(err){
      console.warn("Videos stats fetch error", err.message);
    }
  }

  // 4. Filter by duration again (safety)
  const filteredVideos = Object.values(allVideoDetails).filter(v=>{
    if(!v.duration) return true;
    const m = v.duration.match(/PT(\d+)M/);
    const minutes = m ? parseInt(m[1],10) : 0;
    if(category==="entertainment") return minutes < 4;
    return minutes >= 4;
  });

  if(filteredVideos.length===0){
    status("No videos match the duration filter for this category.");
    return;
  }

  // 5. Compute score
  const maxViews = Math.max(...filteredVideos.map(v=>v.viewCount||0),1);
  filteredVideos.forEach(v=>{
    const likeRatio = (v.viewCount>0)? (v.likeCount/v.viewCount) : 0;
    const normViews = Math.log10((v.viewCount||0)+1)/Math.log10(maxViews+1);
    const daysSince = v.publishedAt ? (Date.now() - v.publishedAt)/(1000*60*60*24) : 99999;
    const recencyBonus = daysSince<=365 ? Math.max(0,(365-daysSince)/365) : 0;
    v.score = (likeRatio*0.6) + (normViews*0.35) + (recencyBonus*0.05);
    v.displayMetric = { viewCount:v.viewCount, likeCount:v.likeCount, likeRatio };
  });

  // 6. Sort & pick top N
  filteredVideos.sort((a,b)=>b.score - a.score);
  const finalVideos = filteredVideos.slice(0, TOP_VIDEOS_PER_CATEGORY);

  // 7. Render
  resultsEl.innerHTML="";
  status(`Showing top ${finalVideos.length} videos for "${capitalize(category)}"`);
  finalVideos.forEach((v,idx)=>{
    resultsEl.appendChild(buildCard(v,idx+1));
  });
}

/* ------------------- UI ------------------- */
function buildCard(v,rank){
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `
    <a class="thumb-link" href="https://www.youtube.com/watch?v=${v.videoId}" target="_blank" rel="noopener">
      <img class="thumb" src="${escapeHtml(v.thumbnail)}" alt="${escapeHtml(v.title)}" loading="lazy" />
    </a>
    <div class="content">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="flex:1;min-width:0">
          <div class="title">${escapeHtml(v.title)}</div>
          <div class="meta">
            <span class="channel">${escapeHtml(v.channelTitle||"")}</span>
            <span class="score">#${rank}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;align-items:center">
        <div class="badge">👍 ${formatNumber(v.displayMetric.likeCount)} · 👁 ${formatNumber(v.displayMetric.viewCount)}</div>
        <div style="font-size:0.85rem;color:var(--muted)">${(v.source||"").toUpperCase()}</div>
      </div>
    </div>
  `;
  return el;
}

/* ------------------- BOOT ------------------- */
init();

