#!/usr/bin/env node
import http from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";
import chokidar from "chokidar";
import { SourceMapGenerator } from "source-map";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const command = process.argv[2] ?? "start";
const root = resolve(process.cwd());
const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFile = join(ownRoot, "src", "runtime", "runtime.mjs");
const defaultConfig = {
  sourceDirectory: "src/main/java",
  outputDirectory: "dist",
  publicDirectory: "public",
  entryHtml: "index.html",
  tailwindInput: "styles/app.css",
  cssModuleDirectories: ["styles", "src/main/java"],
  host: "127.0.0.1",
  port: 5173,
  basePath: "/",
  spaFallback: true,
  sourceMaps: true,
  minify: true
};

async function loadConfig() {
  try {
    const userConfig = JSON.parse(await readFile(join(root, "javelin.config.json"), "utf8"));
    return validateConfig({ ...defaultConfig, ...userConfig });
  } catch (error) {
    if (error.code === "ENOENT") return validateConfig({ ...defaultConfig });
    throw new Error(`Invalid javelin.config.json: ${error.message}`);
  }
}

async function listJava(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listJava(path) : entry.name.endsWith(".java") ? [path] : [];
  }))).flat();
}

export async function compileJava(config, runtimePath, moduleSuffix = "") {
  const sourceRoot = resolve(root, config.sourceDirectory);
  const files = await listJava(sourceRoot);
  if (!files.length) throw new Error(`No Java sources found under ${sourceRoot}`);
  const embeddedCompiler = join(ownRoot, "compiler-src");
  const compilerSource = await exists(embeddedCompiler) ? embeddedCompiler : join(root, "packages", "java-compiler", "src", "main", "java");
  const compilerFiles = await listJava(compilerSource);
  const classes = join(root, ".javelin", "compiler-classes");
  const compilerStamp = join(root, ".javelin", "compiler-classes.sha256");
  const rawOutput = join(root, ".javelin", "ast-output.mjs");
  const fingerprint = await hashFiles(compilerFiles);
  const cachedFingerprint = await readFile(compilerStamp, "utf8").catch(() => "");
  if (cachedFingerprint !== fingerprint || !await exists(classes)) {
    await rm(classes, { recursive: true, force: true });
    await mkdir(classes, { recursive: true });
    await runProcess(javaTool("javac"), ["--release", "17", "-d", classes, ...compilerFiles], "AST compiler compilation failed");
    await writeFile(compilerStamp, fingerprint, "utf8");
  }
  const compilerArguments = ["-cp", classes, "dev.javelin.compiler.Main", "--source-root", sourceRoot];
  const embeddedApi = join(ownRoot, "api-src");
  if (config.apiSourceDirectory) compilerArguments.push("--api-source-root", resolve(root, config.apiSourceDirectory));
  else if (await exists(embeddedApi)) compilerArguments.push("--api-source-root", embeddedApi);
  compilerArguments.push("--output", rawOutput, "--runtime-path", runtimePath);
  if (moduleSuffix) compilerArguments.push("--module-suffix", moduleSuffix);
  await runProcess(javaTool("java"), compilerArguments, "Java application compilation failed");
  const sources = new Map(await Promise.all(files.map(async (file) => [normalizePath(file), await readFile(file, "utf8")])));
  return attachJavaSourceMap(await readFile(rawOutput, "utf8"), sources);
}

async function compileDevelopment(config) {
  const generatedDirectory = join(root, ".javelin");
  const output = await compileJava(config, "/@javelin/runtime.mjs", `?v=${Date.now()}`);
  await mkdir(generatedDirectory, { recursive: true });
  await writeFile(join(generatedDirectory, "app.mjs"), output, "utf8");
  await buildTailwind(config, join(generatedDirectory, "styles.css"), false);
  return output;
}

export async function build() {
  const config = await loadConfig();
  const generatedDirectory = join(root, ".javelin");
  const outputDirectory = resolve(root, config.outputDirectory);
  assertSafeOutputDirectory(config, outputDirectory);
  const stagingDirectory = join(generatedDirectory, `production-staging-${process.pid}-${Date.now()}`);
  const assetDirectory = join(stagingDirectory, "assets");
  const entryFile = join(generatedDirectory, "app.entry.mjs");
  await mkdir(generatedDirectory, { recursive: true });
  await rm(stagingDirectory, { recursive: true, force: true });
  try {
    await mkdir(stagingDirectory, { recursive: true });
    const publicDirectory = resolve(root, config.publicDirectory);
    if (await exists(publicDirectory)) await cp(publicDirectory, stagingDirectory, { recursive: true });
    await mkdir(assetDirectory, { recursive: true });
    await copyFile(runtimeFile, join(generatedDirectory, "runtime.mjs"));
    await writeFile(entryFile, await compileJava(config, "./runtime.mjs"), "utf8");
    const generatedCss = join(generatedDirectory, "styles.css");
    await buildTailwind(config, generatedCss, true);
    const bundleResult = await bundle({
    entryPoints: { app: entryFile },
    outdir: assetDirectory,
    entryNames: "[name]-[hash]",
    bundle: true,
    splitting: true,
    format: "esm",
    chunkNames: "chunk-[name]-[hash]",
    target: ["es2022"],
    minify: Boolean(config.minify),
    sourcemap: config.sourceMaps ? "linked" : false,
    legalComments: "none",
    metafile: true
    });

    const html = await readFile(resolve(root, config.entryHtml), "utf8");
    const bundledEntry = Object.entries(bundleResult.metafile.outputs).find(([, value]) => value.entryPoint)?.[0];
    if (!bundledEntry) throw new Error("Bundler did not produce an application entry");
    const scriptPath = `${normalizeBase(config.basePath)}assets/${bundledEntry.split(/[\\/]/).at(-1)}`;
    const cssContent = await readFile(generatedCss);
    const cssName = `styles-${createHash("sha256").update(cssContent).digest("hex").slice(0, 10)}.css`;
    await copyFile(generatedCss, join(assetDirectory, cssName));
    const productionHtml = injectProductionAssets(
      html,
      scriptPath,
      `${normalizeBase(config.basePath)}assets/${cssName}`
    );
    await writeFile(join(stagingDirectory, "index.html"), productionHtml, "utf8");
    await replaceDirectoryAtomically(stagingDirectory, outputDirectory);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
  console.log(`Built production application in ${outputDirectory}`);
  return outputDirectory;
}

export async function createDevelopmentServer({ watch = false } = {}) {
  const config = await loadConfig();
  await compileDevelopment(config);
  const reloadClients = new Set();
  let watcher = null;

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const path = url.pathname;
      if (path === "/@javelin/events") {
        response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        response.write("event: ready\ndata: connected\n\n");
        reloadClients.add(response);
        request.on("close", () => reloadClients.delete(response));
      } else if (path === "/" || path === "/index.html") {
        let html = await readFile(resolve(root, config.entryHtml), "utf8");
        if (watch) html = injectReloadClient(html);
        serve(response, html, "text/html; charset=utf-8");
      } else if (path === "/@javelin/app.mjs") {
        serve(response, await readFile(join(root, ".javelin", "app.mjs")), "text/javascript; charset=utf-8");
      } else if (path === "/@javelin/javelin.shared.mjs" || /^\/@javelin\/[A-Za-z_$][\w$]*\.lazy\.mjs$/.test(path)) {
        serve(response, await readFile(join(root, ".javelin", basename(path))), "text/javascript; charset=utf-8");
      } else if (path === "/@javelin/runtime.mjs") {
        serve(response, await readFile(runtimeFile), "text/javascript; charset=utf-8");
      } else if (path === "/@javelin/styles.css") {
        serve(response, await readFile(join(root, ".javelin", "styles.css")), "text/css; charset=utf-8");
      } else {
        const publicFile = safePublicPath(resolve(root, config.publicDirectory), path);
        if (publicFile && await isFile(publicFile)) serve(response, await readFile(publicFile), mimeType(publicFile));
        else if (config.spaFallback && !extname(path)) {
          let html = await readFile(resolve(root, config.entryHtml), "utf8");
          if (watch) html = injectReloadClient(html);
          serve(response, html, "text/html; charset=utf-8");
        }
        else response.writeHead(404).end("Not found");
      }
    } catch (error) {
      console.error(error);
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(`Javelin development server error\n${error.message}`);
    }
  });

  if (watch) {
    const watched = [
      resolve(root, config.sourceDirectory), resolve(root, config.entryHtml), resolve(root, config.tailwindInput),
      resolve(root, config.publicDirectory),
      ...(Array.isArray(config.cssModuleDirectories) ? config.cssModuleDirectories.map((path) => resolve(root, path)) : [])
    ];
    watcher = chokidar.watch(watched, {
      ignoreInitial: true,
      ignored: (path) => /^\.javelin-tailwind-.*\.css$/.test(basename(path))
    });
    let rebuildTimer = null;
    let rebuilding = false;
    let rebuildQueued = false;
    let closed = false;
    const rebuild = async () => {
      if (closed) return;
      if (rebuilding) { rebuildQueued = true; return; }
      rebuilding = true;
      do {
        rebuildQueued = false;
        try {
          await compileDevelopment(config);
          for (const client of reloadClients) client.write("event: reload\ndata: changed\n\n");
          console.log("Rebuilt application");
        } catch (error) {
          console.error(error.message);
          const payload = JSON.stringify(error.message);
          for (const client of reloadClients) client.write(`event: build-error\ndata: ${payload}\n\n`);
        }
      } while (rebuildQueued && !closed);
      rebuilding = false;
    };
    watcher.on("all", async () => {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuild, 40);
    });
    const heartbeat = setInterval(() => {
      for (const client of reloadClients) client.write(": heartbeat\n\n");
    }, 20_000);
    server.on("close", () => {
      closed = true;
      rebuildQueued = false;
      clearTimeout(rebuildTimer);
      clearInterval(heartbeat);
    });
  }
  server.on("close", () => watcher?.close());
  return server;
}

async function start() {
  const config = await loadConfig();
  const server = await createDevelopmentServer({ watch: true });
  const port = Number(process.env.PORT ?? config.port);
  const host = process.env.HOST ?? config.host;
  server.listen(port, host, () => console.log(`Javelin UI running at http://${host}:${port}`));
}

function serve(response, content, type) {
  response.writeHead(200, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(content);
}

function injectReloadClient(html) {
  const developmentFlag = `<script>globalThis.__JAVELIN_DEV__=true</script>`;
  const client = `<script type="module">const e=new EventSource('/@javelin/events');const showError=(message)=>{let n=document.getElementById('__javelin_error');if(!n){n=document.createElement('pre');n.id='__javelin_error';Object.assign(n.style,{position:'fixed',inset:'16px',zIndex:99999,padding:'20px',overflow:'auto',color:'#fee',background:'#260b12',border:'1px solid #ff667d',borderRadius:'12px'});document.body.append(n)}n.textContent=message};e.addEventListener('reload',async()=>{try{const runtime=await import('/@javelin/runtime.mjs');runtime.prepareHmr();await import('/@javelin/app.mjs?t='+Date.now());const css=document.querySelector('link[href^="/@javelin/styles.css"]');if(css)css.href='/@javelin/styles.css?t='+Date.now();document.getElementById('__javelin_error')?.remove()}catch(error){showError(error.stack??error.message)}});e.addEventListener('build-error',x=>showError(JSON.parse(x.data)))</script>`;
  const withFlag = html.includes("</head>") ? html.replace("</head>", `${developmentFlag}</head>`) : developmentFlag + html;
  return withFlag.replace("</body>", `${client}</body>`);
}

function normalizeBase(basePath) {
  return `/${basePath}/`.replace(/\/{2,}/g, "/");
}

function validateConfig(config) {
  const pathKeys = ["sourceDirectory", "outputDirectory", "publicDirectory", "entryHtml", "tailwindInput"];
  for (const key of pathKeys) if (typeof config[key] !== "string" || !config[key].trim()) throw new Error(`${key} must be a non-empty string`);
  if (!Array.isArray(config.cssModuleDirectories) || config.cssModuleDirectories.some((path) => typeof path !== "string" || !path.trim())) {
    throw new Error("cssModuleDirectories must be an array of non-empty strings");
  }
  if (!Number.isInteger(Number(config.port)) || Number(config.port) < 1 || Number(config.port) > 65535) throw new Error("port must be an integer from 1 to 65535");
  if (typeof config.host !== "string" || !config.host.trim()) throw new Error("host must be a non-empty string");
  if (typeof config.basePath !== "string" || !config.basePath.startsWith("/") || /[?#]/.test(config.basePath) ||
      config.basePath.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new Error("basePath must be an absolute URL path without traversal, query, or hash segments");
  }
  for (const key of ["spaFallback", "sourceMaps", "minify"]) if (typeof config[key] !== "boolean") throw new Error(`${key} must be boolean`);
  return { ...config, port: Number(config.port), basePath: normalizeBase(config.basePath) };
}

function assertSafeOutputDirectory(config, outputDirectory) {
  const physicalRoot = resolvePhysicalPath(root);
  const physicalOutput = resolvePhysicalPath(outputDirectory);
  const protectedPaths = [
    physicalRoot,
    resolve(root, config.sourceDirectory),
    resolve(root, config.publicDirectory),
    resolve(root, config.entryHtml),
    resolve(root, config.tailwindInput)
  ];
  if (!isInside(physicalRoot, physicalOutput) || physicalOutput === physicalRoot) {
    throw new Error(`Unsafe outputDirectory '${config.outputDirectory}': it must be a child directory of the project root`);
  }
  for (const configuredPath of protectedPaths.slice(1)) {
    const protectedPath = resolvePhysicalPath(configuredPath);
    if (protectedPath === physicalOutput || isInside(physicalOutput, protectedPath)) {
      throw new Error(`Unsafe outputDirectory '${config.outputDirectory}': it contains protected path '${relative(root, protectedPath)}'`);
    }
  }
}

function resolvePhysicalPath(path) {
  let existing = resolve(path);
  const missing = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    missing.unshift(basename(existing));
    existing = parent;
  }
  return resolve(realpathSync(existing), ...missing);
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
}

function injectProductionAssets(html, scriptPath, stylesheetPath) {
  const scriptPattern = /<script\b(?=[^>]*\bsrc\s*=\s*["']\/@javelin\/app\.mjs["'])[^>]*>\s*<\/script>/i;
  const stylePattern = /<link\b(?=[^>]*\bhref\s*=\s*["']\/@javelin\/styles\.css["'])[^>]*>/i;
  if (!scriptPattern.test(html)) throw new Error("entryHtml must contain a module script whose src is '/@javelin/app.mjs'");
  if (!stylePattern.test(html)) throw new Error("entryHtml must contain a stylesheet link whose href is '/@javelin/styles.css'");
  return html
    .replace(scriptPattern, `<script type="module" src="${scriptPath}"></script>`)
    .replace(stylePattern, `<link rel="stylesheet" href="${stylesheetPath}">`);
}

function safePublicPath(publicRoot, requestPath) {
  const candidate = resolve(publicRoot, `.${decodeURIComponent(requestPath)}`);
  const physicalRoot = resolvePhysicalPath(publicRoot);
  const physicalCandidate = resolvePhysicalPath(candidate);
  return physicalCandidate === physicalRoot || isInside(physicalRoot, physicalCandidate) ? physicalCandidate : null;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function replaceDirectoryAtomically(stagingDirectory, outputDirectory) {
  const backupDirectory = `${outputDirectory}.javelin-backup-${process.pid}`;
  await rm(backupDirectory, { recursive: true, force: true });
  const hadOutput = await exists(outputDirectory);
  if (hadOutput) await rename(outputDirectory, backupDirectory);
  try {
    await rename(stagingDirectory, outputDirectory);
    if (hadOutput) await rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    if (hadOutput && !await exists(outputDirectory)) await rename(backupDirectory, outputDirectory);
    throw error;
  }
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

function mimeType(path) {
  return ({ ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" })[extname(path).toLowerCase()]
    ?? "application/octet-stream";
}

async function buildTailwind(config, outputFile, minify) {
  const require = createRequire(import.meta.url);
  const packageFile = require.resolve("@tailwindcss/cli/package.json");
  const cli = join(dirname(packageFile), "dist", "index.mjs");
  const tailwindInput = resolve(root, config.tailwindInput);
  const moduleFiles = await listCssModules(config);
  await validateCssModuleReferences(config, moduleFiles);
  let effectiveInput = tailwindInput;
  if (moduleFiles.length) {
    effectiveInput = join(dirname(tailwindInput), `.javelin-tailwind-${process.pid}.css`);
    const baseCss = await readFile(tailwindInput, "utf8");
    const modules = await Promise.all(moduleFiles.map(async (file) => transformCssModule(
      await readFile(file, "utf8"),
      normalizePath(relative(root, file))
    )));
    await writeFile(effectiveInput, `${baseCss}\n${modules.join("\n")}\n`, "utf8");
  }
  const args = [cli, "-i", effectiveInput, "-o", outputFile];
  if (minify) args.push("--minify");
  try {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
      let errors = "";
      child.stderr.on("data", (chunk) => { errors += chunk; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`Tailwind build failed: ${errors.trim()}`)));
    });
  } finally {
    if (effectiveInput !== tailwindInput) await rm(effectiveInput, { force: true });
  }
}

async function listCssModules(config) {
  const directories = Array.isArray(config.cssModuleDirectories) ? config.cssModuleDirectories : [];
  const files = [];
  for (const directory of directories) {
    const absolute = resolve(root, directory);
    if (await exists(absolute)) files.push(...await listFiles(absolute, (path) => path.endsWith(".module.css")));
  }
  return [...new Set(files)].sort();
}

async function validateCssModuleReferences(config, moduleFiles) {
  const available = new Map();
  for (const file of moduleFiles) {
    const modulePath = normalizePath(relative(root, file));
    const css = await readFile(file, "utf8");
    const names = new Set();
    const document = postcss.parse(css, { from: modulePath });
    document.walkRules((rule) => selectorParser((selectors) => selectors.walkClasses((node) => names.add(node.value))).processSync(rule.selector));
    available.set(modulePath, names);
  }
  const sourceRoot = resolve(root, config.sourceDirectory);
  const javaFiles = await listJava(sourceRoot);
  const referencePattern = /\bcssModule\s*\(\s*"([^"\\]+)"\s*,\s*"([^"\\]+)"\s*\)/g;
  for (const javaFile of javaFiles) {
    const source = await readFile(javaFile, "utf8");
    for (const match of source.matchAll(referencePattern)) {
      const modulePath = normalizePath(match[1]).replace(/^\.\//, "");
      const names = available.get(modulePath);
      if (!names) throw new Error(`${normalizePath(relative(root, javaFile))}: CSS Module '${modulePath}' was not found`);
      if (!names.has(match[2])) throw new Error(`${normalizePath(relative(root, javaFile))}: CSS Module '${modulePath}' has no class '${match[2]}'`);
    }
  }
}

async function listFiles(directory, matches) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path, matches) : matches(path) ? [path] : [];
  }))).flat();
}

function transformCssModule(css, modulePath) {
  const document = postcss.parse(css, { from: modulePath });
  document.walkRules((rule) => {
    rule.selector = selectorParser((selectors) => {
      selectors.walkClasses((node) => { node.value = moduleClassName(modulePath, node.value); });
    }).processSync(rule.selector);
  });
  return document.toString();
}

function moduleClassName(modulePath, localName) {
  const path = normalizePath(modulePath).replace(/^\.\//, "");
  let hash = 0x811c9dc5;
  for (const character of `${path}:${localName}`) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${localName}_${(hash >>> 0).toString(36)}`;
}

async function hashFiles(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(normalizePath(file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function javaTool(name) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  return process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", executable) : executable;
}

async function runProcess(command, args, label) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => {
      if (error.code === "ENOENT") reject(new Error(`${label}: '${command}' was not found. Install JDK 17 or set JAVA_HOME.`));
      else reject(error);
    });
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`${label}${output.trim() ? `\n${output.trim()}` : ""}`)));
  });
}

function attachJavaSourceMap(generated, sources) {
  const map = new SourceMapGenerator({ file: "app.mjs" });
  for (const [file, content] of sources) map.setSourceContent(file, content);
  const output = [];
  let source = sources.keys().next().value;
  let sourceLine = 1;
  for (const line of generated.split(/\r?\n/)) {
    const marker = /^\s*\/\/#javelin-source\s+([A-Za-z0-9_-]+):(\d+)\s*$/.exec(line);
    if (marker) {
      source = normalizePath(Buffer.from(marker[1], "base64url").toString("utf8"));
      sourceLine = Number(marker[2]);
      continue;
    }
    output.push(line);
    if (source) map.addMapping({ generated: { line: output.length, column: 0 }, original: { line: sourceLine, column: 0 }, source });
    sourceLine++;
  }
  const encoded = Buffer.from(map.toString(), "utf8").toString("base64");
  return `${output.join("\n")}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${encoded}\n`;
}

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export const cliInternals = { assertSafeOutputDirectory, injectProductionAssets, moduleClassName, transformCssModule };

function isExecutedDirectly() {
  if (!process.argv[1] || !existsSync(process.argv[1])) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  try {
    if (command === "build") await build();
    else if (command === "start") await start();
    else throw new Error(`Unknown command '${command}'. Use 'build' or 'start'.`);
  } catch (error) {
    console.error(`Javelin UI: ${error.message}`);
    process.exitCode = 1;
  }
}
