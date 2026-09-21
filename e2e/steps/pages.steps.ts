// Visitor-language steps for opening pages and asserting what renders.
import { Given, Then } from "@cucumber/cucumber";
import { expect } from "../support/expect";
import { escapeRegExp } from "../support/utils";
import type { BrowserWorld } from "../support/world";

const NOT_FOUND_HEADING = "Page Not Found";

Given("I open {string}", async function (this: BrowserWorld, path: string) {
  await this.visit(path);
});

Then("I see the site title", async function (this: BrowserWorld) {
  await expect(this.page).toHaveTitle(/GrowGen/);
});

Then("I see the page title {string}", async function (this: BrowserWorld, expected: string) {
  await expect(this.page).toHaveTitle(new RegExp(escapeRegExp(expected), "i"));
});

Then("I see {string}", async function (this: BrowserWorld, text: string) {
  await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible();
});

Then("I see the heading {string}", async function (this: BrowserWorld, heading: string) {
  // Post pages render the title twice (sticky menu header + content h1).
  await expect(this.page.getByRole("heading", { name: heading }).first()).toBeVisible();
});

Then("I do not see the not-found page", async function (this: BrowserWorld) {
  await expect(this.page.getByText(NOT_FOUND_HEADING)).toHaveCount(0);
});

Then("I see the not-found page", async function (this: BrowserWorld) {
  await expect(this.page.getByRole("heading", { name: NOT_FOUND_HEADING })).toBeVisible();
});

Then("the response status is {int}", async function (this: BrowserWorld, status: number) {
  expect(this.lastResponse, "no navigation response was recorded").not.toBeNull();
  expect(this.lastResponse!.status()).toBe(status);
});
