/* Delardi tools — the seasonal mark, shared by every tool (see brand/christmas/README.md).
   From 20 November to 14 January a screen may carry one small decoration: a fir sprig on a dashboard, a snowflake pair
   on a working screen, nothing on a form. Decorative only: empty alt text, hidden from screen readers, never clickable.
   The address can force it for a preview (?season=christmas) or switch it off (?season=off).
   Each tool's build puts the three images in place of the tokens below. */
const SEASON_ART = { sprig: ["__XMAS_SPRIG__", 128, 56], flake: ["__XMAS_FLAKE__", 20, 20], mini: ["__XMAS_MINI__", 14, 14] };
function seasonFor(d) {
  const m = d.getMonth(), day = d.getDate();
  return (m === 10 && day >= 20) || m === 11 || (m === 0 && day <= 14) ? "christmas" : null;
}
const SEASON = (() => {
  const q = new URLSearchParams(location.search).get("season");
  return q === "off" ? null : q === "christmas" ? "christmas" : seasonFor(new Date());
})();
// The mark itself: "sprig", or the snowflake pair. Null outside the season.
function seasonMarkEl(kind) {
  if (SEASON !== "christmas") return null;
  const box = document.createElement("span");
  box.className = "season-mark";
  box.setAttribute("aria-hidden", "true");
  for (const k of kind === "sprig" ? ["sprig"] : ["flake", "mini"]) {
    const img = document.createElement("img");
    img.src = SEASON_ART[k][0]; img.alt = ""; img.width = SEASON_ART[k][1]; img.height = SEASON_ART[k][2]; img.dataset.k = k;
    box.append(img);
  }
  return box;
}
