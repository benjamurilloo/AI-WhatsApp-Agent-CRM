import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que `next dev` escriba reglas para agentes en CLAUDE.md (brief-2.3).
  agentRules: false,
};

export default nextConfig;
