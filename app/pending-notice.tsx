"use client";

import { useEffect, useState } from "react";

type PendingStatus = { count: number; canManage: boolean };

export default function PendingNotice() {
  const [status, setStatus] = useState<PendingStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const response = await fetch("/api/admin/pending-count", { cache: "no-store" });
        if (!mounted) return;
        if (!response.ok) { setStatus(null); return; }
        const data = await response.json() as PendingStatus;
        setStatus(Number.isInteger(data.count) && data.count > 0 ? data : null);
      } catch { if (mounted) setStatus(null); }
    }
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { mounted = false; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("has-pending-notice", !!status);
    return () => document.body.classList.remove("has-pending-notice");
  }, [status]);

  if (!status) return null;
  return <div className="pending-notice" role="status" aria-live="polite">
    <span aria-hidden="true">⚠</span><strong>承認待ち利用者がいます</strong>
    {status.canManage && <a href="/passkey?tab=accounts">アカウント管理を開く →</a>}
  </div>;
}
