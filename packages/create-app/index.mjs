#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";

const requested = process.argv[2];
if (!requested) {
  console.error("Usage: npm create javelin-ui@latest <project-name>");
  process.exitCode = 1;
} else {
  const root = resolve(requested);
  const projectName = basename(root).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  await mkdir(join(root, "src", "main", "java", "app"), { recursive: true });
  await mkdir(join(root, "styles"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  await write("package.json", JSON.stringify({
    name: projectName, version: "0.1.0", private: true, type: "module",
    scripts: { start: "javelin-ui start", build: "javelin-ui build" },
    devDependencies: { "@javelin-ui/cli": "^0.8.0-alpha.1", "tailwindcss": "^4.3.3" }
  }, null, 2) + "\n");
  await write("javelin.config.json", JSON.stringify({
    sourceDirectory: "src/main/java", outputDirectory: "dist", publicDirectory: "public",
    entryHtml: "index.html", tailwindInput: "styles/app.css", cssModuleDirectories: ["styles", "src/main/java"], host: "127.0.0.1", port: 5173, basePath: "/",
    spaFallback: true, sourceMaps: true, minify: true
  }, null, 2) + "\n");
  await write("pom.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>app</groupId><artifactId>${projectName}</artifactId><version>0.1.0</version>\n  <properties><maven.compiler.release>17</maven.compiler.release><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding></properties>\n  <dependencies><dependency><groupId>dev.javelin</groupId><artifactId>javelin-ui-api</artifactId><version>0.8.0-alpha.1</version></dependency></dependencies>\n  <build><plugins><plugin><groupId>dev.javelin</groupId><artifactId>javelin-ui-maven-plugin</artifactId><version>0.8.0-alpha.1</version><executions><execution><goals><goal>compile</goal></goals></execution></executions></plugin></plugins></build>\n</project>\n`);
  await write("index.html", `<!doctype html>\n<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/@javelin/styles.css"><title>${projectName}</title></head><body><div id="app"></div><script type="module" src="/@javelin/app.mjs"></script></body></html>\n`);
  await write("styles/app.css", '@import "tailwindcss" source(none);\n@source "../src/main/java";\n@source "../index.html";\n');
  await write("src/main/java/app/Application.java", `package app;\n\nimport javelin.ui.*;\nimport static javelin.ui.Html.*;\n\n@App("#app")\npublic class Application extends Component<Void> {\n    public VNode render() {\n        return div(tw("grid min-h-screen place-items-center bg-slate-50"), h1(tw("text-4xl font-bold"), text("Javelin UI")));\n    }\n}\n`);
  await write("README.md", `# ${projectName}\n\nRequires Node.js 20+ and JDK 17+.\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n`);
  console.log(`Created ${root}`);

  async function write(path, content) {
    await writeFile(join(root, path), content, "utf8");
  }
}
