# Custom sources

- ◻ **TVMaze** — alternative TV metadata/catalog source.
- ◻ **MangaUpdates** — manga metadata/catalog source.
- ◻ **Local Catalog** — user-managed local catalog source.
- ◻ **TMDb** — movies and TV metadata/catalog source.
- ◻ **YouTube** — source for YouTube-based media/content.

## Strategic candidate: Movies & TV

TMDb is especially interesting because it could be the metadata layer for a future **Movies & TV** module in Seanime.

Possible architecture:

```text
Movies & TV plugin
├── TMDb metadata
├── Movies
├── TV Series
│   ├── Seasons
│   └── Episodes
├── Local file mapping
├── Streaming providers
└── Trakt tracking
```

This would be a significantly larger project than a normal provider and may eventually require changes to Seanime core.
