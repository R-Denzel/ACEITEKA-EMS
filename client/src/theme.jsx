import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const THEMES = ['light', 'dark'];
const PATTERNS = [
  { id: 'none', name: 'Plain background', svg: null },
  { id: 'dots', name: 'Soft dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="COLOR" fill-opacity=".12"/></pattern><rect width="100%" height="100%" fill="url(#p)"/></svg>' },
  { id: 'topography', name: 'Topography', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><g fill="none" stroke="COLOR" stroke-opacity=".09" stroke-width="1"><path d="M-20 24c20-18 45-18 65 0s45 18 65 0 45-18 70 0M-20 36c20-18 45-18 65 0s45 18 65 0 45-18 70 0M-20 48c20-18 45-18 65 0s45 18 65 0 45-18 70 0M-20 96c20-18 45-18 65 0s45 18 65 0 45-18 70 0M-20 108c20-18 45-18 65 0s45 18 65 0 45-18 70 0"/></g><circle cx="90" cy="72" r="18" fill="none" stroke="COLOR" stroke-opacity=".08"/><circle cx="90" cy="72" r="30" fill="none" stroke="COLOR" stroke-opacity=".06"/></svg>' },
  { id: 'waves', name: 'Layered waves', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96"><g fill="none" stroke="COLOR" stroke-opacity=".09"><path d="M-20 16c20-14 40-14 60 0s40 14 60 0 40-14 60 0M-20 32c20-14 40-14 60 0s40 14 60 0 40-14 60 0M-20 48c20-14 40-14 60 0s40 14 60 0 40-14 60 0M-20 64c20-14 40-14 60 0s40 14 60 0 40-14 60 0M-20 80c20-14 40-14 60 0s40 14 60 0 40-14 60 0"/></g></svg>' },
  { id: 'hexagons', name: 'Geometric cells', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="48"><pattern id="p" width="56" height="48" patternUnits="userSpaceOnUse"><path d="M14 1 27 8v15l-13 7L1 23V8zM42 25l13 7v15l-13 7-13-7V32zM42-23l13 7v15l-13 7-13-7v-15z" fill="none" stroke="COLOR" stroke-opacity=".09"/></pattern><rect width="100%" height="100%" fill="url(#p)"/></svg>' },
];

function storedTheme() {
  const saved = window.localStorage.getItem('aceiteka-theme');
  return THEMES.includes(saved) ? saved : 'light';
}

function storedPattern() {
  const saved = window.localStorage.getItem('aceiteka-background-pattern');
  return PATTERNS.some((pattern) => pattern.id === saved) ? saved : 'none';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(storedTheme);
  const [pattern, setPattern] = useState(storedPattern);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('aceiteka-theme', theme);
    const color = theme === 'dark' ? '#d4e5fa' : '#17365d';
    const selected = PATTERNS.find((item) => item.id === pattern);
    document.documentElement.style.setProperty(
      '--page-pattern',
      selected?.svg ? `url("data:image/svg+xml,${encodeURIComponent(selected.svg.replaceAll('COLOR', color))}")` : 'none',
    );
    document.documentElement.dataset.pattern = pattern;
    window.localStorage.setItem('aceiteka-background-pattern', pattern);
  }, [theme, pattern]);

  const value = useMemo(() => ({ theme, setTheme, themes: THEMES, pattern, setPattern, patterns: PATTERNS }), [theme, pattern]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider.');
  return context;
}
