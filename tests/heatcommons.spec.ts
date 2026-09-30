import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screenshotDir = resolve(process.cwd(), "artifacts/firefox");
mkdirSync(screenshotDir, { recursive: true });

async function openDashboard(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Find a cooler way through your day/i })).toBeVisible();
  await expect(page.locator(".weather-city")).toContainText("Kuala Lumpur");
  await expect(page.locator(".route-disclaimer")).not.toContainText("Loading mapped walking routes", { timeout: 45_000 });
  await expect(page.locator(".map-status")).toContainText(/\d+ listings|Sample places shown/, { timeout: 45_000 });
  await page.locator(".map-viewport").scrollIntoViewIfNeeded();
  const minLoadedTiles = await page.evaluate(() => window.innerWidth < 600 ? 3 : 6);
  await expect.poll(() => page.locator(".leaflet-tile-loaded").count(), { timeout: 20_000 }).toBeGreaterThan(minLoadedTiles);
}

test("desktop flow: map, routes, navigation, and local place notes", async ({ page }) => {
  await openDashboard(page);
  await page.screenshot({ path: resolve(screenshotDir, "desktop.png"), fullPage: true, animations: "disabled" });

  await expect(page.getByText(/LIVE LOCAL FORECAST|SAMPLE CONDITIONS/)).toBeVisible();
  await expect(page.getByRole("link", { name: /WHO heat guidance/ })).toHaveAttribute("href", /who\.int/);
  await expect(page.getByRole("link", { name: /Weather data/ })).toHaveAttribute("href", /open-meteo\.com/);
  await expect(page.getByRole("link", { name: /Map credits/ })).toHaveAttribute("href", /openstreetmap\.org\/copyright/);
  await expect(page.getByRole("link", { name: /Walking routes/ })).toHaveAttribute("href", /valhalla\.github\.io/);

  for (const [label, hash] of [["Explore map", "#map"], ["My heat plan", "#plan"], ["Heat guide", "#guidance"]]) {
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${hash.replace("#", "\\#")}$`));
  }
  await page.getByRole("link", { name: "HeatCommons home" }).click();
  await expect(page).toHaveURL(/#top$/);

  const citySelect = page.getByRole("combobox", { name: "Choose demo city" });
  await citySelect.selectOption("dehradun");
  await expect(page.locator(".weather-city")).toContainText("Dehradun");
  await expect(page.locator(".route-disclaimer")).not.toContainText("Loading mapped walking routes", { timeout: 45_000 });
  await citySelect.selectOption("kuala-lumpur");
  await expect(page.locator(".weather-city")).toContainText("Kuala Lumpur");

  for (const label of [/All places/, /Drinking water/, /Green space/, /Indoor public/]) {
    const filter = page.getByRole("button", { name: label }).first();
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: /Drinking water/ }).first().click();
  const waterMarker = page.locator('.leaflet-overlay-pane path.leaflet-interactive[fill="#4bafaa"]').first();
  await expect(waterMarker).toBeVisible();
  await waterMarker.click();
  await expect(page.locator(".selected-place-copy p")).toContainText(/water point|water availability/i);
  await page.getByRole("button", { name: /All places/ }).first().click();

  const placesToggle = page.locator(".map-toggle").filter({ hasText: "Places" });
  await placesToggle.click();
  await expect(placesToggle).toContainText("Off");
  await placesToggle.click();
  await expect(placesToggle).toContainText("On");

  const routeToggle = page.locator(".map-toggle").filter({ hasText: "Route" });
  await routeToggle.click();
  await expect(routeToggle).toContainText("Off");
  await routeToggle.click();
  await expect(routeToggle).toContainText("On");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Recenter map" }).click();

  const walkwayRoute = page.getByRole("tab", { name: /Mapped walkways/ });
  const shortestRoute = page.getByRole("tab", { name: /Shortest walk/ });
  await expect(walkwayRoute).toBeEnabled();
  await expect(shortestRoute).toBeEnabled();
  await expect(walkwayRoute).toContainText(/\d+ min/);
  await expect(shortestRoute).toContainText(/\d+ min/);
  await shortestRoute.click();
  await expect(shortestRoute).toHaveAttribute("aria-selected", "true");
  await walkwayRoute.click();
  await expect(walkwayRoute).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: /Add to today's plan/ }).click();
  await expect(page.locator(".toast-message")).toContainText("Route added to today's plan");

  await page.locator(".topbar-actions").getByRole("button", { name: "Add a place", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close report form" }).click();
  await expect(dialog).toBeHidden();

  await page.locator(".map-heading").getByRole("button", { name: "Add a place" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Place name").fill("Firefox test water point");
  await dialog.getByLabel("Helpful note").fill("Check this point before travelling.");

  for (const label of [/Green space/, /Drinking water/, /Indoor public place/, /Covered rest/]) {
    const kind = dialog.getByRole("button", { name: label });
    await kind.click();
    await expect(kind).toHaveAttribute("aria-pressed", "true");
  }
  const waterKind = dialog.getByRole("button", { name: "Drinking water" });
  await waterKind.click();

  await dialog.getByRole("button", { name: /Choose a point on the map/ }).click();
  await expect(page.locator(".pin-picker-banner")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /Choose a point on the map/ }).click();
  const mapBox = await page.locator(".map-viewport .leaflet-container").boundingBox();
  expect(mapBox).not.toBeNull();
  await page.locator(".map-viewport .leaflet-container").click({
    position: { x: mapBox!.width * 0.53, y: mapBox!.height * 0.52 },
  });

  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /Pin selected/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Save local update" }).click();
  await expect(page.locator(".toast-message")).toContainText("Update saved on this device");
  await expect(page.locator(".selected-place-meta")).toContainText("YOUR LOCAL REPORT");
  await expect(page.locator(".selected-place-copy h3")).toHaveText("Firefox test water point");
  await expect(page.locator(".selected-place-copy p")).toContainText("Check this point before travelling");
  await page.getByRole("button", { name: /Add to plan/ }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  const storedNotes = await page.evaluate(() => JSON.parse(localStorage.getItem("heatcommons:local-spots:v1") ?? "[]"));
  expect(storedNotes).toHaveLength(1);
  expect(storedNotes[0].title).toBe("Firefox test water point");
});

test("mobile layout renders without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await page.screenshot({ path: resolve(screenshotDir, "mobile.png"), fullPage: true, animations: "disabled" });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.locator(".topbar-actions").getByRole("button", { name: "Add a place", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Mapped walkways/ })).toBeVisible();
});
