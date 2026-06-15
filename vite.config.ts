import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Laboratório de Forças 3D",
        short_name: "Forças 3D",
        description:
          "Simulador 3D interativo das leis de Newton: ação e reação, momento, gravidade e energia.",
        lang: "pt-BR",
        theme_color: "#0E1626",
        background_color: "#0E1626",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // O bundle do Three.js é grande: aumenta o limite de precache.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
