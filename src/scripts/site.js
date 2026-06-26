// detection-reticle cursor: dot tracks exactly, ring trails with easing and
// snaps onto clickable elements
function initCustomCursor() {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let rx = mx;
  let ry = my;

  window.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = `${mx}px`;
    dot.style.top = `${my}px`;
  }, { passive: true });

  function raf() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.left = `${rx}px`;
    ring.style.top = `${ry}px`;
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  document.querySelectorAll('a, button').forEach((el) => {
    el.addEventListener('mouseenter', () => ring.classList.add('is-active'));
    el.addEventListener('mouseleave', () => ring.classList.remove('is-active'));
  });
}

// fixed full-page particle network, teal-toned so it reads correctly in both themes
function initNetworkBg() {
  const canvas = document.getElementById('network-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let particles = [];
  let ripples = [];
  let width, height;
  const mouse = { x: null, y: null };

  const LINK_DIST = 130;
  const LINE_COLOR = '42, 127, 115'; // --teal rgb, reads on both light and dark paper
  const PARTICLE_COLOR = '42, 127, 115';
  const RIPPLE_MAX_RADIUS = 160;
  const RIPPLE_SPEED = 3.2;
  const RIPPLE_KICK_RADIUS = 180;

  function density() {
    const area = width * height;
    const count = Math.round(area / 14000);
    return Math.max(28, Math.min(count, 110));
  }

  function makeParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.6,
    };
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    const target = density();
    if (particles.length === 0) {
      particles = Array.from({ length: target }, makeParticle);
    } else if (particles.length < target) {
      while (particles.length < target) particles.push(makeParticle());
    } else if (particles.length > target) {
      particles.length = target;
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${PARTICLE_COLOR}, 0.35)`;
      ctx.fill();
    }
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const maxSpeed = 2.2;
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      if (mouse.x !== null) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 160 && dist > 0) {
          p.x -= (dx / dist) * 0.15;
          p.y -= (dy / dist) * 0.15;
        }
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${PARTICLE_COLOR}, 0.45)`;
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          const alpha = (1 - dist / LINK_DIST) * 0.18;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${LINE_COLOR}, ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    ripples = ripples.filter((r) => r.alpha > 0.02);
    for (const r of ripples) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${LINE_COLOR}, ${r.alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      r.radius += RIPPLE_SPEED;
      r.alpha *= 0.94;
    }

    requestAnimationFrame(step);
  }

  function onClick(e) {
    ripples.push({ x: e.clientX, y: e.clientY, radius: 4, alpha: 0.5 });
    for (const p of particles) {
      const dx = p.x - e.clientX;
      const dy = p.y - e.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < RIPPLE_KICK_RADIUS && dist > 0) {
        const force = (1 - dist / RIPPLE_KICK_RADIUS) * 1.6;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('click', onClick, { passive: true });
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }, { passive: true });
  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  resize();
  if (prefersReducedMotion) {
    drawStatic();
  } else {
    requestAnimationFrame(step);
  }
}

// scroll-reveal for timeline items, skill cards, project cards, pub list rows
function initReveal() {
  const revealTargets = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || revealTargets.length === 0) {
    revealTargets.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  revealTargets.forEach((el) => observer.observe(el));
}

// highlight the nav link matching the section in view
function initActiveNav() {
  const sections = document.querySelectorAll('main section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');
  if (sections.length === 0) return;

  function setActiveLink() {
    let current = '';
    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= 120 && rect.bottom >= 120) current = section.id;
    });
    navLinks.forEach((link) => {
      link.style.color = link.getAttribute('href') === '/#' + current ? 'var(--teal-deep)' : '';
    });
  }

  window.addEventListener('scroll', setActiveLink, { passive: true });
  setActiveLink();
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

function initLangToggle() {
  const btn = document.getElementById('lang-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
    const next = current === 'zh' ? 'en' : 'zh';
    document.documentElement.setAttribute('data-lang', next);
    localStorage.setItem('lang', next);
  });
}

function init() {
  initCustomCursor();
  initNetworkBg();
  initReveal();
  initActiveNav();
  initThemeToggle();
  initLangToggle();
}

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('astro:page-load', init);
