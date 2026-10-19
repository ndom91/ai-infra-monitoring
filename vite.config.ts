import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  // Server functions read TURSO_* from process.env; Vite only exposes
  // VITE_-prefixed vars by default, so load .env into the server process.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""), process.env);
  if (command === "build") {
    rmSync(resolve(process.cwd(), "dist"), { force: true, recursive: true });
  }
  return {
    resolve: { tsconfigPaths: true },
    plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), viteReact()],
  };
});
