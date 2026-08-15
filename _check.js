
(function () {
  "use strict";

  var STORAGE_KEY = "engineer-pm-board-v2";

  var STATUS = {
    not_started: { label: "Not started" },
    working:     { label: "Working on it" },
    stuck:       { label: "Stuck" },
    done:        { label: "Done" }
  };
  var STATUS_ORDER = ["not_started", "working", "stuck", "done"];

  var PRIORITY = {
    critical: { label: "Critical" },
    high:     { label: "High" },
    medium:   { label: "Medium" },
    low:      { label: "Low" }
  };
  var PRIORITY_ORDER = ["critical", "high", "medium", "low"];

  var GROUP_COLORS = ["#c47f00", "#0891b2", "#00c875", "#784bd1", "#579bfc", "#e2445c"];
  var AVATAR_COLORS = ["#579bfc", "#a25ddc", "#00c875", "#c47f00", "#ff642e", "#0891b2", "#784bd1", "#e2445c"];

  // ---------------- i18n ----------------

  var LANG_KEY = "engineer-pm-board-lang";
  var I18N = {
    en: {
      "sb.workspace": "Workspace", "sb.mainWorkspace": "Main workspace", "sb.myAgents": "My agents",
      "sb.content": "Content", "sb.manageWorkspace": "Manage workspace", "sb.dashboard": "Dashboard and reporting",
      "sb.caption": "Project management", "sb.progressLabel": "Project progress", "sb.progressBtn": "View details",
      "sb.progressSub": "{done}/{total} tasks completed",
      "ws.addDescription": "Add workspace description", "ws.feedback": "Feedback", "ws.agents": "Agents",
      "ws.members": "Members", "ws.recents": "Recents", "ws.content": "Content", "ws.collaborators": "Collaborators",
      "ws.permissions": "Permissions", "ws.aiCredits": "AI credits won't be charged", "ws.filters": "Filters",
      "ws.noCleanup": "No cleanup suggestions found", "ws.cleanupMode": "Cleanup mode",
      "ws.assetName": "Asset name", "ws.aiSummary": "AI summary", "ws.creator": "Creator",
      "ws.creationDate": "Creation date", "ws.lastModified": "Last modified", "ws.folder": "Folder",
      "ws.noAssetsMatch": "No assets match your search.",
      "db.statusBreakdown": "Status breakdown", "db.totalTasks": "Total tasks",
      "db.summary": "{n} task{s} across {g} group{gs} in “{title}”",
      "tb.aiSuggestions": "AI suggestions", "tb.new": "New", "tb.integrate": "Integrate", "tb.automate": "Automate",
      "tb.invite": "Invite / 1", "tab.mainTable": "Main table",
      "toolbar.newTask": "New task", "toolbar.person": "Person", "toolbar.filter": "Filter", "toolbar.sort": "Sort",
      "toolbar.hide": "Hide", "toolbar.groupBy": "Group by",
      "topmenu.boardData": "Board data", "topmenu.loadSample": "Load sample project", "topmenu.resetBoard": "Reset board (clear all)",
      "common.search": "Search",
      "col.task": "Task", "col.owner": "Owner", "col.status": "Status", "col.dueDate": "Due date",
      "col.timeline": "Timeline", "col.priority": "Priority", "col.subitem": "Subitem", "col.date": "Date",
      "board.addTask": "Add task", "board.addSubitem": "Add subitem",
      "board.taskPlaceholder": "Task name", "board.subitemPlaceholder": "Subitem name", "board.assignOwner": "Assign owner",
      "status.not_started": "Not started", "status.working": "Working on it", "status.stuck": "Stuck", "status.done": "Done",
      "pri.critical": "Critical", "pri.high": "High", "pri.medium": "Medium", "pri.low": "Low",
      "bulk.export": "Export", "bulk.delete": "Delete", "bulk.cancel": "Cancel",
      "bulk.itemSelected": "item selected", "bulk.itemsSelected": "items selected",
      "panel.updates": "Updates", "panel.files": "Files", "panel.activityLog": "Activity Log",
      "panel.updateViaEmail": "Update via email", "panel.giveFeedback": "Give feedback",
      "panel.composePlaceholder": "Write an update and mention others with @", "panel.postUpdate": "Post update",
      "panel.replyPlaceholder": "Write a reply and mention others with @",
      "panel.noUpdates": "No updates yet — be the first to post one.", "panel.like": "Like", "panel.reply": "Reply",
      "lang.switchTo": "ไทย"
    },
    th: {
      "sb.workspace": "เวิร์กสเปซ", "sb.mainWorkspace": "เวิร์กสเปซหลัก", "sb.myAgents": "เอเจนต์ของฉัน",
      "sb.content": "เนื้อหา", "sb.manageWorkspace": "จัดการเวิร์กสเปซ", "sb.dashboard": "แดชบอร์ดและรายงาน",
      "sb.caption": "ระบบจัดการโปรเจกต์", "sb.progressLabel": "ความคืบหน้าโครงการ", "sb.progressBtn": "ดูรายละเอียด",
      "sb.progressSub": "ทำเสร็จแล้ว {done}/{total} งาน",
      "ws.addDescription": "เพิ่มคำอธิบายเวิร์กสเปซ", "ws.feedback": "ข้อเสนอแนะ", "ws.agents": "เอเจนต์",
      "ws.members": "สมาชิก", "ws.recents": "ล่าสุด", "ws.content": "เนื้อหา", "ws.collaborators": "ผู้ร่วมงาน",
      "ws.permissions": "สิทธิ์การเข้าถึง", "ws.aiCredits": "จะไม่มีการเรียกเก็บเครดิต AI", "ws.filters": "ตัวกรอง",
      "ws.noCleanup": "ไม่พบคำแนะนำในการจัดระเบียบ", "ws.cleanupMode": "โหมดจัดระเบียบ",
      "ws.assetName": "ชื่อไฟล์งาน", "ws.aiSummary": "สรุปโดย AI", "ws.creator": "ผู้สร้าง",
      "ws.creationDate": "วันที่สร้าง", "ws.lastModified": "แก้ไขล่าสุด", "ws.folder": "โฟลเดอร์",
      "ws.noAssetsMatch": "ไม่พบรายการที่ตรงกับการค้นหา",
      "db.statusBreakdown": "สัดส่วนตามสถานะ", "db.totalTasks": "งานทั้งหมด",
      "db.summary": "{n} งาน ใน {g} กลุ่ม ของ “{title}”",
      "tb.aiSuggestions": "คำแนะนำ AI", "tb.new": "ใหม่", "tb.integrate": "เชื่อมต่อ", "tb.automate": "ระบบอัตโนมัติ",
      "tb.invite": "เชิญ / 1", "tab.mainTable": "ตารางหลัก",
      "toolbar.newTask": "งานใหม่", "toolbar.person": "บุคคล", "toolbar.filter": "กรอง", "toolbar.sort": "เรียงลำดับ",
      "toolbar.hide": "ซ่อน", "toolbar.groupBy": "จัดกลุ่มตาม",
      "topmenu.boardData": "ข้อมูลบอร์ด", "topmenu.loadSample": "โหลดโปรเจกต์ตัวอย่าง", "topmenu.resetBoard": "ล้างบอร์ด (ลบทั้งหมด)",
      "common.search": "ค้นหา",
      "col.task": "งาน", "col.owner": "ผู้รับผิดชอบ", "col.status": "สถานะ", "col.dueDate": "กำหนดเสร็จ",
      "col.timeline": "ไทม์ไลน์", "col.priority": "ความสำคัญ", "col.subitem": "งานย่อย", "col.date": "วันที่",
      "board.addTask": "เพิ่มงาน", "board.addSubitem": "เพิ่มงานย่อย",
      "board.taskPlaceholder": "ชื่องาน", "board.subitemPlaceholder": "ชื่องานย่อย", "board.assignOwner": "มอบหมายผู้รับผิดชอบ",
      "status.not_started": "ยังไม่เริ่ม", "status.working": "กำลังดำเนินการ", "status.stuck": "ติดปัญหา", "status.done": "เสร็จแล้ว",
      "pri.critical": "วิกฤต", "pri.high": "สูง", "pri.medium": "ปานกลาง", "pri.low": "ต่ำ",
      "bulk.export": "ส่งออก", "bulk.delete": "ลบ", "bulk.cancel": "ยกเลิก",
      "bulk.itemSelected": "รายการที่เลือก", "bulk.itemsSelected": "รายการที่เลือก",
      "panel.updates": "อัปเดต", "panel.files": "ไฟล์", "panel.activityLog": "บันทึกกิจกรรม",
      "panel.updateViaEmail": "อัปเดตผ่านอีเมล", "panel.giveFeedback": "ให้ข้อเสนอแนะ",
      "panel.composePlaceholder": "เขียนอัปเดตและแท็กเพื่อนร่วมทีมด้วย @", "panel.postUpdate": "โพสต์อัปเดต",
      "panel.replyPlaceholder": "เขียนตอบกลับและแท็กเพื่อนร่วมทีมด้วย @",
      "panel.noUpdates": "ยังไม่มีอัปเดต — เป็นคนแรกที่โพสต์เลย", "panel.like": "ถูกใจ", "panel.reply": "ตอบกลับ",
      "lang.switchTo": "EN"
    }
  };

  function loadLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved === "en" || saved === "th") return saved;
    } catch (e) {}
    return "en";
  }
  var lang = loadLang();

  function tr(key) {
    var dict = I18N[lang] || I18N.en;
    return (key in dict) ? dict[key] : (I18N.en[key] || key);
  }
  function statusLabel(k) { return tr("status." + k); }
  function priorityLabel(k) { return tr("pri." + k); }

  function applyI18n() {
    document.documentElement.lang = lang === "th" ? "th" : "en";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = tr(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.placeholder = tr(el.getAttribute("data-i18n-placeholder"));
    });
    var toggleLabel = document.getElementById("langToggleLabel");
    if (toggleLabel) toggleLabel.textContent = tr("lang.switchTo");
  }

  function setLang(next) {
    lang = next === "th" ? "th" : "en";
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    applyI18n();
    render();
  }

  function uid() { return Math.random().toString(36).slice(2, 10); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function avatarColor(name) {
    if (!name) return "#c4c6d3";
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function initials(name) {
    if (!name) return "";
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] || "").toUpperCase();
  }
  function fmtDate(s) {
    if (!s) return "";
    var d = new Date(s + "T00:00:00");
    if (isNaN(d)) return s;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function relTime(hoursOffset) {
    return new Date(Date.now() + hoursOffset * 3600 * 1000).toISOString();
  }
  function fmtLongDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function timeAgo(iso) {
    if (!iso) return "";
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.round(diffMs / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return mins + "m";
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + "h";
    var days = Math.round(hrs / 24);
    if (days < 30) return days + "d";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // ---------------- seed data ----------------

  function seedState() {
    var g1 = uid(), g2 = uid(), g3 = uid(), g4 = uid();
    var swSub1 = uid();

    return {
      title: "IT Project — Network Infrastructure Upgrade",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      groups: [
        { id: g1, name: "Design", color: GROUP_COLORS[0], collapsed: false },
        { id: g2, name: "Procurement", color: GROUP_COLORS[1], collapsed: false },
        { id: g3, name: "Deployment", color: GROUP_COLORS[2], collapsed: false },
        { id: g4, name: "Testing & Go-live", color: GROUP_COLORS[3], collapsed: false }
      ],
      tasks: [
        { id: uid(), groupId: g1, name: "Network audit (current state)", owner: "Anan", status: "done", priority: "high", start: "2026-07-01", due: "2026-07-08", subitemsOpen: false, subitems: [], updates: [] },
        { id: uid(), groupId: g1, name: "Design network diagram & IP schema", owner: "Preecha", status: "done", priority: "critical", start: "2026-07-08", due: "2026-07-16", subitemsOpen: false, subitems: [], updates: [] },
        { id: uid(), groupId: g1, name: "Design VLAN / segmentation & firewall rules", owner: "Preecha", status: "working", priority: "high", start: "2026-07-17", due: "2026-07-24", subitemsOpen: true, subitems: [
          { id: swSub1, name: "Draft VLAN table", owner: "Preecha", status: "done", date: "2026-07-18" },
          { id: uid(), name: "Review with security team", owner: "Nok", status: "not_started", date: "2026-07-23" }
        ], updates: [
          { id: uid(), author: "Preecha", time: relTime(-3), text: "Draft VLAN table is up — 12 VLANs mapped to the new switch stack. Sending to Nok for the security pass next.", likes: 1, liked: false }
        ] },
        { id: uid(), groupId: g1, name: "Design review with stakeholders", owner: "", status: "not_started", priority: "medium", start: "2026-07-25", due: "2026-07-29", subitemsOpen: false, subitems: [], updates: [] },

        { id: uid(), groupId: g2, name: "Get quotes for core switch & firewall", owner: "Malee", status: "done", priority: "medium", start: "2026-07-20", due: "2026-07-27", subitemsOpen: false, subitems: [], updates: [] },
        { id: uid(), groupId: g2, name: "Order access points & rack hardware", owner: "Malee", status: "working", priority: "high", start: "2026-07-28", due: "2026-08-06", subitemsOpen: false, subitems: [], updates: [] },
        { id: uid(), groupId: g2, name: "Renew ISP contract (backup link)", owner: "Somsak", status: "not_started", priority: "medium", start: "2026-08-01", due: "2026-08-10", subitemsOpen: false, subitems: [], updates: [] },

        { id: uid(), groupId: g3, name: "Install core switch & firewall", owner: "Anan", status: "working", priority: "critical", start: "2026-08-07", due: "2026-08-14", subitemsOpen: false, subitems: [
          { id: uid(), name: "Rack & power-on", owner: "Anan", status: "done", date: "2026-08-08" },
          { id: uid(), name: "Base configuration", owner: "Anan", status: "working", date: "2026-08-12" }
        ], updates: [
          { id: uid(), author: "Anan", time: relTime(-25), text: "Switch stack racked and powered on. Starting firmware update before base config tonight.", likes: 2, liked: false },
          { id: uid(), author: "Preecha", time: relTime(-20), text: "Nice — ping me once firmware's done, I'll push the VLAN config.", likes: 0, liked: false }
        ] },
        { id: uid(), groupId: g3, name: "Install Wi-Fi 6 access points (all floors)", owner: "Tanawat", status: "stuck", priority: "high", start: "2026-08-10", due: "2026-08-20", subitemsOpen: false, subitems: [], updates: [
          { id: uid(), author: "Tanawat", time: relTime(-4), text: "Blocked — waiting on ceiling access permit for floors 3-5 from the building office.", likes: 0, liked: false }
        ] },
        { id: uid(), groupId: g3, name: "Configure VLAN / routing / firewall policy", owner: "Preecha", status: "not_started", priority: "critical", start: "2026-08-15", due: "2026-08-22", subitemsOpen: false, subitems: [], updates: [] },
        { id: uid(), groupId: g3, name: "Set up VPN for remote staff", owner: "Somsak", status: "not_started", priority: "medium", start: "2026-08-20", due: "2026-08-25", subitemsOpen: false, subitems: [], updates: [] },

        { id: uid(), groupId: g4, name: "Penetration test / security scan", owner: "Nok", status: "not_started", priority: "critical", start: "2026-08-26", due: "2026-08-30", subitemsOpen: false, subitems: [], updates: [] },
        { id: uid(), groupId: g4, name: "Load & failover testing", owner: "Anan", status: "not_started", priority: "high", start: "2026-08-31", due: "2026-09-03", subitemsOpen: false, subitems: [], updates: [] },
        { id: uid(), groupId: g4, name: "Go-live & handover documentation", owner: "", status: "not_started", priority: "high", start: "2026-09-04", due: "2026-09-08", subitemsOpen: false, subitems: [], updates: [] }
      ]
    };
  }

  function emptyState() {
    var g1 = uid();
    return {
      title: "New IT Project",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      groups: [{ id: g1, name: "To-Do", color: GROUP_COLORS[0], collapsed: false }],
      tasks: []
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.groups)) return parsed;
      }
    } catch (e) {}
    return seedState();
  }

  var state = loadState();
  // migrate: guarantee every task/subitem has the fields newer versions expect
  state.tasks.forEach(function (t) {
    if (!Array.isArray(t.updates)) t.updates = [];
    if (!Array.isArray(t.subitems)) t.subitems = [];
  });
  if (!state.createdAt) state.createdAt = new Date().toISOString();
  if (!state.updatedAt) state.updatedAt = state.createdAt;

  var searchQuery = "";
  var wsSearchQuery = "";
  var selected = new Set(); // "task:ID" or "sub:PARENTID:ID"
  var openPopoverGroup = null;
  var activePanelTaskId = null;
  var currentView = "workspace"; // "workspace" | "board" | "dashboard"
  var saveTimer = null;

  function persist() {
    state.updatedAt = new Date().toISOString();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }, 150);
  }

  function showToast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  // ---------------- lookups ----------------

  function findTask(id) { return state.tasks.find(function (t) { return t.id === id; }); }
  function findGroup(id) { return state.groups.find(function (g) { return g.id === id; }); }
  function findSub(taskId, subId) {
    var t = findTask(taskId);
    if (!t) return null;
    return t.subitems.find(function (s) { return s.id === subId; });
  }
  function taskMatchesSearch(t) {
    if (!searchQuery) return true;
    var q = searchQuery.toLowerCase();
    if ((t.name || "").toLowerCase().indexOf(q) !== -1) return true;
    if ((t.owner || "").toLowerCase().indexOf(q) !== -1) return true;
    return t.subitems.some(function (s) {
      return (s.name || "").toLowerCase().indexOf(q) !== -1 || (s.owner || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  // ---------------- render ----------------

  function render() {
    renderBoard();
    renderBulkBar();
    renderPanel();
    syncTitles();
    renderWorkspaceTable();
    renderSidebarProgress();
    if (currentView === "dashboard") renderDashboard();
  }

  function renderSidebarProgress() {
    var total = state.tasks.length;
    var done = state.tasks.filter(function (t) { return t.status === "done"; }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById("sbProgressPct").textContent = pct + "%";
    document.getElementById("sbProgressSub").textContent = tr("sb.progressSub").replace("{done}", done).replace("{total}", total);
  }

  // ---------------- view switching (sidebar / workspace / dashboard) ----------------

  function syncTitles() {
    document.title = (state.title || "IT Project") + " — IT Project Board";
    var boardLabel = document.getElementById("sbBoardLabel");
    if (boardLabel) boardLabel.textContent = state.title || "Untitled project";
  }

  function setView(view) {
    currentView = view;
    ["workspaceView", "boardView", "dashboardView"].forEach(function (id) {
      document.getElementById(id).classList.remove("active");
    });
    var map = { workspace: "workspaceView", board: "boardView", dashboard: "dashboardView" };
    document.getElementById(map[view]).classList.add("active");

    document.querySelectorAll(".sb-nav-item").forEach(function (el) {
      el.classList.toggle("active", el.dataset.view === view);
    });

    if (view === "dashboard") renderDashboard();
    document.getElementById("mainArea").scrollTo(0, 0);
  }

  function assetMatchesSearch(name) {
    if (!wsSearchQuery) return true;
    return name.toLowerCase().indexOf(wsSearchQuery.toLowerCase()) !== -1;
  }

  function renderWorkspaceTable() {
    var body = document.getElementById("wsTableBody");
    if (!body) return;
    var creatorSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
    var assets = [
      {
        name: state.title || "Untitled project", view: "board",
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>',
        created: state.createdAt, modified: state.updatedAt
      },
      {
        name: tr("sb.dashboard"), view: "dashboard",
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-7"/></svg>',
        created: state.createdAt, modified: state.updatedAt
      }
    ].filter(function (a) { return assetMatchesSearch(a.name); });

    body.innerHTML = assets.map(function (a) {
      return '<tr data-action="nav" data-view="' + a.view + '">' +
        '<td><input type="checkbox" onclick="event.stopPropagation()" aria-label="เลือก ' + esc(a.name) + '" /></td>' +
        '<td><div class="ws-asset-name"><div class="ws-asset-icon-chip">' + a.icon + '</div><span>' + esc(a.name) + '</span></div></td>' +
        '<td><button class="ws-ai-summary-btn" data-toast="สรุปด้วย AI ยังไม่เปิดใช้งานในตัวอย่างนี้" aria-label="AI summary">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h11M4 12h16M4 18h11"/><path d="M19 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/></svg></button></td>' +
        '<td><div class="ws-creator-avatar">' + creatorSvg + '</div></td>' +
        '<td>' + fmtLongDate(a.created) + '</td>' +
        '<td>' + fmtLongDate(a.modified) + '</td>' +
        '<td><span class="ws-folder-dash">—</span></td>' +
      '</tr>';
    }).join("") || '<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:22px;">' + tr("ws.noAssetsMatch") + '</td></tr>';
  }

  function renderDashboard() {
    var counts = { not_started: 0, working: 0, stuck: 0, done: 0 };
    state.tasks.forEach(function (t) { counts[t.status] = (counts[t.status] || 0) + 1; });
    var total = state.tasks.length;

    var titleText = state.title || "Untitled project";
    document.getElementById("dbSub").textContent = lang === "th"
      ? (total + " งาน ในทั้งหมด " + state.groups.length + " กลุ่ม ของ “" + titleText + "”")
      : (total + " task" + (total === 1 ? "" : "s") + " across " + state.groups.length + " group" + (state.groups.length === 1 ? "" : "s") + " in “" + titleText + "”");

    document.getElementById("dbTiles").innerHTML =
      dbTile(total, tr("db.totalTasks"), "") +
      dbTile(counts.not_started, statusLabel("not_started"), "") +
      dbTile(counts.working, statusLabel("working"), "working") +
      dbTile(counts.stuck, statusLabel("stuck"), "stuck") +
      dbTile(counts.done, statusLabel("done"), "done");

    var segs = [
      { key: "done", color: "var(--done-bg)", n: counts.done },
      { key: "working", color: "var(--working-bg)", n: counts.working },
      { key: "stuck", color: "var(--stuck-bg)", n: counts.stuck },
      { key: "not_started", color: "var(--notstarted-bg)", n: counts.not_started }
    ];
    document.getElementById("dbStackBar").innerHTML = total ? segs.map(function (s) {
      var pct = (s.n / total) * 100;
      return pct > 0 ? '<div class="db-stack-seg" style="width:' + pct + '%;background:' + s.color + ';"></div>' : '';
    }).join("") : "";
    document.getElementById("dbLegend").innerHTML = segs.map(function (s) {
      return '<div class="db-legend-item"><span class="db-legend-dot" style="background:' + s.color + ';"></span>' +
        statusLabel(s.key) + ' (' + s.n + ')</div>';
    }).join("");

    document.getElementById("dbGroupList").innerHTML = state.groups.map(function (g) {
      var gTasks = state.tasks.filter(function (t) { return t.groupId === g.id; });
      var gDone = gTasks.filter(function (t) { return t.status === "done"; }).length;
      var pct = gTasks.length ? Math.round((gDone / gTasks.length) * 100) : 0;
      return '<div class="db-group-row">' +
        '<div class="db-group-name" style="color:' + g.color + ';">' + esc(g.name) + '</div>' +
        '<div class="db-group-track"><div class="db-group-fill" style="width:' + pct + '%;background:' + g.color + ';"></div></div>' +
        '<div class="db-group-frac">' + gDone + ' / ' + gTasks.length + '</div>' +
      '</div>';
    }).join("");
  }

  function dbTile(num, label, cls) {
    return '<div class="db-tile ' + cls + '"><div class="db-tile-num">' + num + '</div><div class="db-tile-label">' + label + '</div></div>';
  }

  function dueIcon(status) {
    if (status === "done") {
      return '<svg class="due-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00c875" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>';
    }
    if (status === "working") {
      return '<svg class="due-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fdab3d" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
    }
    if (status === "stuck") {
      return '<svg class="due-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9699a6" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    }
    return '<span class="due-icon" style="width:14px;"></span>';
  }

  function renderBoard() {
    var board = document.getElementById("board");
    if (!state.groups.length) {
      board.innerHTML = '<div class="empty-board">' + (lang === "th"
        ? 'ยังไม่มีกลุ่มงาน — คลิก <strong>' + tr("toolbar.newTask") + '</strong> หรือเพิ่มกลุ่มเพื่อเริ่มต้น'
        : 'No groups yet — click <strong>New task</strong> or add a group to get started.') + '</div>';
      return;
    }
    board.innerHTML = state.groups.map(renderGroup).join("");
  }

  function colHeaders() {
    return '<div class="row-grid col-headers">' +
      '<div></div><div></div><div>' + tr("col.task") + '</div><div></div><div>' + tr("col.owner") + '</div>' +
      '<div>' + tr("col.status") + '</div><div>' + tr("col.dueDate") + '</div><div>' + tr("col.timeline") + '</div>' +
      '<div>' + tr("col.priority") + '</div></div>';
  }

  function renderGroup(g) {
    var allTasks = state.tasks.filter(function (t) { return t.groupId === g.id; });
    var tasks = allTasks.filter(taskMatchesSearch);
    if (searchQuery && tasks.length === 0) return "";

    var swatches = GROUP_COLORS.map(function (c) {
      return '<button class="color-dot' + (c === g.color ? ' active' : '') + '" style="background:' + c + '" ' +
        'data-action="set-color" data-group="' + g.id + '" data-color="' + c + '" aria-label="เปลี่ยนสีกลุ่ม"></button>';
    }).join("");

    var popoverOpen = openPopoverGroup === g.id;
    var popover = popoverOpen ? (
      '<div class="group-popover" data-stop="1">' +
        '<div class="group-popover-label">' + (lang === "th" ? "สีของกลุ่ม" : "Group color") + '</div>' +
        '<div class="swatch-row">' + swatches + '</div>' +
        '<button class="popover-delete" data-action="delete-group" data-group="' + g.id + '">' + (lang === "th" ? "ลบกลุ่ม" : "Delete group") + '</button>' +
      '</div>'
    ) : "";

    var rows = tasks.map(function (t) { return renderTaskBlock(t); }).join("");

    return '<div class="group' + (g.collapsed ? ' collapsed' : '') + '" data-group="' + g.id + '">' +
      '<div class="group-head" style="color:' + g.color + '">' +
        '<button class="group-collapse" data-action="toggle-collapse" data-group="' + g.id + '" aria-label="ย่อ/ขยายกลุ่ม">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<input class="group-name" style="color:' + g.color + '" data-action="rename-group" data-group="' + g.id + '" value="' + esc(g.name) + '" />' +
        '<span class="group-count">' + allTasks.length + '</span>' +
        '<div class="group-kebab-wrap' + (popoverOpen ? ' open' : '') + '">' +
          '<button class="group-kebab" data-action="toggle-popover" data-group="' + g.id + '" aria-label="ตัวเลือกกลุ่ม">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>' +
          '</button>' + popover +
        '</div>' +
      '</div>' +
      '<div class="table-wrap">' +
        (tasks.length ? colHeaders() : '') +
        rows +
        '<div class="add-task-row"><div class="add-link-row" data-action="add-task" data-group="' + g.id + '">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>' +
          tr("board.addTask") + '</div></div>' +
      '</div>' +
    '</div>';
  }

  function renderTaskBlock(t) {
    var hasSub = t.subitems.length > 0;
    var open = !!t.subitemsOpen;
    var checked = selected.has("task:" + t.id);

    var ownerHtml = t.owner
      ? '<button class="owner-avatar" style="background:' + avatarColor(t.owner) + '" data-action="edit-owner" data-task="' + t.id + '" title="' + esc(t.owner) + '">' + esc(initials(t.owner)) + '</button>'
      : '<button class="owner-avatar empty" data-action="edit-owner" data-task="' + t.id + '" title="' + tr("board.assignOwner") + '">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg></button>';

    var statusOpts = STATUS_ORDER.map(function (k) {
      return '<option value="' + k + '"' + (k === t.status ? ' selected' : '') + '>' + statusLabel(k) + '</option>';
    }).join("");
    var priOpts = PRIORITY_ORDER.map(function (k) {
      return '<option value="' + k + '"' + (k === t.priority ? ' selected' : '') + '>' + priorityLabel(k) + '</option>';
    }).join("");

    var timelineActive = t.status === "working";
    var updateCount = (t.updates || []).length;
    var bubbleHtml = '<button class="update-bubble-btn' + (updateCount ? ' has-updates' : '') + '" data-action="open-panel" data-task="' + t.id + '" title="Updates" aria-label="เปิดอัปเดตงาน">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + (updateCount ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.4 8.4 0 01-9 8.5A8.4 8.4 0 013 11.5a8.5 8.5 0 0117 0z"/></svg>' +
      (updateCount ? updateCount : '') +
    '</button>';

    var row = '<div class="row-grid task-row' + (activePanelTaskId === t.id ? ' panel-open' : '') + '" data-task="' + t.id + '">' +
      '<div class="cell row-checkbox"><input type="checkbox" data-action="select" data-key="task:' + t.id + '"' + (checked ? ' checked' : '') + ' aria-label="เลือกงาน" /></div>' +
      '<div class="cell"><button class="expand-toggle' + (open ? ' open' : '') + (hasSub ? '' : ' no-sub') + '" data-action="toggle-sub" data-task="' + t.id + '" aria-label="ขยายงานย่อย">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg></button></div>' +
      '<div class="cell task-name-cell">' +
        '<input type="text" class="task-name-input" data-field="name" data-task="' + t.id + '" value="' + esc(t.name) + '" placeholder="' + tr("board.taskPlaceholder") + '" />' +
        (hasSub ? '<span class="sub-badge" data-action="toggle-sub" data-task="' + t.id + '">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6"/></svg>' +
          t.subitems.length + '</span>' : '') +
      '</div>' +
      '<div class="cell">' + bubbleHtml + '</div>' +
      '<div class="cell">' + ownerHtml + '</div>' +
      '<div class="cell"><select class="pill status-' + t.status + '" data-field="status" data-task="' + t.id + '">' + statusOpts + '</select></div>' +
      '<div class="cell due-cell">' + dueIcon(t.status) + '<input type="date" data-field="due" data-task="' + t.id + '" value="' + esc(t.due || '') + '" /></div>' +
      '<div class="cell"><div class="timeline-pill' + (timelineActive ? ' active' : '') + '">' +
        '<input type="date" data-field="start" data-task="' + t.id + '" value="' + esc(t.start || '') + '" />' +
        '<span class="timeline-sep">–</span>' +
        '<input type="date" data-field="due2" data-task="' + t.id + '" value="' + esc(t.due || '') + '" />' +
      '</div></div>' +
      '<div class="cell"><select class="pill pri-' + t.priority + '" data-field="priority" data-task="' + t.id + '">' + priOpts + '</select></div>' +
    '</div>';

    var subPanel = "";
    if (open) {
      var subRows = t.subitems.map(function (s) { return renderSubRow(t.id, s); }).join("");
      subPanel = '<div class="subitem-panel">' +
        '<div class="sub-row-grid sub-col-headers"><div></div><div>' + tr("col.subitem") + '</div><div>' + tr("col.owner") + '</div><div>' + tr("col.status") + '</div><div>' + tr("col.date") + '</div></div>' +
        subRows +
        '<div class="add-link-row" data-action="add-sub" data-task="' + t.id + '">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>' + tr("board.addSubitem") + '</div>' +
      '</div>';
    }

    return '<div class="task-block">' + row + subPanel + '</div>';
  }

  function renderSubRow(taskId, s) {
    var checked = selected.has("sub:" + taskId + ":" + s.id);
    var ownerHtml = s.owner
      ? '<button class="owner-avatar" style="background:' + avatarColor(s.owner) + '" data-action="edit-sub-owner" data-task="' + taskId + '" data-sub="' + s.id + '" title="' + esc(s.owner) + '">' + esc(initials(s.owner)) + '</button>'
      : '<button class="owner-avatar empty" data-action="edit-sub-owner" data-task="' + taskId + '" data-sub="' + s.id + '" title="' + tr("board.assignOwner") + '">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg></button>';
    var statusOpts = STATUS_ORDER.map(function (k) {
      return '<option value="' + k + '"' + (k === s.status ? ' selected' : '') + '>' + statusLabel(k) + '</option>';
    }).join("");

    return '<div class="sub-row-grid subitem-row" data-sub="' + s.id + '">' +
      '<div class="cell row-checkbox"><input type="checkbox" data-action="select" data-key="sub:' + taskId + ':' + s.id + '"' + (checked ? ' checked' : '') + ' aria-label="เลือกงานย่อย" /></div>' +
      '<div class="cell"><input type="text" data-field="sub-name" data-task="' + taskId + '" data-sub="' + s.id + '" value="' + esc(s.name) + '" placeholder="' + tr("board.subitemPlaceholder") + '" /></div>' +
      '<div class="cell">' + ownerHtml + '</div>' +
      '<div class="cell"><select class="pill status-' + s.status + '" data-field="sub-status" data-task="' + taskId + '" data-sub="' + s.id + '">' + statusOpts + '</select></div>' +
      '<div class="cell"><input type="date" data-field="sub-date" data-task="' + taskId + '" data-sub="' + s.id + '" value="' + esc(s.date || '') + '" /></div>' +
    '</div>';
  }

  function renderBulkBar() {
    var bar = document.getElementById("bulkBar");
    var count = selected.size;
    if (count === 0) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    document.getElementById("bulkCount").textContent = count + " " + (count === 1 ? tr("bulk.itemSelected") : tr("bulk.itemsSelected"));
  }

  // ---------------- updates panel ----------------

  function openPanel(taskId) {
    activePanelTaskId = taskId;
    render();
  }

  function closePanel() {
    activePanelTaskId = null;
    renderBoard();
    renderPanel();
  }

  function renderPanel() {
    var panel = document.getElementById("updatesPanel");
    var backdrop = document.getElementById("panelBackdrop");
    var task = activePanelTaskId ? findTask(activePanelTaskId) : null;

    if (!task) {
      panel.classList.remove("open");
      backdrop.classList.remove("open");
      return;
    }

    panel.classList.add("open");
    backdrop.classList.add("open");
    document.getElementById("panelTitle").textContent = task.name || "(untitled task)";
    var updates = task.updates || [];
    document.getElementById("panelUpdatesCount").textContent = tr("panel.updates") + (updates.length ? " / " + updates.length : "");

    var listHtml = updates.length
      ? updates.map(function (u) { return renderUpdateItem(task.id, u); }).join("")
      : '<div class="no-updates">' + tr("panel.noUpdates") + '</div>';

    document.getElementById("panelBody").innerHTML =
      '<div class="panel-links-row">' +
        '<button data-toast="Update via email ยังไม่เปิดใช้งานในตัวอย่างนี้">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>' +
          tr("panel.updateViaEmail") + '</button>' +
        '<span class="panel-links-sep">|</span>' +
        '<button data-toast="ขอบคุณสำหรับความสนใจ — ฟีเจอร์นี้ยังไม่เปิดใช้งานในตัวอย่างนี้">' + tr("panel.giveFeedback") + '</button>' +
      '</div>' +
      '<div class="compose-box">' +
        '<textarea id="composeInput" placeholder="' + tr("panel.composePlaceholder") + '"></textarea>' +
        '<div class="compose-toolbar">' +
          '<button class="compose-icon-btn" data-toast="พิมพ์ @ เพื่อแท็กเพื่อนร่วมทีมได้เลย">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-4 7.5"/></svg></button>' +
          '<button class="compose-icon-btn" data-toast="แนบไฟล์ยังไม่เปิดใช้งานในตัวอย่างนี้">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11l-8.5 8.5a4 4 0 01-5.7-5.7L15 5.5a2.8 2.8 0 014 4L10.7 17.8a1.4 1.4 0 01-2-2L16 8.5"/></svg></button>' +
          '<button class="compose-icon-btn" data-toast="อีโมจิยังไม่เปิดใช้งานในตัวอย่างนี้">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg></button>' +
          '<button class="compose-icon-btn" data-toast="วาดลายเซ็นยังไม่เปิดใช้งานในตัวอย่างนี้">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17s2-1 4-1 3 2 5 2 3-2 5-2 4 1 4 1M4 13L15 2l3 3L7 16l-4 1 1-4z"/></svg></button>' +
          '<span class="compose-dot"></span>' +
          '<div class="compose-spacer"></div>' +
          '<button class="post-btn" id="postUpdateBtn">' + tr("panel.postUpdate") + '</button>' +
        '</div>' +
      '</div>' +
      listHtml;
  }

  function renderUpdateItem(taskId, u) {
    return '<div class="update-item">' +
      '<div class="update-avatar" style="background:' + avatarColor(u.author) + '">' + esc(initials(u.author)) + '</div>' +
      '<div class="update-main">' +
        '<div class="update-head"><span class="update-author">' + esc(u.author || "You") + '</span><span class="update-time">' + timeAgo(u.time) + '</span></div>' +
        '<div class="update-text">' + esc(u.text) + '</div>' +
        '<div class="update-actions">' +
          '<button class="update-action-btn' + (u.liked ? ' liked' : '') + '" data-action="toggle-like" data-task="' + taskId + '" data-update="' + u.id + '">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + (u.liked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M7 22V11M2 13v7a2 2 0 002 2h12.6a2 2 0 002-1.7l1.3-8a2 2 0 00-2-2.3H14V5a2 2 0 00-2-2l-2 7H2z"/></svg>' +
            (u.likes ? u.likes + " " : "") + tr("panel.like") + '</button>' +
          '<button class="update-action-btn" data-action="focus-reply">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17l-5-5 5-5M4 12h11a5 5 0 015 5v1"/></svg>' + tr("panel.reply") + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function postUpdate(taskId, text, source) {
    var clean = (text || "").trim();
    if (!clean) return;
    var t = findTask(taskId);
    if (!t) return;
    t.updates = t.updates || [];
    t.updates.push({ id: uid(), author: "You", time: new Date().toISOString(), text: clean, likes: 0, liked: false });
    persist();
    render();
    if (source === "compose") {
      var el = document.getElementById("composeInput");
      if (el) el.focus();
    }
  }

  function toggleLike(taskId, updateId) {
    var t = findTask(taskId);
    if (!t) return;
    var u = (t.updates || []).find(function (x) { return x.id === updateId; });
    if (!u) return;
    u.liked = !u.liked;
    u.likes = Math.max(0, (u.likes || 0) + (u.liked ? 1 : -1));
    persist(); renderPanel();
  }

  // ---------------- mutations ----------------

  function addGroup() {
    state.groups.push({ id: uid(), name: "New group", color: GROUP_COLORS[state.groups.length % GROUP_COLORS.length], collapsed: false });
    persist(); render();
  }

  function firstOpenGroupId() {
    var g = state.groups.find(function (g) { return !g.collapsed; }) || state.groups[0];
    return g ? g.id : null;
  }

  function addTask(groupId) {
    if (!groupId) return;
    var t = { id: uid(), groupId: groupId, name: "", owner: "", status: "not_started", priority: "medium", start: "", due: "", subitemsOpen: false, subitems: [], updates: [] };
    state.tasks.push(t);
    persist(); render();
    var el = document.querySelector('.task-row[data-task="' + t.id + '"] .task-name-input');
    if (el) el.focus();
  }

  function addSubitem(taskId) {
    var t = findTask(taskId);
    if (!t) return;
    t.subitemsOpen = true;
    t.subitems.push({ id: uid(), name: "", owner: "", status: "not_started", date: "" });
    persist(); render();
    var el = document.querySelector('.subitem-row:last-child input[data-field="sub-name"][data-task="' + taskId + '"]');
    if (el) el.focus();
  }

  function deleteSelected() {
    var n = selected.size;
    if (!n) return;
    if (!confirm('Delete ' + n + ' selected item(s)? This cannot be undone.')) return;
    selected.forEach(function (key) {
      var parts = key.split(":");
      if (parts[0] === "task") {
        state.tasks = state.tasks.filter(function (t) { return t.id !== parts[1]; });
      } else if (parts[0] === "sub") {
        var t = findTask(parts[1]);
        if (t) t.subitems = t.subitems.filter(function (s) { return s.id !== parts[2]; });
      }
    });
    selected.clear();
    persist(); render();
    showToast("Deleted " + n + " item(s)");
  }

  function exportSelected() {
    var tasks = [];
    selected.forEach(function (key) {
      var parts = key.split(":");
      if (parts[0] === "task") { var t = findTask(parts[1]); if (t) tasks.push(t); }
    });
    doExport(tasks.length ? { title: state.title, groups: state.groups, tasks: tasks } : state);
  }

  async function doExport(data) {
    var json = JSON.stringify(data, null, 2);
    var rawTitle = (state.title || "it-project-board").trim();
    var filename = (rawTitle.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_") || "it-project-board").slice(0, 60) + ".json";
    if (window.claude && window.claude.downloads) {
      try {
        await window.claude.downloads.save({ filename: filename, data: json });
        showToast("Saved " + filename);
      } catch (err) {
        showToast(err && err.code === "declined" ? "Save cancelled" : "Couldn't save the file right now");
      }
    } else {
      showToast("File downloads aren't available in this view");
    }
  }

  // ---------------- events ----------------

  document.body.addEventListener("click", function (e) {
    var toastEl = e.target.closest("[data-toast]");
    if (toastEl) { showToast(toastEl.getAttribute("data-toast")); }
    var navEl = e.target.closest('[data-action="nav"]');
    if (navEl) { setView(navEl.dataset.view); }
  });

  // ---------------- language toggle ----------------

  document.getElementById("langToggleBtn").addEventListener("click", function () {
    setLang(lang === "en" ? "th" : "en");
    showToast(lang === "th" ? "เปลี่ยนเมนูเป็นภาษาไทยแล้ว" : "Switched menu to English");
  });

  // ---------------- sidebar ----------------

  var sidebarEl = document.getElementById("sidebar");
  document.getElementById("sidebarCollapseBtn").addEventListener("click", function () {
    sidebarEl.classList.add("collapsed");
    document.getElementById("sidebarReopenBtn").classList.add("show");
  });
  document.getElementById("sidebarReopenBtn").addEventListener("click", function () {
    sidebarEl.classList.remove("collapsed");
    document.getElementById("sidebarReopenBtn").classList.remove("show");
  });

  var sbContentLabel = document.getElementById("sbContentLabel");
  var sbNavList = document.getElementById("sbNavList");
  sbContentLabel.addEventListener("click", function () {
    sbContentLabel.classList.toggle("collapsed");
    sbNavList.classList.toggle("collapsed");
  });

  // ---------------- workspace view: search + cleanup toggle ----------------

  var wsSearchInputEl = document.getElementById("wsSearchInput");
  wsSearchInputEl.addEventListener("input", function (e) { wsSearchQuery = e.target.value; renderWorkspaceTable(); });
  document.getElementById("wsSearchBox").addEventListener("focusin", function () { this.classList.add("focused"); });
  document.getElementById("wsSearchBox").addEventListener("focusout", function () { this.classList.remove("focused"); });

  document.getElementById("cleanupToggle").addEventListener("change", function (e) {
    showToast(e.target.checked ? "Cleanup mode ยังไม่เปิดใช้งานในตัวอย่างนี้" : "ปิด cleanup mode แล้ว");
  });

  document.getElementById("boardTitle").addEventListener("input", function (e) { state.title = e.target.value; persist(); });

  document.getElementById("newTaskBtn").addEventListener("click", function () { addTask(firstOpenGroupId()); });
  document.getElementById("newTaskCaret").addEventListener("click", function () {});

  var searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", function (e) { searchQuery = e.target.value; renderBoard(); });
  searchInput.addEventListener("focus", function () { document.getElementById("searchBox").classList.add("focused"); });
  searchInput.addEventListener("blur", function () { document.getElementById("searchBox").classList.remove("focused"); });

  document.getElementById("collapseAllBtn").addEventListener("click", function (btn) {
    var el = document.getElementById("collapseAllBtn");
    var willCollapse = !el.classList.contains("collapsed");
    state.groups.forEach(function (g) { g.collapsed = willCollapse; });
    el.classList.toggle("collapsed", willCollapse);
    persist(); render();
  });

  document.getElementById("bulkDeleteBtn").addEventListener("click", deleteSelected);
  document.getElementById("bulkExportBtn").addEventListener("click", exportSelected);
  document.getElementById("bulkCancelBtn").addEventListener("click", function () { selected.clear(); render(); });

  document.addEventListener("click", function (e) {
    if (openPopoverGroup && !e.target.closest(".group-popover") && !e.target.closest('[data-action="toggle-popover"]')) {
      openPopoverGroup = null;
      renderBoard();
    }
  });

  var board = document.getElementById("board");

  board.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.dataset.action;

    if (action === "add-task") addTask(el.dataset.group);
    if (action === "add-sub") addSubitem(el.dataset.task);
    if (action === "open-panel") openPanel(el.dataset.task);

    if (action === "toggle-collapse") {
      findGroup(el.dataset.group).collapsed = !findGroup(el.dataset.group).collapsed;
      persist(); render();
    }
    if (action === "toggle-sub") {
      var t = findTask(el.dataset.task);
      t.subitemsOpen = !t.subitemsOpen;
      persist(); render();
    }
    if (action === "set-color") {
      findGroup(el.dataset.group).color = el.dataset.color;
      persist(); render();
    }
    if (action === "toggle-popover") {
      openPopoverGroup = openPopoverGroup === el.dataset.group ? null : el.dataset.group;
      render();
    }
    if (action === "delete-group") {
      var gid = el.dataset.group, g = findGroup(gid);
      var count = state.tasks.filter(function (t) { return t.groupId === gid; }).length;
      if (count && !confirm('Delete group "' + g.name + '" and its ' + count + ' task(s)?')) return;
      state.groups = state.groups.filter(function (x) { return x.id !== gid; });
      state.tasks = state.tasks.filter(function (t) { return t.groupId !== gid; });
      openPopoverGroup = null;
      persist(); render();
    }
    if (action === "select") {
      var key = el.dataset.key;
      if (el.checked) selected.add(key); else selected.delete(key);
      renderBulkBar();
    }
    if (action === "edit-owner" || action === "edit-sub-owner") {
      var isSub = action === "edit-sub-owner";
      var item = isSub ? findSub(el.dataset.task, el.dataset.sub) : findTask(el.dataset.task);
      if (!item) return;
      var input = document.createElement("input");
      input.type = "text"; input.className = "owner-input"; input.value = item.owner || ""; input.placeholder = "Name";
      el.replaceWith(input); input.focus(); input.select();
      var commit = function () {
        item.owner = input.value.trim();
        persist(); render();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") input.blur(); if (ev.key === "Escape") { item.owner = item.owner || ""; render(); } });
    }
  });

  board.addEventListener("input", function (e) {
    var el = e.target;
    var field = el.dataset.field;
    if (!field) return;

    if (field === "rename-group") { findGroup(el.dataset.group).name = el.value; persist(); return; }

    var taskId = el.dataset.task;
    var t = findTask(taskId);
    if (!t) return;

    if (field === "sub-name" || field === "sub-status" || field === "sub-date") {
      var s = findSub(taskId, el.dataset.sub);
      if (!s) return;
      if (field === "sub-name") s.name = el.value;
      if (field === "sub-status") { s.status = el.value; el.className = "pill status-" + el.value; }
      if (field === "sub-date") s.date = el.value;
      persist();
      return;
    }

    if (field === "name") t.name = el.value;
    if (field === "start") t.start = el.value;
    if (field === "due" || field === "due2") {
      t.due = el.value;
      // keep the mirrored due-date input (in due-cell) and timeline input in sync without a full re-render
      document.querySelectorAll('input[data-task="' + taskId + '"][data-field="due"], input[data-task="' + taskId + '"][data-field="due2"]').forEach(function (mirror) {
        if (mirror !== el) mirror.value = el.value;
      });
    }
    if (field === "status") {
      t.status = el.value;
      el.className = "pill status-" + el.value;
      persist(); render();
      return;
    }
    if (field === "priority") {
      t.priority = el.value;
      el.className = "pill pri-" + el.value;
    }
    persist();
  });

  // ---------------- top menu: load sample / reset ----------------

  var topMenuBtn = document.getElementById("topMenuBtn");
  var topMenuPopover = document.getElementById("topMenuPopover");
  topMenuBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    topMenuPopover.style.display = topMenuPopover.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", function (e) {
    if (topMenuPopover.style.display !== "none" && !e.target.closest("#topMenuPopover") && e.target !== topMenuBtn) {
      topMenuPopover.style.display = "none";
    }
  });
  document.getElementById("loadSampleBtn").addEventListener("click", function () {
    state = seedState();
    activePanelTaskId = null; selected.clear();
    document.getElementById("boardTitle").value = state.title || "";
    topMenuPopover.style.display = "none";
    persist(); render();
    showToast("Loaded sample project");
  });
  document.getElementById("resetBoardBtn").addEventListener("click", function () {
    if (!confirm("Clear all board data and start fresh? This cannot be undone.")) return;
    state = emptyState();
    activePanelTaskId = null; selected.clear();
    document.getElementById("boardTitle").value = state.title || "";
    topMenuPopover.style.display = "none";
    persist(); render();
    showToast("Board cleared");
  });

  // ---------------- updates panel events ----------------

  document.getElementById("panelCloseBtn").addEventListener("click", closePanel);
  document.getElementById("panelBackdrop").addEventListener("click", closePanel);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && activePanelTaskId) closePanel();
  });

  document.getElementById("updatesPanel").addEventListener("click", function (e) {
    if (!activePanelTaskId) return;
    if (e.target.closest("#postUpdateBtn")) {
      var input = document.getElementById("composeInput");
      postUpdate(activePanelTaskId, input.value, "compose");
      return;
    }
    var likeEl = e.target.closest('[data-action="toggle-like"]');
    if (likeEl) { toggleLike(likeEl.dataset.task, likeEl.dataset.update); return; }
    if (e.target.closest('[data-action="focus-reply"]')) {
      var reply = document.getElementById("replyInput");
      if (reply) reply.focus();
    }
  });

  var replyInputEl = document.getElementById("replyInput");
  replyInputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && activePanelTaskId) {
      e.preventDefault();
      postUpdate(activePanelTaskId, replyInputEl.value, "reply");
      replyInputEl.value = "";
    }
  });

  document.getElementById("boardTitle").value = state.title || "";
  applyI18n();
  render();
  setView("workspace");
  window.addEventListener("beforeunload", function () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  });
})();
