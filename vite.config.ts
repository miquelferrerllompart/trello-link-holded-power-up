import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'search-contact': resolve(__dirname, 'src/popups/search-contact.html'),
        'search-project': resolve(__dirname, 'src/popups/search-project.html'),
        settings: resolve(__dirname, 'src/popups/settings.html'),
        'card-back': resolve(__dirname, 'src/popups/card-back.html'),
      },
    },
  },
});
