import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const quota = read("ui/src/components/settings/QuotaCard.tsx");
const apiKey = read("ui/src/components/ApiKeyInput.tsx");

const locales = ["en", "ko", "zh-Hant", "zh-Hans"].map((locale) => JSON.parse(read(`ui/src/i18n/${locale}.json`)));

describe("settings i18n state contract", () => {
  it("localizes every account-switch phase and copied state", () => {
    for (const phase of ["idle", "starting", "waiting", "complete", "error"]) {
      assert.match(quota, new RegExp(`state\\.phase === "${phase}"`));
    }
    for (const key of [
      "switchAccount", "startingLogin", "enterCode", "retry", "copyLink", "copied",
      "waitingApproval", "switchComplete", "switchFailed", "tryAgain", "codexNotLoggedIn",
    ]) {
      assert.match(quota, new RegExp(`settings\\.quota\\.${key}`), `QuotaCard missing ${key}`);
    }
    assert.doesNotMatch(quota, /Starting login|Enter this code|Waiting for approval|Switch failed|Try again|Not logged in/);
  });

  it("localizes API key failure/configured branches", () => {
    assert.match(apiKey, /settings\.apiKeys\.saveFailed/, "ApiKeyInput missing save fallback");
    assert.match(apiKey, /settings\.apiKeys\.networkError/, "ApiKeyInput missing network fallback");
    assert.match(apiKey, /settings\.apiKeys\.removeFailed/, "ApiKeyInput missing remove fallback");
    assert.doesNotMatch(apiKey, /Failed to save|Network error|Failed to remove/);
  });


  it("keeps every new settings key symmetric across locales", () => {
    for (const locale of locales) {
      for (const key of [
        "switchAccount", "startingLogin", "enterCode", "retry", "copyLink", "copied",
        "waitingApproval", "switchComplete", "switchFailed", "tryAgain",
      ]) assert.equal(typeof locale.settings.quota[key], "string", `settings.quota.${key}`);
      for (const key of ["saveFailed", "networkError", "removeFailed", "configuredReplace"]) {
        assert.equal(typeof locale.settings.apiKeys[key], "string", `settings.apiKeys.${key}`);
      }
    }
  });
});
