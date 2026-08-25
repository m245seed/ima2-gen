import { useState } from "react";
import { useI18n } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { useOAuthStatus } from "../hooks/useOAuthStatus";
import { useKeyStatus } from "../hooks/useKeyStatus";
import { useModalFocus } from "../hooks/useModalFocus";

const DISMISS_KEY = "ima2.onboardingDismissed";

// First-run welcome popup. Shows only when OAuth and API credentials are
// both unavailable, and only until the user dismisses it once.
export function OnboardingPopup() {
  const { t } = useI18n();
  const openSettings = useAppStore((s) => s.openSettings);
  const oauth = useOAuthStatus();
  const { data: keyStatus } = useKeyStatus();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Only decide once every status has loaded — avoid a flash while null/loading.
  const loaded = oauth !== null && keyStatus != null;
  const oauthUnauth = oauth?.status === "auth_required" || oauth?.status === "offline";
  const apiUnauth = !keyStatus?.openai?.configured;
  const allUnauthenticated = loaded && oauthUnauth && apiUnauth;
  const open = !dismissed && allUnauthenticated;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore storage errors */
    }
    setDismissed(true);
  };

  const goLogin = () => {
    dismiss();
    openSettings("providers");
  };
  const modalRef = useModalFocus<HTMLDivElement>(open, dismiss);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
      >
        <div id="onboarding-title" className="modal__title">
          {t("onboarding.title")}
        </div>
        <div className="modal__body">
          <p>{t("onboarding.body")}</p>
        </div>
        <div className="modal__actions">
          <button type="button" className="modal__btn modal__btn--secondary" onClick={dismiss} data-modal-initial-focus>
            {t("onboarding.skip")}
          </button>
          <button type="button" className="modal__btn" onClick={goLogin}>
            {t("onboarding.login")}
          </button>
        </div>
      </div>
    </div>
  );
}
