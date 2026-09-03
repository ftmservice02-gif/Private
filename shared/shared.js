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
  // Derived from wherever the static frontend was loaded from, rather than
  // hardcoded to localhost — the API always runs on the same host as the
  // static server, one port over (see ecosystem.config.js). This is what
  // lets the same build work unmodified in dev (localhost) and once
  // deployed (LAN IP or a real hostname) without a per-environment edit.
  PM.API_BASE = window.location.protocol + "//" + window.location.hostname + ":8790/api";

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
      "sb.notifications": "Notifications", "sb.markAllRead": "Mark all read", "sb.noNotifications": "No notifications yet",
      "sb.mentionMessage": "{name} mentioned you in \"{task}\": {excerpt}",
      "sb.content": "Content", "sb.manageWorkspace": "Manage workspace", "sb.dashboard": "Dashboard and reporting",
      "sb.manageUsers": "Manage users", "sb.documentData": "Document DATA",
      "doc.fileName": "File name", "doc.fromTask": "From task", "doc.postedBy": "Posted by",
      "doc.empty": "No files attached to any update in this project yet.",
      "doc.noTask": "Unfiled",
      "doc.statFiles": "Files", "doc.statFolders": "Folders", "doc.statProjects": "Projects",
      "doc.stuckFolderName": "Problems & Obstacles",
      "sb.caption": "Project management", "sb.progressLabel": "Your progress", "sb.progressBtn": "View details",
      "sb.progressLabelProject": "This project's progress", "sb.progressLabelAll": "All your projects' progress",
      "sb.progressSub": "{done}/{total} tasks completed",
      "ws.addDescription": "Add workspace description", "ws.feedback": "Feedback", "ws.agents": "Agents",
      "ws.members": "Members", "ws.recents": "Recents", "ws.content": "Content", "ws.collaborators": "Collaborators",
      "ws.permissions": "Permissions", "ws.permNote": "Roles are managed from Manage users.",
      "ws.permDenied": "Admin access is required to view Permissions.",
      "ws.aiCredits": "AI credits won't be charged", "ws.filters": "Filters",
      "ws.newProject": "New project", "ws.newProjectPrompt": "Project name",
      "ws.newProjectPanelTitle": "New project", "ws.projectNameLabel": "Project name",
      "ws.createProject": "Create project", "ws.projectNameRequired": "Enter a project name first",
      "ws.importLabel": "Import from Excel, Microsoft Project (.mpp/.xml), or PDF (optional)",
      "ws.importHint": "Click to choose a .xlsx, .xls, .mpp, MS Project XML (.xml), or text-based .pdf file",
      "ws.importParsing": "Reading file…",
      "ws.importSummary": "Found {groups} group(s), {tasks} task(s), {subitems} subitem(s)",
      "ws.importSummaryOcr": " — some pages had no text layer and were read with OCR; please double-check names, dates, and owners before creating.",
      "ws.importSkippedPages": " ({skipped} of {total} page(s) couldn't be read and were skipped)",
      "ws.importOcrProgress": "No text layer on page {page}/{total} — reading it with OCR (this can take a while)…",
      "ws.importError": "Could not read this file",
      "ws.importPdfScannedError": "Could not find any readable text on this PDF, even after trying OCR — the pages may be blank or too low-quality to read. Try a clearer scan, or export as Excel/XML instead.",
      "ws.importStillParsing": "Still reading the file — please wait",
      "ws.importedGroupName": "Imported tasks", "ws.importedTaskName": "Imported task",
      "ws.createProjectError": "Could not create project",
      "ws.deleteProject": "Delete project",
      "ws.deleteProjectConfirm": "Delete project \"{name}\"? This permanently removes every task, subitem, and update in it. This cannot be undone.",
      "ws.projectDeleted": "Project deleted", "ws.deleteProjectError": "Could not delete project",
      "ws.membersPanelTitle": "Workspace members",
      "ws.addMemberNamePlaceholder": "Full name", "ws.addMemberEmailPlaceholder": "email@company.com",
      "ws.addMemberBtn": "Add",
      "ws.assetName": "Asset name", "ws.aiSummary": "AI summary", "ws.creator": "Creator",
      "ws.creationDate": "Creation date", "ws.lastModified": "Last modified", "ws.folder": "Folder",
      "ws.noAssetsMatch": "No assets match your search.",
      "ws.collabNoProject": "Open a project first to see its collaborators.",
      "db.statusBreakdown": "Status breakdown", "db.totalTasks": "Total tasks",
      "db.summary": "{n} task{s} across {g} group{gs} in “{title}”",
      "db.projectDuration": "Project duration", "db.days": "days", "db.budgetTag": "budget",
      "db.gantt": "Gantt chart — activity timeline",
      "db.noTimeline": "Add start & due dates to tasks to see the project timeline",
      "tb.aiSuggestions": "AI suggestions", "tb.new": "New", "tb.integrate": "Integrate", "tb.automate": "Automate",
      "tb.invite": "Invite", "tab.mainTable": "Main table",
      "tb.invitePanelTitle": "Invite to this project", "tb.inviteHint": "Pick who can see and edit this board",
      "tb.inviteAdd": "Invite", "tb.inviteRemove": "Remove", "tb.inviteAdded": "Added to project — invite email sent",
      "tb.inviteRemoved": "Removed from project", "tb.inviteError": "Could not update project members",
      "toolbar.newTask": "New task", "toolbar.person": "Person", "toolbar.filter": "Filter", "toolbar.sort": "Sort",
      "toolbar.hide": "Hide", "toolbar.hideColumns": "Hide columns",
      "topmenu.boardData": "Board data", "topmenu.loadSample": "Load sample project", "topmenu.resetBoard": "Reset board (clear all)",
      "common.search": "Search",
      "col.task": "Task", "col.owner": "Owner", "col.status": "Status", "col.dueDate": "Due date",
      "col.timeline": "Timeline", "col.priority": "Priority", "col.folder": "Folder", "col.subitem": "Subitem", "col.date": "Date",
      "board.addTask": "Add task", "board.addSubitem": "Add subitem",
      "board.taskPlaceholder": "Task name", "board.subitemPlaceholder": "Subitem name", "board.assignOwner": "Assign owner",
      "board.assignFolder": "Set folder", "board.unassignedFolder": "No folder", "board.createFolder": "Create \"{name}\"",
      "board.rootFolder": "All folders", "board.selectFolder": "Use \"{name}\"", "board.openSubfolder": "Open subfolder",
      "board.folderCreateHint": "Type a name above and hit Create to add a new folder here.",
      "board.addSubfolderHere": "Add subfolder here", "board.addingUnder": "Adding inside \"{name}\"",
      "board.addTaskTo": "Add task to group", "board.newGroup": "New group", "board.noGroupsYet": "No groups yet",
      "board.unassigned": "Unassigned", "board.noProjectMembers": "No project members yet — invite people first.",
      "board.setDates": "Set dates", "board.daysSelected": "days selected",
      "board.overdueBy": "{n} day{s} overdue",
      "board.totalDaysLabel": "Total project days",
      "board.allocatedDays": "{used} / {total} days allocated",
      "board.allocatedOverBy": "over by {n} day{s}",
      "board.budgetWarnToast": "Activities now total {used} days — {n} day{s} over your {total}-day budget",
      "board.save": "Save", "board.budgetSaved": "Project day budget saved",
      "save.idle": "All changes saved", "save.dirty": "Unsaved changes", "save.saving": "Saving…",
      "save.saved": "All changes saved", "save.error": "Couldn't save — click to retry",
      "status.not_started": "Not started", "status.working": "Working on it", "status.stuck": "Stuck", "status.done": "Done",
      "pri.critical": "Critical", "pri.high": "High", "pri.medium": "Medium", "pri.low": "Low",
      "bulk.export": "Export", "bulk.delete": "Delete", "bulk.cancel": "Cancel",
      "bulk.itemSelected": "item selected", "bulk.itemsSelected": "items selected",
      "panel.updates": "Updates",
      "panel.composePlaceholder": "Write an update and mention others with @", "panel.postUpdate": "Post update",
      "panel.replyPlaceholder": "Write a reply and mention others with @",
      "panel.noUpdates": "No updates yet — be the first to post one.", "panel.like": "Like", "panel.reply": "Reply",
      "panel.replyingTo": "Replying to {name}",
      "panel.duplicateTask": "Duplicate task", "panel.deleteTask": "Delete task",
      "panel.deleteTaskConfirm": "Delete task \"{name}\"? This cannot be undone.",
      "panel.taskDuplicated": "Task duplicated", "panel.taskDeleted": "Task deleted",
      "panel.duplicateSubitem": "Duplicate subitem", "panel.deleteSubitem": "Delete subitem",
      "panel.deleteSubitemConfirm": "Delete subitem \"{name}\"? This cannot be undone.",
      "panel.subitemDuplicated": "Subitem duplicated", "panel.subitemDeleted": "Subitem deleted",
      "stuck.reasonTitle": "Stuck reason", "stuck.reasonPlaceholder": "Why is this stuck?",
      "stuck.addReason": "Add stuck reason", "stuck.attachFile": "Attach photo or file",
      "stuck.removeAttachment": "Remove attachment",
      "panel.linkCopied": "Task link copied", "panel.mentionHint": "Mention a project member",
      "panel.emojiHint": "Insert an emoji",
      "panel.updateViaEmail": "Update via email", "panel.attachHint": "Attach a file",
      "panel.attachTooLarge": "File is larger than 15MB", "panel.attachUploading": "Uploading…",
      "panel.attachAdded": "File attached", "panel.attachError": "Couldn't upload the file",
      "panel.emailSubject": "Update", "panel.emailBodyTask": "Task", "panel.emailBodyLink": "Link",
      "panel.emailBodyLatest": "Latest update",
      "panel.fmtClear": "Normal text", "panel.fmtBold": "Bold", "panel.fmtItalic": "Italic",
      "panel.fmtUnderline": "Underline", "panel.fmtStrike": "Strikethrough", "panel.fmtColor": "Text color",
      "panel.fmtSize": "Text size", "panel.fmtBulletList": "Bulleted list", "panel.fmtNumberList": "Numbered list",
      "panel.fmtChecklist": "Checklist item",
      "panel.fmtTable": "Insert table", "panel.fmtLink": "Insert link", "panel.fmtAlign": "Align text",
      "panel.fmtHr": "Divider line", "panel.fmtUndo": "Undo", "panel.fmtRedo": "Redo",
      "panel.fmtLinkPrompt": "Link URL",
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
      "sb.notifications": "การแจ้งเตือน", "sb.markAllRead": "อ่านทั้งหมดแล้ว", "sb.noNotifications": "ยังไม่มีการแจ้งเตือน",
      "sb.mentionMessage": "{name} แท็กคุณใน \"{task}\": {excerpt}",
      "sb.content": "เนื้อหา", "sb.manageWorkspace": "จัดการเวิร์กสเปซ", "sb.dashboard": "แดชบอร์ดและรายงาน",
      "sb.manageUsers": "จัดการผู้ใช้งาน", "sb.documentData": "Document DATA",
      "doc.fileName": "ชื่อไฟล์", "doc.fromTask": "จากงาน", "doc.postedBy": "โพสต์โดย",
      "doc.empty": "ยังไม่มีไฟล์แนบใน Update ของโปรเจกต์นี้",
      "doc.noTask": "ไม่มีงานที่สังกัด",
      "doc.statFiles": "ไฟล์", "doc.statFolders": "โฟลเดอร์", "doc.statProjects": "โปรเจกต์",
      "doc.stuckFolderName": "ปัญหาและอุปสรรค์",
      "sb.caption": "ระบบจัดการโปรเจกต์", "sb.progressLabel": "ความคืบหน้าของคุณ", "sb.progressBtn": "ดูรายละเอียด",
      "sb.progressLabelProject": "ความคืบหน้าโครงการนี้", "sb.progressLabelAll": "ความคืบหน้าทุกโครงการของคุณ",
      "sb.progressSub": "ทำเสร็จแล้ว {done}/{total} งาน",
      "ws.addDescription": "เพิ่มคำอธิบายเวิร์กสเปซ", "ws.feedback": "ข้อเสนอแนะ", "ws.agents": "เอเจนต์",
      "ws.members": "สมาชิก", "ws.recents": "ล่าสุด", "ws.content": "เนื้อหา", "ws.collaborators": "ผู้ร่วมงาน",
      "ws.permissions": "สิทธิ์การเข้าถึง", "ws.permNote": "จัดการสิทธิ์ผู้ใช้งานได้ที่หน้าจัดการผู้ใช้งาน",
      "ws.permDenied": "ต้องมีสิทธิ์ผู้ดูแลระบบเพื่อดู Permissions",
      "ws.aiCredits": "จะไม่มีการเรียกเก็บเครดิต AI", "ws.filters": "ตัวกรอง",
      "ws.newProject": "โปรเจกต์ใหม่", "ws.newProjectPrompt": "ชื่อโปรเจกต์",
      "ws.newProjectPanelTitle": "โปรเจกต์ใหม่", "ws.projectNameLabel": "ชื่อโปรเจกต์",
      "ws.createProject": "สร้างโปรเจกต์", "ws.projectNameRequired": "กรุณากรอกชื่อโปรเจกต์ก่อน",
      "ws.importLabel": "นำเข้าจาก Excel, Microsoft Project (.mpp/.xml) หรือ PDF (ไม่บังคับ)",
      "ws.importHint": "คลิกเพื่อเลือกไฟล์ .xlsx, .xls, .mpp, MS Project XML (.xml) หรือ PDF ที่มีข้อความจริง",
      "ws.importParsing": "กำลังอ่านไฟล์…",
      "ws.importSummary": "พบ {groups} กลุ่ม, {tasks} งาน, {subitems} งานย่อย",
      "ws.importSummaryOcr": " — บางหน้าไม่มีข้อความจริง ใช้ OCR อ่านแทน กรุณาตรวจสอบชื่องาน วันที่ และผู้รับผิดชอบก่อนสร้างโปรเจกต์",
      "ws.importSkippedPages": " (ข้าม {skipped} จาก {total} หน้า เนื่องจากอ่านไม่ได้)",
      "ws.importOcrProgress": "หน้า {page}/{total} ไม่มีข้อความจริง กำลังใช้ OCR อ่าน (อาจใช้เวลาสักครู่)…",
      "ws.importError": "ไม่สามารถอ่านไฟล์นี้ได้",
      "ws.importPdfScannedError": "ไม่พบข้อความที่อ่านได้ใน PDF นี้แม้จะลองใช้ OCR แล้ว — หน้าอาจว่างเปล่าหรือคุณภาพต่ำเกินไป ลองใช้ไฟล์สแกนที่ชัดกว่า หรือ export เป็น Excel/XML แทน",
      "ws.importStillParsing": "กำลังอ่านไฟล์อยู่ กรุณารอสักครู่",
      "ws.importedGroupName": "งานที่นำเข้า", "ws.importedTaskName": "งานที่นำเข้า",
      "ws.createProjectError": "ไม่สามารถสร้างโปรเจกต์ได้",
      "ws.deleteProject": "ลบโปรเจกต์",
      "ws.deleteProjectConfirm": "ลบโปรเจกต์ \"{name}\" ใช่หรือไม่? งาน งานย่อย และ Update ทั้งหมดในโปรเจกต์นี้จะถูกลบถาวร ไม่สามารถย้อนกลับได้",
      "ws.projectDeleted": "ลบโปรเจกต์แล้ว", "ws.deleteProjectError": "ไม่สามารถลบโปรเจกต์ได้",
      "ws.membersPanelTitle": "สมาชิกในเวิร์กสเปซ",
      "ws.addMemberNamePlaceholder": "ชื่อ-นามสกุล", "ws.addMemberEmailPlaceholder": "email@company.com",
      "ws.addMemberBtn": "เพิ่ม",
      "ws.assetName": "ชื่อไฟล์งาน", "ws.aiSummary": "สรุปโดย AI", "ws.creator": "ผู้สร้าง",
      "ws.creationDate": "วันที่สร้าง", "ws.lastModified": "แก้ไขล่าสุด", "ws.folder": "โฟลเดอร์",
      "ws.noAssetsMatch": "ไม่พบรายการที่ตรงกับการค้นหา",
      "ws.collabNoProject": "เปิดโครงการก่อนเพื่อดูผู้ร่วมงานของโครงการนั้น",
      "db.statusBreakdown": "สัดส่วนตามสถานะ", "db.totalTasks": "งานทั้งหมด",
      "db.summary": "{n} งาน ใน {g} กลุ่ม ของ “{title}”",
      "db.projectDuration": "ระยะเวลาโครงการ", "db.days": "วัน", "db.budgetTag": "งบที่ตั้งไว้",
      "db.gantt": "แผนภูมิแกนต์ — ไทม์ไลน์กิจกรรม",
      "db.noTimeline": "เพิ่มวันเริ่มต้นและวันกำหนดเสร็จให้กับงานเพื่อดูไทม์ไลน์โครงการ",
      "tb.aiSuggestions": "คำแนะนำ AI", "tb.new": "ใหม่", "tb.integrate": "เชื่อมต่อ", "tb.automate": "ระบบอัตโนมัติ",
      "tb.invite": "เชิญ", "tab.mainTable": "ตารางหลัก",
      "tb.invitePanelTitle": "เชิญเข้าโครงการนี้", "tb.inviteHint": "เลือกคนที่จะเห็นและแก้ไขบอร์ดนี้ได้",
      "tb.inviteAdd": "เชิญ", "tb.inviteRemove": "นำออก", "tb.inviteAdded": "เพิ่มเข้าโครงการแล้ว — ส่งอีเมลเชิญแล้ว",
      "tb.inviteRemoved": "นำออกจากโครงการแล้ว", "tb.inviteError": "อัปเดตสมาชิกโครงการไม่สำเร็จ",
      "toolbar.newTask": "งานใหม่", "toolbar.person": "บุคคล", "toolbar.filter": "กรอง", "toolbar.sort": "เรียงลำดับ",
      "toolbar.hide": "ซ่อน", "toolbar.hideColumns": "ซ่อนคอลัมน์",
      "topmenu.boardData": "ข้อมูลบอร์ด", "topmenu.loadSample": "โหลดโปรเจกต์ตัวอย่าง", "topmenu.resetBoard": "ล้างบอร์ด (ลบทั้งหมด)",
      "common.search": "ค้นหา",
      "col.task": "งาน", "col.owner": "ผู้รับผิดชอบ", "col.status": "สถานะ", "col.dueDate": "กำหนดเสร็จ",
      "col.timeline": "ไทม์ไลน์", "col.priority": "ความสำคัญ", "col.folder": "โฟลเดอร์", "col.subitem": "งานย่อย", "col.date": "วันที่",
      "board.addTask": "เพิ่มงาน", "board.addSubitem": "เพิ่มงานย่อย",
      "board.taskPlaceholder": "ชื่องาน", "board.subitemPlaceholder": "ชื่องานย่อย", "board.assignOwner": "มอบหมายผู้รับผิดชอบ",
      "board.assignFolder": "ตั้งค่าโฟลเดอร์", "board.unassignedFolder": "ไม่มีโฟลเดอร์", "board.createFolder": "สร้าง \"{name}\"",
      "board.rootFolder": "โฟลเดอร์ทั้งหมด", "board.selectFolder": "ใช้ \"{name}\"", "board.openSubfolder": "เปิดโฟลเดอร์ย่อย",
      "board.folderCreateHint": "พิมพ์ชื่อในช่องค้นหาด้านบน แล้วกด \"สร้าง\" เพื่อเพิ่มโฟลเดอร์ใหม่ตรงนี้",
      "board.addSubfolderHere": "เพิ่มโฟลเดอร์ย่อยตรงนี้", "board.addingUnder": "กำลังเพิ่มในโฟลเดอร์ \"{name}\"",
      "board.addTaskTo": "เพิ่มงานลงกลุ่ม", "board.newGroup": "กลุ่มใหม่", "board.noGroupsYet": "ยังไม่มีกลุ่ม",
      "board.unassigned": "ยังไม่มอบหมาย", "board.noProjectMembers": "ยังไม่มีสมาชิกโปรเจกต์ — เชิญคนเข้าร่วมก่อน",
      "board.setDates": "ตั้งค่าวันที่", "board.daysSelected": "วันที่เลือก",
      "board.overdueBy": "เกินกำหนด {n} วัน",
      "board.totalDaysLabel": "จำนวนวันทั้งหมดของโครงการ",
      "board.allocatedDays": "จัดสรรแล้ว {used} / {total} วัน",
      "board.allocatedOverBy": "เกิน {n} วัน",
      "board.budgetWarnToast": "กิจกรรมรวมแล้ว {used} วัน — เกินงบ {total} วัน อยู่ {n} วัน",
      "board.save": "บันทึก", "board.budgetSaved": "บันทึกจำนวนวันโครงการแล้ว",
      "save.idle": "บันทึกล่าสุดแล้ว", "save.dirty": "มีการเปลี่ยนแปลงที่ยังไม่บันทึก", "save.saving": "กำลังบันทึก…",
      "save.saved": "บันทึกล่าสุดแล้ว", "save.error": "บันทึกไม่สำเร็จ — คลิกเพื่อลองใหม่",
      "status.not_started": "ยังไม่เริ่ม", "status.working": "กำลังดำเนินการ", "status.stuck": "ติดปัญหา", "status.done": "เสร็จแล้ว",
      "pri.critical": "วิกฤต", "pri.high": "สูง", "pri.medium": "ปานกลาง", "pri.low": "ต่ำ",
      "bulk.export": "ส่งออก", "bulk.delete": "ลบ", "bulk.cancel": "ยกเลิก",
      "bulk.itemSelected": "รายการที่เลือก", "bulk.itemsSelected": "รายการที่เลือก",
      "panel.updates": "อัปเดต",
      "panel.composePlaceholder": "เขียนอัปเดตและแท็กเพื่อนร่วมทีมด้วย @", "panel.postUpdate": "โพสต์อัปเดต",
      "panel.replyPlaceholder": "เขียนตอบกลับและแท็กเพื่อนร่วมทีมด้วย @",
      "panel.noUpdates": "ยังไม่มีอัปเดต — เป็นคนแรกที่โพสต์เลย", "panel.like": "ถูกใจ", "panel.reply": "ตอบกลับ",
      "panel.replyingTo": "กำลังตอบกลับ {name}",
      "panel.duplicateTask": "ทำสำเนางาน", "panel.deleteTask": "ลบงานนี้",
      "panel.deleteTaskConfirm": "ลบงาน \"{name}\" ใช่หรือไม่? ไม่สามารถย้อนกลับได้",
      "panel.taskDuplicated": "ทำสำเนางานแล้ว", "panel.taskDeleted": "ลบงานแล้ว",
      "panel.duplicateSubitem": "ทำสำเนางานย่อย", "panel.deleteSubitem": "ลบงานย่อยนี้",
      "panel.deleteSubitemConfirm": "ลบงานย่อย \"{name}\" ใช่หรือไม่? ไม่สามารถย้อนกลับได้",
      "panel.subitemDuplicated": "ทำสำเนางานย่อยแล้ว", "panel.subitemDeleted": "ลบงานย่อยแล้ว",
      "stuck.reasonTitle": "สาเหตุที่ติดขัด", "stuck.reasonPlaceholder": "เหตุใดจึงติดขัด?",
      "stuck.addReason": "เพิ่มสาเหตุที่ติดขัด", "stuck.attachFile": "แนบรูปหรือไฟล์",
      "stuck.removeAttachment": "ลบไฟล์แนบ",
      "panel.linkCopied": "คัดลอกลิงก์งานแล้ว", "panel.mentionHint": "แท็กสมาชิกในโปรเจกต์",
      "panel.emojiHint": "แทรกอีโมจิ",
      "panel.updateViaEmail": "อัปเดตผ่านอีเมล", "panel.attachHint": "แนบไฟล์",
      "panel.attachTooLarge": "ไฟล์ใหญ่เกิน 15MB", "panel.attachUploading": "กำลังอัปโหลด…",
      "panel.attachAdded": "แนบไฟล์แล้ว", "panel.attachError": "อัปโหลดไฟล์ไม่สำเร็จ",
      "panel.emailSubject": "อัปเดต", "panel.emailBodyTask": "งาน", "panel.emailBodyLink": "ลิงก์",
      "panel.emailBodyLatest": "อัปเดตล่าสุด",
      "panel.fmtClear": "ข้อความปกติ", "panel.fmtBold": "ตัวหนา", "panel.fmtItalic": "ตัวเอียง",
      "panel.fmtUnderline": "ขีดเส้นใต้", "panel.fmtStrike": "ขีดฆ่า", "panel.fmtColor": "สีตัวอักษร",
      "panel.fmtSize": "ขนาดตัวอักษร", "panel.fmtBulletList": "รายการหัวข้อย่อย", "panel.fmtNumberList": "รายการลำดับเลข",
      "panel.fmtChecklist": "รายการเช็คลิสต์",
      "panel.fmtTable": "แทรกตาราง", "panel.fmtLink": "แทรกลิงก์", "panel.fmtAlign": "จัดแนวข้อความ",
      "panel.fmtHr": "เส้นคั่น", "panel.fmtUndo": "ย้อนกลับ", "panel.fmtRedo": "ทำซ้ำ",
      "panel.fmtLinkPrompt": "URL ของลิงก์",
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
      if (t.stuckReason === undefined) t.stuckReason = "";
      if (!Array.isArray(t.stuckAttachments)) t.stuckAttachments = [];
      t.subitems.forEach(function (sub) {
        if (!Array.isArray(sub.updates)) sub.updates = [];
        if (sub.stuckReason === undefined) sub.stuckReason = "";
        if (!Array.isArray(sub.stuckAttachments)) sub.stuckAttachments = [];
      });
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

  // ---------------- save status ----------------
  // Pages that mutate PM.state (currently only board.html) can subscribe with
  // PM.onSaveStatus(fn) to render a status pill / Save button. Pages that
  // never call PM.persist() simply never see a status change — no fake
  // indicator on pages with nothing to save.
  var saveStatus = "idle"; // idle | dirty | saving | saved | error
  var saveStatusHandler = null;
  PM.onSaveStatus = function (fn) {
    saveStatusHandler = fn;
    if (fn) fn(saveStatus);
  };
  function setSaveStatus(s) {
    saveStatus = s;
    if (saveStatusHandler) saveStatusHandler(s);
  }
  PM.getSaveStatus = function () { return saveStatus; };

  var saveTimer = null;
  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    setSaveStatus("saving");
    try { localStorage.setItem(PM.STORAGE_KEY, JSON.stringify(PM.state)); } catch (e) {}
    var url = PM.currentProjectId ? (PM.API_BASE + "/projects/" + PM.currentProjectId + "/state") : (PM.API_BASE + "/state");
    return PM.authFetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PM.state)
    }).then(function (r) {
      if (!r.ok) throw new Error("save failed: " + r.status);
      setSaveStatus("saved");
    }).catch(function (err) {
      setSaveStatus("error");
      throw err;
    });
  }
  // Debounced localStorage write + PUT to the Postgres-backed API.
  PM.persist = function () {
    PM.state.updatedAt = new Date().toISOString();
    setSaveStatus("dirty");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { flushSave().catch(function () {}); }, 600);
  };
  // Bypasses the debounce and saves immediately — used by a manual Save
  // button so a click always reflects the current state right away.
  PM.saveNow = function () {
    if (!PM.state) return Promise.resolve();
    return flushSave().catch(function () {});
  };
  window.addEventListener("beforeunload", function (e) {
    if (!PM.state) return;
    try { localStorage.setItem(PM.STORAGE_KEY, JSON.stringify(PM.state)); } catch (e) {}
    if (saveTimer) {
      // Best-effort flush so a fast navigation away doesn't lose the last
      // few changes sitting in the debounce window — but the browser is
      // free to cancel this in-flight fetch mid-navigation, so it is not
      // reliable on its own. Also ask the browser to confirm before
      // actually leaving, giving the flush a real chance to land.
      clearTimeout(saveTimer);
      flushSave().catch(function () {});
      e.preventDefault();
      e.returnValue = "";
    }
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

  // Sidebar "Progress" card's default data source — every task across
  // every project the current user can see, combined. Only used when no
  // single project is selected (workspace.html, users.html); board.html/
  // dashboard.html show that one project's own progress instead, computed
  // straight from PM.state (see renderSidebarProgress below).
  PM.allProjectsProgress = null; // {done, total} once loaded, else null (renders as 0%)
  PM.loadAllProjectsProgress = function () {
    return PM.authFetch(PM.API_BASE + "/all-projects-progress")
      .then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); })
      .then(function (data) {
        PM.allProjectsProgress = { done: data.done || 0, total: data.total || 0 };
        return PM.allProjectsProgress;
      })
      .catch(function () { return PM.allProjectsProgress; });
  };

  // seedState is optional — {groups, tasks}, e.g. from PM.ProjectImport —
  // seeded atomically in the same request/transaction as project creation,
  // so an import failure can never leave a project behind with the default
  // "To-Do" group but none of the imported data.
  PM.createProjectApi = function (title, seedState) {
    var body = { title: title };
    if (seedState && Array.isArray(seedState.groups) && seedState.groups.length) {
      body.groups = seedState.groups;
      body.tasks = seedState.tasks || [];
    }
    return PM.authFetch(PM.API_BASE + "/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (data) {
        throw new Error((data && data.error) || ("bad response (" + r.status + ")"));
      });
      return r.json();
    });
  };

  PM.deleteProjectApi = function (projectId) {
    return PM.authFetch(PM.API_BASE + "/projects/" + encodeURIComponent(projectId), { method: "DELETE" })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (data) {
          throw new Error((data && data.error) || ("bad response (" + r.status + ")"));
        });
        return r.json();
      });
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

  // ---------------- notifications (@mentions) ----------------

  PM.loadNotifications = function () {
    return PM.authFetch(PM.API_BASE + "/notifications")
      .then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); })
      .then(function (list) { return Array.isArray(list) ? list : []; });
  };
  PM.createNotification = function (payload) {
    return PM.authFetch(PM.API_BASE + "/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { if (!r.ok) throw new Error("bad response"); return r.json(); });
  };
  PM.markNotificationRead = function (id) {
    return PM.authFetch(PM.API_BASE + "/notifications/" + encodeURIComponent(id) + "/read", { method: "POST" });
  };
  PM.markAllNotificationsRead = function () {
    return PM.authFetch(PM.API_BASE + "/notifications/read-all", { method: "POST" });
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

  // Two scopes, switched by which page is active (set via initSidebar's
  // activeView param): on board.html/dashboard.html — a specific project is
  // open — show THAT project's own progress (every task in PM.state, right
  // now, no extra request needed). Everywhere else (workspace.html,
  // users.html — no single project selected) show the combined total
  // across every project the user can see (PM.allProjectsProgress, loaded
  // once by PM.loadAllProjectsProgress() in initSidebar). Renders 0% until
  // that load resolves, then this gets called again to fill it in.
  PM.renderSidebarProgress = function () {
    var pctEl = document.getElementById("sbProgressPct");
    var subEl = document.getElementById("sbProgressSub");
    var labelEl = document.getElementById("sbProgressLabel");
    if (!pctEl || !subEl) return;
    // "documents" is deliberately excluded — that page spans every visible
    // project (grouped by project), so the sidebar progress card should
    // show the all-projects aggregate there too, not one project's numbers.
    var showingOneProject = (PM._sidebarActiveView === "board" || PM._sidebarActiveView === "dashboard")
      && PM.state && Array.isArray(PM.state.tasks);
    var done, total, labelKey;
    if (showingOneProject) {
      total = PM.state.tasks.length;
      done = PM.state.tasks.filter(function (t) { return t.status === "done"; }).length;
      labelKey = "sb.progressLabelProject";
    } else {
      done = (PM.allProjectsProgress && PM.allProjectsProgress.done) || 0;
      total = (PM.allProjectsProgress && PM.allProjectsProgress.total) || 0;
      labelKey = "sb.progressLabelAll";
    }
    var pct = total ? Math.round((done / total) * 100) : 0;
    pctEl.textContent = pct + "%";
    subEl.textContent = PM.tr("sb.progressSub").replace("{done}", done).replace("{total}", total);
    if (labelEl) labelEl.textContent = PM.tr(labelKey);
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
    var docsLink = document.getElementById("sbDocumentsLink");
    var progressBtn = document.getElementById("sbProgressBtn");
    if (boardLink) boardLink.href = "board.html" + idParam;
    if (dashLink) dashLink.href = "dashboard.html" + idParam;
    if (docsLink) docsLink.href = "documents.html" + idParam;
    if (progressBtn) progressBtn.href = "dashboard.html" + idParam;
  };

  // Wires the parts of the sidebar that behave identically on every page:
  // collapse/reopen, the Content section disclosure, and the language toggle.
  // `activeView` highlights the matching nav item; `onLangChange` lets the
  // calling page re-render its own dynamic text after a language switch.
  PM.initSidebar = function (activeView, onLangChange) {
    PM._sidebarActiveView = activeView;
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
    PM.initNotificationBell();
    PM.loadAllProjectsProgress().then(PM.renderSidebarProgress);
  };

  // ---------------- notification bell (@mentions) ----------------
  // One shared popover + unread list, wired to every trigger button found
  // on the page: the sidebar bell (injected via JS, since the sidebar's
  // HTML is copy-pasted across all four pages) and the board topbar's chat
  // icon (static markup, id="topbarChatBtn") when present.
  var notifications = [];
  var notifTriggerBtns = [];
  PM.initNotificationBell = function () {
    var alreadyInjected = !!document.getElementById("sbNotifBtn");
    var iconsWrap = document.querySelector(".sb-top-icons");
    if (iconsWrap && !alreadyInjected) {
      var wrap = document.createElement("div");
      wrap.style.position = "relative";
      wrap.innerHTML =
        '<button class="sb-icon-btn" id="sbNotifBtn" aria-label="' + PM.esc(PM.tr("sb.notifications")) + '" aria-haspopup="true">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>' +
          '<span class="sb-notif-badge" style="display:none;"></span>' +
        '</button>';
      iconsWrap.insertBefore(wrap, iconsWrap.firstChild);
    }

    // The board topbar's "chat" icon — already in the static HTML on
    // board.html, just needs a badge added and to be wired the same way.
    var topbarChatBtn = document.getElementById("topbarChatBtn");
    if (topbarChatBtn && !topbarChatBtn.querySelector(".sb-notif-badge")) {
      topbarChatBtn.style.position = "relative";
      var topbarBadge = document.createElement("span");
      topbarBadge.className = "sb-notif-badge";
      topbarBadge.style.display = "none";
      topbarChatBtn.appendChild(topbarBadge);
    }

    if (alreadyInjected) return; // popover + shared wiring only needs to happen once per page

    // Appended to <body> with position:fixed, not nested in the sidebar —
    // .sidebar has overflow:hidden (for the collapse animation), which
    // would otherwise clip a dropdown positioned inside it.
    var popover = document.createElement("div");
    popover.className = "sb-notif-popover";
    popover.id = "sbNotifPopover";
    popover.style.display = "none";
    popover.style.position = "fixed";
    document.body.appendChild(popover);

    function renderNotifPopover() {
      var unreadCount = notifications.filter(function (n) { return !n.read; }).length;
      var header =
        '<div class="sb-notif-header">' +
          '<span class="sb-notif-title">' + PM.esc(PM.tr("sb.notifications")) + '</span>' +
          (unreadCount ? '<button class="sb-notif-markall" id="sbNotifMarkAll">' + PM.esc(PM.tr("sb.markAllRead")) + '</button>' : '') +
        '</div>';
      var body = notifications.length
        ? notifications.map(function (n) {
            var href = n.taskId ? ("board.html?id=" + encodeURIComponent(n.projectId || "") + "&task=" + encodeURIComponent(n.taskId)) : null;
            return '<button class="sb-notif-item' + (n.read ? '' : ' unread') + '" data-id="' + PM.esc(n.id) + '" data-href="' + PM.esc(href || '') + '">' +
              PM.esc(n.message) +
              '<span class="sb-notif-time">' + PM.esc(PM.timeAgo(n.createdAt)) + '</span>' +
            '</button>';
          }).join("")
        : '<div class="sb-notif-empty">' + PM.esc(PM.tr("sb.noNotifications")) + '</div>';
      popover.innerHTML = header + body;

      var markAllBtn = document.getElementById("sbNotifMarkAll");
      if (markAllBtn) markAllBtn.addEventListener("click", function () {
        PM.markAllNotificationsRead().then(function () {
          notifications.forEach(function (n) { n.read = true; });
          updateBadge();
          renderNotifPopover();
        });
      });
      popover.querySelectorAll(".sb-notif-item").forEach(function (el) {
        el.addEventListener("click", function () {
          var id = el.dataset.id;
          var n = notifications.find(function (x) { return x.id === id; });
          if (n && !n.read) {
            PM.markNotificationRead(id).catch(function () {});
            n.read = true;
            updateBadge();
          }
          if (el.dataset.href) window.location.href = el.dataset.href;
        });
      });
    }

    function updateBadge() {
      var unread = notifications.some(function (n) { return !n.read; });
      document.querySelectorAll(".sb-notif-badge").forEach(function (badge) {
        badge.style.display = unread ? "block" : "none";
      });
    }

    function refresh() {
      return PM.loadNotifications().then(function (list) {
        notifications = list;
        updateBadge();
      }).catch(function () {});
    }

    function openNear(btn) {
      var rect = btn.getBoundingClientRect();
      popover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 316)) + "px";
      popover.style.top = Math.min(rect.bottom + 6, window.innerHeight - 400) + "px";
      popover.style.display = "block";
      renderNotifPopover();
      refresh().then(renderNotifPopover);
    }

    notifTriggerBtns = [document.getElementById("sbNotifBtn"), document.getElementById("topbarChatBtn")].filter(Boolean);
    notifTriggerBtns.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (popover.style.display === "none") openNear(btn); else popover.style.display = "none";
      });
    });

    document.addEventListener("click", function (e) {
      if (popover.style.display === "none" || e.target.closest("#sbNotifPopover")) return;
      var onTrigger = notifTriggerBtns.some(function (btn) { return e.target === btn || btn.contains(e.target); });
      if (!onTrigger) popover.style.display = "none";
    });

    refresh();
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
