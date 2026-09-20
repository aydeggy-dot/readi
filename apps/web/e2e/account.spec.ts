import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery staple";

/**
 * The account screen: downloading your data, and deleting the account. Deletion is irreversible
 * and the typed-word gate lives in the browser, so it is worth driving in a real one.
 */
test("export your data, then delete the account", async ({ page }) => {
  const email = uniqueEmail();

  await test.step("sign up and sign back in", async () => {
    await page.goto("/signup");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding\/profile$/);

    // The most-used flow in the product: the password just chosen actually works.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  await test.step("download the export", async () => {
    await page.goto("/profile/account");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^readi-data-\d{4}-\d{2}-\d{2}\.json$/);

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const exported = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      user: { email: string };
      consents: unknown[];
    };
    expect(exported.user.email).toBe(email);
  });

  await test.step("the typed word is required", async () => {
    await page.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("delete");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText("Type DELETE in capital letters.")).toBeVisible();
    await expect(page).toHaveURL(/\/profile\/account$/);
  });

  await test.step("delete, and then be refused a sign-in", async () => {
    await page.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("DELETE");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/account-deleted/);
    await expect(page.getByRole("heading", { name: "Your account will be deleted" })).toBeVisible();

    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/scheduled for deletion/)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
