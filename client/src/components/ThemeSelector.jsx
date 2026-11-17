import { Palette, Shapes } from 'lucide-react';
import { useTheme } from '../theme';

export default function ThemeSelector() {
  const { theme, setTheme, pattern, setPattern, patterns } = useTheme();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-sm text-slate">
        <Palette size={16} aria-hidden="true" />
        <span className="sr-only">Color theme</span>
        <select aria-label="Color theme" className="bg-transparent text-navy outline-none" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-sm text-slate">
        <Shapes size={16} aria-hidden="true" />
        <span className="sr-only">Background pattern</span>
        <select aria-label="Background pattern" className="max-w-36 bg-transparent text-navy outline-none" value={pattern} onChange={(e) => setPattern(e.target.value)}>
          {patterns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    </div>
  );
}
