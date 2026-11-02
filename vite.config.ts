import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { buildHeadersContent } from './src/utils/csp.ts';

function cspHeadersPlugin(): Plugin {
  let resolvedEnv: Record<string, string> = {};

  return {
    name: 'generate-csp-headers',
    config(_, { mode }) {
      resolvedEnv = loadEnv(mode, process.cwd(), '');
    },
    buildStart() {
      if (process.env.VITEST) return;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || resolvedEnv.VITE_SUPABASE_URL;
      try {
        buildHeadersContent(supabaseUrl);
      } catch (err: any) {
        throw new Error(`[CSP Plugin] Build failed: ${err.message}`);
      }
    },
    closeBundle() {
      if (process.env.VITEST) return;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || resolvedEnv.VITE_SUPABASE_URL;
      const headers = buildHeadersContent(supabaseUrl);
      const outHeadersPath = path.resolve(process.cwd(), 'dist', '_headers');
      if (fs.existsSync(path.dirname(outHeadersPath))) {
        fs.writeFileSync(outHeadersPath, headers, 'utf-8');
        console.log(`[CSP Plugin] Generated environment-specific dist/_headers successfully.`);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cspHeadersPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
  },
});
