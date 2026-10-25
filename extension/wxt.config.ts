import { defineConfig } from 'wxt';
import { loadEnv } from 'vite';
const backend = new URL(
  process.env.WXT_API_URL ||
    loadEnv(process.env.NODE_ENV || 'production', process.cwd(), 'WXT_')
      .WXT_API_URL ||
    'http://localhost:8000',
);
// Read access to store pages so a scan never depends on a toolbar click.
const stores = ['https://*/*', 'http://*/*'];
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // Store pages plus the backend; content scripts are still injected only on click.
      manifest.host_permissions = [...stores, `${backend.origin}/*`];
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
    host_permissions: [...stores, `${backend.origin}/*`],
    action: { default_title: 'Open CheckoutGuard' },
  },
});
