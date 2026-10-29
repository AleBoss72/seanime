/// <reference path="./onlinestream-provider.d.ts" />
/// <reference path="./core.d.ts" />

const DEFAULT_BASE_URL = "https://www.animeunity.co";
const VIXCLOUD_ORIGIN = "https://vixcloud.cc";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SEARCH_PAGE_SIZE = 30;
const EPISODE_PAGE_SIZE = 120;
const MAX_SEARCH_PAGES = 10;

type AnimeRecord = {
    id: string | number;
    slug: string;
    title?: string;
    title_eng?: string;
    title_it?: string;
    anilist_id?: number;
    dub?: number | boolean;
};
type SearchResponse = { records?: AnimeRecord[] };
type EpisodeRecord = { id: string | number; number: string | number };
type AnimeInfoResponse = { episodes_count: number; episodes?: EpisodeRecord[] };
type MasterPlaylist = { url: string; params: { token: string; expires: string; asn?: string } };
type HlsStream = { quality: string; url: string };
type RequestHeaders = { [name: string]: string };

class Provider {
    private readonly apiBaseUrl = "{{baseUrl}}" || DEFAULT_BASE_URL;
    private cookies = "";
    private csrfToken = "";
    private cookiesExpirationDate: Date | null = null;

    getSettings(): Settings {
        return { episodeServers: ["Server1"], supportsDub: true };
    }

    async search(query: SearchOptions): Promise<SearchResult[]> {
        const isManualSearch = !query.media.startDate?.year;
        const titles = (isManualSearch
            ? [query.query]
            : [query.media.romajiTitle, query.media.englishTitle, query.query, ...query.media.synonyms]
        ).filter(Boolean) as string[];
        const smartSearch = $scannerUtils.buildSmartSearchTitles(titles);
        const records = await this.findAnimeRecords(
            this.buildSearchQueries([...smartSearch.titles, ...titles]),
            query.dub,
            isManualSearch ? undefined : query.media.id,
        );
        const filtered = records.filter(record => query.dub ? this.isDub(record) : !this.isDub(record));

        console.log(`AnimeUnity search: ${filtered.length} ${query.dub ? "dub" : "sub"} result(s)`);
        return filtered.map(record => ({
            id: `${record.id}-${record.slug}`,
            title: record.title ?? record.title_eng ?? record.title_it ?? record.slug,
            url: `${this.apiBaseUrl}/anime/${record.id}-${record.slug}`,
            subOrDub: this.isDub(record) ? "dub" : "sub",
        }));
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const [animeId, ...slugParts] = id.split("-");
        const info = await this.getApi<AnimeInfoResponse>(`info_api/${animeId}/0`);
        return this.getAnimeEpisodes(animeId, slugParts.join("-"), info.episodes_count);
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const embedUrl = await this.getApiText(episode.url);
        const embedHtml = await this.getText(embedUrl.trim(), "VixCloud embed");
        const playlistUrl = this.buildPlaylistUrl(this.parseMasterPlaylist(embedHtml), embedHtml);
        const playlistContent = await this.getText(playlistUrl, "VixCloud playlist");
        const videoSources = this.parseHlsPlaylist(playlistContent, playlistUrl).map(stream => ({
            quality: stream.quality, subtitles: [], type: "m3u8", url: stream.url,
        }));

        if (videoSources.length === 0) throw new Error("VixCloud playlist contains no playable streams");
        return {
            server: server === "default" ? "Server1" : server,
            headers: this.getVixCloudHeaders(embedUrl),
            videoSources,
        };
    }

    private buildSearchQueries(titles: string[]): string[] {
        const queries = new Set<string>();
        for (const title of titles) {
            for (const candidate of [$scannerUtils.sanitizeQuery(title), $scannerUtils.buildSearchQuery(title)]) {
                const sanitized = this.sanitizeTitle(candidate);
                if (sanitized) queries.add(sanitized);
            }
        }
        console.log(`AnimeUnity search queries: ${[...queries].join(", ")}`);
        return [...queries];
    }

    private async findAnimeRecords(queries: string[], dubbed: boolean, anilistId?: number): Promise<AnimeRecord[]> {
        const records = new Map<string, AnimeRecord>();
        for (const title of queries) {
            for (let offset = 0; offset < SEARCH_PAGE_SIZE * MAX_SEARCH_PAGES; offset += SEARCH_PAGE_SIZE) {
                const pageRecords = (await this.searchPage(title, offset, dubbed)).records ?? [];
                pageRecords.forEach(record => records.set(`${record.id}-${record.slug}`, record));
                if (anilistId && pageRecords.some(record => record.anilist_id === anilistId)) {
                    return [...records.values()].filter(record => record.anilist_id === anilistId);
                }
                if (pageRecords.length < SEARCH_PAGE_SIZE) break;
            }
        }
        const found = [...records.values()];
        return anilistId ? found.filter(record => record.anilist_id === anilistId) : found;
    }

    private async searchPage(title: string, offset: number, dubbed: boolean): Promise<SearchResponse> {
        await this.ensureSession();
        const response = await fetch(`${this.apiBaseUrl}/archivio/get-animes`, {
            method: "POST",
            headers: {
                ...this.getAnimeUnityHeaders(), "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json", "Origin": this.apiBaseUrl,
                "Referer": `${this.apiBaseUrl}/archivio`, "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({ title, type: false, year: false, order: false, status: false, genres: false, offset, dubbed, season: false }),
        });
        if (!response.ok) throw new Error(`AnimeUnity search failed: ${response.status} ${response.statusText}`);
        return response.json();
    }

    private async getAnimeEpisodes(animeId: string, slug: string, count: number): Promise<EpisodeDetails[]> {
        const episodes: EpisodeDetails[] = [];
        for (let start = 1; start <= count; start += EPISODE_PAGE_SIZE) {
            const end = Math.min(start + EPISODE_PAGE_SIZE - 1, count);
            const page = await this.getApi<AnimeInfoResponse>(`info_api/${animeId}/0?start_range=${start}&end_range=${end}`);
            episodes.push(...(page.episodes ?? []).map((episode, index) => this.toEpisode(episode, start + index)));
        }
        return episodes.length > 0 ? episodes : this.getEpisodesFromPage(animeId, slug);
    }

    private async getEpisodesFromPage(animeId: string, slug: string): Promise<EpisodeDetails[]> {
        const attribute = LoadDoc(await this.getApiText(`anime/${animeId}-${slug}`))("video-player").attr("episodes");
        if (!attribute) return [];
        try {
            const records = JSON.parse(attribute) as EpisodeRecord[];
            return Array.isArray(records) ? records.map((episode, index) => this.toEpisode(episode, index + 1)) : [];
        } catch {
            console.error("AnimeUnity fallback episode list is not valid JSON");
            return [];
        }
    }

    private toEpisode(episode: EpisodeRecord, fallbackNumber: number): EpisodeDetails {
        const number = Number(episode.number);
        return { id: String(episode.id), number: Number.isFinite(number) ? number : fallbackNumber, url: `embed-url/${episode.id}` };
    }

    private parseMasterPlaylist(html: string): MasterPlaylist {
        const playlistObject = this.extractAssignedObject(html, "window.masterPlaylist");
        const paramsObject = playlistObject && this.extractPropertyObject(playlistObject, "params");
        const url = playlistObject && this.extractStringProperty(playlistObject, "url");
        const token = paramsObject && this.extractStringProperty(paramsObject, "token");
        const expires = paramsObject && this.extractStringProperty(paramsObject, "expires");
        const asn = paramsObject && this.extractStringProperty(paramsObject, "asn");
        if (!url || !token || !expires) throw new Error("VixCloud embed is missing master playlist data");
        return { url, params: { token, expires, ...(asn ? { asn } : {}) } };
    }

    private buildPlaylistUrl(master: MasterPlaylist, html: string): string {
        const playlist = new URL(master.url);
        playlist.searchParams.set("token", master.params.token);
        playlist.searchParams.set("expires", master.params.expires);
        if (master.params.asn) playlist.searchParams.set("asn", master.params.asn);
        if (/window\.canPlayFHD\s*=\s*true\b/.test(html)) playlist.searchParams.set("h", "1");
        return playlist.toString();
    }

    private parseHlsPlaylist(content: string, playlistUrl: string): HlsStream[] {
        const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const streams: HlsStream[] = [];
        for (let index = 0; index < lines.length; index++) {
            if (!lines[index].startsWith("#EXT-X-STREAM-INF")) continue;
            const streamUrl = lines[index + 1];
            if (!streamUrl || streamUrl.startsWith("#")) continue;
            const resolution = lines[index].match(/RESOLUTION=\d+x(\d+)/)?.[1];
            streams.push({ quality: resolution ? `${resolution}p` : "auto", url: new URL(streamUrl, playlistUrl).toString() });
        }
        return streams.length > 0 || !content.includes("#EXTM3U") ? streams : [{ quality: "auto", url: playlistUrl }];
    }

    private extractAssignedObject(source: string, assignment: string): string | null {
        const assignmentIndex = source.indexOf(assignment);
        const openingBrace = assignmentIndex < 0 ? -1 : source.indexOf("{", assignmentIndex + assignment.length);
        return openingBrace < 0 ? null : this.extractBalancedObject(source, openingBrace);
    }

    private extractPropertyObject(source: string, property: string): string | null {
        const match = new RegExp(`(?:['"]?${property}['"]?)\\s*:`).exec(source);
        const openingBrace = match ? source.indexOf("{", match.index + match[0].length) : -1;
        return openingBrace < 0 ? null : this.extractBalancedObject(source, openingBrace);
    }

    private extractBalancedObject(source: string, start: number): string | null {
        let depth = 0, quote = "", escaped = false;
        for (let index = start; index < source.length; index++) {
            const character = source[index];
            if (quote) {
                if (escaped) escaped = false;
                else if (character === "\\") escaped = true;
                else if (character === quote) quote = "";
            } else if (character === "'" || character === '"') quote = character;
            else if (character === "{") depth++;
            else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
        }
        return null;
    }

    private extractStringProperty(source: string, property: string): string | null {
        const match = new RegExp(`(?:['"]?${property}['"]?)\\s*:\\s*(['"])([\\s\\S]*?)\\1`).exec(source);
        return match ? match[2].replace(/\\u0026/g, "&").replace(/\\(['"])/g, "$1") : null;
    }

    private async getApi<T>(endpoint: string): Promise<T> {
        return this.getApiResponse<T>(endpoint, "json");
    }

    private async getApiText(endpoint: string): Promise<string> {
        return this.getApiResponse<string>(endpoint, "text");
    }

    private async getApiResponse<T>(endpoint: string, responseType: "json" | "text"): Promise<T> {
        await this.ensureSession();
        const response = await fetch(this.getApiUrl(endpoint), { headers: this.getAnimeUnityHeaders(), credentials: "include" });
        if (!response.ok) throw new Error(`AnimeUnity request failed (${endpoint}): ${response.status} ${response.statusText}`);
        return responseType === "json" ? response.json() : response.text() as Promise<T>;
    }

    private async ensureSession(): Promise<void> {
        if (this.cookiesExpirationDate && this.cookiesExpirationDate > new Date()) return;
        const response = await fetch(this.apiBaseUrl, { headers: { "User-Agent": USER_AGENT } });
        if (!response.ok) throw new Error(`AnimeUnity session request failed: ${response.status} ${response.statusText}`);

        const responseCookies = response.cookies ?? {};
        this.cookies = Object.keys(responseCookies).map(name => `${name}=${responseCookies[name]}`).join("; ");
        const csrfToken = LoadDoc(await response.text())('meta[name="csrf-token"]').attr("content");
        if (!csrfToken) throw new Error("AnimeUnity CSRF token not found");
        this.csrfToken = csrfToken;
        this.cookiesExpirationDate = new Date(Date.now() + 60 * 60 * 1000);
    }

    private getApiUrl(endpoint: string): string {
        return `${this.apiBaseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
    }

    private getAnimeUnityHeaders(): RequestHeaders {
        return { "Cookie": this.cookies, "User-Agent": USER_AGENT, ...(this.csrfToken ? { "X-CSRF-TOKEN": this.csrfToken } : {}) };
    }

    private getVixCloudHeaders(embedUrl: string): RequestHeaders {
        const origin = new URL(embedUrl).origin || VIXCLOUD_ORIGIN;
        return { "Origin": origin, "Referer": `${origin}/`, "User-Agent": USER_AGENT };
    }

    private async getText(url: string, label: string): Promise<string> {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${label} request failed: ${response.status} ${response.statusText}`);
        return response.text();
    }

    private isDub(record: AnimeRecord): boolean {
        return record.dub === 1 || record.dub === true || record.title?.includes("(ITA)") === true;
    }

    private sanitizeTitle(title: string): string {
        return title.toLowerCase().split(/[\-_:]+/)[0].replace(/\s+/g, " ").trim();
    }
}
