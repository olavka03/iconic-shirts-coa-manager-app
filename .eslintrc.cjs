// Layers (spec §4.1) on the feature-first tree. eslint-plugin-import matches glob zones with minimatch
// without `dot`, so every zone that reaches into app/.server uses plain paths, and a zone's `from` is
// either all globs or all paths.
const UI = [
  "./app/features/*/components/**",
  "./app/features/*/hooks/**",
  "./app/shared/components/**",
  "./app/shared/hooks/**",
];
const PURE = [
  "./app/features/*/constants/**",
  "./app/features/*/reducers/**",
  "./app/features/*/schemas/**",
  "./app/features/*/types/**",
  "./app/features/*/utils/**",
  "./app/shared/constants/**",
  "./app/shared/types/**",
  "./app/shared/utils/**",
];
const SERVER = "./app/.server";
const DB = "./app/.server/db";
const LOGGING = "./app/.server/logging";
const SHOPIFY = "./app/.server/shopify";
const GATEWAYS = "./app/.server/gateways";
const REPOSITORIES = "./app/.server/repositories";
const SERVICES = "./app/.server/services";
const JOBS = "./app/.server/jobs";
const ROUTES = "./app/routes";
const feature = (name) => `./app/features/${name}`;

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  ignorePatterns: [
    "!**/.server",
    "!**/.client",
    "!.graphqlrc.ts",
    "app/types/**",
    "build/**",
  ],

  extends: ["eslint:recommended"],
  rules: {
    "no-var": "error",
    "prefer-const": ["error", { destructuring: "all" }],
    curly: ["error", "all"],
    "id-length": ["error", { min: 2, properties: "never", exceptions: [] }],
    "padding-line-between-statements": [
      "error",
      {
        blankLine: "always",
        prev: "*",
        next: ["if", "for", "while", "do", "switch", "try", "return"],
      },
      {
        blankLine: "always",
        prev: ["if", "for", "while", "do", "switch", "try"],
        next: "*",
      },
    ],
  },

  overrides: [
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      plugins: ["react", "jsx-a11y"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
      ],
      settings: {
        react: {
          version: "detect",
        },
        formComponents: ["Form"],
        linkComponents: [
          { name: "Link", linkAttribute: "to" },
          { name: "NavLink", linkAttribute: "to" },
        ],
        "import/resolver": {
          typescript: {},
        },
      },
      rules: {
        // App Bridge attributes on the native <button>s inside SaveBar.
        "react/no-unknown-property": [
          "error",
          { ignore: ["variant", "loading"] },
        ],
      },
    },

    {
      files: ["**/*.{ts,tsx}"],
      plugins: ["@typescript-eslint", "import"],
      parser: "@typescript-eslint/parser",
      settings: {
        "import/internal-regex": "^~/",
        "import/resolver": {
          node: {
            extensions: [".ts", ".tsx"],
          },
          typescript: {
            alwaysTryTypes: true,
          },
        },
      },
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "plugin:import/typescript",
      ],
      rules: {
        // eslint-import-resolver-typescript ignores rootDirs, so the generated route types don't resolve.
        "import/no-unresolved": ["error", { ignore: ["^\\./\\+types/"] }],
      },
    },

    {
      files: [
        ".eslintrc.cjs",
        "vite.config.{js,ts}",
        ".graphqlrc.{js,ts}",
        "app/.server/**/*.{ts,tsx}",
        "app/entry.server.tsx",
      ],
      env: {
        node: true,
      },
    },
    {
      files: [
        "scripts/**",
        "tests/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "vitest.config.ts",
      ],
      env: {
        node: true,
      },
    },

    // Layers. Production files only: tests may import fakes and fixtures.
    {
      files: ["app/**/*.{ts,tsx}"],
      excludedFiles: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "import/no-restricted-paths": [
          "error",
          {
            zones: [
              {
                target: PURE,
                from: UI,
                message:
                  "Pure modules (utils, types, schemas, constants, reducers) never import UI (spec §4.1).",
              },
              {
                target: PURE,
                from: [SERVER, ROUTES],
                message:
                  "Pure modules are isomorphic: no app/.server and no routes (spec §4.1).",
              },
              {
                target: UI,
                from: [SERVER, ROUTES],
                message:
                  "UI imports pure modules, components and hooks only (spec §4.1).",
              },
              {
                target: GATEWAYS,
                from: [
                  DB,
                  LOGGING,
                  SHOPIFY,
                  REPOSITORIES,
                  SERVICES,
                  JOBS,
                  ROUTES,
                ],
                message:
                  "Gateways import pure modules and app/types only (spec §4.1).",
              },
              {
                target: GATEWAYS,
                from: UI,
                message:
                  "Gateways import pure modules and app/types only (spec §4.1).",
              },
              {
                target: REPOSITORIES,
                from: [GATEWAYS, SHOPIFY, SERVICES, JOBS, ROUTES],
                message:
                  "Repositories import pure modules, db and logging only (spec §4.1).",
              },
              {
                target: REPOSITORIES,
                from: UI,
                message:
                  "Repositories import pure modules, db and logging only (spec §4.1).",
              },
              {
                target: SERVICES,
                from: [SHOPIFY, JOBS, ROUTES],
                message:
                  "Services import repositories, gateways, pure modules, db and logging (spec §4.1).",
              },
              {
                target: SERVICES,
                from: UI,
                message:
                  "Services import repositories, gateways, pure modules, db and logging (spec §4.1).",
              },
              {
                target: JOBS,
                from: [ROUTES],
                message: "Jobs never import UI or routes (spec §4.1).",
              },
              {
                target: JOBS,
                from: UI,
                message: "Jobs never import UI or routes (spec §4.1).",
              },
              {
                target: [DB, LOGGING],
                from: [
                  SHOPIFY,
                  GATEWAYS,
                  REPOSITORIES,
                  SERVICES,
                  JOBS,
                  ROUTES,
                  "./app/features",
                  "./app/shared",
                ],
                message: "db and logging are leaves.",
              },
              {
                target: DB,
                from: LOGGING,
                message: "db and logging are leaves.",
              },
              {
                target: LOGGING,
                from: DB,
                message: "db and logging are leaves.",
              },
              {
                target: SHOPIFY,
                from: [REPOSITORIES, SERVICES, JOBS, ROUTES],
                message:
                  "app/.server/shopify imports db, gateways and pure modules only.",
              },
              {
                target: SHOPIFY,
                from: UI,
                message:
                  "app/.server/shopify imports db, gateways and pure modules only.",
              },
              {
                target: "./app/shared",
                from: "./app/features",
                message: "shared never imports a feature.",
              },
              {
                target: feature("signers"),
                from: [
                  feature("certificates"),
                  feature("codes"),
                  feature("media"),
                  feature("orders"),
                ],
                message: "Feature DAG: signers imports shared only.",
              },
              {
                target: feature("media"),
                from: [
                  feature("certificates"),
                  feature("codes"),
                  feature("orders"),
                  feature("signers"),
                ],
                message: "Feature DAG: media imports shared only.",
              },
              {
                target: feature("orders"),
                from: [
                  feature("certificates"),
                  feature("codes"),
                  feature("media"),
                  feature("signers"),
                ],
                message: "Feature DAG: orders imports shared only.",
              },
              {
                target: feature("codes"),
                from: [feature("certificates"), feature("media")],
                message:
                  "Feature DAG: codes imports orders, signers and shared.",
              },
              {
                target: ROUTES,
                from: ROUTES,
                except: ["./auth/login.module.css"],
                message:
                  "A route module never imports another route module: its non-server exports stay in the client build.",
              },
              {
                target: "./app",
                from: ["./scripts", "./tests"],
                message: "app/ never imports scripts/ or tests/.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "app/routes/app/**/*.tsx",
        "app/features/**/*.{ts,tsx}",
        "app/shared/**/*.{ts,tsx}",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "react-router",
                importNames: [
                  "useFetcher",
                  "Form",
                  "useSubmit",
                  "useActionData",
                ],
                message:
                  "UI routes have loaders only; mutations go through requestJson (app/shared/utils/json-request.utils.ts) to api.* routes (spec §5).",
              },
            ],
          },
        ],
      },
    },
  ],
  globals: {
    shopify: "readonly",
  },
};
