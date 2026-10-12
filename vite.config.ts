import { defineConfig, type Plugin } from 'vite';

// GitHub Pages serves the repository root. The committed index.html is the
// built page, so the dev server rewrites `/` to the TypeScript entry.
function serveDevEntry(): Plugin {
  return {
    name: 'serve-dev-entry',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const request = req as { url?: string };
        const raw = request.url ?? '/';
        const q = raw.indexOf('?');
        const path = q === -1 ? raw : raw.slice(0, q);
        const search = q === -1 ? '' : raw.slice(q);
        if (path === '/' || path === '/index.html') {
          request.url = `/index.dev.html${search}`;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // Relative URLs so the project site at /wright-house-generator/ can load assets.
  // The dev server keeps root-absolute URLs so `/src/main.ts` and HMR resolve.
  base: command === 'build' ? './' : '/',
  plugins: [serveDevEntry()],
  optimizeDeps: {
    entries: ['index.dev.html'],
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.dev.html',
    },
  },
}));
