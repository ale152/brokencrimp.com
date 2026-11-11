 
(function () {
  "use strict";

  var STOP = 1.5, HOLD_ENDS = 2.4;

  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function setUp(box) {
    var video = null, hovering = false;

    function drop() {
      if (video) video.remove();
      video = null;
    }

    function load() {
      if (video) return;
      video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("aria-hidden", "true");
      video.preload = "auto";
      video.style.visibility = "hidden";
      function show() { if (video) video.style.visibility = ""; }
      video.addEventListener("loadeddata", show);
      video.addEventListener("playing", show);
      video.addEventListener("error", drop);
      video.addEventListener("timeupdate", function () {
        if (!hovering && inHold()) video.pause();
      });
      video.src = box.dataset.clip + "#t=0.001";
      box.appendChild(video);
    }

    function inHold() {
      return video.currentTime >= STOP && video.currentTime < HOLD_ENDS - 0.1;
    }

    function play() {
      load();
      var started = video.play();
      if (started) started.catch(drop);
    }

    box.addEventListener("pointerenter", function (e) {
      if (e.pointerType !== "mouse") return;
      hovering = true;
      load();

      if (video.paused && inHold()) video.currentTime = HOLD_ENDS;
      play();
    });
    box.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "mouse") hovering = false;
    });
    box.addEventListener("click", function () {
      if (hovering) return;
      load();
      video.currentTime = 0;
      play();
    });

    new IntersectionObserver(function (entries, near) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        near.disconnect();
        load();
      }
    }, { rootMargin: "400px" }).observe(box);
    
    var ready = true;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) {
          ready = true;
          if (video) {
            video.pause();
            video.currentTime = 0;
          }
        } else if (ready && e.intersectionRatio >= 0.6) {
          ready = false;
          play();
        }
      });
    }, { threshold: [0, 0.6] }).observe(box);
  }

  document.querySelectorAll("[data-clip]").forEach(setUp);
})();
