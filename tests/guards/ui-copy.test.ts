import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "./source-files.utils";

const LOGIN_ROUTE = "app/routes/auth/login.route.tsx";
const LOGIN_HEADING = "COA Manager";
// The mirror services are left out: they hold metaobject field names, not copy.
const SERVICES_WITH_COPY = ["certificates", "orders", "codes", "media", "shop"];
const ERROR_CLASSES = new Set(["Error", "MirrorError"]);
const FILES = [
  ...sourceFiles("app/features", /\.tsx$/),
  ...sourceFiles("app/shared", /\.tsx$/),
  ...sourceFiles("app/routes", /\.tsx$/),
].filter((file) => !/\.test\.tsx$/.test(file));
// Messages that live in plain modules, services and the api and proxy routes reach the UI as well.
const MESSAGE_FILES = [
  ...sourceFiles("app/features", /\.ts$/),
  ...sourceFiles("app/shared", /\.ts$/),
  ...SERVICES_WITH_COPY.flatMap((folder) =>
    sourceFiles(`app/.server/services/${folder}`, /\.ts$/),
  ),
  "app/.server/services/shared/json-response.utils.ts",
  "app/.server/shopify/login-errors.utils.ts",
  ...sourceFiles("app/routes/api", /\.route\.tsx$/),
  ...sourceFiles("app/routes/proxy", /\.route\.tsx$/),
].filter((file) => !/\.(?:test|d)\.ts$/.test(file));
const COPY_ATTRIBUTES = new Set([
  "heading",
  "subheading",
  "label",
  "placeholder",
  "details",
  "error",
  "accessibilityLabel",
  "title",
  "alt",
]);
const BANNED: RegExp[] = [
  /\bmetaobjects?\b/i,
  /\bsync/i,
  /\bbackups?\b/i,
  /\bmirror/i,
  /\bimport(?:s|ed|ing)?\b/i,
  /\bjson\b/i,
  /\bhandles?\b/i,
  /needs review/i,
  /\bCOA\b/,
  /\bcerts?\b/i,
  /\brecords?\b/i,
  /\bID\b/,
  /\bserial/i,
  /line items?/i,
  /\bdictionar/i,
  /\blearn(?:ed|ing|s)?\b/i,
  /\bconfiden/i,
  /protected customer data/i,
  /\bscopes?\b/i,
  /\bsuccessfully\b/i,
  /\bplease\b/i,
  /\boops\b/i,
  /\bsimply\b/i,
  /\bjust\b/i,
  /\beasily\b/i,
  /\bseamless/i,
  /\bpowerful\b/i,
  /\blet's\b/i,
  /welcome to/i,
  /!/,
  /click here/i,
  // A trailing ellipsis on copy; a lone "…" (the pagination gap) is a glyph, not copy.
  /\S(…|\.\.\.)$/,
  /\S ?— ?\S/,
  /\p{Extended_Pictographic}/u,
];

function parseSource(
  file: string,
  source = readFileSync(file, "utf8"),
): ts.SourceFile {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

// String literals of an expression. Nested JSX is skipped because the walker visits it on its own,
// so attribute values such as id="cert-link-1" never count as copy.
function collectStrings(
  node: ts.Node,
  collected: string[],
  isSkipped: (node: ts.Node) => boolean = () => false,
): void {
  if (
    isSkipped(node) ||
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  ) {
    return;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    collected.push(node.text);

    return;
  }

  if (ts.isTemplateExpression(node)) {
    collected.push(
      node.head.text +
        node.templateSpans.map((span) => `{}${span.literal.text}`).join(""),
    );

    return;
  }

  ts.forEachChild(node, (child) => collectStrings(child, collected, isSkipped));
}

function isLoginHeading(file: string, text: ts.JsxText): boolean {
  return (
    file === LOGIN_ROUTE &&
    text.text.trim() === LOGIN_HEADING &&
    ts.isJsxElement(text.parent) &&
    text.parent.openingElement.tagName.getText() === "h1"
  );
}

function copyOf(file: string, source?: string): string[] {
  const sourceFile = parseSource(file, source);
  const copy: string[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node) && node.text.trim() && !isLoginHeading(file, node)) {
      copy.push(node.text.trim());
    }

    if (
      ts.isJsxAttribute(node) &&
      COPY_ATTRIBUTES.has(node.name.getText(sourceFile)) &&
      node.initializer
    ) {
      if (ts.isStringLiteral(node.initializer)) {
        copy.push(node.initializer.text);
      } else if (
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      ) {
        collectStrings(node.initializer.expression, copy);
      }
    }

    const isChildExpression =
      ts.isJsxExpression(node) &&
      node.parent &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent));

    if (isChildExpression && node.expression) {
      collectStrings(node.expression, copy);
    }

    if (
      ts.isCallExpression(node) &&
      /toast\.show$/.test(node.expression.getText(sourceFile)) &&
      node.arguments[0]
    ) {
      collectStrings(node.arguments[0], copy);
    }

    ts.forEachChild(node, walk);
  };

  walk(sourceFile);

  return copy;
}

// Log events, error messages and GraphQL documents are read by developers, never by the merchant.
function isDeveloperText(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) {
    return (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "log"
    );
  }

  if (ts.isNewExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      ERROR_CLASSES.has(node.expression.text)
    );
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return /^\s*#graphql/.test(node.text);
  }

  if (ts.isTemplateExpression(node)) {
    return /^\s*#graphql/.test(node.head.text);
  }

  return false;
}

// Outside JSX a string counts as copy when it has a letter and a space, or is one capitalised word
// such as "Selected". Ids and keys are neither.
function messagesOf(file: string, source?: string): string[] {
  const sourceFile = parseSource(file, source);
  const texts: string[] = [];

  sourceFile.statements
    .filter(
      (statement) =>
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement),
    )
    .forEach((statement) => collectStrings(statement, texts, isDeveloperText));

  return texts.filter(
    (text) =>
      (/[A-Za-z]/.test(text) && / /.test(text)) || /^[A-Z][a-z]+$/.test(text),
  );
}

const banned = (copy: string[]) =>
  copy.filter((text) => BANNED.some((pattern) => pattern.test(text)));

describe("UI copy (spec §6.1)", () => {
  it.each(FILES)("%s uses no banned words", (file) => {
    expect(banned(copyOf(file))).toEqual([]);
  });

  it.each(MESSAGE_FILES)("messages in %s use no banned words", (file) => {
    expect(banned(messagesOf(file))).toEqual([]);
  });

  it("reads every sentence of a plain module, but not import paths or ids", () => {
    const messages = messagesOf(
      "sample.ts",
      `import { x } from "../lib/some module";
      export const ERRORS = { missing: "Please enter your shop domain", id: "cert-link-1" };
      export const label = (count: number) => \`\${count} records imported\`;`,
    );

    expect(messages).toEqual([
      "Please enter your shop domain",
      "{} records imported",
    ]);
    expect(banned(messages)).toEqual(messages);
  });

  it("reads one-word labels, but not log events, error messages or GraphQL documents", () => {
    const messages = messagesOf(
      "sample.ts",
      `export const LABELS = { selected: "Selected", synced: "Synced", kind: "photo", action: "UPSERT" };
      log.warn("mirror.failed", { reason: "Metaobject sync failed" });
      const failure = new Error("Metaobject sync failed");
      const stopped = new MirrorError("auth", "The metaobject handle is taken");
      const QUERY = \`#graphql
        query CoaSample { shop { name } }
      \`;`,
    );

    expect(messages).toEqual(["Selected", "Synced"]);
    expect(banned(messages)).toEqual(["Synced"]);
  });

  it("allows the app name only as the login page's h1", () => {
    const loginPage = `export default () => (
      <div>
        <h1>COA Manager</h1>
        <button>COA Manager</button>
      </div>
    );`;

    expect(copyOf(LOGIN_ROUTE, loginPage)).toEqual(["COA Manager"]);
    expect(copyOf("sample.tsx", loginPage)).toEqual([
      "COA Manager",
      "COA Manager",
    ]);
  });

  it("reads JSX text, copy attributes, child expressions and toasts, but not ids", () => {
    const copy = copyOf(
      "sample.tsx",
      `export const A = ({ busy }: { busy: boolean }) => (
        <s-page heading="Certificates">
          <s-button id="cert-link-1" icon="delete">{busy ? "Saving" : "Save"}</s-button>
          <s-text-field label={\`Signer \${1} name\`} error={busy ? "Enter a name." : undefined} />
          <s-text>Oops, the sync failed!</s-text>
          <s-button onClick={() => shopify.toast.show("Certificate saved successfully")}>Go</s-button>
          <s-table-cell>—</s-table-cell>
        </s-page>
      );`,
    );

    expect(copy).toEqual([
      "Certificates",
      "Saving",
      "Save",
      "Signer {} name",
      "Enter a name.",
      "Oops, the sync failed!",
      "Certificate saved successfully",
      "Go",
      "—",
    ]);
    expect(banned(copy)).toEqual([
      "Oops, the sync failed!",
      "Certificate saved successfully",
    ]);
  });
});
