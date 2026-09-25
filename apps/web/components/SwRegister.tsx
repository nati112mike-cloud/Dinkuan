"use client";

import { useEffect } from "react";

/** Registers the service worker that keeps the wallet usable offline (F6-AC4). */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
