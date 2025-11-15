// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let rawData = [];
let data = [];
let allTweets = [];
let sortKey = "posts";
let sortOrder = "desc";
let currentPage = 1;
const perPage = 15;
let timeFilter = "all";
let analyticsChart = null;
let analyticsPeriod = "all"; // filter for analytics: 'all', '7', '14', '30'

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
    // если есть функция рендера аналитики — обновим её
    if (typeof renderAnalytics === "function") renderAnalytics();
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

// --- SHARE BUTTON FUNCTIONALITY ---
function shareUserOnTwitter(username) {
    const tweetText = `Check out @${username} on the Ritual Community Leaderboard! #RitualCommunity #Leaderboard`;
    const leaderboardUrl = window.location.href;
    const encodedText = encodeURIComponent(tweetText);
    const encodedUrl = encodeURIComponent(leaderboardUrl);
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    window.open(twitterIntentUrl, '_blank', 'width=600,height=400');
}

// --- Render Table with Share Button ---
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

    // --- НАЧАЛО ИЗМЕНЕНИЙ: Создание ячейки с именем и кнопкой ---
    const nameCell = document.createElement("td");
    const nameContainer = document.createElement("div");
    nameContainer.style.display = "flex";
    nameContainer.style.alignItems = "center";
    nameContainer.style.gap = "8px";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = escapeHtml(name);

    const shareBtn = document.createElement("button");
    shareBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display: block;"> <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.244 2.25H8.05l4.713 6.231zm-1.161 17.52h1.833L7.08 4.126H5.03z"/> </svg>`; // SVG иконка Twitter
    shareBtn.className = 'share-btn'; // Класс для стилей
    shareBtn.title = `Share ${escapeHtml(name)}'s stats on Twitter`; // Подсказка при наведении
    shareBtn.onclick = function(e) {
        e.stopPropagation(); // ВАЖНО: Останавливаем всплытие, чтобы клик не сработал на строке таблицы
        shareUserOnTwitter(name); // Функция, которая откроет окно Twitter Intent
    };

    nameContainer.appendChild(nameSpan);
    nameContainer.appendChild(shareBtn);
    nameCell.appendChild(nameContainer);
    // --- КОНЕЦ ИЗМЕНЕНИЙ ---

    tr.appendChild(nameCell); // Добавляем ячейку с именем и кнопкой
    tr.insertAdjacentHTML('beforeend', `<td>${Number(stats.posts || 0)}</td>`);
    tr.insertAdjacentHTML('beforeend', `<td>${Number(stats.likes || 0)}</td>`);
    tr.insertAdjacentHTML('beforeend', `<td>${Number(stats.retweets || 0)}</td>`);
    tr.insertAdjacentHTML('beforeend', `<td>${Number(stats.comments || 0)}</td>`);
    tr.insertAdjacentHTML('beforeend', `<td>${Number(stats.views || 0)}</td>`);

    tbody.appendChild(tr);
  });

  document.getElementById("page-info").textContent = `Page ${currentPage} / ${totalPages}`;

  // Добавляем обработчики клика
  addUserClickHandlers();
}

// --- Escaping HTML ---
function escapeHtml(str) {
  // Обеспечиваем, что str - строка, прежде чем обрабатывать
  const stringified = String(str || '');
  return stringified
    .replace(/&/g, "&amp;")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

  // Если уже был открыт — просто закрывает
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



// --- Tabs setup and Analytics rendering ---
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      const lb = document.getElementById('leaderboard-wrapper');
      const an = document.getElementById('tab-analytics');
      if (tab === 'analytics') {
        if (lb) lb.style.display = 'none';
        if (an) an.style.display = 'block';
        renderAnalytics();
      } else {
        if (lb) lb.style.display = 'block';
        if (an) an.style.display = 'none';
      }
    });
  });
}

// --- Функция для отрисовки тепловой гистограммы ---
function renderHeatmap(tweets) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  // Массив 7x24, инициализирован нулями
  const heatmap = Array(7).fill().map(() => Array(24).fill(0));

  // Подсчёт твитов по (день, час)
  tweets.forEach(t => {
    const created = t.tweet_created_at || t.created_at || t.created;
    if (!created) return;
    const d = new Date(created);
    if (isNaN(d)) return;
    const day = d.getUTCDay(); // 0 = воскресенье
    const hour = d.getUTCHours();
    heatmap[day][hour] = (heatmap[day][hour] || 0) + 1;
  });

  // Нахождение максимума для нормализации цвета
  const max = Math.max(...heatmap.flat());

  // Очистка контейнера
  container.innerHTML = '';

  // Создание ячеек
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = heatmap[day][hour] || 0;
      const cell = document.createElement('div');
      cell.style.width = '100%';
      cell.style.aspectRatio = '1';
      cell.style.borderRadius = '3px';
      cell.title = `${count} tweet(s)\n${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}, ${hour}:00 UTC`;

      if (count === 0) {
        cell.style.backgroundColor = 'rgba(255,255,255,0.03)';
      } else {
        // Цвет от светло-бирюзового к насыщенному (#6fe3d1 → #00a896)
        const intensity = count / (max || 1); // 0..1
        const r = Math.floor(111 * intensity + 255 * (1 - intensity));
        const g = Math.floor(227 * intensity + 255 * (1 - intensity));
        const b = Math.floor(209 * intensity + 255 * (1 - intensity));
        cell.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
      }
      container.appendChild(cell);
    }
  }
}

// --- Функция для скачивания файла ---
function downloadFile(filename, content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Функция экспорта в CSV ---
function exportToCSV() {
  const users = window._analyticsFilteredData?.users || {};
  const rows = [];

  // Заголовок
  rows.push(['Username', 'Posts', 'Likes', 'Views'].join(','));

  // Данные
  for (const [username, stats] of Object.entries(users)) {
    rows.push([username, stats.posts, stats.likes, stats.views].map(v => `"${v}"`).join(','));
  }

  const csvContent = rows.join('\n');
  downloadFile('leaderboard-export.csv', csvContent, 'text/csv');
}

// --- Функция экспорта в JSON ---
function exportToJSON() {
  const data = window._analyticsFilteredData || {};
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile('leaderboard-export.json', jsonContent, 'application/json');
}

// --- Функция привязки кнопок экспорта ---
function bindExportButtons() {
  const csvBtn = document.getElementById('export-csv');
  const jsonBtn = document.getElementById('export-json');
  if (csvBtn && !csvBtn._bound) {
    csvBtn.addEventListener('click', exportToCSV);
    csvBtn._bound = true;
  }
  if (jsonBtn && !jsonBtn._bound) {
    jsonBtn.addEventListener('click', exportToJSON);
    jsonBtn._bound = true;
  }
}


function renderAnalytics() {
  // Filter tweets by the selected analytics period
  let tweets = Array.isArray(allTweets) ? allTweets : [];
  const now = new Date();
  const period = analyticsPeriod;

  if (period !== 'all') {
    const days = Number(period);
    if (days > 0) {
      tweets = tweets.filter(t => {
        const created = t.tweet_created_at || t.created_at || t.created || null;
        if (!created) return false;
        const d = new Date(created);
        if (isNaN(d)) return false;
        const diffDays = (now - d) / (1000 * 60 * 60 * 24);
        return diffDays <= days;
      });
    }
  }

  // build per-user aggregates: posts, likes, views (from FILTERED tweets)
  const users = {}; // {uname: {posts, likes, views}}
  tweets.forEach(t => {
    const u = (t.user && (t.user.screen_name || t.user.name)) || t.username || "";
    const uname = String(u).toLowerCase().replace(/^@/, "");
    if (!uname) return;
    const likes = Number(t.favorite_count || t.likes || t.like_count || 0) || 0;
    const views = Number(t.views_count || t.views || 0) || 0;
    if (!users[uname]) users[uname] = { posts: 0, likes: 0, views: 0 };
    users[uname].posts += 1;
    users[uname].likes += likes;
    users[uname].views += views;
  });

  const uniqueUsers = Object.keys(users).length;
  const totalPosts = tweets.length;
  const totalLikes = Object.values(users).reduce((s,u)=>s+u.likes,0);
  const totalViews = Object.values(users).reduce((s,u)=>s+u.views,0);

  // 1) Averages per user
  const avgPosts = uniqueUsers ? (totalPosts/uniqueUsers) : 0;
  const avgLikes = uniqueUsers ? (totalLikes/uniqueUsers) : 0;
  const avgViews = uniqueUsers ? (totalViews/uniqueUsers) : 0;
  const elAvgPosts = document.getElementById('avg-posts');
  const elAvgLikes = document.getElementById('avg-likes');
  const elAvgViews = document.getElementById('avg-views');
  if (elAvgPosts) elAvgPosts.textContent = `Avg Posts: ${avgPosts.toFixed(2)}`;
  if (elAvgLikes) elAvgLikes.textContent = `Avg Likes: ${avgLikes.toFixed(2)}`;
  if (elAvgViews) elAvgViews.textContent = `Avg Views: ${avgViews.toFixed(2)}`;

  // Store filtered data globally for use in event handlers
  window._analyticsFilteredData = { tweets, users, period };

  // helper to render top authors by metric (uses CURRENT stored data)
  function renderTopAuthors(metric) {
    const listEl = document.getElementById('top-authors-list');
    if (!listEl) return;
    const data = window._analyticsFilteredData || { users: {} };
    const arr = Object.entries(data.users).map(([name,stats]) => ({ name, value: Number(stats[metric]||0), stats }));
    arr.sort((a,b)=> b.value - a.value);
    const top = arr.slice(0,10);
    listEl.innerHTML = '';
    if (top.length === 0) {
      listEl.innerHTML = '<li>Нет данных</li>';
      return;
    }
    top.forEach((it, idx) => {
      const li = document.createElement('li');
    li.innerHTML = `${idx+1}. <strong>${escapeHtml(it.name)}</strong> — <span class="author-metric-value">${it.value}</span>`;
      listEl.appendChild(li);
    });
  }

  // helper to render top posts by metric (uses CURRENT stored data)
  function renderTopPosts(metric) {
    const listEl = document.getElementById('top-posts-list');
    if (!listEl) return;
    const data = window._analyticsFilteredData || { tweets: [] };
    const postsArr = data.tweets.map(t => {
      const likes = Number(t.favorite_count || t.likes || t.like_count || 0) || 0;
      const views = Number(t.views_count || t.views || 0) || 0;
      const text = (t.full_text || t.text || t.content || '').slice(0,200);
      const author = (t.user && (t.user.screen_name || t.user.name)) || t.username || '';
      const url = t.url || (t.id_str && author ? `https://twitter.com/${author}/status/${t.id_str}` : '#');
      return { t, likes, views, text, author, url };
    });
    postsArr.sort((a,b) => (b[metric]||0) - (a[metric]||0));
    const top = postsArr.slice(0,10);
    listEl.innerHTML = '';
    if (top.length === 0) { listEl.innerHTML = '<li>Нет данных</li>'; return; }
    top.forEach((p, idx) => {
      const li = document.createElement('li');
      li.className = 'top-post-item';
      const excerpt = document.createElement('div');
      excerpt.className = 'excerpt';
      excerpt.innerHTML = `<a href="${p.url}" target="_blank">${escapeHtml(p.text || '(no text)')}</a>`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<div class="author">${escapeHtml(p.author || '(unknown)')}</div><div class="metric">${p[metric] || 0}</div>`;
      li.appendChild(excerpt);
      li.appendChild(meta);
      listEl.appendChild(li);
    });
  }

  // Tweets per day data for chart (adaptive date range based on period)
  const perDay = {}; // key YYYY-MM-DD -> count
  const chartDays = period === 'all' ? 60 : (period === '7' ? 7 : (period === '14' ? 14 : 30));
  tweets.forEach(t => {
    const created = t.tweet_created_at || t.created_at || t.created || null;
    if (!created) return;
    const d = new Date(created);
    if (isNaN(d)) return;
    const key = d.toISOString().slice(0,10);
    perDay[key] = (perDay[key] || 0) + 1;
  });

  // prepare labels/data arrays for last N days
  const labels = [];
  const counts = [];
  for (let i = chartDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0,10);
    labels.push(key);
    counts.push(perDay[key] || 0);
  }

  // render/update Chart.js chart
try {
  const ctx = document.getElementById('analytics-chart');
  if (ctx) {
    if (analyticsChart) {
      analyticsChart.data.labels = labels;
      analyticsChart.data.datasets[0].data = counts;
      analyticsChart.update();
    } else if (window.Chart) {
      analyticsChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Tweets per day',
            backgroundColor: 'rgba(255, 255, 255, 0.9)', // Цвет заливки столбцов
            borderColor: 'rgba(0, 255, 255, 1)',     // Цвет обводки столбцов
             counts
          }]
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                maxRotation: 0,
                minRotation: 0,
                color: '#ffffff' // Цвет меток (дат) на оси X - ОСТАВИТЬ
              }
            },
            y: {
              beginAtZero: true
              // ticks: { // <-- УБРАТЬ ЭТОТ БЛОК ИЛИ НЕ ДОБАВЛЯТЬ color СЮДА
              //   color: '#ffffff' // Цвет меток (цифр) на оси Y - УДАЛИТЬ ЭТУ СТРОКУ
              // }
            }
          }
        }
      });
    }
  }
} catch (err) {
  console.warn('Chart render failed', err);
}

  // initial render using default selects (if present)
  const authorMetricSelect = document.getElementById('author-metric-select');
  const postMetricSelect = document.getElementById('post-metric-select');
  const authorMetric = authorMetricSelect ? authorMetricSelect.value : 'posts';
  const postMetric = postMetricSelect ? postMetricSelect.value : 'likes';
  renderTopAuthors(authorMetric);
  renderTopPosts(postMetric);

  // attach listeners (idempotent) — these now call the stored-data versions
  if (authorMetricSelect && !authorMetricSelect._bound) {
    authorMetricSelect.addEventListener('change', e => renderTopAuthors(e.target.value));
    authorMetricSelect._bound = true;
  }
  if (postMetricSelect && !postMetricSelect._bound) {
    postMetricSelect.addEventListener('change', e => renderTopPosts(e.target.value));
    postMetricSelect._bound = true;
  }

  // --- ВЫЗОВЫ НОВЫХ ФУНКЦИЙ ---
  renderHeatmap(tweets);
  bindExportButtons();
}

// Analytics time period filter
const analyticsTimeSelect = document.getElementById('analytics-time-select');
if (analyticsTimeSelect) {
  analyticsTimeSelect.addEventListener('change', e => {
    analyticsPeriod = e.target.value || 'all';
    renderAnalytics();
  });
}

// Nested analytics tabs setup
function setupAnalyticsTabs() {
  const btns = document.querySelectorAll('.analytics-tab-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all buttons and sections
      btns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.analytics-nested-content').forEach(s => s.classList.remove('active'));
      // Add active to clicked button and corresponding section
      btn.classList.add('active');
      const section = btn.dataset.analyticsTab;
      const sectionEl = document.querySelector(`[data-analytics-section="${section}"]`);
      if (sectionEl) sectionEl.classList.add('active');
    });
  });
}

// Инициализация табов
try { setupTabs(); setupAnalyticsTabs(); } catch(e) { console.warn('Tabs init failed', e); }



// === SNOW EFFECT INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    const snowContainer = document.getElementById('snowContainer');
    if (!snowContainer) {
        console.warn('Snow container element not found.');
        return;
    }

    const snowflakeCount = 50; // Количество снежинок (можно регулировать плотность)
    const containerRect = snowContainer.getBoundingClientRect();

    for (let i = 0; i < snowflakeCount; i++) {
        const flake = document.createElement('div');
        flake.classList.add('snowflake');

        // Случайные размеры снежинок (например, от 2 до 6 пикселей)
        const size = Math.random() * 4 + 2;
        flake.style.width = `${size}px`;
        flake.style.height = `${size}px`;

        // Случайная начальная позиция X
        const startX = Math.random() * containerRect.width;
        flake.style.left = `${startX}px`;
        flake.style.top = `${Math.random() * -containerRect.height}px`; // Начинают падать сверху

        // Случайные параметры анимации для разнообразия
        const durationFall = Math.random() * 10 + 5; // Длительность падения (5-15 секунд)
        const durationSway = Math.random() * 4 + 3;  // Длительность колебания (3-7 секунд)
        const swayAmplitude = Math.random() * 30 + 10; // Амплитуда колебания (10-40px)

        // Применяем анимацию
        flake.style.animationDuration = `${durationFall}s, ${durationSway}s`;
        // Для анимации sway используем transform с динамической амплитудой
        // Это сложнее задать через style, лучше оставить базовую анимацию в CSS
        // и генерировать уникальные ключевые кадры при необходимости.
        // Для простоты используем CSS анимацию и немного модифицируем её поведение.
        // Мы можем динамически создавать уникальные @keyframes, но это громоздко.
        // Вместо этого, можно просто менять transform вручную через JS с requestAnimationFrame,
        // но анимация CSS обычно плавнее.

        // Простой способ добавить немного индивидуальности без динамических @keyframes:
        // Случайная задержка начала анимации
        flake.style.animationDelay = `${Math.random() * 5}s`; // Задержка от 0 до 5 секунд

        snowContainer.appendChild(flake);
    }

    // Опционально: пересчитать позиции при изменении размера окна
    window.addEventListener('resize', () => {
        const newRect = snowContainer.getBoundingClientRect();
        // Снежинки останутся на своих относительных позициях,
        // но можно добавить логику перераспределения при необходимости.
        // Для базового эффекта пересчёт не обязателен.
    });
});
