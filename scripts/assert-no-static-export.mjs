import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, "out");
const allowStaticExport = process.env.ALLOW_STATIC_EXPORT === "true";

if (!allowStaticExport && fs.existsSync(outDir)) {
  process.stderr.write(
    "Static export output directory 'out/' exists but server build is expected. Remove it or set ALLOW_STATIC_EXPORT=true.\n"
  );
  process.exit(1);
}
