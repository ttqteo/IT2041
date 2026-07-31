# IT2041 G8: Hệ hỗ trợ quyết định chọn bất động sản

Công cụ tư vấn và hỗ trợ quyết định chọn mua bất động sản, phục vụ phần thuyết
trình **Nhóm 8: Real Estate DSS**.

🔗 **Truy cập:** https://ttqteo.github.io/IT2041/ (tạo QR code từ link này để chèn vào slide)

## Nội dung

- **Tư vấn**: nhập nhu cầu, chạy, xem Top X kèm chip tiện ích, breakdown điểm
  form/nhu cầu, panel "hệ thống hiểu gì từ nhu cầu tự do", và giải thích.
- **Đánh giá 1 case**: Hard pass, Priority coverage, Precision@K, NDCG@K cho case
  đang chọn.
- **Chấm cả bộ**: chạy toàn bộ validation set, ra số trung bình + bảng từng case.
  Số của Solution 2 được tính tại chỗ, không lấy sẵn từ báo cáo.
- **Dataset**: bảng 100 BĐS sort/lọc được, cùng scatter plot phân bố vị trí.

Không cần `app.py`, Python, Docker, Postgres hay API key. Không có tài nguyên nào
tải từ Internet — không font CDN, không thư viện icon, không tile bản đồ — nên
chạy được cả khi máy không có mạng.

Repo này chỉ chứa bản web tĩnh. Mã nguồn Python, script build dữ liệu và test
parity nằm ở repo gốc `IT2041_G8_DecisionMaking`.

## Chạy

- **Online:** https://ttqteo.github.io/IT2041/ (GitHub Pages, branch `master`, thư mục gốc).
- **Cục bộ:** mở trực tiếp `index.html` bằng trình duyệt.
- **Qua HTTP** (chia sẻ trong mạng LAN): `python3 -m http.server 8000` rồi mở http://127.0.0.1:8000

Mỗi lần push lên nhánh đã bật Pages, trang sẽ tự cập nhật sau ~1 phút.

## Điều gì chạy thật, điều gì là kết quả đã lưu

| | Solution 2 | Solution 1 |
|---|---|---|
| Nguồn | **tính trực tiếp trong trình duyệt** | kết quả đã lưu từ `outputs/solution1_mapbox_results.json` |
| Sửa form | Top X tính lại ngay | không đổi |
| Phạm vi | mọi input người dùng nhập | 13 case `V1_001`..`V1_013` |

Solution 2 là rule-based nên port sang JavaScript chạy được hết. Solution 1 cần
LLM qua OpenRouter nên không có cách nào chạy trong trang tĩnh; nó hiển thị kết
quả đã chạy sẵn và **luôn dán nhãn** như vậy. Khi form khác input gốc của case,
card Solution 1 tự cảnh báo rằng kết quả không phản ánh thay đổi vừa làm.

## Hướng dẫn trong trang

Lần đầu mở, một tour 9 bước tự chạy: tô sáng từng vùng và giải thích vùng đó
dùng để làm gì, từ chọn solution tới chấm cả bộ case. Có nút **Bỏ qua**, điều
hướng bằng phím mũi tên, `Esc` để thoát.

Tour chỉ tự hiện một lần (ghi nhớ bằng `localStorage`); sau đó bấm nút **Hướng
dẫn** ở góc phải thanh tab để xem lại. Nếu trình duyệt chặn `localStorage` trên
`file://`, tour sẽ hiện lại mỗi lần mở, không gây lỗi gì.

## Dựng lại dữ liệu

Thư mục `data/` là dữ liệu sinh ra, không sửa tay. Chạy script bên repo gốc
`IT2041_G8_DecisionMaking` rồi copy kết quả sang đây:

```bash
python3 -m src.data.build_static_bundle
```

Script lấy POI từ Overpass bằng **một query bounding box cho mỗi loại tiện ích**
(10 query, vài phút) thay vì `around:2000` cho từng BĐS (1000 query, hơn 6 giờ),
rồi tính sẵn khoảng cách từ mỗi BĐS tới mọi POI trong 2 km. Kết quả bbox được
cache ở `data/overpass/bbox/` nên chạy lại là tức thì.

| file | nội dung |
|---|---|
| `data/properties.js` | 100 BĐS đã enrich |
| `data/amenities.js` | bảng khoảng cách tiện ích (100 BĐS × 10 loại) |
| `data/cases.js` | validation_cases_v1 (13) + validation_50_scenarios (50) |
| `data/s1_results.js` | kết quả Solution 1 dựng sẵn |
| `data/meta.js` | thông tin bundle (provider, bán kính, danh sách tiện ích) |

Dùng provider khác cho Solution 1:

```bash
STATIC_S1_PROVIDER=overpass python3 -m src.data.build_static_bundle
```

## Kiểm chứng

Bản JS phải cho ra **cùng kết quả** với bản Python, nếu không thì giảng viên đang
thao tác với một hệ thống khác với hệ thống trong báo cáo. Test chạy ở repo gốc
`IT2041_G8_DecisionMaking`:

```bash
python3 -m pytest tests/test_js_port_parity.py tests/test_js_eval_parity.py \
                  tests/test_static_bundle.py tests/test_web_static_smoke.py -q
```

| test | kiểm gì |
|---|---|
| `test_js_port_parity.py` | pipeline JS vs Python trên 13 case validation + biến thể free-text, form, Top X |
| `test_js_eval_parity.py` | phần đánh giá (P@K, NDCG, hard pass, rubric) JS vs `web/app.py` |
| `test_static_bundle.py` | bảng bbox khớp cache Overpass `around:2000` thật |
| `test_web_static_smoke.py` | chạy trang thật trong Chrome headless, bấm nút, kiểm DOM |

Smoke test mở tay được: mở `tools/smoke.html` bằng trình duyệt (cần
`--allow-file-access-from-files` nếu chạy từ `file://`).

## Giới hạn đã biết

- **Bán kính tra tiện ích tối đa 2 km.** Bảng precompute chỉ lưu POI trong 2 km,
  đúng bằng bán kính mà bản Python query. Nhu cầu kiểu "trong vòng 3km" vượt
  ngoài dữ liệu có sẵn.
- **20 cặp (BĐS, loại tiện ích) không có POI nào trong 2 km** — chủ yếu là mầm
  non và phòng gym ở vài vị trí Tân Bình. Với các cặp này, enrichment quy về
  `radius * 2` đúng như bản Python xử lý khi Overpass không trả về gì.
- **Dữ liệu OSM là ảnh chụp tại thời điểm build**, không cập nhật theo thời gian
  thực.
- **Solution 1 không chạy live** — xem bảng ở trên.
