import { user } from "./auth";

const _paq = (window._paq = window._paq || []);
_paq.push(["requireCookieConsent"]);
_paq.push(["setDocumentTitle", location.hostname + "/" + document.title]);
_paq.push(["setCookieDomain", "*.bedless.mester.info"]);
_paq.push(["setDomains", ["*.bedless.mester.info"]]);
_paq.push(["enableHeartBeatTimer"]);
_paq.push(["trackPageView"]);
_paq.push(["enableLinkTracking"]);
/* tracker methods like "setCustomDimension" should be called before "trackPageView" */
const userId = await user.then((user) => user?.userid);
const u = "//matomo.gedankenversichert.com/";
_paq.push(["setTrackerUrl", u + "matomo.php"]);
_paq.push(["setSiteId", "1"]);
if (userId) {
    _paq.push(["setUserId", userId]);
}
const d = document,
    g = d.createElement("script"),
    s = d.getElementsByTagName("script")[0];
g.async = true;
g.src = u + "matomo.js";
s.parentNode?.insertBefore(g, s);

let waitForTrackerCount = 0;
function matomoWaitForTracker() {
    if (typeof _paq === "undefined") {
        if (waitForTrackerCount < 40) {
            setTimeout(matomoWaitForTracker, 250);
            waitForTrackerCount++;
            return;
        }
    } else {
        document.addEventListener("cookieyes_consent_update", function (eventData: any) {
            const data = eventData.detail;
            consentSet(data);
        });
    }
}
function consentSet(data: any) {
    if (data.accepted.includes("analytics")) {
        _paq.push(["setCookieConsentGiven"]);
        _paq.push(["setConsentGiven"]);
    } else {
        _paq.push(["forgetCookieConsentGiven"]);
        _paq.push(["forgetConsentGiven"]);
    }
}
matomoWaitForTracker();
