// MemForge — Cache monitoring dashboard HTML
//
// Extracted from server.ts. All dynamic rendering uses DOM APIs
// (textContent, createElement) instead of innerHTML to prevent XSS.

export function cacheDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MemForge Cache Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; color: #f1f5f9; }
    .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.25rem; }
    .card-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.5rem; }
    .card-value { font-size: 2rem; font-weight: 700; color: #38bdf8; }
    .card-value.green { color: #4ade80; }
    .card-value.yellow { color: #facc15; }
    .card-value.red { color: #f87171; }
    .section { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1rem; }
    .section h2 { font-size: 0.9rem; font-weight: 600; color: #94a3b8; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    td, th { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #1e293b; }
    th { color: #64748b; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
    tr:last-child td { border-bottom: none; }
    .btn { background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.875rem; }
    .btn:hover { background: #1d4ed8; }
    .btn.red { background: #dc2626; }
    .btn.red:hover { background: #b91c1c; }
    .actions { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; }
    .refresh-indicator { font-size: 0.75rem; color: #475569; margin-left: auto; align-self: center; }
    .bar-container { background: #0f172a; border-radius: 9999px; height: 0.5rem; margin-top: 0.5rem; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 9999px; transition: width 0.3s; }
    .bar-fill.green { background: #4ade80; }
    .bar-fill.blue { background: #38bdf8; }
    .ttl-badge { display: inline-block; background: #1e3a5f; color: #7dd3fc; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 9999px; margin-left: 0.5rem; }
  </style>
</head>
<body>
  <h1>MemForge Cache Dashboard</h1>
  <p class="subtitle">Redis caching layer — live statistics</p>

  <div class="actions">
    <button class="btn" onclick="refresh()">Refresh</button>
    <button class="btn red" onclick="clearCache()">Clear All Cache</button>
    <span class="refresh-indicator" id="last-updated">Loading…</span>
  </div>

  <div class="grid" id="stat-cards"></div>

  <div class="section">
    <h2>Hit Rate</h2>
    <div id="hit-rate-label" style="font-size:1.1rem;font-weight:600;color:#4ade80">—</div>
    <div class="bar-container"><div class="bar-fill green" id="hit-rate-bar" style="width:0%"></div></div>
  </div>

  <div class="section">
    <h2>Cache Tiers — TTL Configuration</h2>
    <table>
      <thead><tr><th>Tier</th><th>Routes</th><th>TTL</th></tr></thead>
      <tbody>
        <tr><td>Hot (stats)</td><td>/memory/:id/stats</td><td><span class="ttl-badge">5 min</span></td></tr>
        <tr><td>Search</td><td>/memory/:id/query, /memory/:id/timeline</td><td><span class="ttl-badge">10 min</span></td></tr>
        <tr><td>Consolidation</td><td>—</td><td><span class="ttl-badge">30 min</span></td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Redis Server Info</h2>
    <table id="redis-table"><tbody><tr><td colspan="2">Loading…</td></tr></tbody></table>
  </div>

  <script>
    const BASE = '';

    function colorClass(hitRate) {
      if (hitRate >= 80) return 'green';
      if (hitRate >= 50) return 'yellow';
      return 'red';
    }

    function createCard(label, value, cls) {
      const card = document.createElement('div');
      card.className = 'card';
      const lbl = document.createElement('div');
      lbl.className = 'card-label';
      lbl.textContent = label;
      const val = document.createElement('div');
      val.className = 'card-value' + (cls ? ' ' + cls : '');
      val.textContent = value;
      card.appendChild(lbl);
      card.appendChild(val);
      return card;
    }

    async function refresh() {
      try {
        const r = await fetch(BASE + '/admin/cache/stats');
        const j = await r.json();
        const { application: app, redis } = j.data;

        // Stat cards — DOM API
        const container = document.getElementById('stat-cards');
        container.replaceChildren();
        const cards = [
          { label: 'Cache Hits', value: app.hits.toLocaleString(), cls: 'green' },
          { label: 'Cache Misses', value: app.misses.toLocaleString(), cls: '' },
          { label: 'Keys Written', value: app.sets.toLocaleString(), cls: '' },
          { label: 'Invalidations', value: app.invalidations.toLocaleString(), cls: 'yellow' },
          { label: 'Errors', value: app.errors.toLocaleString(), cls: app.errors > 0 ? 'red' : '' },
          { label: 'Redis Keys', value: (redis.total_keys != null ? redis.total_keys : '—').toLocaleString(), cls: '' },
        ];
        cards.forEach(c => container.appendChild(createCard(c.label, c.value, c.cls)));

        // Hit rate
        const hitRate = app.hit_rate || 0;
        const hrLabel = document.getElementById('hit-rate-label');
        hrLabel.textContent = hitRate.toFixed(1) + '%';
        hrLabel.className = colorClass(hitRate);
        document.getElementById('hit-rate-bar').style.width = Math.min(hitRate, 100) + '%';

        // Redis info — DOM API
        const tbody = document.getElementById('redis-table').querySelector('tbody');
        tbody.replaceChildren();
        Object.entries(redis).forEach(function([k, v]) {
          const tr = document.createElement('tr');
          const tdKey = document.createElement('td');
          tdKey.style.color = '#64748b';
          tdKey.textContent = k;
          const tdVal = document.createElement('td');
          tdVal.textContent = String(v);
          tr.appendChild(tdKey);
          tr.appendChild(tdVal);
          tbody.appendChild(tr);
        });

        document.getElementById('last-updated').textContent =
          'Updated ' + new Date().toLocaleTimeString();
      } catch (e) {
        console.error('Refresh failed:', e);
      }
    }

    async function clearCache() {
      if (!confirm('Clear all MemForge cache keys?')) return;
      try {
        const r = await fetch(BASE + '/admin/cache/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const j = await r.json();
        alert('Cleared ' + j.data.deleted + ' keys');
        refresh();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    refresh();
    setInterval(refresh, 15000);
  </script>
</body>
</html>`;
}
