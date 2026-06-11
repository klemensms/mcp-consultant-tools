import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "src/ui",
  plugins: [viteSingleFile()],
  build: {
    outDir: "../../build/ui",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/ui/work-items-app.html",
    },
  },
});
