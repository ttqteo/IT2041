/* Port của src/solution2/scoring.py.
 *
 * Mọi lời gọi round() bên Python được thay bằng pyRound (round-half-even), KHÔNG
 * dùng Math.round — xem chú thích trong core.js.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});
  var pyRound = G8.core.pyRound;
  var normalizeScore = G8.core.normalizeScore;

  /* Lọc theo ngân sách và số phòng ngủ tối thiểu. */
  function filterHard(properties, form) {
    var budget = form.budget_max_million;
    var minBed = form.min_bedrooms;
    var candidates = [];
    var rejected = [];

    properties.forEach(function (p) {
      var reasons = [];
      if (budget !== null && budget !== undefined && p.price_million_vnd > budget) {
        reasons.push("price " + p.price_million_vnd + " > " + budget);
      }
      if (minBed !== null && minBed !== undefined && (p.bedrooms || 0) < minBed) {
        reasons.push("bedrooms " + p.bedrooms + " < " + minBed);
      }
      if (reasons.length) rejected.push([p, reasons]);
      else candidates.push(p);
    });

    return { candidates: candidates, rejected: rejected };
  }

  function attrValue(prop, attr) {
    if (attr === "price") return prop.price_million_vnd;
    if (attr === "price_per_m2") return prop.price_per_m2_million || 0;
    return prop[attr] || 0;
  }

  /* Trả về list item {property, base_score, base_attributes}. */
  function scoreBase(candidates, form) {
    var prefs = form.soft_preferences || {};
    var attrs = Object.keys(prefs);

    return candidates.map(function (p) {
      var attributes = {};
      var total = 0.0;

      attrs.forEach(function (attr) {
        var pref = prefs[attr];
        var raw = attrValue(p, attr);
        var norm = normalizeScore(raw, pref.min, pref.max, pref.direction);
        var contrib = norm * pref.weight;
        total += contrib;
        attributes[attr] = {
          value: pyRound(raw, 2),
          normalized_score: pyRound(norm, 3),
          weight: pref.weight,
          contribution_score: pyRound(contrib, 4),
          direction: pref.direction,
        };
      });

      return {
        property: p,
        base_score: pyRound(total, 4),
        base_attributes: attributes,
      };
    });
  }

  /* Chuẩn hóa min-max trong nội bộ Top 10 rồi tính additional_score.
   * Mutates each item: thêm 'additional_score' và 'dynamic_attributes'. */
  function scoreAdditional(enrichedItems, parsed) {
    var softAttrs = parsed.soft.map(function (r) { return r.derived_attribute; });

    if (!softAttrs.length || !enrichedItems.length) {
      enrichedItems.forEach(function (item) {
        item.additional_score = 0.0;
        item.dynamic_attributes = {};
      });
      return enrichedItems;
    }

    // Khoảng min/max cho từng thuộc tính trong nhóm
    var ranges = {};
    softAttrs.forEach(function (attr) {
      var values = [];
      enrichedItems.forEach(function (item) {
        var dyn = item.dynamic_values || {};
        if (Object.prototype.hasOwnProperty.call(dyn, attr)) values.push(dyn[attr].value);
      });
      if (values.length) ranges[attr] = [Math.min.apply(null, values), Math.max.apply(null, values)];
    });

    // Trọng số chuẩn hóa về tổng = 1 trên các soft req
    var totalW = parsed.soft.reduce(function (sum, r) { return sum + r.weight; }, 0) || 1.0;

    enrichedItems.forEach(function (item) {
      var dynAttrs = {};
      var addTotal = 0.0;

      parsed.soft.forEach(function (req) {
        var attr = req.derived_attribute;
        var dv = (item.dynamic_values || {})[attr];
        if (dv === undefined || !Object.prototype.hasOwnProperty.call(ranges, attr)) return;

        var vmin = ranges[attr][0];
        var vmax = ranges[attr][1];
        var norm = normalizeScore(dv.value, vmin, vmax, req.direction);
        var wNorm = req.weight / totalW;
        var contrib = norm * wNorm;
        addTotal += contrib;

        dynAttrs[attr] = {
          value: dv.value,
          unit: req.agg === "count" ? "place" : "meter",
          source: "map_api",
          amenity_name: req.amenity_name,
          radius_m: req.radius_m,
          preference_type: req.direction,
          normalized_score: pyRound(norm, 3),
          weight_normalized: pyRound(wNorm, 3),
          contribution_score: pyRound(contrib, 4),
        };
      });

      item.additional_score = pyRound(addTotal, 4);
      item.dynamic_attributes = dynAttrs;
    });

    return enrichedItems;
  }

  function combine(baseScore, additionalScore, alpha, beta) {
    if (alpha === undefined) alpha = 0.7;
    if (beta === undefined) beta = 0.3;
    return pyRound(alpha * baseScore + beta * additionalScore, 4);
  }

  /* True nếu item thỏa toàn bộ hard requirement mới sinh từ free-text. */
  function hardReqPass(item, parsed) {
    for (var i = 0; i < parsed.hard.length; i++) {
      var req = parsed.hard[i];
      var dv = (item.dynamic_values || {})[req.derived_attribute];
      if (dv === undefined) return false;
      if (req.agg === "count") {
        if (dv.value < 1) return false;
      } else if (dv.value > req.radius_m) {
        // nearest_distance: phải nằm trong bán kính yêu cầu
        return false;
      }
    }
    return true;
  }

  /* Loại ứng viên vi phạm hard requirement mới.
   * Nếu loại sạch thì giữ nguyên (để vẫn trả được kết quả) nhưng đánh dấu fail. */
  function postFilter(enrichedItems, parsed) {
    if (!parsed.hard.length) {
      enrichedItems.forEach(function (item) { item.hard_constraint_pass = true; });
      return enrichedItems;
    }

    var passed = [];
    enrichedItems.forEach(function (item) {
      var ok = hardReqPass(item, parsed);
      item.hard_constraint_pass = ok;
      if (ok) passed.push(item);
    });

    return passed.length ? passed : enrichedItems;
  }

  G8.scoring = {
    filterHard: filterHard,
    attrValue: attrValue,
    scoreBase: scoreBase,
    scoreAdditional: scoreAdditional,
    combine: combine,
    hardReqPass: hardReqPass,
    postFilter: postFilter,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
