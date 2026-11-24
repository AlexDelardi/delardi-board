/* Delardi tools — the Christmas season, shared by every tool (see brand/christmas/README.md).
   From 20 November to 14 January, by itself:
     · a band of snowflakes across the top of every page of every tool;
     · the tree beside the passcode card on a lock screen, and on the tools hub;
     · where a tool asks for one, a mark beside a screen's title (seasonMarkEl): a fir sprig on a dashboard, a
       snowflake pair on a working screen, nothing on a form.
   All of it is decoration only: drawn in CSS or with empty alt text, hidden from screen readers, never clickable,
   never printed. The address can force it for a preview (?season=christmas) or switch it off (?season=off).
   A tool's build puts the images in place of the tokens below (ui/season_art.py). */
const SEASON_ART = {
  sprig: ["__XMAS_SPRIG__", 128, 56], flake: ["__XMAS_FLAKE__", 20, 20], mini: ["__XMAS_MINI__", 14, 14],
  band: ["__XMAS_BAND__", 208, 36], tree: ["__XMAS_TREE__", 120, 160],
};
function seasonFor(d) {
  const m = d.getMonth(), day = d.getDate();
  return (m === 10 && day >= 20) || m === 11 || (m === 0 && day <= 14) ? "christmas" : null;
}
const SEASON = (() => {
  const q = new URLSearchParams(location.search).get("season");
  return q === "off" ? null : q === "christmas" ? "christmas" : seasonFor(new Date());
})();
// The page-wide part, written once into the page as a style sheet so it holds however a tool redraws itself.
(function seasonDress() {
  if (SEASON !== "christmas" || document.querySelector("style[data-season]")) return;
  document.documentElement.classList.add("season-christmas");
  const st = document.createElement("style");
  st.setAttribute("data-season", "christmas");
  st.textContent = [
    // the band: its own strip above the header, so it never sits on a control or a figure
    "html.season-christmas body::before { content: \"\"; display: block; height: 36px; flex: 0 0 36px; background: #EEF1F7 url(" + SEASON_ART.band[0] + ") left center / 208px 36px repeat-x; border-bottom: 1px solid #D3DCE9; pointer-events: none; }",
    // the same band on a lock screen, which covers the page
    "html.season-christmas #gate::before { content: \"\"; position: absolute; top: 0; left: 0; right: 0; height: 36px; background: #EEF1F7 url(" + SEASON_ART.band[0] + ") left center / 208px 36px repeat-x; border-bottom: 1px solid #D3DCE9; pointer-events: none; }",
    // the tree: beside the passcode card on a lock screen, where there is room
    "html.season-christmas #gate::after { content: \"\"; position: absolute; right: max(32px, 9vw); bottom: max(32px, 10vh); width: 120px; height: 160px; background: url(" + SEASON_ART.tree[0] + ") center / contain no-repeat; pointer-events: none; }",
    "@media (max-width: 899px), (max-height: 619px) { html.season-christmas #gate::after { display: none; } }",
    // the tree on the tools hub, beside the title
    "html.season-christmas body.hub main { position: relative; }",
    "html.season-christmas body.hub main::after { content: \"\"; position: absolute; top: 0; right: 0; width: 120px; height: 160px; background: url(" + SEASON_ART.tree[0] + ") center / contain no-repeat; pointer-events: none; }",
    "@media (max-width: 719px) { html.season-christmas body.hub main::after { width: 60px; height: 80px; } }",
    "@media print { html.season-christmas body::before, html.season-christmas #gate::before, html.season-christmas #gate::after, html.season-christmas body.hub main::after, .season-mark { display: none !important; } }",
  ].join("\n");
  document.head.append(st);
})();
// A mark beside a screen's title: "sprig", or the snowflake pair. Null outside the season.
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
