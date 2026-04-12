import { useAppStore } from "../store/appStore";
import { THEMES, type Theme } from "../theme";

export function useTheme(): Theme {
  const themeName = useAppStore(s => s.themeName);
  return THEMES[themeName] || THEMES.dark;
}
