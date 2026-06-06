// Shared floating dark/light toggle for the example pages.
(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem("risbo-theme");
  if (saved) root.setAttribute("data-theme", saved);

  const btn = document.createElement("button");
  btn.className = "icon ghost";
  btn.setAttribute("aria-label", "Toggle theme");
  btn.style.cssText = "position:fixed;top:18px;right:18px;z-index:50";
  const paint = () =>
    (btn.textContent = root.getAttribute("data-theme") === "light" ? "☾" : "☀");
  paint();
  btn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    localStorage.setItem("risbo-theme", next);
    paint();
  });

  const add = () => document.body.appendChild(btn);
  if (document.body) add();
  else document.addEventListener("DOMContentLoaded", add);
})();
