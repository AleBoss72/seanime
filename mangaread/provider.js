/**
 * MangaRead.org manga provider for Seanime.
 * Site engine: Madara / WordPress.
 * No external dependencies.
 */
class Provider {
    constructor() {
        this.baseUrl = "https://www.mangaread.org";
    }

    getSettings() {
        return {
            supportsMultiScanlator: false,
            supportsMultiLanguage: false,
        };
    }

    async search(opts) {
        const query = String((opts && opts.query) || "").trim();
        if (!query) return [];

        const body = new URLSearchParams();
        body.set("action", "madara_load_more");
        body.set("page", "0");
        body.set("template", "madara-core/content/content-archive");
        body.set("vars[paged]", "1");
        body.set("vars[template]", "archive");
        body.set("vars[posts_per_page]", "25");
        body.set("vars[post_type]", "wp-manga");
        body.set("vars[post_status]", "publish");
        body.set("vars[manga_archives_item_layout]", "big_thumbnail");
        body.set("vars[meta_query][0][key]", "_wp_manga_chapter_type");
        body.set("vars[meta_query][0][value]", "manga");
        body.set("vars[s]", query);

        let html = await this._postForm(
            this.baseUrl + "/wp-admin/admin-ajax.php",
            body.toString()
        );

        let results = this._parseMangaCards(html);

        if (results.length === 0) {
            html = await this._getText(
                this.baseUrl + "/?s=" + encodeURIComponent(query) + "&post_type=wp-manga"
            );
            results = this._parseMangaCards(html);
        }

        return results;
    }

    async findChapters(mangaId) {
        if (!mangaId) return [];

        const mangaUrl = this._absolute(mangaId).replace(/\/+$/, "");
        const ajaxUrl = mangaUrl + "/ajax/chapters/";

        // First use the normal Madara endpoint.
        const ajaxHtml = await this._postForm(ajaxUrl, "");
        let chapters = this._parseChapterList(ajaxHtml);

        // MangaRead currently returns only 50 entries from this endpoint for
        // some long-running series. The series feed/page exposes the complete
        // chapter list, so use it whenever it contains more entries.
        try {
            const feedHtml = await this._getText(mangaUrl + "/feed/");
            const feedChapters = this._parseFeedChapters(feedHtml, mangaUrl);
            if (feedChapters.length > chapters.length) {
                chapters = feedChapters;
            }
        } catch (e) {
            console.warn("MangaRead: full chapter feed fallback failed", e);
        }

        chapters.sort((a, b) => {
            const an = parseFloat(a.chapter);
            const bn = parseFloat(b.chapter);
            if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
            return a.title.localeCompare(b.title, undefined, { numeric: true });
        });

        chapters.forEach((c, i) => c.index = i);
        return chapters;
    }

    _parseChapterList(html) {
        const chapters = [];
        const seen = new Set();
        const liRe = /<li\b[^>]*class=["'][^"']*\bwp-manga-chapter\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
        let match;

        while ((match = liRe.exec(html)) !== null) {
            const block = match[1];
            const href = this._firstHref(block);
            if (!href) continue;

            const chapterUrl = this._absolute(this._decode(href));
            if (seen.has(chapterUrl)) continue;
            seen.add(chapterUrl);

            const title = this._decode(this._stripTags(
                this._firstMatch(block, /<a\b[^>]*>([\s\S]*?)<\/a>/i) || ""
            )).replace(/\s+/g, " ").trim();

            const chapter = this._extractChapterNumber(title);
            const date = this._decode(this._stripTags(
                this._firstMatch(
                    block,
                    /<span\b[^>]*class=["'][^"']*\bchapter-release-date\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
                ) || ""
            )).replace(/\s+/g, " ").trim();

            chapters.push({
                id: chapterUrl,
                url: chapterUrl,
                title: title || ("Chapter " + chapter),
                chapter: chapter,
                index: 0,
                language: "en",
                updatedAt: this._dateToIso(date),
            });
        }

        return chapters;
    }

    _parseFeedChapters(html, mangaUrl) {
        const chapters = [];
        const seen = new Set();
        const escapedBase = mangaUrl.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
        const re = new RegExp(
            '<a\\b[^>]*href=["\\\'](' + escapedBase + '/chapter-[^"\\\'?#/]+/?)["\\\'][^>]*>([\\s\\S]*?)<\\/a>',
            'gi'
        );
        let match;

        while ((match = re.exec(html)) !== null) {
            const chapterUrl = this._absolute(this._decode(match[1]));
            if (seen.has(chapterUrl)) continue;

            const title = this._decode(this._stripTags(match[2]))
                .replace(/\s+/g, " ")
                .trim();

            const chapter = this._extractChapterNumber(title || chapterUrl);
            if (!chapter || chapter === "0") continue;

            seen.add(chapterUrl);
            chapters.push({
                id: chapterUrl,
                url: chapterUrl,
                title: title || ("Chapter " + chapter),
                chapter: chapter,
                index: 0,
                language: "en",
            });
        }

        return chapters;
    }

    async findChapterPages(chapterId) {
        if (!chapterId) return [];

        const chapterUrl = this._absolute(chapterId);
        let html = await this._getText(chapterUrl);

        if (/id=["']single-pager["']/i.test(html)) {
            const separator = chapterUrl.includes("?") ? "&" : "?";
            html = await this._getText(chapterUrl + separator + "style=list");
        }

        let reading = html;
        const start = html.search(/<div\b[^>]*class=["'][^"']*\breading-content\b[^"']*["'][^>]*>/i);
        if (start >= 0) {
            reading = html.slice(start, Math.min(html.length, start + 2000000));
        }

        const pages = [];
        const seen = new Set();
        const imgRe = /<img\b[^>]*>/gi;
        let match;

        while ((match = imgRe.exec(reading)) !== null) {
            const tag = match[0];

            let raw =
                this._attr(tag, "data-src") ||
                this._attr(tag, "data-lazy-src") ||
                this._attr(tag, "data-lzl-src") ||
                this._attr(tag, "data-cfsrc") ||
                this._attr(tag, "data-manga-src") ||
                this._bestSrcset(this._attr(tag, "srcset")) ||
                this._attr(tag, "src");

            if (!raw) continue;

            raw = this._decode(raw.trim());
            const imageUrl = this._absolute(raw);

            if (!/^https?:\/\//i.test(imageUrl)) continue;
            if (seen.has(imageUrl)) continue;
            if (/(avatar|logo|icon|emoji|spinner|loading|ads?[-_.])/i.test(imageUrl)) continue;

            seen.add(imageUrl);
            pages.push({
                url: imageUrl,
                index: pages.length,
                headers: {
                    Referer: chapterUrl,
                },
            });
        }

        return pages;
    }

    async _getText(url) {
        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/124.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                Referer: this.baseUrl + "/",
            },
        });

        if (!response.ok) {
            throw new Error("MangaRead request failed: HTTP " + response.status + " (" + url + ")");
        }

        return await response.text();
    }

    async _postForm(url, body) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/124.0.0.0 Safari/537.36",
                Accept: "text/html,*/*;q=0.8",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                Referer: this.baseUrl + "/",
            },
            body: body,
        });

        if (!response.ok) {
            throw new Error("MangaRead request failed: HTTP " + response.status + " (" + url + ")");
        }

        return await response.text();
    }

    _parseMangaCards(html) {
        const results = [];
        const seen = new Set();

        const anchorRe = /<a\b([^>]*)href=["']([^"']*\/manga\/[^"'?#]+\/?)["']([^>]*)>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = anchorRe.exec(html)) !== null) {
            const href = this._absolute(this._decode(match[2]));
            const path = this._path(href);

            if (!/^\/manga\/[^/]+\/?$/i.test(path)) continue;
            if (seen.has(href)) continue;

            let title = this._decode(this._stripTags(match[4]))
                .replace(/\s+/g, " ")
                .trim();

            const from = Math.max(0, match.index - 1800);
            const to = Math.min(html.length, anchorRe.lastIndex + 2200);
            const chunk = html.slice(from, to);

            if (!title || title.length < 2) {
                const titleMatch = chunk.match(
                    /<[^>]*class=["'][^"']*\bpost-title\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i
                );
                if (titleMatch) {
                    title = this._decode(this._stripTags(titleMatch[1]))
                        .replace(/\s+/g, " ")
                        .trim();
                }
            }

            if (!title) continue;

            const image = this._findImage(chunk);

            seen.add(href);
            results.push({
                id: href,
                title: title,
                synonyms: [],
                image: image || undefined,
            });
        }

        return results;
    }

    _findImage(html) {
        const imgRe = /<img\b[^>]*>/gi;
        let m;

        while ((m = imgRe.exec(html)) !== null) {
            const tag = m[0];
            let raw =
                this._attr(tag, "data-src") ||
                this._attr(tag, "data-lazy-src") ||
                this._attr(tag, "data-lzl-src") ||
                this._bestSrcset(this._attr(tag, "srcset")) ||
                this._attr(tag, "src");

            if (!raw) continue;
            raw = this._absolute(this._decode(raw.trim()));

            if (/^https?:\/\//i.test(raw) && !/(avatar|logo|icon|spinner)/i.test(raw)) {
                return raw;
            }
        }

        return "";
    }

    _bestSrcset(srcset) {
        if (!srcset) return "";
        const entries = srcset
            .split(",")
            .map(x => x.trim().split(/\s+/))
            .filter(x => x[0]);

        if (entries.length === 0) return "";

        entries.sort((a, b) => {
            const av = parseFloat((a[1] || "0").replace(/[^\d.]/g, "")) || 0;
            const bv = parseFloat((b[1] || "0").replace(/[^\d.]/g, "")) || 0;
            return av - bv;
        });

        return entries[entries.length - 1][0];
    }

    _firstHref(html) {
        const m = html.match(/<a\b[^>]*href=["']([^"']+)["']/i);
        return m ? m[1] : "";
    }

    _firstMatch(html, regex) {
        const m = html.match(regex);
        return m && m[1] ? m[1] : "";
    }

    _extractChapterNumber(title) {
        const patterns = [
            /(?:chapter|ch\.?)\s*#?\s*(\d+(?:\.\d+)?)/i,
            /#\s*(\d+(?:\.\d+)?)/,
            /(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/,
        ];

        for (const re of patterns) {
            const m = title.match(re);
            if (m) return m[1];
        }

        return "0";
    }

    _dateToIso(value) {
        if (!value) return undefined;

        const m = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{3,4})$/);
        if (m) {
            let year = m[3];
            if (year.length === 3) year = "0" + year;
            return year + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") + "T00:00:00Z";
        }

        return undefined;
    }

    _attr(tag, name) {
        const escaped = name.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
        const re = new RegExp("\\b" + escaped + "\\s*=\\s*[\"']([^\"']*)[\"']", "i");
        const m = tag.match(re);
        return m ? m[1] : "";
    }

    _stripTags(html) {
        return String(html || "")
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ");
    }

    _decode(value) {
        return String(value || "")
            .replace(/&amp;/gi, "&")
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&#x2F;/gi, "/")
            .replace(/&#47;/gi, "/")
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
            .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
    }

    _absolute(url) {
        if (!url) return "";
        if (/^https?:\/\//i.test(url)) return url;
        if (url.startsWith("//")) return "https:" + url;
        return this.baseUrl + (url.startsWith("/") ? "" : "/") + url;
    }

    _path(url) {
        return String(url)
            .replace(/^https?:\/\/[^/]+/i, "")
            .split("?")[0]
            .split("#")[0];
    }
}
