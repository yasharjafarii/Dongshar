(() => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  function preference() {
    try {
      return ["light", "dark", "system"].includes(
        localStorage.getItem("dong-theme"),
      )
        ? localStorage.getItem("dong-theme")
        : "system";
    } catch {
      return "system";
    }
  }
  function apply(value = preference()) {
    document
      .querySelectorAll("[data-theme-value]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.themeValue === value)),
      );
    const dark = value === "dark" || (value === "system" && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#111c19" : "#163e36");
    document
      .querySelectorAll("[data-theme-picker]")
      .forEach((el) => (el.value = value));
  }
  const icons = {
    light:
      "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    dark: "M21 13a9 9 0 0 1-10-10A9 9 0 1 0 21 13",
    system: "M3 3h18v14H3z M8 21h8 M12 17v4",
  };
  function controls() {
    return (
      '<div class="theme-icons" role="group" aria-label="پوستهٔ برنامه">' +
      Object.entries({
        light: "تم روشن",
        dark: "تم تاریک",
        system: "هماهنگ با دستگاه",
      })
        .map(
          ([v, n]) =>
            '<button type="button" data-theme-value="' +
            v +
            '" title="' +
            n +
            '" aria-label="' +
            n +
            '" aria-pressed="' +
            (preference() === v) +
            '"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
            icons[v] +
            '"/></svg></button>',
        )
        .join("") +
      "</div>"
    );
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-value]");
    if (b) window.dongTheme.set(b.dataset.themeValue);
  });
  window.dongTheme = {
    controls,
    get: preference,
    set(value) {
      if (!["system", "dark", "light"].includes(value)) return;
      try {
        localStorage.setItem("dong-theme", value);
      } catch {}
      apply(value);
    },
  };
  media.addEventListener("change", () => apply());
  window.addEventListener("storage", (e) => {
    if (e.key === "dong-theme") apply();
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-theme-picker]"))
      window.dongTheme.set(e.target.value);
  });
  apply();
})();
