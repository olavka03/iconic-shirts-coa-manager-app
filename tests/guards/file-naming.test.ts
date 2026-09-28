import { describe, expect, it } from "vitest";
import { sourceFiles } from "./source-files.utils";

const ROLE =
  "component|hook|service|repository|gateway|route|schema|types|utils|constants|job|script|reducer|fake|fixture|factory|client|config|setup|singleton";
const KEBAB = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SOURCE = new RegExp(`^${KEBAB}\\.(?:${ROLE})\\.tsx?$`);
const TEST = new RegExp(
  `^${KEBAB}(?:\\.(?:${ROLE}))?(?:\\.(?:db|prop))?\\.test\\.tsx?$`,
);
const DATA = new RegExp(
  `^${KEBAB}\\.(?:fixture|snap)\\.json$|^${KEBAB}\\.module\\.css$|^${KEBAB}\\.d\\.ts$|^${KEBAB}(?:\\.[a-z0-9-]+)*\\.test\\.tsx?\\.snap$`,
);
// React Router fixes these names.
const EXACT = new Set([
  "app/root.tsx",
  "app/entry.server.tsx",
  "app/routes.ts",
]);
const FOLDER = new RegExp(`^(?:${KEBAB}|\\.server|__snapshots__)$`);

const FILES = ["app", "scripts", "tests"].flatMap((root) =>
  sourceFiles(root, /./),
);
const FOLDERS = [
  ...new Set(FILES.flatMap((path) => path.split("/").slice(0, -1))),
];

function isWellNamed(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;

  return (
    EXACT.has(path) || [SOURCE, TEST, DATA].some((rule) => rule.test(name))
  );
}

describe("file naming", () => {
  it("every file name is lower-kebab-case with a role suffix", () => {
    expect(FILES).toContain("app/.server/db/prisma.singleton.ts");
    expect(FILES.filter((path) => !isWellNamed(path))).toEqual([]);
  });

  it("every folder name is lower-kebab-case", () => {
    expect(FOLDERS).toContain(".server");
    expect(FOLDERS.filter((folder) => !FOLDER.test(folder))).toEqual([]);
  });
});
