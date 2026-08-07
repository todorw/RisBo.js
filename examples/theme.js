// Shared floating dark/light toggle for the example pages.
(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem("risbo-theme");
  if (saved) root.setAttribute("data-theme", saved);

  // When nothing is saved yet, the page follows the OS via a media query and
  // carries no explicit attribute — fall back to that preference so the
  // toggle's first click flips away from whatever is actually showing.
  const effectiveTheme = () =>
    root.getAttribute("data-theme") ||
    (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

  const btn = document.createElement("button");
  btn.className = "icon ghost";
  btn.setAttribute("aria-label", "Toggle theme");
  btn.style.cssText = "position:fixed;top:18px;right:18px;z-index:50";
  const paint = () => (btn.textContent = effectiveTheme() === "light" ? "☾" : "☀");
  paint();
  btn.addEventListener("click", () => {
    const next = effectiveTheme() === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    localStorage.setItem("risbo-theme", next);
    paint();
  });

  const add = () => document.body.appendChild(btn);
  if (document.body) add();
  else document.addEventListener("DOMContentLoaded", add);
})();
