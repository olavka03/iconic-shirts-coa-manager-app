import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Paths are relative to the repo root, where vitest runs.
export function sourceFiles(
  directory: string,
  extension = /\.(ts|tsx)$/,
): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);

    if (name === "node_modules" || path === join("app", "types")) {
      return [];
    }

    if (statSync(path).isDirectory()) {
      return sourceFiles(path, extension);
    }

    return extension.test(name) ? [path] : [];
  });
}

export const productionFiles = () =>
  [...sourceFiles("app"), ...sourceFiles("scripts")].filter(
    (file) => !/\.test\.tsx?$/.test(file),
  );
