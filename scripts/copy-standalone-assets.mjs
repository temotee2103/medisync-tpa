import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const staticSrc = join(root, ".next", "static");
const staticDst = join(root, ".next", "standalone", ".next", "static");
const publicSrc = join(root, "public");
const publicDst = join(root, ".next", "standalone", "public");

if (!existsSync(join(root, ".next", "standalone"))) {
  process.exit(0);
}

if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDst, { recursive: true, force: true });
  process.stdout.write("Copied .next/static → .next/standalone/.next/static\n");
}

if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDst, { recursive: true, force: true });
  process.stdout.write("Copied public/ → .next/standalone/public\n");
}

const envSrc = join(root, ".env");
const envDst = join(root, ".next", "standalone", ".env");
if (existsSync(envSrc)) {
  cpSync(envSrc, envDst, { force: true });
  process.stdout.write("Copied .env → .next/standalone/.env\n");
}
