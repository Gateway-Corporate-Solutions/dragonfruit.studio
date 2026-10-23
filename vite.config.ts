import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

function deploymentFiles() {
  const root = fileURLToPath(new URL("./deploy/", import.meta.url));
  const files: { name: string; content: string }[] = [];
  function visit(directory: string) {
    for (const entry of Deno.readDirSync(directory)) {
      if (entry.name === ".git") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory) {
        visit(path);
      } else if (entry.isFile) {
        files.push({
          name: relative(root, path).replaceAll("\\", "/"),
          content: Deno.readTextFileSync(path),
        });
      }
    }
  }
  visit(root);
  return files;
}

export default defineConfig({
  plugins: [fresh()],
  define: {
    __DRAGONFRUIT_DEPLOY_FILES__: JSON.stringify(deploymentFiles()),
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
