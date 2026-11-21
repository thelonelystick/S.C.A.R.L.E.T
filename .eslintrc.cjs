module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@next/next/recommended"],
  env: { node: true, browser: true, es2022: true },
  rules: {
    "no-undef": "off",
    "no-unused-vars": "off",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-control-regex": "off",
  },
};
