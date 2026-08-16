import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Firebase's popup sign-in polls window.closed on the auth popup; without this COOP value the
    // browser severs the opener relationship and the flow stalls.
    headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
