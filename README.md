# AleBoss72 Seanime Extensions

Personal Seanime extension repository for a centralized anime + manga setup.

## Structure

```text
providers/
├── anime/
│   ├── animeworld/
│   └── animeunity/
└── manga/
    ├── weebcentral/
    ├── asurascans/
    ├── mangaread/
    └── mangaworld/

plugins/
├── multitracker/
└── reader-enhancer/
```

## Marketplace

Use this marketplace URL in Seanime:

`https://raw.githubusercontent.com/AleBoss72/seanime/refs/heads/main/marketplace.json`

## Providers

### Anime
- AnimeWorld (IT)
- AnimeUnity (IT)

### Manga
- WeebCentral (EN)
- AsuraScans (EN)
- MangaRead.org (EN)
- MangaWorld (IT)

## Plugins

### Reader Enhancer
Adds desktop-focused reader customizations. v0.1.0 centers pages and constrains their width to a configurable percentage (50% by default).

### MultiTracker
Target: one server-side tracking layer for anime + manga with bidirectional synchronization, conflict handling and loop prevention.

v0.1.0 is intentionally a safe bootstrap: Seanime entry/progress/repeat/delete hooks and central configuration are wired, but remote writes are disabled until the individual OAuth/API adapters are integrated and tested.

## Design goal

Seanime stays the single central backend:

```text
Devices
   ↓
Seanime
├── Anime providers
├── Manga providers
├── Reader Enhancer
└── MultiTracker
    ├── AniList
    ├── MyAnimeList
    ├── Kitsu
    ├── SIMKL
    └── Trakt
```

## Attribution

Some providers are adapted from MIT-licensed community implementations:
- kRYstall9 / Seanime streaming providers
- Pal / Seanime Providers
- nnotwen / Seanime extensions (used as architectural reference for tracker plugins)

See `THIRD_PARTY_NOTICES.md`.
