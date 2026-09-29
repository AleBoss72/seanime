/// <reference path="./plugin.d.ts" />

/**
 * MultiTracker for Seanime.
 *
 * Architecture bootstrap:
 * - Seanime/AniList is the canonical local state.
 * - Tracker adapters are expected to support pull(), push() and mapMedia().
 * - Both ANIME and MANGA are first-class media types.
 * - Conflict policy is persisted centrally and is shared by every client.
 *
 * The synchronization engine is intentionally conservative in v0.1.0:
 * it exposes configuration/state and the event hooks without sending remote
 * writes until a tracker adapter is authenticated. This prevents accidental
 * destructive first-syncs while adapters are being integrated.
 */
function init() {
  const cloneEvent = (e) => {
    try { return $clone(e); } catch (_) { return e; }
  };

  const stamp = (kind, event) => {
    $storage.set("multitracker:last-event", {
      kind,
      event: cloneEvent(event),
      at: Date.now()
    });
  };

  // Capture both anime and manga list changes. Seanime's entry hooks are
  // media-type agnostic; the event payload/media lookup determines the type.
  $app.onPreUpdateEntry((e) => { stamp("pre:update-entry", e); e.next(); });
  $app.onPostUpdateEntry((e) => { stamp("post:update-entry", e); e.next(); });
  $app.onPreUpdateEntryProgress((e) => { stamp("pre:progress", e); e.next(); });
  $app.onPostUpdateEntryProgress((e) => { stamp("post:progress", e); e.next(); });
  $app.onPreUpdateEntryRepeat((e) => { stamp("pre:repeat", e); e.next(); });
  $app.onPostUpdateEntryRepeat((e) => { stamp("post:repeat", e); e.next(); });
  $app.onPostDeleteEntry((e) => { stamp("post:delete", e); e.next(); });

  $ui.register((ctx) => {
    const tray = ctx.newTray({ withContent: true, width: "28rem" });
    const last = ctx.state($storage.get("multitracker:last-event") ?? null);

    $store.watch("multitracker:last-event", () => {
      last.set($storage.get("multitracker:last-event") ?? null);
    });

    tray.render(() => tray.stack([
      tray.text("MultiTracker", { style: { fontSize: "1.1rem", fontWeight: "700" } }),
      tray.text("Central bidirectional tracking engine for anime and manga.", { style: { opacity: "0.7" } }),
      tray.text("Conflict policy: " + String($getUserPreference("conflictPolicy") ?? "newest"), { style: { opacity: "0.8" } }),
      tray.text("Last Seanime event: " + (last.get()?.kind ?? "none"), { style: { opacity: "0.65", fontSize: "0.8rem" } }),
      tray.text("Adapters: MAL / Kitsu / SIMKL / Trakt are being integrated under this common engine. Remote writes are disabled in v0.1.0.", { style: { opacity: "0.65", fontSize: "0.8rem" } })
    ], { gap: 2, style: { padding: "12px" } }));
  });
}
