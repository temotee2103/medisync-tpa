# Server Build Deployment

## Runtime requirements
- Node.js 20+
- Writable temp directory for Next.js

## Required environment variables
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_BASE_PATH (optional)

## Standard commands
- Install: npm ci
- Build: npm run build
- Start: npm run start

## Reverse proxy requirements
- Forward all requests to the Node server
- Preserve headers: Host, X-Forwarded-Proto

## Rollback procedure
- Keep last 2 builds available
- Roll back by restarting with previous build artifact
