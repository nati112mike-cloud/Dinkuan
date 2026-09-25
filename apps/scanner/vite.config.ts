import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// F8-AC7: installable PWA; the whole app shell is precached so it opens with zero internet.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ድንኳን Scanner",
        short_name: "Scanner",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#1c1410",
        theme_color: "#a94a12",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,wasm}"], navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
});
