import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const rootDir = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => ({
  envDir: rootDir,
  base: mode === "development" ? "/" : "/manage/",
  server: {
    host: "0.0.0.0",
    port: 8003,
    allowedHosts: ["app.lvh.me", "localhost", "127.0.0.1"],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
