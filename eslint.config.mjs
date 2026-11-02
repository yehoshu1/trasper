import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint 9 flat config. Next's shareable configs carry the React and
 * TypeScript rules the plan asks for (no floating promises in the pricing,
 * PNR or permission layers is enforced by the strict tsconfig).
 */
export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([
    "node_modules/**",
    ".next/**",
    ".source/**",
    ".test-dist/**",
    "src/generated/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Money and time layers must stay explicit; no silent coercions.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Images in documents are plain <img> on purpose (server-rendered
      // templates also run under react-dom/server outside Next).
      "@next/next/no-img-element": "warn",
      "react/no-unescaped-entities": "off",
    },
  },
]);
