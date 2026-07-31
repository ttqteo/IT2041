/* Harness chạy pipeline Solution 2 bản JS bằng Node, để test parity đối chiếu
 * với bản Python.
 *
 * Đọc từ stdin một mảng JSON:
 *   [{case_id, form, free_text, top_x}, ...]
 * In ra stdout mảng output contract tương ứng.
 *
 * Dùng:  node tools/run_case.js < requests.json
 */
"use strict";

var path = require("path");
var fs = require("fs");

var ROOT = path.resolve(__dirname, "..");

[
  "data/properties.js",
  "data/amenities.js",
  "s2/core.js",
  "s2/amenityTools.js",
  "s2/parser.js",
  "s2/scoring.js",
  "s2/enrichment.js",
  "s2/explanation.js",
  "s2/contract.js",
  "s2/pipeline.js",
].forEach(function (relative) {
  var full = path.join(ROOT, relative);
  if (!fs.existsSync(full)) {
    throw new Error(
      "Thiếu " + relative + ". Chạy: python3 -m src.data.build_static_bundle"
    );
  }
  require(full);
});

var input = fs.readFileSync(0, "utf-8");
var requests = JSON.parse(input);

var contracts = requests.map(function (request) {
  var topX = request.top_x || 5;
  var internal = globalThis.G8.pipeline.run(
    request.form,
    request.free_text || "",
    globalThis.G8_PROPERTIES,
    { topKBuffer: Math.max(10, topX), topK: topX }
  );
  var contract = globalThis.G8.contract.toContract(request.case_id, internal, 0);
  contract.top5 = contract.top5.slice(0, topX);
  return contract;
});

process.stdout.write(JSON.stringify(contracts));
