class Provider {
  constructor() {
    this.api = "https://asurascans.com";
    this.apiBase = "https://api.asurascans.com";
  }

  getSettings() {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async fetchWithHeaders(url) {
    return fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        Accept: "*/*",
        Referer: this.api,
      },
    });
  }

  async search(opts) {
    const url = `${this.api}/browse?search=${encodeURIComponent(opts.query)}`;
    try {
      const response = await this.fetchWithHeaders(url);
      if (!response.ok) return [];
      const html = await response.text();

      const props = this._extractAstroProps(html, "BrowseFilters");
      if (!props) {
        console.error("Could not find BrowseFilters props");
        return [];
      }

      const initialSeries = props["initialSeries"];
      if (!initialSeries || initialSeries[0] !== 1) return [];

      const mangas = [];
      for (const entry of initialSeries[1]) {
        if (!Array.isArray(entry) || entry[0] !== 0) continue;
        const s = entry[1];

        const slug = this._astroVal(s["slug"]);
        const title = this._astroVal(s["title"]);
        const cover = this._astroVal(s["cover"]);
        const publicUrl = this._astroVal(s["public_url"]);

        if (!slug) continue;

        mangas.push({
          id: publicUrl || `/comics/${slug}`, // Use public_url as ID
          title: title || slug,
          image: cover || "",
          slug: slug, // Keep slug as backup
        });
      }

      return mangas;
    } catch (e) {
      console.error("Search error:", e);
      return [];
    }
  }

  async findChapters(mangaId) {
    try {
      const slug = this._slugFromMangaId(mangaId);
      const chapters = [];
      const seen = new Set();

      let offset = 0;
      const limit = 100;

      while (true) {
        const url = `${this.apiBase}/api/series/${encodeURIComponent(slug)}/chapters?offset=${offset}&limit=${limit}`;
        const response = await this.fetchWithHeaders(url);
        if (!response.ok) {
          console.error("Asura chapters API error:", response.status, response.statusText);
          break;
        }

        const json = await response.json();
        const page = Array.isArray(json?.data) ? json.data : [];
        if (!page.length) break;

        let added = 0;
        for (const ch of page) {
          const chapterSlug = String(ch?.slug ?? "").trim();
          const number = ch?.number != null ? String(ch.number) : chapterSlug;
          const key = ch?.id != null ? String(ch.id) : chapterSlug;

          if (!key || seen.has(key)) continue;
          seen.add(key);
          added++;

          const seriesPath = mangaId.startsWith("http")
            ? new URL(mangaId).pathname
            : mangaId;
          const normalizedSeriesPath = seriesPath.startsWith("/")
            ? seriesPath
            : `/comics/${seriesPath}`;

          chapters.push({
            id: `${this.api}${normalizedSeriesPath}/chapter/${chapterSlug}`,
            title: ch?.title
              ? `Chapter ${number} - ${String(ch.title).trim()}`
              : `Chapter ${number}`,
            chapter: number,
          });
        }

        if (page.length < limit || added === 0) break;
        offset += limit;
      }

      return chapters.sort((a, b) => {
        const an = parseFloat(a.chapter);
        const bn = parseFloat(b.chapter);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return String(a.chapter).localeCompare(String(b.chapter), undefined, { numeric: true });
      });
    } catch (e) {
      console.error("findChapters error:", e);
      return [];
    }
  }

  async findChapterPages(chapterUrl) {
    try {
      const response = await this.fetchWithHeaders(chapterUrl);
      if (!response.ok) return [];
      const html = await response.text();

      const props = this._extractAstroProps(html, "ChapterReader");
      if (!props) {
        console.error("Could not find ChapterReader props");
        return [];
      }

      // pages -> [1, [ [0, {url, width, height}], ... ]]
      const pagesData = props["pages"];
      if (!pagesData || pagesData[0] !== 1) {
        console.error("No pages data found in props");
        return [];
      }

      const pages = [];
      for (let i = 0; i < pagesData[1].length; i++) {
        const entry = pagesData[1][i];
        if (!Array.isArray(entry) || entry[0] !== 0) continue;
        const p = entry[1];

        const pageUrl = this._astroVal(p["url"]);
        if (!pageUrl) continue;

        pages.push({
          url: pageUrl,
          index: i,
          headers: { Referer: this.api },
        });
      }

      return pages;
    } catch (e) {
      console.error("findChapterPages error:", e);
      return [];
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  _slugFromMangaId(mangaId) {
    const raw = String(mangaId || "").trim();
    if (!raw) throw new Error("Missing manga ID");

    let path = raw;
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname;
    }

    path = path.split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "");
    const parts = path.split("/").filter(Boolean);

    let slug = parts.length >= 2 && (parts[0] === "comics" || parts[0] === "series")
      ? parts[1]
      : parts[parts.length - 1];

    return String(slug || "").replace(/-f[0-9a-f]{6,8}$/i, "");
  }

  // Extract and parse the props JSON from a named astro-island component.
  _extractAstroProps(html, componentName) {
    const regex = new RegExp(
      `component-export="default"[^>]*props="([^"]+)"[^>]*ssr[^>]*client="load"[^>]*opts="[^"]*${componentName}`
    );
    const match = regex.exec(html);
    if (!match) return null;

    const propsJson = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    try {
      return JSON.parse(propsJson);
    } catch (e) {
      console.error(`Failed to parse ${componentName} props:`, e);
      return null;
    }
  }

  // Decode Astro's [type, value] encoded primitive. type 0 = scalar, type 1 = array.
  _astroVal(encoded) {
    if (!Array.isArray(encoded)) return encoded;
    const [type, value] = encoded;
    if (type === 0) return value;
    if (type === 1) return value.map(v => this._astroVal(v));
    return value;
  }
}