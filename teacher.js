// 1. Vào https://console.firebase.google.com -> Tạo project mới (miễn phí)
// 2. Vào Project settings -> General -> "Your apps" -> chọn biểu tượng Web (</>) -> đăng ký app
// 3. Firebase sẽ đưa cho bạn 1 đoạn config y hệt bên dưới -> copy đè vào đây
// 4. Vào Build > Authentication > Sign-in method -> bật "Email/Password"
// 5. Vào Build > Firestore Database -> Create database -> chọn chế độ "test mode" lúc mới bắt đầu
// (Không cần bật Firebase Storage — ảnh/PDF trên bảng trắng được nén và lưu trực tiếp trong Firestore)

const firebaseConfig = {
  apiKey: "AIzaSyCUkk1bQajrXioY-MMGVMbYO04iq_VxBKY",
  authDomain: "classin-clone.firebaseapp.com",
  projectId: "classin-clone",
  storageBucket: "classin-clone.firebasestorage.app",
  messagingSenderId: "190744533657",
  appId: "1:190744533657:web:8c6ede4a80607def7f7608"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
