// Registers tsx so Cucumber's ESM loader can import TypeScript support/step files.
// See: https://github.com/cucumber/cucumber-js/blob/main/docs/transpiling.md#esm
import { register } from "tsx/esm/api";

register();
