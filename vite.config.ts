import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Server functions read TURSO_* from process.env; Vite only exposes
  // VITE_-prefixed vars by default, so load .env into the server process.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""), process.env);
  return {
    resolve: { tsconfigPaths: true },
    // tanstackStart() must come before react(). Nitro picks the Vercel
    // preset automatically when building on Vercel, Node server otherwise.
    plugins: [tanstackStart(), nitro(), viteReact()],
  };
});
