/* Port của src/solution2/explanation.py.
 *
 * Sinh giải thích tiếng Việt theo template (deterministic). Không tự thêm tiêu
 * chí hay đổi thứ hạng — chỉ diễn giải kết quả inference engine.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});
  var pyFormat = G8.core.pyFormat;

  // Nhãn thân thiện cho reason_tags
  var TAG_LABEL = {
    good_price: "giá tốt",
    near_school: "gần trường",
    near_park: "gần công viên",
    near_supermarket: "gần siêu thị",
    near_boulevard: "gần trục đường lớn",
    spacious: "diện tích rộng",
    low_price_per_m2: "giá/m² thấp",
  };

  var AMENITY_VI = {
    market: "chợ", cafe: "quán cà phê", kindergarten: "trường mầm non",
    pharmacy: "nhà thuốc", gym: "phòng gym", school: "trường học",
    supermarket: "siêu thị", park: "công viên", hospital: "bệnh viện",
    boulevard: "trục đường lớn",
  };

  function amenityVi(amenity) {
    return Object.prototype.hasOwnProperty.call(AMENITY_VI, amenity)
      ? AMENITY_VI[amenity]
      : amenity;
  }

  /* Cắt chuỗi theo ĐIỂM MÃ, không theo đơn vị UTF-16.
   *
   * Python `text[:50]` đếm theo code point. Tiêu đề trong dataset có emoji (🔥)
   * chiếm 2 đơn vị UTF-16 nhưng chỉ 1 code point, nên `slice(0, 50)` của JS sẽ
   * cắt ngắn hơn Python và làm lệch chuỗi explanation. */
  function sliceCodePoints(text, count) {
    return Array.from(String(text)).slice(0, count).join("");
  }

  /* Trả về chuỗi giải thích tóm tắt cho Top 5. */
  function explain(top5, parsed, form) {
    if (!top5 || !top5.length) return "Không có bất động sản nào thỏa điều kiện.";

    var lines = [];
    var top1 = top5[0];
    var p1 = top1.property;

    lines.push(
      "Top 1 là " + p1.property_id + " (" + sliceCodePoints(p1.title || "", 50) + ") " +
      "với final_score " + pyFormat(top1.final_score, 3) + " " +
      "(base " + pyFormat(top1.base_score, 3) + ", additional " +
      pyFormat(top1.additional_score, 3) + ")."
    );

    // Vai trò của nhu cầu bổ sung
    if (parsed.soft.length) {
      var names = parsed.soft.map(function (r) { return amenityVi(r.amenity_name); }).join(", ");
      lines.push(
        "Nhu cầu bổ sung (" + names + ") đã được đưa vào tính điểm và có thể " +
        "thay đổi thứ hạng so với khi chỉ dùng form."
      );
      // Chỉ ra BĐS hưởng lợi nhất từ nhu cầu bổ sung.
      // Python `max()` trả về phần tử ĐẦU TIÊN khi có nhiều giá trị bằng nhau.
      var bestAdd = top5[0];
      for (var i = 1; i < top5.length; i++) {
        if (top5[i].additional_score > bestAdd.additional_score) bestAdd = top5[i];
      }
      if (bestAdd.additional_score > 0) {
        lines.push(
          bestAdd.property.property_id + " phù hợp nhất với nhu cầu " +
          "bổ sung (additional_score " + pyFormat(bestAdd.additional_score, 3) + ")."
        );
      }
    } else {
      lines.push("Không có nhu cầu bổ sung đo lường được; xếp hạng dựa trên form.");
    }

    // Nhu cầu trùng với form
    if (parsed.duplicates.length) {
      var dups = parsed.duplicates.map(function (d) { return d.raw_phrase; }).join(", ");
      lines.push("Một số nhu cầu đã có sẵn trong form nên được hợp nhất: " + dups + ".");
    }

    // Nhu cầu chưa hỗ trợ
    if (parsed.unsupported.length) {
      lines.push("Các nhu cầu chưa hỗ trợ đo lường (đã gắn cờ): " +
        parsed.unsupported.join("; ") + ".");
    }

    return lines.join(" ");
  }

  G8.explanation = { TAG_LABEL: TAG_LABEL, AMENITY_VI: AMENITY_VI, explain: explain };
})(typeof globalThis !== "undefined" ? globalThis : this);
