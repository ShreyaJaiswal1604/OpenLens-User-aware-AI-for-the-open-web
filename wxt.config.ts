import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'OpenLens',
    description: 'OpenLens — Getting Data Closer to You',
    icons: {
      128: 'logo.webp',
    },
    permissions: [
      'storage',
      'activeTab',
      'tabs',
      ...(browser === 'chrome' ? ['sidePanel'] : []),
    ],
    // All host access requested at runtime with user consent
    optional_permissions: ['<all_urls>'],
    ...(browser === 'chrome'
      ? { side_panel: { default_path: 'sidepanel.html' } }
      : { sidebar_action: { default_panel: 'sidepanel.html', default_title: 'OpenLens' } }
    ),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
