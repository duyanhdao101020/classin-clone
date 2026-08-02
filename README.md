# LopHoc — Lớp học trực tuyến (mô phỏng ClassIn)

Web app cho phép:
- Giáo viên tạo tài khoản, tạo nhiều lớp học, mỗi lớp có 1 mã tham gia + link mời
- Học viên tạo tài khoản, nhập mã lớp để tham gia
- **Giao diện phòng học kiểu ClassIn**: bảng đen full màn hình, camera nổi nhỏ gọn góc trái (kéo đi đâu tuỳ ý), thanh công cụ dọc bên phải, chat/danh sách học viên trượt ra khi cần
- Trong phòng học: **cả giáo viên lẫn học viên** đều bật/tắt mic, camera riêng (2 chiều thật sự); giáo viên chia sẻ màn hình, có thể chọn kèm âm thanh máy tính hay không
- Bảng trắng dùng chung: **công cụ con trỏ** (chọn/di chuyển/resize ảnh, chữ, nét vẽ — tránh đè lên nhau), bút vẽ, chèn chữ, dán ảnh (Ctrl+V), tải ảnh lên, **trình chiếu PDF/PPT nhiều trang có nút Trước/Sau lật qua lại, đồng bộ cho cả lớp**, **cuộn được 5 trang** (xoá riêng từng trang hoặc xoá hết, tách biệt hoàn toàn với slide PDF/PPT đang mở) — giáo viên cấp quyền thao tác cho từng học viên
- 🎲 Xúc xắc & 🎡 Quay ngẫu nhiên tên học viên đang tham gia (chỉ giáo viên bấm được, cả lớp cùng thấy kết quả)
- 💬 Chat trực tiếp trong lớp
- ✋ Học viên giơ tay phát biểu — giáo viên thấy và có thể "hạ tay"
- ⭐ Giáo viên tặng sao thưởng cho học viên
- 🔇 Giáo viên tắt mic của cả lớp (hoặc từng người) bất cứ lúc nào
- ⏱️ Đồng hồ đếm thời gian buổi học
- 📅 **Buổi học riêng biệt cho từng lần dạy**: giáo viên "Mở buổi học" (chọn giờ bắt đầu hoặc để trống = bắt đầu ngay), mỗi buổi có bảng/chat/slide/nhóm hoàn toàn mới, tách biệt buổi trước. Học viên chỉ thấy nút "Vào lớp" đơn giản; vào sớm sẽ ở phòng chờ đếm ngược tới giờ. Rớt mạng/thoát nhầm thì vào lại y nguyên. Giáo viên rời phòng được hỏi "Kết thúc buổi" (xoá sạch dữ liệu buổi đó) hay "Chỉ rời" (buổi vẫn còn, vào lại sau được). Buổi học quá 6 tiếng tự động bị dọn.
- 🖱️ Kéo thả khung camera (của mình/học viên) tới bất kỳ vị trí nào trong tab Video
- 👥 Chia nhóm nhỏ: giáo viên tạo nhóm, xếp học viên vào nhóm; mỗi nhóm có **bảng trắng + chat + thoại riêng** — học viên cùng nhóm nghe/nói được với nhau; giáo viên có thể ghé nghe hoặc lên tiếng trao đổi trong bất kỳ nhóm nào, rồi rời ra xem tổng thể bất cứ lúc nào
- 🎚️ Cài đặt âm thanh: chọn thiết bị mic/loa, đo mức thu mic thời gian thực, nghe thử mic, kiểm tra loa, **chỉnh âm lượng mic lẫn loa**, bật/tắt khử tiếng ồn nền / tự động điều chỉnh âm lượng mic / chế độ nhạc
- **Ghi lại buổi học (chỉ giáo viên bấm được)** — ghi toàn bộ những gì hiển thị trên trang (bảng, mọi camera, cả nội dung đang chia sẻ màn hình nếu có), âm thanh trộn cả mic giáo viên lẫn mic mọi học viên. File **tải thẳng về máy đang bấm ghi** (thư mục Downloads mặc định của trình duyệt) — không lưu lên đâu khác, học viên không truy cập được.

Toàn bộ là **file tĩnh** (HTML/CSS/JS thuần, không cần build) + **Firebase** làm backend (miễn phí ở quy mô nhỏ).

---

## 1. Tạo Firebase project (làm 1 lần, khoảng 5 phút)

1. Vào https://console.firebase.google.com → **Add project** → đặt tên tuỳ ý → tạo xong.
2. Trong project, vào **Build → Authentication → Get started** → tab **Sign-in method** → bật **Anonymous** (không cần bật Email/Password — app này chỉ cần nhập tên, không cần mật khẩu).
3. Vào **Build → Firestore Database → Create database** → chọn **Start in test mode** (để chạy thử nhanh; xem mục 4 để siết bảo mật trước khi dùng thật).

> Không cần bật **Firebase Storage**. Google hiện yêu cầu nâng cấp lên gói trả phí (Blaze) mới dùng được Storage, nên bản này lưu ảnh/PDF trên bảng trắng bằng cách **nén nhỏ lại và nhúng thẳng vào Firestore** (xem mục 5) — không cần thẻ ngân hàng, không cần nâng cấp gói.
4. Vào **Project settings** (biểu tượng bánh răng) → kéo xuống **Your apps** → bấm icon Web `</>` → đặt tên app → **Register app**. Firebase sẽ hiện đoạn `firebaseConfig = {...}`.
5. Copy đoạn config đó, dán đè vào file `firebase-config.js` (thay các dòng `apiKey`, `authDomain`, `projectId`, ...).

## 2. Chạy thử trên máy

Mở file `index.html` trực tiếp bằng trình duyệt, hoặc chạy 1 server tĩnh đơn giản, ví dụ:

```bash
npx serve .
```

rồi mở địa chỉ hiện ra. **Lưu ý:** tính năng camera/màn hình yêu cầu HTTPS hoặc `localhost` — mở trực tiếp file `file://` đôi khi trình duyệt sẽ chặn quyền camera, nên ưu tiên chạy qua server cục bộ hoặc GitHub Pages.

## 3. Đưa lên GitHub Pages (link gửi cho học sinh)

> **Cách bạn (giáo viên) vào lớp:** trang vào lớp mặc định chỉ hiện ô nhập tên (học viên không thấy lựa chọn vai trò gì cả). Để hiện lựa chọn "Tôi là giáo viên", **bấm nhanh vào logo "Thiên Bình dạy tiếng Trung" ở góc trên trái 5 lần liên tiếp** (trong 2 giây) — lựa chọn vai trò sẽ hiện ra, lúc đó chọn "Tôi là giáo viên" rồi nhập tên như bình thường. Đây chỉ là cách ẩn đơn giản để học viên không vô tình bấm nhầm, không phải bảo mật thật sự — ai biết thao tác này đều bấm được.

1. Tạo 1 repo GitHub mới, push toàn bộ thư mục này lên.
2. Vào **Settings → Pages** của repo → chọn nhánh `main`, thư mục `/ (root)` → Save.
3. Sau ít phút, GitHub cho bạn 1 link dạng `https://ten-user.github.io/ten-repo/`. Đây là link bạn gửi cho học sinh.
4. Học sinh mở link → chọn vai trò **Học viên** → nhập tên → **Bắt đầu** → vào trang **Lớp của tôi** → nhập mã lớp bạn cung cấp (hoặc bạn có thể copy "link mời" đã kèm sẵn mã từ trang giáo viên).

## 4. Firestore Security Rules (nên làm trước khi dùng thật)

Ở chế độ "test mode", bất kỳ ai cũng đọc/ghi được dữ liệu — chỉ nên dùng để thử nghiệm. Trước khi dùng thật, vào **Firestore → Rules** và dán rule dưới đây (đã giới hạn theo người dùng đăng nhập, quyền giáo viên với lớp của mình, và quyền vẽ bảng trắng):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    match /classes/{classId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && resource.data.teacherId == request.auth.uid;

      match /members/{memberId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == memberId;
        allow update: if request.auth != null; // giáo viên cần cập nhật allowedToDraw của học viên
      }

      match /live/{doc=**} {
        allow read, write: if request.auth != null;
      }

      match /sessions/{doc=**} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

> Rule ở trên vẫn khá "mở" cho phần `sessions/**` (bảng trắng, chat, tín hiệu gọi của từng buổi học) để đơn giản hoá — phù hợp cho lớp nội bộ, không phù hợp cho ứng dụng công khai quy mô lớn. Mục `live/**` giữ lại phòng khi còn dữ liệu cũ từ trước khi có buổi học, không bắt buộc phải có nếu bạn mới tạo project.

## 5. Giới hạn cần biết (thành thật với bạn)

- **Video call là dạng "mesh"**: giáo viên kết nối trực tiếp tới từng học viên (WebRTC). Phù hợp lớp học vài chục người trở xuống. Với lớp rất đông (>50 học viên cùng lúc xem video), cần thêm 1 media server (SFU) như LiveKit/mediasoup — vượt phạm vi bản này.
- **Ghi hình chạy phía trình duyệt** (MediaRecorder), tải trực tiếp về máy người bấm ghi — chưa có kho lưu video trên cloud.
- **"Học viên thao tác trực tiếp"** ở bản này nghĩa là quyền vẽ/chú thích trên bảng trắng dùng chung, không phải điều khiển từ xa máy tính của giáo viên (remote desktop) — đó là một tính năng khác, phức tạp và nhạy cảm về bảo mật hơn nhiều.
- Cần trình duyệt hỗ trợ WebRTC (Chrome, Edge, Firefox mới); Safari cần thử thêm vì đôi khi có khác biệt nhỏ về API chia sẻ màn hình.
- Mic/camera của học viên và giáo viên xin quyền ngay khi vào phòng (kể cả khi đang tắt) để tránh phải "đàm phán lại" kết nối — nếu bạn từ chối cấp quyền lúc đó, cần tải lại trang sau khi bật quyền trong cài đặt trình duyệt.
- "Tắt mic tất cả" là tắt mềm (yêu cầu qua dữ liệu), học viên vẫn thấy trạng thái bị tắt và không tự bật lại được cho đến khi giáo viên mở lại — đây không phải chặn ở tầng hệ điều hành.
- **Trình chiếu chỉ đọc được file PDF, không đọc trực tiếp .pptx** — nếu có file PowerPoint, xuất ra PDF trước (PowerPoint: File → Export → Create PDF; Google Slides: File → Download → PDF), mất khoảng vài giây, rồi tải file PDF đó lên.
- File PDF nhiều trang (vài chục trang) sẽ mất khoảng vài giây tới nửa phút để xử lý xong (mỗi trang được nén rồi lưu riêng), có hiện chữ "Đang xử lý trang X/Y..." trong lúc chờ.
- Trình chiếu dùng chung theo "Cả lớp" hoặc theo từng nhóm nhỏ (nếu đang ở chế độ xem của nhóm nào thì trình chiếu thuộc về nhóm đó, tách biệt với các nhóm khác) — xem mục chia nhóm ở trên.
- **Ảnh/PDF trên bảng trắng không dùng Firebase Storage** (tránh phải nâng cấp gói trả phí) mà được nén và nhúng thẳng vào Firestore — ảnh sẽ tự động giảm kích thước/chất lượng cho vừa, nhưng ảnh quá to hoặc quá chi tiết (ảnh chụp màn hình full HD, PDF nhiều chữ nhỏ phóng to...) có thể bị từ chối kèm thông báo, khi đó thử ảnh nhỏ hơn hoặc chụp/crop lại phần cần thiết.
- **Việc tự xoá buổi học quá 6 tiếng không chạy nền thật sự** (vì không có server riêng) — nó chỉ được kiểm tra và dọn dẹp vào lúc có người (giáo viên hoặc học viên) mở lại trang lớp/vào buổi đó. Nếu không ai mở lại trang trong thời gian dài, buổi học cũ có thể vẫn còn nằm trong Firestore tới khi có người ghé qua kiểm tra — không tốn thêm chi phí đáng kể ở quy mô nhỏ, nhưng không phải dọn dẹp tức thời đúng giờ.
- **Chia nhóm nhỏ có thoại riêng giữa các học viên** (kết nối trực tiếp theo từng nhóm, không qua giáo viên) — với lớp tối đa 12 người và nhóm nhỏ vài người, mức tải này rất nhẹ. Video vẫn chỉ ở kênh chính (giáo viên ⟷ từng học viên); trong nhóm nhỏ chỉ có audio, không có video riêng, để giữ mọi thứ gọn nhẹ.
- **Ghi hình sẽ hiện hộp thoại chọn "chia sẻ màn hình" của trình duyệt** — giáo viên cần chọn đúng nguồn muốn ghi: chọn **"Tab này"** để ghi gọn trang lớp học, hoặc chọn **"Toàn bộ màn hình"** nếu muốn ghi luôn cả nội dung ở ứng dụng khác đang được chia sẻ ra ngoài lớp. Đây là cơ chế bảo mật của trình duyệt, không thể bỏ qua bước chọn này.
- **Trên điện thoại, khi đang cầm bút/chữ thì không cuộn bảng bằng 1 ngón tay được** (vì 1 ngón vừa dùng để vẽ vừa dùng để cuộn sẽ xung đột) — muốn cuộn bảng trên điện thoại, chuyển sang công cụ con trỏ (🖱️) rồi vuốt ở chỗ trống.
- Chọn thiết bị loa (setSinkId) chỉ hoạt động trên trình duyệt gốc Chromium (Chrome, Edge...) — Firefox và Safari chưa hỗ trợ, khi đó chỉ chỉnh được mic + âm lượng, việc chọn loa cụ thể cần đổi trong cài đặt hệ điều hành.
- Vị trí kéo thả của khung camera chỉ lưu cục bộ trên trình duyệt của từng người xem, không đồng bộ cho người khác.

## 6. So với ClassIn thật thì mượt cỡ nào?

Với lớp tối đa khoảng 12 người, bản này chạy trong đúng vùng thoải mái của kiến trúc hiện tại — không cần lo về giới hạn quy mô. Camera đã được giới hạn ở độ phân giải 640×360/24fps (đủ nét cho lớp học, nhẹ băng thông) để giáo viên nhận cùng lúc nhiều luồng hình học viên vẫn mượt. Vẫn có vài khác biệt thật sự so với ClassIn nên bạn nên biết:

- **Không có TURN server riêng, chỉ dùng TURN miễn phí công cộng (OpenRelay)** — giúp tăng tỷ lệ kết nối thành công qua mạng có tường lửa/NAT chặt (mạng trường học, mạng công ty, 4G), nhưng TURN miễn phí dùng chung có thể chậm vào giờ cao điểm. Muốn ổn định lâu dài, nên đăng ký TURN riêng (Metered.ca, Twilio, Xirsys — vài trăm nghìn/tháng) và thay vào `RTC_CONFIG` trong `classroom.js`.
- **Không có "adaptive bitrate"** (tự động giảm chất lượng khi mạng yếu) — mạng ai đó yếu có thể làm hình giật/đứng thay vì tự hạ chất lượng êm như app thương mại.
- **Bảng trắng đã tối ưu để chỉ vẽ thêm nét mới**, không vẽ lại toàn bộ mỗi lần — mượt kể cả sau buổi học dài.
- **Chat/bảng trắng đồng bộ qua Firestore**, độ trễ thường 100–300ms — đủ nhanh cho lớp học.
- Chưa có cơ chế tự kết nối lại khi rớt mạng giữa chừng — nếu rớt mạng, cần thoát vào lại phòng.

**Tóm lại:** với quy mô 12 người, đây là những điểm khác biệt nhỏ chứ không phải giới hạn nghiêm trọng — bạn có thể yên tâm dùng cho lớp thật.

## 7. Cấu trúc file

Toàn bộ file nằm phẳng trong 1 thư mục, **không có thư mục con** — để tránh lỗi rớt file khi kéo-thả lên GitHub:

```
index.html          Trang vào lớp (nhập tên + chọn vai trò)
teacher.html         Dashboard giáo viên (tạo lớp, mã lớp)
student.html         Dashboard học viên (tham gia lớp bằng mã)
classroom.html       Phòng học trực tiếp
style.css            Toàn bộ giao diện
firebase-config.js   Cấu hình Firebase (bạn cần điền)
auth.js              Vào lớp (đăng nhập ẩn danh bằng tên)
teacher.js           Logic dashboard giáo viên
student.js           Logic dashboard học viên
classroom.js         WebRTC + bảng trắng + ghi hình + quyền
```

Khi tải lên GitHub (mục 3), kéo **toàn bộ các file trên vào cùng lúc** — không có thư mục nào cần kéo riêng nữa.

