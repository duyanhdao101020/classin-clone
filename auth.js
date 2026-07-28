let role = 'student';

const roleToggle = document.getElementById('role-toggle');
const submitBtn = document.getElementById('submit-btn');
const errBox = document.getElementById('err');

function showError(msg){
  errBox.textContent = msg;
  errBox.classList.add('show');
}
function clearError(){
  errBox.classList.remove('show');
  errBox.textContent = '';
}

roleToggle.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    role = btn.dataset.role;
    roleToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const name = document.getElementById('name').value.trim();
  if (!name) { showError('Vui lòng nhập tên.'); return; }

  submitBtn.disabled = true;
  try {
    const cred = await auth.signInAnonymously();
    await db.collection('users').doc(cred.user.uid).set({
      name, role, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    goToDashboard(role);
  } catch (err) {
    showError('Có lỗi xảy ra: ' + err.message);
    submitBtn.disabled = false;
  }
});

function goToDashboard(userRole){
  window.location.href = userRole === 'teacher' ? 'teacher.html' : 'student.html';
}

// Nếu trình duyệt này đã có sẵn danh tính từ trước (đăng nhập ẩn danh được Firebase tự nhớ),
// vào thẳng dashboard tương ứng, không bắt nhập lại tên.
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const userDoc = await db.collection('users').doc(user.uid).get();
    const data = userDoc.data();
    if (data) goToDashboard(data.role);
  }
});
