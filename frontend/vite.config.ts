
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import basicSsl from '@vitejs/plugin-basic-ssl';
  import tailwindcss from '@tailwindcss/vite'
  import path from 'path';

  const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8080';

  export default defineConfig({
    plugins: [react(), tailwindcss(), basicSsl()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
    },
    server: {
      host: true,
      port: 4000,
      strictPort: true,
      open: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  });
