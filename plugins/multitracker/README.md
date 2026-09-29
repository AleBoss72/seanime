# MultiTracker

Central tracker framework for Seanime.

Target architecture:

- bidirectional sync;
- anime + manga;
- Seanime/AniList as the canonical local identity layer;
- MyAnimeList and Kitsu for anime+manga;
- SIMKL and Trakt where their media models apply;
- conflict policies: newest change, Seanime wins, highest progress, manual;
- loop prevention using last-known local/remote state;
- initial import/export/merge preview.

## Status

v0.1.0 is the safe bootstrap: Seanime entry/progress/repeat/delete hooks are wired and the central configuration/state UI exists. Remote adapter writes are deliberately disabled until each OAuth/API adapter is integrated and tested.
