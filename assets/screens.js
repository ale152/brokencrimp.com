// The feature videos: each one is fetched only when it first nears the screen, and
// plays only while it is on it. Without this script the poster still shows; a
// browser with no video draws the <img> inside. With reduced motion asked for,
// nothing plays by itself, but the play bar still does.
//
// Each video gets a small play bar (play/pause and a seekable progress line) that
// shows while the pointer is over the video, or while it has keyboard focus.
(function () {
  var videos = document.querySelectorAll('video[data-src]');
  if (!videos.length) return;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load(v) {
    if (!v.src) { v.src = v.dataset.src; v.preload = 'auto'; }
  }
  function play(v) {
    load(v);
    var p = v.play();
    if (p && p.catch) p.catch(function () {});   // autoplay refused: the poster stays
  }

  function playbar(v) {
    var bar = document.createElement('div');
    bar.className = 'playbar';
    bar.innerHTML =
      '<button type="button" class="playbar-btn" aria-label="Play"></button>' +
      '<div class="playbar-track" role="slider" tabindex="0" aria-label="Seek" ' +
      'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '<div class="playbar-fill"></div></div>';
    v.parentNode.appendChild(bar);
    var btn = bar.querySelector('.playbar-btn');
    var track = bar.querySelector('.playbar-track');
    var fill = bar.querySelector('.playbar-fill');

    function paint() {
      var f = v.duration ? v.currentTime / v.duration : 0;
      fill.style.width = (f * 100) + '%';
      track.setAttribute('aria-valuenow', Math.round(f * 100));
    }
    function state() {
      var playing = !v.paused;
      btn.classList.toggle('is-playing', playing);
      btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    (function tick() { if (!v.paused) paint(); requestAnimationFrame(tick); })();
    v.addEventListener('play', state);
    v.addEventListener('pause', state);
    v.addEventListener('seeked', paint);
    v.addEventListener('loadedmetadata', paint);

    btn.addEventListener('click', function () {
      if (v.paused) { v.dataset.held = ''; play(v); }
      else { v.dataset.held = '1'; v.pause(); }   // a pause the reader chose sticks
    });

    function seekTo(x) {
      load(v);
      var r = track.getBoundingClientRect();
      var f = Math.min(1, Math.max(0, (x - r.left) / r.width));
      if (v.duration) { v.currentTime = f * v.duration; paint(); }
    }
    track.addEventListener('pointerdown', function (e) {
      track.setPointerCapture(e.pointerId);
      seekTo(e.clientX);
      function move(ev) { seekTo(ev.clientX); }
      function up() {
        track.removeEventListener('pointermove', move);
        track.removeEventListener('pointerup', up);
      }
      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', up);
    });
    track.addEventListener('keydown', function (e) {
      if (!v.duration) return;
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + d)); e.preventDefault(); }
    });
    state();
  }

  videos.forEach(playbar);
  if (still || !('IntersectionObserver' in window)) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (!v.dataset.held) play(v); }
      else if (v.src) v.pause();
    });
  }, { rootMargin: '200px 0px' });
  videos.forEach(function (v) { io.observe(v); });
})();
