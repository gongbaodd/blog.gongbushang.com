// Cucumber configuration for the E2E suite.
// https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md
export default {
  paths: ["e2e/features/**/*.feature"],
  // tsx registration must come before any TypeScript support/step files.
  import: ["./e2e/tsx-register.mjs", "e2e/support/**/*.ts", "e2e/steps/**/*.ts"],
  format: [
    "progress",
    ["html", "e2e-results/cucumber-report.html"],
    ["junit", "e2e-results/junit.xml"],
  ],
  // Serial first: parallel workers are only enabled after scenario isolation
  // has been proven (fresh browser context per scenario in the Before hook).
  parallel: 0,
};
