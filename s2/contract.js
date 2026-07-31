/* Port của src/solution2/output_contract.py.
 *
 * Map InternalResult -> output contract chung của nhóm.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});

  var SOLUTION_ID = "solution_2";

  function brief(req) {
    return {
      raw_phrase: req.raw_phrase,
      amenity_name: req.amenity_name,
      derived_attribute: req.derived_attribute,
      agg: req.agg,
      radius_m: req.radius_m,
      direction: req.direction,
    };
  }

  /* Tóm tắt kết quả parse free-text để hiển thị/đối chiếu. */
  function parsedSummary(parsed) {
    if (!parsed) return { hard: [], soft: [], duplicates: [], unsupported: [] };
    return {
      hard: (parsed.hard || []).map(brief),
      soft: (parsed.soft || []).map(brief),
      duplicates: (parsed.duplicates || []).slice(),
      unsupported: (parsed.unsupported || []).slice(),
    };
  }

  /* Chuyển kết quả nội bộ sang object đúng schema chung. */
  function toContract(caseId, internal, latencyMs) {
    var top5 = (internal.top5 || []).map(function (item, index) {
      var prop = item.property;
      return {
        rank: index + 1,
        property_id: prop.property_id,
        total_score: item.final_score !== undefined ? item.final_score : (item.base_score || 0.0),
        hard_constraint_pass: Boolean(
          item.hard_constraint_pass === undefined ? true : item.hard_constraint_pass
        ),
        reason_tags: item.reason_tags || [],
        // ── field mở rộng ──
        base_score: item.base_score !== undefined ? item.base_score : 0.0,
        additional_score: item.additional_score !== undefined ? item.additional_score : 0.0,
        dynamic_attributes: item.dynamic_attributes || {},
        title: prop.title || "",
        price_billion_vnd: prop.price_billion_vnd,
      };
    });

    var parsed = internal.parsed;

    return {
      case_id: caseId,
      solution_id: SOLUTION_ID,
      status: internal.status || "ok",
      top5: top5,
      explanation_summary: internal.explanation || "",
      unsupported_requirements: ((parsed && parsed.unsupported) || []).slice(),
      latency_ms: latencyMs,
      // ── field mở rộng ──
      // Hệ thống hiểu gì từ free-text. Cần cho UI/report vì `hard` chỉ dùng để
      // lọc ứng viên nên không xuất hiện trong `dynamic_attributes`.
      parsed_requirements: parsedSummary(parsed),
    };
  }

  G8.contract = { SOLUTION_ID: SOLUTION_ID, toContract: toContract };
})(typeof globalThis !== "undefined" ? globalThis : this);
