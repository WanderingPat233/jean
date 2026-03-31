(() => {
  const topnav = document.querySelector(".topnav");
  if (topnav) {
    const syncTopnavState = () => {
      const scrolled = (window.scrollY || window.pageYOffset || 0) > 8;
      topnav.classList.toggle("topnav--scrolled", scrolled);
    };
    window.addEventListener("scroll", syncTopnavState, { passive: true });
    window.addEventListener("resize", syncTopnavState);
    syncTopnavState();
  }

  const hero = document.querySelector(".hero");
  const toggleBtn = document.getElementById("heroPlayPause");
  const bg = document.getElementById("heroBg");
  const icon = toggleBtn.querySelector(".hero__playpause-icon");
  const video = document.getElementById("heroVideo");

  // Default: try to play the video.
  let playing = true;
  function applyState() {
    toggleBtn.setAttribute("aria-pressed", String(playing));
    icon.textContent = playing ? "||" : ">";
    toggleBtn.setAttribute(
      "aria-label",
      playing ? "Toggle background playback (pause)" : "Toggle background playback (play)"
    );

    if (!video) return;
    if (playing) {
      const p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Ignore autoplay errors; user can click to play.
        });
      }
    } else {
      video.pause();
    }
  }

  function toggle() {
    playing = !playing;
    applyState();
  }

  // Clicking the background or the icon toggles playback state.
  bg.addEventListener("click", toggle);
  toggleBtn.addEventListener("click", toggle);

  // Keyboard support: Enter/Space toggles.
  bg.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });

  applyState();
})();

(() => {
  const story = document.getElementById("scrollStory");
  if (!story) return;

  const initialImage = document.getElementById("storyInitialImage");
  const video1 = document.getElementById("storyVideo1");
  const video2 = document.getElementById("storyVideo2");
  const video3 = document.getElementById("storyVideo3");

  const videosByStep = {
    1: video1,
    2: video2,
    3: video3,
  };

  let lastStep = -1;
  let isStoryActive = false;
  let startTimer = null;
  let wheelCooldown = false;

  function playSafe(v) {
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  // Apply active step: update CSS + media visibility + playback
  function applyStep(step, source = "auto") {
    if (step === lastStep) return;
    lastStep = step;
    story.dataset.step = String(step);

    // Media visuals (cross-fade)
    if (initialImage) initialImage.classList.toggle("is-active", step === 0);
    [video1, video2, video3].forEach((v, idx) => {
      const s = idx + 1;
      if (!v) return;
      v.classList.toggle("is-active", step === s);
    });

    // Video playback control
    const activeVideo = videosByStep[step];
    [video1, video2, video3].forEach((v) => {
      if (!v) return;
      if (!activeVideo || v !== activeVideo) {
        v.pause();
      }
    });

    if (activeVideo) {
      // Restart when moving into a new step via manual scroll jump.
      if (source === "wheel" || source === "start" || source === "ended") {
        try {
          activeVideo.currentTime = 0;
        } catch {
          // Ignore currentTime restrictions before metadata.
        }
      }
      playSafe(activeVideo);
    }
  }

  function nextStep() {
    applyStep(Math.min(3, lastStep + 1), "wheel");
  }

  function prevStep() {
    applyStep(Math.max(0, lastStep - 1), "wheel");
  }

  // Determine whether viewport center is inside story section.
  function updateActiveState() {
    const rect = story.getBoundingClientRect();
    const center = window.innerHeight * 0.5;
    isStoryActive = rect.top <= center && rect.bottom >= center;

    // If story is active and still on title step, auto-start video 1 after a short delay.
    if (isStoryActive && lastStep === 0 && !startTimer) {
      startTimer = window.setTimeout(() => {
        applyStep(1, "start");
        startTimer = null;
      }, 700);
    }

    if ((!isStoryActive || lastStep !== 0) && startTimer) {
      window.clearTimeout(startTimer);
      startTimer = null;
    }
  }

  // Wheel-driven step switching: scroll down -> next, scroll up -> previous.
  function onWheel(e) {
    if (!isStoryActive) return;
    if (wheelCooldown) return;

    if (e.deltaY > 8) {
      nextStep();
    } else if (e.deltaY < -8) {
      prevStep();
    } else {
      return;
    }

    wheelCooldown = true;
    window.setTimeout(() => {
      wheelCooldown = false;
    }, 550);
  }

  // Auto-advance when each video finishes (if user doesn't scroll).
  function bindEnded(videoEl, step) {
    if (!videoEl) return;
    videoEl.addEventListener("ended", () => {
      if (lastStep !== step) return;
      applyStep(Math.min(3, step + 1), "ended");
    });
  }

  bindEnded(video1, 1);
  bindEnded(video2, 2);
  bindEnded(video3, 3);

  window.addEventListener("scroll", updateActiveState, { passive: true });
  window.addEventListener("resize", updateActiveState);
  window.addEventListener("wheel", onWheel, { passive: true });

  applyStep(0);
  updateActiveState();
})();

(() => {
  const stage = document.getElementById("expoStage");
  if (!stage) return;

  const cards = Array.from(stage.querySelectorAll(".expo-card"));
  const swipeZone = document.getElementById("expoSwipeZone");
  const modal = document.getElementById("expoModal");
  const modalClose = document.getElementById("expoModalClose");
  const modalAvatar = document.getElementById("expoModalAvatar");
  const modalName = document.getElementById("expoModalName");
  const modalText = document.getElementById("expoModalText");

  let offset = 0;
  let hoveredIndex = -1;
  let autoRotate = true;
  let isDragging = false;
  let lastX = 0;
  let raf = 0;

  function layoutCards() {
    const rect = stage.getBoundingClientRect();
    const cy = rect.height * 0.56;
    const laneHalf = Math.max(320, rect.width * 0.48);
    const total = cards.length;

    cards.forEach((card, i) => {
      // p loops in [0,1). Cards move like a conveyor through perspective corridor.
      const p = (((i / total + offset) % 1) + 1) % 1;
      const r = p * 2 - 1; // -1(left) ... 0(center/far) ... +1(right)
      const side = r === 0 ? 1 : Math.sign(r);
      const dist = Math.abs(r); // 0 center(far), 1 edges(near)

      // Keep cards passing through center (no hard gap).
      const withGap = side * (0.02 + dist * 0.98);
      const tx = withGap * laneHalf;
      const ty = (cy - rect.height * 0.5) + Math.pow(dist, 1.45) * 54 - 24;

      // Softer perspective: edge cards no longer oversized.
      const baseScale = 0.62 + dist * 0.28;
      const scale = i === hoveredIndex ? baseScale * 1.08 : baseScale;
      const rotateY = -withGap * 24;
      // Keep center and near-center cards clear; only fade at far left/right seams.
      const seamDistance = Math.min(p, 1 - p); // 0 at wrap edges
      const seamFade = Math.min(1, Math.max(0, seamDistance / 0.06));
      const opacity = 0.28 + 0.72 * seamFade;
      const z = Math.round(20 + dist * 90);

      card.style.transform = `translate(-50%, -50%) translate3d(${tx}px, ${ty}px, 0) scale(${scale}) rotateY(${rotateY}deg)`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(z);
    });
  }

  function tick() {
    if (autoRotate && !isDragging) {
      offset += 0.00012;
      layoutCards();
    }
    raf = requestAnimationFrame(tick);
  }

  cards.forEach((card, index) => {
    card.addEventListener("mouseenter", () => {
      hoveredIndex = index;
      card.classList.add("is-hovered");
      autoRotate = false;
      layoutCards();
    });

    card.addEventListener("mouseleave", () => {
      hoveredIndex = -1;
      card.classList.remove("is-hovered");
      autoRotate = true;
      layoutCards();
    });

    card.addEventListener("click", () => {
      const name = card.dataset.name || "User";
      const feedback = card.dataset.feedback || "";
      modalName.textContent = name;
      modalAvatar.textContent = name.slice(0, 1).toUpperCase();
      modalText.textContent = feedback;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      autoRotate = false;
    });
  });

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    autoRotate = true;
  }

  modal.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-close='true']")) closeModal();
  });
  modalClose.addEventListener("click", closeModal);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
  });

  function pointerDown(e) {
    isDragging = true;
    autoRotate = false;
    lastX = e.clientX;
    swipeZone.setPointerCapture(e.pointerId);
  }

  function pointerMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    offset += dx * 0.0009;
    layoutCards();
  }

  function pointerUp() {
    isDragging = false;
    autoRotate = true;
  }

  swipeZone.addEventListener("pointerdown", pointerDown);
  swipeZone.addEventListener("pointermove", pointerMove);
  swipeZone.addEventListener("pointerup", pointerUp);
  swipeZone.addEventListener("pointercancel", pointerUp);
  swipeZone.addEventListener("pointerleave", pointerUp);

  window.addEventListener("resize", layoutCards);
  layoutCards();
  raf = requestAnimationFrame(tick);
})();

