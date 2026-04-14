import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  base: './',
  plugins: [react(), tsconfigPaths()],
    define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __APP_GIT_REPO_PATH__: JSON.stringify("https://github.com/SiliconLabsSoftware/web-bluetooth-spp-application"),
    __APP_SPP_BLE_SERVICE__: JSON.stringify("4880c12c-fdcb-4077-8920-a450d7f9b907"),
    __APP_SPP_BLE_CHARACTERISTIC__: JSON.stringify("fec26ec4-6d71-4442-9f81-55bc21d658d6"),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.mjs',
  },
});
