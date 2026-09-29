/// <reference path="./plugin.d.ts" />

// Seanime Reader Enhancer
// Desktop-focused additions layered on top of Seanime's native manga reader.
function init() {
  $ui.register((ctx) => {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const getWidth = () => {
      const raw = Number($getUserPreference("readerWidth") ?? 50);
      return clamp(Number.isFinite(raw) ? raw : 50, 25, 100);
    };

    const getMaxPx = () => {
      const raw = Number($getUserPreference("readerMaxPx") ?? 0);
      return Number.isFinite(raw) && raw > 0 ? raw : 0;
    };

    const applyPage = async (el) => {
      try {
        const width = getWidth();
        const maxPx = getMaxPx();
        const old = (await el.getAttribute("style")) || "";
        const extra = [
          "width:" + width + "% !important",
          maxPx ? "max-width:" + maxPx + "px !important" : "",
          "margin-left:auto !important",
          "margin-right:auto !important"
        ].filter(Boolean).join(";");
        el.setAttribute("style", old + ";" + extra);
      } catch (e) {
        console.warn("[ReaderEnhancer] page style failed", e);
      }
    };

    const applyImage = async (el) => {
      try {
        const old = (await el.getAttribute("style")) || "";
        el.setAttribute("style", old + ";display:block !important;margin-left:auto !important;margin-right:auto !important;max-width:100% !important;height:auto");
      } catch (e) {
        console.warn("[ReaderEnhancer] image style failed", e);
      }
    };

    const arm = () => {
      try {
        ctx.dom.observe("[data-chapter-page-container]", applyPage, { subtree: true });
        ctx.dom.observe("[data-chapter-page-image]", applyImage, { subtree: true });
      } catch (e) {
        console.warn("[ReaderEnhancer] DOM observer unavailable", e);
      }
    };

    arm();
    ctx.dom.onReady(arm);
    ctx.dom.onMainTabReady(arm);
  });
}
