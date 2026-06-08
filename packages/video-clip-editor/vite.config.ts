import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/video-clip-editor.ts',
      formats: ['es'],
      fileName: 'video-clip-editor',
    },
    rollupOptions: {
      external: [
        'lit',
        'lit/decorators.js',
        'lit/directives/class-map.js',
        'lit/directives/style-map.js',
        'lit/directives/repeat.js',
        'mediabunny',
      ],
    },
  },
});
