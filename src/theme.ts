/**
 * theme.ts — FamilyHub color themes
 * Two themes: Dark (default) and Ocean Calm (light)
 */

export type ThemeName = "dark" | "ocean";

export interface Theme {
  name:       ThemeName;
  bg:         string;   // main background
  card:       string;   // widget/card background
  cardBorder: string;   // card border
  text:       string;   // primary text
  textSub:    string;   // secondary/muted text
  textFaint:  string;   // very faint text (placeholders)
  accent:     string;   // interactive elements, buttons
  accentBg:   string;   // accent background (10-15% opacity)
  badge:      string;   // success badges
  toolbar:    string;   // toolbar element bg
  input:      string;   // input field bg
  inputBorder: string;  // input border
  modal:      string;   // modal sheet bg
  modalBd:    string;   // modal backdrop
  divider:    string;   // thin separators between items
  shadow:     { color: string; opacity: number }; // card elevation
  textOnAccent: string; // text on accent-colored buttons
  error:      string;
  success:    string;
  warning:    string;
  isDark:     boolean;
}

export const THEMES: Record<ThemeName, Theme> = {
  dark: {
    name:       "dark",
    bg:         "#080c18",
    card:       "rgba(255,255,255,.04)",
    cardBorder: "rgba(255,255,255,.08)",
    text:       "#e8eeff",
    textSub:    "rgba(232,238,255,.4)",
    textFaint:  "rgba(232,238,255,.25)",
    accent:     "#60a5fa",
    accentBg:   "rgba(96,165,250,.15)",
    badge:      "#34d399",
    toolbar:    "rgba(255,255,255,.06)",
    input:      "rgba(255,255,255,.06)",
    inputBorder: "rgba(255,255,255,.08)",
    modal:      "#0f1628",
    modalBd:    "rgba(0,0,0,.5)",
    divider:    "rgba(255,255,255,.06)",
    shadow:     { color: "#000", opacity: 0 },
    textOnAccent: "#FFFFFF",
    error:      "#f87171",
    success:    "#34d399",
    warning:    "#fbbf24",
    isDark:     true,
  },
  ocean: {
    name:       "ocean",
    bg:         "#E4EEF3",
    card:       "#FFFFFF",
    cardBorder: "#A8C8D8",
    text:       "#0A2030",
    textSub:    "#2E5568",
    textFaint:  "#507080",
    accent:     "#1570A0",
    accentBg:   "rgba(21,112,160,.15)",
    badge:      "#1E8A5C",
    toolbar:    "rgba(21,112,160,.12)",
    input:      "#D5E3EB",
    inputBorder: "#A0C0D0",
    modal:      "#FFFFFF",
    modalBd:    "rgba(10,32,48,.45)",
    divider:    "rgba(10,32,48,.08)",
    shadow:     { color: "#0A2030", opacity: 0.08 },
    textOnAccent: "#FFFFFF",
    error:      "#C03030",
    success:    "#1E8A5C",
    warning:    "#B07818",
    isDark:     false,
  },
};
