const nav = document.querySelector("[data-nav]");
const navToggle = document.querySelector("[data-nav-toggle]");
const currentPath = window.location.pathname.split("/").pop() || "index.html";

document.querySelectorAll(".site-nav a").forEach((link) => {
  if (link.getAttribute("href").endsWith(currentPath)) {
    link.classList.add("is-active");
  }
});

if (nav && navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

const form = document.querySelector("[data-contact-form]");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const note = document.querySelector("[data-form-note]");
    if (note) {
      note.textContent = "Request captured for this static preview.";
    }
    form.reset();
  });
}

const canvas = document.querySelector("[data-orbit-canvas]");
if (canvas) {
  const context = canvas.getContext("2d");
  const nodes = Array.from({ length: 64 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 64,
    lane: 0.28 + (index % 5) * 0.12,
    speed: 0.0016 + (index % 7) * 0.00035,
    size: 1.2 + (index % 4) * 0.7,
  }));

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const centerX = width * 0.72;
    const centerY = height * 0.52;
    const radius = Math.min(width, height) * 0.42;

    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;

    for (let ring = 1; ring <= 4; ring += 1) {
      context.beginPath();
      context.strokeStyle = `rgba(255,255,255,${0.04 + ring * 0.012})`;
      context.ellipse(centerX, centerY, radius * ring * 0.24, radius * ring * 0.16, -0.42, 0, Math.PI * 2);
      context.stroke();
    }

    nodes.forEach((node) => {
      node.angle += node.speed;
      const x = centerX + Math.cos(node.angle) * radius * node.lane;
      const y = centerY + Math.sin(node.angle) * radius * node.lane * 0.62;
      context.beginPath();
      context.fillStyle = node.lane > 0.64 ? "rgba(255,184,107,0.72)" : "rgba(101,244,212,0.76)";
      context.arc(x, y, node.size, 0, Math.PI * 2);
      context.fill();
    });

    window.requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
}
