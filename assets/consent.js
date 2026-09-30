// Google Analytics on this site's own pages, and only once Google's consent tool has
// answered (S300). The web app at /app/ does the same in web/…/ads/WebAdConsent.kt and
// web/…/analytics/WebAnalytics.kt, and this file keeps the same rules on purpose,
// because the pages and the app are one site with one consent answer:
//
//  * Only on the live host. Anywhere else (a local `jekyll serve`) nothing loads at
//    all: Analytics has no test hit, so every preview would count the owner.
//  * Funding Choices first, gtag.js after. Inside the EEA, the UK and Switzerland only
//    when TCF purposes 1 (store on a device) and 8 (measure content performance) are
//    both consented; outside them, once the tool says no consent is owed. A tool that
//    failed to load or never answered is a NO, because silence is not consent.
//  * Google signals and ad personalisation off in the tag, and the three advertising
//    consent signals denied: this tag counts pages and nothing else.
//
// Funding Choices keeps the answer in its own cookie for this site, so a reader who
// answers here is not asked again in the app, and the other way round.
//
// The two ids are the app's own: tools/website/make_pages.py reads them out of
// WebAdIds.kt and WebAnalytics.kt into this <script> tag's data attributes, so the
// pages and the app cannot name different accounts. Either one empty, nothing loads.
(function () {
  var tag = document.currentScript;
  var client = tag && tag.dataset.client;
  var measurementId = tag && tag.dataset.measurementId;
  if (!client || !measurementId) return;
  var host = location.hostname;
  if (host !== 'brokencrimp.com' && !/\.brokencrimp\.com$/.test(host)) return;

  // How long to wait for the consent tool before deciding it will not answer. The
  // app's READY_TIMEOUT_MS, for the app's reason: a blocker and a broken tool are the
  // same silence, and on this page both mean no Analytics. It stops the moment the
  // message is on screen, because a reader still reading it has not answered yet.
  var TIMEOUT_MS = 8000;
  var timer = 0;

  var settled = false;
  function done(gdprApplies, measure) {
    if (settled) return;
    settled = true;
    if (gdprApplies) showChoices();
    if (measure) loadGtag();
  }
  // Analytics may measure: out of scope, or both purposes consented.
  function measureOf(tc) {
    return !tc.gdprApplies ||
      !!(tc.purpose && tc.purpose.consents && tc.purpose.consents[1] && tc.purpose.consents[8]);
  }

  // Where a consent message applies, the footer offers it back, which is how the
  // privacy policy tells a reader on these pages to change their answer.
  function showChoices() {
    var button = document.getElementById('privacy-choices');
    if (!button) return;
    button.hidden = false;
    button.addEventListener('click', function () {
      var fc = window.googlefc;
      if (fc && typeof fc.showRevocationMessage === 'function') fc.showRevocationMessage();
    });
  }

  function loadGtag() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(script);
  }

  // Google's documented presence signal: the message frame looks for it.
  if (!window.frames['googlefcPresent']) {
    var frame = document.createElement('iframe');
    frame.style = 'width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px';
    frame.style.display = 'none';
    frame.name = 'googlefcPresent';
    document.body.appendChild(frame);
  }

  var cmp = document.createElement('script');
  cmp.async = true;
  cmp.src = 'https://fundingchoicesmessages.google.com/i/' + client + '?ers=1';
  cmp.addEventListener('error', function () { done(false, false); });
  document.head.appendChild(cmp);

  // The TCF API is installed by the tool, so poll briefly for it. `cmpuishown` is the
  // message on screen: not an answer, and the reason to stop the timer.
  var waitForTcf = window.setInterval(function () {
    if (settled) { window.clearInterval(waitForTcf); return; }
    if (typeof window.__tcfapi !== 'function') return;
    window.clearInterval(waitForTcf);
    window.__tcfapi('addEventListener', 2, function (tcData, success) {
      if (!success || !tcData) return;
      if (tcData.eventStatus === 'cmpuishown') window.clearTimeout(timer);
      if (tcData.eventStatus === 'tcloaded' || tcData.eventStatus === 'useractioncomplete') {
        done(tcData.gdprApplies, measureOf(tcData));
      }
    });
  }, 200);

  // No TC data is not always silence (S305). An inactive tool, which is what Google serves
  // while AdSense is still reviewing the site, has no data to give anyone, but its `ping`
  // still says whether this reader is in scope. Out of scope, no consent is owed, so that
  // is an answer; in scope, or no word either way, it stays a no.
  function measureFromPing() {
    window.__tcfapi('ping', 2, function (ping) {
      done(false, !!ping && ping.cmpLoaded === true && ping.gdprApplies === false);
    });
  }

  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
  window.googlefc.callbackQueue.push({
    'CONSENT_DATA_READY': function () {
      if (typeof window.__tcfapi === 'function') {
        window.__tcfapi('getTCData', 2, function (tcData, success) {
          if (success && tcData) done(tcData.gdprApplies, measureOf(tcData));
          else measureFromPing();
        });
      } else {
        done(false, true);
      }
    }
  });

  timer = window.setTimeout(function () { window.clearInterval(waitForTcf); done(false, false); }, TIMEOUT_MS);
})();
