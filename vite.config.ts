import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'The Dunigan Recipes',
        short_name: 'Dunigan Recipes',
        description: 'The Dunigan family recipe box: recipes, card photos and family stories.',
        theme_color: '#f7f2e8',
        background_color: '#f7f2e8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Sign-in and API requests must always go to the network.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Card photos: cache as they are viewed so the box works offline.
            urlPattern: ({ url }) => url.pathname.startsWith('/cards/') || url.pathname.includes('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: { cacheName: 'card-photos', expiration: { maxEntries: 400 } },
          },
          {
            urlPattern: ({ url }) => url.origin.includes('fonts.g'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts' },
          },
        ],
      },
    }),
  ],
});
