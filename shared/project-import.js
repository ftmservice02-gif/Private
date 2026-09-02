// Import a board's worth of groups/tasks/subitems from an Excel file
// (.xlsx/.xls, any layout — matched by flexible column-name aliases) or a
// Microsoft Project XML export (File > Save As > XML in MS Project). Native
// .mpp is a proprietary binary format with no practical Node/browser parser
// (the standard tool, MPXJ, needs a Java runtime) — MS Project can export
// XML or Excel directly, so those two formats are what's supported here.
//
// Both formats normalize down to the same flat list of "rows" (one row per
// MS Project task, or one row per Excel row) carrying an indentation level,
// then buildHierarchy() turns that flat list into the board's real
// Group -> Task -> Subitem shape. The board only supports one level of
// subitem nesting, so anything deeper than that collapses onto the nearest
// enclosing task's subitem list instead of being dropped.
(function () {
  "use strict";
  var PM = window.PM;
  if (!PM) throw new Error("shared.js must load before project-import.js");

  var COLUMN_ALIASES = {
    name: ["task name", "taskname", "name", "task", "ชื่องาน", "งาน", "ชื่อ"],
    group: ["group", "phase", "section", "กลุ่ม", "หมวด", "เฟส"],
    status: ["status", "สถานะ"],
    percent: ["% complete", "percent complete", "%complete", "complete", "% done", "ความคืบหน้า", "% เสร็จ"],
    start: ["start", "start date", "วันที่เริ่ม", "เริ่ม", "วันเริ่ม"],
    due: ["due", "due date", "finish", "finish date", "end date", "วันที่สิ้นสุด", "สิ้นสุด", "กำหนดส่ง", "วันครบกำหนด"],
    owner: ["owner", "assigned to", "assignee", "resource", "resource names", "ผู้รับผิดชอบ", "เจ้าของงาน", "ผู้ดูแล"],
    level: ["outline level", "outlinelevel", "level", "indent", "ระดับ"],
    duration: ["duration", "ระยะเวลา"]
  };

  function normalizeHeader(h) {
    return String(h || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  // Real-world Thai headers are rarely a bare alias — "กลุ่มงาน" ("work
  // group"), "% ความคืบหน้า" ("% complete") — so this needs to be more than
  // an exact lookup. Two passes: (1) exact match per header, highest
  // confidence, claims that field so nothing else can steal it; (2) for
  // whatever's left, substring match, picking the LONGEST matching alias
  // across all still-unclaimed fields — "กลุ่มงาน" contains both "กลุ่ม"
  // (group) and "งาน" (name), and the longer, more specific "กลุ่ม" is the
  // one that should win.
  function buildFieldMap(headers) {
    var map = {}; // original header string -> field key
    var claimed = {};
    var norm = {};
    headers.forEach(function (h) { norm[h] = normalizeHeader(h); });

    headers.forEach(function (header) {
      var h = norm[header];
      if (!h || map[header] !== undefined) return;
      for (var field in COLUMN_ALIASES) {
        if (claimed[field]) continue;
        if (COLUMN_ALIASES[field].indexOf(h) !== -1) {
          map[header] = field;
          claimed[field] = true;
          break;
        }
      }
    });

    headers.forEach(function (header) {
      if (map[header] !== undefined) return;
      var h = norm[header];
      if (!h) return;
      var bestField = null, bestLen = 0;
      for (var field in COLUMN_ALIASES) {
        if (claimed[field]) continue;
        COLUMN_ALIASES[field].forEach(function (alias) {
          if (h.indexOf(alias) !== -1 && alias.length > bestLen) {
            bestField = field;
            bestLen = alias.length;
          }
        });
      }
      if (bestField) {
        map[header] = bestField;
        claimed[bestField] = true;
      }
    });

    return map;
  }

  function excelDateToIso(v) {
    if (!v) return "";
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return "";
      return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
    }
    // A date column that wasn't styled as a date in the source workbook
    // comes through as a raw Excel serial day-number instead of a Date —
    // days since the (off-by-one, for historical reasons) 1899-12-30 epoch.
    if (typeof v === "number" && isFinite(v)) {
      return excelDateToIso(new Date(Date.UTC(1899, 11, 30) + v * 86400000));
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    var d = new Date(s);
    if (!isNaN(d.getTime())) return excelDateToIso(d);
    return "";
  }

  function guessStatus(rawStatus, percent) {
    var s = String(rawStatus || "").trim().toLowerCase();
    if (s) {
      if (/(done|complete|เสร็จ|100%)/.test(s)) return "done";
      if (/(stuck|blocked|delay|ติดขัด|ล่าช้า)/.test(s)) return "stuck";
      if (/(progress|working|doing|กำลัง)/.test(s)) return "working";
      if (/(not.?start|to ?do|ยังไม่เริ่ม)/.test(s)) return "not_started";
    }
    if (percent !== null && percent !== undefined && percent !== "") {
      var p = parseFloat(percent);
      if (!isNaN(p)) {
        if (p >= 100) return "done";
        if (p <= 0) return "not_started";
        return "working";
      }
    }
    return "not_started";
  }

  // "Duration" only fills in a missing due date (start + N days) — the
  // board itself has no dedicated duration field, so there's nothing else
  // meaningful to do with it once start/due are both already set.
  function parseDurationDays(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "number" && isFinite(raw)) return raw;
    var s = String(raw).trim();
    var iso = s.match(/^PT?(\d+(?:\.\d+)?)H/i); // MS Project XML "PT40H0M0S" — hours, 8h/day
    if (iso) return Math.round((parseFloat(iso[1]) / 8) * 10) / 10;
    var m = s.match(/(\d+(?:\.\d+)?)\s*(day|d|วัน)/i);
    if (m) return parseFloat(m[1]);
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function addDays(iso, days) {
    if (!iso || days === null) return "";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + Math.round(days));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // ---------------- Excel ----------------

  function parseExcel(arrayBuffer) {
    var wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    var sheet = wb.Sheets[wb.SheetNames[0]];
    var raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
    var rawWithDates = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    if (!raw.length) return [];
    var fieldMap = buildFieldMap(Object.keys(raw[0]));
    var fieldToHeader = {}; // field key -> the one header assigned to it (for the raw:true date re-lookup)
    Object.keys(fieldMap).forEach(function (header) { fieldToHeader[fieldMap[header]] = header; });

    var rows = [];
    raw.forEach(function (r, idx) {
      var fields = {};
      Object.keys(r).forEach(function (header) {
        var field = fieldMap[header];
        if (field) fields[field] = r[header];
      });
      var rawName = fields.name;
      if (rawName === undefined || String(rawName).trim() === "") return; // skip blank rows
      var name = String(rawName);
      var indentMatch = name.match(/^[\s\-•]*/)[0];
      var indentDepth = (indentMatch.match(/\t/g) || []).length + Math.floor((indentMatch.replace(/\t/g, "").length) / 2);
      var dateSrc = rawWithDates[idx] || {};
      var startRaw = fieldToHeader.start !== undefined ? dateSrc[fieldToHeader.start] : "";
      var dueRaw = fieldToHeader.due !== undefined ? dateSrc[fieldToHeader.due] : "";

      rows.push({
        name: name.trim(),
        group: fields.group !== undefined ? String(fields.group).trim() : "",
        level: fields.level !== undefined && String(fields.level).trim() !== "" ? parseInt(fields.level, 10) : null,
        indentDepth: indentDepth,
        status: fields.status,
        percent: fields.percent,
        start: excelDateToIso(startRaw),
        due: excelDateToIso(dueRaw),
        owner: fields.owner !== undefined ? String(fields.owner).trim() : "",
        duration: fields.duration
      });
    });
    return rows;
  }

  // ---------------- MS Project XML ----------------

  function textOf(el, tag) {
    var node = el.getElementsByTagName(tag)[0];
    return node ? node.textContent : "";
  }

  function parseMspXml(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid XML file");
    var taskEls = doc.getElementsByTagName("Task");
    var rows = [];
    for (var i = 0; i < taskEls.length; i++) {
      var el = taskEls[i];
      // Only care about direct <Tasks><Task> entries, not nested
      // <PredecessorLink>/etc. that also happen to contain a UID — every
      // real task carries its own <Name>, so skip anything without one.
      var name = textOf(el, "Name");
      if (!name) continue;
      var uidTxt = textOf(el, "UID");
      if (uidTxt === "0") continue; // MS Project's implicit "Project Summary" root task
      var outline = parseInt(textOf(el, "OutlineLevel"), 10);
      var start = textOf(el, "Start");
      var finish = textOf(el, "Finish");
      var percent = textOf(el, "PercentComplete");
      var duration = textOf(el, "Duration");
      rows.push({
        name: name.trim(),
        group: "",
        level: isNaN(outline) ? null : outline - 1, // MSP outline levels are 1-based
        indentDepth: 0,
        status: "",
        percent: percent,
        start: start ? start.slice(0, 10) : "",
        due: finish ? finish.slice(0, 10) : "",
        owner: "",
        duration: duration
      });
    }
    return rows;
  }

  // ---------------- PDF (best-effort) ----------------
  //
  // A PDF has no real notion of "columns" the way a spreadsheet does — this
  // reconstructs plain text *lines* from each page (grouped by shared
  // y-position, ordered left-to-right) and treats each line as one outline
  // entry, with left indent (x-position) standing in for nesting depth —
  // the same role leading whitespace plays for an Excel cell. That works
  // reasonably for an outline/bulleted project plan; a PDF laid out as a
  // wide multi-column table will have each row's cells joined into one
  // run-on line instead of separate fields, since there's no column
  // boundary information to recover.
  //
  // Some PDFs — scans, photos, or (surprisingly common with Thai text)
  // digital PDFs whose embedded font has no usable character mapping —
  // have no extractable text layer at all even though the page clearly
  // shows text. parseFile falls back to OCR (Tesseract.js, Thai + English
  // trained data vendored locally) for exactly those pages: render the
  // page to a canvas and read it as an image instead of text. OCR is
  // slower and meaningfully less accurate than a real text layer,
  // especially on a dense table, so results from this path are worth
  // reviewing before creating the project.
  // A large unexplained horizontal gap between two text runs on the same
  // line — bigger than any normal word space — is the tell for exactly the
  // failure mode this needs to catch: a font whose Thai glyphs have no
  // usable character mapping renders nothing for that run (pdf.js reports
  // no item at all for it), while the surrounding English/numeric text on
  // the same row extracts just fine. A page full of dates and durations
  // like that would otherwise sail past a plain "is there any text here"
  // check — this file's own Gantt table columns (ID, Duration, Start,
  // Finish) are exactly that: real extractable text next to a Task Name
  // column silently missing its Thai. See parsePdf, which OCRs a page once
  // enough of its lines look like this.
  var SUSPICIOUS_GAP_PT = 25;

  function pdfLinesFromItems(items) {
    var Y_TOLERANCE = 3;
    var sorted = items
      .filter(function (it) { return it.str && it.str.trim(); })
      .sort(function (a, b) { return b.y - a.y || a.x - b.x; }); // top-to-bottom, then left-to-right
    var lines = [];
    var current = null;
    sorted.forEach(function (it) {
      if (!current || Math.abs(current.y - it.y) > Y_TOLERANCE) {
        current = { y: it.y, items: [] };
        lines.push(current);
      }
      current.items.push(it);
    });
    return lines.map(function (line) {
      var ordered = line.items.slice().sort(function (a, b) { return a.x - b.x; });
      var text = ordered.map(function (it) { return it.str; }).join(" ").replace(/\s+/g, " ").trim();
      var hasSuspiciousGap = false;
      for (var i = 1; i < ordered.length; i++) {
        var prevEnd = ordered[i - 1].x + (ordered[i - 1].w || 0);
        if (ordered[i].x - prevEnd > SUSPICIOUS_GAP_PT) { hasSuspiciousGap = true; break; }
      }
      return { text: text, x: ordered[0].x, hasSuspiciousGap: hasSuspiciousGap };
    }).filter(function (l) { return l.text; });
  }

  function pageTextLines(page) {
    return page.getTextContent().then(function (content) {
      var items = content.items.map(function (item) {
        return { str: item.str, x: item.transform[4], y: item.transform[5], w: item.width };
      });
      return pdfLinesFromItems(items);
    });
  }

  // A page with unusually dense vector content (e.g. a printed Gantt chart
  // — a timeline grid plus a bar per task) can take pdf.js's canvas
  // renderer far longer than a normal text page, in the worst case long
  // enough to look hung rather than slow. cancel() plus a timeout turns
  // that into a clean failure for just this one page instead of an import
  // that never finishes.
  var PDF_RENDER_TIMEOUT_MS = 20000;

  function renderPageToCanvas(page, scale) {
    var viewport = page.getViewport({ scale: scale || 2 });
    var canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    var renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport });
    return new Promise(function (resolve, reject) {
      var timedOut = false;
      var timer = setTimeout(function () {
        timedOut = true;
        renderTask.cancel();
        reject(new Error("Page took too long to render"));
      }, PDF_RENDER_TIMEOUT_MS);
      renderTask.promise.then(function () {
        clearTimeout(timer);
        if (!timedOut) resolve(canvas);
      }, function (err) {
        clearTimeout(timer);
        if (!timedOut) reject(err);
      });
    });
  }

  // Lazily created once per import attempt (not once per page) — worker
  // startup is the slow part, so every OCR'd page on the same file reuses
  // it. terminatePdfOcrWorker() tears it down after the file is fully
  // processed, success or failure, so a WASM worker never lingers between
  // separate import attempts.
  var ocrWorkerPromise = null;
  function getPdfOcrWorker() {
    if (ocrWorkerPromise) return ocrWorkerPromise;
    if (!window.Tesseract) return Promise.reject(new Error("OCR support failed to load — try reloading the page"));
    ocrWorkerPromise = window.Tesseract.createWorker("tha+eng", 1, {
      workerPath: "shared/vendor/tesseract-worker.min.js",
      corePath: "shared/vendor",
      langPath: "shared/vendor/tessdata",
      gzip: true
    });
    return ocrWorkerPromise;
  }
  function terminatePdfOcrWorker() {
    if (!ocrWorkerPromise) return Promise.resolve();
    var p = ocrWorkerPromise;
    ocrWorkerPromise = null;
    return p.then(function (worker) { return worker.terminate(); }).catch(function () {});
  }

  var PDF_OCR_RECOGNIZE_TIMEOUT_MS = 45000;

  function ocrLinesFromCanvas(worker, canvas) {
    var recognizePromise = worker.recognize(canvas, {}, { text: false, blocks: true }).then(function (result) {
      var lines = [];
      (result.data.blocks || []).forEach(function (block) {
        (block.paragraphs || []).forEach(function (para) {
          (para.lines || []).forEach(function (line) {
            var text = (line.text || "").trim();
            if (text) lines.push({ text: text, x: line.bbox ? line.bbox.x0 : 0 });
          });
        });
      });
      return lines;
    });
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        // recognize() has no cancel — if it's this slow the worker is
        // treated as wedged, so the next page gets a fresh one instead of
        // waiting behind (or getting corrupted results from) this one.
        ocrWorkerPromise = null;
        worker.terminate().catch(function () {});
        reject(new Error("OCR took too long on this page"));
      }, PDF_OCR_RECOGNIZE_TIMEOUT_MS);
      recognizePromise.then(function (lines) { clearTimeout(timer); resolve(lines); }, function (err) { clearTimeout(timer); reject(err); });
    });
  }

  var PDF_MIN_CHARS_PER_PAGE = 15; // below this, treat the page's text layer as unusable and OCR it instead
  var PDF_SUSPICIOUS_LINE_FRACTION = 0.25; // this share of lines with an unexplained gap also triggers OCR

  // Resolves to { lines, usedOcr } — usedOcr is surfaced up to the caller so
  // the UI can warn that OCR results need a closer look before creating
  // the project.
  function parsePdf(arrayBuffer, onProgress) {
    return window.pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(function (pdf) {
      var allLines = [];
      var usedOcr = false;
      var skippedPages = 0;
      var chain = Promise.resolve();
      var addPage = function (pageNum) {
        chain = chain.then(function () {
          return pdf.getPage(pageNum).then(function (page) {
            return pageTextLines(page).then(function (textLines) {
              var chars = textLines.reduce(function (n, l) { return n + l.text.length; }, 0);
              var suspiciousCount = textLines.reduce(function (n, l) { return n + (l.hasSuspiciousGap ? 1 : 0); }, 0);
              var looksReliable = chars >= PDF_MIN_CHARS_PER_PAGE &&
                (!textLines.length || (suspiciousCount / textLines.length) < PDF_SUSPICIOUS_LINE_FRACTION);
              if (looksReliable) {
                allLines = allLines.concat(textLines);
                return;
              }
              usedOcr = true;
              if (onProgress) onProgress(pageNum, pdf.numPages);
              // A page that can't be rendered or OCR'd in time is skipped,
              // not fatal — the rest of the file still has a chance to
              // produce something useful. skippedPages surfaces the count
              // so the caller can tell the user some pages didn't make it.
              return getPdfOcrWorker().then(function (worker) {
                return renderPageToCanvas(page, 2).then(function (canvas) {
                  return ocrLinesFromCanvas(worker, canvas);
                });
              }).then(function (ocrLines) {
                allLines = allLines.concat(ocrLines);
              }).catch(function (err) {
                skippedPages++;
                console.error("PDF import: page " + pageNum + " could not be OCR'd —", err.message);
              });
            });
          });
        });
      };
      for (var i = 1; i <= pdf.numPages; i++) addPage(i);
      return chain.then(function () { return { lines: allLines, usedOcr: usedOcr, skippedPages: skippedPages, totalPages: pdf.numPages }; });
    });
  }

  function buildRowsFromPdfLines(lines) {
    if (!lines.length) return [];
    var minX = Math.min.apply(null, lines.map(function (l) { return l.x; }));
    // ~18pt of extra left indent per nesting level is a rough but workable
    // default for typical outline/bullet indents in a generated PDF.
    var INDENT_UNIT = 18;
    return lines.map(function (l) {
      var indentDepth = Math.max(0, Math.round((l.x - minX) / INDENT_UNIT));
      return { name: l.text, group: "", level: null, indentDepth: indentDepth, status: "", percent: "", start: "", due: "", owner: "", duration: "" };
    });
  }

  // ---------------- shared hierarchy builder ----------------

  function makeTask(groupId, row) {
    var due = row.due;
    if (!due && row.start) {
      var days = parseDurationDays(row.duration);
      if (days !== null) due = addDays(row.start, days);
    }
    return {
      id: PM.uid(), groupId: groupId, name: row.name,
      owner: row.owner || "", status: guessStatus(row.status, row.percent),
      folder: "", start: row.start || "", due: due || "",
      subitemsOpen: false, subitems: [], updates: [],
      stuckReason: "", stuckAttachments: []
    };
  }
  function makeSubitem(row) {
    return {
      id: PM.uid(), name: row.name, owner: row.owner || "",
      status: guessStatus(row.status, row.percent), date: row.due || row.start || "",
      folder: "", updates: [], stuckReason: "", stuckAttachments: []
    };
  }
  function makeGroup(name, idx) {
    return { id: PM.uid(), name: name, color: PM.GROUP_COLORS[idx % PM.GROUP_COLORS.length], collapsed: false };
  }

  function buildHierarchy(rows, fallbackGroupName, fallbackTaskName) {
    var groups = [], tasks = [];
    if (!rows.length) return { groups: groups, tasks: tasks };

    var hasGroupColumn = rows.some(function (r) { return r.group; });

    if (hasGroupColumn) {
      var groupByName = {};
      var lastTaskByGroup = {};
      rows.forEach(function (row) {
        var gName = row.group || fallbackGroupName;
        if (!groupByName[gName]) {
          var g = makeGroup(gName, groups.length);
          groups.push(g);
          groupByName[gName] = g;
        }
        var g2 = groupByName[gName];
        if (row.indentDepth > 0 && lastTaskByGroup[gName]) {
          lastTaskByGroup[gName].subitems.push(makeSubitem(row));
        } else {
          var t = makeTask(g2.id, row);
          tasks.push(t);
          lastTaskByGroup[gName] = t;
        }
      });
      return { groups: groups, tasks: tasks };
    }

    // Level mode: explicit "Outline Level" column, or name indentation.
    var levels = rows.map(function (r) { return r.level !== null ? r.level : r.indentDepth; });
    var minLevel = Math.min.apply(null, levels);
    var hasNesting = Math.max.apply(null, levels) > minLevel;

    if (!hasNesting) {
      // Fully flat sheet — no group/level signal anywhere. Everything
      // becomes one Task per row inside a single default group.
      var flatGroup = makeGroup(fallbackGroupName, 0);
      groups.push(flatGroup);
      rows.forEach(function (row) { tasks.push(makeTask(flatGroup.id, row)); });
      return { groups: groups, tasks: tasks };
    }

    var currentGroup = null, currentTask = null;
    rows.forEach(function (row) {
      var lvl = (row.level !== null ? row.level : row.indentDepth) - minLevel;
      if (lvl <= 0) {
        currentGroup = makeGroup(row.name, groups.length);
        groups.push(currentGroup);
        currentTask = null;
      } else if (lvl === 1) {
        if (!currentGroup) { currentGroup = makeGroup(fallbackGroupName, groups.length); groups.push(currentGroup); }
        currentTask = makeTask(currentGroup.id, row);
        tasks.push(currentTask);
      } else {
        if (!currentTask) {
          if (!currentGroup) { currentGroup = makeGroup(fallbackGroupName, groups.length); groups.push(currentGroup); }
          currentTask = makeTask(currentGroup.id, { name: fallbackTaskName, owner: "", status: "", percent: "", start: "", due: "", duration: "" });
          tasks.push(currentTask);
        }
        currentTask.subitems.push(makeSubitem(row));
      }
    });
    return { groups: groups, tasks: tasks };
  }

  PM.ProjectImport = {
    SUPPORTED_EXTENSIONS: [".xlsx", ".xls", ".xml", ".pdf"],
    // Resolves to { groups, tasks } — the same shape PM.state carries —
    // ready to be merged into a fresh project's state and saved.
    parseFile: function (file, opts) {
      opts = opts || {};
      var fallbackGroupName = opts.fallbackGroupName || "Imported tasks";
      var fallbackTaskName = opts.fallbackTaskName || "Imported task";
      var ext = "." + (file.name.split(".").pop() || "").toLowerCase();
      if (ext === ".xlsx" || ext === ".xls") {
        return file.arrayBuffer().then(function (buf) {
          var rows = parseExcel(buf);
          if (!rows.length) throw new Error("No task rows found in this file");
          return buildHierarchy(rows, fallbackGroupName, fallbackTaskName);
        });
      }
      if (ext === ".xml") {
        return file.text().then(function (text) {
          var rows = parseMspXml(text);
          if (!rows.length) throw new Error("No <Task> entries found in this XML file");
          return buildHierarchy(rows, fallbackGroupName, fallbackTaskName);
        });
      }
      if (ext === ".pdf") {
        if (!window.pdfjsLib) return Promise.reject(new Error("PDF support failed to load — try reloading the page"));
        return file.arrayBuffer().then(function (buf) {
          return parsePdf(buf, opts.onOcrProgress);
        }).then(function (result) {
          if (!result.lines.length) {
            // No extractable text anywhere, even after the OCR fallback —
            // genuinely nothing readable on the page (e.g. blank pages).
            throw new Error(PM.tr("ws.importPdfScannedError"));
          }
          var rows = buildRowsFromPdfLines(result.lines);
          if (!rows.length) throw new Error("No readable text found in this PDF");
          var built = buildHierarchy(rows, fallbackGroupName, fallbackTaskName);
          built.usedOcr = result.usedOcr;
          built.skippedPages = result.skippedPages;
          built.totalPages = result.totalPages;
          return built;
        }).then(
          function (built) { return terminatePdfOcrWorker().then(function () { return built; }); },
          function (err) { return terminatePdfOcrWorker().then(function () { throw err; }); }
        );
      }
      return Promise.reject(new Error("Unsupported file type — use .xlsx, .xls, .xml, or .pdf"));
    }
  };
})();
