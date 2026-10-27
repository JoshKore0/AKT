// Lancé toutes les 5 min par GitHub Actions : note qui est en ligne et cumule le temps.
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("members.json", "utf8"));
let data = {};
try { data = JSON.parse(fs.readFileSync("data.json", "utf8")); } catch (e) {}
data.members = data.members || {};

// Retire les [tags], emojis et symboles, et ignore les majuscules
const norm = s => String(s || "").normalize("NFKC").replace(/\[[^\]]*\]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const idx = {};
for (const m of cfg.members)
  for (const a of [m.name, ...(m.aliases || [])]) if (norm(a)) idx[norm(a)] = m.id;

async function getServer() {
  for (const base of ["https://frontend.cfx-services.net", "https://servers-frontend.fivem.net"]) {
    try {
      const r = await fetch(`${base}/api/servers/single/${cfg.serverCode}`,
        { headers: { "User-Agent": "Mozilla/5.0 AKT-tracker", "Accept": "application/json" } });
      if (r.ok) return await r.json();
      console.log(base, "HTTP", r.status);
    } catch (e) { console.log(base, e.message); }
  }
  return null;
}

(async () => {
  const now = Date.now();
  const j = await getServer();
  if (!j) {
    data.error = "API FiveM injoignable"; data.updated = now;
    fs.writeFileSync("data.json", JSON.stringify(data)); return;
  }
  delete data.error;
  const d = j.Data || {};
  const players = d.players || [];
  const clients = d.clients || players.length;
  data.listVisible = players.length > 0 || clients === 0;
  data.serverPlayers = clients;

  const delta = data.lastRun ? Math.min((now - data.lastRun) / 1000, 600) : 300;
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now);
  const online = new Set(), unmatched = [];
  for (const p of players) {
    const id = idx[norm(p.name)];
    const tagged = /\[AKT\]/i.test(p.name);
    if (id && (!cfg.requireTag || tagged)) online.add(id);
    else if (tagged) unmatched.push(p.name);
  }
  for (const id of online) {
    const m = data.members[id] = data.members[id] || { days: {} };
    m.days[day] = Math.round((m.days[day] || 0) + delta);
    m.lastSeen = now;
  }
  data.online = [...online];
  data.unmatched = unmatched; // joueurs [AKT] non reconnus : à ajouter dans members.json
  data.sample = players.slice(0, 10).map(p => p.name);
  data.debug = players.filter(p => /josh|kore|mirage|akt/i.test(p.name)).map(p => p.name);
  data.lastRun = now; data.updated = now;
  fs.writeFileSync("data.json", JSON.stringify(data));
  console.log(`${online.size} membres en ligne, ${unmatched.length} [AKT] non reconnus`);
})();
