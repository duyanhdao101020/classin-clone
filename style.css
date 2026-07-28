@import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

:root{
  --board: #2F4538;
  --board-2: #3B5347;
  --board-3: #24352A;
  --chalk: #F5F1E8;
  --chalk-dim: #C9D4C6;
  --amber: #E8B94A;
  --amber-dim: #B98F2E;
  --danger: #E2664B;
  --ok: #7FBF8E;
  --radius: 10px;
  --shadow: 0 8px 24px rgba(0,0,0,.25);
}

*{box-sizing:border-box;}
html,body{height:100%;}
body{
  margin:0;
  background:var(--board-3);
  color:var(--chalk);
  font-family:'Inter',sans-serif;
  min-height:100vh;
}

.chalk{font-family:'Kalam',cursive;}
code, .mono{font-family:'IBM Plex Mono',monospace;}

a{color:var(--amber);}

/* layout shells */
.page{
  min-height:100vh;
  display:flex;
  flex-direction:column;
}
.topbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:16px 24px;
  border-bottom:1px dashed rgba(245,241,232,.18);
  background:var(--board);
}
.brand{
  font-family:'Kalam',cursive;
  font-weight:700;
  font-size:22px;
  letter-spacing:.5px;
  display:flex;
  align-items:center;
  gap:8px;
}
.brand .dot{width:10px;height:10px;border-radius:50%;background:var(--amber);display:inline-block;}
.topbar .who{font-size:14px;color:var(--chalk-dim);}
.btn{
  border:none;
  border-radius:8px;
  padding:10px 18px;
  font-weight:600;
  font-size:14px;
  cursor:pointer;
  transition:transform .12s ease, filter .12s ease;
  font-family:'Inter',sans-serif;
}
.btn:active{transform:translateY(1px);}
.btn-amber{background:var(--amber); color:#20301F;}
.btn-amber:hover{filter:brightness(1.08);}
.btn-ghost{background:transparent; color:var(--chalk); border:1px solid rgba(245,241,232,.35);}
.btn-ghost:hover{border-color:var(--amber); color:var(--amber);}
.btn-danger{background:var(--danger); color:#2A1210;}
.btn-sm{padding:6px 12px; font-size:13px;}
.btn:disabled{opacity:.4; cursor:not-allowed;}

.main{
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:32px 20px;
}

.card{
  background:var(--board);
  border-radius:var(--radius);
  padding:28px;
  box-shadow:var(--shadow);
  border:1px dashed rgba(245,241,232,.15);
}

.auth-card{width:100%; max-width:400px;}
.auth-card h1{
  font-family:'Kalam',cursive;
  font-size:30px;
  margin:0 0 4px;
}
.auth-card p.sub{color:var(--chalk-dim); margin:0 0 22px; font-size:14px;}

.field{margin-bottom:16px;}
.field label{display:block; font-size:13px; color:var(--chalk-dim); margin-bottom:6px;}
.field input, .field select{
  width:100%;
  padding:11px 12px;
  border-radius:8px;
  border:1px solid rgba(245,241,232,.25);
  background:var(--board-3);
  color:var(--chalk);
  font-size:14px;
  font-family:'Inter',sans-serif;
}
.field input:focus, .field select:focus{outline:2px solid var(--amber); outline-offset:1px;}

.role-toggle{display:flex; gap:8px; margin-bottom:18px;}
.role-toggle button{
  flex:1;
  padding:10px;
  border-radius:8px;
  border:1px solid rgba(245,241,232,.25);
  background:transparent;
  color:var(--chalk-dim);
  cursor:pointer;
  font-weight:600;
  font-size:14px;
}
.role-toggle button.active{border-color:var(--amber); color:var(--amber); background:rgba(232,185,74,.1);}

.switch-line{margin-top:16px; font-size:13px; color:var(--chalk-dim); text-align:center;}
.error-msg{
  background:rgba(226,102,75,.15);
  border:1px solid rgba(226,102,75,.4);
  color:#FFD2C6;
  padding:10px 12px;
  border-radius:8px;
  font-size:13px;
  margin-bottom:16px;
  display:none;
}
.error-msg.show{display:block;}

/* dashboard */
.dash{max-width:960px; margin:0 auto; width:100%; padding:36px 24px;}
.dash h1{font-family:'Kalam',cursive; font-size:28px; margin:0 0 6px;}
.dash p.sub{color:var(--chalk-dim); margin:0 0 28px;}

.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(260px,1fr));
  gap:18px;
}
.class-card{
  background:var(--board);
  border:1px dashed rgba(245,241,232,.25);
  border-radius:var(--radius);
  padding:20px;
  position:relative;
}
.class-card h3{font-family:'Kalam',cursive; font-size:20px; margin:0 0 8px;}
.class-card .code{
  display:inline-block;
  background:var(--board-3);
  color:var(--amber);
  padding:4px 10px;
  border-radius:6px;
  font-size:13px;
  letter-spacing:1px;
  margin-bottom:14px;
}
.class-card .meta{font-size:13px; color:var(--chalk-dim); margin-bottom:14px;}
.class-card .actions{display:flex; gap:8px;}

.new-class-form{
  display:flex;
  gap:10px;
  margin-bottom:28px;
  flex-wrap:wrap;
}
.new-class-form input{flex:1; min-width:200px;}

.empty{
  border:1px dashed rgba(245,241,232,.25);
  border-radius:var(--radius);
  padding:36px 20px;
  text-align:center;
  color:var(--chalk-dim);
}

/* classroom */
.classroom{
  display:grid;
  grid-template-columns:1fr 300px;
  gap:1px;
  flex:1;
  background:rgba(245,241,232,.1);
  min-height:0;
}
.stage{
  background:var(--board-3);
  display:flex;
  flex-direction:column;
  min-height:0;
}
.stage-tabs{
  display:flex;
  gap:6px;
  padding:10px 14px;
  border-bottom:1px dashed rgba(245,241,232,.15);
}
.stage-tabs button{
  background:transparent;
  border:1px solid rgba(245,241,232,.2);
  color:var(--chalk-dim);
  padding:6px 14px;
  border-radius:20px;
  font-size:13px;
  cursor:pointer;
}
.stage-tabs button.active{border-color:var(--amber); color:var(--amber);}

.stage-body{flex:1; position:relative; min-height:0;}
.video-view, .board-view, .chat-view{
  position:absolute; inset:0;
  display:none;
}
.video-view.active, .board-view.active, .chat-view.active{display:flex;}

.timer{
  background:var(--board-3);
  color:var(--amber);
  padding:4px 10px;
  border-radius:6px;
  font-size:13px;
}

.chat-view{flex-direction:column; padding:0;}
.chat-messages{
  flex:1; overflow-y:auto; padding:16px;
  display:flex; flex-direction:column; gap:10px;
}
.chat-msg{max-width:78%;}
.chat-msg .meta{font-size:11.5px; color:var(--chalk-dim); margin-bottom:2px;}
.chat-msg .bubble{
  background:var(--board);
  border:1px solid rgba(245,241,232,.15);
  border-radius:10px;
  padding:8px 12px;
  font-size:14px;
  line-height:1.4;
  word-break:break-word;
}
.chat-msg.mine{align-self:flex-end;}
.chat-msg.mine .bubble{background:rgba(232,185,74,.16); border-color:rgba(232,185,74,.4);}
.chat-msg.teacher .meta{color:var(--amber);}
.chat-empty{color:var(--chalk-dim); font-size:13px; text-align:center; margin:auto;}
.chat-input-row{
  display:flex; gap:10px;
  padding:12px 14px;
  border-top:1px dashed rgba(245,241,232,.15);
}
.chat-input-row input{
  flex:1;
  padding:10px 12px;
  border-radius:8px;
  border:1px solid rgba(245,241,232,.25);
  background:var(--board-3);
  color:var(--chalk);
  font-size:14px;
  font-family:'Inter',sans-serif;
}
.chat-input-row input:focus{outline:2px solid var(--amber); outline-offset:1px;}

.hand-icon{
  font-size:14px;
  animation:wave 1s infinite;
  cursor:pointer;
}
@keyframes wave{0%,100%{transform:rotate(0deg);}50%{transform:rotate(15deg);}}

.star-badge{
  font-size:11px;
  color:var(--amber);
  background:rgba(232,185,74,.12);
  border:1px solid rgba(232,185,74,.4);
  padding:1px 7px;
  border-radius:10px;
  cursor:default;
}
.star-give-btn{
  background:none; border:none; cursor:pointer;
  font-size:14px; padding:2px 4px; border-radius:6px;
}
.star-give-btn:hover{background:rgba(232,185,74,.15);}
.muted-tag{font-size:11px; color:var(--danger);}

.group-panel{border-top:1px dashed rgba(245,241,232,.15); padding:12px 12px 14px;}
.group-panel-header{display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;}
.group-panel-header h4{padding:0; border:none; font-size:15px;}
.group-row{
  display:flex; align-items:center; justify-content:space-between;
  padding:7px 8px; border-radius:8px; font-size:13px; margin-bottom:2px;
}
.group-row:hover{background:rgba(245,241,232,.05);}
.group-row.active-scope{background:rgba(232,185,74,.12); color:var(--amber);}
.group-actions{margin-top:8px;}
.empty-mini{color:var(--chalk-dim); font-size:12.5px; padding:6px 8px;}

.group-select{
  background:var(--board-3); color:var(--chalk);
  border:1px solid rgba(245,241,232,.25); border-radius:6px;
  font-size:11.5px; padding:3px 4px; max-width:110px;
}
.group-chip{
  font-size:11px; color:var(--chalk-dim);
  border:1px solid rgba(245,241,232,.25);
  padding:1px 7px; border-radius:10px;
}
.group-tag{
  background:rgba(232,185,74,.75);
  color:#20301F;
  font-size:10.5px;
  padding:1px 6px;
  border-radius:6px;
  font-weight:600;
}
.audio-join-btn.active{border-color:var(--ok); color:var(--ok); background:rgba(127,191,142,.12);}

/* ===== Modal cài đặt âm thanh ===== */
.modal-overlay{
  position:fixed; inset:0;
  background:rgba(0,0,0,.55);
  display:flex; align-items:center; justify-content:center;
  z-index:100;
  padding:20px;
}
.modal-box{
  background:var(--board);
  border:1px dashed rgba(245,241,232,.2);
  border-radius:var(--radius);
  box-shadow:var(--shadow);
  width:100%; max-width:440px;
  max-height:88vh;
  overflow-y:auto;
  padding:22px 24px;
}
.modal-header{
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:6px;
}
.modal-header h3{font-size:22px; margin:0;}

.settings-section{margin-top:20px;}
.settings-label{display:block; font-size:13px; color:var(--chalk-dim); margin-bottom:8px;}
.settings-row{display:flex; align-items:center; gap:10px; margin-bottom:10px;}
.settings-row input[type="range"]{flex:1; accent-color:var(--amber);}
.settings-select{
  flex:1;
  padding:9px 10px;
  border-radius:8px;
  border:1px solid rgba(245,241,232,.25);
  background:var(--board-3);
  color:var(--chalk);
  font-size:13.5px;
  font-family:'Inter',sans-serif;
}
.settings-toggle-row{
  display:flex; align-items:center; gap:9px;
  font-size:13.5px;
  padding:7px 0;
  cursor:pointer;
}
.settings-toggle-row input{accent-color:var(--amber); width:16px; height:16px;}
.settings-hint{color:var(--chalk-dim); font-size:12px;}

.meter-track{display:flex; gap:3px; align-items:flex-end; height:26px;}
.meter-bar{
  flex:1;
  height:100%;
  border-radius:2px;
  background:rgba(245,241,232,.15);
  transition:background .05s linear;
}
.meter-bar.active{background:var(--ok);}
.meter-bar.active:nth-last-child(-n+4){background:var(--amber);}
.video-view{padding:0;}
.video-grid{
  position:absolute;
  inset:14px;
  overflow:hidden;
}
.video-grid .video-tile.main-tile{
  width:360px;
}
.video-tile{
  position:absolute;
  width:230px;
  background:#111;
  border-radius:10px;
  overflow:hidden;
  aspect-ratio:16/9;
  cursor:grab;
  touch-action:none;
  box-shadow:0 6px 18px rgba(0,0,0,.35);
}
.video-tile:active{cursor:grabbing;}
.video-tile video{width:100%; height:100%; object-fit:cover;}
.video-tile.cam-off video{visibility:hidden;}
.video-tile .avatar-fallback{
  position:absolute; inset:0;
  display:none;
  align-items:center; justify-content:center;
  font-family:'Kalam',cursive;
  font-size:32px;
  color:var(--chalk-dim);
  background:var(--board-3);
}
.video-tile.cam-off .avatar-fallback{display:flex;}
.video-tile .label{
  position:absolute; left:8px; bottom:8px;
  background:rgba(0,0,0,.5);
  padding:3px 9px;
  border-radius:6px;
  font-size:12px;
  display:flex; align-items:center; gap:5px;
  z-index:2;
}
.video-tile .mic-indicator{font-size:11px;}
.video-empty{
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  color:var(--chalk-dim); font-size:14px; text-align:center; width:280px;
}

.board-text-input{
  position:absolute;
  background:transparent;
  border:1px dashed var(--amber);
  color:var(--chalk);
  font-family:'Inter',sans-serif;
  padding:2px 4px;
  outline:none;
  z-index:5;
  min-width:120px;
}

#board-canvas{
  width:100%; height:100%;
  background:
    linear-gradient(rgba(245,241,232,.03) 1px, transparent 1px) 0 0/100% 32px,
    var(--board);
  cursor:crosshair;
  touch-action:none;
}
.board-toolbar{
  position:absolute; top:14px; left:14px;
  display:flex; gap:8px; align-items:center;
  background:rgba(0,0,0,.35);
  padding:8px 10px;
  border-radius:10px;
  backdrop-filter:blur(4px);
}
.swatch{
  width:20px; height:20px; border-radius:50%;
  border:2px solid rgba(255,255,255,.4);
  cursor:pointer;
}
.swatch.selected{border-color:var(--amber);}

.tool-btn{
  width:32px; height:32px;
  border-radius:8px;
  border:1px solid transparent;
  background:transparent;
  color:var(--chalk);
  font-size:15px;
  cursor:pointer;
}
.tool-btn.active{border-color:var(--amber); background:rgba(232,185,74,.15);}
.toolbar-sep{width:1px; align-self:stretch; background:rgba(245,241,232,.2); margin:0 2px;}
.board-toolbar{flex-wrap:wrap; max-width:calc(100% - 28px);}

.board-hint{
  position:absolute; bottom:16px; left:50%; transform:translateX(-50%);
  background:rgba(0,0,0,.55);
  color:var(--chalk-dim);
  padding:8px 14px;
  border-radius:8px;
  font-size:12.5px;
  max-width:min(90%, 480px);
  text-align:center;
}

.btn-amber.off{background:var(--board-3); color:var(--chalk-dim); border:1px solid rgba(245,241,232,.25);}
.btn-ghost.raised{border-color:var(--amber); color:var(--amber); background:rgba(232,185,74,.12);}

.controls-bar{
  display:flex;
  gap:10px;
  padding:12px 14px;
  border-top:1px dashed rgba(245,241,232,.15);
  flex-wrap:wrap;
  align-items:center;
}
.controls-bar .spacer{flex:1;}
.rec-dot{
  width:9px;height:9px;border-radius:50%;background:var(--danger);
  display:inline-block; margin-right:6px;
  animation:pulse 1.2s infinite;
}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.3;}}

.sidebar{
  background:var(--board);
  display:flex;
  flex-direction:column;
  min-height:0;
}
.sidebar h4{
  font-family:'Kalam',cursive;
  margin:0; padding:14px 16px;
  border-bottom:1px dashed rgba(245,241,232,.15);
  font-size:16px;
}
.member-list{flex:1; overflow-y:auto; padding:10px 12px;}
.member-row{
  display:flex; align-items:center; justify-content:space-between;
  padding:9px 8px;
  border-radius:8px;
  font-size:13px;
  gap:8px;
  flex-wrap:wrap;
}
.member-row:hover{background:rgba(245,241,232,.05);}
.member-row .name{display:flex; align-items:center; gap:8px;}
.member-row .right-group{display:flex; align-items:center; gap:6px;}
.member-row .avatar{
  width:26px; height:26px; border-radius:50%;
  background:var(--board-3);
  display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; color:var(--amber);
}
.tag-teacher{color:var(--amber); font-size:11px; border:1px solid var(--amber); padding:1px 6px; border-radius:10px;}
.perm-toggle{
  width:34px; height:20px; border-radius:10px;
  background:rgba(245,241,232,.2);
  position:relative; cursor:pointer; border:none;
  flex-shrink:0;
}
.perm-toggle.on{background:var(--ok);}
.perm-toggle .knob{
  position:absolute; top:2px; left:2px;
  width:16px; height:16px; border-radius:50%;
  background:var(--chalk);
  transition:left .15s ease;
}
.perm-toggle.on .knob{left:16px;}

.room-info{padding:14px 16px; border-top:1px dashed rgba(245,241,232,.15); font-size:12px; color:var(--chalk-dim);}

@media (max-width: 860px){
  .classroom{grid-template-columns:1fr;}
  .sidebar{max-height:220px;}
}
