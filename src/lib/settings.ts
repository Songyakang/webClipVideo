import { createContext, useContext } from "react";

export const SettingsContext = createContext<{
  open: () => void;
}>({ open: () => {} });

export function useSettings() {
  return useContext(SettingsContext);
}
