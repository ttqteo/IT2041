/* Port của src/solution2/requirement_parser.py.
 *
 * Tách `user_need_text` thành: hard / soft (đo lường được) / unsupported, đồng
 * thời dedup với các tiêu chí đã có trong form. Deterministic hoàn toàn — không
 * gọi LLM, nên chạy được trong trình duyệt.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});

  /* Python `\w` (chế độ str) khớp mọi ký tự alnum Unicode + gạch dưới, còn `\w`
   * của JS chỉ khớp ASCII. Dùng lớp ký tự Unicode để lookaround hành xử giống
   * nhau trên chuỗi CÓ dấu tiếng Việt. */
  var WORD_CHAR = "[\\p{L}\\p{N}_]";

  /* Chuẩn hóa để so khớp: lowercase + bỏ dấu tiếng Việt.
   *
   * Validation set dùng chung của nhóm nhập free-text KHÔNG dấu
   * ("Nha phai co cho trong vong 1km"), trong khi lexicon viết CÓ dấu.
   * Bỏ dấu hai phía trước khi so khớp giúp parser hoạt động với cả hai kiểu nhập.
   */
  function norm(text) {
    return String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .replace(/đ/g, "d");
  }

  // ── Lexicon: cụm từ tiếng Việt -> amenity_name mà tool hiểu ──
  // Thứ tự khai báo có ý nghĩa: cụ thể -> chung, nên `kindergarten` được xét
  // trước `school` ("trường mầm non" ra kindergarten, không ra school).
  var AMENITY_LEXICON = {
    market: ["chợ"],
    cafe: ["cafe", "cà phê", "ca phe", "quán cà phê", "coffee"],
    kindergarten: ["mầm non", "mẫu giáo", "nhà trẻ"],
    school: ["trường học", "trường cấp", "trường tiểu học", "gần trường"],
    supermarket: ["siêu thị"],
    park: ["công viên"],
    hospital: ["bệnh viện", "phòng khám"],
    pharmacy: ["nhà thuốc", "hiệu thuốc"],
    gym: ["gym", "phòng tập", "phòng gym"],
    boulevard: ["trục đường", "đường lớn", "đường chính", "mặt tiền lớn"],
  };

  // amenity đã được form xử lý -> field tương ứng trong soft_preferences
  var FORM_AMENITY_FIELDS = {
    school: "distance_to_nearest_school_m",
    park: "distance_to_nearest_park_m",
    supermarket: "distance_to_nearest_supermarket_m",
    boulevard: "distance_to_nearest_boulevard_m",
    hospital: "distance_to_nearest_hospital_m",
  };

  // Từ khóa nhu cầu chủ quan / không đo được bằng tool hiện có
  var SUBJECTIVE_KEYWORDS = [
    "yên tĩnh", "yen tinh", "vibe", "hàng xóm", "an ninh", "sang trọng",
    "phong thủy", "phong thuy", "view đẹp", "thoáng mát", "đông dân",
    "khu dân cư", "dân trí", "thân thiện", "sầm uất",
  ];

  // Dấu hiệu đây là một nhu cầu (để không gắn cờ những mệnh đề rác)
  var NEED_MARKERS = ["muốn", "ưu tiên", "uu tien", "cần", "thích", "gần", "nhiều",
    "càng", "trong vòng", "trong ban kinh", "trong bán kính", "có"];

  // Dấu hiệu ràng buộc cứng
  var HARD_MARKERS = ["phải", "bắt buộc", "tối thiểu", "ít nhất", "không quá", "chỉ nhận"];

  // Dấu hiệu muốn ĐẾM số lượng (higher_better) thay vì khoảng cách gần nhất
  var COUNT_MARKERS = ["nhiều", "càng nhiều", "số lượng", "mật độ", "nhiều tiện ích",
    "bao quanh", "xung quanh"];

  // Lexicon đã bỏ dấu sẵn để so khớp (tính 1 lần)
  var LEXICON_NORM = {};
  Object.keys(AMENITY_LEXICON).forEach(function (amenity) {
    LEXICON_NORM[amenity] = AMENITY_LEXICON[amenity].map(norm);
  });
  var SUBJECTIVE_NORM = SUBJECTIVE_KEYWORDS.map(norm);
  var NEED_NORM = NEED_MARKERS.map(norm);
  var HARD_NORM = HARD_MARKERS.map(norm);
  var COUNT_NORM = COUNT_MARKERS.map(norm);

  /* Tách free-text thành các mệnh đề nhỏ (chấp nhận cả 'và' lẫn 'va'). */
  function splitClauses(text) {
    return String(text)
      .split(/[,.;\n]|(?:\s+v[àa]\s+)|(?:\s+&\s+)/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
  }

  // Bẫy đồng âm khi bỏ dấu: "chợ" -> "cho", trùng với giới từ "cho" và "chỗ".
  // Chỉ áp dụng cho input KHÔNG dấu; input có dấu không cần vì "chợ" != "cho".
  var FALSE_FRIENDS = {
    market: new RegExp(
      "\\bcho\\s+(thue|con|phep|nen|biet|vay|toi|minh|gia|nguoi)\\b" +
        "|\\b(du|danh|dam\\s+bao|khong)\\s+cho\\b"
    ),
  };

  function hasDiacritics(text) {
    return norm(text) !== String(text).toLowerCase();
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* Trả về amenity_name khớp trong mệnh đề, hoặc null. */
  function detectAmenity(clause) {
    var accented = hasDiacritics(clause);
    var lexicon = accented ? AMENITY_LEXICON : LEXICON_NORM;
    var text = accented ? String(clause).toLowerCase() : norm(clause);
    var amenities = Object.keys(lexicon);

    for (var i = 0; i < amenities.length; i++) {
      var amenity = amenities[i];
      if (!accented) {
        var trap = FALSE_FRIENDS[amenity];
        if (trap && trap.test(text)) continue;
      }
      var phrases = lexicon[amenity];
      for (var j = 0; j < phrases.length; j++) {
        var pattern = new RegExp(
          "(?<!" + WORD_CHAR + ")" + escapeRegExp(phrases[j]) + "(?!" + WORD_CHAR + ")",
          "u"
        );
        if (pattern.test(text)) return amenity;
      }
    }
    return null;
  }

  /* Trích bán kính (m) từ mệnh đề, mặc định 1000m nếu không nêu. */
  function parseRadiusM(clause) {
    var low = norm(clause);
    var km = low.match(/(\d+(?:[.,]\d+)?)\s*km/);
    if (km) return Math.trunc(parseFloat(km[1].replace(",", ".")) * 1000);
    var m = low.match(/(\d+)\s*m(?:et)?\b/);
    if (m) return parseInt(m[1], 10);
    return 1000;
  }

  function containsAny(text, keywords) {
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) !== -1) return true;
    }
    return false;
  }

  /* Phân tích free_text dựa trên năng lực tool và các tiêu chí đã có trong form. */
  function parse(form, freeText) {
    var result = { soft: [], hard: [], unsupported: [], duplicates: [] };
    if (!freeText || !String(freeText).trim()) return result;

    var supported = G8.amenityTools.knownAmenities();
    var formPrefs = (form && form.soft_preferences) || {};
    var clauses = splitClauses(freeText);

    for (var i = 0; i < clauses.length; i++) {
      var clause = clauses[i];
      var low = norm(clause);
      var amenity = detectAmenity(clause);

      // 1) Không map được sang amenity nào tool hiểu -> xét unsupported.
      if (amenity === null) {
        if (containsAny(low, SUBJECTIVE_NORM) || containsAny(low, NEED_NORM)) {
          result.unsupported.push(clause);
        }
        continue;
      }

      // 2) amenity không nằm trong năng lực tool
      if (!supported.has(amenity)) {
        result.unsupported.push(clause);
        continue;
      }

      // 4) Dedup với form
      var formField = FORM_AMENITY_FIELDS[amenity];
      if (formField && Object.prototype.hasOwnProperty.call(formPrefs, formField)) {
        result.duplicates.push({ raw_phrase: clause, form_field: formField });
        continue;
      }

      // 5) Sinh requirement đo lường được
      var isCount = containsAny(low, COUNT_NORM);
      var radius = parseRadiusM(clause);
      var weight = low.indexOf("cang") !== -1 || low.indexOf("rat") !== -1 ? 1.5 : 1.0;

      var req = isCount
        ? {
            raw_phrase: clause,
            amenity_name: amenity,
            agg: "count",
            radius_m: radius,
            derived_attribute: "nearby_" + amenity + "_count_within_" + radius + "m",
            direction: "higher_better",
            weight: weight,
          }
        : {
            raw_phrase: clause,
            amenity_name: amenity,
            agg: "nearest_distance",
            radius_m: radius,
            derived_attribute: "distance_to_nearest_" + amenity + "_m",
            direction: "lower_better",
            weight: weight,
          };

      if (containsAny(low, HARD_NORM)) result.hard.push(req);
      else result.soft.push(req);
    }

    return result;
  }

  G8.parser = {
    AMENITY_LEXICON: AMENITY_LEXICON,
    FORM_AMENITY_FIELDS: FORM_AMENITY_FIELDS,
    norm: norm,
    splitClauses: splitClauses,
    detectAmenity: detectAmenity,
    parseRadiusM: parseRadiusM,
    parse: parse,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
