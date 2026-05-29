import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, "out");

const ensureAlias = (filePath, sourcePath) => {
  if (!fs.existsSync(sourcePath)) return false;
  fs.copyFileSync(sourcePath, filePath);
  return true;
};

const walkRouteDirs = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const hasIndex = entries.some((entry) => entry.isFile() && entry.name === "index.html");
  if (hasIndex) acc.push(dir);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "_next") continue;
    walkRouteDirs(path.join(dir, entry.name), acc);
  }
  return acc;
};

const toSegments = (routeDir) =>
  path
    .relative(outDir, routeDir)
    .split(path.sep)
    .filter(Boolean);

const buildAliasesForRoute = (routeDir) => {
  const segments = toSegments(routeDir);
  if (segments.length < 2) return 0;
  const namespace = segments[0];
  const routeSuffix = segments.slice(1);
  const suffixDot = routeSuffix.join(".");
  const scopedDir = path.join(routeDir, `__next.${namespace}`);
  if (!fs.existsSync(scopedDir)) return 0;
  let created = 0;

  const directTxt = path.join(scopedDir, ...routeSuffix) + ".txt";
  const directAlias = path.join(routeDir, `__next.${namespace}.${suffixDot}.txt`);
  if (ensureAlias(directAlias, directTxt)) created += 1;

  const pageTxt = path.join(scopedDir, ...routeSuffix, "__PAGE__.txt");
  const pageAlias = path.join(routeDir, `__next.${namespace}.${suffixDot}.__PAGE__.txt`);
  if (ensureAlias(pageAlias, pageTxt)) created += 1;

  return created;
};

if (!fs.existsSync(outDir)) {
  process.exit(0);
}

let totalCreated = 0;
const routeDirs = walkRouteDirs(outDir);
for (const routeDir of routeDirs) {
  totalCreated += buildAliasesForRoute(routeDir);
}

if (totalCreated > 0) {
  process.stdout.write(`Created ${totalCreated} RSC alias files for static hosting.\n`);
}
