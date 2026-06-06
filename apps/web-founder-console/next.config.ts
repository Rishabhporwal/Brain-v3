import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle at .next/standalone for slim Docker images.
  // The Docker runtime stage only needs that + .next/static + public.
  output: 'standalone',
  // Trace deps from the monorepo root so the standalone bundle resolves the pnpm store correctly.
  outputFileTracingRoot: path.join(__dirname, '../../'),
}

export default nextConfig
