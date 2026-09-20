/* Autonomous SDR — Control Plane dashboard. Vanilla JS, no build step, no
 * framework: this is a real client for the /api/campaigns and /api/control
 * routes in src/routes/, not a mockup. */

const FUNNEL_STAGES = ["discovered", "researched", "qualified", "disqualified", "contacted", "engaged", "meeting", "opportunity"];
const CHANNELS = ["sms", "voice", "email", "linkedin"];
const AGENT_KEYS = ["icp_fitment", "lead_research", "outreach_strategy", "personalization", "conversation", "voice_sdr", "follow_up"];
const AGENT_LABELS = {
  icp_fitment: "ICP Fitment Agent",
  lead_research: "Lead Research & Enrichment Agent",
  outreach_strategy: "Outreach Strategy Agent",
  personalization: "Personalisation / Email Agent",
  conversation: "Conversation Agent",
  voice_sdr: "Voice SDR Agent",
  follow_up: "Follow-up Agent",
};

const app = document.getElementById("app");
const controlBar = document.getElementById("control-bar");

async function api(path, opts) {
  const res = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Global control bar: kill switch + per-channel pause chips
// ---------------------------------------------------------------------------
async function renderControlBar() {
  const settings = await api("/control/settings");
  controlBar.innerHTML = `
    <div class="kill-switch ${settings.kill_switch ? "engaged" : ""}" id="kill-switch-btn" title="Stops ALL autonomous outbound action platform-wide">
      <span class="dot"></span> ${settings.kill_switch ? "Kill switch: ENGAGED" : "Kill switch: off"}
    </div>
    ${CHANNELS.map((c) => `<div class="chan-chip ${settings.channel_pause[c] ? "paused" : ""}" data-channel="${c}">${c}${settings.channel_pause[c] ? " · paused" : ""}</div>`).join("")}
  `;
  document.getElementById("kill-switch-btn").onclick = async () => {
    await api("/control/kill-switch", { method: "POST", body: JSON.stringify({ enabled: !settings.kill_switch, actor: "operator" }) });
    toast(settings.kill_switch ? "Kill switch released" : "Global kill switch engaged — all autonomous outreach stopped");
    renderControlBar();
  };
  controlBar.querySelectorAll(".chan-chip").forEach((chip) => {
    chip.onclick = async () => {
      const ch = chip.dataset.channel;
      await api(`/control/channels/${ch}/pause`, { method: "POST", body: JSON.stringify({ enabled: !settings.channel_pause[ch], actor: "operator" }) });
      toast(`${ch.toUpperCase()} channel ${settings.channel_pause[ch] ? "resumed" : "paused"} platform-wide`);
      renderControlBar();
    };
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function setActiveNav(route) {
  document.querySelectorAll("#nav-tabs a").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
}

async function router() {
  const hash = location.hash || "#/campaigns";
  const parts = hash.replace(/^#\//, "").split("/");
  try {
    if (parts[0] === "campaigns" && parts[1]) {
      setActiveNav("campaigns");
      await renderCampaignDetail(parts[1], parts[2]);
    } else if (parts[0] === "reps") {
      setActiveNav("reps");
      await renderReps();
    } else if (parts[0] === "about") {
      setActiveNav("about");
      renderAbout();
    } else {
      setActiveNav("campaigns");
      await renderCampaignsList();
    }
  } catch (err) {
    app.innerHTML = `<div class="card"><p>Failed to load: ${esc(err.message)}</p></div>`;
  }
}
window.addEventListener("hashchange", router);

// ---------------------------------------------------------------------------
// View: Campaigns list
// ---------------------------------------------------------------------------
async function renderCampaignsList() {
  app.innerHTML = `<div class="page-head">
      <div><h1>Campaigns</h1><p>Every concurrent GTM campaign, its ICP, lifecycle state and live funnel — pausing one never touches the others.</p></div>
      <button class="primary" id="new-campaign-btn">+ New Campaign</button>
    </div>
    <div class="card" id="campaigns-table"></div>`;
  document.getElementById("new-campaign-btn").onclick = openNewCampaignModal;
  const campaigns = await api("/campaigns");
  const box = document.getElementById("campaigns-table");
  if (!campaigns.length) {
    box.innerHTML = `<div class="empty">No campaigns yet. Create one to get started.</div>`;
    return;
  }
  box.innerHTML = `<table>
    <thead><tr><th>Campaign</th><th>ICP</th><th>Status</th><th>Prospects</th><th>Outreach</th><th>Meetings</th><th></th></tr></thead>
    <tbody>
      ${campaigns
        .map(
          (c) => `<tr class="clickable" data-id="${c.id}">
        <td><strong>${esc(c.name)}</strong><div class="hint">${esc(c.description || "")}</div></td>
        <td>${esc((c.targeting && c.targeting.icp_id) || "custom")}</td>
        <td><span class="status-pill status-${c.status}"><span class="dot"></span>${c.status}</span></td>
        <td>${c.metrics.prospects}</td>
        <td>${c.metrics.outreach}</td>
        <td>${c.metrics.meetings}</td>
        <td style="text-align:right">${lifecycleButton(c)}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
  box.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      location.hash = `#/campaigns/${row.dataset.id}`;
    });
  });
  box.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await api(`/campaigns/${btn.dataset.id}/${btn.dataset.action}`, { method: "POST" });
      toast(`Campaign ${btn.dataset.action}d`);
      renderCampaignsList();
    });
  });
}

function lifecycleButton(c) {
  if (c.status === "draft") return `<button class="small primary" data-action="activate" data-id="${c.id}">Activate</button>`;
  if (c.status === "live") return `<button class="small" data-action="pause" data-id="${c.id}">Pause</button>`;
  if (c.status === "paused") return `<button class="small primary" data-action="resume" data-id="${c.id}">Resume</button>`;
  return "";
}

// ---------------------------------------------------------------------------
// New campaign modal
// ---------------------------------------------------------------------------
function openModal(html) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${html}</div></div>`;
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
}
function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}

function openNewCampaignModal() {
  openModal(`
    <h2>New Campaign</h2>
    <div class="form-grid">
      <div><label>Name</label><input type="text" id="nc-name" placeholder="e.g. UK Fintech CFO Outreach"></div>
      <div><label>Owner</label><input type="text" id="nc-owner" placeholder="e.g. Arsh" value="Arsh"></div>
      <div class="form-row"><label>Objective / description</label><input type="text" id="nc-desc" placeholder="Book a 15-minute intro call"></div>
      <div><label>ICP</label>
        <select id="nc-icp">
          <option value="">Custom (no baked prospect list)</option>
          <option value="us_saas_cto">US SaaS CTO</option>
          <option value="india_bfsi_cio">India BFSI CIO</option>
          <option value="us_voice_ai_founders">US Voice AI Founders</option>
        </select>
      </div>
      <div><label>Geography</label><input type="text" id="nc-geo" placeholder="e.g. United States"></div>
      <div class="form-row"><label>Target roles (comma separated)</label><input type="text" id="nc-roles" placeholder="CTO, VP Engineering"></div>
      <div class="form-row"><label>Exclusion criteria (comma separated)</label><input type="text" id="nc-exclude" placeholder="intern, assistant"></div>
      <div class="form-row"><label>Channels</label>
        <div class="checks">
          ${CHANNELS.map((c) => `<label class="check"><input type="checkbox" checked value="${c}" class="nc-channel"> ${c}</label>`).join("")}
        </div>
      </div>
      <div><label>Daily contact limit</label><input type="number" id="nc-limit" value="25"></div>
    </div>
    <div class="modal-actions">
      <button id="nc-cancel">Cancel</button>
      <button class="primary" id="nc-save">Create Draft Campaign</button>
    </div>
  `);
  document.getElementById("nc-cancel").onclick = closeModal;
  document.getElementById("nc-save").onclick = async () => {
    const name = document.getElementById("nc-name").value.trim();
    if (!name) return toast("Name is required");
    const channels = {};
    document.querySelectorAll(".nc-channel").forEach((cb) => (channels[cb.value] = cb.checked));
    const body = {
      name,
      owner: document.getElementById("nc-owner").value.trim() || "unassigned",
      description: document.getElementById("nc-desc").value.trim(),
      icp_id: document.getElementById("nc-icp").value || null,
      geography: document.getElementById("nc-geo").value.trim(),
      target_roles: document.getElementById("nc-roles").value.split(",").map((s) => s.trim()).filter(Boolean),
      exclusion_criteria: document.getElementById("nc-exclude").value.trim(),
      channels,
      daily_limit: Number(document.getElementById("nc-limit").value) || 25,
    };
    const created = await api("/campaigns", { method: "POST", body: JSON.stringify(body) });
    closeModal();
    toast("Campaign created as Draft");
    location.hash = `#/campaigns/${created.id}`;
  };
}

// ---------------------------------------------------------------------------
// View: Campaign detail
// ---------------------------------------------------------------------------
let currentTab = "overview";

async function renderCampaignDetail(id, tab) {
  currentTab = tab || currentTab || "overview";
  const c = await api(`/campaigns/${id}`);
  app.innerHTML = `
    <p><a href="#/campaigns" class="btn ghost" style="padding:0">&larr; All campaigns</a></p>
    <div class="detail-head">
      <div>
        <h1 style="margin-bottom:4px">${esc(c.name)} <span class="status-pill status-${c.status}"><span class="dot"></span>${c.status}</span></h1>
        <p style="color:var(--muted);max-width:640px">${esc(c.description || "")}</p>
      </div>
      <div class="detail-actions">
        ${c.status === "draft" ? `<button class="primary" data-a="activate">Activate</button>` : ""}
        ${c.status === "live" ? `<button data-a="pause">Pause</button>` : ""}
        ${c.status === "paused" ? `<button class="primary" data-a="resume">Resume</button>` : ""}
        ${["live", "paused"].includes(c.status) ? `<button data-a="complete">Mark Completed</button>` : ""}
        ${["completed", "draft", "paused"].includes(c.status) ? `<button class="danger" data-a="archive">Archive</button>` : ""}
        <button data-a="duplicate">Duplicate as Variant</button>
      </div>
    </div>

    <div class="metrics-row">
      <div class="metric-card"><div class="num">${c.metrics.prospects}</div><div class="label">Prospects enrolled</div></div>
      <div class="metric-card"><div class="num">${c.metrics.outreach}</div><div class="label">Contacted or further</div></div>
      <div class="metric-card"><div class="num">${c.metrics.meetings}</div><div class="label">Meetings booked</div></div>
      <div class="metric-card"><div class="num">${c.daily_limit}</div><div class="label">Daily contact limit</div></div>
    </div>

    <div class="subtabs">
      <button data-tab="overview">Overview</button>
      <button data-tab="prospects">Prospects</button>
      <button data-tab="activity">Agent Activity</button>
      <button data-tab="prompts">Prompts &amp; Harness</button>
      <button data-tab="settings">Settings</button>
    </div>
    <div id="tab-body"></div>
  `;

  c._id = id;
  app.querySelectorAll(".detail-actions button[data-a]").forEach((btn) => {
    btn.onclick = async () => {
      if (btn.dataset.a === "duplicate") {
        const name = prompt("Name for the duplicated variant:", `${c.name} (variant)`);
        if (name === null) return;
        const copy = await api(`/campaigns/${id}/duplicate`, { method: "POST", body: JSON.stringify({ name }) });
        toast("Duplicated as a new draft campaign");
        location.hash = `#/campaigns/${copy.id}`;
        return;
      }
      await api(`/campaigns/${id}/${btn.dataset.a}`, { method: "POST" });
      toast(`Campaign ${btn.dataset.a}d`);
      renderCampaignDetail(id);
    };
  });
  app.querySelectorAll(".subtabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === currentTab);
    btn.onclick = () => {
      currentTab = btn.dataset.tab;
      app.querySelectorAll(".subtabs button").forEach((b) => b.classList.toggle("active", b === btn));
      renderTab(c);
    };
  });
  renderTab(c);
}

async function renderTab(c) {
  const body = document.getElementById("tab-body");
  if (currentTab === "overview") return renderOverviewTab(body, c);
  if (currentTab === "prospects") return renderProspectsTab(body, c);
  if (currentTab === "activity") return renderActivityTab(body, c);
  if (currentTab === "prompts") return renderPromptsTab(body, c);
  if (currentTab === "settings") return renderSettingsTab(body, c);
}

function renderOverviewTab(body, c) {
  body.innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <h3 style="margin-top:0">Prospect funnel</h3>
      <div class="funnel">
        ${FUNNEL_STAGES.map((s) => `<div class="stage"><div class="n">${c.metrics.funnel[s] || 0}</div><div class="l">${s}</div></div>`).join("")}
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Targeting</h3>
      <p><strong>ICP:</strong> ${esc(c.targeting.icp_id || "custom")} &nbsp; <strong>Geography:</strong> ${esc(c.targeting.geography || "—")}</p>
      <p><strong>Target roles:</strong> ${(c.targeting.target_roles || []).map((r) => esc(r)).join(", ") || "—"}</p>
      <p><strong>Exclusion criteria:</strong> ${esc(c.targeting.exclusion_criteria || "—")}</p>
      <p><strong>Owner:</strong> ${esc(c.owner)} &nbsp; <strong>Created:</strong> ${new Date(c.created_at).toLocaleString()}</p>
      <h3>Lifecycle history</h3>
      ${c.history
        .slice()
        .reverse()
        .map((h) => `<div class="log-entry"><span class="ts">${timeAgo(h.ts)}</span><span class="detail"><strong>${esc(h.action)}</strong> by ${esc(h.actor || "system")}</span></div>`)
        .join("")}
    </div>
  `;
}

function renderProspectsTab(body, c) {
  body.innerHTML = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <button class="primary" id="run-campaign-btn" ${c.status !== "live" ? "disabled title='Activate the campaign to run it'" : ""}>Run Campaign Now</button>
        <button id="run-followups-btn" ${c.status !== "live" ? "disabled" : ""}>Run Follow-up Pass</button>
      </div>
      <button id="add-prospect-btn">+ Add Prospect</button>
    </div>
    <div id="prospects-table">Loading…</div>
  </div>`;

  document.getElementById("run-campaign-btn").onclick = async () => {
    const r = await api(`/campaigns/${c._id}/run`, { method: "POST" });
    toast(r.reason ? `Not run: ${r.reason}` : `Pipeline ran for ${r.ran} prospect(s)`);
    renderCampaignDetail(c._id, "prospects");
  };
  document.getElementById("run-followups-btn").onclick = async () => {
    const r = await api(`/campaigns/${c._id}/follow-ups/run`, { method: "POST" });
    toast(r.reason ? `Not run: ${r.reason}` : `Follow-up agent ran for ${r.ran} prospect(s)`);
    renderCampaignDetail(c._id, "prospects");
  };
  document.getElementById("add-prospect-btn").onclick = () => openAddProspectModal(c);

  loadProspects(c);
}

async function loadProspects(c) {
  const enrollments = await api(`/campaigns/${c._id}/enrollments`);
  const box = document.getElementById("prospects-table");
  if (!enrollments.length) {
    box.innerHTML = `<div class="empty">No prospects enrolled yet. Click "Run Campaign Now" to pull in this ICP's prospect pool, or add one manually.</div>`;
    return;
  }
  box.innerHTML = `<table>
    <thead><tr><th>Prospect</th><th>Source</th><th>Stage</th><th>Channels used</th><th>Last message</th><th></th></tr></thead>
    <tbody>
      ${enrollments
        .map(
          (e) => `<tr>
        <td><strong>${esc(e.prospect.name)}</strong><div class="hint">${esc(e.prospect.title || "")} ${e.prospect.company ? "· " + esc(e.prospect.company) : ""}</div>${e.conflicts && e.conflicts.length ? `<div class="conflict-flag">⚠ also enrolled in ${e.conflicts.length} other campaign(s)</div>` : ""}</td>
        <td><span class="badge-source ${e.prospect.source}">${esc(e.prospect.source || "unknown")}</span></td>
        <td><span class="stage-pill stage-${e.funnel_stage}">${e.funnel_stage}</span></td>
        <td>${(e.channels_used || []).join(", ") || "—"}</td>
        <td style="max-width:260px"><span class="hint">${esc((e.last_message || "").slice(0, 90))}${e.last_message && e.last_message.length > 90 ? "…" : ""}</span></td>
        <td>
          <select data-eid="${e.id}" class="advance-select">
            <option value="">Advance to…</option>
            ${FUNNEL_STAGES.map((s) => `<option value="${s}" ${s === e.funnel_stage ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
  box.querySelectorAll(".advance-select").forEach((sel) => {
    const original = sel.value;
    sel.onchange = async () => {
      if (!sel.value || sel.value === original) return;
      await api(`/campaigns/${c._id}/enrollments/${sel.dataset.eid}/advance`, { method: "POST", body: JSON.stringify({ stage: sel.value }) });
      toast(`Marked as ${sel.value}`);
      loadProspects(c);
    };
  });
}

async function openAddProspectModal(c) {
  let suggestions = [];
  try {
    suggestions = await api("/control/demo-leads");
  } catch (e) {
    /* non-fatal */
  }
  openModal(`
    <h2>Add Prospect to ${esc(c.name)}</h2>
    ${
      suggestions.length
        ? `<label>Quick-add a demo lead</label>
      <select id="ap-suggest">
        <option value="">— pick one to prefill —</option>
        ${suggestions.map((s, i) => `<option value="${i}">${esc(s.name)} — ${esc(s.title)}, ${esc(s.company)}</option>`).join("")}
      </select>
      <p class="hint">These are synthetic test contacts, not real people — good for exercising SMS/voice/email against a fresh lead.</p>`
        : ""
    }
    <div class="form-grid">
      <div><label>Name</label><input type="text" id="ap-name"></div>
      <div><label>Title</label><input type="text" id="ap-title"></div>
      <div><label>Company</label><input type="text" id="ap-company"></div>
      <div><label>Phone (E.164)</label><input type="text" id="ap-phone" placeholder="+91..."></div>
      <div><label>Email</label><input type="email" id="ap-email"></div>
      <div><label>LinkedIn URL</label><input type="text" id="ap-linkedin"></div>
    </div>
    <div class="modal-actions">
      <button id="ap-cancel">Cancel</button>
      <button class="primary" id="ap-save">Add &amp; Run ICP Fitment</button>
    </div>
  `);
  const suggestSel = document.getElementById("ap-suggest");
  if (suggestSel) {
    suggestSel.onchange = () => {
      if (suggestSel.value === "") return;
      const s = suggestions[Number(suggestSel.value)];
      document.getElementById("ap-name").value = s.name || "";
      document.getElementById("ap-title").value = s.title || "";
      document.getElementById("ap-company").value = s.company || "";
      document.getElementById("ap-phone").value = s.phone || "";
      document.getElementById("ap-email").value = s.email || "";
    };
  }
  document.getElementById("ap-cancel").onclick = closeModal;
  document.getElementById("ap-save").onclick = async () => {
    const prospect = {
      name: document.getElementById("ap-name").value.trim(),
      title: document.getElementById("ap-title").value.trim(),
      company: document.getElementById("ap-company").value.trim(),
      phone: document.getElementById("ap-phone").value.trim() || undefined,
      email: document.getElementById("ap-email").value.trim() || undefined,
      linkedin_url: document.getElementById("ap-linkedin").value.trim() || undefined,
    };
    if (!prospect.name) return toast("Name is required");
    const result = await api(`/campaigns/${c._id}/enrollments`, { method: "POST", body: JSON.stringify({ prospect }) });
    closeModal();
    const f = result.enrollment.fitment;
    toast(f ? `ICP Fitment Agent: ${f.qualified ? "QUALIFIED" : "REJECTED"} (score ${f.score}) — ${f.reason}` : "Prospect added");
    renderCampaignDetail(c._id, "prospects");
  };
}

async function renderActivityTab(body, c) {
  body.innerHTML = `<div class="card"><h3 style="margin-top:0">Recent agent activity</h3><div id="activity-feed">Loading…</div></div>`;
  const events = await api(`/campaigns/${c._id}/activity`);
  const feed = document.getElementById("activity-feed");
  if (!events.length) {
    feed.innerHTML = `<div class="empty">No agent activity yet — run the campaign to see the intelligence layer work.</div>`;
    return;
  }
  feed.innerHTML = events
    .map(
      (e) => `<div class="log-entry">
        <span class="ts">${timeAgo(e.ts)}</span>
        <span class="agent-tag">${esc(AGENT_LABELS[e.agent] || e.agent)}</span>
        <span class="detail"><strong>${esc(e.action)}</strong>${e.detail && e.detail.name ? " — " + esc(e.detail.name) : ""}${e.detail && e.detail.reason ? ` <span class="hint">(${esc(e.detail.reason)})</span>` : ""}</span>
      </div>`
    )
    .join("");
}

function renderPromptsTab(body, c) {
  const scopes = [{ key: "system", label: "Campaign system prompt", versions: c.prompts.system }].concat(
    AGENT_KEYS.map((k) => ({ key: k, label: AGENT_LABELS[k], versions: c.prompts.agents[k] }))
  );
  body.innerHTML = scopes
    .map(
      (s) => `<div class="card" style="margin-bottom:16px">
      <h3 style="margin-top:0">${esc(s.label)}</h3>
      ${s.versions
        .slice()
        .reverse()
        .map(
          (v) => `<div class="version-item ${v.active ? "active" : ""}">
          <div class="meta"><span>v${v.version} · ${esc(v.author || "system")} · ${timeAgo(v.created_at)}</span>${v.active ? "<strong>ACTIVE</strong>" : `<button class="small" data-rollback="${s.key}:${v.version}">Activate this version</button>`}</div>
          <pre>${esc(v.text)}</pre>
        </div>`
        )
        .join("")}
      <label style="margin-top:10px">New version</label>
      <textarea id="prompt-new-${s.key}"></textarea>
      <div style="text-align:right;margin-top:8px"><button class="primary small" data-save="${s.key}">Save New Version</button></div>
    </div>`
    )
    .join("");

  body.querySelectorAll("[data-rollback]").forEach((btn) => {
    btn.onclick = async () => {
      const [scope, version] = btn.dataset.rollback.split(":");
      await api(`/campaigns/${c._id}/prompts/${scope}/${version}/activate`, { method: "POST" });
      toast(`Rolled back ${scope} to v${version}`);
      renderCampaignDetail(c._id, "prompts");
    };
  });
  body.querySelectorAll("[data-save]").forEach((btn) => {
    btn.onclick = async () => {
      const scope = btn.dataset.save;
      const text = document.getElementById(`prompt-new-${scope}`).value.trim();
      if (!text) return toast("Enter prompt text first");
      await api(`/campaigns/${c._id}/prompts`, { method: "POST", body: JSON.stringify({ scope, text, author: c.owner }) });
      toast("New prompt version saved and activated");
      renderCampaignDetail(c._id, "prompts");
    };
  });
}

function renderSettingsTab(body, c) {
  body.innerHTML = `<div class="card">
    <h3 style="margin-top:0">Channels enabled for this campaign</h3>
    <div class="checks">
      ${CHANNELS.map((ch) => `<label class="check"><input type="checkbox" class="set-channel" data-ch="${ch}" ${c.channels[ch] ? "checked" : ""}> ${ch}</label>`).join("")}
    </div>
    <h3>Agents enabled for this campaign</h3>
    <div class="checks">
      ${AGENT_KEYS.map((k) => `<label class="check"><input type="checkbox" class="set-agent" data-ag="${k}" ${c.agents[k] ? "checked" : ""}> ${AGENT_LABELS[k]}</label>`).join("")}
    </div>
    <p class="hint">Disabling the ICP Fitment Agent auto-qualifies everyone; disabling Personalisation falls back to a plain template message. Disabling a channel here overrides the global channel-pause switch too (both must be on to send).</p>
    <div style="text-align:right;margin-top:14px"><button class="primary" id="settings-save">Save Settings</button></div>
  </div>`;
  document.getElementById("settings-save").onclick = async () => {
    const channels = {};
    body.querySelectorAll(".set-channel").forEach((cb) => (channels[cb.dataset.ch] = cb.checked));
    const agents = {};
    body.querySelectorAll(".set-agent").forEach((cb) => (agents[cb.dataset.ag] = cb.checked));
    await api(`/campaigns/${c._id}`, { method: "PATCH", body: JSON.stringify({ channels, agents, actor: c.owner }) });
    toast("Settings saved");
  };
}

// ---------------------------------------------------------------------------
// View: Reps
// ---------------------------------------------------------------------------
async function renderReps() {
  app.innerHTML = `<div class="page-head">
    <div><h1>Representatives</h1><p>Human reps assignable to campaigns — whose identity is used for outreach, and what happens if they're offboarded.</p></div>
    <button class="primary" id="new-rep-btn">+ Add Rep</button>
  </div>
  <div class="card" id="reps-table"></div>`;
  document.getElementById("new-rep-btn").onclick = () => {
    openModal(`<h2>Add Representative</h2>
      <div class="form-grid">
        <div><label>Name</label><input type="text" id="rep-name"></div>
        <div><label>Email</label><input type="email" id="rep-email"></div>
        <div><label>Daily activity limit</label><input type="number" id="rep-limit" value="50"></div>
        <div><label>Working hours</label><input type="text" id="rep-hours" value="9am-6pm"></div>
      </div>
      <div class="modal-actions"><button id="rep-cancel">Cancel</button><button class="primary" id="rep-save">Add Rep</button></div>`);
    document.getElementById("rep-cancel").onclick = closeModal;
    document.getElementById("rep-save").onclick = async () => {
      const name = document.getElementById("rep-name").value.trim();
      if (!name) return toast("Name is required");
      await api("/control/reps", {
        method: "POST",
        body: JSON.stringify({
          name,
          email: document.getElementById("rep-email").value.trim(),
          daily_limit: Number(document.getElementById("rep-limit").value) || 50,
          working_hours: document.getElementById("rep-hours").value.trim(),
        }),
      });
      closeModal();
      toast("Rep added");
      renderReps();
    };
  };
  const reps = await api("/control/reps");
  const box = document.getElementById("reps-table");
  if (!reps.length) {
    box.innerHTML = `<div class="empty">No reps added yet. Autonomous campaigns run without one, but a rep can be assigned to own the human hand-off.</div>`;
    return;
  }
  box.innerHTML = `<table>
    <thead><tr><th>Name</th><th>Email</th><th>Daily limit</th><th>Working hours</th></tr></thead>
    <tbody>${reps.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.email || "—")}</td><td>${r.daily_limit}</td><td>${esc(r.working_hours)}</td></tr>`).join("")}</tbody>
  </table>`;
}

// ---------------------------------------------------------------------------
// View: About / System
// ---------------------------------------------------------------------------
function renderAbout() {
  app.innerHTML = `<div class="page-head"><div><h1>System</h1><p>What's running under this control plane.</p></div></div>
  <div class="card">
    <h3 style="margin-top:0">Intelligence layer — 7 agents</h3>
    <p>${AGENT_KEYS.map((k) => esc(AGENT_LABELS[k])).join(" → ")}</p>
    <h3>Knowledge / RAG</h3>
    <p>Keyword-retrieval over <code>data/knowledge/*.md</code> (product pitch, objection handling, example messages, voice script) — a dependency-free stand-in for a vector DB, grounding the Personalisation Agent's fallback template whenever the DronaHQ conversation webhook returns no live content.</p>
    <h3>Control levels</h3>
    <p>Campaign Pause (this page) · Agent Pause (per-campaign Settings tab) · Channel Pause (top-right control bar) · Global Kill Switch (top-right control bar) — exactly the four levels the problem statement asks for.</p>
    <p><a href="/api/health">/api/health</a> — raw integration status JSON.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
renderControlBar();
router();
setInterval(renderControlBar, 15000);
