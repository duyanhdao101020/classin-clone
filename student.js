let currentUser = null;

function genCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0,O,1,I)
  let code = '';
  for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  const userDoc = await db.collection('users').doc(user.uid).get();
  const data = userDoc.data();
  if (!data || data.role !== 'teacher') { window.location.href = 'index.html'; return; }
  currentUser = { uid: user.uid, ...data };
  document.getElementById('who').textContent = data.name + ' (Giáo viên)';
  listenClasses();
});

document.getElementById('new-class-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('class-name').value.trim();
  if (!name) return;
  await db.collection('classes').add({
    name,
    teacherId: currentUser.uid,
    teacherName: currentUser.name,
    code: genCode(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  document.getElementById('class-name').value = '';
});

function listenClasses(){
  db.collection('classes').where('teacherId', '==', currentUser.uid)
    .onSnapshot(async (snap) => {
      const grid = document.getElementById('class-grid');
      const empty = document.getElementById('empty-state');
      grid.innerHTML = '';
      if (snap.empty) { empty.style.display = 'block'; return; }
      empty.style.display = 'none';

      for (const doc of snap.docs) {
        const cls = doc.data();
        const membersSnap = await db.collection('classes').doc(doc.id).collection('members').get();
        const card = document.createElement('div');
        card.className = 'class-card';
        card.innerHTML = `
          <h3 class="chalk">${escapeHtml(cls.name)}</h3>
          <span class="code mono">Mã: ${cls.code}</span>
          <div class="meta">${membersSnap.size} học viên đã tham gia</div>
          <div class="actions">
            <button class="btn btn-amber btn-sm" onclick="enterClass('${doc.id}')">Bắt đầu dạy</button>
            <button class="btn btn-ghost btn-sm" onclick="copyLink('${cls.code}')">Copy link mời</button>
          </div>
        `;
        grid.appendChild(card);
      }
    });
}

function enterClass(classId){
  window.location.href = `classroom.html?classId=${classId}`;
}

function copyLink(code){
  const url = `${window.location.origin}${window.location.pathname.replace('teacher.html','student.html')}?code=${code}`;
  navigator.clipboard.writeText(url).then(() => {
    alert('Đã copy link mời. Gửi link này cho học viên (họ vẫn cần tạo tài khoản để tham gia).\n\nMã lớp: ' + code);
  }).catch(() => {
    prompt('Copy link mời và gửi cho học viên:', url);
  });
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
