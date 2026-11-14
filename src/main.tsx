import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerNaijaPriceServiceWorker } from "./utils/offlineCache";

registerNaijaPriceServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
