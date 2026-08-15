// ============================================================================
// shared.js — state, i18n, date/duration math, API calls, and sidebar wiring
// used by all three pages: workspace.html, board.html, dashboard.html.
//
// Everything lives on the global `PM` namespace so each page's own inline
// <script> (which still owns its page-specific rendering and event wiring,
// same style as the original single-file app) can call PM.xxx directly.
// ============================================================================
(function () {
  "use strict";

  var PM = window.PM = {};

  PM.STORAGE_KEY = "engineer-pm-board-v2";
  PM.CURRENT_PROJECT_KEY = "engineer-pm-board-current-project";
  PM.LANG_KEY = "engineer-pm-board-lang";
  PM.AUTH_TOKEN_KEY = "engineer-pm-board-auth-token";
  PM.AUTH_USER_KEY = "engineer-pm-board-auth-user";
  PM.API_BASE = "http://localhost:8790/api";

  PM.STATUS_ORDER = ["not_started", "working", "stuck", "done"];
  PM.PRIORITY_ORDER = ["critical", "high", "medium", "low"];
  PM.GROUP_COLORS = ["#c47f00", "#0891b2", "#00c875", "#784bd1", "#579bfc", "#e2445c"];
  PM.AVATAR_COLORS = ["#579bfc", "#a25ddc", "#00c875", "#c47f00", "#ff642e", "#0891b2", "#784bd1", "#e2445c"];
  PM.MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  PM.WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  // ---------------- i18n ----------------

  PM.I18N = {
    en: {
      "sb.workspace": "Workspace", "sb.mainWorkspace": "Fatima workspace", "sb.myAgents": "My agents",
      "sb.content": "Content", "sb.manageWorkspace": "Manage workspace", "sb.dashboard": "Dashboard and reporting",
      "sb.manageUsers": "Manage users",
      "sb.caption": "Project management", "sb.progressLabel": "Project progress", "sb.progressBtn": "View details",
      "sb.progressSub": "{done}/{total} tasks completed",
      "ws.addDescription": "Add workspace description", "ws.feedback": "Feedback", "ws.agents": "Agents",
      "ws.members": "Members", "ws.recents": "Recents", "ws.content": "Content", "ws.collaborators": "Collaborators",
      "ws.permissions": "Permissions", "ws.aiCredits": "AI credits won't be charged", "ws.filters": "Filters",
      "ws.newProject": "New project", "ws.newProjectPrompt": "Project name",
      "ws.membersPanelTitle": "Workspace members",
      "ws.addMemberNamePlaceholder": "Full name", "ws.addMemberEmailPlaceholder": "email@company.com",
      "ws.addMemberBtn": "Add",
      "ws.noCleanup": "No cleanup suggestions found", "ws.cleanupMode": "Cleanup mode",
      "ws.assetName": "Asset name", "ws.aiSummary": "AI summary", "ws.creator": "Creator",
      "ws.creationDate": "Creation date", "ws.lastModified": "Last modified", "ws.folder": "Folder",
      "ws.noAssetsMatch": "No assets match your search.",
      "db.statusBreakdown": "Status breakdown", "db.totalTasks": "Total tasks",
      "db.summary": "{n} task{s} across {g} group{gs} in “{title}”",
      "db.projectDuration": "Project duration", "db.days": "days", "db.budgetTag": "budget",
      "db.gantt": "Gantt chart — activity timeline",
      "db.noTimeline": "Add start & due dates to tasks to see the project timeline",
      "tb.aiSuggestions": "AI suggestions", "tb.new": "New", "tb.integrate": "Integrate", "tb.automate": "Automate",
      "tb.invite": "Invite", "tab.mainTable": "Main table",
      "tb.invitePanelTitle": "Invite to this project", "tb.inviteHint": "Pick who can see and edit this board",
      "tb.inviteAdd": "Invite", "tb.inviteRemove": "Remove", "tb.inviteAdded": "Added to project",
      "tb.inviteRemoved": "Removed from project", "tb.inviteError": "Could not update project members",
      "toolbar.newTask": "New task", "toolbar.person": "Person", "toolbar.filter": "Filter", "toolbar.sort": "Sort",
      "toolbar.hide": "Hide", "toolbar.groupBy": "Group by", "toolbar.hideColumns": "Hide columns",
      "topmenu.boardData": "Board data", "topmenu.loadSample": "Load sample project", "topmenu.resetBoard": "Reset board (clear all)",
      "common.search": "Search",
      "col.task": "Task", "col.owner": "Owner", "col.status": "Status", "col.dueDate": "Due date",
      "col.timeline": "Timeline", "col.priority": "Priority", "col.subitem": "Subitem", "col.date": "Date",
      "board.addTask": "Add task", "board.addSubitem": "Add subitem",
      "board.taskPlaceholder": "Task name", "board.subitemPlaceholder": "Subitem name", "board.assignOwner": "Assign owner",
      "board.setDates": "Set dates", "board.daysSelected": "days selected",
      "board.overdueBy": "{n} day{s} overdue",
      "board.totalDaysLabel": "Total project days",
      "board.allocatedDays": "{used} / {total} days allocated",
      "board.allocatedOverBy": "over by {n} day{s}",
      "board.budgetWarnToast": "Activities now total {used} days — {n} day{s} over your {total}-day budget",
      "board.save": "Save", "board.budgetSaved": "Project day budget saved",
      "status.not_started": "Not started", "status.working": "Working on it", "status.stuck": "Stuck", "status.done": "Done",
      "pri.critical": "Critical", "pri.high": "High", "pri.medium": "Medium", "pri.low": "Low",
      "bulk.export": "Export", "bulk.delete": "Delete", "bulk.cancel": "Cancel",
      "bulk.itemSelected": "item selected", "bulk.itemsSelected": "items selected",
      "panel.updates": "Updates", "panel.files": "Files", "panel.activityLog": "Activity Log",
      "panel.updateViaEmail": "Update via email", "panel.giveFeedback": "Give feedback",
      "panel.composePlaceholder": "Write an update and mention others with @", "panel.postUpdate": "Post update",
      "panel.replyPlaceholder": "Write a reply and mention others with @",
      "panel.noUpdates": "No updates yet — be the first to post one.", "panel.like": "Like", "panel.reply": "Reply",
      "users.title": "Manage users", "users.sub": "{n} user{s} in this workspace",
      "users.name": "Name", "users.email": "Email", "users.role": "Role", "users.actions": "Actions",
      "users.namePlaceholder": "Full name", "users.emailPlaceholder": "email@company.com",
      "users.addUser": "Add user", "users.noUsers": "No users yet — add the first one.",
      "users.password": "Password", "users.passwordPlaceholder": "New password (optional)",
      "users.save": "Save", "users.deleteAction": "Remove",
      "users.deleteConfirm": "Remove {name} from this workspace?",
      "users.role.admin": "Admin", "users.role.member": "Member", "users.role.viewer": "Viewer",
      "users.userAdded": "User added", "users.userUpdated": "User updated", "users.userRemoved": "User removed",
      "users.nameRequired": "Name is required", "users.loadError": "Could not load users (API unreachable)",
      "users.saveError": "Could not save user", "users.deleteError": "Could not remove user",
      "users.unassignedGroup": "Unassigned",
      "auth.title": "Log in", "auth.identifier": "Name or email", "auth.password": "Password",
      "auth.loginBtn": "Log in", "auth.loggingIn": "Logging in…",
      "auth.claimLink": "First time here? Set up your password",
      "auth.backToLogin": "Back to log in",
      "auth.claimTitle": "Set up your password", "auth.claimIntro": "If an admin already added you in Manage users, claim your account here.",
      "auth.claimIdentifier": "Your name or email", "auth.claimEmail": "Email (optional, if not set yet)",
      "auth.claimPassword": "Choose a password", "auth.claimBtn": "Set password & log in",
      "auth.setupTitle": "Create the admin account", "auth.setupIntro": "No users yet — create the first admin account to get started.",
      "auth.setupName": "Your name", "auth.setupEmail": "Email", "auth.setupPassword": "Choose a password",
      "auth.setupBtn": "Create account & log in",
      "auth.loggedInAs": "Logged in as {name}", "auth.logout": "Log out",
      "auth.genericError": "Something went wrong — try again", "auth.passwordHint": "At least 6 characters",
      "lang.switchTo": "ไทย"
    },
    th: {
      "sb.workspace": "เวิร์กสเปซ", "sb.mainWorkspace": "Fatima workspace", "sb.myAgents": "เอเจนต์ของฉัน",
      "sb.content": "เนื้อหา", "sb.manageWorkspace": "จัดการเวิร์กสเปซ", "sb.dashboard": "แดชบอร์ดและรายงาน",
      "sb.manageUsers": "จัดการผู้ใช้งาน",
      "sb.caption": "ระบบจัดการโปรเจกต์", "sb.progressLabel": "ความคืบหน้าโครงการ", "sb.progressBtn": "ดูรายละเอียด",
      "sb.progressSub": "ทำเสร็จแล้ว {done}/{total} งาน",
      "ws.addDescription": "เพิ่มคำอธิบายเวิร์กสเปซ", "ws.feedback": "ข้อเสนอแนะ", "ws.agents": "เอเจนต์",
      "ws.members": "สมาชิก", "ws.recents": "ล่าสุด", "ws.content": "เนื้อหา", "ws.collaborators": "ผู้ร่วมงาน",
      "ws.permissions": "สิทธิ์การเข้าถึง", "ws.aiCredits": "จะไม่มีการเรียกเก็บเครดิต AI", "ws.filters": "ตัวกรอง",
      "ws.newProject": "โปรเจกต์ใหม่", "ws.newProjectPrompt": "ชื่อโปรเจกต์",
      "ws.membersPanelTitle": "สมาชิกในเวิร์กสเปซ",
      "ws.addMemberNamePlaceholder": "ชื่อ-นามสกุล", "ws.addMemberEmailPlaceholder": "email@company.com",
      "ws.addMemberBtn": "เพิ่ม",
      "ws.noCleanup": "ไม่พบคำแนะนำในการจัดระเบียบ", "ws.cleanupMode": "โหมดจัดระเบียบ",
      "ws.assetName": "ชื่อไฟล์งาน", "ws.aiSummary": "สรุปโดย AI", "ws.creator": "ผู้สร้าง",
      "ws.creationDate": "วันที่สร้าง", "ws.lastModified": "แก้ไขล่าสุด", "ws.folder": "โฟลเดอร์",
      "ws.noAssetsMatch": "ไม่พบรายการที่ตรงกับการค้นหา",
      "db.statusBreakdown": "สัดส่วนตามสถานะ", "db.totalTasks": "งานทั้งหมด",
      "db.summary": "{n} งาน ใน {g} กลุ่ม ของ “{title}”",
      "db.projectDuration": "ระยะเวลาโครงการ", "db.days": "วัน", "db.budgetTag": "งบที่ตั้งไว้",
      "db.gantt": "แผนภูมิแกนต์ — ไทม์ไลน์กิจกรรม",
      "db.noTimeline": "เพิ่มวันเริ่มต้นและวันกำหนดเสร็จให้กับงานเพื่อดูไทม์ไลน์โครงการ",
      "tb.aiSuggestions": "คำแนะนำ AI", "tb.new": "ใหม่", "tb.integrate": "เชื่อมต่อ", "tb.automate": "ระบบอัตโนมัติ",
      "tb.invite": "เชิญ", "tab.mainTable": "ตารางหลัก",
      "tb.invitePanelTitle": "เชิญเข้าโครงการนี้", "tb.inviteHint": "เลือกคนที่จะเห็นและแก้ไขบอร์ดนี้ได้",
      "tb.inviteAdd": "เชิญ", "tb.inviteRemove": "นำออก", "tb.inviteAdded": "เพิ่มเข้าโครงการแล้ว",
      "tb.inviteRemoved": "นำออกจากโครงการแล้ว", "tb.inviteError": "อัปเดตสมาชิกโครงการไม่สำเร็จ",
      "toolbar.newTask": "งานใหม่", "toolbar.person": "บุคคล", "toolbar.filter": "กรอง", "toolbar.sort": "เรียงลำดับ",
      "toolbar.hide": "ซ่อน", "toolbar.groupBy": "จัดกลุ่มตาม", "toolbar.hideColumns": "ซ่อนคอลัมน์",
      "topmenu.boardData": "ข้อมูลบอร์ด", "topmenu.loadSample": "โหลดโปรเจกต์ตัวอย่าง", "topmenu.resetBoard": "ล้างบอร์ด (ลบทั้งหมด)",
      "common.search": "ค้นหา",
      "col.task": "งาน", "col.owner": "ผู้รับผิดชอบ", "col.status": "สถานะ", "col.dueDate": "กำหนดเสร็จ",
      "col.timeline": "ไทม์ไลน์", "col.priority": "ความสำคัญ", "col.subitem": "งานย่อย", "col.date": "วันที่",
      "board.addTask": "เพิ่มงาน", "board.addSubitem": "เพิ่มงานย่อย",
      "board.taskPlaceholder": "ชื่องาน", "board.subitemPlaceholder": "ชื่องานย่อย", "board.assignOwner": "มอบหมายผู้รับผิดชอบ",
      "board.setDates": "ตั้งค่าวันที่", "board.daysSelected": "วันที่เลือก",
      "board.overdueBy": "เกินกำหนด {n} วัน",
      "board.totalDaysLabel": "จำนวนวันทั้งหมดของโครงการ",
      "board.allocatedDays": "จัดสรรแล้ว {used} / {total} วัน",
      "board.allocatedOverBy": "เกิน {n} วัน",
      "board.budgetWarnToast": "กิจกรรมรวมแล้ว {used} วัน — เกินงบ {total} วัน อยู่ {n} วัน",
      "board.save": "บันทึก", "board.budgetSaved": "บันทึกจำนวนวันโครงการแล้ว",
      "status.not_started": "ยังไม่เริ่ม", "status.working": "กำลังดำเนินการ", "status.stuck": "ติดปัญหา", "status.done": "เสร็จแล้ว",
      "pri.critical": "วิกฤต", "pri.high": "สูง", "pri.medium": "ปานกลาง", "pri.low": "ต่ำ",
      "bulk.export": "ส่งออก", "bulk.delete": "ลบ", "bulk.cancel": "ยกเลิก",
      "bulk.itemSelected": "รายการที่เลือก", "bulk.itemsSelected": "รายการที่เลือก",
      "panel.updates": "อัปเดต", "panel.files": "ไฟล์", "panel.activityLog": "บันทึกกิจกรรม",
      "panel.updateViaEmail": "อัปเดตผ่านอีเมล", "panel.giveFeedback": "ให้ข้อเสนอแนะ",
      "panel.composePlaceholder": "เขียนอัปเดตและแท็กเพื่อนร่วมทีมด้วย @", "panel.postUpdate": "โพสต์อัปเดต",
      "panel.replyPlaceholder": "เขียนตอบกลับและแท็กเพื่อนร่วมทีมด้วย @",
      "panel.noUpdates": "ยังไม่มีอัปเดต — เป็นคนแรกที่โพสต์เลย", "panel.like": "ถูกใจ", "panel.reply": "ตอบกลับ",
      "users.title": "จัดการผู้ใช้งาน", "users.sub": "มีผู้ใช้งาน {n} คนในเวิร์กสเปซนี้",
      "users.name": "ชื่อ", "users.email": "อีเมล", "users.role": "บทบาท", "users.actions": "จัดการ",
      "users.namePlaceholder": "ชื่อ-นามสกุล", "users.emailPlaceholder": "email@company.com",
      "users.addUser": "เพิ่มผู้ใช้งาน", "users.noUsers": "ยังไม่มีผู้ใช้งาน — เพิ่มคนแรกได้เลย",
      "users.password": "รหัสผ่าน", "users.passwordPlaceholder": "รหัสผ่านใหม่ (ไม่บังคับ)",
      "users.save": "บันทึก", "users.deleteAction": "ลบ",
      "users.deleteConfirm": "ลบ {name} ออกจากเวิร์กสเปซนี้?",
      "users.role.admin": "ผู้ดูแลระบบ", "users.role.member": "สมาชิก", "users.role.viewer": "ผู้ดูอย่างเดียว",
      "users.userAdded": "เพิ่มผู้ใช้งานแล้ว", "users.userUpdated": "อัปเดตผู้ใช้งานแล้ว", "users.userRemoved": "ลบผู้ใช้งานแล้ว",
      "users.nameRequired": "กรุณาระบุชื่อ", "users.loadError": "โหลดรายชื่อผู้ใช้งานไม่ได้ (เชื่อมต่อ API ไม่ได้)",
      "users.saveError": "บันทึกผู้ใช้งานไม่สำเร็จ", "users.deleteError": "ลบผู้ใช้งานไม่สำเร็จ",
      "users.unassignedGroup": "ไม่ระบุกลุ่ม",
      "auth.title": "เข้าสู่ระบบ", "auth.identifier": "ชื่อหรืออีเมล", "auth.password": "รหัสผ่าน",
      "auth.loginBtn": "เข้าสู่ระบบ", "auth.loggingIn": "กำลังเข้าสู่ระบบ…",
      "auth.claimLink": "เข้าใช้งานครั้งแรก? ตั้งรหัสผ่านที่นี่",
      "auth.backToLogin": "กลับไปหน้าเข้าสู่ระบบ",
      "auth.claimTitle": "ตั้งรหัสผ่านของคุณ", "auth.claimIntro": "ถ้าผู้ดูแลระบบเพิ่มชื่อคุณไว้ใน จัดการผู้ใช้งาน แล้ว ตั้งรหัสผ่านเพื่อยืนยันตัวตนได้ที่นี่",
      "auth.claimIdentifier": "ชื่อหรืออีเมลของคุณ", "auth.claimEmail": "อีเมล (ถ้ายังไม่มีในระบบ ใส่ตรงนี้ได้)",
      "auth.claimPassword": "ตั้งรหัสผ่าน", "auth.claimBtn": "ตั้งรหัสผ่านและเข้าสู่ระบบ",
      "auth.setupTitle": "สร้างบัญชีผู้ดูแลระบบ", "auth.setupIntro": "ยังไม่มีผู้ใช้งาน — สร้างบัญชีผู้ดูแลระบบคนแรกเพื่อเริ่มต้นใช้งาน",
      "auth.setupName": "ชื่อของคุณ", "auth.setupEmail": "อีเมล", "auth.setupPassword": "ตั้งรหัสผ่าน",
      "auth.setupBtn": "สร้างบัญชีและเข้าสู่ระบบ",
      "auth.loggedInAs": "เข้าสู่ระบบในชื่อ {name}", "auth.logout": "ออกจากระบบ",
      "auth.genericError": "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", "auth.passwordHint": "อย่างน้อย 6 ตัวอักษร",
      "lang.switchTo": "EN"
    }
  };

  function loadLang() {
    try {
      var saved = localStorage.getItem(PM.LANG_KEY);
      if (saved === "en" || saved === "th") return saved;
    } catch (e) {}
    return "en";
  }
  PM.lang = loadLang();

  PM.tr = function (key) {
    var dict = PM.I18N[PM.lang] || PM.I18N.en;
    return (key in dict) ? dict[key] : (PM.I18N.en[key] || key);
  };
  PM.statusLabel = function (k) { return PM.tr("status." + k); };
  PM.priorityLabel = function (k) { return PM.tr("pri." + k); };

  PM.applyI18n = function () {
    document.documentElement.lang = PM.lang === "th" ? "th" : "en";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = PM.tr(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.placeholder = PM.tr(el.getAttribute("data-i18n-placeholder"));
    });
    var toggleLabel = document.getElementById("langToggleLabel");
    if (toggleLabel) toggleLabel.textContent = PM.tr("lang.switchTo");
  };

  // Updates PM.lang + re-applies static text. Does NOT re-render page-specific
  // dynamic content — call your page's own render() after this if needed.
  PM.setLang = function (next) {
    PM.lang = next === "th" ? "th" : "en";
    try { localStorage.setItem(PM.LANG_KEY, PM.lang); } catch (e) {}
    PM.applyI18n();
  };

  // ---------------- small pure helpers ----------------

  PM.uid = function () { return Math.random().toString(36).slice(2, 10); };
  PM.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  PM.avatarColor = function (name) {
    if (!name) return "#c4c6d3";
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return PM.AVATAR_COLORS[h % PM.AVATAR_COLORS.length];
  };
  PM.initials = function (name) {
    if (!name) return "";
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] || "").toUpperCase();
  };
  PM.fmtDate = function (s) {
    if (!s) return "";
    var d = new Date(s + "T00:00:00");
    if (isNaN(d)) return s;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  PM.fmtRangeEnd = function (startS, endS) {
    if (!endS) return "";
    var dEnd = new Date(endS + "T00:00:00");
    if (isNaN(dEnd)) return endS;
    var dStart = startS ? new Date(startS + "T00:00:00") : null;
    if (dStart && !isNaN(dStart) && dStart.getMonth() === dEnd.getMonth() && dStart.getFullYear() === dEnd.getFullYear()) {
      return String(dEnd.getDate());
    }
    return PM.fmtDate(endS);
  };
  PM.fmtDuration = function (startS, endS) {
    if (!startS || !endS) return "";
    var dStart = new Date(startS + "T00:00:00");
    var dEnd = new Date(endS + "T00:00:00");
    if (isNaN(dStart) || isNaN(dEnd)) return "";
    var days = Math.round((dEnd - dStart) / 86400000) + 1;
    if (days < 1) return "";
    return days + "d";
  };
  PM.pad2 = function (n) { return n < 10 ? "0" + n : "" + n; };
  PM.todayIso = function () {
    var d = new Date();
    return d.getFullYear() + "-" + PM.pad2(d.getMonth() + 1) + "-" + PM.pad2(d.getDate());
  };
  PM.isoToMDY = function (iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return p[1] + "/" + p[2] + "/" + p[0];
  };
  PM.mdyToIso = function (mdy) {
    var m = (mdy || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    var iso = m[3] + "-" + PM.pad2(+m[1]) + "-" + PM.pad2(+m[2]);
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return null;
    return iso;
  };
  PM.daysBetweenInclusive = function (a, b) {
    if (!a || !b) return 0;
    var d1 = new Date(a + "T00:00:00"), d2 = new Date(b + "T00:00:00");
    if (isNaN(d1) || isNaN(d2)) return 0;
    return Math.round((d2 - d1) / 86400000) + 1;
  };
  PM.overdueDays = function (due, status) {
    if (!due || status === "done") return 0;
    var dDue = new Date(due + "T00:00:00");
    var dToday = new Date(PM.todayIso() + "T00:00:00");
    if (isNaN(dDue)) return 0;
    var diff = Math.round((dToday - dDue) / 86400000);
    return diff > 0 ? diff : 0;
  };
  PM.overdueLabel = function (n) {
    return PM.tr("board.overdueBy").replace("{n}", n).replace("{s}", n === 1 ? "" : "s");
  };
  PM.overdueShort = function (n) {
    return "+" + n + (PM.lang === "th" ? "ว" : "d");
  };
  PM.fmtLongDate = function (iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  PM.timeAgo = function (iso) {
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
  };
  PM.relTime = function (hoursOffset) {
    return new Date(Date.now() + hoursOffset * 3600 * 1000).toISOString();
  };

  // ---------------- duration & Gantt math (used by board's budget bar and
  // dashboard's duration card + Gantt chart) ----------------

  PM.projectDateBounds = function () {
    var starts = [], ends = [];
    PM.state.tasks.forEach(function (t) {
      if (t.start) starts.push(t.start);
      if (t.due) ends.push(t.due);
    });
    var all = starts.concat(ends);
    if (!all.length) return null;
    var minS = all.reduce(function (a, b) { return a < b ? a : b; });
    var maxE = all.reduce(function (a, b) { return a > b ? a : b; });
    return { start: minS, end: maxE };
  };
  PM.taskDurationDays = function (t) { return PM.daysBetweenInclusive(t.start, t.due); };
  PM.taskDurationPct = function (t, totalDays) {
    if (!totalDays || !t.start || !t.due) return 0;
    return Math.round((PM.taskDurationDays(t) / totalDays) * 1000) / 10;
  };
  PM.allocatedDaysTotal = function () {
    var sum = 0;
    PM.state.tasks.forEach(function (t) {
      if (t.start && t.due) sum += PM.taskDurationDays(t);
    });
    return sum;
  };
  PM.pctFromStart = function (dateIso, bounds, totalDays) {
    if (!dateIso || !totalDays || dateIso < bounds.start || dateIso > bounds.end) return null;
    var offset = PM.daysBetweenInclusive(bounds.start, dateIso) - 1;
    return Math.max(0, Math.min(100, (offset / totalDays) * 100));
  };
  PM.barPosition = function (t, bounds, totalDays) {
    if (!t.start || !t.due || !totalDays) return null;
    var s = t.start < bounds.start ? bounds.start : t.start;
    var e = t.due > bounds.end ? bounds.end : t.due;
    var offset = PM.daysBetweenInclusive(bounds.start, s) - 1;
    var dur = PM.daysBetweenInclusive(s, e);
    var left = (offset / totalDays) * 100;
    var width = (dur / totalDays) * 100;
    return { left: left, width: Math.max(width, 1.5) };
  };
  PM.monthTicks = function (bounds) {
    var d0 = new Date(bounds.start + "T00:00:00");
    var d1 = new Date(bounds.end + "T00:00:00");
    var totalMs = d1 - d0;
    var ticks = [];
    if (totalMs <= 0) return ticks;
    var cur = new Date(d0.getFullYear(), d0.getMonth(), 1);
    var guard = 0;
    while (cur <= d1 && guard < 60) {
      if (cur >= d0) {
        ticks.push({ pct: ((cur - d0) / totalMs) * 100, label: PM.MONTH_NAMES[cur.getMonth()].slice(0, 3) + " " + cur.getFullYear() });
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      guard++;
    }
    return ticks;
  };

  // ---------------- seed / empty data ----------------

  PM.seedState = function () {
    var g1 = PM.uid(), g2 = PM.uid(), g3 = PM.uid(), g4 = PM.uid();
    var swSub1 = PM.uid();

    return {
      title: "IT Project — Network Infrastructure Upgrade",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalDaysBudget: null,
      groups: [
        { id: g1, name: "Design", color: PM.GROUP_COLORS[0], collapsed: false },
        { id: g2, name: "Procurement", color: PM.GROUP_COLORS[1], collapsed: false },
        { id: g3, name: "Deployment", color: PM.GROUP_COLORS[2], collapsed: false },
        { id: g4, name: "Testing & Go-live", color: PM.GROUP_COLORS[3], collapsed: false }
      ],
      tasks: [
        { id: PM.uid(), groupId: g1, name: "Network audit (current state)", owner: "Anan", status: "done", priority: "high", start: "2026-07-01", due: "2026-07-08", subitemsOpen: false, subitems: [], updates: [] },
        { id: PM.uid(), groupId: g1, name: "Design network diagram & IP schema", owner: "Preecha", status: "done", priority: "critical", start: "2026-07-08", due: "2026-07-16", subitemsOpen: false, subitems: [], updates: [] },
        { id: PM.uid(), groupId: g1, name: "Design VLAN / segmentation & firewall rules", owner: "Preecha", status: "working", priority: "high", start: "2026-07-17", due: "2026-07-24", subitemsOpen: true, subitems: [
          { id: swSub1, name: "Draft VLAN table", owner: "Preecha", status: "done", date: "2026-07-18" },
          { id: PM.uid(), name: "Review with security team", owner: "Nok", status: "not_started", date: "2026-07-23" }
        ], updates: [
          { id: PM.uid(), author: "Preecha", time: PM.relTime(-3), text: "Draft VLAN table is up — 12 VLANs mapped to the new switch stack. Sending to Nok for the security pass next.", likes: 1, liked: false }
        ] },
        { id: PM.uid(), groupId: g1, name: "Design review with stakeholders", owner: "", status: "not_started", priority: "medium", start: "2026-07-25", due: "2026-07-29", subitemsOpen: false, subitems: [], updates: [] },

        { id: PM.uid(), groupId: g2, name: "Get quotes for core switch & firewall", owner: "Malee", status: "done", priority: "medium", start: "2026-07-20", due: "2026-07-27", subitemsOpen: false, subitems: [], updates: [] },
        { id: PM.uid(), groupId: g2, name: "Order access points & rack hardware", owner: "Malee", status: "working", priority: "high", start: "2026-07-28", due: "2026-08-06", subitemsOpen: false, subitems: [], updates: [] },
        { id: PM.uid(), groupId: g2, name: "Renew ISP contract (backup link)", owner: "Somsak", status: "not_started", priority: "medium", start: "2026-08-01", due: "2026-08-10", subitemsOpen: false, subitems: [], updates: [] },

        { id: PM.uid(), groupId: g3, name: "Install core switch & firewall", owner: "Anan", status: "working", priority: "critical", start: "2026-08-07", due: "2026-08-14", subitemsOpen: false, subitems: [
          { id: PM.uid(), name: "Rack & power-on", owner: "Anan", status: "done", date: "2026-08-08" },
          { id: PM.uid(), name: "Base configuration", owner: "Anan", status: "working", date: "2026-08-12" }
        ], updates: [
          { id: PM.uid(), author: "Anan", time: PM.relTime(-25), text: "Switch stack racked and powered on. Starting firmware update before base config tonight.", likes: 2, liked: false },
          { id: PM.uid(), author: "Preecha", time: PM.relTime(-20), text: "Nice — ping me once firmware's done, I'll push the VLAN config.", likes: 0, liked: false }
        ] },
        { id: PM.uid(), groupId: g3, name: "Install Wi-Fi 6 access points (all floors)", owner: "Tanawat", status: "stuck", priority: "high", start: "2026-08-10", due: "2026-08-20", subitemsOpen: false, subitems: [], updates: [
          { id: PM.uid(), author: "Tanawat", time: PM.relTime(-4), text: "Blocked — waiting on ceiling access permit for floors 3-5 from the building office.", likes: 0, liked: false }
        ] },
        { id: PM.uid(), groupId: g3, name: "Configure VLAN / routing / firewall policy", owner: "Preecha", status: "not_started", priority: "critical", start: "2026-08-15", due: "2026-08-22", subitemsOpen: false, subitems: [], updates: [] },
        { id: PM.uid(), groupId: g3, name: "Set up VPN for remote staff", owner: "Somsak", status: "not_started", priority: "medium", start: "2026-08-20", due: "2026-08-25", subitemsOpen: false, subitems: [], updates: [] },

        { id: PM.uid(), groupId: g4, name: "Penetration test / security scan", owner: "Nok", status: "not_started", priority: "critical", start: "2026-08-26", due: "2026-08-30", subitemsOpen: false, subitems: [], updates: [] },
        { id: PM.uid(), groupId: g4, name: "Load & failover testing", owner: "Anan", status: "not_started", priority: "high", start: "2026-08-31", due: "2026-09-03", subitemsOpen: false, subitems: [], updates: [] },
        { id: PM.uid(), groupId: g4, name: "Go-live & handover documentation", owner: "", status: "not_started", priority: "high", start: "2026-09-04", due: "2026-09-08", subitemsOpen: false, subitems: [], updates: [] }
      ]
    };
  };

  PM.emptyState = function () {
    var g1 = PM.uid();
    return {
      title: "New IT Project",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalDaysBudget: null,
      groups: [{ id: g1, name: "To-Do", color: PM.GROUP_COLORS[0], collapsed: false }],
      tasks: []
    };
  };

  function migrate(s) {
    s.tasks.forEach(function (t) {
      if (!Array.isArray(t.updates)) t.updates = [];
      if (!Array.isArray(t.subitems)) t.subitems = [];
    });
    if (!s.createdAt) s.createdAt = new Date().toISOString();
    if (!s.updatedAt) s.updatedAt = s.createdAt;
    if (s.totalDaysBudget === undefined) s.totalDaysBudget = null;
    return s;
  }
  PM.migrate = migrate;

  // Cached copy from localStorage (offline-first), same single-slot cache the
  // original app used — switching projects overwrites this one slot.
  PM.loadCachedState = function () {
    try {
      var raw = localStorage.getItem(PM.STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.groups)) return migrate(parsed);
      }
    } catch (e) {}
    return null;
  };

  try { PM.currentProjectId = localStorage.getItem(PM.CURRENT_PROJECT_KEY) || null; } catch (e) { PM.currentProjectId = null; }
  PM.projectList = [];
  PM.state = null; // each page sets this during its own init (see initProjectState below)

  var saveTimer = null;
  // Debounced localStorage write + PUT to the Postgres-backed API.
  PM.persist = function () {
    PM.state.updatedAt = new Date().toISOString();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(PM.STORAGE_KEY, JSON.stringify(PM.state)); } catch (e) {}
      var url = PM.currentProjectId ? (PM.API_BASE + "/projects/" + PM.currentProjectId + "/state") : (PM.API_BASE + "/state");
      PM.authFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(PM.state)
      }).catch(function () {});
    }, 150);
  };
  window.addEventListener("beforeunload", function () {
    if (!PM.state) return;
    try { localStorage.setItem(PM.STORAGE_KEY, JSON.stringify(PM.state)); } catch (e) {}
  });

  // ---------------- auth ----------------

  PM.getAuthToken = function () {
    try { return localStorage.getItem(PM.AUTH_TOKEN_KEY) || null; } catch (e) { return null; }
  };
  PM.setAuthSession = function (token, user) {
    try {
      localStorage.setItem(PM.AUTH_TOKEN_KEY, token);
      localStorage.setItem(PM.AUTH_USER_KEY, JSON.stringify(user));
    } catch (e) {}
    PM.currentUser = user;
  };
  PM.clearAuthSession = function () {
    try {
      localStorage.removeItem(PM.AUTH_TOKEN_KEY);
      localStorage.removeItem(PM.AUTH_USER_KEY);
    } catch (e) {}
    PM.currentUser = null;
  };
  PM.currentUser = (function () {
    try {
      var raw = localStorage.getItem(PM.AUTH_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  })();

  PM.goToLogin = function () {
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = "login.html?next=" + next;
  };

  // Drop-in replacement for fetch() that attaches the session token and,
  // on a 401, clears the (now-invalid) session and bounces to the login
  // page — callers just chain .then() as usual for the success path.
  PM.authFetch = function (url, options) {
    options = options || {};
    var headers = {};
    for (var k in (options.headers || {})) headers[k] = options.headers[k];
    var token = PM.getAuthToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    var merged = {};
    for (var k2 in options) merged[k2] = options[k2];
    merged.headers = headers;
    return fetch(url, merged).then(function (r) {
      if (r.status === 401) {
        PM.clearAuthSession();
        PM.goToLogin();
        throw new Error("Not authenticated");
      }
      return r;
    });
  };

  // Verifies the session with the server (not just "a token exists locally")
  // and redirects to login.html if it isn't valid. Call at the top of every
  // gated page's init, before touching PM.state.
  PM.requireAuth = function () {
    if (!PM.getAuthToken()) { PM.goToLogin(); return Promise.reject(new Error("no token")); }
    return PM.authFetch(PM.API_BASE + "/auth/me").then(function (r) {
      if (!r.ok) throw new Error("bad response");
      return r.json();
    }).then(function (data) {
      PM.setAuthSession(PM.getAuthToken(), data.user);
      return data.user;
    });
  };

  PM.logout = function () {
    var token = PM.getAuthToken();
    var done = token
      ? fetch(PM.API_BASE + "/auth/logout", { method: "POST", headers: { "Authorization": "Bearer " + token } }).catch(function () {})
      : Promise.resolve();
    return done.then(function () {
      PM.clearAuthSession();
      window.location.href = "login.html";
    });
  };

  PM.findTask = function (id) { return PM.state.tasks.find(function (t) { return t.id === id; }); };
  PM.findGroup = function (id) { return PM.state.groups.find(function (g) { return g.id === id; }); };
  PM.findSub = function (taskId, subId) {
    var t = PM.findTask(taskId);
    if (!t) return null;
    return t.subitems.find(function (s) { return s.id === subId; });
  };

  // ---------------- API ----------------

  PM.fetchProjectState = function (id) {
    var url = id ? (PM.API_BASE + "/projects/" + id + "/state") : (PM.API_BASE + "/state");
    return PM.authFetch(url).then(function (r) {
      if (!r.ok) throw new Error("bad response");
      return r.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.groups)) throw new Error("bad payload");
      return migrate(data);
    });
  };

  PM.loadProjectList = function () {
    return PM.authFetch(PM.API_BASE + "/projects")
      .then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); })
      .then(function (list) {
        PM.projectList = Array.isArray(list) ? list : [];
        return PM.projectList;
      })
      .catch(function () { return PM.projectList; });
  };

  PM.createProjectApi = function (title) {
    return PM.authFetch(PM.API_BASE + "/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title })
    }).then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); });
  };

  // ---------------- project members (board "Invite" picker) ----------------

  PM.loadProjectMembers = function (projectId) {
    return PM.authFetch(PM.API_BASE + "/projects/" + encodeURIComponent(projectId) + "/members")
      .then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); })
      .then(function (list) { return Array.isArray(list) ? list : []; });
  };
  PM.addProjectMember = function (projectId, userId) {
    return PM.authFetch(PM.API_BASE + "/projects/" + encodeURIComponent(projectId) + "/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userId })
    }).then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); });
  };
  PM.removeProjectMember = function (projectId, userId) {
    return PM.authFetch(PM.API_BASE + "/projects/" + encodeURIComponent(projectId) + "/members/" + encodeURIComponent(userId), {
      method: "DELETE"
    }).then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); });
  };

  // ---------------- users ----------------

  PM.loadUsers = function () {
    return PM.authFetch(PM.API_BASE + "/users")
      .then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); })
      .then(function (list) { return Array.isArray(list) ? list : []; });
  };
  PM.createUserApi = function (user) {
    return PM.authFetch(PM.API_BASE + "/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user)
    }).then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); });
  };
  PM.updateUserApi = function (id, user) {
    return PM.authFetch(PM.API_BASE + "/users/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user)
    }).then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); });
  };
  PM.deleteUserApi = function (id) {
    return PM.authFetch(PM.API_BASE + "/users/" + encodeURIComponent(id), { method: "DELETE" })
      .then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); });
  };

  // Resolves the project to show on a board/dashboard page: URL ?id= wins,
  // falling back to the last-open project remembered in localStorage. Sets
  // PM.currentProjectId + PM.state (cached copy first for instant paint,
  // then callers should still call PM.fetchProjectState to refresh).
  PM.resolveProjectId = function () {
    var url = new URL(window.location.href);
    var idParam = url.searchParams.get("id");
    if (idParam) {
      PM.currentProjectId = idParam;
      try { localStorage.setItem(PM.CURRENT_PROJECT_KEY, idParam); } catch (e) {}
    }
    return PM.currentProjectId;
  };

  // ---------------- toast ----------------

  PM.showToast = function (msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  };

  // ---------------- sidebar (shared markup on every page) ----------------

  PM.renderSidebarProgress = function () {
    var pctEl = document.getElementById("sbProgressPct");
    var subEl = document.getElementById("sbProgressSub");
    if (!pctEl || !subEl || !PM.state) return;
    var total = PM.state.tasks.length;
    var done = PM.state.tasks.filter(function (t) { return t.status === "done"; }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    pctEl.textContent = pct + "%";
    subEl.textContent = PM.tr("sb.progressSub").replace("{done}", done).replace("{total}", total);
  };

  // Points the board/dashboard sidebar links + progress button at the current
  // project, and syncs the page title + the "current project" nav label.
  PM.syncSidebarLinks = function () {
    if (PM.state) document.title = (PM.state.title || "IT Project") + " — IT Project Board";
    var boardLabel = document.getElementById("sbBoardLabel");
    if (boardLabel && PM.state) boardLabel.textContent = PM.state.title || "Untitled project";
    var idParam = PM.currentProjectId ? ("?id=" + encodeURIComponent(PM.currentProjectId)) : "";
    var boardLink = document.getElementById("sbBoardLink");
    var dashLink = document.getElementById("sbDashboardLink");
    var progressBtn = document.getElementById("sbProgressBtn");
    if (boardLink) boardLink.href = "board.html" + idParam;
    if (dashLink) dashLink.href = "dashboard.html" + idParam;
    if (progressBtn) progressBtn.href = "dashboard.html" + idParam;
  };

  // Wires the parts of the sidebar that behave identically on every page:
  // collapse/reopen, the Content section disclosure, and the language toggle.
  // `activeView` highlights the matching nav item; `onLangChange` lets the
  // calling page re-render its own dynamic text after a language switch.
  PM.initSidebar = function (activeView, onLangChange) {
    var authNameEl = document.getElementById("sbAuthName");
    if (authNameEl) authNameEl.textContent = PM.currentUser ? PM.currentUser.name : "";
    var logoutBtn = document.getElementById("sbLogoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", function () { PM.logout(); });

    var sidebarEl = document.getElementById("sidebar");
    var reopenBtn = document.getElementById("sidebarReopenBtn");
    var collapseBtn = document.getElementById("sidebarCollapseBtn");
    if (collapseBtn && sidebarEl) collapseBtn.addEventListener("click", function () {
      sidebarEl.classList.add("collapsed");
      if (reopenBtn) reopenBtn.classList.add("show");
    });
    if (reopenBtn && sidebarEl) reopenBtn.addEventListener("click", function () {
      sidebarEl.classList.remove("collapsed");
      reopenBtn.classList.remove("show");
    });

    var contentLabel = document.getElementById("sbContentLabel");
    var navList = document.getElementById("sbNavList");
    if (contentLabel && navList) contentLabel.addEventListener("click", function () {
      contentLabel.classList.toggle("collapsed");
      navList.classList.toggle("collapsed");
    });

    var langBtn = document.getElementById("langToggleBtn");
    if (langBtn) langBtn.addEventListener("click", function () {
      PM.setLang(PM.lang === "en" ? "th" : "en");
      PM.showToast(PM.lang === "th" ? "เปลี่ยนเมนูเป็นภาษาไทยแล้ว" : "Switched menu to English");
      if (typeof onLangChange === "function") onLangChange();
    });

    document.querySelectorAll(".sb-nav-item").forEach(function (el) {
      el.classList.toggle("active", el.dataset.view === activeView);
    });

    PM.syncSidebarLinks();
    PM.renderSidebarProgress();
    PM.applyI18n();
  };

  // Delegated on every page: (a) the many "not implemented in this demo"
  // stub buttons that just show a toast, and (b) workspace-table rows —
  // real <tr> can't be an <a>, so they carry data-href and navigate on click.
  document.body.addEventListener("click", function (e) {
    var toastEl = e.target.closest("[data-toast]");
    if (toastEl) { PM.showToast(toastEl.getAttribute("data-toast")); return; }
    var rowEl = e.target.closest("tr[data-href]");
    if (rowEl && !e.target.closest("input")) { window.location.href = rowEl.getAttribute("data-href"); }
  });
})();
