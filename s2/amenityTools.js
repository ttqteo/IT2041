/* Port của src/solution2/amenity_tools.py — thay lời gọi mạng bằng bảng tra sẵn.
 *
 * Đây là module DUY NHẤT khác bản chất so với Python. Bản Python query Overpass
 * API ở bán kính max(radius_m, 2000) rồi tính count/nearest từ tập trả về. Bản
 * này đọc `G8_AMENITIES` — bảng khoảng cách đã sắp xếp do
 * src/data/build_static_bundle.py dựng sẵn từ CÙNG tập phần tử Overpass đó.
 * Nhờ vậy kết quả trùng khít với Python cho mọi radius <= 2000m, không phải xấp xỉ.
 *
 * Khác biệt interface: Python nhận (lat, lon) rồi tự query, bản này nhận
 * propertyId vì bảng tra khoá theo BĐS. `geocode()` vì thế cũng trả thêm id.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});
  var pyRound = G8.core.pyRound;

  /* Cùng danh sách với AMENITY_OSM_SELECTORS bên Python. */
  var AMENITY_NAMES = [
    "school",
    "kindergarten",
    "park",
    "hospital",
    "supermarket",
    "market",
    "cafe",
    "pharmacy",
    "gym",
    "boulevard",
  ];

  /* Bán kính mà bảng tra được dựng. Vượt quá thì không còn dữ liệu để trả lời. */
  var BUNDLE_RADIUS_M = 2000;

  /* amenity_name mà tool có thể đo được (dùng cho capability-aware reasoning). */
  function knownAmenities() {
    return new Set(AMENITY_NAMES);
  }

  /* Lấy toạ độ + id của BĐS (dataset đã có sẵn lat/lon). */
  function geocode(prop) {
    return {
      propertyId: prop.property_id,
      lat: prop.latitude,
      lon: prop.longitude,
    };
  }

  /* Tính {count trong radius_m, khoảng cách tới cái gần nhất} từ danh sách đã
   * sắp xếp. Giống summarize_elements: `count` lọc theo bán kính yêu cầu, còn
   * `nearest_distance_m` lấy min trên TOÀN BỘ danh sách. */
  function summarizeDistances(sortedDistances, radiusM) {
    if (!sortedDistances.length) {
      return { count: 0, nearest_distance_m: null };
    }
    var count = 0;
    for (var i = 0; i < sortedDistances.length; i++) {
      if (sortedDistances[i] <= radiusM) count++;
      else break; // đã sắp xếp tăng dần
    }
    return { count: count, nearest_distance_m: pyRound(sortedDistances[0], 0) };
  }

  /* Đếm tiện ích trong bán kính + khoảng cách tới cái gần nhất. */
  function searchAmenities(propertyId, amenityName, radiusM) {
    if (AMENITY_NAMES.indexOf(amenityName) === -1) {
      return { count: 0, nearest_distance_m: null };
    }

    var table = global.G8_AMENITIES;
    if (!table) {
      throw new Error(
        "Chưa nạp bảng tiện ích (data/amenities.js). Chạy: python3 -m src.data.build_static_bundle"
      );
    }

    var entry = table[propertyId];
    if (!entry || !Object.prototype.hasOwnProperty.call(entry, amenityName)) {
      // Không được trả về mảng rỗng: "thiếu dữ liệu" và "quanh đây không có tiện
      // ích nào" cho ra cùng con số 0 nhưng ý nghĩa ngược nhau.
      throw new Error(
        "Bảng tiện ích thiếu dữ liệu cho " + propertyId + "/" + amenityName +
          ". Chạy lại src.data.build_static_bundle."
      );
    }

    return summarizeDistances(entry[amenityName], radiusM);
  }

  G8.amenityTools = {
    AMENITY_NAMES: AMENITY_NAMES,
    BUNDLE_RADIUS_M: BUNDLE_RADIUS_M,
    knownAmenities: knownAmenities,
    geocode: geocode,
    summarizeDistances: summarizeDistances,
    searchAmenities: searchAmenities,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
