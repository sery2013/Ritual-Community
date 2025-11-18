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
let analyticsHourFilter = "all"; // filter for heatmap hour: 'all', '0', '1', ... '23'
let currentLang = 'en'; // Глобальная переменная для текущего языка

// - Fetch leaderboard data -
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

// - Fetch all tweets -
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

// - Normalize leaderboard data -
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

// - Update totals -
function updateTotals() {
  const totalPosts = data.reduce((sum, s) => sum + (Number(s.posts) || 0), 0);
  const totalViews = data.reduce((sum, s) => sum + (Number(s.views) || 0), 0);
  document.getElementById("total-posts").textContent = `Total Posts: ${totalPosts}`;
  document.getElementById("total-users").textContent = `Total Users: ${data.length}`;
  document.getElementById("total-views").textContent = `Total Views: ${totalViews}`;
}

// - Sort, Filter, Render -
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

// - SHARE BUTTON FUNCTIONALITY -
function shareUserOnTwitter(username) {
    const tweetText = `Check out @${username} on the Ritual Community Leaderboard! #RitualCommunity #Leaderboard`;
    const leaderboardUrl = window.location.href;
    const encodedText = encodeURIComponent(tweetText);
    const encodedUrl = encodeURIComponent(leaderboardUrl);
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    window.open(twitterIntentUrl, '_blank', 'width=600,height=400');
}

// - Render Table with Share Button -
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
    // - НАЧАЛО ИЗМЕНЕНИЙ: Создание ячейки с именем и кнопкой -
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
    // - ОБНОВЛЕНИЕ ПОДСКАЗКИ shareBtn В ЗАВИСИМОСТИ ОТ ЯЗЫКА -
    const shareBtnTitle = currentLang === 'en' ? `Share ${escapeHtml(name)}'s stats on Twitter` : `Поделиться статистикой ${escapeHtml(name)} в Twitter`;
    shareBtn.title = shareBtnTitle; // Подсказка при наведении
    // - КОНЕЦ ОБНОВЛЕНИЯ ПОДСКАЗКИ -
    shareBtn.onclick = function(e) {
        e.stopPropagation(); // ВАЖНО: Останавливаем всплытие, чтобы клик не сработал на строке таблицы
        shareUserOnTwitter(name); // Функция, которая откроет окно Twitter Intent
    };
    nameContainer.appendChild(nameSpan);
    nameContainer.appendChild(shareBtn);
    nameCell.appendChild(nameContainer);
    // - КОНЕЦ ИЗМЕНЕНИЙ -
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

// - Escaping HTML -
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

// - Sorting headers -
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

// - Pagination -
document.getElementById("prev-page").onclick = () => { if (currentPage > 1) { currentPage--; renderTable(); } };
document.getElementById("next-page").onclick = () => {
  const total = Math.ceil(filterData().length / perPage);
  if (currentPage < total) { currentPage++; renderTable(); }
};

// - Search -
document.getElementById("search").addEventListener("input", () => { currentPage = 1; renderTable(); });

// - Sorting headers click -
["posts","likes","retweets","comments","views"].forEach(key => {
  const el = document.getElementById(key === "views" ? "views-col-header" : key+"-header");
  if(el) el.addEventListener("click", () => updateSort(key));
});

// - Time filter -
document.getElementById("time-select").addEventListener("change", e => {
  timeFilter = e.target.value || "all";
  currentPage = 1;
  normalizeData(rawData);
  sortData();
  renderTable();
  updateTotals();
});

// - Отображение твитов при клике на пользователя -
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

// - Добавляем обработчики клика на строки таблицы после рендера -
function addUserClickHandlers() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            const username = tr.children[0].textContent.trim();
            showTweets(username);
        });
    });
}

// - Создание аккордеона твитов -
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

// - Обновляем обработчики клика -
function addUserClickHandlers() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            const username = tr.children[0].textContent.trim();
            toggleTweetsRow(tr, username);
        });
    });
}

// - renderTable остаётся как раньше, addUserClickHandlers вызывается в конце -

// - Tabs setup and Analytics rendering -
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

// - Функция для отрисовки тепловой гистограммы -
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
      cell.title = `${count} tweet(s)
${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}, ${hour}:00 UTC`;
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

// - Функция для скачивания файла -
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

// - Функция экспорта в CSV -
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

// - Функция экспорта в JSON -
function exportToJSON() {
  const data = window._analyticsFilteredData || {};
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile('leaderboard-export.json', jsonContent, 'application/json');
}

// - Функция привязки кнопок экспорта -
function bindExportButtons() {
  const csvBtn = document.getElementById('export-csv');
  const jsonBtn = document.getElementById('export-json');
  if (csvBtn && !csvBtn._bound) {
    csvBtn.addEventListener('click', function(e) {
      e.preventDefault(); // Останавливаем любое стандартное поведение
      e.stopPropagation(); // Останавливаем всплытие, чтобы не повлиять на родителей
      exportToCSV();
    });
    csvBtn._bound = true;
  }
  if (jsonBtn && !jsonBtn._bound) {
    jsonBtn.addEventListener('click', function(e) {
      e.preventDefault(); // Останавливаем любое стандартное поведение
      e.stopPropagation(); // Останавливаем всплытие, чтобы не повлиять на родителей
      exportToJSON();
    });
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
  // - НОВЫЙ ФИЛЬТР: Фильтрация по часу -
  if (analyticsHourFilter !== 'all') {
      const targetHour = Number(analyticsHourFilter);
      if (!isNaN(targetHour) && targetHour >= 0 && targetHour <= 23) {
          tweets = tweets.filter(t => {
              const created = t.tweet_created_at || t.created_at || t.created || null;
              if (!created) return false;
              const d = new Date(created);
              if (isNaN(d)) return false;
              const hour = d.getUTCHours();
              return hour === targetHour;
          });
      }
  }
  // - КОНЕЦ НОВОГО ФИЛЬТРА -
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
      // --- НАЧАЛО ИЗМЕНЕНИЯ: Структура элемента списка для "Top 10 authors" ---
      const li = document.createElement('li');
      li.className = 'top-author-item'; // Класс для нового CSS
      // Собираем строку с иконками и цифрами
      const postsStr = `<span class="metric-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:inline; margin-right: 2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87.69 6.89L12 21.5l-5.69-1.48.69-6.89-5-4.87 6.81-1.01L12 2z"/></svg>${it.stats.posts} posts</span>`;
      const likesStr = `<span class="metric-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:inline; margin-right: 2px;"><path d="M12 21.35l-1.45-1.45C5.4 15.56 2 12.12 2 8.5c0-1.74.67-3.35 1.96-4.64A23.85 23.85 0 0112 0c8.25 0 15.5 5.5 15.5 15.5 0 1.74-.67 3.35-1.96 4.64l-1.45 1.45C19.5 21.35 16.5 24 12 24z"/></svg>${it.stats.likes} likes</span>`;
      const retweetsStr = `<span class="metric-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:inline; margin-right: 2px;"><path d="M17 7h-4v2h4v6h-4v2h4v2H7v-2h4V9H7V7h10z"/></svg>${it.stats.retweets} retweets</span>`;
      const viewsStr = `<span class="metric-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:inline; margin-right: 2px;"><path d="M12 6c3.76 0 7.08 2.06 9.07 5.33 1.99 3.27 1.99 7.24 0 10.51C19.08 25.14 15.76 27.2 12 27.2s-7.08-2.06-9.07-5.33c-1.99-3.27-1.99-7.24 0-10.51C4.92 8.06 8.24 6 12 6zm0 2c-1.66 0-3.18.7-4.25 1.81L12 14l4.25-4.19C15.18 8.7 13.66 8 12 8zm0 12c1.66 0 3.18-.7 4.25-1.81L12 18l-4.25 4.19C8.82 23.3 10.34 24 12 24z"/></svg>${it.stats.views} views</span>`;
      // Формируем содержимое <li>
      li.innerHTML = `
          <div class="author-info">
              <span class="author-rank">${idx + 1}.</span>
              <strong class="author-name">${escapeHtml(it.name)}</strong>
              <div class="author-metrics">
                  ${postsStr}
                  ${likesStr}
                  ${retweetsStr}
                  ${viewsStr}
              </div>
          </div>
          <div class="author-sort-value">
              ${it.value} ${metric === 'posts' ? 'posts' : metric === 'likes' ? 'likes' : 'views'}
          </div>
      `;
      listEl.appendChild(li);
      // --- КОНЕЦ ИЗМЕНЕНИЯ ---
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
        type: 'line', // МЕНЯЕМ тип графика с 'bar' на 'line'
        data: {
          labels: labels,
          datasets: [{
            label: 'Tweets per day',
             counts,
            fill: false, // Не заполнять область под линией
            borderColor: '#ffffff', // Цвет линии - белый
            borderWidth: 2, // Толщина линии
            pointBackgroundColor: '#ffffff', // Цвет точки (заполнение)
            pointBorderColor: '#ffffff', // Цвет обводки точки
            pointBorderWidth: 2, // Толщина обводки точки
            pointRadius: 4, // Размер точки
            pointHoverRadius: 6, // Размер точки при наведении
            tension: 0.3 // Плавность кривой (0 = прямые линии, 1 = очень плавные)
          }]
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }, // Скрываем легенду
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                label: function(context) {
                  return `Tweets: ${context.raw}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                color: 'rgba(255, 255, 255, 0.1)' // Цвет сетки по оси X
              },
              ticks: {
                maxRotation: 0,
                minRotation: 0,
                color: '#ffffff' // Цвет меток (дат) на оси X
              }
            },
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(255, 255, 255, 0.1)' // Цвет сетки по оси Y
              },
              ticks: {
                color: '#ffffff' // Цвет меток (цифр) на оси Y
              }
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
  // - ВЫЗОВЫ НОВЫХ ФУНКЦИЙ -
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

// - НОВЫЙ ОБРАБОТЧИК: Фильтр по часам -
const hourSelect = document.getElementById('hour-select');
if (hourSelect) {
    hourSelect.addEventListener('change', e => {
        analyticsHourFilter = e.target.value || 'all';
        renderAnalytics();
    });
}
// - КОНЕЦ НОВОГО ОБРАБОТЧИКА -

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

// === LANGUAGE SWITCHER ===
// Глобальная переменная currentLang объявлена в начале

function setLanguage(lang) {
    currentLang = lang;
    // Сохраняем язык в localStorage
    localStorage.setItem('lang', lang);

    // Обновляем активные классы кнопок переключателя
    const langEn = document.getElementById('lang-en');
    const langRu = document.getElementById('lang-ru');
    if (langEn) {
        langEn.classList.toggle('active', lang === 'en');
        langEn.classList.toggle('inactive', lang !== 'en'); // Опционально для стилей
    }
    if (langRu) {
        langRu.classList.toggle('active', lang === 'ru');
        langRu.classList.toggle('inactive', lang !== 'ru'); // Опционально для стилей
    }

    // --- ОБНОВЛЕНИЕ ТЕКСТА В .welcome-section ---
    const h1 = document.getElementById('welcome-title');
    if (h1) h1.textContent = lang === 'en' ? 'WELCOME RITUALISTS!' : 'ДОБРО ПОЖАЛОВАТЬ, РИТУАЛИСТЫ!';

    const welcomeP1 = document.getElementById('welcome-desc-1');
    if (welcomeP1) welcomeP1.innerHTML = lang === 'en' ? 'This leaderboard is generated based on all posts in the <a href="https://x.com/i/communities/1896991026272723220" target="_blank">Ritual Community</a>.' : 'Этот список лидеров генерируется на основе всех постов в <a href="https://x.com/i/communities/1896991026272723220" target="_blank">сообществе Ritual</a>.';

    const welcomeP2 = document.getElementById('welcome-desc-2');
    if (welcomeP2) welcomeP2.innerHTML = lang === 'en' ? 'If your posts are not published through <a href="https://x.com/i/communities/1896991026272723220" target="_blank">Ritual Community</a>, they will not be visible on the leaderboard.' : 'Если ваши посты опубликованы не через <a href="https://x.com/i/communities/1896991026272723220" target="_blank">сообщество Ritual</a>, они не будут видны в списке лидеров.';

    const welcomeP3 = document.getElementById('welcome-desc-3');
    if (welcomeP3) welcomeP3.textContent = lang === 'en' ? 'By clicking on any participant, you can view their works directly on the website.' : 'Нажав на любого участника, вы можете просмотреть его работы непосредственно на веб-сайте.';

    const welcomeP4 = document.getElementById('welcome-desc-4');
    if (welcomeP4) welcomeP4.textContent = lang === 'en' ? 'By clicking on any metric (for example, views), you can filter by it.' : 'Нажав на любую метрику (например, просмотры), вы можете отфильтровать по ней.';

    const updateInfoP = document.getElementById('last-updated-static');
    if (updateInfoP) updateInfoP.textContent = lang === 'en' ? 'Updated every 2 days' : 'Обновляется каждые 2 дня';

    const supportP = document.getElementById('support-us');
    if (supportP) supportP.textContent = lang === 'en' ? 'Support us on Twitter!' : 'Поддержите нас в Twitter!';

    // --- ИСПРАВЛЕНИЕ: Обновление текста и стилей для блока "Follow Developer" ---
    const followDevTextElement = document.getElementById('follow-dev-text');
    const followDevLinkElement = document.getElementById('follow-dev-link');
    if (followDevTextElement && followDevLinkElement) {
        // Обновляем текст до ссылки
        const linkText = followDevLinkElement.textContent; // Сохраняем текст ссылки
        followDevTextElement.textContent = lang === 'en' ? 'Follow Developer - ' : 'Следите за разработчиком - ';
        // Восстанавливаем ссылку с правильным текстом и стилями
        followDevLinkElement.textContent = linkText; // Восстанавливаем текст '@kaye_moni'
        // Применяем стили к ссылке, как в index.html
        followDevLinkElement.style.color = 'white';
        followDevLinkElement.style.textDecoration = 'underline';
        // Вставляем ссылку обратно внутрь элемента follow-dev-text
        followDevTextElement.appendChild(followDevLinkElement);
    }
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
    // --- ОБНОВЛЕНИЕ ТЕКСТА "Last updated:" ---
    const lastUpdatedLabel = document.getElementById('label-last-updated');
    if (lastUpdatedLabel) {
        // Предполагаем, что текст до span не меняется, и меняем только его содержимое
        lastUpdatedLabel.textContent = lang === 'en' ? 'Last updated:' : 'Последнее обновление:';
    }
    // --- КОНЕЦ ОБНОВЛЕНИЯ ТЕКСТА "Last updated:" ---

    // --- ОБНОВЛЕНИЕ ТЕКСТА В ФИЛЬТРАХ И ЭЛЕМЕНТАХ LEADERBOARD ---
    const timeSelectOptions = document.querySelectorAll('#time-select option');
    if (timeSelectOptions.length >= 4) {
        timeSelectOptions[0].textContent = lang === 'en' ? 'Last 7 days' : 'Последние 7 дней';
        timeSelectOptions[1].textContent = lang === 'en' ? 'Last 14 days' : 'Последние 14 дней';
        timeSelectOptions[2].textContent = lang === 'en' ? 'Last 30 days' : 'Последние 30 дней';
        timeSelectOptions[3].textContent = lang === 'en' ? 'All time' : 'За всё время';
    }

    const searchInput = document.getElementById('search');
    if (searchInput) searchInput.placeholder = lang === 'en' ? 'Type @handle or part of name...' : 'Введите @ник или часть имени...'; // Обновлено

    const prevPageBtn = document.getElementById('prev-page');
    if (prevPageBtn) prevPageBtn.textContent = lang === 'en' ? 'Previous' : 'Предыдущая'; // Обновлено

    const nextPageBtn = document.getElementById('next-page');
    if (nextPageBtn) nextPageBtn.textContent = lang === 'en' ? 'Next' : 'Следующая'; // Обновлено

    // --- ОБНОВЛЕНИЕ ТЕКСТА ВО ВКЛАДКАХ ---
    const leaderboardTabBtn = document.getElementById('tab-leaderboard-btn');
    if (leaderboardTabBtn) leaderboardTabBtn.textContent = lang === 'en' ? 'Leaderboard' : 'Лидерборд';

    const analyticsTabBtn = document.getElementById('tab-analytics-btn');
    if (analyticsTabBtn) analyticsTabBtn.textContent = lang === 'en' ? 'Analytics' : 'Аналитика';

    // --- ОБНОВЛЕНИЕ ТЕКСТА В ANALYTICS ---
    const analyticsH2 = document.getElementById('analytics-title');
    if (analyticsH2) analyticsH2.textContent = lang === 'en' ? 'Analytics' : 'Аналитика';

    const analyticsTimeOptions = document.querySelectorAll('#analytics-time-select option');
    if (analyticsTimeOptions.length >= 4) {
        analyticsTimeOptions[0].textContent = lang === 'en' ? 'All time' : 'За всё время';
        analyticsTimeOptions[1].textContent = lang === 'en' ? 'Last 30 days' : 'Последние 30 дней';
        analyticsTimeOptions[2].textContent = lang === 'en' ? 'Last 14 days' : 'Последние 14 дней';
        analyticsTimeOptions[3].textContent = lang === 'en' ? 'Last 7 days' : 'Последние 7 дней';
    }

    // --- ОБНОВЛЕНИЕ ТЕКСТА LABEL И ОПЦИЙ ДЛЯ ФИЛЬТРА ПО ЧАСАМ ---
    const analyticsTimeLabel = document.getElementById('analytics-time-label');
    if (analyticsTimeLabel) analyticsTimeLabel.textContent = lang === 'en' ? 'Filter by time:' : 'Фильтровать по времени:';

    const hourLabel = document.getElementById('hour-label');
    if (hourLabel) hourLabel.textContent = lang === 'en' ? 'Filter by hour:' : 'Фильтровать по часу:';

    const hourSelectOptions = document.querySelectorAll('#hour-select option');
    if (hourSelectOptions.length >= 25) { // Проверяем, что есть опции "All hours" и "0"-"23"
        hourSelectOptions[0].textContent = lang === 'en' ? 'All hours' : 'Все часы';
        // Опции часов 00:00 - 23:00 уже имеют правильный формат (например, "00:00"), не переводим их
        for (let i = 1; i <= 24; i++) {
            if (hourSelectOptions[i]) {
                // hourSelectOptions[i].textContent = `${i - 1}:00`; // Не нужно менять, так как формат HH:00 не переводится
            }
        }
    }
    // --- КОНЕЦ ОБНОВЛЕНИЯ ТЕКСТА LABEL И ОПЦИЙ ДЛЯ ФИЛЬТРА ПО ЧАСАМ ---

    const avgMetricsBtn = document.getElementById('analytics-tab-averages');
    if (avgMetricsBtn) avgMetricsBtn.textContent = lang === 'en' ? 'Avg metrics' : 'Средние метрики';

    const topAuthorsBtn = document.getElementById('analytics-tab-authors');
    if (topAuthorsBtn) topAuthorsBtn.textContent = lang === 'en' ? 'Top 10 authors' : 'Топ 10 авторов';

    const topPostsBtn = document.getElementById('analytics-tab-posts');
    if (topPostsBtn) topPostsBtn.textContent = lang === 'en' ? 'Top 10 posts' : 'Топ 10 постов';

    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) exportCsvBtn.textContent = lang === 'en' ? 'Export CSV' : 'Экспорт CSV';

    const exportJsonBtn = document.getElementById('export-json-btn');
    if (exportJsonBtn) exportJsonBtn.textContent = lang === 'en' ? 'Export JSON' : 'Экспорт JSON';

    // --- ОБНОВЛЕНИЕ ЗАГОЛОВКОВ ТАБЛИЦЫ ---
    const headers = {
        'name-header': { en: 'User', ru: 'Пользователь' },
        'posts-header': { en: 'Posts ▲', ru: 'Посты ▲' }, // Обновлено
        'likes-header': { en: 'Likes', ru: 'Лайки' },
        'retweets-header': { en: 'Retweets', ru: 'Ретвиты' },
        'comments-header': { en: 'Comments', ru: 'Комментарии' },
        'views-col-header': { en: 'Views', ru: 'Просмотры' }
    };
    Object.entries(headers).forEach(([id, texts]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = texts[lang];
    });

    // --- ОБНОВЛЕНИЕ ТЕКСТА ФИЛЬТРОВ В ANALYTICS ---
    const authorMetricOptions = document.querySelectorAll('#author-metric-select option');
    if (authorMetricOptions.length >= 3) {
        authorMetricOptions[0].textContent = lang === 'en' ? 'Posts' : 'Посты';
        authorMetricOptions[1].textContent = lang === 'en' ? 'Likes' : 'Лайки';
        authorMetricOptions[2].textContent = lang === 'en' ? 'Views' : 'Просмотры';
    }

    const postMetricOptions = document.querySelectorAll('#post-metric-select option');
    if (postMetricOptions.length >= 2) {
        postMetricOptions[0].textContent = lang === 'en' ? 'Likes' : 'Лайки';
        postMetricOptions[1].textContent = lang === 'en' ? 'Views' : 'Просмотры';
    }

    // --- ОБНОВЛЕНИЕ ТЕКСТА ЭЛЕМЕНТОВ ВЛОЖЕННЫХ РАЗДЕЛОВ ANALYTICS ---
    const avgMetricsH3 = document.getElementById('analytics-averages-title');
    if (avgMetricsH3) avgMetricsH3.textContent = lang === 'en' ? 'Average metrics per user' : 'Средние метрики на пользователя';

    const heatmapH3 = document.getElementById('heatmap-title');
    if (heatmapH3) heatmapH3.textContent = lang === 'en' ? 'Activity Heatmap (Tweets by Day & Hour)' : 'Тепловая карта активности (Твиты по дням и часам)';

    const topAuthorsH3 = document.getElementById('top-authors-title');
    if (topAuthorsH3) topAuthorsH3.textContent = lang === 'en' ? 'Top 10 authors' : 'Топ 10 авторов';

    const topPostsH3 = document.getElementById('top-posts-title');
    if (topPostsH3) topPostsH3.textContent = lang === 'en' ? 'Top 10 posts' : 'Топ 10 постов';

    const sortLabel1 = document.getElementById('author-metric-label');
    if (sortLabel1) sortLabel1.textContent = lang === 'en' ? 'Sort by:' : 'Сортировать по:';

    const sortLabel2 = document.getElementById('post-metric-label');
    if (sortLabel2) sortLabel2.textContent = lang === 'en' ? 'Sort by:' : 'Сортировать по:';

    // --- ОБНОВЛЕНИЕ ТЕКСТА В БЛОКАХ СТАТИСТИКИ ---
    // Функция обновления текста в блоках статистики (Total Posts, Avg Posts и т.д.)
    // Извлекаем числовые значения перед обновлением текста
    const totalPostsEl = document.getElementById('total-posts');
    if (totalPostsEl) {
        const currentText = totalPostsEl.textContent;
        // Извлекаем значение после ":"
        const value = currentText.split(': ')[1] || '0';
        totalPostsEl.textContent = lang === 'en' ? `Total Posts: ${value}` : `Всего Постов: ${value}`;
    }
    const totalUsersEl = document.getElementById('total-users');
    if (totalUsersEl) {
        const currentText = totalUsersEl.textContent;
        const value = currentText.split(': ')[1] || '0';
        totalUsersEl.textContent = lang === 'en' ? `Total Users: ${value}` : `Всего Пользователей: ${value}`;
    }
    const totalViewsEl = document.getElementById('total-views');
    if (totalViewsEl) {
        const currentText = totalViewsEl.textContent;
        const value = currentText.split(': ')[1] || '0';
        totalViewsEl.textContent = lang === 'en' ? `Total Views: ${value}` : `Всего Просмотров: ${value}`;
    }
    const avgPostsEl = document.getElementById('avg-posts');
    if (avgPostsEl) {
        const currentText = avgPostsEl.textContent;
        const value = currentText.split(': ')[1] || '0.00';
        avgPostsEl.textContent = lang === 'en' ? `Avg Posts: ${value}` : `Среднее Постов: ${value}`;
    }
    const avgLikesEl = document.getElementById('avg-likes');
    if (avgLikesEl) {
        const currentText = avgLikesEl.textContent;
        const value = currentText.split(': ')[1] || '0.00';
        avgLikesEl.textContent = lang === 'en' ? `Avg Likes: ${value}` : `Среднее Лайков: ${value}`;
    }
    const avgViewsEl = document.getElementById('avg-views');
    if (avgViewsEl) {
        const currentText = avgViewsEl.textContent;
        const value = currentText.split(': ')[1] || '0.00';
        avgViewsEl.textContent = lang === 'en' ? `Avg Views: ${value}` : `Среднее Просмотров: ${value}`;
    }

    // --- ОБНОВЛЕНИЕ ТЕКСТА МЕТОК ПОИСКА И ФИЛЬТРАЦИИ ---
    const searchLabel = document.getElementById('search-label');
    if (searchLabel) searchLabel.textContent = lang === 'en' ? 'SEARCH USER' : 'ПОИСК ПОЛЬЗОВАТЕЛЯ';

    const filterLabel = document.getElementById('filter-label');
    if (filterLabel) filterLabel.textContent = lang === 'en' ? 'FILTER BY TIME:' : 'ФИЛЬТРОВАТЬ ПО ВРЕМЕНИ:';
}

// --- ОБНОВЛЕНИЕ ПОДСКАЗКИ КНОПКИ "ПОДЕЛИТЬСЯ" В renderTable ---
// Найдите функцию renderTable и измените строку с shareBtn.title следующим образом:
/*
// ВНУТРИ renderTable, ВНУТРИ ЦИКЛА pageData.forEach(stats => { ...
// ...
const shareBtn = document.createElement("button");
// ...
// --- ИЗМЕНЕНИЕ СЛЕДУЮЩЕЙ СТРОКИ ---
shareBtn.title = currentLang === 'en' ? `Share ${escapeHtml(name)}'s stats on Twitter` : `Поделиться статистикой ${escapeHtml(name)} в Twitter`;
// ...
*/
// Эта строка уже внесена в renderTable выше.

// --- ОБРАБОТЧИКИ КЛИКОВ ДЛЯ ПЕРЕКЛЮЧЕНИЯ ЯЗЫКА ---
document.addEventListener('DOMContentLoaded', () => {
    const langEn = document.getElementById('lang-en');
    const langRu = document.getElementById('lang-ru');
    if (langEn) {
        langEn.addEventListener('click', () => {
            if (currentLang !== 'en') {
                setLanguage('en');
            }
        });
    }
    if (langRu) {
        langRu.addEventListener('click', () => {
            if (currentLang !== 'ru') {
                setLanguage('ru');
            }
        });
    }
    // --- ЗАГРУЗКА СОХРАНЕННОГО ЯЗЫКА ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ---
    const savedLang = localStorage.getItem('lang');
    if (savedLang && (savedLang === 'en' || savedLang === 'ru')) {
        setLanguage(savedLang);
    } else {
        // Если язык не сохранен, можно определить по языку браузера (опционально)
        // const browserLang = navigator.language.startsWith('ru') ? 'ru' : 'en';
        // setLanguage(browserLang);
        // Но по умолчанию у нас en, если ничего не сохранено
        setLanguage('en');
    }
});

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

