/* The landing page's header climber.

   The header's background is a wall, and the page scrolls as any page does: the
   scroll position is read as a fractional move number, so the climber works up
   the route while the header scrolls away. Between two moves the figure is a
   joint-space blend of the two solved stances, exactly as the app's
   `lerpStickmanPose` blends them, eased with the app's `FocusEasing`
   (FastOutSlowIn) so the climber settles on each move rather than drifting
   through it.

   The stances are SOLVED by the app's own solver, never here: `beta.json` (and the
   cropped wall photo beside it) is written by
   `shared/src/jvmTest/.../WebsiteBetaExport.kt`. The drawing below is a
   transcription of `drawStickman` / `drawHead` in `ui/beta/Stickman.kt`, the same
   way `tools/figure-doc/figure.py` transcribes it. If the app's ink changes, this
   changes with it.

   Markup: a <canvas> inside the element carrying the data attribute.
     <section class="hero" data-scroll-beta="/assets/scroll-beta/beta.json">
       <canvas class="hero-wall" aria-hidden="true"></canvas>
       ...
     </section>
*/
(function () {
  "use strict";

  // ---- the app's ink (Stickman.kt, Theme.kt's Limb.color) ----
  var CASING = "rgba(33, 38, 46, 0.902)";   // 0xE621262E
  var BODY = "#D8DCE3";
  var HAIR = "#21262E";
  var LH = "#E4572E", RH = "#2E86AB", LF = "#F3A712", RF = "#3BAA57";
  var CASING_RATIO = 1.7;                   // STICKMAN_CASING_RATIO

  // Each move takes this much scroll...
  var PX_PER_MOVE = 60;
  // ...unless the climb would then still be going when this much of the wall (the
  // canvas's bottom edge, measured from the top of the page) has scrolled away, or the
  // page has less scroll than that; then the climb is squeezed to fit.
  var CLIMB_OVER_WALL = 0.7;
  var BACKGROUND = "#191817";   // the header's own, for the wall's faded edge
  // The camera never shows less wall than this, in body heights, so the climber
  // always fits: on a header wider than the photo the wall stops covering it.
  var MIN_VIEW_BODY_HEIGHTS = 1.6;
  // ...and never more than this, so a wide header zooms in on the climber and pans
  // with them rather than showing a doll on a cliff.
  var MAX_VIEW_BODY_HEIGHTS = 3.2;

  // ---- FastOutSlowIn = cubic-bezier(0.4, 0, 0.2, 1), Compose's FocusEasing ----
  function bezier(x1, y1, x2, y2) {
    function a(p1, p2) { return 1 - 3 * p2 + 3 * p1; }
    function b(p1, p2) { return 3 * p2 - 6 * p1; }
    function c(p1) { return 3 * p1; }
    function at(t, p1, p2) { return ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t; }
    function slope(t, p1, p2) { return 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var s = slope(t, x1, x2);
        if (Math.abs(s) < 1e-6) break;
        t -= (at(t, x1, x2) - x) / s;
      }
      return at(Math.min(1, Math.max(0, t)), y1, y2);
    };
  }
  var ease = bezier(0.4, 0, 0.2, 1);

  // ---- lerpStickmanPose ----
  var POINTS = ["head", "neck", "pelvis", "shoulderL", "shoulderR", "elbowL", "elbowR",
    "handL", "handR", "hipL", "hipR", "kneeL", "kneeR", "footL", "footR"];

  function lerpPose(a, b, t) {
    var out = {};
    POINTS.forEach(function (k) {
      out[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
    });
    out.headR = a.headR + (b.headR - a.headR) * t;
    // Nothing to blend: the head turns and a grip dot changes joint at halfway,
    // and the grips are the destination's (as in the app).
    out.facingViewer = t < 0.5 ? a.facingViewer : b.facingViewer;
    out.legAnchors = t < 0.5 ? a.legAnchors : b.legAnchors;
    out.grips = b.grips;
    return out;
  }

  // ---- camera: cover the header with the wall, and follow the climber along the
  // axis the wall overflows it on, never past the wall's edge ----
  function centreOf(pose) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    POINTS.forEach(function (k) {
      var p = pose[k];
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  // How much the camera magnifies: cover the canvas with the wall, within the body-
  // height bounds above.
  function viewScale(wall, w, h, bodyHeight) {
    var scale = Math.max(w / (wall.r - wall.l), h / (wall.b - wall.t),
      Math.min(w, h) / (MAX_VIEW_BODY_HEIGHTS * bodyHeight));
    return Math.min(scale, Math.min(w, h) / (MIN_VIEW_BODY_HEIGHTS * bodyHeight));
  }

  // Where the climber's centre should land, in canvas pixels `at`; the wall's edge wins
  // over it. `overhang` is how much of the canvas, as a fraction of its width, may lie
  // past the wall's LEFT edge (--wall-overhang): on a wide screen that side is under
  // the scrim. `above` is how many canvas pixels at the top may lie past the wall's top
  // edge: the part of the canvas already scrolled off the screen, where nobody sees it.
  function camera(wall, pose, w, h, scale, at, overhang, above) {
    var c = centreOf(pose);
    function clamp(v, lo, hi) { return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)); }
    var hw = w / 2 / scale, hh = h / 2 / scale;
    return {
      cx: clamp(c[0] + (w / 2 - at[0]) / scale, wall.l + hw - overhang * w / scale, wall.r - hw),
      cy: clamp(c[1] + (h / 2 - at[1]) / scale, wall.t + hh - above / scale, wall.b - hh),
    };
  }

  // ---- drawStickman ----
  function drawFigure(ctx, pose, toScreen, scale, bodyHeight) {
    function s(k) { return toScreen(pose[k]); }
    var core = Math.max(0.032 * bodyHeight * scale, 2.5);   // stickmanStrokeWidth
    var casing = core * CASING_RATIO;
    var lines = {                                           // StickmanLines
      legL: ["hipL", "kneeL", "footL"], legR: ["hipR", "kneeR", "footR"],
      hips: ["hipL", "hipR"], torso: ["pelvis", "neck"],
      shoulders: ["shoulderL", "shoulderR"],
      armL: ["shoulderL", "elbowL", "handL"], armR: ["shoulderR", "elbowR", "handR"],
    };
    function poly(names, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      names.forEach(function (n, i) {
        var p = s(n);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();
    }
    // All casings first so the joints merge into one silhouette, then cores.
    ["legL", "legR", "hips", "torso", "shoulders", "armL", "armR"].forEach(function (k) {
      poly(lines[k], CASING, casing);
    });
    poly(lines.legL, LF, core);
    poly(lines.legR, RF, core);
    poly(lines.hips, BODY, core);
    poly(lines.torso, BODY, core);
    poly(lines.shoulders, BODY, core);
    poly(lines.armL, LH, core);
    poly(lines.armR, RH, core);

    drawHead(ctx, pose, s, pose.headR * scale, (casing - core) / 2);

    function dot(p, color) {
      ctx.fillStyle = CASING;
      ctx.beginPath(); ctx.arc(p[0], p[1], core * 1.15, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p[0], p[1], core * 0.8, 0, 2 * Math.PI); ctx.fill();
    }
    var g = pose.grips, anchors = pose.legAnchors || ["FOOT", "FOOT"];
    if (g[0]) dot(s("handL"), LH);
    if (g[1]) dot(s("handR"), RH);
    if (g[2]) dot(s(anchors[0] === "KNEE" ? "kneeL" : "footL"), LF);
    if (g[3]) dot(s(anchors[1] === "KNEE" ? "kneeR" : "footR"), RF);
  }

  // ---- drawHead ----
  function drawHead(ctx, pose, s, r, rimW) {
    var c = s("head"), neck = s("neck"), hl = s("handL"), hr = s("handR");
    var facing = pose.facingViewer;
    ctx.fillStyle = facing ? BODY : HAIR;
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 2 * Math.PI); ctx.fill();
    ctx.lineWidth = rimW * 1.7; ctx.strokeStyle = CASING; ctx.stroke();
    ctx.lineWidth = rimW; ctx.strokeStyle = BODY; ctx.stroke();
    if (!facing) return;
    var ux = c[0] - neck[0], uy = c[1] - neck[1];
    var ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    var sx = -uy, sy = ux;
    var gx = (hl[0] + hr[0]) / 2 - c[0], gy = (hl[1] + hr[1]) / 2 - c[1];
    var gl = Math.hypot(gx, gy);
    var lx = gl < 1e-3 ? 0 : gx / gl * r * 0.10, ly = gl < 1e-3 ? 0 : gy / gl * r * 0.10;
    var eyeR = Math.max(r * 0.19, 1.2);
    ctx.fillStyle = HAIR;
    [-1, 1].forEach(function (d) {
      ctx.beginPath();
      ctx.arc(c[0] + ux * r * 0.12 + sx * d * r * 0.30 + lx,
              c[1] + uy * r * 0.12 + sy * d * r * 0.30 + ly, eyeR, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  // ---- the header ----
  function mount(header) {
    var canvas = header.querySelector("canvas");
    var ctx = canvas.getContext("2d");
    var url = header.getAttribute("data-scroll-beta");
    var base = url.replace(/[^/]*$/, "");
    var data = null, photo = null, wall = null, queued = false;

    function progress(moves) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var wallBottom = canvas.getBoundingClientRect().bottom + window.scrollY;
      var span = Math.min(max, wallBottom * CLIMB_OVER_WALL, moves * PX_PER_MOVE);
      return span <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / span));
    }

    function draw() {
      queued = false;
      if (!data) return;
      var ticks = data.ticks, n = ticks.length;
      var f = progress(n - 1) * (n - 1);
      var i = n < 2 ? 0 : Math.min(n - 2, Math.floor(f));
      var t = n < 2 ? 0 : ease(f - i);
      var a = ticks[i], b = ticks[Math.min(n - 1, i + 1)];
      var pose = lerpPose(a.pose, b.pose, t);

      var dpr = window.devicePixelRatio || 1;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var style = getComputedStyle(canvas);
      var at = [parseFloat(style.getPropertyValue("--climber-x")) || 0.5,
                parseFloat(style.getPropertyValue("--climber-y")) || 0.5];
      var overhang = parseFloat(style.getPropertyValue("--wall-overhang")) || 0;
      var scale = viewScale(wall, w, h, data.bodyHeight);
      // Keep the climber inside the part of the canvas still on screen, so they are seen
      // to the last move while the header scrolls away. Moving them up the canvas as it
      // leaves pans the wall down, so the wall itself seems to scroll a little slower.
      var r = canvas.getBoundingClientRect();
      var bandTop = Math.max(0, -r.top), bandBottom = Math.min(h, window.innerHeight - r.top);
      var margin = 0.75 * data.bodyHeight * scale;
      var y = at[1] * h;
      y = bandBottom - bandTop < 2 * margin ? (bandTop + bandBottom) / 2
        : Math.min(bandBottom - margin, Math.max(bandTop + margin, y));
      var cam = camera(wall, pose, w, h, scale, [at[0] * w, y], overhang, bandTop);
      function toScreen(p) { return [(p[0] - cam.cx) * scale + w / 2, (p[1] - cam.cy) * scale + h / 2]; }

      if (photo) {
        drawPhoto(ctx, data.photo, photo, toScreen, scale);
        // Past the wall's left edge (only where --wall-overhang allows it): the header's
        // own background, and the photo fading into it rather than stopping on a line.
        var edge = toScreen([wall.l, 0])[0];
        if (edge > 0) {
          var fade = Math.min(160, w * 0.15);
          var g = ctx.createLinearGradient(edge, 0, edge + fade, 0);
          g.addColorStop(0, BACKGROUND); g.addColorStop(1, "rgba(25, 24, 23, 0)");
          ctx.fillStyle = BACKGROUND; ctx.fillRect(0, 0, edge, h);
          ctx.fillStyle = g; ctx.fillRect(edge, 0, fade, h);
        }
      }
      drawFigure(ctx, pose, toScreen, scale, data.bodyHeight);
    }

    function drawPhoto(ctx, spec, img, toScreen, scale) {
      // The crop's centre and size in the world, turned clockwise about its centre.
      var c = toScreen([spec.centerX, spec.centerY]);
      var ww = spec.worldWidth * scale, wh = spec.worldHeight * scale;
      ctx.save();
      ctx.globalAlpha = spec.alpha;
      ctx.translate(c[0], c[1]);
      ctx.rotate(spec.rotation * Math.PI / 180);
      ctx.drawImage(img, -ww / 2, -wh / 2, ww, wh);
      ctx.restore();
    }

    function request() {
      if (!queued) { queued = true; requestAnimationFrame(draw); }
    }

    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ticks || !d.ticks.length) return;
      data = d;
      // What the camera may show: the photo's crop (axis-aligned bounds), else the moves.
      var p = d.photo;
      if (p) {
        var rad = p.rotation * Math.PI / 180;
        var ex = (Math.abs(Math.cos(rad)) * p.worldWidth + Math.abs(Math.sin(rad)) * p.worldHeight) / 2;
        var ey = (Math.abs(Math.sin(rad)) * p.worldWidth + Math.abs(Math.cos(rad)) * p.worldHeight) / 2;
        wall = { l: p.centerX - ex, r: p.centerX + ex, t: p.centerY - ey, b: p.centerY + ey };
        var img = new Image();
        img.onload = function () { photo = img; header.classList.add("has-wall"); request(); };
        img.src = base + p.file;
      } else {
        var m = d.moves, pad = d.bodyHeight;
        wall = { l: m[0] - pad, t: m[1] - pad, r: m[2] + pad, b: m[3] + pad };
      }
      request();
    }).catch(function () { /* the header stands without its climber */ });

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
  }

  document.querySelectorAll("[data-scroll-beta]").forEach(mount);
})();
