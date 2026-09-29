# MangaRead.org provider for Seanime

Seanime manga provider for https://www.mangaread.org/.

The site currently uses the Madara WordPress manga theme.

## Install

Add this manifest URL in Seanime:

https://raw.githubusercontent.com/AleBoss72/seanime-weebcentral/main/mangaread/mangaread.json

## Implementation

- Search: Madara `madara_load_more` AJAX action
- Chapters: `<manga-url>/ajax/chapters/`
- Pages: chapter HTML, `.reading-content` images
- Chapter date format: `dd.MM.yyy`

A normal GET search is kept as a fallback if the AJAX archive endpoint changes.
