import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: ['es2020', 'safari14', 'chrome87', 'firefox78'],
  },
})
