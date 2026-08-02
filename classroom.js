// ================= Cấu hình chung =================
// STUN giúp 2 máy tìm đường kết nối trực tiếp; TURN là "trạm trung chuyển" dự phòng khi
// mạng có tường lửa/NAT chặt (rất hay gặp ở mạng trường học, mạng công ty, 4G) không cho kết nối trực tiếp.
// Không có TURN, các trường hợp đó sẽ bị "không kết nối được" hoặc treo hình.
// Bên dưới dùng TURN miễn phí của Open Relay Project (openrelay.metered.ca) — đủ dùng để test/lớp nhỏ.
// Nếu dùng thật lâu dài, nên đăng ký TURN riêng (Metered.ca, Twilio, Xirsys...) để ổn định hơn — xem README.
const RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

const params = new URLSearchParams(window.location.search);
const classId = params.get('classId');
const sessionId = params.get('sessionId');

let currentUser = null;   // {uid, name, role}
let isTeacher = false;
let classRef, liveRef, callsRef, membersRef, strokesRef;
let sessionData = null;
let waitingTimer = null;

let localMediaStream = null;   // stream camera+mic của chính mình (tồn tại suốt phiên, bật/tắt qua track.enabled)
let screenStream = null;        // chỉ tồn tại khi giáo viên đang chia sẻ màn hình
let micOn = false;
let camOn = false;
let sharingScreen = false;

let teacherPCs = {};             // studentUid -> RTCPeerConnection (phía giáo viên)
let studentPC = null;            // RTCPeerConnection (phía học viên)

let mediaRecorder = null;
let recordedChunks = [];

let drawingAllowed = false;
let currentColor = '#F5F1E8';
let boardTool = 'pen';
let selection = null; // vật đang được chọn bằng công cụ con trỏ: { id, data, kind, dragging, resizing, ... }
let drawing = false;
let lastPoint = null;
let strokeBuffer = [];
let renderedStrokeIds = new Set();
let imageCache = {};

let activeDeck = null;     // {deckId, totalPages, currentPage, uid} — bài trình chiếu đang mở, dùng chung theo phạm vi bảng hiện tại
let deckPageCache = {};    // "deckId:trang" -> Image

let chatRef = null;
let handRaised = false;
let forcedMuted = false;
let sessionStartMs = Date.now();
let renderedChatIds = new Set();

let activeScope = 'main';          // 'main' hoặc groupId đang xem/tham gia
let breakoutActive = false;
let myGroupId = null;
let membersCache = [];
let groupsCache = [];
let unsubStrokes = null;
let unsubChat = null;

let tilePositions = {};            // id -> {x,y} (px) — vị trí kéo thả, chỉ áp dụng cục bộ cho người xem
let tileZCounter = 10;

let groupMeshPCs = {};              // otherUid -> RTCPeerConnection (thoại trong nhóm hiện đang tham gia)
let groupMeshAudioEls = {};         // otherUid -> thẻ <audio> phát tiếng người đó
let myGroupPresenceRef = null;
let currentGroupMeshId = null;      // groupId đang kết nối thoại (null = không ở trong thoại nhóm nào)
let unsubGroupPresence = null;

// ---- Cài đặt âm thanh ----
let allPlaybackEls = [];            // mọi thẻ audio/video đang phát tiếng người khác (để áp dụng loa/âm lượng)
let speakerVolume = 1;
let selectedSpeakerId = '';
let currentMicDeviceId = '';
let testStream = null;              // stream riêng để đo mức mic + nghe thử, tách biệt khỏi luồng đang phát trực tiếp
let audioCtxForMeter = null;
let meterAnalyser = null;
let meterRAF = null;

let currentOutgoingAudioTrack = null; // track mic thường, hoặc track đã trộn với âm thanh máy khi chia sẻ màn hình có kèm âm thanh
let screenShareMixCtx = null;
let recordingVideoStream = null;      // luồng camera riêng độ phân giải cao, chỉ dùng để ghi hình cho nét
let recordingMixCtx = null;           // AudioContext trộn âm thanh (mic giáo viên + mic mọi học viên) khi ghi hình

let micAudioCtx = null;
let micGainNode = null;
let micGainedTrack = null;  // track mic đã qua GainNode — đây mới là track thật sự được gửi đi mọi nơi
let micGainValue = 1;       // 0 - 2 (0% - 200%)

if (!classId || !sessionId) {
  alert('Thiếu thông tin buổi học trong đường dẫn. Vào lại từ trang lớp học của bạn.');
  window.location.href = 'index.html';
}

const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // tự dọn buổi học sau 6 tiếng kể từ lúc mở

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  const userDoc = await db.collection('users').doc(user.uid).get();
  const udata = userDoc.data();
  if (!udata) { window.location.href = 'index.html'; return; }
  currentUser = { uid: user.uid, ...udata };

  classRef = db.collection('classes').doc(classId);
  const classDoc = await classRef.get();
  if (!classDoc.exists) { alert('Không tìm thấy lớp học.'); window.location.href = 'index.html'; return; }
  const cls = classDoc.data();

  isTeacher = currentUser.role === 'teacher' && cls.teacherId === currentUser.uid;
  const backHref = isTeacher ? 'teacher.html' : 'student.html';

  liveRef = classRef.collection('sessions').doc(sessionId);
  const sessionSnap = await liveRef.get();
  if (!sessionSnap.exists) {
    alert('Buổi học này không tồn tại hoặc đã kết thúc.');
    window.location.href = backHref;
    return;
  }
  sessionData = sessionSnap.data();

  const createdMs = sessionData.createdAt ? sessionData.createdAt.toMillis() : Date.now();
  if (Date.now() - createdMs > SESSION_MAX_AGE_MS) {
    await deleteSessionData(classId, sessionId);
    if (isTeacher) await classRef.update({ activeSessionId: firebase.firestore.FieldValue.delete() }).catch(() => {});
    alert('Buổi học đã quá 6 tiếng nên hệ thống tự dọn dẹp. Mở buổi học mới nhé.');
    window.location.href = backHref;
    return;
  }

  document.getElementById('class-name').textContent = cls.name;
  document.getElementById('who').textContent = currentUser.name + (isTeacher ? ' (Giáo viên)' : '');

  const scheduledMs = sessionData.scheduledStart ? sessionData.scheduledStart.toMillis() : createdMs;
  sessionStartMs = scheduledMs;

  if (Date.now() < scheduledMs) {
    showWaitingRoom(scheduledMs);
  } else {
    await initClassroomFeatures();
  }
});

function showWaitingRoom(scheduledMs){
  document.getElementById('waiting-room').style.display = 'flex';
  document.getElementById('main-stage').style.display = 'none';
  document.getElementById('waiting-start-time').textContent = new Date(scheduledMs).toLocaleString('vi-VN');
  if (isTeacher) document.getElementById('waiting-start-now-btn').style.display = 'inline-block';

  function tick(){
    const diff = scheduledMs - Date.now();
    if (diff <= 0) {
      clearInterval(waitingTimer);
      enterFromWaitingRoom();
      return;
    }
    const totalSec = Math.floor(diff / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    document.getElementById('waiting-countdown').textContent = `${hh}:${mm}:${ss}`;
  }
  tick();
  waitingTimer = setInterval(tick, 1000);
}

async function forceStartNow(){
  if (!isTeacher) return;
  const now = firebase.firestore.Timestamp.now();
  await liveRef.set({ scheduledStart: now, status: 'active' }, { merge: true });
  sessionStartMs = now.toMillis();
  clearInterval(waitingTimer);
  enterFromWaitingRoom();
}

async function enterFromWaitingRoom(){
  await initClassroomFeatures();
}

async function initClassroomFeatures(){
  document.getElementById('waiting-room').style.display = 'none';
  document.getElementById('main-stage').style.display = 'block';

  callsRef = liveRef.collection('calls');
  membersRef = classRef.collection('members');
  strokesRef = liveRef.collection('strokes');
  chatRef = liveRef.collection('chat');

  if (isTeacher) {
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      document.getElementById('share-btn').style.display = 'flex';
    } // trên điện thoại (đặc biệt iPhone/Safari) trình duyệt không hỗ trợ chia sẻ màn hình -> ẩn nút luôn, đỡ bấm vào bị lỗi
    document.getElementById('muteall-btn').style.display = 'flex';
    document.getElementById('rec-btn').style.display = 'flex'; // chỉ giáo viên được ghi hình
    document.getElementById('group-panel').style.display = 'block';
    document.getElementById('fun-tools-divider').style.display = 'block';
    document.getElementById('dice-btn').style.display = 'flex';
    document.getElementById('random-btn').style.display = 'flex';
    await liveRef.set({ status: 'active' }, { merge: true });
  } else {
    document.getElementById('clear-board-btn').style.display = 'none';
    document.getElementById('clear-page-btn').style.display = 'none';
    document.getElementById('hand-btn').style.display = 'flex';
  }

  updateMicCamButtons();
  await ensureLocalMedia(); // xin quyền camera/mic ngay từ đầu để không cần đàm phán lại kết nối sau này

  setupBoard();
  listenStrokes();
  listenMembers();
  listenChat();
  listenGroups();
  listenLiveState();
  startSessionTimer();

  if (isTeacher) {
    listenForStudentCalls();
  } else {
    await joinAsStudent();
  }

  document.getElementById('room-info').textContent = isTeacher
    ? 'Bạn đang phát trực tiếp tới các học viên trong lớp.'
    : 'Đang kết nối tới giáo viên...';
}

function startSessionTimer(){
  setInterval(() => {
    const secs = Math.floor((Date.now() - sessionStartMs) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    document.getElementById('session-timer').textContent = `${mm}:${ss}`;
  }, 1000);
}

// ================= Panel trượt ra: Trò chuyện / Học viên =================
function togglePanel(name){
  const chatPanel = document.getElementById('chat-panel');
  const membersPanel = document.getElementById('members-panel');
  const chatBtn = document.getElementById('chat-toggle-btn');
  const membersBtn = document.getElementById('members-toggle-btn');

  if (name === 'chat') {
    const opening = !chatPanel.classList.contains('open');
    chatPanel.classList.toggle('open', opening);
    membersPanel.classList.remove('open');
    chatBtn.classList.toggle('active', opening);
    membersBtn.classList.remove('active');
    if (opening) scrollChatToBottom();
  } else {
    const opening = !membersPanel.classList.contains('open');
    membersPanel.classList.toggle('open', opening);
    chatPanel.classList.remove('open');
    membersBtn.classList.toggle('active', opening);
    chatBtn.classList.remove('active');
  }
}
function scrollChatToBottom(){
  const box = document.getElementById('chat-messages');
  box.scrollTop = box.scrollHeight;
}

function canDraw(){ return isTeacher || drawingAllowed; }

// ================= Video/audio tiles =================
function ensureTile(id, label, isSelf){
  let tile = document.getElementById('tile-' + id);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = 'tile-' + id;
    tile.innerHTML = `
      <video autoplay playsinline ${isSelf ? 'muted' : ''}></video>
      <div class="avatar-fallback"></div>
      <div class="label"><span class="mic-indicator">🔇</span><span class="name-text"></span></div>
      <div class="resize-handle" title="Kéo để phóng to/thu nhỏ"></div>
    `;
    document.getElementById('video-grid').appendChild(tile);
    placeTileDefault(tile, id);
    makeTileDraggable(tile);
    makeTileResizable(tile);
    if (!isSelf) registerPlaybackEl(tile.querySelector('video'));
  }
  tile.querySelector('.name-text').textContent = label;
  tile.querySelector('.avatar-fallback').textContent = (label || '?').trim().charAt(0).toUpperCase();
  return tile;
}

// mặc định xếp gọn ở góc trái trên, nhỏ như camera ClassIn, không che bảng
function placeTileDefault(tile, id){
  const grid = document.getElementById('video-grid');
  const containerWidth = grid.clientWidth || 300;
  const gap = 10;
  const tileWidth = Math.min(200, Math.max(130, containerWidth * 0.36));
  tile.style.width = tileWidth + 'px';
  const tileHeight = tileWidth * 9 / 16 + 26; // ước lượng thêm phần nhãn tên/mic

  const cols = Math.max(1, Math.floor((containerWidth - 20 + gap) / (tileWidth + gap)));
  const idx = Object.keys(tilePositions).length;
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const x = 14 + col * (tileWidth + gap);
  const y = 14 + row * (tileHeight + gap);
  tile.style.left = x + 'px';
  tile.style.top = y + 'px';
  tilePositions[id] = { x, y };
}

// cho phép kéo khung camera đi bất kỳ đâu trong bảng video (chỉ ảnh hưởng cách hiển thị của riêng mình)
function makeTileDraggable(tile){
  let dragging = false;
  let startX = 0, startY = 0, origLeft = 0, origTop = 0;

  function pointerDown(e){
    dragging = true;
    tile.style.zIndex = ++tileZCounter;
    const p = e.touches ? e.touches[0] : e;
    startX = p.clientX;
    startY = p.clientY;
    origLeft = parseFloat(tile.style.left) || 0;
    origTop = parseFloat(tile.style.top) || 0;
    e.preventDefault();
  }
  function pointerMove(e){
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const grid = document.getElementById('video-grid');
    const maxX = Math.max(0, grid.clientWidth - tile.offsetWidth);
    const maxY = Math.max(0, grid.clientHeight - tile.offsetHeight);
    const newLeft = Math.min(Math.max(0, origLeft + (p.clientX - startX)), maxX);
    const newTop = Math.min(Math.max(0, origTop + (p.clientY - startY)), maxY);
    tile.style.left = newLeft + 'px';
    tile.style.top = newTop + 'px';
  }
  function pointerUp(){
    if (!dragging) return;
    dragging = false;
    const id = tile.id.replace('tile-', '');
    tilePositions[id] = { x: parseFloat(tile.style.left) || 0, y: parseFloat(tile.style.top) || 0 };
  }

  tile.addEventListener('mousedown', pointerDown);
  window.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  tile.addEventListener('touchstart', pointerDown, { passive: false });
  window.addEventListener('touchmove', pointerMove, { passive: false });
  window.addEventListener('touchend', pointerUp);
}

// kéo góc dưới-phải để phóng to/thu nhỏ khung camera (không đồng bộ cho người khác, chỉ ảnh hưởng màn hình của mình)
function makeTileResizable(tile){
  const handle = tile.querySelector('.resize-handle');
  if (!handle) return;
  let resizing = false;
  let startX = 0, startWidth = 0;
  const MIN_W = 130, MAX_W = 520;

  function pointerDown(e){
    resizing = true;
    tile.style.zIndex = ++tileZCounter;
    const p = e.touches ? e.touches[0] : e;
    startX = p.clientX;
    startWidth = tile.offsetWidth;
    e.preventDefault();
    e.stopPropagation(); // đừng để trigger kéo-di-chuyển của tile cùng lúc
  }
  function pointerMove(e){
    if (!resizing) return;
    const p = e.touches ? e.touches[0] : e;
    const newWidth = Math.min(MAX_W, Math.max(MIN_W, startWidth + (p.clientX - startX)));
    tile.style.width = newWidth + 'px';
  }
  function pointerUp(){ resizing = false; }

  handle.addEventListener('mousedown', pointerDown);
  window.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  handle.addEventListener('touchstart', pointerDown, { passive: false });
  window.addEventListener('touchmove', pointerMove, { passive: false });
  window.addEventListener('touchend', pointerUp);
}

function removeTile(id){
  const tile = document.getElementById('tile-' + id);
  if (tile) tile.remove();
  delete tilePositions[id];
}
function updateTileTrackState(id){
  const tile = document.getElementById('tile-' + id);
  if (!tile) return;
  const stream = tile.querySelector('video').srcObject;
  if (!stream) return;
  const vTrack = stream.getVideoTracks()[0];
  const aTrack = stream.getAudioTracks()[0];
  tile.classList.toggle('cam-off', !vTrack || vTrack.muted);
  const micIcon = tile.querySelector('.mic-indicator');
  if (micIcon) micIcon.textContent = (aTrack && !aTrack.muted) ? '🎙️' : '🔇';
}

function renderSelfTile(){
  const tile = ensureTile('self', currentUser.name + ' (Bạn)', true);
  tile.querySelector('video').srcObject = localMediaStream;
  updateSelfTileVisual();
}
function updateSelfTileVisual(){
  const tile = document.getElementById('tile-self');
  if (!tile) return;
  tile.classList.toggle('cam-off', !camOn);
  const micIcon = tile.querySelector('.mic-indicator');
  if (micIcon) micIcon.textContent = micOn ? '🎙️' : '🔇';
}

// ================= Mic / Camera (dùng cho cả giáo viên & học viên) =================
// Giới hạn độ phân giải/khung hình vừa đủ nét cho lớp học (không cần Full HD) để nhẹ băng thông + CPU
// khi giáo viên phải nhận cùng lúc nhiều luồng hình học viên (lớp ~12 người vẫn mượt với mức này).
const CAM_CONSTRAINTS = {
  width: { ideal: 640 },
  height: { ideal: 360 },
  frameRate: { ideal: 24, max: 30 }
};
const MIC_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

async function ensureLocalMedia(){
  try {
    localMediaStream = await navigator.mediaDevices.getUserMedia({ video: CAM_CONSTRAINTS, audio: MIC_CONSTRAINTS });
    localMediaStream.getVideoTracks().forEach(t => t.enabled = false);
    const rawAudioTrack = localMediaStream.getAudioTracks()[0];
    if (rawAudioTrack) {
      rawAudioTrack.enabled = true; // track thô luôn bật — mute thật sự nằm ở track đã qua gain bên dưới
      currentMicDeviceId = rawAudioTrack.getSettings().deviceId || '';
      currentOutgoingAudioTrack = buildMicGainChain(rawAudioTrack);
    }
    renderSelfTile();
    return true;
  } catch (e) {
    console.warn('Không lấy được camera/micro:', e);
    return false;
  }
}

// Đưa mic đi qua 1 GainNode để có thể chỉnh âm lượng gửi đi (thanh trượt trong Cài đặt âm thanh),
// áp dụng cho MỌI nơi mic được gửi: cuộc gọi chính, thoại nhóm, trộn khi chia sẻ màn hình, ghi hình.
function buildMicGainChain(rawTrack){
  micAudioCtx = micAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const src = micAudioCtx.createMediaStreamSource(new MediaStream([rawTrack]));
  micGainNode = micAudioCtx.createGain();
  micGainNode.gain.value = micGainValue;
  const dest = micAudioCtx.createMediaStreamDestination();
  src.connect(micGainNode).connect(dest);
  micGainedTrack = dest.stream.getAudioTracks()[0];
  micGainedTrack.enabled = micOn;
  return micGainedTrack;
}

function onMicVolumeChange(value){
  micGainValue = value / 100;
  if (micGainNode) micGainNode.gain.value = micGainValue;
}

function toggleMic(){
  if (!localMediaStream || !micGainedTrack) { alert('Chưa có quyền truy cập micro. Hãy cấp quyền camera/micro cho trang này rồi tải lại trang.'); return; }
  if (forcedMuted) { alert('Giáo viên đã tắt mic của cả lớp. Vui lòng đợi giáo viên mở lại.'); return; }
  micOn = !micOn;
  micGainedTrack.enabled = micOn;
  updateMicCamButtons();
  updateSelfTileVisual();
}

function toggleCam(){
  if (!localMediaStream) { alert('Chưa có quyền truy cập camera. Hãy cấp quyền camera/micro cho trang này rồi tải lại trang.'); return; }
  if (sharingScreen) { alert('Bạn đang chia sẻ màn hình — dừng chia sẻ để bật lại camera.'); return; }
  camOn = !camOn;
  const t = localMediaStream.getVideoTracks()[0];
  if (t) t.enabled = camOn;
  updateMicCamButtons();
  updateSelfTileVisual();
}

function updateMicCamButtons(){
  const micBtn = document.getElementById('mic-btn');
  const camBtn = document.getElementById('cam-btn');
  micBtn.textContent = micOn ? '🎤' : '🔇';
  micBtn.classList.toggle('on', micOn);
  micBtn.title = micOn ? 'Tắt mic' : 'Bật mic';
  camBtn.textContent = '🎥';
  camBtn.classList.toggle('on', camOn);
  camBtn.title = camOn ? 'Tắt camera' : 'Bật camera';
}

// gắn track hiện tại (mic + camera, hoặc mic + màn hình nếu đang chia sẻ) vào 1 peer connection mới
function addLocalTracksToPC(pc){
  if (!localMediaStream) return;
  const audioTrack = currentOutgoingAudioTrack || localMediaStream.getAudioTracks()[0];
  const videoTrack = (sharingScreen && screenStream) ? screenStream.getVideoTracks()[0] : localMediaStream.getVideoTracks()[0];
  if (audioTrack) pc.addTrack(audioTrack, localMediaStream);
  if (videoTrack) pc.addTrack(videoTrack, sharingScreen ? screenStream : localMediaStream);
}

// ================= Cài đặt âm thanh (chọn mic/loa, đo mức, khử ồn...) =================
function registerPlaybackEl(el){
  allPlaybackEls.push(el);
  el.volume = speakerVolume;
  if (selectedSpeakerId && el.setSinkId) el.setSinkId(selectedSpeakerId).catch(() => {});
}

function getMicProcessingConstraints(){
  const musicMode = document.getElementById('music-mode-toggle').checked;
  if (musicMode) return { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  return {
    echoCancellation: true,
    noiseSuppression: document.getElementById('noise-suppress-toggle').checked,
    autoGainControl: document.getElementById('autogain-toggle').checked
  };
}

function applyMicConstraints(){
  const constraints = getMicProcessingConstraints();
  const liveTrack = localMediaStream && localMediaStream.getAudioTracks()[0];
  if (liveTrack) liveTrack.applyConstraints(constraints).catch(e => console.warn('Không áp dụng được cấu hình mic:', e));
  const testTrack = testStream && testStream.getAudioTracks()[0];
  if (testTrack) testTrack.applyConstraints(constraints).catch(() => {});
}

function onMusicModeToggle(){
  const musicMode = document.getElementById('music-mode-toggle').checked;
  document.getElementById('noise-suppress-toggle').disabled = musicMode;
  document.getElementById('autogain-toggle').disabled = musicMode;
  applyMicConstraints();
}

// đổi track mic đang phát trực tiếp (kênh chính + mọi kết nối thoại nhóm), không cần đàm phán lại kết nối
function replaceLiveAudioTrack(newRawTrack){
  newRawTrack.enabled = true; // track thô luôn bật — mute/âm lượng thật sự nằm ở track đã qua gain
  const oldTrack = localMediaStream.getAudioTracks()[0];
  if (oldTrack) { localMediaStream.removeTrack(oldTrack); oldTrack.stop(); }
  localMediaStream.addTrack(newRawTrack);

  const gainedTrack = buildMicGainChain(newRawTrack);
  if (!screenShareMixCtx) currentOutgoingAudioTrack = gainedTrack; // nếu đang trộn âm thanh màn hình thì giữ nguyên track đã trộn

  const allPCs = [
    ...Object.values(teacherPCs),
    ...(studentPC ? [studentPC] : []),
    ...Object.values(groupMeshPCs)
  ];
  allPCs.forEach(pc => {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
    if (sender) sender.replaceTrack(currentOutgoingAudioTrack || gainedTrack);
  });
}

async function switchMicDevice(deviceId){
  try {
    const constraints = { audio: Object.assign({ deviceId: { exact: deviceId } }, getMicProcessingConstraints()) };
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    replaceLiveAudioTrack(newStream.getAudioTracks()[0]);
    currentMicDeviceId = deviceId;
  } catch (e) {
    alert('Không thể chuyển sang micro này: ' + e.message);
  }
}

function applySinkToAll(deviceId){
  allPlaybackEls.forEach(el => { if (el.setSinkId) el.setSinkId(deviceId).catch(() => {}); });
}
function onSpeakerVolumeChange(value){
  speakerVolume = value / 100;
  allPlaybackEls.forEach(el => { el.volume = speakerVolume; });
}

async function populateDeviceLists(){
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const micSelect = document.getElementById('mic-device-select');
    const spkSelect = document.getElementById('speaker-device-select');

    micSelect.innerHTML = '';
    devices.filter(d => d.kind === 'audioinput').forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${i + 1}`;
      if (d.deviceId === currentMicDeviceId) opt.selected = true;
      micSelect.appendChild(opt);
    });
    micSelect.onchange = () => { switchMicDevice(micSelect.value); restartTestStream(micSelect.value); };

    const canPickSpeaker = typeof HTMLMediaElement !== 'undefined' && !!HTMLMediaElement.prototype.setSinkId;
    if (!canPickSpeaker) {
      spkSelect.innerHTML = '<option>Trình duyệt này không hỗ trợ chọn loa</option>';
      spkSelect.disabled = true;
    } else {
      spkSelect.disabled = false;
      spkSelect.innerHTML = '';
      devices.filter(d => d.kind === 'audiooutput').forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Loa ${i + 1}`;
        if (d.deviceId === selectedSpeakerId) opt.selected = true;
        spkSelect.appendChild(opt);
      });
      spkSelect.onchange = () => { selectedSpeakerId = spkSelect.value; applySinkToAll(selectedSpeakerId); };
    }
  } catch (e) {
    console.warn('Không liệt kê được thiết bị âm thanh:', e);
  }
}

async function startTestStream(deviceId){
  stopTestStream();
  try {
    const constraints = { audio: Object.assign(deviceId ? { deviceId: { exact: deviceId } } : {}, getMicProcessingConstraints()) };
    testStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    console.warn('Không mở được luồng thử mic:', e);
  }
}
function stopTestStream(){
  if (testStream) { testStream.getTracks().forEach(t => t.stop()); testStream = null; }
}
async function restartTestStream(deviceId){
  await startTestStream(deviceId);
  startMicMeter();
}

function ensureMeterBars(){
  const meter = document.getElementById('mic-meter');
  if (meter.children.length) return;
  for (let i = 0; i < 28; i++) {
    const b = document.createElement('span');
    b.className = 'meter-bar';
    meter.appendChild(b);
  }
}

function startMicMeter(){
  stopMicMeter();
  if (!testStream) return;
  audioCtxForMeter = audioCtxForMeter || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtxForMeter.state === 'suspended') audioCtxForMeter.resume();
  const src = audioCtxForMeter.createMediaStreamSource(testStream);
  meterAnalyser = audioCtxForMeter.createAnalyser();
  meterAnalyser.fftSize = 512;
  src.connect(meterAnalyser);
  const data = new Uint8Array(meterAnalyser.frequencyBinCount);
  const bars = document.querySelectorAll('#mic-meter .meter-bar');

  function tick(){
    meterAnalyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const level = Math.min(1, avg / 90);
    const activeCount = Math.round(level * bars.length);
    bars.forEach((b, i) => b.classList.toggle('active', i < activeCount));
    meterRAF = requestAnimationFrame(tick);
  }
  tick();
}
function stopMicMeter(){
  if (meterRAF) cancelAnimationFrame(meterRAF);
  meterRAF = null;
  document.querySelectorAll('#mic-meter .meter-bar').forEach(b => b.classList.remove('active'));
}

function testMic(){
  if (!testStream) { alert('Chưa có luồng mic để nghe thử.'); return; }
  const btn = document.getElementById('test-mic-btn');
  const audioEl = document.createElement('audio');
  audioEl.srcObject = testStream;
  audioEl.volume = speakerVolume;
  if (selectedSpeakerId && audioEl.setSinkId) audioEl.setSinkId(selectedSpeakerId).catch(() => {});
  document.body.appendChild(audioEl);
  audioEl.play().catch(() => {});
  btn.disabled = true;
  btn.textContent = 'Đang phát (nên dùng tai nghe để tránh vọng âm)...';
  setTimeout(() => {
    audioEl.pause();
    audioEl.remove();
    btn.disabled = false;
    btn.textContent = '🔊 Nghe thử mic của bạn';
  }, 4000);
}

function testSpeaker(){
  const ctx = audioCtxForMeter || new (window.AudioContext || window.webkitAudioContext)();
  audioCtxForMeter = ctx;
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  osc.frequency.value = 440;
  const gain = ctx.createGain();
  gain.gain.value = 0.15;
  const dest = ctx.createMediaStreamDestination();
  osc.connect(gain).connect(dest);
  const audioEl = document.createElement('audio');
  audioEl.srcObject = dest.stream;
  audioEl.volume = speakerVolume;
  if (selectedSpeakerId && audioEl.setSinkId) audioEl.setSinkId(selectedSpeakerId).catch(() => {});
  document.body.appendChild(audioEl);
  audioEl.play().catch(() => {});
  osc.start();
  setTimeout(() => { osc.stop(); audioEl.remove(); }, 700);
}

async function openSettingsModal(){
  document.getElementById('settings-modal').style.display = 'flex';
  ensureMeterBars();
  await populateDeviceLists();
  await startTestStream(currentMicDeviceId);
  startMicMeter();
}
function closeSettingsModal(){
  document.getElementById('settings-modal').style.display = 'none';
  stopMicMeter();
  stopTestStream();
}
document.getElementById('settings-modal').addEventListener('click', (e) => {
  if (e.target.id === 'settings-modal') closeSettingsModal();
});

// ================= Chia sẻ màn hình (chỉ giáo viên) — thay track video hiện có, không cần đàm phán lại =================
function mixTracksToOne(tracks){
  screenShareMixCtx = screenShareMixCtx || new (window.AudioContext || window.webkitAudioContext)();
  const dest = screenShareMixCtx.createMediaStreamDestination();
  tracks.filter(Boolean).forEach(t => {
    try { screenShareMixCtx.createMediaStreamSource(new MediaStream([t])).connect(dest); } catch (e) {}
  });
  return dest.stream.getAudioTracks()[0];
}

async function toggleScreenShare(){
  if (sharingScreen) { stopScreenShare(); return; }
  const wantAudio = confirm(
    'Chia sẻ màn hình:\n\nCó muốn chia luôn ÂM THANH máy tính (nhạc, video đang phát...) không?\n\n' +
    'OK = Có, chia cả âm thanh máy tính (mic của bạn vẫn nghe song song)\nHuỷ = Không, chỉ chia hình ảnh'
  );
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: wantAudio });
    sharingScreen = true;
    const newVideoTrack = screenStream.getVideoTracks()[0];
    const screenAudioTrack = screenStream.getAudioTracks()[0]; // có thể không có, tuỳ trình duyệt/nguồn được chọn

    if (screenAudioTrack) {
      currentOutgoingAudioTrack = mixTracksToOne([micGainedTrack, screenAudioTrack]);
    }

    for (const uid in teacherPCs) {
      const videoSender = teacherPCs[uid].getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender) await videoSender.replaceTrack(newVideoTrack);
      else teacherPCs[uid].addTrack(newVideoTrack, screenStream);

      if (screenAudioTrack) {
        const audioSender = teacherPCs[uid].getSenders().find(s => s.track && s.track.kind === 'audio');
        if (audioSender) await audioSender.replaceTrack(currentOutgoingAudioTrack);
      }
    }
    newVideoTrack.onended = () => stopScreenShare(); // người dùng bấm nút "Dừng chia sẻ" của trình duyệt
    document.getElementById('share-btn').classList.add('on');
  } catch (e) {
    // người dùng huỷ hộp thoại chọn màn hình -> bỏ qua
  }
}

async function stopScreenShare(){
  if (!sharingScreen) return;
  sharingScreen = false;
  const cameraTrack = localMediaStream ? localMediaStream.getVideoTracks()[0] : null;
  const micTrack = micGainedTrack;
  currentOutgoingAudioTrack = micTrack;

  for (const uid in teacherPCs) {
    const videoSender = teacherPCs[uid].getSenders().find(s => s.track && s.track.kind === 'video');
    if (videoSender && cameraTrack) await videoSender.replaceTrack(cameraTrack);
    const audioSender = teacherPCs[uid].getSenders().find(s => s.track && s.track.kind === 'audio');
    if (audioSender && micTrack) await audioSender.replaceTrack(micTrack);
  }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  if (screenShareMixCtx) { try { screenShareMixCtx.close(); } catch (e) {} screenShareMixCtx = null; }
  document.getElementById('share-btn').classList.remove('on');
}

// ================= GIÁO VIÊN: lắng nghe học viên vào phòng, tạo offer =================
function listenForStudentCalls(){
  callsRef.onSnapshot((snap) => {
    snap.docChanges().forEach(async (change) => {
      const studentUid = change.doc.id;
      const data = change.doc.data();

      if (change.type === 'removed') {
        if (teacherPCs[studentUid]) { teacherPCs[studentUid].close(); delete teacherPCs[studentUid]; }
        removeTile(studentUid);
        return;
      }
      if (data.status === 'waiting' && !teacherPCs[studentUid]) {
        await createOfferForStudent(studentUid, data.name);
      }
      if (data.answer && teacherPCs[studentUid] && !teacherPCs[studentUid].currentRemoteDescription) {
        await teacherPCs[studentUid].setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });
  });
}

async function createOfferForStudent(studentUid, studentName){
  const pc = new RTCPeerConnection(RTC_CONFIG);
  teacherPCs[studentUid] = pc;
  const callDoc = callsRef.doc(studentUid);
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  addLocalTracksToPC(pc);

  const remoteStream = new MediaStream();
  const tile = ensureTile(studentUid, studentName || 'Học viên', false);
  tile.querySelector('video').srcObject = remoteStream;

  pc.ontrack = (event) => {
    event.track.onmute = () => updateTileTrackState(studentUid);
    event.track.onunmute = () => updateTileTrackState(studentUid);
    event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    updateTileTrackState(studentUid);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) offerCandidates.add(event.candidate.toJSON());
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);
  await callDoc.update({
    offer: { type: offerDescription.type, sdp: offerDescription.sdp },
    status: 'offered'
  });

  answerCandidates.onSnapshot((snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
    });
  });
}

// ================= HỌC VIÊN: tham gia, chờ offer, trả lời =================
async function joinAsStudent(){
  studentPC = new RTCPeerConnection(RTC_CONFIG);
  const callDoc = callsRef.doc(currentUser.uid);
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  addLocalTracksToPC(studentPC);

  const remoteStream = new MediaStream();
  const tile = ensureTile('teacher', 'Giáo viên', false);
  tile.querySelector('video').srcObject = remoteStream;

  studentPC.ontrack = (event) => {
    event.track.onmute = () => updateTileTrackState('teacher');
    event.track.onunmute = () => updateTileTrackState('teacher');
    event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    updateTileTrackState('teacher');
  };

  studentPC.onicecandidate = (event) => {
    if (event.candidate) answerCandidates.add(event.candidate.toJSON());
  };

  await callDoc.set({ status: 'waiting', name: currentUser.name, joinedAt: firebase.firestore.FieldValue.serverTimestamp() });

  callDoc.onSnapshot(async (snap) => {
    const data = snap.data();
    if (!data) return;
    if (data.offer && !studentPC.currentRemoteDescription) {
      await studentPC.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answerDescription = await studentPC.createAnswer();
      await studentPC.setLocalDescription(answerDescription);
      await callDoc.update({
        answer: { type: answerDescription.type, sdp: answerDescription.sdp },
        status: 'connected'
      });
      document.getElementById('student-status').textContent = 'Đã kết nối với giáo viên.';
    }
  });

  offerCandidates.onSnapshot((snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') studentPC.addIceCandidate(new RTCIceCandidate(change.doc.data()));
    });
  });
}

// ================= Rời phòng =================
async function leaveRoom(){
  if (isTeacher) {
    const choice = await askEndOrLeave();
    if (choice === 'cancel') return;
    await teardownMedia();
    if (choice === 'end') {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        await new Promise((resolve) => { mediaRecorder.addEventListener('stop', resolve, { once: true }); mediaRecorder.stop(); });
      }
      await deleteSessionData(classId, sessionId);
      await classRef.update({ activeSessionId: firebase.firestore.FieldValue.delete() }).catch(() => {});
    }
    window.location.href = 'teacher.html';
    return;
  }

  await teardownMedia();
  if (currentUser && callsRef) {
    try { await callsRef.doc(currentUser.uid).delete(); } catch (e) {}
  }
  window.location.href = 'student.html';
}

async function teardownMedia(){
  if (localMediaStream) localMediaStream.getTracks().forEach(t => t.stop());
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  if (screenShareMixCtx) { try { screenShareMixCtx.close(); } catch (e) {} }
  if (micAudioCtx) { try { micAudioCtx.close(); } catch (e) {} }
  stopTestStream();
  stopMicMeter();
  if (studentPC) studentPC.close();
  for (const uid in teacherPCs) teacherPCs[uid].close();
  await leaveGroupAudioMesh();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  cleanupRecordingStream();
}

window.addEventListener('beforeunload', () => {
  if (!isTeacher && currentUser && callsRef) callsRef.doc(currentUser.uid).delete().catch(() => {});
  if (myGroupPresenceRef) myGroupPresenceRef.delete().catch(() => {});
});

// Hộp thoại nhỏ: giáo viên chọn "Kết thúc buổi học" (xoá sạch dữ liệu buổi) / "Chỉ rời" (buổi vẫn còn) / "Huỷ"
function askEndOrLeave(){
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:380px;">
        <div class="modal-header"><h3 class="chalk">Rời phòng học</h3></div>
        <p class="sub" style="margin:4px 0 18px;">Bạn muốn kết thúc buổi học luôn (xoá toàn bộ bảng/chat/dữ liệu buổi này), hay chỉ rời và giữ buổi học để vào lại sau?</p>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <button class="btn btn-danger" id="end-choice-btn" style="width:100%;">Kết thúc buổi học (xoá dữ liệu)</button>
          <button class="btn btn-amber" id="leave-choice-btn" style="width:100%;">Chỉ rời (giữ buổi học)</button>
          <button class="btn btn-ghost" id="cancel-choice-btn" style="width:100%;">Huỷ, ở lại phòng</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#end-choice-btn').onclick = () => cleanup('end');
    overlay.querySelector('#leave-choice-btn').onclick = () => cleanup('leave');
    overlay.querySelector('#cancel-choice-btn').onclick = () => cleanup('cancel');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup('cancel'); });
  });
}

// Xoá toàn bộ dữ liệu của 1 buổi học (bảng, chat, nhóm, tín hiệu gọi, slide...) — dùng khi kết thúc buổi hoặc buổi quá hạn 6 tiếng
async function deleteSessionData(cId, sId){
  const sessionRef = db.collection('classes').doc(cId).collection('sessions').doc(sId);

  async function wipeCollection(colRef){
    const snap = await colRef.get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return snap.docs;
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

// ================= Ghi hình (MediaRecorder, tải về máy) =================
// ================= Ghi hình (chỉ giáo viên) — video riêng độ phân giải cao + âm thanh trộn cả lớp =================
function pickRecorderMimeType(){
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function getRecordingStream(){
  // Ghi lại TOÀN BỘ những gì hiển thị (bảng, mọi camera, kể cả nội dung đang chia sẻ màn hình nếu có) —
  // dùng đúng cơ chế "ghi màn hình" của trình duyệt thay vì chỉ ghi riêng camera.
  let videoTrack = null;
  try {
    recordingVideoStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: false,
      preferCurrentTab: true,     // gợi ý Chrome chọn sẵn "Tab này" cho tiện — trình duyệt không hỗ trợ sẽ tự bỏ qua
      selfBrowserSurface: 'include'
    });
    videoTrack = recordingVideoStream.getVideoTracks()[0];
    videoTrack.onended = () => { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); };
  } catch (e) {
    return null; // người dùng huỷ hộp thoại chọn màn hình để ghi
  }

  // Âm thanh: trộn mic của giáo viên + âm thanh của TẤT CẢ học viên đang kết nối (không chỉ riêng giáo viên)
  recordingMixCtx = recordingMixCtx || new (window.AudioContext || window.webkitAudioContext)();
  const dest = recordingMixCtx.createMediaStreamDestination();
  const micTrack = micGainedTrack;
  if (micTrack) {
    try { recordingMixCtx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest); } catch (e) {}
  }
  Object.values(teacherPCs).forEach(pc => {
    pc.getReceivers().forEach(r => {
      if (r.track && r.track.kind === 'audio') {
        try { recordingMixCtx.createMediaStreamSource(new MediaStream([r.track])).connect(dest); } catch (e) {}
      }
    });
  });

  const tracks = [];
  if (videoTrack) tracks.push(videoTrack);
  dest.stream.getAudioTracks().forEach(t => tracks.push(t));
  return tracks.length ? new MediaStream(tracks) : null;
}

function cleanupRecordingStream(){
  if (recordingVideoStream) { recordingVideoStream.getTracks().forEach(t => t.stop()); recordingVideoStream = null; }
  if (recordingMixCtx) { try { recordingMixCtx.close(); } catch (e) {} recordingMixCtx = null; }
}

async function toggleRecording(){
  if (!isTeacher) return; // chỉ giáo viên được ghi hình
  const recBtn = document.getElementById('rec-btn');
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop(); // phần dọn dẹp + tải file thực hiện trong onstop
    return;
  }

  recBtn.disabled = true;
  const streamToRecord = await getRecordingStream();
  recBtn.disabled = false;
  if (!streamToRecord || streamToRecord.getTracks().length === 0) {
    cleanupRecordingStream();
    return; // người dùng huỷ hộp thoại chọn màn hình để ghi, không cần báo lỗi thêm
  }

  recordedChunks = [];
  const mimeType = pickRecorderMimeType();
  mediaRecorder = new MediaRecorder(streamToRecord, Object.assign(
    mimeType ? { mimeType } : {},
    { videoBitsPerSecond: 3000000 }
  ));
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buoihoc-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    cleanupRecordingStream();
    recBtn.classList.remove('recording');
    document.getElementById('rec-status').textContent = '';
  };
  mediaRecorder.start();
  recBtn.classList.add('recording');
  document.getElementById('rec-status').innerHTML = '<span class="rec-dot"></span>Đang ghi (toàn màn hình + âm thanh cả lớp)...';
}

// ================= Bảng trắng đồng bộ (Firestore) =================
function setBoardTool(tool){
  boardTool = tool;
  document.querySelectorAll('.tool-icon-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  if (tool !== 'select') { selection = null; if (window._redrawAll) window._redrawAll(); }
}

// ===== Công cụ con trỏ: dò trúng vật thể, tay cầm resize, khung highlight =====
function hitTestObjects(pos, canvas){
  const list = window._allObjects || [];
  for (let i = list.length - 1; i >= 0; i--) { // ưu tiên vật vẽ sau cùng (nằm trên) trước
    const { id, data } = list[i];
    if (data.type === 'image') {
      if (pos.x >= data.x && pos.x <= data.x + data.w && pos.y >= data.y && pos.y <= data.y + data.h) {
        return { id, data, kind: 'image' };
      }
    } else if (data.type === 'text') {
      const approxCharW = (data.fontSize || 22) * 0.55 / canvas.width;
      const approxH = (data.fontSize || 22) * 1.3 / canvas.height;
      const textW = (data.text || '').length * approxCharW;
      if (pos.x >= data.x - 0.005 && pos.x <= data.x + textW + 0.005 && pos.y >= data.y - 0.005 && pos.y <= data.y + approxH) {
        return { id, data, kind: 'text' };
      }
    } else if (data.points && data.points.length > 1) {
      const threshold = 0.012;
      for (let j = 1; j < data.points.length; j++) {
        if (distToSegment(pos, data.points[j - 1], data.points[j]) < threshold) {
          return { id, data, kind: 'stroke' };
        }
      }
    }
  }
  return null;
}
function distToSegment(p, a, b){
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}
function isOnResizeHandle(pos, data, canvas){
  const hx = data.x + data.w, hy = data.y + data.h;
  const rx = 14 / canvas.width, ry = 14 / canvas.height; // vùng bấm ~14px quy đổi ra toạ độ chuẩn hoá
  return Math.abs(pos.x - hx) < rx && Math.abs(pos.y - hy) < ry;
}
function drawSelectionOverlay(ctx, canvas){
  if (!selection || boardTool !== 'select') return;
  const d = selection.data;
  ctx.save();
  ctx.strokeStyle = '#E8B94A';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  if (d.type === 'image') {
    ctx.strokeRect(d.x * canvas.width, d.y * canvas.height, d.w * canvas.width, d.h * canvas.height);
    ctx.setLineDash([]);
    ctx.fillStyle = '#E8B94A';
    ctx.fillRect((d.x + d.w) * canvas.width - 6, (d.y + d.h) * canvas.height - 6, 12, 12);
  } else if (d.type === 'text') {
    const approxCharW = (d.fontSize || 22) * 0.55 / canvas.width;
    const approxH = (d.fontSize || 22) * 1.3 / canvas.height;
    const textW = (d.text || '').length * approxCharW;
    ctx.strokeRect(d.x * canvas.width - 4, d.y * canvas.height - 4, textW * canvas.width + 8, approxH * canvas.height + 8);
  } else if (d.points && d.points.length) {
    const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    ctx.strokeRect(minX * canvas.width - 6, minY * canvas.height - 6, (maxX - minX) * canvas.width + 12, (maxY - minY) * canvas.height + 12);
  }
  ctx.restore();
}

function updateBoardHint(){
  const hint = document.getElementById('board-hint');
  hint.style.display = canDraw() ? 'none' : 'block';
}

const PAGES_COUNT = 5;

function setupBoard(){
  const canvas = document.getElementById('board-canvas');
  const ctx = canvas.getContext('2d');
  const deckCanvas = document.getElementById('deck-canvas');
  const deckCtx = deckCanvas.getContext('2d');
  const scrollEl = document.getElementById('board-scroll');

  function resize(){
    const rect = scrollEl.getBoundingClientRect(); // kích thước 1 khung nhìn (1 "trang")
    canvas.width = rect.width;
    canvas.height = rect.height * PAGES_COUNT;
    deckCanvas.width = rect.width;
    deckCanvas.height = rect.height;
    redrawAll();
    redrawDeck();
  }
  window.addEventListener('resize', resize);
  resize();

  scrollEl.addEventListener('scroll', () => {
    const pageH = scrollEl.clientHeight;
    const page = Math.min(PAGES_COUNT, Math.round(scrollEl.scrollTop / pageH) + 1);
    document.getElementById('page-indicator').textContent = `Trang ${page}/${PAGES_COUNT}`;
  });

  document.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      currentColor = sw.dataset.color;
    });
  });

  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) / rect.width, y: (t.clientY - rect.top) / rect.height };
  }

  function start(e){
    if (!canDraw()) return;
    const pos = getPos(e);
    if (boardTool === 'select') {
      if (selection && selection.kind === 'image' && isOnResizeHandle(pos, selection.data, canvas)) {
        selection.resizing = true;
        selection.startPos = pos;
        selection.origW = selection.data.w;
        selection.origH = selection.data.h;
        return;
      }
      const hit = hitTestObjects(pos, canvas);
      selection = hit ? Object.assign(hit, {
        dragging: true,
        startPos: pos,
        origX: hit.data.x,
        origY: hit.data.y,
        origPoints: hit.data.points ? hit.data.points.map(p => ({ x: p.x, y: p.y })) : null
      }) : null;
      if (window._redrawAll) window._redrawAll();
      return;
    }
    if (boardTool === 'text') { openTextInput(pos); return; }
    drawing = true;
    lastPoint = pos;
    strokeBuffer = [lastPoint];
  }
  function move(e){
    const pos = getPos(e);
    if (boardTool === 'select' && selection) {
      if (selection.resizing) {
        const dx = pos.x - selection.startPos.x;
        selection.data.w = Math.max(0.03, selection.origW + dx);
        selection.data.h = Math.max(0.02, selection.origH + dx * (selection.origH / selection.origW));
        if (window._redrawAll) window._redrawAll();
        return;
      }
      if (selection.dragging) {
        const dx = pos.x - selection.startPos.x;
        const dy = pos.y - selection.startPos.y;
        if (selection.origPoints) {
          selection.data.points = selection.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
        } else {
          selection.data.x = selection.origX + dx;
          selection.data.y = selection.origY + dy;
        }
        if (window._redrawAll) window._redrawAll();
        return;
      }
    }
    if (!drawing || boardTool !== 'pen' || !canDraw()) return;
    drawLineNormalized(ctx, canvas, lastPoint, pos, currentColor);
    strokeBuffer.push(pos);
    lastPoint = pos;
  }
  function end(){
    if (boardTool === 'select' && selection && (selection.dragging || selection.resizing)) {
      const updates = selection.resizing
        ? { w: selection.data.w, h: selection.data.h }
        : selection.origPoints
          ? { points: selection.data.points }
          : { x: selection.data.x, y: selection.data.y };
      strokesRef.doc(selection.id).update(updates).catch(() => {});
      selection.dragging = false;
      selection.resizing = false;
      return;
    }
    if (!drawing) return;
    drawing = false;
    if (strokeBuffer.length > 1) {
      strokesRef.add({
        type: 'stroke',
        uid: currentUser.uid,
        color: currentColor,
        points: strokeBuffer,
        ts: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    strokeBuffer = [];
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', (e) => {
    // Bút/chữ: luôn vẽ bằng 1 ngón (không cuộn). Con trỏ: chỉ chặn cuộn khi thật sự chạm trúng 1 vật để kéo.
    if (boardTool === 'pen' || boardTool === 'text') { e.preventDefault(); start(e); return; }
    if (boardTool === 'select') {
      const pos = getPos(e);
      const willGrab = (selection && selection.kind === 'image' && isOnResizeHandle(pos, selection.data, canvas)) || hitTestObjects(pos, canvas);
      if (willGrab) e.preventDefault();
    }
    start(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (drawing || (selection && (selection.dragging || selection.resizing))) e.preventDefault();
    move(e);
  }, { passive: false });
  canvas.addEventListener('touchend', end);

  window.addEventListener('paste', (e) => {
    if (!canDraw()) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) uploadImageFileToBoard(file);
      }
    }
  });

  function openTextInput(pos){
    const rect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'board-text-input';
    input.placeholder = 'Nhập chữ, Enter để xác nhận';
    input.style.left = (rect.left - parentRect.left + pos.x * rect.width) + 'px';
    input.style.top = (rect.top - parentRect.top + pos.y * rect.height - 12) + 'px';
    input.style.color = currentColor;
    canvas.parentElement.appendChild(input);
    setTimeout(() => input.focus(), 0); // tránh tranh chấp focus ngay trong sự kiện mousedown

    function commit(){
      const text = input.value.trim();
      input.remove();
      if (text) {
        strokesRef.add({
          type: 'text',
          uid: currentUser.uid,
          color: currentColor,
          text,
          x: pos.x,
          y: pos.y,
          fontSize: 22,
          ts: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    input.addEventListener('keydown', (ke) => { if (ke.key === 'Enter') input.blur(); });
    input.addEventListener('blur', commit, { once: true });
  }

  window._allObjects = [];
  window._redrawAll = redrawAll;
  window._redrawDeck = redrawDeck;
  window._drawOne = (obj) => drawBoardObject(ctx, canvas, obj); // vẽ thêm 1 đối tượng mới, không cần vẽ lại toàn bộ
  function redrawAll(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPageDividers(ctx, canvas);
    (window._allObjects || []).forEach(entry => drawBoardObject(ctx, canvas, entry.data));
    drawSelectionOverlay(ctx, canvas);
  }
  function redrawDeck(){
    deckCtx.clearRect(0, 0, deckCanvas.width, deckCanvas.height);
    drawDeckLayer(deckCtx, deckCanvas); // trang slide đang trình chiếu — nằm ở lớp riêng, không cuộn theo bảng
  }

  updateBoardHint();
}

function drawPageDividers(ctx, canvas){
  const pageH = canvas.height / PAGES_COUNT;
  ctx.save();
  ctx.strokeStyle = 'rgba(232,185,74,.25)';
  ctx.setLineDash([10, 6]);
  ctx.lineWidth = 1;
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = 'rgba(245,241,232,.35)';
  for (let i = 1; i < PAGES_COUNT; i++) {
    const y = pageH * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let i = 0; i < PAGES_COUNT; i++) {
    ctx.fillText(`Trang ${i + 1}`, 10, pageH * i + 18);
  }
  ctx.restore();
}

function drawLineNormalized(ctx, canvas, p1, p2, color){
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
  ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
  ctx.stroke();
}
function drawStrokeNormalized(ctx, canvas, stroke){
  for (let i = 1; i < stroke.points.length; i++) {
    drawLineNormalized(ctx, canvas, stroke.points[i - 1], stroke.points[i], stroke.color);
  }
}
function drawBoardObject(ctx, canvas, obj){
  if (obj.type === 'text') {
    ctx.fillStyle = obj.color || '#F5F1E8';
    ctx.font = `${obj.fontSize || 22}px Inter, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(obj.text || '', obj.x * canvas.width, obj.y * canvas.height);
  } else if (obj.type === 'image') {
    const src = obj.dataUrl || obj.url; // dataUrl: ảnh nhúng thẳng trong Firestore; url: (không dùng nữa, giữ để tương thích ngược)
    const img = getCachedImage(src);
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, obj.x * canvas.width, obj.y * canvas.height, obj.w * canvas.width, obj.h * canvas.height);
    } else {
      img.onload = () => { if (window._redrawAll) window._redrawAll(); };
    }
  } else {
    drawStrokeNormalized(ctx, canvas, obj);
  }
}
function getCachedImage(src){
  if (!src) return new Image();
  if (!imageCache[src]) {
    const img = new Image();
    img.src = src;
    imageCache[src] = img;
  }
  return imageCache[src];
}

// ================= Trình chiếu PDF/PPT (nhiều trang, lật qua lại, đồng bộ cho cả lớp/nhóm) =================
function getDeckPageImage(deckId, pageIndex, onReady){
  const key = deckId + ':' + pageIndex;
  if (deckPageCache[key]) return deckPageCache[key];
  const img = new Image();
  deckPageCache[key] = img; // đặt trước để tránh gọi Firestore nhiều lần khi đang tải
  strokesRef.doc('__deck__').collection('pages').doc(String(pageIndex)).get().then((doc) => {
    const data = doc.data();
    if (data && data.dataUrl) {
      img.onload = () => { if (onReady) onReady(); };
      img.src = data.dataUrl;
    }
  }).catch(() => {});
  return img;
}

function drawDeckLayer(ctx, canvas){
  if (!activeDeck) return;
  const img = getDeckPageImage(activeDeck.deckId, activeDeck.currentPage, () => { if (window._redrawDeck) window._redrawDeck(); });
  const boxX = 0.05 * canvas.width, boxY = 0.06 * canvas.height;
  const boxW = 0.9 * canvas.width, boxH = 0.78 * canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  if (img.complete && img.naturalWidth) {
    const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
    const drawW = img.naturalWidth * scale, drawH = img.naturalHeight * scale;
    const drawX = boxX + (boxW - drawW) / 2, drawY = boxY + (boxH - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }
}

function updateDeckUI(){
  const bar = document.getElementById('deck-controls');
  if (!bar) return;
  if (!activeDeck) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  document.getElementById('deck-page-label').textContent = `Trang ${activeDeck.currentPage + 1}/${activeDeck.totalPages}`;
  const allowed = canDraw();
  document.getElementById('deck-prev-btn').disabled = !allowed || activeDeck.currentPage <= 0;
  document.getElementById('deck-next-btn').disabled = !allowed || activeDeck.currentPage >= activeDeck.totalPages - 1;
  document.getElementById('deck-close-btn').style.display = allowed ? 'inline-block' : 'none';
}

function deckPrevSlide(){
  if (!activeDeck || !canDraw()) return;
  strokesRef.doc('__deck__').update({ currentPage: Math.max(0, activeDeck.currentPage - 1) });
}
function deckNextSlide(){
  if (!activeDeck || !canDraw()) return;
  strokesRef.doc('__deck__').update({ currentPage: Math.min(activeDeck.totalPages - 1, activeDeck.currentPage + 1) });
}
async function closeDeck(){
  if (!canDraw()) return;
  const deckDocRef = strokesRef.doc('__deck__');
  try {
    const pagesSnap = await deckDocRef.collection('pages').get();
    const batch = db.batch();
    pagesSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(deckDocRef);
    await batch.commit();
  } catch (e) { console.warn('Không dọn được slide:', e); }
}

function listenStrokes(){
  if (unsubStrokes) unsubStrokes();
  renderedStrokeIds = new Set();
  window._allObjects = [];
  activeDeck = null;
  updateDeckUI();
  if (window._redrawAll) window._redrawAll();
  if (window._redrawDeck) window._redrawDeck();
  unsubStrokes = strokesRef.orderBy('ts').onSnapshot((snap) => {
    let deckChanged = false;
    let strokesCleared = false;
    let anyModified = false;
    snap.docChanges().forEach((change) => {
      if (change.doc.id === '__deck__') {
        activeDeck = (change.type === 'removed') ? null : change.doc.data();
        deckChanged = true;
        return;
      }
      if (change.type === 'added' && !renderedStrokeIds.has(change.doc.id)) {
        renderedStrokeIds.add(change.doc.id);
        const data = change.doc.data();
        window._allObjects = window._allObjects || [];
        window._allObjects.push({ id: change.doc.id, data });
        if (window._drawOne) window._drawOne(data); // vẽ thêm, không vẽ lại từ đầu -> mượt hơn khi bảng có nhiều nét
      }
      if (change.type === 'modified') {
        // xảy ra khi ai đó di chuyển/resize 1 vật bằng công cụ con trỏ
        const entry = (window._allObjects || []).find(o => o.id === change.doc.id);
        if (entry) { entry.data = change.doc.data(); anyModified = true; }
      }
      if (change.type === 'removed') {
        window._allObjects = (window._allObjects || []).filter(o => o.id !== change.doc.id);
        renderedStrokeIds.delete(change.doc.id);
        strokesCleared = true;
      }
    });
    if (strokesCleared || anyModified) window._redrawAll && window._redrawAll();
    if (deckChanged) { updateDeckUI(); window._redrawDeck && window._redrawDeck(); }
  });
}

function getObjectPageY(data){
  if (data.points && data.points.length) return data.points[0].y;
  return typeof data.y === 'number' ? data.y : 0;
}

// Chỉ xoá nội dung của trang đang xem (dựa theo vị trí cuộn hiện tại), không đụng tới các trang khác
async function clearCurrentPage(){
  if (!isTeacher) return;
  const scrollEl = document.getElementById('board-scroll');
  const pageH = scrollEl.clientHeight || 1;
  const pageIndex = Math.min(PAGES_COUNT - 1, Math.round(scrollEl.scrollTop / pageH));
  const yMin = pageIndex / PAGES_COUNT;
  const yMax = (pageIndex + 1) / PAGES_COUNT;
  const toDelete = (window._allObjects || []).filter(o => {
    const y = getObjectPageY(o.data);
    return y >= yMin && y < yMax;
  });
  if (toDelete.length === 0) return;
  const batch = db.batch();
  toDelete.forEach(o => batch.delete(strokesRef.doc(o.id)));
  await batch.commit();
}

async function clearBoard(){
  if (!isTeacher) return;
  const snap = await strokesRef.get();
  const batch = db.batch();
  snap.docs.forEach(d => { if (d.id !== '__deck__') batch.delete(d.ref); });
  await batch.commit();
  await closeDeck(); // đóng luôn slide đang trình chiếu (nếu có) và dọn ảnh các trang
  window._allObjects = [];
  renderedStrokeIds = new Set();
  if (window._redrawAll) window._redrawAll();
  if (window._redrawDeck) window._redrawDeck();
}

// ================= Tải ảnh / dán ảnh / PDF lên bảng =================
// Không dùng Firebase Storage (cần gói trả phí) — ảnh được nén nhỏ lại và nhúng thẳng dưới dạng
// base64 vào tài liệu Firestore. Firestore giới hạn ~1MB/tài liệu nên ảnh cần đủ nhẹ; hàm dưới đây
// tự động giảm kích thước/chất lượng cho tới khi vừa.
const MAX_BOARD_IMAGE_BYTES = 700000; // mục tiêu nén tới mức này
const HARD_LIMIT_BOARD_IMAGE_BYTES = 900000; // vượt mức này thì từ chối, tránh vượt giới hạn Firestore

function fileToCompressedDataUrl(file, maxDim, quality){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // nền trắng khi ảnh có nền trong suốt (ép qua JPEG sẽ mất trong suốt)
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width, height });
      };
      img.onerror = () => reject(new Error('Không đọc được ảnh'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Không đọc được tệp'));
    reader.readAsDataURL(file);
  });
}

async function addImageObjectToBoard(dataUrl, width, height, opts){
  opts = opts || {};
  if (dataUrl.length > HARD_LIMIT_BOARD_IMAGE_BYTES) {
    alert('Ảnh/trang PDF này vẫn còn quá nặng sau khi nén (bảng lưu ảnh trực tiếp, không qua máy chủ lưu trữ riêng, nên cần ảnh nhẹ hơn). Hãy thử ảnh có kích thước/độ chi tiết thấp hơn.');
    return;
  }
  const canvas = document.getElementById('board-canvas');
  const wFrac = opts.wFrac || 0.35;
  const hFrac = wFrac * (height / width) * (canvas.width / canvas.height);
  await strokesRef.add({
    type: 'image',
    dataUrl,
    x: 0.08, y: 0.08, w: wFrac, h: hFrac,
    uid: currentUser.uid,
    ts: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function uploadImageFileToBoard(file, opts){
  opts = opts || {};
  if (!canDraw()) { alert('Bạn chưa được cấp quyền thao tác trên bảng trắng.'); return; }
  try {
    let quality = opts.quality || 0.72;
    let result = await fileToCompressedDataUrl(file, opts.maxDim || 1000, quality);
    while (result.dataUrl.length > MAX_BOARD_IMAGE_BYTES && quality > 0.3) {
      quality -= 0.15;
      result = await fileToCompressedDataUrl(file, opts.maxDim || 1000, quality);
    }
    await addImageObjectToBoard(result.dataUrl, result.width, result.height, opts);
  } catch (e) {
    alert('Không thể thêm ảnh: ' + e.message);
  }
}

function onImageFileChosen(event){
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  uploadImageFileToBoard(file);
}

async function onPdfFileChosen(event){
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!canDraw()) { alert('Bạn chưa được cấp quyền thao tác trên bảng trắng.'); return; }

  const statusEl = document.getElementById('deck-upload-status');
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    if (totalPages > 60 && !confirm(`File có ${totalPages} trang, khá nhiều — có thể mất một lúc để xử lý. Vẫn tiếp tục?`)) return;
    if (activeDeck) await closeDeck(); // dọn slide cũ (nếu có) trước khi tải slide mới

    const deckDocRef = strokesRef.doc('__deck__');
    const deckId = deckDocRef.id + '-' + Date.now(); // định danh riêng cho lần tải này, dùng làm khoá cache ảnh

    for (let i = 1; i <= totalPages; i++) {
      statusEl.textContent = `Đang xử lý trang ${i}/${totalPages}...`;
      const page = await pdf.getPage(i);
      let scale = 1.3;
      let dataUrl = '';
      for (let attempt = 0; attempt < 4; attempt++) {
        const viewport = page.getViewport({ scale });
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = viewport.width;
        tmpCanvas.height = viewport.height;
        const ctx = tmpCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        dataUrl = tmpCanvas.toDataURL('image/jpeg', 0.68);
        if (dataUrl.length <= MAX_BOARD_IMAGE_BYTES) break;
        scale *= 0.7;
      }
      await deckDocRef.collection('pages').doc(String(i - 1)).set({ dataUrl });
    }

    await deckDocRef.set({
      type: 'deck-state',
      deckId,
      totalPages,
      currentPage: 0,
      uid: currentUser.uid,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    statusEl.textContent = '';
  } catch (e) {
    statusEl.textContent = '';
    alert('Không thể đọc file PDF: ' + e.message);
  }
}

// ================= Chat trong lớp =================
document.getElementById('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !chatRef || !currentUser) return;
  chatRef.add({
    uid: currentUser.uid,
    name: currentUser.name,
    role: isTeacher ? 'teacher' : 'student',
    text,
    ts: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = '';
});

function listenChat(){
  if (unsubChat) unsubChat();
  renderedChatIds = new Set();
  document.getElementById('chat-messages').innerHTML = '';
  unsubChat = chatRef.orderBy('ts').onSnapshot((snap) => {
    const box = document.getElementById('chat-messages');
    let appended = false;
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added' || renderedChatIds.has(change.doc.id)) return;
      renderedChatIds.add(change.doc.id);
      const m = change.doc.data();
      const isMine = m.uid === currentUser.uid;
      const row = document.createElement('div');
      row.className = 'chat-msg' + (isMine ? ' mine' : '') + (m.role === 'teacher' ? ' teacher' : '');
      row.innerHTML = `
        <div class="meta">${escapeHtml(m.name || '')}${m.role === 'teacher' ? ' · Giáo viên' : ''}</div>
        <div class="bubble">${escapeHtml(m.text || '')}</div>
      `;
      box.appendChild(row);
      appended = true;
    });
    if (appended) scrollChatToBottom();
  });
}

// ================= Giơ tay phát biểu (học viên) =================
function toggleHandRaise(){
  if (!membersRef || !currentUser) return;
  handRaised = !handRaised;
  membersRef.doc(currentUser.uid).update({ handRaised }).catch(() => {});
  const btn = document.getElementById('hand-btn');
  btn.textContent = handRaised ? '🖐️' : '✋';
  btn.title = handRaised ? 'Đã giơ tay (bấm để hạ tay)' : 'Giơ tay phát biểu';
  btn.classList.toggle('on', handRaised);
}

// ================= Tắt mic tất cả (giáo viên) =================
async function muteAllStudents(){
  if (!isTeacher) return;
  const snap = await membersRef.get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.update(d.ref, { mutedByTeacher: true }));
  await batch.commit();
}

function forceMuteLocalMic(){
  forcedMuted = true;
  micOn = false;
  if (micGainedTrack) micGainedTrack.enabled = false;
  updateMicCamButtons();
  updateSelfTileVisual();
  const micBtn = document.getElementById('mic-btn');
  micBtn.disabled = true;
  micBtn.title = 'Giáo viên đã tắt mic của cả lớp';
}
function releaseForcedMute(){
  forcedMuted = false;
  const micBtn = document.getElementById('mic-btn');
  micBtn.disabled = false;
  micBtn.title = '';
}

// ================= Thoại riêng trong nhóm (học viên nói chuyện với nhau, giáo viên có thể ghé vào) =================
// Khác với kênh video chính (giáo viên <-> từng học viên), đây là kết nối thoại TRỰC TIẾP giữa
// các thành viên cùng nhóm (chỉ audio, không video, để nhẹ máy). Ai "vào" nhóm sẽ tự nối thoại
// với mọi người khác đang có mặt trong nhóm đó, dùng lại chính track mic hiện có (bật/tắt mic vẫn
// dùng chung 1 nút mic như bình thường).
async function joinGroupAudioMesh(groupId){
  if (currentGroupMeshId === groupId) return;
  await leaveGroupAudioMesh();
  currentGroupMeshId = groupId;

  const presenceCol = liveRef.collection('groups').doc(groupId).collection('presence');
  myGroupPresenceRef = presenceCol.doc(currentUser.uid);
  await myGroupPresenceRef.set({
    name: currentUser.name,
    role: isTeacher ? 'teacher' : 'student',
    ts: firebase.firestore.FieldValue.serverTimestamp()
  });

  unsubGroupPresence = presenceCol.onSnapshot((snap) => {
    const present = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    const presentUids = present.map(p => p.uid).filter(uid => uid !== currentUser.uid);

    presentUids.forEach(uid => { if (!groupMeshPCs[uid]) setupGroupPeer(groupId, uid); });
    Object.keys(groupMeshPCs).forEach(uid => { if (!presentUids.includes(uid)) closeGroupPeer(uid); });

    updateGroupMeshStatus(present);
  });

  if (isTeacher) renderGroupPanel();
}

async function leaveGroupAudioMesh(){
  if (unsubGroupPresence) { unsubGroupPresence(); unsubGroupPresence = null; }
  Object.keys(groupMeshPCs).forEach(closeGroupPeer);
  if (myGroupPresenceRef) {
    try { await myGroupPresenceRef.delete(); } catch (e) {}
    myGroupPresenceRef = null;
  }
  currentGroupMeshId = null;
  updateGroupMeshStatus(null);
  if (isTeacher) renderGroupPanel();
}

async function setupGroupPeer(groupId, otherUid){
  const pc = new RTCPeerConnection(RTC_CONFIG);
  groupMeshPCs[otherUid] = pc;

  if (localMediaStream && (currentOutgoingAudioTrack || micGainedTrack)) {
    pc.addTrack(currentOutgoingAudioTrack || micGainedTrack, localMediaStream);
  }

  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  document.body.appendChild(audioEl);
  groupMeshAudioEls[otherUid] = audioEl;
  registerPlaybackEl(audioEl);
  pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };

  const pairId = [currentUser.uid, otherUid].sort().join('_');
  const callDoc = liveRef.collection('groups').doc(groupId).collection('calls').doc(pairId);
  const amOfferer = currentUser.uid < otherUid;
  const myCandidates = callDoc.collection(amOfferer ? 'offerCandidates' : 'answerCandidates');
  const theirCandidates = callDoc.collection(amOfferer ? 'answerCandidates' : 'offerCandidates');

  pc.onicecandidate = (e) => { if (e.candidate) myCandidates.add(e.candidate.toJSON()); };

  if (amOfferer) {
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);
    await callDoc.set({ offer: { type: offerDescription.type, sdp: offerDescription.sdp }, answer: firebase.firestore.FieldValue.delete() }, { merge: true });
    callDoc.onSnapshot(async (snap) => {
      const data = snap.data();
      if (data && data.answer && pc.signalingState !== 'closed' && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });
  } else {
    callDoc.onSnapshot(async (snap) => {
      const data = snap.data();
      if (data && data.offer && pc.signalingState !== 'closed' && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);
        await callDoc.set({ answer: { type: answerDescription.type, sdp: answerDescription.sdp } }, { merge: true });
      }
    });
  }

  theirCandidates.onSnapshot((snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
    });
  });
}

function closeGroupPeer(otherUid){
  if (groupMeshPCs[otherUid]) { groupMeshPCs[otherUid].close(); delete groupMeshPCs[otherUid]; }
  if (groupMeshAudioEls[otherUid]) { groupMeshAudioEls[otherUid].remove(); delete groupMeshAudioEls[otherUid]; }
}

function updateGroupMeshStatus(present){
  const el = document.getElementById('group-mesh-status');
  if (!el) return;
  if (!currentGroupMeshId || !present) { el.textContent = ''; return; }
  const g = groupsCache.find(g => g.id === currentGroupMeshId);
  const name = g ? g.data.name : 'Nhóm';
  const names = present.map(p => p.uid === currentUser.uid ? 'Bạn' : (p.name || '...')).join(', ');
  el.textContent = `🔊 Thoại ${name}: ${names}`;
}

// ================= Chia nhóm nhỏ (breakout groups) =================
// Mỗi nhóm có bảng trắng + chat riêng (subcollection riêng dưới live/current/groups/{groupId}).
// "activeScope" quyết định đang xem/tham gia bảng+chat của "Cả lớp" hay của 1 nhóm cụ thể.
function switchScope(scope){
  activeScope = scope;
  strokesRef = (scope === 'main')
    ? liveRef.collection('strokes')
    : liveRef.collection('groups').doc(scope).collection('strokes');
  chatRef = (scope === 'main')
    ? liveRef.collection('chat')
    : liveRef.collection('groups').doc(scope).collection('chat');
  listenStrokes();
  listenChat();
  updateScopeLabel();
  if (isTeacher) renderGroupPanel();
}

function updateScopeLabel(){
  const label = document.getElementById('scope-label');
  if (!label) return;
  if (activeScope === 'main') {
    label.textContent = isTeacher ? 'Đang xem: Cả lớp' : '';
  } else {
    const g = groupsCache.find(g => g.id === activeScope);
    const name = g ? g.data.name : 'Nhóm';
    label.textContent = isTeacher ? `Đang xem: ${name}` : `Bạn đang ở: ${name}`;
  }
}

function listenGroups(){
  liveRef.collection('groups').onSnapshot((snap) => {
    groupsCache = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    renderMemberList();
    renderGroupPanel();
    updateScopeLabel();
  });
}

let lastActivityTs = 0;

function listenLiveState(){
  liveRef.onSnapshot((snap) => {
    const d = snap.data() || {};
    breakoutActive = !!d.breakoutActive;
    if (isTeacher) {
      if (!breakoutActive && currentGroupMeshId) leaveGroupAudioMesh();
      renderGroupPanel();
    } else {
      applyStudentScopeFromState();
    }
    if (d.activity && d.activity.ts && d.activity.ts > lastActivityTs) {
      lastActivityTs = d.activity.ts;
      showActivityPopup(d.activity);
    }
  });
}

// ================= Xúc xắc & Quay ngẫu nhiên tên (chỉ giáo viên bấm được, cả lớp cùng thấy kết quả) =================
function rollDice(){
  if (!isTeacher) return;
  const value = 1 + Math.floor(Math.random() * 6);
  liveRef.set({ activity: { type: 'dice', value, ts: Date.now() } }, { merge: true });
}

function pickRandomStudent(){
  if (!isTeacher) return;
  const presentUids = Object.keys(teacherPCs); // học viên đang thật sự kết nối trong buổi
  if (presentUids.length === 0) { alert('Chưa có học viên nào đang trong buổi học.'); return; }
  const pickUid = presentUids[Math.floor(Math.random() * presentUids.length)];
  const entry = membersCache.find(m => m.id === pickUid);
  const name = entry ? entry.data.name : 'Học viên';
  liveRef.set({ activity: { type: 'name', value: name, ts: Date.now() } }, { merge: true });
}

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function showActivityPopup(activity){
  const overlay = document.createElement('div');
  overlay.className = 'activity-popup-overlay';
  const big = activity.type === 'dice'
    ? `<div class="activity-dice-face">${DICE_FACES[activity.value] || activity.value}</div><div class="activity-popup-title">Xúc xắc: ${activity.value}</div>`
    : `<div class="activity-dice-face">🎯</div><div class="activity-popup-title">${escapeHtml(String(activity.value))}</div>`;
  overlay.innerHTML = `
    <div class="activity-popup-box">
      ${big}
      <button class="btn btn-ghost btn-sm" onclick="this.closest('.activity-popup-overlay').remove()">Đóng</button>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 5000);
}

function applyStudentScopeFromState(){
  if (isTeacher) return;
  const target = (breakoutActive && myGroupId) ? myGroupId : 'main';
  if (target !== activeScope) switchScope(target);
  else updateScopeLabel();

  if (breakoutActive && myGroupId) {
    if (currentGroupMeshId !== myGroupId) joinGroupAudioMesh(myGroupId);
  } else if (currentGroupMeshId) {
    leaveGroupAudioMesh();
  }
}

function createGroup(){
  const name = 'Nhóm ' + (groupsCache.length + 1);
  liveRef.collection('groups').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
}

async function deleteGroup(groupId){
  if (!confirm('Xoá nhóm này? Học viên trong nhóm sẽ trở về trạng thái chưa xếp nhóm.')) return;
  const batch = db.batch();
  membersCache.filter(m => m.data.groupId === groupId).forEach(m => batch.update(membersRef.doc(m.id), { groupId: null }));
  batch.delete(liveRef.collection('groups').doc(groupId));
  await batch.commit();
  if (activeScope === groupId) switchScope('main');
  if (currentGroupMeshId === groupId) await leaveGroupAudioMesh();
}

function toggleBreakout(){
  if (!isTeacher) return;
  if (groupsCache.length === 0) { alert('Hãy tạo ít nhất 1 nhóm và xếp học viên trước khi bắt đầu.'); return; }
  liveRef.set({ breakoutActive: !breakoutActive }, { merge: true });
}

function renderGroupPanel(){
  if (!isTeacher) return;
  const list = document.getElementById('group-list');
  list.innerHTML = '';
  if (groupsCache.length === 0) {
    list.innerHTML = '<div class="empty-mini">Chưa có nhóm nào. Bấm "+ Nhóm" để tạo.</div>';
  } else {
    groupsCache.forEach(g => {
      const count = membersCache.filter(m => m.data.groupId === g.id).length;
      const inThisMesh = currentGroupMeshId === g.id;
      const row = document.createElement('div');
      row.className = 'group-row' + (activeScope === g.id ? ' active-scope' : '');
      row.innerHTML = `
        <span style="cursor:pointer;" onclick="switchScope('${g.id}')">${escapeHtml(g.data.name)} <span class="who">(${count})</span></span>
        <div class="right-group">
          <button class="btn btn-ghost btn-sm audio-join-btn${inThisMesh ? ' active' : ''}" onclick="${inThisMesh ? 'leaveGroupAudioMesh()' : `joinGroupAudioMesh('${g.id}')`}">${inThisMesh ? '🔇 Rời thoại' : '🎧 Vào nghe/nói'}</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteGroup('${g.id}')">Xoá</button>
        </div>
      `;
      list.appendChild(row);
    });
  }
  const toggleBtn = document.getElementById('breakout-toggle-btn');
  toggleBtn.textContent = breakoutActive ? 'Kết thúc chia nhóm' : 'Bắt đầu chia nhóm';
  toggleBtn.classList.toggle('off', !breakoutActive);
  updateVideoTileGroupBadges();
}

function updateVideoTileGroupBadges(){
  if (!isTeacher) return;
  membersCache.forEach(({ id, data }) => {
    const tile = document.getElementById('tile-' + id);
    if (!tile) return;
    const label = tile.querySelector('.label');
    let tag = label.querySelector('.group-tag');
    const group = data.groupId ? groupsCache.find(g => g.id === data.groupId) : null;
    if (group) {
      if (!tag) { tag = document.createElement('span'); tag.className = 'group-tag'; label.appendChild(tag); }
      tag.textContent = group.data.name;
    } else if (tag) {
      tag.remove();
    }
  });
}

// ================= Danh sách học viên + cấp quyền vẽ =================
function listenMembers(){
  membersRef.onSnapshot((snap) => {
    membersCache = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    handleSelfMemberUpdate();
    renderMemberList();
  });
}

function handleSelfMemberUpdate(){
  if (isTeacher || !currentUser) return;
  const selfEntry = membersCache.find(m => m.id === currentUser.uid);
  if (!selfEntry) return;
  const m = selfEntry.data;

  drawingAllowed = !!m.allowedToDraw;
  updateBoardHint();

  if (m.mutedByTeacher && !forcedMuted) forceMuteLocalMic();
  if (!m.mutedByTeacher && forcedMuted) releaseForcedMute();

  myGroupId = m.groupId || null;
  applyStudentScopeFromState();
}

function renderMemberList(){
  const list = document.getElementById('member-list');
  list.innerHTML = '';
  membersCache.forEach(({ id, data: m }) => {
    const row = document.createElement('div');
    row.className = 'member-row';
    const initials = (m.name || '?').trim().charAt(0).toUpperCase();
    const group = m.groupId ? groupsCache.find(g => g.id === m.groupId) : null;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'name';
    nameDiv.innerHTML = `
      <span class="avatar">${initials}</span>
      <span>${escapeHtml(m.name || 'Học viên')}</span>
      ${m.handRaised ? '<span class="hand-icon" title="Đang giơ tay">✋</span>' : ''}
      ${m.mutedByTeacher ? '<span class="muted-tag">🔇 đã tắt mic</span>' : ''}
      ${m.stars ? `<span class="star-badge">⭐ ${m.stars}</span>` : ''}
      ${group ? `<span class="group-chip">${escapeHtml(group.data.name)}</span>` : ''}
    `;
    row.appendChild(nameDiv);

    const rightGroup = document.createElement('div');
    rightGroup.className = 'right-group';

    if (isTeacher) {
      const starBtn = document.createElement('button');
      starBtn.className = 'star-give-btn';
      starBtn.title = 'Tặng 1 sao';
      starBtn.textContent = '⭐+';
      starBtn.onclick = () => membersRef.doc(id).update({ stars: firebase.firestore.FieldValue.increment(1) });
      rightGroup.appendChild(starBtn);

      if (m.handRaised) {
        const lowerBtn = document.createElement('button');
        lowerBtn.className = 'btn btn-ghost btn-sm';
        lowerBtn.textContent = 'Hạ tay';
        lowerBtn.onclick = () => membersRef.doc(id).update({ handRaised: false });
        rightGroup.appendChild(lowerBtn);
      }

      const muteBtn = document.createElement('button');
      muteBtn.className = 'btn btn-ghost btn-sm';
      muteBtn.textContent = m.mutedByTeacher ? 'Bỏ tắt mic' : 'Tắt mic';
      muteBtn.onclick = () => membersRef.doc(id).update({ mutedByTeacher: !m.mutedByTeacher });
      rightGroup.appendChild(muteBtn);

      const groupSelect = document.createElement('select');
      groupSelect.className = 'group-select';
      let options = '<option value="">— Chưa xếp nhóm —</option>';
      groupsCache.forEach(g => {
        options += `<option value="${g.id}" ${m.groupId === g.id ? 'selected' : ''}>${escapeHtml(g.data.name)}</option>`;
      });
      groupSelect.innerHTML = options;
      groupSelect.onchange = () => membersRef.doc(id).update({ groupId: groupSelect.value || null });
      rightGroup.appendChild(groupSelect);

      const permBtn = document.createElement('button');
      permBtn.className = 'perm-toggle' + (m.allowedToDraw ? ' on' : '');
      permBtn.title = 'Cho phép thao tác trên bảng trắng';
      permBtn.innerHTML = '<span class="knob"></span>';
      permBtn.onclick = () => membersRef.doc(id).update({ allowedToDraw: !m.allowedToDraw });
      rightGroup.appendChild(permBtn);
    }

    row.appendChild(rightGroup);
    list.appendChild(row);
  });
  updateVideoTileGroupBadges();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
