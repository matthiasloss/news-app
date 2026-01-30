// News App - Main JavaScript

// Lokale API für RSS-Feeds
const API_URL = '/api/news';

// State
let articles = [];
let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
let currentCategory = 'all';
let currentView = 'feed';
let currentArticle = null;
let searchQuery = '';
let settings = JSON.parse(localStorage.getItem('settings') || '{}');

// Default settings
settings = {
    darkMode: false,
    compactMode: false,
    autoRefresh: true,
    imagesOnly: false,
    ...settings
};

// DOM Elements
const newsFeed = document.getElementById('news-feed');
const refreshBtn = document.getElementById('refresh-btn');
const categoryBtns = document.querySelectorAll('.cat-btn');
const modal = document.getElementById('article-modal');
const articleDetail = document.getElementById('article-detail');
const closeBtn = document.querySelector('.close-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const searchToggle = document.getElementById('search-toggle');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const bookmarkBtn = document.getElementById('bookmark-btn');
const shareBtn = document.getElementById('share-btn');
const bottomNavBtns = document.querySelectorAll('.nav-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    applySettings();
    loadNews();
    setupEventListeners();
    registerServiceWorker();
});

// Apply saved settings
function applySettings() {
    if (settings.darkMode) {
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-toggle').checked = true;
        document.getElementById('theme-color').content = '#1a1a1a';
    }
    if (settings.compactMode) {
        document.body.classList.add('compact-mode');
        document.getElementById('compact-toggle').checked = true;
    }
    document.getElementById('auto-refresh-toggle').checked = settings.autoRefresh;
    document.getElementById('images-only-toggle').checked = settings.imagesOnly;
}

// Event Listeners
function setupEventListeners() {
    // Refresh
    refreshBtn.addEventListener('click', () => loadNews(true));

    // Categories
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            renderNews();
        });
    });

    // Article Modal
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Bookmark
    bookmarkBtn.addEventListener('click', toggleBookmark);

    // Share
    shareBtn.addEventListener('click', shareArticle);

    // Settings
    settingsBtn.addEventListener('click', openSettings);
    document.querySelector('.close-settings').addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });

    // Settings toggles
    document.getElementById('dark-mode-toggle').addEventListener('change', (e) => {
        settings.darkMode = e.target.checked;
        document.body.classList.toggle('dark-mode', settings.darkMode);
        document.getElementById('theme-color').content = settings.darkMode ? '#1a1a1a' : '#c00';
        saveSettings();
    });

    document.getElementById('compact-toggle').addEventListener('change', (e) => {
        settings.compactMode = e.target.checked;
        document.body.classList.toggle('compact-mode', settings.compactMode);
        saveSettings();
    });

    document.getElementById('auto-refresh-toggle').addEventListener('change', (e) => {
        settings.autoRefresh = e.target.checked;
        saveSettings();
    });

    document.getElementById('images-only-toggle').addEventListener('change', (e) => {
        settings.imagesOnly = e.target.checked;
        saveSettings();
        renderNews();
    });

    document.getElementById('clear-cache-btn').addEventListener('click', clearCache);
    document.getElementById('clear-bookmarks-btn').addEventListener('click', clearBookmarks);

    // Search
    searchToggle.addEventListener('click', () => {
        searchBar.classList.toggle('hidden');
        if (!searchBar.classList.contains('hidden')) {
            searchInput.focus();
        }
    });

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderNews();
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        renderNews();
    });

    // Bottom Navigation
    bottomNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            bottomNavBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            handleViewChange();
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeSettings();
        }
    });
}

// Handle view change
function handleViewChange() {
    if (currentView === 'bookmarks') {
        currentCategory = 'bookmarks';
        categoryBtns.forEach(b => b.classList.remove('active'));
        document.querySelector('[data-category="bookmarks"]')?.classList.add('active');
    } else if (currentView === 'trending') {
        renderTrending();
        return;
    } else {
        currentCategory = 'all';
        categoryBtns.forEach(b => b.classList.remove('active'));
        document.querySelector('[data-category="all"]')?.classList.add('active');
    }
    renderNews();
}

// Load News from local API
async function loadNews(forceRefresh = false) {
    refreshBtn.classList.add('spinning');
    newsFeed.innerHTML = '<div class="loading">Lade Nachrichten...</div>';

    try {
        const url = forceRefresh ? `${API_URL}?refresh=true` : API_URL;
        const response = await fetch(url);
        const data = await response.json();

        articles = data.articles.map(article => ({
            ...article,
            pubDate: new Date(article.pubDate)
        }));

        // Cache articles
        localStorage.setItem('cachedArticles', JSON.stringify(articles));
        localStorage.setItem('cacheTime', Date.now());

        renderNews();
    } catch (error) {
        console.error('Error loading news:', error);

        // Try to load from cache
        const cached = localStorage.getItem('cachedArticles');
        if (cached) {
            articles = JSON.parse(cached);
            articles = articles.map(a => ({ ...a, pubDate: new Date(a.pubDate) }));
            renderNews();
        } else {
            newsFeed.innerHTML = `
                <div class="error">
                    <h3>Fehler beim Laden</h3>
                    <p>Server nicht erreichbar</p>
                    <button onclick="loadNews(true)">Erneut versuchen</button>
                </div>
            `;
        }
    }

    refreshBtn.classList.remove('spinning');
}

// Render News Cards
function renderNews() {
    let filtered = articles;

    // Filter by category
    if (currentCategory === 'bookmarks') {
        filtered = articles.filter(a => bookmarks.includes(a.id));
    } else if (currentCategory !== 'all') {
        filtered = articles.filter(a => a.category === currentCategory);
    }

    // Filter by search
    if (searchQuery) {
        filtered = filtered.filter(a =>
            a.title.toLowerCase().includes(searchQuery) ||
            a.description.toLowerCase().includes(searchQuery)
        );
    }

    // Filter by images only
    if (settings.imagesOnly) {
        filtered = filtered.filter(a => a.image);
    }

    if (filtered.length === 0) {
        if (currentCategory === 'bookmarks') {
            newsFeed.innerHTML = `
                <div class="empty-state">
                    <div class="icon">⭐</div>
                    <h3>Keine Lesezeichen</h3>
                    <p>Tippe auf ☆ um Artikel zu speichern</p>
                </div>
            `;
        } else {
            newsFeed.innerHTML = '<div class="loading">Keine Nachrichten gefunden</div>';
        }
        return;
    }

    newsFeed.innerHTML = filtered.map((article, index) => `
        <article class="news-card ${index === 0 ? 'featured' : ''}" data-id="${article.id}">
            ${article.image ? `<img src="${article.image}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
            <div class="content">
                <span class="category">${getCategoryLabel(article.category)}</span>
                <h2>${article.title}</h2>
                <p class="excerpt">${article.description}</p>
                <div class="meta">
                    <span class="source">${article.source}</span>
                    <span>
                        ${bookmarks.includes(article.id) ? '<span class="bookmark-indicator">⭐</span>' : ''}
                        ${formatTime(article.pubDate)}
                    </span>
                </div>
            </div>
        </article>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', () => {
            const article = articles.find(a => a.id === card.dataset.id);
            if (article) showArticle(article);
        });
    });
}

// Render Trending
function renderTrending() {
    const trending = [...articles]
        .slice(0, 10);

    newsFeed.innerHTML = `
        <h2 style="padding: 0 0 16px; font-size: 20px;">🔥 Trending</h2>
        ${trending.map((article, index) => `
            <div class="trending-card" data-id="${article.id}">
                <span class="trending-number">${index + 1}</span>
                <div class="trending-content">
                    <h3>${article.title}</h3>
                    <div class="meta">${article.source} · ${formatTime(article.pubDate)}</div>
                </div>
            </div>
        `).join('')}
    `;

    document.querySelectorAll('.trending-card').forEach(card => {
        card.addEventListener('click', () => {
            const article = articles.find(a => a.id === card.dataset.id);
            if (article) showArticle(article);
        });
    });
}

// Show Article Detail
function showArticle(article) {
    currentArticle = article;

    articleDetail.innerHTML = `
        <h1>${article.title}</h1>
        ${article.image ? `<img src="${article.image}" alt="">` : ''}
        <div class="article-content">
            <p>${article.description}</p>
        </div>
        <a href="${article.link}" target="_blank" rel="noopener" class="read-more">
            Vollständigen Artikel lesen →
        </a>
    `;

    // Update bookmark button
    updateBookmarkButton();

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Close Modal
function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    currentArticle = null;
}

// Bookmark functions
function toggleBookmark() {
    if (!currentArticle) return;

    const index = bookmarks.indexOf(currentArticle.id);
    if (index === -1) {
        bookmarks.push(currentArticle.id);
        showToast('Artikel gespeichert');
    } else {
        bookmarks.splice(index, 1);
        showToast('Lesezeichen entfernt');
    }

    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    updateBookmarkButton();
    renderNews();
}

function updateBookmarkButton() {
    if (!currentArticle) return;
    const isBookmarked = bookmarks.includes(currentArticle.id);
    bookmarkBtn.textContent = isBookmarked ? '★' : '☆';
    bookmarkBtn.classList.toggle('bookmarked', isBookmarked);
}

// Share function
async function shareArticle() {
    if (!currentArticle) return;

    if (navigator.share) {
        try {
            await navigator.share({
                title: currentArticle.title,
                text: currentArticle.description,
                url: currentArticle.link
            });
        } catch (e) {
            // User cancelled
        }
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(currentArticle.link);
        showToast('Link kopiert');
    }
}

// Settings functions
function openSettings() {
    settingsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeSettings() {
    settingsModal.classList.add('hidden');
    document.body.style.overflow = '';
}

function saveSettings() {
    localStorage.setItem('settings', JSON.stringify(settings));
}

function clearCache() {
    localStorage.removeItem('cachedArticles');
    localStorage.removeItem('cacheTime');
    showToast('Cache geleert');
    loadNews(true);
}

function clearBookmarks() {
    if (confirm('Alle Lesezeichen löschen?')) {
        bookmarks = [];
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
        showToast('Lesezeichen gelöscht');
        renderNews();
    }
}

// Toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// Helper Functions
function cleanText(text) {
    return text.replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&amp;/g, '&')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .trim();
}

function stripHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function getCategoryLabel(cat) {
    const labels = {
        politik: 'Politik',
        sport: 'Sport',
        tech: 'Tech',
        unterhaltung: 'Kultur',
        wirtschaft: 'Wirtschaft',
        wissen: 'Wissen',
        rezepte: 'Rezepte',
        italien: 'Italien',
        portugal: 'Portugal'
    };
    return labels[cat] || cat;
}

function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `vor ${minutes} Min.`;
    if (hours < 24) return `vor ${hours} Std.`;
    if (days < 7) return `vor ${days} Tagen`;
    return date.toLocaleDateString('de-DE');
}

// Service Worker Registration
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('ServiceWorker registered:', registration.scope);
        } catch (error) {
            console.log('ServiceWorker registration failed:', error);
        }
    }
}

// Handle visibility change (refresh when app becomes visible)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && settings.autoRefresh) {
        const cacheTime = localStorage.getItem('cacheTime');
        if (cacheTime && Date.now() - cacheTime > 300000) { // 5 minutes
            loadNews();
        }
    }
});

// Auto refresh interval
setInterval(() => {
    if (settings.autoRefresh && document.visibilityState === 'visible') {
        loadNews();
    }
}, 300000); // 5 minutes
