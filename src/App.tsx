import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Index from "./pages/Index";
import Detail from "./pages/detail/Detail";
import Settings from "./pages/Settings";
import Experiments from "./pages/Experiments";
import ScriptWorkspace from "./pages/ScriptWorkspace";
import Toast from "./components/Toast";
import "./App.css";

const TextSceneWorkspace = lazy(() => import("./pages/TextSceneWorkspace"));

/** Inner component that lives inside Router so it can use useNavigate. */
function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const un = await listen("open-settings", () => {
          navigate("/settings");
        });
        unlisten = un;
      } catch { /* not in Tauri env */ }
    })();
    return () => { unlisten?.(); };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/detail/:id" element={<Detail />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/experiments" element={<Experiments />} />
      <Route path="/experiments/script" element={<ScriptWorkspace />} />
      <Route path="/experiments/text-scene" element={<Suspense fallback={<p className="p-6 text-sm text-[#8b949e]">正在加载 3D 体验…</p>}><TextSceneWorkspace /></Suspense>} />
      <Route path="/detail/:id/script/:nodeId" element={<ScriptWorkspace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toast />
    </BrowserRouter>
  );
}
