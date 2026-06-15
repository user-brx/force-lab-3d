import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// Sem StrictMode: evita a dupla montagem do <Canvas>/WebGL em desenvolvimento.
createRoot(document.getElementById("root")!).render(<App />);
