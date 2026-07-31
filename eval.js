/* Port của phần đánh giá trong web/app.py (dòng 243-361).
 *
 * Toàn bộ là số học thuần nên chạy được trong trình duyệt: hard constraint,
 * độ phủ ưu tiên kỳ vọng, và các metric IR khi case có ground truth.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});
  var pyRound = G8.core.pyRound;

  function precisionAtK(recommendedIds, groundTruthIds, k) {
    if (!k) return 0.0;
    var hits = recommendedIds.slice(0, k)
      .filter(function (id) { return groundTruthIds.indexOf(id) !== -1; }).length;
    return hits / k;
  }

  function recallAtK(recommendedIds, groundTruthIds, k) {
    if (!groundTruthIds.length) return 0.0;
    var hits = recommendedIds.slice(0, k)
      .filter(function (id) { return groundTruthIds.indexOf(id) !== -1; }).length;
    return hits / groundTruthIds.length;
  }

  function ndcgAtK(recommendedIds, groundTruthIds, k) {
    var relevance = {};
    groundTruthIds.forEach(function (id, index) {
      relevance[id] = groundTruthIds.length - index;
    });

    var dcg = 0.0;
    recommendedIds.slice(0, k).forEach(function (id, index) {
      var rel = Object.prototype.hasOwnProperty.call(relevance, id) ? relevance[id] : 0;
      dcg += rel / Math.log2(index + 2);
    });

    var idcg = 0.0;
    var limit = Math.min(k, groundTruthIds.length);
    for (var index = 0; index < limit; index++) {
      idcg += (groundTruthIds.length - index) / Math.log2(index + 2);
    }

    return idcg ? dcg / idcg : 0.0;
  }

  function averagePrecision(recommendedIds, groundTruthIds, k) {
    if (!groundTruthIds.length) return 0.0;
    var hits = 0;
    var total = 0.0;
    recommendedIds.slice(0, k).forEach(function (id, index) {
      if (groundTruthIds.indexOf(id) !== -1) {
        hits += 1;
        total += hits / (index + 1);
      }
    });
    return total / Math.min(k, groundTruthIds.length);
  }

  /* Tỷ lệ Top X không vi phạm ràng buộc cứng của form. */
  function hardConstraintScore(contract, form, propertyMap) {
    var topItems = contract.top5 || [];
    var violations = [];

    topItems.forEach(function (item) {
      var prop = propertyMap[item.property_id] || {};
      var reasons = [];
      var budget = form.budget_max_million;
      var minBedrooms = form.min_bedrooms;

      if (budget !== null && budget !== undefined && (prop.price_million_vnd || 0) > budget) {
        reasons.push("price " + prop.price_million_vnd + " > " + budget);
      }
      if (minBedrooms !== null && minBedrooms !== undefined && (prop.bedrooms || 0) < minBedrooms) {
        reasons.push("bedrooms " + prop.bedrooms + " < " + minBedrooms);
      }
      if (item.hard_constraint_pass === false) {
        reasons.push("pipeline marked hard_constraint_pass=false");
      }
      if (reasons.length) violations.push({ property_id: item.property_id, reasons: reasons });
    });

    var total = topItems.length;
    var passRate = total ? (total - violations.length) / total : 1.0;
    return { pass_rate: pyRound(passRate, 4), violations: violations };
  }

  var PRIORITY_TAGS = {
    "near school": "near_school",
    "gần trường": "near_school",
    "near park": "near_park",
    "gần công viên": "near_park",
    "near supermarket": "near_supermarket",
    "gần siêu thị": "near_supermarket",
    "near hospital": "near_hospital",
    "near boulevard": "near_boulevard",
    "reasonable price": "good_price",
    "giá tốt": "good_price",
    "low price per m2": "low_price_per_m2",
    spacious: "spacious",
    "diện tích": "spacious",
  };

  /* Bao nhiêu ưu tiên kỳ vọng của case xuất hiện trong reason_tags của Top X. */
  function expectedPriorityScore(contract, expected) {
    var priorities = (expected && expected.soft_priorities) || [];
    var tags = new Set();
    (contract.top5 || []).forEach(function (item) {
      (item.reason_tags || []).forEach(function (tag) { tags.add(tag); });
    });

    var checks = priorities.map(function (priority) {
      var key = String(priority).toLowerCase();
      var expectedTag = Object.prototype.hasOwnProperty.call(PRIORITY_TAGS, key)
        ? PRIORITY_TAGS[key]
        : null;
      return {
        priority: priority,
        expected_tag: expectedTag,
        matched: Boolean(expectedTag && tags.has(expectedTag)),
      };
    });

    var matched = checks.filter(function (c) { return c.matched; }).length;
    return {
      coverage: checks.length ? pyRound(matched / checks.length, 4) : null,
      checks: checks,
    };
  }

  var MANUAL_CRITERIA = {
    relevance: "Mức phù hợp với nhu cầu mô tả tự do.",
    constraint_fit: "Có tôn trọng ngân sách, số phòng, tiện ích bắt buộc.",
    explainability: "Lý do đề xuất rõ ràng và kiểm chứng được.",
    diversity: "Top X có đủ lựa chọn thay thế hợp lý.",
    trust: "Người đánh giá có sẵn sàng shortlist kết quả này không.",
  };

  function manualScore(manualScores) {
    if (!manualScores || !Object.keys(manualScores).length) {
      return { average: null, criteria: MANUAL_CRITERIA };
    }
    var clipped = {};
    var sum = 0;
    var count = 0;
    Object.keys(manualScores).forEach(function (key) {
      var value = Math.max(0.0, Math.min(5.0, Number(manualScores[key])));
      clipped[key] = value;
      sum += value;
      count += 1;
    });
    return { average: count ? pyRound(sum / count, 3) : null, criteria: clipped };
  }

  function evaluateContract(contract, form, expected, groundTruthTop5, topX, propertyMap, manualScores) {
    var recommendedIds = (contract.top5 || [])
      .map(function (item) { return item.property_id; })
      .filter(Boolean);

    var ir = null;
    if (groundTruthTop5 && groundTruthTop5.length) {
      ir = {
        precision_at_k: pyRound(precisionAtK(recommendedIds, groundTruthTop5, topX), 4),
        recall_at_k: pyRound(recallAtK(recommendedIds, groundTruthTop5, topX), 4),
        ndcg_at_k: pyRound(ndcgAtK(recommendedIds, groundTruthTop5, topX), 4),
        average_precision: pyRound(averagePrecision(recommendedIds, groundTruthTop5, topX), 4),
      };
    }

    return {
      status: contract.status,
      recommended_ids: recommendedIds,
      hard_constraints: hardConstraintScore(contract, form, propertyMap),
      expected_priority_coverage: expectedPriorityScore(contract, expected),
      ir_metrics: ir,
      manual_evaluation: manualScore(manualScores),
    };
  }

  /* Chuyển một scenario của validation set sang form + metadata.
   * Port của `scenario_to_input` trong web/app.py. */
  function scenarioToInput(scenario) {
    if (Object.prototype.hasOwnProperty.call(scenario, "input")) {
      var form = scenario.input;
      return {
        form: form,
        freeText: form.user_need_text || "",
        expected: scenario.expected || null,
        groundTruth: scenario.ground_truth_top5 || null,
        caseId: scenario.case_id || "case",
      };
    }
    var hard = scenario.hard_constraints || {};
    var built = {
      budget_max_million: hard.budget_max_million,
      min_bedrooms: hard.min_bedrooms,
      soft_preferences: scenario.soft_preferences || {},
      user_need_text: scenario.user_need_text || scenario.name || "",
    };
    return {
      form: built,
      freeText: built.user_need_text,
      expected: null,
      groundTruth: scenario.ground_truth_top5 || null,
      caseId: scenario.scenario_id || "case",
    };
  }

  G8.eval = {
    PRIORITY_TAGS: PRIORITY_TAGS,
    precisionAtK: precisionAtK,
    recallAtK: recallAtK,
    ndcgAtK: ndcgAtK,
    averagePrecision: averagePrecision,
    hardConstraintScore: hardConstraintScore,
    expectedPriorityScore: expectedPriorityScore,
    manualScore: manualScore,
    evaluateContract: evaluateContract,
    scenarioToInput: scenarioToInput,
    MANUAL_CRITERIA: MANUAL_CRITERIA,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
