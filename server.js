const express = require('express');
const Parser = require('rss-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const parser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'NewsApp/1.0'
    }
});

// CORS und statische Dateien
app.use(cors());
app.use(express.static(path.join(__dirname)));

// RSS Feeds Konfiguration
const RSS_FEEDS = {
    politik: [
        'https://www.tagesschau.de/xml/rss2/',
        'https://www.spiegel.de/politik/index.rss'
    ],
    sport: [
        'https://www.kicker.de/rss/news',
        'https://www.spiegel.de/sport/index.rss'
    ],
    tech: [
        'https://www.heise.de/rss/heise-top-atom.xml',
        'https://www.golem.de/rss.php'
    ],
    unterhaltung: [
        'https://www.spiegel.de/kultur/index.rss'
    ],
    wirtschaft: [
        'https://www.tagesschau.de/wirtschaft/index~rss2.xml'
    ],
    wissen: [
        'https://www.spiegel.de/wissenschaft/index.rss'
    ],
    rezepte: [
        'https://www.eat-this.org/feed/',
        'https://www.biancazapatka.com/de/feed/'
    ],
    italien: [
        'https://www.suedtirolnews.it/feed',
        'https://www.stol.it/rss'
    ],
    portugal: [
        'https://www.algarve-entdecker.com/feed/',
        'https://portugaltipps.de/feed/'
    ]
};

// Cache für schnellere Antworten (5 Minuten)
let cache = {
    data: null,
    timestamp: 0
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten

// Einzelnen Feed abrufen
async function fetchFeed(url, category) {
    try {
        const feed = await parser.parseURL(url);
        return feed.items.map(item => ({
            id: Buffer.from(item.link || '').toString('base64').slice(0, 20),
            title: item.title || '',
            link: item.link || '',
            description: item.contentSnippet || item.content || '',
            pubDate: new Date(item.pubDate || item.isoDate || Date.now()),
            image: item.enclosure?.url ||
                   item['media:content']?.$.url ||
                   item['media:thumbnail']?.$.url ||
                   extractImage(item.content || item['content:encoded'] || ''),
            source: extractSource(item.link),
            category
        }));
    } catch (error) {
        console.error(`Fehler beim Laden von ${url}:`, error.message);
        return [];
    }
}

// Bild aus HTML extrahieren
function extractImage(html) {
    const match = html.match(/<img[^>]+src="([^">]+)"/);
    return match ? match[1] : '';
}

// Quelle aus URL extrahieren
function extractSource(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return 'Unbekannt';
    }
}

// Alle Feeds abrufen
async function fetchAllFeeds() {
    const allPromises = [];

    for (const [category, urls] of Object.entries(RSS_FEEDS)) {
        for (const url of urls) {
            allPromises.push(fetchFeed(url, category));
        }
    }

    const results = await Promise.allSettled(allPromises);
    const articles = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // Duplikate entfernen
    const seen = new Set();
    return articles.filter(article => {
        const key = article.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// API Endpoint für alle News
app.get('/api/news', async (req, res) => {
    const now = Date.now();
    const forceRefresh = req.query.refresh === 'true';

    // Cache nutzen wenn noch gültig
    if (!forceRefresh && cache.data && (now - cache.timestamp) < CACHE_DURATION) {
        return res.json({
            articles: cache.data,
            cached: true,
            timestamp: cache.timestamp
        });
    }

    try {
        const articles = await fetchAllFeeds();
        cache = { data: articles, timestamp: now };

        res.json({
            articles,
            cached: false,
            timestamp: now
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Endpoint für einzelne Kategorie
app.get('/api/news/:category', async (req, res) => {
    const { category } = req.params;
    const urls = RSS_FEEDS[category];

    if (!urls) {
        return res.status(404).json({ error: 'Kategorie nicht gefunden' });
    }

    try {
        const promises = urls.map(url => fetchFeed(url, category));
        const results = await Promise.allSettled(promises);
        const articles = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value)
            .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        res.json({ articles });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Server starten
const PORT = 8080;
app.listen(PORT, () => {
    console.log(`NewsApp Server läuft auf http://localhost:${PORT}`);
    console.log(`API verfügbar unter http://localhost:${PORT}/api/news`);
});
