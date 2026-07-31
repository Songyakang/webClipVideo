import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Index from "./pages/Index";
import Detail from "./pages/detail/Detail";
import Settings from "./pages/Settings";
import Toast from "./components/Toast";
import "./App.css";

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
