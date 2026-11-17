export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: 'rgb(var(--color-navy) / <alpha-value>)',
        deep: 'rgb(var(--color-deep) / <alpha-value>)',
        teal: 'rgb(var(--color-teal) / <alpha-value>)',
        slate: 'rgb(var(--color-slate) / <alpha-value>)',
        page: 'rgb(var(--color-page) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
    },
  },
  plugins: [],
};
