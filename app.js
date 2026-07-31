/* Điều phối UI cho web tĩnh.
 *
 * Solution 2 chạy thật qua G8.pipeline; Solution 1 lấy contract đã lưu trong
 * G8_S1_RESULTS. Mỗi card ghi rõ nguồn để không ai nhầm kết quả replay là kết
 * quả vừa tính.
 */
(function (global) {
  "use strict";

  var G8 = global.G8;
  var $ = function (id) { return document.getElementById(id); };

  // ── Trạng thái ──
  var state = {
    // Mặc định so sánh cả hai: đó là trọng tâm của đồ án, và mở lên thấy ngay
    // hai cách tiếp cận cạnh nhau thì đỡ phải hướng dẫn.
    solution: "both",
    screen: "advise",
    selectedCase: null,
    lastResults: null,
    lastForm: null,
    lastTopX: 5,
    hasResults: false,
    dataSort: { key: "property_id", dir: 1 },
    // Phải phủ ĐỦ mọi tiêu chí mà validation set dùng, nếu không thì "nạp case"
    // sẽ âm thầm bỏ mất tiêu chí và cho ra thứ hạng khác bản chạy gốc.
    // `price_per_m2` và `hospital` mặc định tắt (0) nhưng vẫn có mặt để nạp được.
    weights: {
      price: { label: "Giá", value: 0.25, min: 1000, max: 12000, direction: "lower_better" },
      price_per_m2: { label: "Giá/m²", value: 0, min: 30, max: 200, direction: "lower_better" },
      distance_to_nearest_school_m: { label: "Trường", value: 0.25, min: 0, max: 2000, direction: "lower_better" },
      distance_to_nearest_park_m: { label: "Công viên", value: 0.20, min: 0, max: 2000, direction: "lower_better" },
      distance_to_nearest_supermarket_m: { label: "Siêu thị", value: 0.15, min: 0, max: 1500, direction: "lower_better" },
      distance_to_nearest_boulevard_m: { label: "Đường lớn", value: 0.10, min: 0, max: 2000, direction: "lower_better" },
      distance_to_nearest_hospital_m: { label: "Bệnh viện", value: 0, min: 0, max: 2500, direction: "lower_better" },
      area_m2: { label: "Diện tích", value: 0.05, min: 30, max: 150, direction: "higher_better" },
    },
  };

  var solutionInfo = {
    solution1: {
      title: "Solution 1: Two-LLM pipeline",
      body: "Kết quả đã lưu sẵn theo case.",
    },
    solution2: {
      title: "Solution 2: Rule-based + POI",
      body: "Chạy trực tiếp trong trình duyệt.",
    },
    both: {
      title: "So sánh Solution 1 và Solution 2",
      body: "Cùng một input, hai cách tiếp cận.",
    },
  };

  var AMENITY_VI = {
    market: "chợ", cafe: "quán cà phê", kindergarten: "mầm non", pharmacy: "nhà thuốc",
    gym: "phòng gym", school: "trường học", supermarket: "siêu thị", park: "công viên",
    hospital: "bệnh viện", boulevard: "trục đường lớn",
  };

  var TAG_VI = {
    good_price: "giá tốt", low_price_per_m2: "giá/m² thấp", spacious: "diện tích rộng",
    near_school: "gần trường", near_park: "gần công viên", near_supermarket: "gần siêu thị",
    near_boulevard: "gần đường lớn", near_hospital: "gần bệnh viện",
  };

  var propertyMap = {};

  // ── Tiện ích chung ──
  function esc(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function icon(name) {
    return '<svg class="ico"><use href="#i-' + name + '"/></svg>';
  }

  function fmtNum(value) {
    var n = Number(value);
    return isFinite(n) ? n.toLocaleString("en-US") : "";
  }

  function numVal(id) {
    var raw = String($(id).value || "").replace(/,/g, "").trim();
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }

  function setNum(id, value) { $(id).value = fmtNum(value); }

  function vndText(vnd) {
    if (!isFinite(vnd) || vnd <= 0) return "";
    if (vnd >= 1e9) return Number((vnd / 1e9).toFixed(2)) + " tỷ đồng";
    if (vnd >= 1e6) return Number((vnd / 1e6).toFixed(2)) + " triệu đồng";
    return fmtNum(vnd) + " đồng";
  }

  function pct(value) {
    if (value === null || value === undefined) return "N/A";
    return Math.round(Number(value) * 100) + "%";
  }

  function setStatus(message) { $("status").textContent = message; }

  /* Solution 2 chạy xong dưới 1ms nên hiện "0.0s" trông như chưa chạy gì.
   * Đổi đơn vị theo độ lớn để con số nói đúng chuyện đã xảy ra. */
  function latencyText(ms) {
    var value = Number(ms) || 0;
    if (value <= 0) return "dưới 1 ms";
    if (value < 1000) return value.toFixed(1) + " ms";
    return (value / 1000).toFixed(1) + " s";
  }

  /* Markdown renderer gọn, đủ cho explanation. Không dùng thư viện ngoài để
   * trang chạy được cả khi offline. */
  function mdToHtml(src) {
    if (!src) return "";
    var inline = function (s) {
      return esc(s)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    };
    var lines = String(src).replace(/\r\n/g, "\n").split("\n");
    var html = "", list = null, para = [];
    var closeList = function () { if (list) { html += "</" + list + ">"; list = null; } };
    var flushPara = function () {
      if (para.length) { html += "<p>" + para.map(inline).join("<br>") + "</p>"; para = []; }
    };
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { flushPara(); closeList(); return; }
      if (/^---+$/.test(line) || /^___+$/.test(line)) { flushPara(); closeList(); html += "<hr>"; return; }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flushPara(); closeList(); html += "<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"; return; }
      var ol = line.match(/^\d+[.)]\s+(.*)$/);
      var ul = line.match(/^[-*•]\s+(.*)$/);
      if (ol) { flushPara(); if (list !== "ol") { closeList(); list = "ol"; html += "<ol>"; } html += "<li>" + inline(ol[1]) + "</li>"; return; }
      if (ul) { flushPara(); if (list !== "ul") { closeList(); list = "ul"; html += "<ul>"; } html += "<li>" + inline(ul[1]) + "</li>"; return; }
      closeList();
      para.push(line);
    });
    flushPara(); closeList();
    return html;
  }

  // ── Sidebar ──
  function renderWeights() {
    var container = $("weights");
    container.innerHTML = Object.keys(state.weights).map(function (key) {
      var item = state.weights[key];
      // Khoảng min-max quyết định điểm chuẩn hóa và bị case ghi đè khi nạp, nên
      // phải hiện ra chứ không để nó đổi ngầm sau lưng người dùng.
      var range = key === "area_m2"
        ? "lấy theo ô diện tích min/max"
        : "chuẩn hóa trong khoảng " + item.min + "–" + item.max;
      return '<div class="weight-row" title="' + esc(item.label + ": " + range) + '">' +
        "<span>" + esc(item.label) + "</span>" +
        '<input type="range" min="0" max="1" step="0.05" value="' + item.value + '" data-weight="' + key + '">' +
        "<output>" + item.value.toFixed(2) + "</output></div>";
    }).join("");
    container.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("input", function () {
        state.weights[input.dataset.weight].value = Number(input.value);
        input.nextElementSibling.textContent = Number(input.value).toFixed(2);
      });
    });
  }

  function renderSolutionInfo() {
    var info = solutionInfo[state.solution];
    $("solutionInfo").innerHTML = "<strong>" + esc(info.title) + "</strong><p>" + esc(info.body) + "</p>";
  }

  function currentForm() {
    var areaMin = numVal("areaMin");
    var areaMax = numVal("areaMax");
    var prefs = {};
    Object.keys(state.weights).forEach(function (key) {
      var item = state.weights[key];
      if (item.value <= 0) return;
      prefs[key] = {
        weight: item.value,
        direction: item.direction,
        min: key === "area_m2" ? areaMin : item.min,
        max: key === "area_m2" ? areaMax : item.max,
      };
    });
    return {
      budget_max_million: Math.round(numVal("budget") / 1e6),
      min_bedrooms: Number($("bedrooms").value),
      soft_preferences: prefs,
      user_need_text: $("freeText").value.trim(),
    };
  }

  // ── Nguồn dữ liệu của validation case ──
  function currentCases() {
    var dataset = $("validationDataset").value;
    return (global.G8_CASES && global.G8_CASES[dataset]) || [];
  }

  function renderCasePicker() {
    var picker = $("casePicker");
    var s1Ids = new Set(((global.G8_S1_RESULTS || {}).cases || []).map(function (c) { return c.case_id; }));
    picker.innerHTML = currentCases().map(function (scenario) {
      var info = G8.eval.scenarioToInput(scenario);
      var flags = ["S2"];
      if (s1Ids.has(info.caseId)) flags.unshift("S1");
      return '<option value="' + esc(info.caseId) + '">' + esc(info.caseId) + " (" + flags.join("+") + ")</option>";
    }).join("");
  }

  function selectedScenario() {
    var wanted = $("casePicker").value;
    var list = currentCases();
    for (var i = 0; i < list.length; i++) {
      if (G8.eval.scenarioToInput(list[i]).caseId === wanted) return list[i];
    }
    return list[0] || null;
  }

  function loadSelectedCase() {
    var scenario = selectedScenario();
    if (!scenario) return;
    var info = G8.eval.scenarioToInput(scenario);
    state.selectedCase = info;

    setNum("budget", (info.form.budget_max_million || 8000) * 1e6);
    updateBudgetNote();
    $("bedrooms").value = info.form.min_bedrooms === undefined ? 2 : info.form.min_bedrooms;
    $("freeText").value = info.form.user_need_text || "";

    // Sao chép ĐỦ weight + min + max + direction, và tắt (0) những tiêu chí case
    // không dùng. Nếu chỉ chép weight thì form sau khi nạp vẫn khác input gốc
    // của case, và Top X sẽ lệch so với lần chạy tham chiếu.
    var prefs = info.form.soft_preferences || {};
    Object.keys(state.weights).forEach(function (key) {
      var item = state.weights[key];
      var pref = prefs[key];
      if (!pref) { item.value = 0; return; }
      item.value = Number(pref.weight);
      item.min = pref.min;
      item.max = pref.max;
      item.direction = pref.direction;
    });
    if (prefs.area_m2) {
      setNum("areaMin", prefs.area_m2.min);
      setNum("areaMax", prefs.area_m2.max);
    }
    renderWeights();
    syncAllHints();
    $("caseBadge").textContent = info.caseId;
    setStatus("Đã nạp " + info.caseId);
  }

  // ── Chạy recommendation ──

  /* Solution 2: chạy thật pipeline JS trên toàn bộ dataset. */
  function runSolution2(form, topX, caseId) {
    var started = performance.now();
    var internal = G8.pipeline.run(form, form.user_need_text || "", global.G8_PROPERTIES, {
      topKBuffer: Math.max(10, topX), topK: topX,
    });
    var latency = Math.round((performance.now() - started) * 10) / 10;
    var contract = G8.contract.toContract(caseId, internal, latency);
    contract.top5 = contract.top5.slice(0, topX);
    contract.__source = "live";
    return contract;
  }

  /* Solution 1: lấy contract đã lưu theo case_id. Không có thì nói rõ, không
   * bịa ra kết quả rỗng trông như "không tìm thấy BĐS nào". */
  function runSolution1(topX, caseId) {
    var bundle = global.G8_S1_RESULTS || {};
    var found = (bundle.cases || []).filter(function (c) { return c.case_id === caseId; })[0];

    if (!found) {
      return {
        case_id: caseId || "—",
        solution_id: "solution_1",
        status: "unavailable",
        top5: [],
        explanation_summary: caseId
          ? "Không có kết quả Solution 1 dựng sẵn cho case `" + caseId + "` (provider " +
            (bundle.provider || "?") + "). Solution 1 cần LLM qua OpenRouter nên không chạy được trong trình duyệt."
          : "Solution 1 chỉ có kết quả cho các case validation. Hãy chọn một case ở sidebar rồi chạy lại.",
        unsupported_requirements: [],
        latency_ms: 0,
        __source: "unavailable",
      };
    }

    var contract = JSON.parse(JSON.stringify(found));
    contract.top5 = (contract.top5 || []).slice(0, topX);
    contract.__source = "replay";
    contract.__provider = bundle.provider;
    return contract;
  }

  /* Form hiện tại có còn khớp input gốc của case không.
   * Quyết định card Solution 1 có phải cảnh báo "kết quả không phản ánh form" hay không. */
  function formMatchesCase(form) {
    var info = state.selectedCase;
    if (!info) return false;
    var origin = info.form || {};
    if (Number(origin.budget_max_million) !== Number(form.budget_max_million)) return false;
    if (Number(origin.min_bedrooms) !== Number(form.min_bedrooms)) return false;
    if ((origin.user_need_text || "").trim() !== (form.user_need_text || "").trim()) return false;

    var a = origin.soft_preferences || {};
    var b = form.soft_preferences || {};
    var keys = new Set(Object.keys(a).concat(Object.keys(b)));
    var same = true;
    keys.forEach(function (key) {
      if (!a[key] || !b[key]) { same = false; return; }
      // min/max cũng đổi điểm chuẩn hóa nên phải so, không chỉ so weight.
      if (Number(a[key].weight) !== Number(b[key].weight)) same = false;
      if (Number(a[key].min) !== Number(b[key].min)) same = false;
      if (Number(a[key].max) !== Number(b[key].max)) same = false;
    });
    return same;
  }

  function runRecommendation() {
    var form = currentForm();
    var topX = Number($("topX").value) || 5;
    var caseId = state.selectedCase ? state.selectedCase.caseId : null;
    var results = {};

    try {
      if (state.solution === "solution2" || state.solution === "both") {
        results.solution2 = runSolution2(form, topX, caseId || "WEB");
      }
      if (state.solution === "solution1" || state.solution === "both") {
        results.solution1 = runSolution1(topX, caseId);
      }
    } catch (error) {
      setStatus("Lỗi khi chạy");
      $("results").innerHTML = '<div class="empty">' + esc(error.message) + "</div>";
      return;
    }

    state.lastResults = results;
    state.lastForm = form;
    state.lastTopX = topX;
    renderResults(results, form);
    setStatus(results.solution2
      ? "Hoàn tất. Solution 2 tính trong " + latencyText(results.solution2.latency_ms)
      : "Hoàn tất. Chỉ hiển thị kết quả Solution 1 đã lưu");
  }

  // ── Render kết quả ──
  function amenityChips(item) {
    var dyn = item.dynamic_attributes || {};
    var chips = Object.keys(dyn).map(function (key) {
      var d = dyn[key];
      var name = AMENITY_VI[d.amenity_name] || d.amenity_name;
      var value = d.unit === "place"
        ? "<b>" + d.value + "</b> trong " + d.radius_m + "m"
        : "<b>" + d.value + "m</b>";
      return '<span class="amenity">' + esc(name) + " " + value + "</span>";
    });
    return chips.length ? '<div class="amenities">' + chips.join("") + "</div>" : "";
  }

  function scoreBreakdown(item) {
    var base = Number(item.base_score);
    var add = Number(item.additional_score);
    if (!isFinite(base) || !isFinite(add) || add === 0) return "";
    var total = Number(item.total_score) || (base + add);
    if (!total) return "";
    var basePart = (0.7 * base / total) * 100;
    var addPart = (0.3 * add / total) * 100;
    return '<div class="score-bar"><span class="base" style="width:' + basePart.toFixed(1) + '%"></span>' +
      '<span class="add" style="width:' + addPart.toFixed(1) + '%"></span></div>' +
      '<div class="score-legend"><span class="base"><i></i>form ' + base.toFixed(3) + "</span>" +
      '<span class="add"><i></i>nhu cầu thêm ' + add.toFixed(3) + "</span></div>";
  }

  function reasonTags(item) {
    var tags = (item.reason_tags || [])
      .filter(function (t) { return t.indexOf("good_") !== 0 || TAG_VI[t]; })
      .map(function (t) { return TAG_VI[t] || t.replace(/_/g, " "); });
    return tags.length
      ? '<div class="why">' + tags.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>"
      : "";
  }

  function parsedPanel(result) {
    var p = result.parsed_requirements;
    var fallback = result.unsupported_requirements || [];
    if (!p) {
      return fallback.length
        ? '<div class="parsed"><div class="parsed-cap">Nhu cầu chưa hỗ trợ đo</div><div class="parsed-row">' +
          fallback.map(function (x) { return '<span class="pill unsup"><em>chưa hỗ trợ</em>' + esc(x) + "</span>"; }).join("") +
          "</div></div>"
        : "";
    }

    var label = function (r) {
      var name = AMENITY_VI[r.amenity_name] || r.amenity_name;
      return r.agg === "count" ? name + ", đếm trong " + r.radius_m + "m" : name + ", khoảng cách gần nhất";
    };
    var groups = [
      ["hard", "bắt buộc", (p.hard || []).map(label)],
      ["soft", "ưu tiên", (p.soft || []).map(label)],
      ["dup", "đã có form", (p.duplicates || []).map(function (d) { return d.raw_phrase; })],
      ["unsup", "chưa hỗ trợ", p.unsupported || fallback],
    ].filter(function (g) { return g[2].length; });

    if (!groups.length) return "";
    var pills = groups.map(function (g) {
      return g[2].map(function (x) {
        return '<span class="pill ' + g[0] + '"><em>' + g[1] + "</em>" + esc(x) + "</span>";
      }).join("");
    }).join("");
    return '<div class="parsed"><div class="parsed-cap">Hệ thống hiểu gì từ nhu cầu tự do</div>' +
      '<div class="parsed-row">' + pills + "</div></div>";
  }

  /* Dải ghi nguồn: đây là chỗ phân biệt kết quả tính thật với kết quả chiếu lại. */
  function provenanceBar(key, result, form) {
    if (key === "solution2") {
      return '<div class="provenance live">' + icon("bolt") +
        "<div><b>Chạy trực tiếp</b> trong trình duyệt trên " + (global.G8_PROPERTIES || []).length +
        " BĐS, phản ánh đúng form bạn vừa nhập.</div></div>";
    }

    if (result.__source === "unavailable") {
      return '<div class="provenance replay">' + icon("alert") +
        "<div><b>Không có dữ liệu.</b> Solution 1 cần LLM nên trang này chỉ chiếu lại kết quả đã lưu.</div></div>";
    }

    var stale = !formMatchesCase(form);
    return '<div class="provenance replay">' + icon("archive") +
      "<div><b>Kết quả đã lưu</b> cho case " + esc(result.case_id) +
      " (provider " + esc(result.__provider || "?") + "). Solution 1 cần LLM nên không chạy được trong trình duyệt." +
      (stale ? " <b>Form hiện tại đã khác input gốc của case, nên kết quả này không phản ánh thay đổi bạn vừa làm.</b>" : "") +
      "</div></div>";
  }

  /* Priority coverage có đo được cho contract này không.
   *
   * Metric đối chiếu `expected.soft_priorities` với `reason_tags` qua một bảng
   * ánh xạ sang tag snake_case. Solution 2 sinh đúng loại tag đó
   * ("near_school"), còn Solution 1 sinh nhãn tiếng Việt tự do ("Gần trường
   * học") nên KHÔNG BAO GIỜ khớp và luôn được 0% dù tư vấn đúng nhu cầu.
   *
   * Hiện 0% cạnh 44% sẽ đọc thành "Solution 1 trượt sạch", trong khi sự thật là
   * hai solution dùng từ vựng nhãn khác nhau. Nên phân biệt "đo được và bằng 0"
   * với "không đo được", và chỉ báo số ở trường hợp đầu.
   *
   * Nhận diện theo ĐỊNH DẠNG tag chứ không hardcode theo tên solution: nếu sau
   * này Solution 1 xuất tag snake_case thì nó được chấm bình thường ngay.
   */
  var MACHINE_TAG = /^[a-z0-9]+(_[a-z0-9]+)*$/;

  function priorityCoverageMeasurable(contract) {
    var tags = [];
    (contract.top5 || []).forEach(function (item) {
      (item.reason_tags || []).forEach(function (tag) { tags.push(tag); });
    });
    // Không sinh tag nào là chuyện khác hẳn với sinh tag sai từ vựng: trường hợp
    // đầu thì coverage 0 là kết quả thật (không tiêu chí nào đủ mạnh để gắn cờ),
    // chỉ trường hợp sau mới là không đo được.
    if (!tags.length) return true;
    return tags.some(function (tag) { return MACHINE_TAG.test(tag); });
  }

  function badgeClass(status) {
    if (status === "ok") return "ok";
    if (status === "unavailable") return "warn";
    return "err";
  }

  function renderResults(results, form) {
    $("caseBadge").textContent = state.selectedCase ? state.selectedCase.caseId : "WEB";

    var html = Object.keys(results).sort().map(function (key) {
      var result = results[key];
      var top = result.top5 || [];
      var rows = top.length
        ? top.map(function (item) {
            var failed = item.hard_constraint_pass === false;
            return '<article class="lst">' +
              '<div class="lst-rank ' + (failed ? "fail" : (item.rank === 1 ? "top" : "")) + '">' + item.rank + "</div><div>" +
              '<h4 class="lst-title">' + esc(item.title || "Không có tiêu đề") + "</h4>" +
              '<div class="lst-sub"><span>' + esc(item.property_id || "") + "</span>" +
              (item.price_billion_vnd ? "<span><b>" + item.price_billion_vnd + "</b> tỷ</span>" : "") + "</div>" +
              amenityChips(item) + scoreBreakdown(item) + reasonTags(item) +
              (failed ? '<div class="lst-flag">' + icon("alert") + "không thỏa ràng buộc bắt buộc từ nhu cầu tự do</div>" : "") +
              '</div><div class="lst-score"><div class="val">' +
              Number(item.total_score || 0).toFixed(3) + '</div><div class="cap">điểm</div></div></article>';
          }).join("")
        : '<div class="empty" style="margin:14px">' + (mdToHtml(result.explanation_summary) || "Không có kết quả.") + "</div>";

      return '<div class="result-card"><div class="result-top"><strong>' + key.toUpperCase() + "</strong>" +
        '<span class="badge ' + badgeClass(result.status) + '">' + esc(result.status) + "</span></div>" +
        provenanceBar(key, result, form) + parsedPanel(result) + rows +
        '<div class="explain"><div class="explain-cap">Giải thích<span>' +
        latencyText(result.latency_ms) + "</span></div>" +
        '<div class="md">' + (mdToHtml(result.explanation_summary) || "<p></p>") + "</div></div></div>";
    }).join("");

    $("results").innerHTML = html || '<div class="empty">Không có response.</div>';
    state.hasResults = Object.keys(results).some(function (k) { return (results[k].top5 || []).length; });
    refreshSticky();
  }

  // ── Màn đánh giá 1 case ──
  function validateCurrent() {
    if (!state.lastResults) runRecommendation();
    if (!state.lastResults) return;

    var info = state.selectedCase;
    var evaluations = {};
    Object.keys(state.lastResults).forEach(function (key) {
      evaluations[key] = G8.eval.evaluateContract(
        state.lastResults[key], state.lastForm,
        info ? info.expected : null, info ? info.groundTruth : null,
        state.lastTopX, propertyMap, null
      );
    });

    renderEvaluation(evaluations, info);
    showScreen("eval");
    $("statusEval").textContent = "Đã chấm " + (info ? info.caseId : "input tự nhập");
  }

  function renderEvaluation(evaluations, info) {
    var noGroundTruth = !info || !info.groundTruth || !info.groundTruth.length;
    var noExpected = !info || !info.expected || !(info.expected.soft_priorities || []).length;

    var unmeasured = [];

    var cards = Object.keys(evaluations).sort().map(function (key) {
      var item = evaluations[key];
      var ir = item.ir_metrics;
      var violations = item.hard_constraints.violations || [];

      var measurable = priorityCoverageMeasurable(state.lastResults[key]);
      if (!noExpected && !measurable) unmeasured.push(key.toUpperCase());
      var coverageValue = (noExpected || measurable)
        ? pct(item.expected_priority_coverage.coverage)
        : "N/A";
      var coverageNote = noExpected
        ? "case không có expected"
        : (measurable ? "so với soft_priorities" : "nhãn không đối chiếu máy được");

      return '<div class="result-card"><div class="result-top"><strong>' + key.toUpperCase() + "</strong>" +
        '<span class="badge ' + badgeClass(item.status) + '">' + esc(item.status) + "</span></div>" +
        '<div class="listing"><div class="metrics">' +
        '<div class="metric"><span>Hard pass</span><strong>' + pct(item.hard_constraints.pass_rate) + "</strong>" +
        "<small>" + (violations.length ? violations.length + " BĐS vi phạm" : "không vi phạm") + "</small></div>" +
        '<div class="metric"><span>Priority coverage</span><strong>' + coverageValue + "</strong>" +
        "<small>" + coverageNote + "</small></div>" +
        '<div class="metric"><span>Precision@K</span><strong>' + (ir ? pct(ir.precision_at_k) : "N/A") + "</strong>" +
        "<small>" + (noGroundTruth ? "case không có ground truth" : "trên " + info.groundTruth.length + " BĐS đúng") + "</small></div>" +
        '<div class="metric"><span>NDCG@K</span><strong>' + (ir ? Number(ir.ndcg_at_k).toFixed(3) : "N/A") + "</strong>" +
        "<small>" + (noGroundTruth ? "case không có ground truth" : "MAP " + Number(ir.average_precision).toFixed(3)) + "</small></div>" +
        "</div>" +
        '<div class="meta">Top X: ' + esc((item.recommended_ids || []).join(", ") || "—") + "</div>" +
        (violations.length
          ? '<div class="meta" style="color:var(--red)">Vi phạm: ' +
            esc(violations.map(function (v) { return v.property_id + " (" + v.reasons.join("; ") + ")"; }).join(" · ")) + "</div>"
          : "") +
        '<div class="meta">Human rubric (chấm tay 0-5): ' +
        esc(Object.keys(G8.eval.MANUAL_CRITERIA).join(", ")) + ".</div>" +
        "</div></div>";
    }).join("");

    $("evaluation").innerHTML =
      (noGroundTruth
        ? '<div class="mode-banner" style="margin-bottom:16px">' + icon("info") +
          "<div>Case này không có <b>ground_truth_top5</b>, nên Precision@K / NDCG@K / MAP hiển thị <b>N/A</b>. " +
          "Đó là giới hạn của validation set, không phải lỗi hệ thống.</div></div>"
        : "") +
      (unmeasured.length
        ? '<div class="mode-banner" style="margin-bottom:16px">' + icon("alert") +
          "<div><b>Priority coverage của " + esc(unmeasured.join(", ")) + " là N/A, không phải 0%.</b> " +
          "Metric này đối chiếu <code>soft_priorities</code> với <code>reason_tags</code> theo từ vựng " +
          "snake_case kiểu <code>near_school</code>, mà " + esc(unmeasured.join(", ")) +
          " lại xuất nhãn tiếng Việt tự do kiểu “Gần trường học”. Hai bên không so được với nhau, " +
          "nên con số 0% sẽ là lỗi đo chứ không phản ánh chất lượng tư vấn.</div></div>"
        : "") +
      '<div class="result-grid">' + cards + "</div>";
  }

  // ── Màn chấm cả bộ ──
  function runBatch() {
    var dataset = $("validationDataset").value;
    var limit = Number($("batchLimit").value) || 5;
    var topX = Number($("topX").value) || 5;
    var scenarios = currentCases().slice(0, limit);
    var s1ById = {};
    ((global.G8_S1_RESULTS || {}).cases || []).forEach(function (c) { s1ById[c.case_id] = c; });

    var rows = [];
    var aggregate = {};
    var skipped = { solution1: [] };
    var unmeasuredCoverage = {};
    var started = performance.now();

    scenarios.forEach(function (scenario) {
      var info = G8.eval.scenarioToInput(scenario);
      var results = {};

      if (state.solution === "solution2" || state.solution === "both") {
        results.solution2 = runSolution2(info.form, topX, info.caseId);
      }
      if (state.solution === "solution1" || state.solution === "both") {
        var saved = s1ById[info.caseId];
        if (saved) {
          var copy = JSON.parse(JSON.stringify(saved));
          copy.top5 = (copy.top5 || []).slice(0, topX);
          results.solution1 = copy;
        } else {
          skipped.solution1.push(info.caseId);
        }
      }

      var evaluations = {};
      Object.keys(results).forEach(function (key) {
        var evaluation = G8.eval.evaluateContract(
          results[key], info.form, info.expected, info.groundTruth, topX, propertyMap, null
        );
        evaluations[key] = evaluation;

        var push = function (name, value) {
          if (value === null || value === undefined) return;
          if (!aggregate[name]) aggregate[name] = [];
          aggregate[name].push(value);
        };
        push(key + "_hard_pass", evaluation.hard_constraints.pass_rate);
        if (evaluation.ir_metrics) {
          push(key + "_precision", evaluation.ir_metrics.precision_at_k);
          push(key + "_recall", evaluation.ir_metrics.recall_at_k);
          push(key + "_ndcg", evaluation.ir_metrics.ndcg_at_k);
        }
        // Chỉ gộp priority coverage khi contract dùng từ vựng tag đối chiếu được.
        // Gộp cả contract không đối chiếu được thì trung bình bị kéo về 0 và
        // biến lỗi đo thành một "kết quả" trông rất thuyết phục.
        if (priorityCoverageMeasurable(results[key])) {
          push(key + "_priority_coverage", evaluation.expected_priority_coverage.coverage);
        } else if (evaluation.expected_priority_coverage.coverage !== null) {
          unmeasuredCoverage[key] = (unmeasuredCoverage[key] || 0) + 1;
        }
      });

      rows.push({ caseId: info.caseId, evaluations: evaluations });
    });

    var summary = {};
    Object.keys(aggregate).forEach(function (name) {
      var values = aggregate[name];
      summary[name] = { value: G8.core.pyRound(values.reduce(function (a, b) { return a + b; }, 0) / values.length, 4), n: values.length };
    });

    renderBatch(summary, rows, scenarios.length, skipped, unmeasuredCoverage, dataset,
      Math.round(performance.now() - started));
    showScreen("batch");
    $("statusBatch").textContent = "Đã chạy " + scenarios.length + " case của " + dataset;
  }

  function renderBatch(summary, rows, total, skipped, unmeasuredCoverage, dataset, elapsedMs) {
    var names = Object.keys(summary).sort();
    var tiles = names.slice(0, 4).map(function (name) {
      return '<div class="metric"><span>' + esc(name) + "</span><strong>" +
        Number(summary[name].value).toFixed(3) + "</strong><small>trung bình trên " +
        summary[name].n + "/" + total + " case</small></div>";
    }).join("");

    var summaryRows = names.map(function (name) {
      return "<tr><td>" + esc(name) + "</td><td>" + Number(summary[name].value).toFixed(4) +
        "</td><td>" + summary[name].n + "/" + total + "</td></tr>";
    }).join("");

    var caseRows = rows.map(function (row) {
      var keys = Object.keys(row.evaluations).sort();
      return "<tr><td>" + esc(row.caseId) + "</td><td>" +
        keys.map(function (k) { return k + ": " + pct(row.evaluations[k].hard_constraints.pass_rate); }).join("<br>") +
        "</td><td>" +
        keys.map(function (k) {
          var ir = row.evaluations[k].ir_metrics;
          return k + ": " + (ir ? pct(ir.precision_at_k) : "N/A");
        }).join("<br>") +
        "</td><td>" +
        keys.map(function (k) { return k + ": " + esc((row.evaluations[k].recommended_ids || []).join(", ")); }).join("<br>") +
        "</td></tr>";
    }).join("");

    // Nói thẳng case nào bị bỏ. Trung bình trên tập con mà không ghi rõ là con
    // số gây hiểu nhầm.
    var notes = "";
    if (skipped.solution1.length) {
      notes = '<div class="mode-banner" style="margin-bottom:16px">' + icon("alert") +
        "<div><b>Solution 1 thiếu " + skipped.solution1.length + "/" + total + " case</b> " +
        "(" + esc(skipped.solution1.slice(0, 8).join(", ")) +
        (skipped.solution1.length > 8 ? ", ..." : "") + "). " +
        "Các case này không có kết quả LLM dựng sẵn nên bị loại khỏi trung bình của Solution 1. " +
        "Solution 2 vẫn tính đủ " + total + " case.</div></div>";
    }

    // Priority coverage không so được giữa hai solution vì chúng dùng từ vựng
    // reason_tags khác nhau. Nếu cứ gộp thì bảng sẽ hiện một số 0 trông như kết
    // quả thật, nên bỏ hẳn dòng đó và nói rõ vì sao.
    var unmeasuredKeys = Object.keys(unmeasuredCoverage || {});
    if (unmeasuredKeys.length) {
      notes += '<div class="mode-banner" style="margin-bottom:16px">' + icon("alert") +
        "<div><b>Priority coverage của " + esc(unmeasuredKeys.map(function (k) { return k.toUpperCase(); }).join(", ")) +
        " không có trong bảng dưới.</b> Metric đối chiếu <code>soft_priorities</code> với " +
        "<code>reason_tags</code> theo từ vựng snake_case kiểu <code>near_school</code>, mà solution này " +
        "xuất nhãn tiếng Việt tự do kiểu \u201cG\u1ea7n tr\u01b0\u1eddng h\u1ecdc\u201d. Gộp vào thì trung bình luôn bằng 0 và " +
        "trông như solution đó trượt sạch, trong khi thực chất là không đo được. " +
        "Số case bị loại: " + unmeasuredKeys.map(function (k) { return k + " " + unmeasuredCoverage[k]; }).join(", ") +
        ".</div></div>";
    }

    $("batchPanel").innerHTML = notes +
      '<div class="metrics">' + (tiles || '<div class="empty">Không có metric</div>') + "</div>" +
      '<div class="meta" style="margin-top:12px">Dataset <b>' + esc(dataset) + "</b> · " + total +
      " case · Solution 2 tính trong " + elapsedMs + " ms</div>" +
      '<div class="table-scroll"><table class="compare-table" style="margin-top:16px">' +
      "<thead><tr><th>Metric</th><th>Giá trị</th><th>Số case tính được</th></tr></thead><tbody>" +
      (summaryRows || '<tr><td colspan="3">Không có summary.</td></tr>') + "</tbody></table></div>" +
      '<div class="table-scroll"><table class="compare-table" style="margin-top:16px">' +
      "<thead><tr><th>Case</th><th>Hard pass</th><th>Precision@K</th><th>Top IDs</th></tr></thead><tbody>" +
      caseRows + "</tbody></table></div>";
  }

  // ── Màn dataset ──
  var DATA_COLUMNS = [
    { key: "property_id", label: "Mã", num: false },
    { key: "title", label: "Tiêu đề", num: false, cls: "title-cell" },
    { key: "district", label: "Quận", num: false },
    { key: "price_billion_vnd", label: "Giá (tỷ)", num: true },
    { key: "area_m2", label: "DT (m²)", num: true },
    { key: "price_per_m2_million", label: "Giá/m² (tr)", num: true },
    { key: "bedrooms", label: "PN", num: true },
    { key: "distance_to_nearest_school_m", label: "Trường (m)", num: true },
    { key: "distance_to_nearest_park_m", label: "Công viên (m)", num: true },
    { key: "distance_to_nearest_supermarket_m", label: "Siêu thị (m)", num: true },
    { key: "distance_to_nearest_boulevard_m", label: "Đường lớn (m)", num: true },
  ];

  function filteredProperties() {
    var district = $("filterDistrict").value;
    var query = $("filterText").value.trim().toLowerCase();
    return (global.G8_PROPERTIES || []).filter(function (p) {
      if (district && p.district !== district) return false;
      if (query) {
        var haystack = (p.property_id + " " + (p.title || "")).toLowerCase();
        if (haystack.indexOf(query) === -1) return false;
      }
      return true;
    });
  }

  function renderDataTable() {
    var rows = filteredProperties().slice();
    var sort = state.dataSort;
    rows.sort(function (a, b) {
      var x = a[sort.key], y = b[sort.key];
      if (typeof x === "string" || typeof y === "string") {
        return String(x).localeCompare(String(y), "vi") * sort.dir;
      }
      return ((x || 0) - (y || 0)) * sort.dir;
    });

    var head = "<thead><tr>" + DATA_COLUMNS.map(function (col) {
      var active = col.key === sort.key;
      return '<th data-key="' + col.key + '" class="' + (active ? "sorted" : "") + '">' +
        esc(col.label) + (active ? (sort.dir > 0 ? " ▲" : " ▼") : "") + "</th>";
    }).join("") + "</tr></thead>";

    var body = "<tbody>" + rows.map(function (p) {
      return "<tr>" + DATA_COLUMNS.map(function (col) {
        var value = p[col.key];
        if (col.num && typeof value === "number") value = value.toLocaleString("vi-VN");
        return '<td class="' + (col.num ? "num" : "") + " " + (col.cls || "") + '">' + esc(value) + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody>";

    $("dataTable").innerHTML = head + body;
    $("dataCount").textContent = rows.length + "/" + (global.G8_PROPERTIES || []).length + " BĐS";

    $("dataTable").querySelectorAll("th").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.dataset.key;
        if (state.dataSort.key === key) state.dataSort.dir *= -1;
        else state.dataSort = { key: key, dir: 1 };
        renderDataTable();
      });
    });
  }

  /* Phân bố không gian vẽ bằng SVG thuần thay vì bản đồ thật.
   * Leaflet cần tile từ CDN nên mở file:// không mạng sẽ ra khung trắng, mâu
   * thuẫn với cam kết chạy offline. Scatter tô màu theo giá còn cho thấy quan hệ
   * vị trí - giá mà bản đồ nền không thể hiện. */
  function renderScatter() {
    var props = global.G8_PROPERTIES || [];
    if (!props.length) return;

    var W = 720, H = 460, PAD = 40;
    var lats = props.map(function (p) { return p.latitude; });
    var lons = props.map(function (p) { return p.longitude; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
    var x = function (lon) { return PAD + ((lon - minLon) / (maxLon - minLon || 1)) * (W - 2 * PAD); };
    // Vĩ độ tăng lên phía bắc, còn trục y của SVG tăng xuống dưới, nên phải lật.
    var y = function (lat) { return H - PAD - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * PAD); };

    /* Giá là đại lượng ĐỘ LỚN nên thang màu phải là sequential: MỘT màu, nhạt
     * đến đậm. Xoay hue kiểu cầu vồng gợi ý những ranh giới hạng mục không có
     * thật trong dữ liệu liên tục.
     *
     * Sáu bậc dưới đây đều đạt tương phản >= 3:1 trên nền panel, kiểm bằng
     * scripts/validate_palette.js của skill dataviz. */
    var RAMP = ["#5f92ce", "#4d83c2", "#3d74b4", "#2d64a5", "#1f5590", "#154778"];

    /* Miền màu cắt ở phân vị 5-95. Chỉ một BĐS 27 tỷ là đủ kéo giãn thang tuyến
     * tính khiến 99 căn còn lại dồn hết vào một bậc và biểu đồ mất thông tin.
     * Hai đầu ghi "≤" và "≥" để không giấu chuyện đã cắt. */
    var sorted = props.map(function (p) { return p.price_billion_vnd || 0; })
      .sort(function (a, b) { return a - b; });
    var quantile = function (q) {
      var pos = (sorted.length - 1) * q;
      var base = Math.floor(pos);
      var rest = pos - base;
      return sorted[base + 1] !== undefined
        ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
        : sorted[base];
    };
    var lowPrice = quantile(0.05);
    var highPrice = quantile(0.95);
    var trueMax = sorted[sorted.length - 1];

    var bucket = function (price) {
      var t = (price - lowPrice) / (highPrice - lowPrice || 1);
      var index = Math.floor(t * RAMP.length);
      return Math.max(0, Math.min(RAMP.length - 1, index));
    };

    var dots = props.map(function (p) {
      var price = p.price_billion_vnd || 0;
      var tip = p.property_id + " · " + price + " tỷ · " + (p.area_m2 || "?") + "m² · " +
        (p.bedrooms || "?") + "PN · " + (p.district || "");
      return '<circle cx="' + x(p.longitude).toFixed(1) + '" cy="' + y(p.latitude).toFixed(1) +
        '" r="5" fill="' + RAMP[bucket(price)] + '" ' +
        // Vòng nền 2px để các chấm chồng nhau vẫn tách bạch.
        'stroke="#f1f5f9" stroke-width="2"><title>' + esc(tip) + "</title></circle>";
    }).join("");

    var scaleKm = 1000 / (111320 * (maxLon - minLon || 1) / (W - 2 * PAD));
    var step = (highPrice - lowPrice) / RAMP.length;

    var swatches = RAMP.map(function (fill, index) {
      var from = lowPrice + step * index;
      var to = lowPrice + step * (index + 1);
      var label = index === 0
        ? "≤ " + to.toFixed(1)
        : (index === RAMP.length - 1 ? "≥ " + from.toFixed(1) : from.toFixed(1) + "–" + to.toFixed(1));
      return '<div class="legend-row"><span class="legend-dot" style="background:' + fill + '"></span>' +
        "<span>" + label + " tỷ</span></div>";
    }).join("");

    $("scatterPanel").innerHTML =
      '<div class="scatter-wrap"><svg class="scatter" viewBox="0 0 ' + W + " " + H + '" role="img" ' +
      'aria-label="Phân bố vị trí ' + props.length + ' bất động sản, màu đậm dần theo giá">' +
      dots +
      '<line x1="' + PAD + '" y1="' + (H - 18) + '" x2="' + (PAD + scaleKm) + '" y2="' + (H - 18) +
      '" stroke="#667085" stroke-width="2"/>' +
      '<text x="' + (PAD + scaleKm + 8) + '" y="' + (H - 14) + '" font-size="12" fill="#667085">1 km</text>' +
      "</svg>" +
      '<div class="legend-note"><b>Giá (tỷ đồng)</b>' + swatches +
      "<p>Màu đậm dần theo giá. Thang cắt ở phân vị 5–95 nên căn đắt nhất " +
      "(" + trueMax.toFixed(1) + " tỷ) nằm chung bậc cuối; nếu trải tuyến tính tới " +
      "mức đó thì 99 căn còn lại dồn hết vào một màu.</p>" +
      "<p>Mỗi chấm là một BĐS đặt theo kinh độ và vĩ độ thật. Rê chuột để xem chi tiết. " +
      "Đây là scatter plot chứ không phải bản đồ: bản đồ nền cần tải tile từ Internet, " +
      "trong khi trang này phải chạy được cả khi không có mạng.</p>" +
      "</div></div>";
  }

  function initDataScreen() {
    var districts = [];
    (global.G8_PROPERTIES || []).forEach(function (p) {
      if (p.district && districts.indexOf(p.district) === -1) districts.push(p.district);
    });
    $("filterDistrict").innerHTML = '<option value="">Tất cả</option>' +
      districts.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + "</option>"; }).join("");

    $("filterDistrict").addEventListener("change", renderDataTable);
    $("filterText").addEventListener("input", renderDataTable);

    renderScatter();
    renderDataTable();
    $("statusData").textContent = (global.G8_PROPERTIES || []).length + " BĐS · " +
      ((global.G8_META && global.G8_META.amenity_names) || []).length + " loại tiện ích precompute";
  }

  // ── Điều hướng ──
  function showScreen(name) {
    state.screen = name;
    document.querySelectorAll(".screen").forEach(function (section) {
      section.classList.toggle("active", section.id === "screen-" + name);
    });
    document.querySelectorAll("#tabs button").forEach(function (button) {
      button.classList.toggle("active", button.dataset.screen === name);
    });
    $("app").classList.toggle("no-sidebar", name === "data");
    refreshSticky();
  }

  // ── Input số có dấu phẩy ──
  function bindNumberInputs() {
    document.querySelectorAll("input[data-num]").forEach(function (input) {
      input.addEventListener("input", function () {
        var caret = input.selectionStart;
        var before = input.value;
        var digitsBeforeCaret = before.slice(0, caret).replace(/\D/g, "").length;
        var digits = before.replace(/\D/g, "");
        if (digits === "") { input.value = ""; return; }
        var formatted = Number(digits).toLocaleString("en-US");
        if (formatted === before) return;
        input.value = formatted;

        var seen = 0, pos = formatted.length;
        for (var i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) seen++;
          if (seen === digitsBeforeCaret) { pos = i + 1; break; }
        }
        if (digitsBeforeCaret === 0) pos = 0;
        input.setSelectionRange(pos, pos);
        if (input.id === "budget") updateBudgetNote();
      });
    });
  }

  function updateBudgetNote() {
    var vnd = numVal("budget");
    var note = $("budgetNote");
    note.textContent = vndText(vnd);
    note.classList.toggle("warn", vnd > 0 && vnd < 1e8);
  }

  function syncHints(box, input) {
    var current = String(input.value || "").replace(/,/g, "").trim();
    box.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.v === current);
    });
  }

  function syncAllHints() {
    document.querySelectorAll(".hints[data-fill]").forEach(function (box) {
      syncHints(box, $(box.dataset.fill));
    });
  }

  function bindHints() {
    document.querySelectorAll(".hints[data-fill]").forEach(function (box) {
      var input = $(box.dataset.fill);
      box.addEventListener("click", function (e) {
        var btn = e.target.closest("button");
        if (!btn) return;
        input.value = input.hasAttribute("data-num") ? fmtNum(btn.dataset.v) : btn.dataset.v;
        syncHints(box, input);
        if (input.id === "budget") updateBudgetNote();
      });
      input.addEventListener("input", function () { syncHints(box, input); });
      syncHints(box, input);
    });

    document.querySelectorAll(".hints[data-append]").forEach(function (box) {
      var field = $(box.dataset.append);
      box.addEventListener("click", function (e) {
        var btn = e.target.closest("button");
        if (!btn) return;
        var phrase = btn.dataset.v;
        var parts = field.value.split(",")
          .map(function (s) { return s.trim().replace(/\.+$/, ""); })
          .filter(Boolean);
        var at = -1;
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].toLowerCase() === phrase.toLowerCase()) { at = i; break; }
        }
        if (at >= 0) parts.splice(at, 1);
        else parts.push(phrase);
        field.value = parts.length ? parts.join(", ") + "." : "";
        btn.classList.toggle("on", at < 0);
      });
    });
  }

  // ── Sticky quick view ──
  var stickyShown = false;
  function updateQuickView() {
    var budget = numVal("budget");
    var need = $("freeText").value.trim();
    $("quickView").innerHTML = '<div class="qv-bar">' +
      '<span class="qv-chip"><b>Ngân sách</b> ≤ ' + (vndText(budget) || "chưa đặt") + "</span>" +
      '<span class="qv-chip"><b>Phòng ngủ</b> ≥ ' + esc($("bedrooms").value) + "</span>" +
      '<span class="qv-chip"><b>Diện tích</b> ' + numVal("areaMin") + " tới " + numVal("areaMax") + " m²</span>" +
      // title giữ nguyên câu đầy đủ vì chip bị cắt bằng ellipsis
      (need ? '<span class="qv-chip qv-need" title="' + esc(need) + '">"' + esc(need) + '"</span>' : "") +
      "</div>";
  }

  function refreshSticky() {
    var panel = $("inputPanel");
    var formGone = state.screen === "advise" && panel
      ? panel.getBoundingClientRect().bottom < 8
      : false;
    var show = state.hasResults && formGone;
    $("scrollTopBtn").classList.toggle("show", window.scrollY > 300);
    if (show !== stickyShown) {
      stickyShown = show;
      if (show) updateQuickView();
      $("quickView").classList.toggle("show", show);
    }
  }

  // ── Tour hướng dẫn ──

  /* Mỗi bước tô sáng một vùng và giải thích vùng đó dùng để làm gì.
   * `screen` để chuyển màn trước khi đo vị trí; `before` để chuẩn bị trạng thái
   * (ví dụ phải có kết quả thì bước nói về kết quả mới có gì để chỉ). */
  var TOUR_STEPS = [
    {
      selector: ".segmented",
      screen: "advise",
      title: "Chọn solution",
      body: "Mặc định là <b>Cả hai</b> để so sánh. <b>Solution 2</b> tính trực tiếp ngay trong trình duyệt; <b>Solution 1</b> cần LLM nên chỉ chiếu lại kết quả đã chạy sẵn.",
    },
    {
      selector: "#casePicker",
      screen: "advise",
      title: "Nạp case có sẵn",
      body: "13 case trong validation set. Chọn một case rồi bấm <b>Nạp case đang chọn</b> là form tự điền đúng input gốc của case đó.",
    },
    {
      selector: "#inputPanel .form-grid",
      screen: "advise",
      title: "Sửa nhu cầu tuỳ ý",
      body: "Đây là phần đáng thử nhất: đổi ngân sách, số phòng ngủ, hoặc gõ nhu cầu tự do. Các badge bên dưới mỗi ô là gợi ý điền nhanh.",
    },
    {
      selector: "#weights",
      screen: "advise",
      title: "Chỉnh trọng số xếp hạng",
      body: "Kéo thanh để đổi mức quan trọng của từng tiêu chí. Kéo về <code>0.00</code> là bỏ hẳn tiêu chí đó khỏi công thức chấm điểm.",
    },
    {
      selector: "#runBtn",
      screen: "advise",
      title: "Chạy thử",
      body: "Bấm nút này sau mỗi lần sửa. Solution 2 tính lại toàn bộ 100 BĐS trong dưới 1 mili giây nên đổi gì là thấy ngay.",
    },
    {
      selector: "#results",
      screen: "advise",
      title: "Đọc kết quả",
      body: "Mỗi card ghi rõ nguồn: dải <b>xanh</b> là chạy trực tiếp, dải <b>cam</b> là kết quả đã lưu. Phần “hệ thống hiểu gì từ nhu cầu tự do” cho thấy máy đã diễn giải câu bạn gõ ra sao.",
      before: function () { if (!state.lastResults) runRecommendation(); },
    },
    {
      selector: '[data-screen="eval"]',
      screen: "advise",
      title: "Chấm một case",
      body: "Tab này chấm Top X vừa chạy: tỷ lệ thoả ràng buộc cứng, độ phủ ưu tiên, và các metric IR nếu case có ground truth.",
    },
    {
      selector: '[data-screen="batch"]',
      screen: "advise",
      title: "Chấm cả bộ",
      body: "Chạy toàn bộ validation set để lấy số trung bình. Số của Solution 2 được tính tại chỗ chứ không lấy sẵn từ báo cáo.",
    },
    {
      selector: '[data-screen="data"]',
      screen: "advise",
      title: "Xem dữ liệu gốc",
      body: "Toàn bộ 100 BĐS mà hệ thống xếp hạng, sắp xếp và lọc được, kèm biểu đồ phân bố vị trí.",
    },
  ];

  var TOUR_STORAGE_KEY = "g8_tour_done";
  var tour = { index: 0, active: false, nodes: null };

  /* localStorage ném SecurityError ở một số trình duyệt khi mở bằng file://.
   * Không được để nó làm chết cả trang, nên bọc lại và coi như "chưa xem". */
  function tourSeen() {
    try { return localStorage.getItem(TOUR_STORAGE_KEY) === "1"; } catch (e) { return false; }
  }
  function markTourSeen() {
    try { localStorage.setItem(TOUR_STORAGE_KEY, "1"); } catch (e) { /* bỏ qua */ }
  }

  function buildTourNodes() {
    if (tour.nodes) return tour.nodes;
    var blocker = document.createElement("div");
    blocker.id = "tourBlocker";
    var spot = document.createElement("div");
    spot.id = "tourSpot";
    // Lần định vị đầu tiên phải hiện thẳng tại chỗ. Nếu để transition chạy, vùng
    // sáng sẽ trượt từ góc trên trái vào, trông như trang bị lỗi.
    spot.style.transition = "none";
    var bubble = document.createElement("div");
    bubble.id = "tourBubble";
    bubble.setAttribute("role", "dialog");
    bubble.setAttribute("aria-live", "polite");
    document.body.appendChild(blocker);
    document.body.appendChild(spot);
    document.body.appendChild(bubble);
    tour.nodes = { blocker: blocker, spot: spot, bubble: bubble };
    return tour.nodes;
  }

  function showTourStep(index) {
    var step = TOUR_STEPS[index];
    if (!step) return endTour(true);
    tour.index = index;

    if (step.screen) showScreen(step.screen);
    if (step.before) step.before();

    var target = document.querySelector(step.selector);
    if (!target) return showTourStep(index + 1);

    target.scrollIntoView({ block: "center", behavior: "auto" });

    var nodes = buildTourNodes();
    var rect = target.getBoundingClientRect();
    var pad = 6;
    var top = rect.top + window.scrollY - pad;
    var left = rect.left + window.scrollX - pad;
    var width = rect.width + pad * 2;
    var height = rect.height + pad * 2;

    nodes.spot.style.top = top + "px";
    nodes.spot.style.left = left + "px";
    nodes.spot.style.width = width + "px";
    nodes.spot.style.height = height + "px";

    // Đặt xong vị trí đầu tiên thì mới bật hiệu ứng trượt cho các bước sau.
    if (nodes.spot.style.transition === "none") {
      requestAnimationFrame(function () { nodes.spot.style.transition = ""; });
    }

    var isLast = index === TOUR_STEPS.length - 1;
    nodes.bubble.innerHTML =
      "<h4>" + esc(step.title) + "</h4><p>" + step.body + "</p>" +
      '<div class="tour-foot"><span class="tour-step">Bước ' + (index + 1) + "/" + TOUR_STEPS.length + "</span>" +
      '<button class="tour-skip" data-tour="skip">Bỏ qua</button>' +
      (index > 0 ? '<button class="secondary" data-tour="prev">Quay lại</button>' : "") +
      '<button class="primary" data-tour="next">' + (isLast ? "Xong" : "Tiếp") + "</button></div>";

    // Đặt bong bóng dưới vùng sáng, không đủ chỗ thì lật lên trên.
    var bubbleRect = nodes.bubble.getBoundingClientRect();
    var below = top + height + 12;
    var above = top - bubbleRect.height - 12;
    var roomBelow = below + bubbleRect.height < window.scrollY + window.innerHeight;
    nodes.bubble.style.top = (roomBelow || above < window.scrollY ? below : above) + "px";

    var maxLeft = window.scrollX + window.innerWidth - bubbleRect.width - 16;
    nodes.bubble.style.left = Math.max(window.scrollX + 16, Math.min(left, maxLeft)) + "px";
  }

  function startTour() {
    tour.active = true;
    buildTourNodes();
    showTourStep(0);
  }

  function endTour(completed) {
    tour.active = false;
    if (tour.nodes) {
      tour.nodes.blocker.remove();
      tour.nodes.spot.remove();
      tour.nodes.bubble.remove();
      tour.nodes = null;
    }
    if (completed) markTourSeen();
  }

  function bindTour() {
    $("tourOpenBtn").addEventListener("click", startTour);

    document.addEventListener("click", function (event) {
      if (!tour.active) return;
      var action = event.target.closest("[data-tour]");
      if (action) {
        var kind = action.dataset.tour;
        if (kind === "next") showTourStep(tour.index + 1);
        else if (kind === "prev") showTourStep(tour.index - 1);
        else endTour(true);
        return;
      }
      // Bấm ra vùng tối cũng đóng, khỏi phải tìm nút.
      if (event.target === tour.nodes.blocker) endTour(true);
    });

    document.addEventListener("keydown", function (event) {
      if (!tour.active) return;
      if (event.key === "Escape") endTour(true);
      else if (event.key === "ArrowRight" || event.key === "Enter") showTourStep(tour.index + 1);
      else if (event.key === "ArrowLeft") showTourStep(tour.index - 1);
    });

    window.addEventListener("resize", function () {
      if (tour.active) showTourStep(tour.index);
    });
  }

  // ── Kiểm tra bundle ──
  function checkBundle() {
    var missing = [];
    if (!global.G8_PROPERTIES) missing.push("data/properties.js");
    if (!global.G8_AMENITIES) missing.push("data/amenities.js");
    if (!global.G8_CASES) missing.push("data/cases.js");
    if (!global.G8_S1_RESULTS) missing.push("data/s1_results.js");

    if (missing.length) {
      $("bundleBanner").innerHTML = '<div class="mode-banner error">' + icon("alert") +
        "<div><b>Thiếu dữ liệu: " + esc(missing.join(", ")) + "</b><br>" +
        "Chạy <code>python3 -m src.data.build_static_bundle</code> ở thư mục gốc dự án rồi mở lại trang.</div></div>";
      return false;
    }
    return true;
  }

  // ── Khởi động ──
  function init() {
    if (!checkBundle()) return;

    (global.G8_PROPERTIES || []).forEach(function (p) { propertyMap[p.property_id] = p; });

    document.querySelectorAll("[data-solution]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.solution = button.dataset.solution;
        document.querySelectorAll("[data-solution]").forEach(function (item) {
          item.classList.toggle("active", item === button);
        });
        renderSolutionInfo();
      });
    });

    document.querySelectorAll("#tabs button").forEach(function (button) {
      button.addEventListener("click", function () { showScreen(button.dataset.screen); });
    });

    $("runBtn").addEventListener("click", runRecommendation);
    $("runBtn2").addEventListener("click", runRecommendation);
    $("validateBtn").addEventListener("click", validateCurrent);
    $("validateBtn2").addEventListener("click", validateCurrent);
    $("batchBtn").addEventListener("click", runBatch);
    $("loadCaseBtn").addEventListener("click", loadSelectedCase);
    $("validationDataset").addEventListener("change", function () {
      renderCasePicker();
      loadSelectedCase();
    });
    $("casePicker").addEventListener("change", loadSelectedCase);
    $("scrollTopBtn").addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("scroll", refreshSticky, { passive: true });

    renderWeights();
    renderSolutionInfo();
    bindNumberInputs();
    bindHints();
    updateBudgetNote();
    renderCasePicker();
    loadSelectedCase();
    initDataScreen();
    bindTour();
    refreshSticky();

    // Lần đầu vào thì tự mở hướng dẫn; lần sau bấm nút "Hướng dẫn" để xem lại.
    if (!tourSeen()) startTour();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
