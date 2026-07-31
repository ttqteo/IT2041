/* Port của src/solution2/pipeline.py.
 *
 * Form + Additional Request -> Requirement Parsing -> Rule-based Top 10
 * -> Enrichment -> Post-filter -> Re-scoring/Re-ranking -> Top 5 -> Explanation.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});

  // Map base attribute -> reason tag khi normalized_score đủ cao
  var BASE_TAG = {
    price: "good_price",
    price_per_m2: "low_price_per_m2",
    distance_to_nearest_school_m: "near_school",
    distance_to_nearest_park_m: "near_park",
    distance_to_nearest_supermarket_m: "near_supermarket",
    distance_to_nearest_boulevard_m: "near_boulevard",
    area_m2: "spacious",
  };

  function reasonTags(item) {
    var tags = [];
    var base = item.base_attributes || {};
    Object.keys(base).forEach(function (attr) {
      if (base[attr].normalized_score >= 0.6 && Object.prototype.hasOwnProperty.call(BASE_TAG, attr)) {
        tags.push(BASE_TAG[attr]);
      }
    });
    var dynamic = item.dynamic_attributes || {};
    Object.keys(dynamic).forEach(function (attr) {
      if (dynamic[attr].normalized_score >= 0.6) {
        tags.push("good_" + dynamic[attr].amenity_name);
      }
    });
    return tags;
  }

  /* Sắp xếp giảm dần theo `key`, giữ nguyên thứ tự tương đối của các phần tử
   * bằng nhau — giống `list.sort(key=..., reverse=True)` của Python.
   *
   * KHÔNG dùng .sort().reverse(): reverse() đảo cả các phần tử bằng điểm nhau và
   * làm lệch thứ hạng so với bản Python.
   */
  function sortDescStable(items, key) {
    return items.sort(function (a, b) { return key(b) - key(a); });
  }

  /* Chạy toàn bộ pipeline Solution 2, trả về InternalResult. */
  function run(form, freeText, properties, options) {
    var opts = options || {};
    var alpha = opts.alpha === undefined ? 0.7 : opts.alpha;
    var beta = opts.beta === undefined ? 0.3 : opts.beta;
    var topKBuffer = opts.topKBuffer === undefined ? 10 : opts.topKBuffer;
    var topK = opts.topK === undefined ? 5 : opts.topK;

    var parsed = G8.parser.parse(form, freeText);

    // Bước 3: lọc cứng + chấm điểm form -> Top 10
    var filtered = G8.scoring.filterHard(properties, form);
    if (!filtered.candidates.length) {
      return {
        parsed: parsed,
        total_properties: properties.length,
        after_filter: 0,
        rejected_count: filtered.rejected.length,
        top5: [],
        explanation: "Không có BĐS nào qua bộ lọc cứng.",
        alpha: alpha,
        beta: beta,
        status: "no_candidates",
      };
    }

    var baseScored = G8.scoring.scoreBase(filtered.candidates, form);
    sortDescStable(baseScored, function (x) { return x.base_score; });
    var top10 = baseScored.slice(0, topKBuffer);

    var hasMeasurable = Boolean(parsed.soft.length || parsed.hard.length);

    // Bước 4 & 5: enrichment + post-filter + additional scoring
    if (hasMeasurable) {
      G8.enrichment.enrichTop10(top10, parsed);
      top10 = G8.scoring.postFilter(top10, parsed);
      G8.scoring.scoreAdditional(top10, parsed);
    } else {
      top10.forEach(function (item) {
        item.additional_score = 0.0;
        item.dynamic_attributes = {};
        item.hard_constraint_pass = true;
      });
    }

    // alpha/beta hiệu dụng: không có soft req đo được thì final = base
    var aEff = parsed.soft.length ? alpha : 1.0;
    var bEff = parsed.soft.length ? beta : 0.0;

    top10.forEach(function (item) {
      item.final_score = G8.scoring.combine(item.base_score, item.additional_score, aEff, bEff);
    });

    // Bước 6: re-rank -> Top 5
    sortDescStable(top10, function (x) { return x.final_score; });
    var top5 = top10.slice(0, topK);
    top5.forEach(function (item) { item.reason_tags = reasonTags(item); });

    return {
      parsed: parsed,
      total_properties: properties.length,
      after_filter: filtered.candidates.length,
      rejected_count: filtered.rejected.length,
      top5: top5,
      explanation: G8.explanation.explain(top5, parsed, form),
      alpha: aEff,
      beta: bEff,
      status: "ok",
    };
  }

  G8.pipeline = { run: run, reasonTags: reasonTags };
})(typeof globalThis !== "undefined" ? globalThis : this);
