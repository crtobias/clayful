import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'

// Regla de capas (Screaming Architecture):
// app → screens → domain → shared → assets. Dos áreas de domain no se importan entre sí.
export default tseslint.config(
  { ignores: ['dist', 'src-tauri'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': [
        { type: 'app', pattern: ['src/main.tsx', 'src/App.tsx'], mode: 'file' },
        { type: 'screens', pattern: 'src/screens/*', capture: ['screen'] },
        { type: 'domain', pattern: 'src/domain/*', capture: ['area'] },
        { type: 'shared', pattern: 'src/shared' },
        { type: 'assets', pattern: 'src/assets' },
      ],
    },
    rules: {
      'boundaries/dependencies': [2, {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'app' } }, allow: { to: { element: { types: ['app', 'screens', 'shared', 'assets'] } } } },
          { from: { element: { type: 'screens' } }, allow: { to: { element: { type: 'screens', captured: { screen: '{{ from.element.captured.screen }}' } } } } },
          { from: { element: { type: 'screens' } }, allow: { to: { element: { types: ['domain', 'shared', 'assets'] } } } },
          { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain', captured: { area: '{{ from.element.captured.area }}' } } } } },
          { from: { element: { type: 'domain' } }, allow: { to: { element: { types: ['shared', 'assets'] } } } },
          { from: { element: { type: 'shared' } }, allow: { to: { element: { types: ['shared', 'assets'] } } } },
          { from: { element: { type: 'assets' } }, allow: { to: { element: { type: 'assets' } } } },
        ],
      }],
    },
  },
)
