import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";

// Sem StrictMode: evita a dupla montagem do <Canvas>/WebGL em desenvolvimento.
createRoot(document.getElementById("root")!).render(<App />);

// PWA - autoUpdate: quando há versão nova, o Service Worker novo ativa
// (skipWaiting + clientsClaim) e esta função recarrega a página automaticamente.
// O onRegisteredSW agenda uma checagem por hora, para apps deixados abertos
// pegarem a atualização sem depender do reload manual nem do timer de 24h do browser.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => registration.update(), 60 * 60 * 1000);
    }
  },
});
