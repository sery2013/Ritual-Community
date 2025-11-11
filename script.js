let rawData = [];
let data = [];
let allTweets = [];
let sortKey = "posts";
let sortOrder = "desc";
let currentPage = 1;
const perPage = 15;
let timeFilter = "all";

// --- Fetch leaderboard data ---
async function fetchData() {
  try {
    const response = await fetch("leaderboard.json"); // <-- путь к файлу в репо
    const json = await response.json();
    rawData = json;
    normalizeData(rawData);
    sortData();
    renderTable();
    updateArrows();
    updateTotals();
  } catch (err) {
    console.error("Failed to fetch leaderboard:", err);
  }
}

// --- Fetch all tweets ---
async function fetchTweets() {
  try {
    const response = await fetch("all_tweets.json"); // <-- путь к файлу в репо
    const json = await response.json();
    if (Array.isArray(json)) {
      allTweets = json;
    } else if (json && typeof json === "object") {
      if (Array.isArray(json.tweets)) {
        allTweets = json.tweets;
      } else if (Array.isArray(json.data)) {
        allTweets = json.data;
      } else {
        allTweets = [json];
      }
    } else {
      allTweets = [];
    }
  } catch (err) {
    console.error("Failed to fetch all tweets:", err);
    allTweets = [];
  }
}

// стартовые загрузки
fetchTweets().then(() => fetchData());
setInterval(() => {
  fetchTweets();
  fetchData();
}, 3600000); // обновлять каждый час

// --- Normalize leaderboard data ---
function normalizeData(json) {
  data = [];

  if (Array.isArray(json) && json.length > 0 && !Array.isArray(json[0])) {
    data = json.map(item => extractBaseStatsFromItem(item));
  } else if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0])) {
    data = json.map(([name, stats]) => {
      const base = extractBaseStatsFromItem(stats || {});
      base.username = name || base.username || "";
      return applyTimeFilterIfNeeded(base);
    });
  } else if (json && typeof json === "object") {
    data = Object.entries(json).map(([name, stats]) => {
      const base = extractBaseStatsFromItem(stats || {});
      base.username = name || base.username || "";
      return applyTimeFilterIfNeeded(base);
    });
  }

  data = data.map(d => applyTimeFilterIfNeeded(d));

  function extractBaseStatsFromItem(item) {
    const username = item.username || item.user || item.name || item.screen_name || "";
    const posts = Number(item.posts || item.tweets || 0);
    const likes = Number(item.likes || item.favorite_count || 0);
    const retweets = Number(item.retweets || item.retweet_count || 0);
    const comments = Number(item.comments || item.reply_count || 0);
    const views = Number(item.views || item.views_count || 0);
    return { username, posts, likes, retweets, comments, views };
  }

  function applyTimeFilterIfNeeded(base) {
    if (!base || !base.username) return base;
    if (timeFilter === "all") return base;

    const days = Number(timeFilter);
    if (!days || days <= 0) return base;

    const now = new Date();
    const uname = String(base.username).toLowerCase().replace(/^@/, "");

    const userTweets = allTweets.filter(t => {
      const candidate = (t.user && (t.user.screen_name || t.user.name)) || "";
      return String(candidate).toLowerCase().replace(/^@/, "") === uname;
    });

    let posts = 0, likes = 0, retweets = 0, comments = 0, views = 0;

    userTweets.forEach(tweet => {
      const created = tweet.tweet_created_at || tweet.created_at || tweet.created || null;
      if (!created) return;
      const tweetDate = new Date(created);
      if (isNaN(tweetDate)) return;
      const diffDays = (now - tweetDate) / (1000 * 60 * 60 * 24);
      if (diffDays <= days) {
        posts += 1;
        likes += Number(tweet.favorite_count || 0);
        retweets += Number(tweet.retweet_count || 0);
        comments += Number(tweet.reply_count || 0);
        views += Number(tweet.views_count || 0);
      }
    });

    return { username: base.username, posts, likes, retweets, comments, views };
  }
}

// --- Update totals ---
function updateTotals() {
  const totalPosts = data.reduce((sum, s) => sum + (Number(s.posts) || 0), 0);
  const totalViews = data.reduce((sum, s) => sum + (Number(s.views) || 0), 0);
  document.getElementById("total-posts").textContent = `Total Posts: ${totalPosts}`;
  document.getElementById("total-users").textContent = `Total Users: ${data.length}`;
  document.getElementById("total-views").textContent = `Total Views: ${totalViews}`;
}

// --- Sort, Filter, Render ---
function sortData() {
  data.sort((a, b) => {
    const valA = Number(a[sortKey] || 0);
    const valB = Number(b[sortKey] || 0);
    return sortOrder === "asc" ? valA - valB : valB - valA;
  });
}

function filterData() {
  const query = document.getElementById("search").value.toLowerCase();
  return data.filter(item => (item.username || "").toLowerCase().includes(query));
}

function renderTable() {
  const tbody = document.getElementById("leaderboard-body");
  tbody.innerHTML = "";

  const filtered = filterData();
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * perPage;
  const pageData = filtered.slice(start, start + perPage);

  pageData.forEach(stats => {
    const name = stats.username || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td>${Number(stats.posts || 0)}</td>
      <td>${Number(stats.likes || 0)}</td>
      <td>${Number(stats.retweets || 0)}</td>
      <td>${Number(stats.comments || 0)}</td>
      <td>${Number(stats.views || 0)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("page-info").textContent = `Page ${currentPage} / ${totalPages}`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Sorting headers ---
function updateSort(key) {
  if (sortKey === key) sortOrder = sortOrder === "asc" ? "desc" : "asc";
  else { sortKey = key; sortOrder = "desc"; }
  sortData();
  renderTable();
  updateArrows();
}

function updateArrows() {
  document.querySelectorAll(".sort-arrow").forEach(el => el.textContent = "");
  const active = document.querySelector(`#${sortKey}-header .sort-arrow`) || document.querySelector(`#${sortKey}-col-header .sort-arrow`);
  if (active) active.textContent = sortOrder === "asc" ? "▲" : "▼";
  document.querySelectorAll("thead th").forEach(th => th.classList.remove("active"));
  const headerId = sortKey + (["views", "retweets", "comments"].includes(sortKey) ? "-col-header" : "-header");
  const headerEl = document.getElementById(headerId);
  if (headerEl) headerEl.classList.add("active");
}

// --- Pagination ---
document.getElementById("prev-page").onclick = () => { if (currentPage > 1) { currentPage--; renderTable(); } };
document.getElementById("next-page").onclick = () => {
  const total = Math.ceil(filterData().length / perPage);
  if (currentPage < total) { currentPage++; renderTable(); }
};

// --- Search ---
document.getElementById("search").addEventListener("input", () => { currentPage = 1; renderTable(); });

// --- Sorting headers click ---
["posts","likes","retweets","comments","views"].forEach(key => {
  const el = document.getElementById(key === "views" ? "views-col-header" : key+"-header");
  if(el) el.addEventListener("click", () => updateSort(key));
});

// --- Time filter ---
document.getElementById("time-select").addEventListener("change", e => {
  timeFilter = e.target.value || "all";
  currentPage = 1;
  normalizeData(rawData);
  sortData();
  renderTable();
  updateTotals();
});

// --- Отображение твитов при клике на пользователя ---
function showTweets(username) {
    const container = document.getElementById("tweets-list");
    const title = document.getElementById("tweets-title");
    container.innerHTML = "";

    const userTweets = allTweets.filter(tweet => {
        const candidate = (tweet.user && (tweet.user.screen_name || tweet.user.name)) || "";
        return candidate.toLowerCase().replace(/^@/, "") === username.toLowerCase().replace(/^@/, "");
    });

    title.textContent = `Посты пользователя: ${username}`;

    if(userTweets.length === 0) {
        container.innerHTML = "<li>У пользователя нет постов</li>";
        return;
    }

    userTweets.forEach(tweet => {
        const li = document.createElement("li");
        const content = tweet.text || tweet.content || "(no content)";
        const url = tweet.url || (tweet.id_str ? `https://twitter.com/${username}/status/${tweet.id_str}` : "#");
        li.innerHTML = `<a href="${url}" target="_blank">${escapeHtml(content)}</a>`;
        container.appendChild(li);
    });
}

// --- Добавляем обработчики клика на строки таблицы после рендера ---
function addUserClickHandlers() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            const username = tr.children[0].textContent.trim();
            showTweets(username);
        });
    });
}

// --- Обновляем renderTable, чтобы добавлять клики ---
function renderTable() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.innerHTML = "";

    const filtered = filterData();
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * perPage;
    const pageData = filtered.slice(start, start + perPage);

    pageData.forEach(stats => {
        const name = stats.username || "";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(name)}</td>
          <td>${Number(stats.posts || 0)}</td>
          <td>${Number(stats.likes || 0)}</td>
          <td>${Number(stats.retweets || 0)}</td>
          <td>${Number(stats.comments || 0)}</td>
          <td>${Number(stats.views || 0)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById("page-info").textContent = `Page ${currentPage} / ${totalPages}`;

    // Добавляем обработчики клика
    addUserClickHandlers();
}

// --- Создание аккордеона твитов ---
function toggleTweetsRow(tr, username) {
    // Если уже есть раскрытая строка под этим пользователем — удаляем её
    const nextRow = tr.nextElementSibling;
    if (nextRow && nextRow.classList.contains("tweets-row")) {
        nextRow.remove();
        return;
    }

    // Удаляем все остальные раскрытые строки
    document.querySelectorAll(".tweets-row").forEach(row => row.remove());

    // Создаем новую строку
    const tweetsRow = document.createElement("tr");
    tweetsRow.classList.add("tweets-row");
    const td = document.createElement("td");
    td.colSpan = 6; // охватывает все колонки таблицы
    td.style.background = "#f9f9f9";
    td.style.padding = "10px";

    const userTweets = allTweets.filter(tweet => {
        const candidate = (tweet.user && (tweet.user.screen_name || tweet.user.name)) || "";
        return candidate.toLowerCase().replace(/^@/, "") === username.toLowerCase().replace(/^@/, "");
    });

    if (userTweets.length === 0) {
        td.innerHTML = "<i>У пользователя нет постов</i>";
    } else {
        const ul = document.createElement("ul");
        ul.style.margin = "0";
        ul.style.padding = "0 0 0 20px";
        userTweets.forEach(tweet => {
            const li = document.createElement("li");
            const content = tweet.text || tweet.content || "(no content)";
            const url = tweet.url || (tweet.id_str ? `https://twitter.com/${username}/status/${tweet.id_str}` : "#");
            li.innerHTML = `<a href="${url}" target="_blank">${escapeHtml(content)}</a>`;
            ul.appendChild(li);
        });
        td.appendChild(ul);
    }

    tweetsRow.appendChild(td);
    tr.parentNode.insertBefore(tweetsRow, tr.nextElementSibling);


}

function toggleTweetsRow(tr, username) {
  const nextRow = tr.nextElementSibling;
  const isAlreadyOpen = nextRow && nextRow.classList.contains("tweets-row") &&
                        nextRow.dataset.username === username;

  // Убираем все предыдущие аккордеоны и подсветку
  document.querySelectorAll(".tweets-row").forEach(row => row.remove());
  document.querySelectorAll("tbody tr").forEach(row => row.classList.remove("active-row"));

  // Если уже был открыт — просто закрываем
  if (isAlreadyOpen) return;

  // Подсветить текущую строку
  tr.classList.add("active-row");

  const tweetsRow = document.createElement("tr");
  tweetsRow.classList.add("tweets-row");
  tweetsRow.dataset.username = username; // <-- важно для проверки дубликатов
  const td = document.createElement("td");
  td.colSpan = 6;

  const userTweets = allTweets.filter(tweet => {
    const candidate = (tweet.user?.screen_name || tweet.user?.name || "").toLowerCase();
    return candidate.replace(/^@/, "") === username.toLowerCase().replace(/^@/, "");
  });

  if (userTweets.length === 0) {
    td.innerHTML = "<i style='color:#aaa;'>У пользователя нет постов</i>";
  } else {
    const container = document.createElement("div");
    container.classList.add("tweet-container");

    userTweets.forEach(tweet => {
      const content = tweet.full_text || tweet.text || tweet.content || "";
      const url = tweet.url || (tweet.id_str ? `https://twitter.com/${username}/status/${tweet.id_str}` : "#");

      // формат даты
      let dateRaw = tweet.created_at || tweet.tweet_created_at || "";
      let date = "";
      if (dateRaw) {
        const parsed = new Date(dateRaw);
        date = !isNaN(parsed)
          ? parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : dateRaw.split(" ")[0];
      }

      // media без дубликатов
      const mediaList = tweet.extended_entities?.media || tweet.entities?.media || tweet.media || [];
      const uniqueMediaUrls = [...new Set(mediaList.map(m => m.media_url_https || m.media_url).filter(Boolean))];
      let imgTag = uniqueMediaUrls.map(url => `<img src="${url}">`).join("");

      // fallback на ссылки в тексте
      if (!imgTag) {
        const match = content.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i);
        if (match) imgTag = `<img src="${match[0]}">`;
      }

      // создаём карточку
      const card = document.createElement("div");
      card.classList.add("tweet-card");
      const wordCount = content.trim().split(/\s+/).length;
      if (wordCount <= 3 && !imgTag) card.classList.add("short");

      card.innerHTML = `
        <a href="${url}" target="_blank" style="text-decoration:none; color:inherit;">
          <p>${escapeHtml(content)}</p>
          ${imgTag}
          <div class="tweet-date">${date}</div>
        </a>
      `;
      container.appendChild(card);
    });

    td.appendChild(container);
  }

  tweetsRow.appendChild(td);
  tr.parentNode.insertBefore(tweetsRow, tr.nextElementSibling);
}





// --- Обновляем обработчики клика ---
function addUserClickHandlers() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            const username = tr.children[0].textContent.trim();
            toggleTweetsRow(tr, username);
        });
    });
}

// --- renderTable остаётся как раньше, addUserClickHandlers вызывается в конце ---

const player = document.getElementById('player');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');


let isPlaying = false;

player.volume = 0.5; // стартовая громкость

playBtn.addEventListener('click', () => {
  if (isPlaying) {
    player.pause();
    playBtn.textContent = '▶️';
  } else {
    player.play().then(() => {
      playBtn.textContent = '⏸️';
    }).catch(err => console.log('Autoplay blocked:', err));
  }
  isPlaying = !isPlaying;
});

nextBtn.addEventListener('click', () => {
  player.currentTime = 0;
  player.play();
  playBtn.textContent = '⏸️';
  isPlaying = true;
});

