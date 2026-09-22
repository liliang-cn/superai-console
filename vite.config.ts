import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

// The proxy is not a convenience, it is the only way in.
//
// SuperAI's serve mode sends no CORS headers at all, so a page on another
// origin cannot call it from the browser — and its only credential is an
// Authorization header, which EventSource cannot set, so the event stream
// could not be opened from the browser even if CORS were open.
//
// Proxying under this dev server's own origin answers both: the page talks to
// /api on itself, and the header is added here, on the way out. The token
// therefore never reaches the browser, which is the part worth keeping when
// this is eventually served from somewhere real — put the same rewrite in
// whatever fronts it and the app does not change.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.SUPERAI_URL || "http://192.168.123.65:43118";
  const token = env.SUPERAI_TOKEN || "";

  return {
    plugins: [react(), tailwind()],
    server: {
      port: 43917,
      strictPort: true,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          // The event stream is the whole point of this app; a proxy that
          // buffers turns a live feed into a page that updates once, at the
          // end, and looks simply broken.
          selfHandleResponse: false,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (token) proxyReq.setHeader("Authorization", `Bearer ${token}`);
              // Ask for no compression: a gzip stream is buffered in chunks
              // large enough to hide several seconds of events.
              proxyReq.setHeader("Accept-Encoding", "identity");
            });
          },
        },
      },
    },
  };
});
