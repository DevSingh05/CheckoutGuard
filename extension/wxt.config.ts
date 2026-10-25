import { defineConfig } from 'wxt';
import { loadEnv } from 'vite';
const backend = new URL(
  process.env.WXT_API_URL ||
    loadEnv(process.env.NODE_ENV || 'production', process.cwd(), 'WXT_')
      .WXT_API_URL ||
    'http://localhost:8000',
);
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // Runtime content-script matches must not grant persistent storefront access.
      manifest.host_permissions = [`${backend.origin}/*`];
    },
  },
  manifest: {
    name: 'CheckoutGuard',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    description:
      'A little clarity before checkout. Investigate public store evidence on your terms.',
    permissions: ['sidePanel', 'activeTab', 'scripting', 'storage'],
    host_permissions: [`${backend.origin}/*`],
    // Asked for only when the user presses "Allow on store pages" in the panel.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'Open CheckoutGuard' },
  },
});
