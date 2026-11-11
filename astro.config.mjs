import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://ine-graphs.vercel.app',
  compressHTML: true,
});
