import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    cors: true,
  },
});
