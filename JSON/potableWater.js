(function () {
  const body = document.body;
  if (!body || !body.classList.contains("potable-water-page")) {
    return;
  }

  const image = document.querySelector(
    ".potable-water-page .scatter.pos-left.large-image",
  );
  const textCard = document.querySelector(
    ".potable-water-page .service-container",
  );

  if (
    !(image instanceof HTMLImageElement) ||
    !(textCard instanceof HTMLElement)
  ) {
    return;
  }

  function syncImageSizeToText() {
    // Keep mobile behavior natural; enforce size matching only in desktop side-by-side mode.
    if (window.innerWidth <= 900) {
      image.style.width = "";
      image.style.height = "";
      return;
    }

    const rect = textCard.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      // Keep text block fixed and match image height to text height.
      // Width stays auto so the border hugs the true image bounds.
      image.style.width = "auto";
      image.style.height = `${Math.round(rect.height)}px`;
    }
  }

  let resizeRaf = null;
  function queueSync() {
    if (resizeRaf !== null) {
      cancelAnimationFrame(resizeRaf);
    }
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = null;
      syncImageSizeToText();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueSync);
  } else {
    queueSync();
  }

  window.addEventListener("resize", queueSync);
  image.addEventListener("load", queueSync);

  if (document.fonts && typeof document.fonts.ready?.then === "function") {
    document.fonts.ready.then(queueSync).catch(function () {
      // Ignore font readiness failures and keep current layout.
    });
  }
})();
