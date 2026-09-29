# Seanime WeebCentral provider

Community WeebCentral manga provider for Seanime.

## Install

Add this manifest URL to Seanime:

```
https://raw.githubusercontent.com/AleBoss72/seanime-weebcentral/main/weebcentral.json
```

Endpoints used:
- `/search/data`
- `/series/<SERIES_ID>/full-chapter-list`
- `/chapters/<CHAPTER_ID>/images?is_prev=False&reading_style=long_strip`

The repository must be public for Seanime to access the raw files without GitHub authentication.
