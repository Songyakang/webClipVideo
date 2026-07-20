import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Detail from "./pages/detail/Detail";
import Toast from "./components/Toast";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/detail/:id" element={<Detail />} />
      </Routes>
      <Toast />
    </BrowserRouter>
  );
}
