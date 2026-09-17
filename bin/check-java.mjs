#!/usr/bin/env node
import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const sourceRoot = join(root, "src", "main", "java");
const output = join(root, ".javelin", "java-check");

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : entry.name.endsWith(".java") ? [path] : [];
  });
}

rmSync(output, { recursive: true, force: true });
const result = spawnSync("javac", ["--release", "17", "-encoding", "UTF-8", "-d", output, ...files(sourceRoot)], { stdio: "inherit", shell: false });
if (result.error?.code === "ENOENT") {
  console.error("Javelin Java type check requires JDK 17 or newer (javac was not found).");
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
