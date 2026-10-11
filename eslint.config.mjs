import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Leading underscore marks a value that is intentionally unused (e.g. omitted when destructuring).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-desktop/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "loop-v5/**",
    "drizzle/**",
    "coverage/**",
    // Desktop build output and its own packages (desktop/src and desktop/scripts are linted).
    "desktop/node_modules/**",
    "desktop/dist/**",
    "desktop/app/**",
    "desktop/release/**",
  ]),
]);

export default eslintConfig;
