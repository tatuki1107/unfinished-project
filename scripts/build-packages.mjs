import { cp, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(process.cwd());
const runtimeDist = join(root, "packages", "runtime", "dist");
const cliDist = join(root, "packages", "cli", "dist");

await rm(runtimeDist, { recursive: true, force: true });
await rm(cliDist, { recursive: true, force: true });
await mkdir(runtimeDist, { recursive: true });
await mkdir(join(cliDist, "bin"), { recursive: true });
await mkdir(join(cliDist, "src", "runtime"), { recursive: true });

await cp(join(root, "src", "runtime", "runtime.mjs"), join(runtimeDist, "index.mjs"));
await cp(join(root, "bin", "javelin-ui.mjs"), join(cliDist, "bin", "javelin-ui.mjs"));
await cp(join(root, "src", "runtime", "runtime.mjs"), join(cliDist, "src", "runtime", "runtime.mjs"));
await cp(join(root, "packages", "java-compiler", "src", "main", "java"), join(cliDist, "compiler-src"), { recursive: true });
await cp(join(root, "src", "main", "java", "javelin", "ui"), join(cliDist, "api-src", "javelin", "ui"), { recursive: true });

console.log("Built npm package artifacts");
