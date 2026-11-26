(() => {
  let expiresAt = 0;
  let timer;
  let lastSent = 0;
  let queued;
  let inFlight = false;
  let ended = false;

  function resumePath() {
    const current = location.pathname + location.search + location.hash;
    return `/session?expired=1&return_to=${encodeURIComponent(current)}`;
  }

  function expired() {
    if (ended) return;
    ended = true;
    window.top.location.assign(resumePath());
  }

  function schedule() {
    clearTimeout(timer);
    if (expiresAt) timer = setTimeout(checkStatus, Math.max(100, expiresAt - Date.now() + 100));
  }

  async function checkStatus() {
    if (ended) return;
    try {
      const response = await fetch("/api/session/status", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) return expired();
      if (!response.ok) return setTimeout(checkStatus, 10000);
      expiresAt = (await response.json()).expiresAt;
      schedule();
    } catch {
      setTimeout(checkStatus, 10000);
    }
  }

  async function sendActivity() {
    clearTimeout(queued);
    if (ended || inFlight) return;
    inFlight = true;
    lastSent = Date.now();
    try {
      const response = await fetch("/api/session/activity", { method: "POST", cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) return expired();
      if (response.ok) {
        expiresAt = Date.now() + 60 * 60 * 1000;
        schedule();
      }
    } catch {
      // The next interaction or status check retries; failed requests never extend the server session.
    } finally {
      inFlight = false;
    }
  }

  function onActivity(event) {
    if (!event.isTrusted || ended || document.visibilityState === "hidden") return;
    const now = Date.now();
    if (now - lastSent >= 3000 || (expiresAt && expiresAt - now < 5000)) {
      void sendActivity();
    } else {
      clearTimeout(queued);
      queued = setTimeout(sendActivity, Math.max(0, 3000 - (now - lastSent)));
    }
  }

  for (const type of ["pointerdown", "keydown", "input", "wheel", "touchstart"]) {
    document.addEventListener(type, onActivity, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkStatus();
  });
  void checkStatus();
})();
