import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'search-contact': resolve(__dirname, 'src/popups/search-contact.html'),
        'search-project': resolve(__dirname, 'src/popups/search-project.html'),
        'create-contact': resolve(__dirname, 'src/popups/create-contact.html'),
        'select-address': resolve(__dirname, 'src/popups/select-address.html'),
      },
    },
  },
});
