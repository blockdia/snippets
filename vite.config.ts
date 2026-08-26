import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

function sb3CorsHeaders(): Plugin {
  return {
    name: "sb3-cors-headers",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url
          ? new URL(request.url, "http://localhost").pathname
          : "";

        if (pathname.startsWith("/examples/") && pathname.endsWith(".sb3")) {
          // Vite dev does not apply Cloudflare's public/_headers rules.
          response.setHeader(
            "Access-Control-Allow-Origin",
            "https://turbowarp.org",
          );
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    sb3CorsHeaders(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
