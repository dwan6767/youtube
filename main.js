const API_KEY = "AIzaSyAQgMkTamhvG2QwAVPsUOe41_kQdqSbJ2Y"; // replace this

/* main.js
   Hybrid: channel-driven + topic-driven -> score by like/view ratio + views -> display top results
   Two modes:
     - USE_PROXY = false -> set API_KEY below (frontend usage — key visible)
     - USE_PROXY = true -> the code will call /api/youtube?endpoint=<endpoint>&params... (recommended)
*/

/* ========================= CONFIG ========================= */
 // <-- Replace if NOT using proxy
let USE_PROXY = false;                // <-- set to true if you deploy a serverless proxy at /api/youtube

const TOP_VIDEOS_PER_CATEGORY = 8;    // final number of videos to show per category
const SEARCH_MAX_PER_QUERY = 5;       // search maxResults (per channel/topic)
const VIDEO_BATCH_SIZE = 50;          // videos API supports up to 50 ids per request
/* ========================================================= */

const categoriesOrder = ["casual","theory","building","surprise","entertainment"];
let channelsData = {};
let topicsData = {};
let currentCategory = categoriesOrder[0];

const statusEl = (() => document.getElementById("status"))();
const resultsEl = (() => document.getElementById("results"))();
const navEl = (() => document.getElementById("category-nav"))();
const topicInput = (() => document.getElementById("topicInput"))();
const refreshBtn = (() => document.getElementById("refreshBtn"))();
const proxyCheckbox = (() => document.getElementById("proxyCheckbox"))();

proxyCheckbox.addEventListener("change", (e) => {
  USE_PROXY = e.target.checked;
});

refreshBtn.addEventListener("click", () => {
  // re-run current category with optional topic refinement
  runCategory(currentCategory);
});

/* ------------------- INIT ------------------- */
async function init() {
  try {
    // build nav
    buildNav();
    status("Loading channels.json and topics.json...");
    [channelsData, topicsData] = await Promise.all([fetchJSON("channels.json"), fetchJSON("topics.json")]);
    status(`Ready — showing "${currentCategory}"`);
    runCategory(currentCategory);
  } catch (err) {
    console.error(err);
    status("Failed to load data. Check console.");
  }
}

function buildNav(){
  navEl.innerHTML = "";
  categoriesOrder.forEach(cat=> {
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

function status(text){
  if(statusEl) statusEl.textContent = text;
}

/* ------------------- IO Helpers ------------------- */
async function fetchJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`Failed to load ${url} (${r.status})`);
  return r.json();
}

async function apiFetchJson(pathAndQuery){
  /*
    If USE_PROXY true -> call our serverless proxy at /api/youtube?target=<encoded full google url>
    Otherwise -> call Google APIs directly (requires API_KEY set).
  */
  if(USE_PROXY){
    // proxy expects a 'target' param containing the full YouTube API URL
    const proxyUrl = `/api/youtube?target=${encodeURIComponent(pathAndQuery)}`;
    const r = await fetch(proxyUrl);
    if(!r.ok) throw new Error(`Proxy error: ${r.status}`);
    return r.json();
  } else {
    // append API key to the pathAndQuery if not present
    const url = pathAndQuery.includes("key=") ? pathAndQuery : `${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}key=${encodeURIComponent(API_KEY)}`;
    const r = await fetch(url);
    if(!r.ok) {
      const txt = await r.text();
      throw new Error(`YouTube API error ${r.status}: ${txt}`);
    }
    return r.json();
  }
}

/* ------------------- Core: Hybrid fetching & ranking ------------------- */

async function runCategory(category){
  status(`Fetching best videos for "${capitalize(category)}"...`);
  resultsEl.innerHTML = "";

  const topicRefine = (topicInput && topicInput.value.trim()) ? topicInput.value.trim() + " " : "";

  // 1) gather video IDs from channel-driven searches
  const channelList = (channelsData && channelsData[category]) ? channelsData[category] : [];
  const topicList = (topicsData && topicsData[category]) ? topicsData[category] : [];

  let collectedVideoMeta = {}; // videoId => { videoId, title, channelTitle, thumbnail, source: 'channel'|'topic' }
  let videoIdSet = new Set();

  // helper to collect from search results
  const collectFromSearchItems = (items, sourceLabel) => {
    for(const it of items){
      if(!it || !it.id) continue;
      const vid = (it.id.videoId) ? it.id.videoId : (it.id.kind === "youtube#video" && it.id.videoId) ? it.id.videoId : null;
      if(!vid) continue;
      if(videoIdSet.has(vid)) continue;
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

  // 1.a Channel-driven: for each channel fetch top videos (order=viewCount)
  for(const ch of channelList){
    try{
      const q = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(ch.id)}&type=video&order=viewCount&maxResults=${SEARCH_MAX_PER_QUERY}`;
      const data = await apiFetchJson(q);
      if(data && data.items) collectFromSearchItems(data.items, "channel");
    }catch(err){
      console.warn("Channel fetch error for", ch.name, err.message);
    }
  }

  // 1.b Topic-driven: search by keyword(s)
  for(const keyword of topicList){
    try{
      const q = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=${SEARCH_MAX_PER_QUERY}&q=${encodeURIComponent(topicRefine + keyword)}`;
      const data = await apiFetchJson(q);
      if(data && data.items) collectFromSearchItems(data.items, "topic");
    }catch(err){
      console.warn("Topic fetch error for", keyword, err.message);
    }
  }

  // If nothing collected, show message
  const allIds = Array.from(videoIdSet);
  if(allIds.length === 0){
    status("No candidate videos found for this category.");
    return;
  }

  // 2) Batch call videos API to get statistics & contentDetails -> compute score
  let allVideoDetails = {}; // videoId => { ...stats, meta }
  // batch in groups of VIDEO_BATCH_SIZE
  for(let i=0;i<allIds.length;i+=VIDEO_BATCH_SIZE){
    const chunk = allIds.slice(i, i + VIDEO_BATCH_SIZE);
    try{
      const q = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(chunk.join(","))}`;
      const data = await apiFetchJson(q);
      if(data && data.items){
        data.items.forEach(v=>{
          const vid = v.id;
          const stats = v.statistics || {};
          const viewCount = Number(stats.viewCount || 0);
          const likeCount = Number(stats.likeCount || 0);
          const publishedAt = v.snippet && v.snippet.publishedAt ? new Date(v.snippet.publishedAt).getTime() : 0;
          allVideoDetails[vid] = Object.assign({}, collectedVideoMeta[vid] || {}, {
            description: v.snippet.description || "",
            viewCount,
            likeCount,
            publishedAt,
            duration: v.contentDetails ? v.contentDetails.duration : null
          });
        });
      }
    }catch(err){
      console.warn("Videos stats fetch error", err.message);
    }
  }

  // 3) Compute scores
  const videosArray = Object.values(allVideoDetails);
  if(videosArray.length === 0){
    status("No video statistics available to rank.");
    return;
  }

  const maxViews = Math.max(...videosArray.map(v=>v.viewCount || 0), 1);

  videosArray.forEach(v=>{
    // likeRatio = likes / views (if views 0 -> 0)
    const likeRatio = (v.viewCount > 0) ? (v.likeCount / v.viewCount) : 0;
    // normalized views (log scale to reduce skew)
    const normViews = Math.log10((v.viewCount || 0) + 1) / Math.log10(maxViews + 1);
    // recency bonus (published within 365 days)
    const daysSince = v.publishedAt ? (Date.now() - v.publishedAt) / (1000*60*60*24) : 99999;
    const recencyBonus = daysSince <= 365 ? Math.max(0, (365 - daysSince) / 365) : 0; // 0..1

    // Weighted score — tweak weights as you like
    v.score = (likeRatio * 0.6) + (normViews * 0.35) + (recencyBonus * 0.05);
    // store a compact displayMetric too for showing
    v.displayMetric = {
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      likeRatio: (v.viewCount>0) ? (v.likeCount / v.viewCount) : 0
    };
  });

  // 4) Sort by score desc, pick top N, but keep category diversity by optionally preferring channel-sourced videos first
  videosArray.sort((a,b)=>b.score - a.score);
  const finalVideos = videosArray.slice(0, TOP_VIDEOS_PER_CATEGORY);

  // 5) Render
  resultsEl.innerHTML = "";
  status(`Showing top ${finalVideos.length} videos for "${capitalize(category)}" — ${finalVideos.length} results`);
  finalVideos.forEach((v, idx) => {
    const card = buildCard(v, idx+1);
    resultsEl.appendChild(card);
  });
}

/* ------------------- UI Helpers ------------------- */
function buildCard(v, rank){
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
            <span class="channel">${escapeHtml(v.channelTitle || v.channelName || "")}</span>
            <span class="score">#${rank}</span>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:8px;align-items:center">
        <div class="badge">
          👍 ${formatNumber(v.displayMetric.likeCount)} · 👁 ${formatNumber(v.displayMetric.viewCount)}
        </div>
        <div style="font-size:0.85rem;color:var(--muted)">${(v.source || "").toUpperCase()}</div>
      </div>
    </div>
  `;
  return el;
}

function formatNumber(n){
  if(n >= 1_000_000) return (n/1_000_000).toFixed(1) + "M";
  if(n >= 1_000) return (n/1_000).toFixed(1) + "K";
  return n.toString();
}

function capitalize(s){ return s && s[0].toUpperCase() + s.slice(1); }
function escapeHtml(str){ return (str||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

/* ------------------- Boot ------------------- */
init();
