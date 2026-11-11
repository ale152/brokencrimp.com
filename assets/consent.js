

(function () {
  var tag = document.currentScript;
  var client = tag && tag.dataset.client;
  var measurementId = tag && tag.dataset.measurementId;
  if (!client || !measurementId) return;
  var host = location.hostname;
  if (host !== 'brokencrimp.com' && !/\.brokencrimp\.com$/.test(host)) return;

  var TIMEOUT_MS = 8000;
  var timer = 0;

  var settled = false;
  function done(gdprApplies, measure) {
    if (settled) return;
    settled = true;
    if (gdprApplies) showChoices();
    if (measure) loadGtag();
  }
  
  function measureOf(tc) {
    return !tc.gdprApplies ||
      !!(tc.purpose && tc.purpose.consents && tc.purpose.consents[1] && tc.purpose.consents[8]);
  }

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
