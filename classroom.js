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

let currentUser = null;   // {uid, name, role}
let isTeacher = false;
let classRef, liveRef, callsRef, membersRef, strokesRef;

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
let drawing = false;
let lastPoint = null;
let strokeBuffer = [];
let renderedStrokeIds = new Set();
let imageCache = {};

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

if (!classId) {
  alert('Thiếu classId trong đường dẫn.');
  window.location.href = 'index.html';
}

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

  document.getElementById('class-name').textContent = cls.name;
  document.getElementById('who').textContent = currentUser.name + (isTeacher ? ' (Giáo viên)' : '');

  liveRef = classRef.collection('live').doc('current');
  callsRef = liveRef.collection('calls');
  membersRef = classRef.collection('members');
  strokesRef = liveRef.collection('strokes');
  chatRef = liveRef.collection('chat');

  if (isTeacher) {
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      document.getElementById('share-btn').style.display = 'inline-block';
    } // trên điện thoại (đặc biệt iPhone/Safari) trình duyệt không hỗ trợ chia sẻ màn hình -> ẩn nút luôn, đỡ bấm vào bị lỗi
    document.getElementById('muteall-btn').style.display = 'inline-block';
    document.getElementById('group-panel').style.display = 'block';
  } else {
    document.getElementById('clear-board-btn').style.display = 'none';
    document.getElementById('hand-btn').style.display = 'inline-block';
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
});

function startSessionTimer(){
  setInterval(() => {
    const secs = Math.floor((Date.now() - sessionStartMs) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    document.getElementById('session-timer').textContent = `${mm}:${ss}`;
  }, 1000);
}

// ================= Tab chuyển đổi Video / Bảng trắng =================
function switchTab(tab){
  document.querySelectorAll('.stage-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('video-view').classList.toggle('active', tab === 'video');
  document.getElementById('board-view').classList.toggle('active', tab === 'board');
  document.getElementById('chat-view').classList.toggle('active', tab === 'chat');
  updateBoardHint();
  if (tab === 'chat') scrollChatToBottom();
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
    tile.className = 'video-tile' + (id !== 'self' && !isSelf ? ' main-tile' : '');
    tile.id = 'tile-' + id;
    tile.innerHTML = `
      <video autoplay playsinline ${isSelf ? 'muted' : ''}></video>
      <div class="avatar-fallback"></div>
      <div class="label"><span class="mic-indicator">🔇</span><span class="name-text"></span></div>
    `;
    document.getElementById('video-grid').appendChild(tile);
    placeTileDefault(tile, id);
    makeTileDraggable(tile);
    if (!isSelf) registerPlaybackEl(tile.querySelector('video'));
  }
  tile.querySelector('.name-text').textContent = label;
  tile.querySelector('.avatar-fallback').textContent = (label || '?').trim().charAt(0).toUpperCase();
  updateVideoEmptyVisibility();
  return tile;
}

function placeTileDefault(tile, id){
  const grid = document.getElementById('video-grid');
  const containerWidth = grid.clientWidth || 300;
  const gap = 16;
  const isMain = tile.classList.contains('main-tile');
  const baseWidth = isMain ? 360 : 230;
  const tileWidth = Math.min(baseWidth, Math.max(140, containerWidth - 32)); // co lại vừa màn hình hẹp, không tràn ra ngoài
  tile.style.width = tileWidth + 'px';
  const tileHeight = tileWidth * 9 / 16 + 34; // ước lượng thêm phần nhãn tên/mic

  const cols = Math.max(1, Math.floor((containerWidth + gap) / (tileWidth + gap)));
  const idx = Object.keys(tilePositions).length;
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const x = 16 + col * (tileWidth + gap);
  const y = 16 + row * (tileHeight + gap);
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
function removeTile(id){
  const tile = document.getElementById('tile-' + id);
  if (tile) tile.remove();
  delete tilePositions[id];
  updateVideoEmptyVisibility();
}
function updateVideoEmptyVisibility(){
  const grid = document.getElementById('video-grid');
  document.getElementById('video-empty').style.display = grid.children.length ? 'none' : 'block';
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
    localMediaStream.getAudioTracks().forEach(t => t.enabled = false);
    localMediaStream.getVideoTracks().forEach(t => t.enabled = false);
    const audioTrack = localMediaStream.getAudioTracks()[0];
    if (audioTrack) currentMicDeviceId = audioTrack.getSettings().deviceId || '';
    renderSelfTile();
    return true;
  } catch (e) {
    console.warn('Không lấy được camera/micro:', e);
    return false;
  }
}

function toggleMic(){
  if (!localMediaStream) { alert('Chưa có quyền truy cập micro. Hãy cấp quyền camera/micro cho trang này rồi tải lại trang.'); return; }
  if (forcedMuted) { alert('Giáo viên đã tắt mic của cả lớp. Vui lòng đợi giáo viên mở lại.'); return; }
  micOn = !micOn;
  const t = localMediaStream.getAudioTracks()[0];
  if (t) t.enabled = micOn;
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
  micBtn.textContent = micOn ? '🎤 Tắt mic' : '🎤 Bật mic';
  micBtn.classList.toggle('off', !micOn);
  camBtn.textContent = camOn ? '🎥 Tắt camera' : '🎥 Bật camera';
  camBtn.classList.toggle('off', !camOn);
}

// gắn track hiện tại (mic + camera, hoặc mic + màn hình nếu đang chia sẻ) vào 1 peer connection mới
function addLocalTracksToPC(pc){
  if (!localMediaStream) return;
  const audioTrack = localMediaStream.getAudioTracks()[0];
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
function replaceLiveAudioTrack(newTrack){
  newTrack.enabled = micOn;
  const oldTrack = localMediaStream.getAudioTracks()[0];
  if (oldTrack) { localMediaStream.removeTrack(oldTrack); oldTrack.stop(); }
  localMediaStream.addTrack(newTrack);

  const allPCs = [
    ...Object.values(teacherPCs),
    ...(studentPC ? [studentPC] : []),
    ...Object.values(groupMeshPCs)
  ];
  allPCs.forEach(pc => {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
    if (sender) sender.replaceTrack(newTrack);
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
async function toggleScreenShare(){
  if (sharingScreen) { stopScreenShare(); return; }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    sharingScreen = true;
    const newTrack = screenStream.getVideoTracks()[0];
    for (const uid in teacherPCs) {
      const sender = teacherPCs[uid].getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
      else teacherPCs[uid].addTrack(newTrack, screenStream);
    }
    newTrack.onended = () => stopScreenShare();
    document.getElementById('share-btn').textContent = '🖥️ Dừng chia sẻ';
  } catch (e) {
    // người dùng huỷ hộp thoại chọn màn hình -> bỏ qua
  }
}

async function stopScreenShare(){
  if (!sharingScreen) return;
  sharingScreen = false;
  const cameraTrack = localMediaStream ? localMediaStream.getVideoTracks()[0] : null;
  for (const uid in teacherPCs) {
    const sender = teacherPCs[uid].getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
  }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  document.getElementById('share-btn').textContent = '🖥️ Chia sẻ màn hình';
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
  if (localMediaStream) localMediaStream.getTracks().forEach(t => t.stop());
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  stopTestStream();
  stopMicMeter();
  if (studentPC) studentPC.close();
  for (const uid in teacherPCs) teacherPCs[uid].close();
  await leaveGroupAudioMesh();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (!isTeacher && currentUser && callsRef) {
    try { await callsRef.doc(currentUser.uid).delete(); } catch (e) {}
  }
  window.location.href = isTeacher ? 'teacher.html' : 'student.html';
}
window.addEventListener('beforeunload', () => {
  if (!isTeacher && currentUser && callsRef) callsRef.doc(currentUser.uid).delete().catch(() => {});
  if (myGroupPresenceRef) myGroupPresenceRef.delete().catch(() => {});
});

// ================= Ghi hình (MediaRecorder, tải về máy) =================
function getRecordableStream(){
  if (isTeacher) {
    const tracks = [];
    const videoTrack = (sharingScreen && screenStream) ? screenStream.getVideoTracks()[0] : (localMediaStream && localMediaStream.getVideoTracks()[0]);
    const audioTrack = localMediaStream && localMediaStream.getAudioTracks()[0];
    if (videoTrack) tracks.push(videoTrack);
    if (audioTrack) tracks.push(audioTrack);
    return tracks.length ? new MediaStream(tracks) : null;
  }
  const tile = document.getElementById('tile-teacher');
  return tile ? tile.querySelector('video').srcObject : null;
}

function toggleRecording(){
  const recBtn = document.getElementById('rec-btn');
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    recBtn.textContent = '⏺ Ghi lại buổi học';
    document.getElementById('rec-status').textContent = '';
    return;
  }
  const streamToRecord = getRecordableStream();
  if (!streamToRecord || streamToRecord.getTracks().length === 0) {
    alert('Chưa có hình ảnh/âm thanh để ghi. Bật camera/mic, hoặc đợi giáo viên phát trực tiếp.');
    return;
  }
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buoihoc-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };
  mediaRecorder.start();
  recBtn.textContent = '⏹ Dừng ghi hình';
  document.getElementById('rec-status').innerHTML = '<span class="rec-dot"></span>Đang ghi...';
}

// ================= Bảng trắng đồng bộ (Firestore) =================
function setBoardTool(tool){
  boardTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
}

function updateBoardHint(){
  const hint = document.getElementById('board-hint');
  const boardActive = document.getElementById('board-view').classList.contains('active');
  hint.style.display = (boardActive && !canDraw()) ? 'block' : 'none';
}

function setupBoard(){
  const canvas = document.getElementById('board-canvas');
  const ctx = canvas.getContext('2d');

  function resize(){
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    redrawAll();
  }
  window.addEventListener('resize', resize);
  resize();

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
    if (boardTool === 'text') { openTextInput(getPos(e)); return; }
    drawing = true;
    lastPoint = getPos(e);
    strokeBuffer = [lastPoint];
  }
  function move(e){
    if (!drawing || boardTool !== 'pen' || !canDraw()) return;
    const p = getPos(e);
    drawLineNormalized(ctx, canvas, lastPoint, p, currentColor);
    strokeBuffer.push(p);
    lastPoint = p;
  }
  function end(){
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
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); });
  canvas.addEventListener('touchend', end);

  window.addEventListener('paste', (e) => {
    if (!document.getElementById('board-view').classList.contains('active')) return;
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
    input.focus();

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
  window._drawOne = (obj) => drawBoardObject(ctx, canvas, obj); // vẽ thêm 1 đối tượng mới, không cần vẽ lại toàn bộ
  function redrawAll(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    (window._allObjects || []).forEach(obj => drawBoardObject(ctx, canvas, obj));
  }

  updateBoardHint();
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

function listenStrokes(){
  if (unsubStrokes) unsubStrokes();
  renderedStrokeIds = new Set();
  window._allObjects = [];
  if (window._redrawAll) window._redrawAll();
  unsubStrokes = strokesRef.orderBy('ts').onSnapshot((snap) => {
    let needFullRedraw = false;
    snap.docChanges().forEach((change) => {
      if (change.type === 'added' && !renderedStrokeIds.has(change.doc.id)) {
        renderedStrokeIds.add(change.doc.id);
        const data = change.doc.data();
        window._allObjects = window._allObjects || [];
        window._allObjects.push(data);
        if (window._drawOne) window._drawOne(data); // vẽ thêm, không vẽ lại từ đầu -> mượt hơn khi bảng có nhiều nét
      }
      if (change.type === 'removed') needFullRedraw = true; // chỉ xảy ra khi "Xoá bảng"
    });
    if (needFullRedraw) {
      window._allObjects = [];
      renderedStrokeIds = new Set();
      if (window._redrawAll) window._redrawAll();
    }
  });
}

async function clearBoard(){
  if (!isTeacher) return;
  const snap = await strokesRef.get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  window._allObjects = [];
  renderedStrokeIds = new Set();
  if (window._redrawAll) window._redrawAll();
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

  const pageNumStr = window.prompt('Hiển thị trang số mấy trong file PDF này?', '1');
  if (pageNumStr === null) return;
  const pageNum = Math.max(1, parseInt(pageNumStr, 10) || 1);

  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    if (pageNum > pdf.numPages) { alert(`File này chỉ có ${pdf.numPages} trang.`); return; }
    const page = await pdf.getPage(pageNum);

    let scale = 1.3;
    let dataUrl = '', width = 0, height = 0;
    // hạ dần độ phân giải cho tới khi đủ nhẹ để nhúng thẳng vào Firestore
    for (let attempt = 0; attempt < 4; attempt++) {
      const viewport = page.getViewport({ scale });
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = viewport.width;
      tmpCanvas.height = viewport.height;
      const ctx = tmpCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      dataUrl = tmpCanvas.toDataURL('image/jpeg', 0.7);
      width = viewport.width;
      height = viewport.height;
      if (dataUrl.length <= MAX_BOARD_IMAGE_BYTES) break;
      scale *= 0.7;
    }
    await addImageObjectToBoard(dataUrl, width, height, { wFrac: 0.5 });
  } catch (e) {
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
  btn.textContent = handRaised ? '🖐️ Đã giơ tay' : '✋ Giơ tay';
  btn.classList.toggle('raised', handRaised);
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
  if (localMediaStream) {
    const t = localMediaStream.getAudioTracks()[0];
    if (t) t.enabled = false;
  }
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

  if (localMediaStream) {
    const audioTrack = localMediaStream.getAudioTracks()[0];
    if (audioTrack) pc.addTrack(audioTrack, localMediaStream);
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
  });
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
