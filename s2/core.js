/* Port của src/solution2/core.py + tiện ích làm tròn tương thích Python.
 *
 * Bản JS phải cho ra CÙNG con số với bản Python trên mọi case validation, nếu
 * không thì web demo đang trình bày một hệ thống khác với hệ thống trong báo cáo.
 * Chỗ dễ lệch nhất không phải công thức mà là làm tròn: Python `round()` dùng
 * round-half-even (round(0.5) == 0, round(2.5) == 2) còn `Math.round` của JS
 * dùng round-half-up. Scoring gọi round() ở hàng chục vị trí nên phải thay bằng
 * pyRound ở TẤT CẢ các chỗ port.
 */
(function (global) {
  "use strict";

  var G8 = (global.G8 = global.G8 || {});

  // ── Làm tròn tương thích Python ──

  /* Tách một số thành phần nguyên đã làm tròn tới `digits` chữ số thập phân,
   * theo đúng luật round-half-even trên GIÁ TRỊ THẬT của double.
   *
   * `toFixed(100)` cho khai triển thập phân chính xác của double ở dải độ lớn
   * mà pipeline dùng (điểm số 0..10, khoảng cách 0..2000), nên quyết định
   * "có phải đúng nửa hay không" là chính xác chứ không phải phỏng đoán.
   */
  function splitRounded(value, digits) {
    var negative = value < 0 || Object.is(value, -0);
    var text = Math.abs(value).toFixed(100);
    var dot = text.indexOf(".");
    var fraction = text.slice(dot + 1);
    var kept = text.slice(0, dot) + fraction.slice(0, digits);
    var rest = fraction.slice(digits);

    var roundUp = false;
    var first = rest.charCodeAt(0) - 48;
    if (first > 5) {
      roundUp = true;
    } else if (first === 5) {
      if (/[1-9]/.test(rest.slice(1))) {
        roundUp = true; // lớn hơn nửa
      } else {
        // Đúng nửa: làm tròn về phía chữ số CHẴN, giống Python.
        var last = kept.charCodeAt(kept.length - 1) - 48;
        roundUp = last % 2 === 1;
      }
    }

    var scaled = BigInt(kept);
    if (roundUp) scaled += 1n;
    return { negative: negative, scaled: scaled };
  }

  /* Tương đương `round(value, digits)` của Python. */
  function pyRound(value, digits) {
    var d = digits === undefined ? 0 : digits | 0;
    if (!isFinite(value)) return value;
    var parts = splitRounded(value, d);
    // scaled và 10^d đều biểu diễn chính xác được ở dải này, nên phép chia IEEE
    // cho ra đúng double gần nhất với giá trị thập phân — giống Python.
    var result = Number(parts.scaled) / Math.pow(10, d);
    return parts.negative ? -result : result;
  }

  /* Tương đương f"{value:.<digits>f}" của Python.
   *
   * Không dùng toFixed vì toFixed làm tròn half-up ở một số giá trị, và cũng
   * không dùng pyRound rồi toFixed vì như vậy là làm tròn hai lần.
   */
  function pyFormat(value, digits) {
    var d = digits === undefined ? 0 : digits | 0;
    if (!isFinite(value)) return String(value);
    var parts = splitRounded(value, d);
    var text = parts.scaled.toString();
    if (d > 0) {
      while (text.length <= d) text = "0" + text;
      text = text.slice(0, text.length - d) + "." + text.slice(text.length - d);
    }
    // Python giữ dấu âm cả khi làm tròn về 0: format(-0.5, ".0f") == "-0".
    return (parts.negative ? "-" : "") + text;
  }

  // ── Port 1:1 từ core.py ──

  /* Khoảng cách (mét) giữa hai điểm lat/lon theo công thức Haversine. */
  function haversineM(lat1, lon1, lat2, lon2) {
    var R = 6371000; // bán kính Trái Đất (m)
    var toRad = Math.PI / 180;
    var phi1 = lat1 * toRad;
    var phi2 = lat2 * toRad;
    var dphi = (lat2 - lat1) * toRad;
    var dlambda = (lon2 - lon1) * toRad;
    var a =
      Math.sin(dphi / 2) * Math.sin(dphi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) * Math.sin(dlambda / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /* Chuẩn hóa min-max về [0, 1].
   *
   * direction = 'lower_better': giá trị càng nhỏ điểm càng cao.
   * direction = 'higher_better': giá trị càng lớn điểm càng cao.
   */
  function normalizeScore(value, vmin, vmax, direction) {
    if (vmax === vmin) return 0.0;
    if (direction === "lower_better") {
      return Math.max(0.0, Math.min(1.0, (vmax - value) / (vmax - vmin)));
    }
    if (direction === "higher_better") {
      return Math.max(0.0, Math.min(1.0, (value - vmin) / (vmax - vmin)));
    }
    return 0.0;
  }

  G8.core = {
    pyRound: pyRound,
    pyFormat: pyFormat,
    haversineM: haversineM,
    normalizeScore: normalizeScore,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
