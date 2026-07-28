import { defineConfig } from 'vite';

import { createPathfinderApiPlugin } from './src/server/viteApiPlugin.js';

export default defineConfig(({ isPreview, mode }) => {
  const apiEnvironment = isPreview
    ? {
        ...process.env,
        NODE_ENV: 'development',
      }
    : process.env;

  return {
    plugins:
      mode === 'test'
        ? []
        : [
            createPathfinderApiPlugin({
              environment: apiEnvironment,
            }),
          ],
    build: {
      chunkSizeWarningLimit: 2500,
    },
    server: {
      allowedHosts: ['mcp.krdp.ddns.net'],
      host: '0.0.0.0',
      port: 3010,
      strictPort: true,
    },
    preview: {
      allowedHosts: ['mcp.krdp.ddns.net'],
      host: '0.0.0.0',
      port: 3010,
      strictPort: true,
    },
  };
});
