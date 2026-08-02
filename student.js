let currentUser = null;

document.getElementById('logout-btn').addEventListener('click', () => {
  if (confirm('Bắt đầu lại sẽ đổi sang một tên khác trên trình duyệt này — bạn sẽ KHÔNG vào lại được các lớp/dữ liệu hiện tại của mình ở đây nữa. Vẫn tiếp tục?')) {
    auth.signOut();
  }
});

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  const userDoc = await db.collection('users').doc(user.uid).get();
  const data = userDoc.data();
  if (!data || data.role !== 'student') { window.location.href = 'index.html'; return; }
  currentUser = { uid: user.uid, ...data };
  document.getElementById('who').textContent = data.name + ' (Học viên)';
  listenMyClasses();

  // nếu vào từ link mời có sẵn ?code=..., tự điền mã
  const params = new URLSearchParams(window.location.search);
  if (params.get('code')) {
    document.getElementById('join-code').value = params.get('code').toUpperCase();
  }
});

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('join-err');
  errBox.classList.remove('show');
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code) return;

  const snap = await db.collection('classes').where('code', '==', code).limit(1).get();
  if (snap.empty) {
    errBox.textContent = 'Không tìm thấy lớp với mã này. Kiểm tra lại mã lớp.';
    errBox.classList.add('show');
    return;
  }
  const classDoc = snap.docs[0];
  await db.collection('classes').doc(classDoc.id).collection('members').doc(currentUser.uid).set({
    name: currentUser.name,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    allowedToDraw: false
  });
  document.getElementById('join-code').value = '';
});

function listenMyClasses(){
  // Firestore không hỗ trợ collection-group where cho subcollection theo uid trực tiếp mà không có index,
  // nên ta duyệt qua toàn bộ lớp và kiểm tra membership (phù hợp cho quy mô nhỏ/vừa).
  db.collection('classes').onSnapshot(async (snap) => {
    const grid = document.getElementById('class-grid');
    const empty = document.getElementById('empty-state');
    grid.innerHTML = '';
    let count = 0;

    for (const doc of snap.docs) {
      const memberDoc = await db.collection('classes').doc(doc.id).collection('members').doc(currentUser.uid).get();
      if (!memberDoc.exists) continue;
      count++;
      const cls = doc.data();

      let session = null;
      if (cls.activeSessionId) {
        const sessionDoc = await doc.ref.collection('sessions').doc(cls.activeSessionId).get();
        if (sessionDoc.exists) {
          const data = sessionDoc.data();
          const createdMs = data.createdAt ? data.createdAt.toMillis() : Date.now();
          if (Date.now() - createdMs <= 6 * 60 * 60 * 1000) session = data; // quá 6 tiếng thì coi như chưa mở, để giáo viên tự dọn khi vào lại
        }
      }

      const card = document.createElement('div');
      card.className = 'class-card';
      const actionHtml = session
        ? `<button class="btn btn-amber btn-sm" onclick="enterSession('${doc.id}','${cls.activeSessionId}')">Vào lớp</button>`
        : `<button class="btn btn-ghost btn-sm" disabled>Giáo viên chưa mở buổi học</button>`;
      card.innerHTML = `
        <h3 class="chalk">${escapeHtml(cls.name)}</h3>
        <div class="meta">Giáo viên: ${escapeHtml(cls.teacherName || 'Không rõ')}</div>
        <div class="actions">${actionHtml}</div>
      `;
      grid.appendChild(card);
    }
    empty.style.display = count === 0 ? 'block' : 'none';
  });
}

function enterSession(classId, sessionId){
  window.location.href = `classroom.html?classId=${classId}&sessionId=${sessionId}`;
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
