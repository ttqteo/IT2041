/* Port của src/solution2/enrichment.py.
 *
 * Với MỖI BĐS, sinh CÙNG một tập thuộc tính động từ các requirement đo lường
 * được (soft + hard). Bất biến: thuộc tính tạo cho 1 ứng viên thì tạo cho toàn
 * bộ Top 10.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});

  /* Gộp soft + hard, loại trùng theo derived_attribute (giữ cái gặp trước). */
  function uniqueReqs(parsed) {
    var seen = {};
    var order = [];
    parsed.soft.concat(parsed.hard).forEach(function (req) {
      if (!Object.prototype.hasOwnProperty.call(seen, req.derived_attribute)) {
        seen[req.derived_attribute] = req;
        order.push(req.derived_attribute);
      }
    });
    return order.map(function (key) { return seen[key]; });
  }

  /* Thêm `dynamic_values` cho từng item trong Top 10. */
  function enrichTop10(scoredTop10, parsed) {
    var reqs = uniqueReqs(parsed);

    scoredTop10.forEach(function (item) {
      var location = G8.amenityTools.geocode(item.property);
      var dynamicValues = {};

      reqs.forEach(function (req) {
        var res = G8.amenityTools.searchAmenities(
          location.propertyId, req.amenity_name, req.radius_m
        );
        var value;
        if (req.agg === "count") {
          value = res.count;
        } else {
          // nếu không có tiện ích nào, coi như rất xa (radius * 2)
          value = res.nearest_distance_m;
          if (value === null || value === undefined) value = req.radius_m * 2;
        }

        dynamicValues[req.derived_attribute] = {
          value: value,
          amenity_name: req.amenity_name,
          agg: req.agg,
          radius_m: req.radius_m,
          direction: req.direction,
          weight: req.weight,
        };
      });

      item.dynamic_values = dynamicValues;
    });

    return scoredTop10;
  }

  G8.enrichment = { uniqueReqs: uniqueReqs, enrichTop10: enrichTop10 };
})(typeof globalThis !== "undefined" ? globalThis : this);
