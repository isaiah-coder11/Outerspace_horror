import { defineConfig } from 'vite';

// The cloud preview serves the dev server through its own hostname, so that
// host is allow-listed from the environment Vite/Freebuff provides.
const previewHost = process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS;

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: [previewHost, 'localhost', '127.0.0.1'].filter(Boolean),
  },
});
