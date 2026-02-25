import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["@prisma/client"],
              "message": "Use Prisma only inside infrastructure adapters."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/modules/**/application/**/*.ts", "src/shared/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["@prisma/client", "**/infrastructure/**"],
              "message": "Application layer must depend on ports, not infrastructure."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/modules/**/infrastructure/**/*.ts", "src/shared/infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": "off"
    }
  }
];
