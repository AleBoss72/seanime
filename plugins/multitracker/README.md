# AniList ↔ MAL Sync

Seanime plugin focused only on synchronization between **AniList** and **MyAnimeList**.

## Current scope

- Anime: AniList ↔ MyAnimeList
- Manga: AniList ↔ MyAnimeList
- MAL OAuth login and token refresh
- Live Seanime/AniList → MAL updates for progress and list changes
- Manual AniList → MAL synchronization
- Manual MAL → AniList synchronization
- Add-missing, update-existing and full mirror modes
- Status, progress, score, dates and repeat/reread fields where supported

Kitsu, SIMKL, Trakt and other trackers are intentionally out of scope for now.

## Direct install

`https://raw.githubusercontent.com/AleBoss72/seanime/main/plugins/multitracker/multitracker.json`

## Authentication note

The current implementation is based on the MIT-licensed `MyAnimeListSync` plugin by **nnotwen** and currently reuses its MAL OAuth application/client and hosted callback. This keeps login functional without requiring a separate MAL developer application.

## Sync behavior

Changes made through Seanime/AniList are pushed live to MAL when automatic progress updating is enabled in Seanime.

For the reverse direction, open the plugin and use **Perform Manual Sync → Sync to AniList**. This imports/updates AniList from the current MAL list.

This means both directions are supported, but MAL → AniList is currently user-triggered rather than continuously polled in the background.

## Attribution

Based on nnotwen/n-seanime-extensions MyAnimeListSync (MIT).
