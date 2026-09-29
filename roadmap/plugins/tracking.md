# Tracking plugins

- ✅ **AniList ↔ MAL Sync** — our bidirectional anime+manga synchronization plugin between AniList and MyAnimeList.
- ◻ **Kitsu Sync** — synchronize supported anime/manga progress and list state with Kitsu.
- ◻ **SIMKL Sync** — synchronize compatible anime/video tracking data with SIMKL.
- ◻ **Trakt Sync** — synchronize compatible viewing progress with Trakt.
- ◻ **Shikimori Sync** — synchronize anime/manga tracking with Shikimori.
- ◻ **MangaUpdates Sync** — synchronize manga status/progress with MangaUpdates.

## Development direction

The preferred long-term architecture is to keep AniList ↔ MAL stable first, then add other trackers as adapters to the same central synchronization engine rather than creating unrelated plugins.
