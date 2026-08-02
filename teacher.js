let currentUser = null;
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // tự dọn buổi học quá 6 tiếng

function genCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0,O,1,I)
  let code = '';
  for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

document.getElementById('logout-btn').addEventListener('click', () => {
  if (confirm('Bắt đầu lại sẽ đổi sang một tên khác trên trình duyệt này — bạn sẽ KHÔNG vào lại được các lớp/dữ liệu hiện tại của mình ở đây nữa. Vẫn tiếp tục?')) {
    auth.signOut();
  }
});

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

        let session = null;
        if (cls.activeSessionId) {
          session = await loadValidSession(doc.id, cls.activeSessionId);
        }

        const card = document.createElement('div');
        card.className = 'class-card';

        let sessionBlock;
        if (session) {
          const startStr = session.scheduledStart ? session.scheduledStart.toDate().toLocaleString('vi-VN') : '';
          const notStarted = session.scheduledStart && session.scheduledStart.toMillis() > Date.now();
          sessionBlock = `
            <div class="meta">${notStarted ? 'Đã lên lịch' : 'Đang mở'}: ${escapeHtml(startStr)}</div>
            <div class="actions">
              <button class="btn btn-amber btn-sm" onclick="enterSession('${doc.id}','${cls.activeSessionId}')">Vào buổi học</button>
              <button class="btn btn-ghost btn-sm" onclick="endSessionFromDashboard('${doc.id}','${cls.activeSessionId}')">Kết thúc buổi</button>
            </div>
          `;
        } else {
          sessionBlock = `
            <div class="actions" style="flex-wrap:wrap;">
              <input type="datetime-local" id="dt-${doc.id}" class="session-datetime">
              <button class="btn btn-amber btn-sm" onclick="openSessionFromInput('${doc.id}')">Mở buổi học</button>
            </div>
          `;
        }

        card.innerHTML = `
          <h3 class="chalk">${escapeHtml(cls.name)}</h3>
          <span class="code mono">Mã: ${cls.code}</span>
          <div class="meta">${membersSnap.size} học viên đã tham gia</div>
          ${sessionBlock}
          <div class="actions" style="margin-top:8px;">
            <button class="btn btn-ghost btn-sm" onclick="copyLink('${cls.code}')">Copy link mời</button>
          </div>
        `;
        grid.appendChild(card);
      }
    });
}

// Đọc thông tin buổi học đang mở của 1 lớp; nếu đã quá 6 tiếng thì tự dọn và trả về null
async function loadValidSession(classId, sessionId){
  const sessionRef = db.collection('classes').doc(classId).collection('sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    await db.collection('classes').doc(classId).update({ activeSessionId: firebase.firestore.FieldValue.delete() }).catch(() => {});
    return null;
  }
  const data = sessionDoc.data();
  const createdMs = data.createdAt ? data.createdAt.toMillis() : Date.now();
  if (Date.now() - createdMs > SESSION_MAX_AGE_MS) {
    await deleteSessionData(classId, sessionId);
    await db.collection('classes').doc(classId).update({ activeSessionId: firebase.firestore.FieldValue.delete() }).catch(() => {});
    return null;
  }
  return data;
}

async function openSessionFromInput(classId){
  const input = document.getElementById('dt-' + classId);
  const val = input && input.value; // 'YYYY-MM-DDTHH:mm' hoặc rỗng nếu để trống (nghĩa là bắt đầu ngay)
  const scheduledDate = val ? new Date(val) : new Date();
  const sessionRef = await db.collection('classes').doc(classId).collection('sessions').add({
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    scheduledStart: firebase.firestore.Timestamp.fromDate(scheduledDate),
    status: 'scheduled',
    teacherId: currentUser.uid
  });
  await db.collection('classes').doc(classId).update({ activeSessionId: sessionRef.id });
}

async function endSessionFromDashboard(classId, sessionId){
  if (!confirm('Kết thúc buổi học này? Toàn bộ bảng/chat/slide/dữ liệu của buổi sẽ bị xoá vĩnh viễn.')) return;
  await deleteSessionData(classId, sessionId);
  await db.collection('classes').doc(classId).update({ activeSessionId: firebase.firestore.FieldValue.delete() }).catch(() => {});
}

// Xoá toàn bộ dữ liệu của 1 buổi học (bảng, chat, nhóm, tín hiệu gọi, slide...)
async function deleteSessionData(classId, sessionId){
  const sessionRef = db.collection('classes').doc(classId).collection('sessions').doc(sessionId);

  async function wipeCollection(colRef){
    const snap = await colRef.get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  try {
    await wipeCollection(sessionRef.collection('calls'));

    const strokeDocs = await sessionRef.collection('strokes').get();
    for (const d of strokeDocs.docs) {
      if (d.id === '__deck__') await wipeCollection(d.ref.collection('pages'));
    }
    await wipeCollection(sessionRef.collection('strokes'));
    await wipeCollection(sessionRef.collection('chat'));

    const groupsSnap = await sessionRef.collection('groups').get();
    for (const g of groupsSnap.docs) {
      await wipeCollection(g.ref.collection('presence'));
      await wipeCollection(g.ref.collection('strokes'));
      await wipeCollection(g.ref.collection('chat'));
      await wipeCollection(g.ref.collection('calls'));
      await g.ref.delete();
    }

    await sessionRef.delete();
  } catch (e) {
    console.warn('Dọn dữ liệu buổi học chưa xong hết:', e);
  }
}

function enterSession(classId, sessionId){
  window.location.href = `classroom.html?classId=${classId}&sessionId=${sessionId}`;
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
