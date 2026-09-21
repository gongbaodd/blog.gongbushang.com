// Steps for the header search journey (Spotlight dialog over a client-side
// mini-search index). Waiting is keyed to the dialog, the input and the
// rendered result — never to elapsed time.
import { Then, When } from "@cucumber/cucumber";
import { expect } from "../support/expect";
import { clickUntilPresent } from "../support/utils";
import type { BrowserWorld } from "../support/world";

// During the dialog's open transition the site can briefly mount a second
// Spotlight portal; the last one in the DOM is the one that receives pointer
// events, so scope every interaction to it.
const searchDialog = (page: BrowserWorld["page"]) => page.getByRole("dialog").last();

When("I open search from the header", async function (this: BrowserWorld) {
  // The desktop trigger reads "Search..." (plus the ⌘K hint); the icon-only
  // mobile trigger has no accessible name, so target the labelled one via its
  // lucide search icon (first match in DOM = the labelled desktop button).
  // The dialog only mounts after the click handler opens it, and the island
  // hydrates late — click on an interval until the dialog is present.
  await clickUntilPresent(
    this.page,
    "header button:has(svg.lucide-search)",
    "[role='dialog']",
    60_000,
  );
  await expect(searchDialog(this.page)).toBeVisible();
});

When("I search for {string}", async function (this: BrowserWorld, term: string) {
  const input = searchDialog(this.page).getByPlaceholder("Search...");
  await expect(input).toBeVisible();
  // Results are debounced (~200ms); the next assertion waits for them.
  await input.fill(term);
});

Then("I see a search result {string}", async function (this: BrowserWorld, title: string) {
  await expect(searchDialog(this.page).getByRole("button", { name: title })).toBeVisible();
});

When("I follow the search result {string}", async function (this: BrowserWorld, title: string) {
  const dialog = searchDialog(this.page);
  const input = dialog.getByPlaceholder("Search...");
  const action = dialog.getByRole("button", { name: title });

  // Spotlight highlights the top action; keyboard activation is a reliable
  // fallback when a re-render steals the pointer mid-click.
  try {
    await action.click({ timeout: 5_000 });
  } catch {
    await input.press("Enter");
  }
});
