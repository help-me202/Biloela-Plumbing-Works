(function () {
  const body = document.body;
  if (!body || !body.classList.contains("mining-page")) {
    return;
  }

  const image = document.querySelector(
    ".mining-page .scatter.pos-left.large-image",
  );
  const textCard = document.querySelector(".mining-page .service-container");

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
      image.style.width = `${Math.round(rect.width)}px`;
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
