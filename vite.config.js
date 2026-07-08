import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import million from "million/compiler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getManualChunk(id) {
  const normalizedId = id.split(path.sep).join("/");

  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (
    normalizedId.includes("/node_modules/react/") ||
    normalizedId.includes("/node_modules/react-dom/") ||
    normalizedId.includes("/node_modules/react-router/") ||
    normalizedId.includes("/node_modules/react-router-dom/")
  ) {
    return "vendor-react";
  }

  if (normalizedId.includes("/node_modules/framer-motion/")) {
    return "vendor-motion";
  }

  return undefined;
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  return {
    plugins: [
      ...(isProduction ? [million.vite({ auto: true })] : []),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: getManualChunk,
        },
      },
    },
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      open: "/",
    },
  };
});
