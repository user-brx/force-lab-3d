import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Base por destino: GitHub Pages serve em /force-lab-3d/, Vercel e dev em /.
// start_url/scope/id do manifest DEVEM acompanhar a base - senão o app instalado
// abre num caminho que não existe (era a causa do "instalar" não funcionar no Vercel).
const base = process.env.GITHUB_ACTIONS ? "/force-lab-3d/" : "/";

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Laboratório de Forças 3D",
        short_name: "Forças 3D",
        description:
          "Simulador 3D interativo das leis de Newton: ação e reação, momento, gravidade e energia.",
        lang: "pt-BR",
        id: base,
        scope: base,
        start_url: base,
        theme_color: "#0E1626",
        background_color: "#0E1626",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        // Precache também PNG (ícones) para a instalação/offline funcionar 100%.
        globPatterns: ["**/*.{js,css,html,svg,woff2,png}"],
        // O bundle do Three.js é grande: aumenta o limite de precache.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
