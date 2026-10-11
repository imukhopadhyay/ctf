import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "challenges/**",
      "storage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react/no-danger": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name='$queryRawUnsafe']", message: "Use parameterized $queryRaw." },
        { selector: "CallExpression[callee.property.name='$executeRawUnsafe']", message: "Use parameterized $executeRaw." },
      ],
    },
  },
];

export default config;
