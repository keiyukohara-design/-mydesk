/* ============================================================
   @MYDESK 座席予約システム  プロトタイプ (localStorage版)
   ============================================================ */

const CURRENT_USER = "小原 圭雄";
const HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20]; // 8:00〜20:00

/* -------- 状態 -------- */
let selectedDate = new Date(2026,6,14); // 2026-07-14
let calMonth = new Date(2026,6,1);
let currentSeat = null;
let dragging = false, dragStart = null, dragDate = null;

/* -------- localStorage -------- */
const LS_SEAT = "mydesk_seat_res";
const LS_ROOM = "mydesk_room_res";
const loadSeatRes = ()=>JSON.parse(localStorage.getItem(LS_SEAT)||"[]");
const saveSeatRes = a=>localStorage.setItem(LS_SEAT,JSON.stringify(a));
const loadRoomRes = ()=>{
  const d = localStorage.getItem(LS_ROOM);
  if(d) return JSON.parse(d);
  // 初期デモデータ(画面イメージ準拠)
  const demo = [
    {id:"m1",room:"MTG-A",date:"2026-07-14",start:"14:20",end:"16:00",organizer:"菊地敦也",attendees:0,title:"日立DS（来社）",color:"#c0392b"},
    {id:"m2",room:"MTG-A",date:"2026-07-14",start:"16:00",end:"18:00",organizer:"小原 圭雄",attendees:0,title:"打合せ",color:"#16a085"},
    {id:"m3",room:"MTG-B",date:"2026-07-14",start:"14:00",end:"15:00",organizer:"今井",attendees:0,title:"打ち合わせ今井（AI活用の件）",color:"#7f8c8d"},
    {id:"m4",room:"MTG-B",date:"2026-07-14",start:"16:00",end:"18:00",organizer:"—",attendees:0,title:"シネマレイ：スマートエンジニア",color:"#1ba3d6"}
  ];
  localStorage.setItem(LS_ROOM,JSON.stringify(demo));
  return demo;
};
const saveRoomRes = a=>localStorage.setItem(LS_ROOM,JSON.stringify(a));

/* -------- 座席マスタ(神田フロア 近似座標) -------- */
// 画面イメージを基にした概略配置。x,y は viewBox 1000x620 内の座標
const SEATS = [];
function addRow(prefix, x, y, count, dx, occ={}){
  for(let i=0;i<count;i++){
    const id = prefix+"-"+(i+1);
    SEATS.push({id, sid:seatId(), x:x+dx*i, y, occ:occ[i]||null, locked:occ["lock"+i]||false});
  }
}
let _sc=90;
function seatId(){ _sc++; return "S"+String(_sc).padStart(5,"0"); }

// AT-1 (上段横一列)
addRow("AT1", 655, 210, 4, 62, {1:"渡邉"});
// AT&KMS 上段 (長机の上側 6席)
addRow("ATK-U", 585, 262, 6, 60, {});
// AT&KMS 下段 (6席) 今井=赤,小原=赤
addRow("ATK-D", 585, 322, 6, 60, {4:"今井",5:"小原"});
// AT-2 (右縦3席)
SEATS.push({id:"AT2-1",sid:seatId(),x:840,y:262,occ:null,locked:true});
SEATS.push({id:"AT2-2",sid:seatId(),x:840,y:315,occ:null,locked:true});
SEATS.push({id:"AT2-3",sid:seatId(),x:840,y:368,occ:null,locked:true});
// CR&KMS (会議島 6席) 菊地,樫山,柴田=青 / 牧迫=赤
SEATS.push({id:"CR-1",sid:seatId(),x:665,y:378,occ:null});
SEATS.push({id:"CR-2",sid:seatId(),x:735,y:378,occ:"菊地"});
SEATS.push({id:"CR-3",sid:seatId(),x:620,y:418,occ:"牧迫",red:true});
SEATS.push({id:"CR-4",sid:seatId(),x:735,y:418,occ:"樫山"});
SEATS.push({id:"CR-5",sid:seatId(),x:665,y:458,occ:null});
SEATS.push({id:"CR-6",sid:seatId(),x:735,y:458,occ:"柴田"});
// Meeting Room B 内 空き1
SEATS.push({id:"MB-1",sid:seatId(),x:360,y:360,occ:null});

/* 固定占有(他ユーザー)を予約データに反映(初期) */
(function seedOccupied(){
  const res = loadSeatRes();
  if(res.length) return;
  const today = "2026-07-14";
  SEATS.forEach(s=>{
    if(s.occ && s.occ!=="小原"){
      res.push({seatId:s.id, sid:s.sid, user:s.occ, date:today,
        start:"09:00", end:"18:00", status:(s.red?"利用中":"予約済")});
    }
    if(s.occ==="小原"||s.occ==="今井"){
      res.push({seatId:s.id, sid:s.sid, user:s.occ, date:today,
        start:"09:00", end:"18:00", status:"利用中"});
    }
  });
  saveSeatRes(res);
})();

/* ============================================================
   タイムライン
   ============================================================ */
function renderTimeline(){
  const track = document.getElementById("timelineTrack");
  track.innerHTML="";
  const hrs=[7,8,9,10,11,12,13,14,15,16,17,18,19,20];
  hrs.forEach((h,i)=>{
    const t=document.createElement("div");
    t.className="tl-tick"; t.style.left=(i/(hrs.length-1)*100)+"%";
    t.textContent=h; track.appendChild(t);
  });
  const now=new Date();
  let frac;
  if(now.getFullYear()===2026&&now.getMonth()===6&&now.getDate()===14){
    frac=(now.getHours()+now.getMinutes()/60-7)/(20-7);
  } else { frac=(15.3-7)/(20-7); }
  frac=Math.max(0,Math.min(1,frac));
  const pin=document.createElement("div");
  pin.className="tl-pin"; pin.style.left=(frac*100)+"%"; pin.textContent="📍";
  track.appendChild(pin);
}

/* ============================================================
   カレンダー
   ============================================================ */
function renderCalendar(){
  const el=document.getElementById("calendar");
  const y=calMonth.getFullYear(), m=calMonth.getMonth();
  const first=new Date(y,m,1), last=new Date(y,m+1,0);
  const dows=["日","月","火","水","木","金","土"];
  let html=`<div class="cal-nav"><button id="pm">◀</button>
    <span>${y}年 ${m+1}月</span><button id="nm">▶</button></div>
    <div class="cal-grid">`;
  dows.forEach((d,i)=>html+=`<div class="dow ${i===0?'sun':i===6?'sat':''}">${d}</div>`);
  for(let i=0;i<first.getDay();i++) html+=`<div></div>`;
  const today=new Date();
  for(let d=1;d<=last.getDate();d++){
    const date=new Date(y,m,d), dow=date.getDay();
    let cls="day";
    if(dow===0)cls+=" sun-bg"; if(dow===6)cls+=" sat-bg";
    if(date.toDateString()===today.toDateString())cls+=" today";
    if(date.toDateString()===selectedDate.toDateString())cls+=" selected";
    html+=`<div class="${cls}" data-d="${d}">${d}</div>`;
  }
  html+=`</div>`;
  el.innerHTML=html;
  el.querySelector("#pm").onclick=()=>{calMonth=new Date(y,m-1,1);renderCalendar();};
  el.querySelector("#nm").onclick=()=>{calMonth=new Date(y,m+1,1);renderCalendar();};
  el.querySelectorAll(".day").forEach(dd=>dd.onclick=()=>{
    selectedDate=new Date(y,m,parseInt(dd.dataset.d));
    renderCalendar(); renderMap(); renderRoomList(); renderRoomCalendar();
  });
}

/* ============================================================
   フロアマップ (SVG)
   ============================================================ */
const fmtDate = d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function seatState(seat){
  const dateStr=fmtDate(selectedDate);
  const res=loadSeatRes().filter(r=>r.seatId===seat.id && r.date===dateStr);
  if(res.some(r=>r.status==="利用中")) return {cls:"red", label:res.find(r=>r.status==="利用中").user};
  if(res.length) return {cls:"blue", label:res[0].user};
  return {cls:"gray", label:"空き"};
}

function renderMap(){
  const svg=document.getElementById("floormap");
  const rooms=`
    <rect x="10" y="10" width="980" height="600" fill="#fff" stroke="#ccc"/>
    <polygon points="360,60 700,60 700,470 560,470 560,880" fill="#f5efd6" opacity=".5"/>
    <rect x="540" y="60" width="450" height="550" fill="#dff0e6" opacity=".5"/>
    <rect x="820" y="470" width="170" height="140" fill="#f5e6c8" opacity=".6"/>
    <text x="230" y="150" class="room-label">Stock Room</text>
    <rect x="360" y="330" width="200" height="140" fill="#fff" stroke="#333"/>
    <text x="400" y="300" class="room-label">Meeting Room B</text>
    <text x="360" y="560" class="room-label">Meeting Room A</text>
    <rect x="440" y="430" width="230" height="120" fill="#bdbdbd"/>
    <text x="500" y="495" class="room-label" fill="#fff">server room</text>
    <rect x="480" y="380" width="150" height="22" fill="#333"/>
    <text x="520" y="396" class="room-label" fill="#fff" font-size="11">locker</text>
    <text x="530" y="590" class="room-label">entrance</text>
    <rect x="670" y="490" width="30" height="90" fill="#c0392b"/>
    <text x="678" y="540" fill="#fff" font-size="11" transform="rotate(90 685,535)">copy</text>
    <!-- zone frames -->
    <rect x="640" y="185" width="285" height="55" fill="none" stroke="#1ba3d6" stroke-dasharray="4 3"/>
    <text x="648" y="198" class="zone-label">AT-1</text>
    <rect x="565" y="245" width="360" height="110" fill="none" stroke="#1ba3d6" stroke-dasharray="4 3"/>
    <text x="573" y="258" class="zone-label">AT&amp;KMS</text>
    <rect x="815" y="245" width="90" height="150" fill="none" stroke="#1ba3d6" stroke-dasharray="4 3"/>
    <text x="823" y="258" class="zone-label">AT-2</text>
    <rect x="600" y="360" width="180" height="120" fill="none" stroke="#1ba3d6" stroke-dasharray="4 3"/>
    <text x="608" y="373" class="zone-label">CR&amp;KMS</text>
  `;
  let seats="";
  SEATS.forEach(s=>{
    const st=seatState(s);
    const fill = st.cls==="gray"?"#9aa0a6":st.cls==="blue"?"#1ba3d6":"#e8433f";
    seats+=`<g class="seat" data-id="${s.id}" data-sid="${s.sid}">
      <circle cx="${s.x}" cy="${s.y}" r="16" fill="${fill}"/>
      <text x="${s.x}" y="${s.y+4}" text-anchor="middle" fill="#fff">${st.label}</text>
      ${s.locked?`<text x="${s.x+14}" y="${s.y-12}" font-size="12">🔒</text>`:""}
    </g>`;
  });
  svg.innerHTML=rooms+seats;
  svg.querySelectorAll(".seat").forEach(g=>{
    g.addEventListener("dblclick",()=>openModal(g.dataset.id,g.dataset.sid));
  });
}

/* ============================================================
   座席予約モーダル
   ============================================================ */
function openModal(seatKey,sid){
  currentSeat={key:seatKey,sid};
  document.getElementById("modalSeatId").textContent=sid;
  document.getElementById("lastName").value="";
  document.getElementById("firstName").value="";
  buildModalGrid();
  document.getElementById("seatModal").classList.remove("hidden");
}
function closeModal(){document.getElementById("seatModal").classList.add("hidden");}

function buildModalGrid(){
  const table=document.getElementById("modalGrid");
  // header
  let thead=`<thead><tr><th>予約日付</th><th>時間帯指定</th>`;
  HOURS.forEach(h=>thead+=`<th>${h}:00</th>`);
  thead+=`</tr></thead>`;
  // 7日分（選択日から）
  let tbody="<tbody>";
  const base=new Date(selectedDate);
  const dows=["日","月","火","水","木","金","土"];
  for(let i=0;i<7;i++){
    const d=new Date(base); d.setDate(base.getDate()+i);
    const dow=d.getDay(), we=(dow===0||dow===6);
    const ds=fmtDate(d);
    tbody+=`<tr class="${we?'weekend':''}" data-date="${ds}">
      <td class="date-cell">${ds}(${dows[dow]})</td>
      <td class="band-cell">
        <label><input type="radio" name="band-${i}" data-band="午前">午前</label>
        <label><input type="radio" name="band-${i}" data-band="午後">午後</label>
        <label><input type="radio" name="band-${i}" data-band="終日">終日</label>
      </td>`;
    HOURS.forEach(h=>{
      const reserved=isSlotReserved(ds,h);
      tbody+=`<td><div class="slot ${reserved?'reserved':''}" data-date="${ds}" data-h="${h}"></div></td>`;
    });
    tbody+=`</tr>`;
  }
  tbody+="</tbody>";
  table.innerHTML=thead+tbody;
  attachDrag();
  attachBandRadios();
}

function isSlotReserved(ds,h){
  return loadSeatRes().some(r=>r.seatId===currentSeat.key && r.date===ds &&
    parseInt(r.start)<=h && h<parseInt(r.end));
}

/* --- ドラッグ選択 --- */
function attachDrag(){
  const slots=document.querySelectorAll("#modalGrid .slot:not(.reserved)");
  slots.forEach(sl=>{
    sl.addEventListener("mousedown",e=>{
      dragging=true; dragDate=sl.dataset.date; dragStart=parseInt(sl.dataset.h);
      clearRowSel(dragDate); sl.classList.add("sel"); e.preventDefault();
    });
    sl.addEventListener("mouseenter",()=>{
      if(!dragging||sl.dataset.date!==dragDate)return;
      const cur=parseInt(sl.dataset.h);
      const lo=Math.min(dragStart,cur), hi=Math.max(dragStart,cur);
      document.querySelectorAll(`#modalGrid .slot[data-date="${dragDate}"]`).forEach(s=>{
        const h=parseInt(s.dataset.h);
        s.classList.toggle("sel", h>=lo&&h<=hi && !s.classList.contains("reserved"));
      });
    });
  });
  document.addEventListener("mouseup",()=>{dragging=false;});
}
function clearRowSel(ds){
  document.querySelectorAll(`#modalGrid .slot[data-date="${ds}"]`).forEach(s=>s.classList.remove("sel"));
}
function attachBandRadios(){
  document.querySelectorAll('#modalGrid input[type=radio]').forEach(r=>{
    r.addEventListener("change",()=>{
      const tr=r.closest("tr"); const ds=tr.dataset.date; const band=r.dataset.band;
      clearRowSel(ds);
      let lo=8,hi=20;
      if(band==="午前"){lo=8;hi=11;} else if(band==="午後"){lo=13;hi=17;} else {lo=8;hi=20;}
      document.querySelectorAll(`#modalGrid .slot[data-date="${ds}"]`).forEach(s=>{
        const h=parseInt(s.dataset.h);
        if(h>=lo&&h<=hi && !s.classList.contains("reserved")) s.classList.add("sel");
      });
    });
  });
}

/* --- 予約確定 --- */
function doReserve(){
  const sel=[...document.querySelectorAll("#modalGrid .slot.sel")];
  if(!sel.length){toast("時間を選択してください");return;}
  const ln=document.getElementById("lastName").value.trim();
  const fn=document.getElementById("firstName").value.trim();
  const user=(ln||fn)?`${ln} ${fn}`.trim():CURRENT_USER;
  // 日付ごとにまとめる
  const byDate={};
  sel.forEach(s=>{(byDate[s.dataset.date]=byDate[s.dataset.date]||[]).push(parseInt(s.dataset.h));});
  const res=loadSeatRes();
  Object.entries(byDate).forEach(([ds,hs])=>{
    hs.sort((a,b)=>a-b);
    res.push({seatId:currentSeat.key, sid:currentSeat.sid, user, date:ds,
      start:String(hs[0]).padStart(2,"0")+":00",
      end:String(hs[hs.length-1]+1).padStart(2,"0")+":00",
      status:"予約済"});
  });
  saveSeatRes(res);
  closeModal(); renderMap();
  toast(`予約しました（${user}）。CHECK IN & OUT で利用開始できます`);
}

/* --- CHECK IN & OUT : 選択日の自分の予約をトグル --- */
function checkInOut(){
  const ds=fmtDate(selectedDate);
  const res=loadSeatRes();
  const mine=res.filter(r=>r.user===CURRENT_USER && r.date===ds);
  if(!mine.length){toast("本日のあなたの予約がありません。まず座席を予約してください");return;}
  const anyReserved=mine.some(r=>r.status==="予約済");
  mine.forEach(r=>r.status=anyReserved?"利用中":"予約済");
  saveSeatRes(res); renderMap();
  toast(anyReserved?"チェックインしました（利用中）":"チェックアウトしました");
}

/* ============================================================
   会議室 使用状況一覧
   ============================================================ */
function timeToMin(t){const[a,b]=t.split(":").map(Number);return a*60+b;}
function nowMin(){const n=new Date();return n.getHours()*60+n.getMinutes();}

function renderRoomList(){
  const ds=fmtDate(selectedDate);
  document.getElementById("roomlistDate").textContent=ds;
  const cont=document.getElementById("roomCards");
  const rooms=["MTG-A","MTG-B"];
  const names={"MTG-A":"MeetingRoomA","MTG-B":"MeetingRoomB"};
  const res=loadRoomRes().filter(r=>r.date===ds);
  cont.innerHTML="";
  rooms.forEach(rm=>{
    const evs=res.filter(r=>r.room===rm).sort((a,b)=>timeToMin(a.start)-timeToMin(b.start));
    const cur=evs.find(e=>timeToMin(e.start)<=nowMin()&&nowMin()<timeToMin(e.end));
    const next=evs.find(e=>timeToMin(e.start)>nowMin());
    let statusCls,timeTxt,person,title,att;
    if(cur){statusCls="busy";timeTxt=`${cur.start}〜${cur.end}`;person=cur.organizer;title=cur.title;att=cur.attendees;}
    else {statusCls="free";timeTxt=next?`${next.start}まで空き`:"本日空き";person="";title="";att="";}
    cont.innerHTML+=`
    <div class="room-card">
      <h3>${names[rm]}</h3>
      <div class="room-status ${statusCls}"></div>
      <div class="room-info">
        🕐 ${timeTxt}<br>
        👤 ${person||"—"} &nbsp; 👥 ${att!==""?att+"人":""}<br>
        📄 ${title||""}
      </div>
      <div class="room-btns">
        <button class="rbtn ${cur?'on':''}">入室</button>
        <button class="rbtn ${cur?'on':''}">退室</button>
        <button class="rbtn ${cur?'on':''}">延長</button>
        <button class="rbtn">予約<br>キャンセル</button>
        <button class="rbtn ${!cur?'on':''}">今すぐ<br>予約</button>
        <button class="rbtn">タイム<br>キーパー</button>
        <button class="rbtn">終了<br>依頼</button>
        <button class="rbtn on">🥤</button>
      </div>
    </div>`;
  });
}

/* ============================================================
   会議室 予約カレンダー
   ============================================================ */
function renderRoomCalendar(){
  const ds=fmtDate(selectedDate);
  const dows=["日","月","火","水","木","金","土"];
  document.getElementById("roomcalDate").textContent=
    `${selectedDate.getFullYear()}年 ${selectedDate.getMonth()+1}月 ${selectedDate.getDate()}日 (${dows[selectedDate.getDay()]})`;
  const el=document.getElementById("roomCalendar");
  const startH=8, endH=21, pxPerH=60;
  let timecol=`<div class="rc-timecol"><div class="rc-col-head">&nbsp;</div>`;
  for(let h=startH;h<endH;h++) timecol+=`<div class="rc-hour">${h}:00</div>`;
  timecol+=`</div>`;

  const res=loadRoomRes().filter(r=>r.date===ds);
  function trackHtml(rm,label){
    let ev="";
    res.filter(r=>r.room===rm).forEach(e=>{
      const top=(timeToMin(e.start)/60-startH)*pxPerH;
      const height=(timeToMin(e.end)-timeToMin(e.start))/60*pxPerH;
      ev+=`<div class="rc-event" style="top:${top}px;height:${height}px;background:${e.color}"
        title="会議名: ${e.title}&#10;開始: ${ds} ${e.start}&#10;終了: ${ds} ${e.end}">
        ${e.start} - ${e.end}<br><strong>${e.title}</strong></div>`;
    });
    let lines="";
    for(let h=startH;h<endH;h++) lines+=`<div class="rc-hourline"></div>`;
    return `<div><div class="rc-col-head">${label}</div><div class="rc-track">${lines}${ev}</div></div>`;
  }
  el.innerHTML=timecol+trackHtml("MTG-A","MTG-A")+trackHtml("MTG-B","MTG-B");
}

/* ============================================================
   ビュー切替
   ============================================================ */
function switchView(v){
  document.querySelectorAll(".view").forEach(s=>s.classList.add("hidden"));
  document.getElementById("view-"+v).classList.remove("hidden");
  if(v==="seat")renderMap();
  if(v==="roomlist")renderRoomList();
  if(v==="roomcal")renderRoomCalendar();
}

/* ============================================================
   Toast
   ============================================================ */
let toastEl;
function toast(msg){
  if(!toastEl){toastEl=document.createElement("div");toastEl.id="toast";document.body.appendChild(toastEl);}
  toastEl.textContent=msg; toastEl.classList.add("show");
  clearTimeout(toastEl._t); toastEl._t=setTimeout(()=>toastEl.classList.remove("show"),2600);
}

/* ============================================================
   イベント登録・初期化
   ============================================================ */
function init(){
  document.getElementById("userName").textContent=CURRENT_USER+" さん";
  renderTimeline(); renderCalendar(); renderMap(); renderRoomList(); renderRoomCalendar();

  document.getElementById("todayBtn").onclick=()=>{
    selectedDate=new Date(2026,6,14); calMonth=new Date(2026,6,1);
    renderCalendar();renderMap();renderRoomList();renderRoomCalendar();
  };
  document.getElementById("checkBtn").onclick=checkInOut;
  document.getElementById("modalClose").onclick=closeModal;
  document.getElementById("reserveBtn").onclick=doReserve;
  document.getElementById("clearName").onclick=()=>{
    document.getElementById("lastName").value="";document.getElementById("firstName").value="";
  };
  document.getElementById("seatModal").addEventListener("click",e=>{
    if(e.target.id==="seatModal")closeModal();
  });

  // zoom
  document.querySelectorAll(".zoom").forEach(b=>b.onclick=()=>{
    document.querySelectorAll(".zoom").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById("mapScale").style.transform=`scale(${b.dataset.z})`;
  });
  document.getElementById("mapScale").style.transform="scale(0.5)";

  // 単位タブ
  document.querySelectorAll(".unit").forEach(u=>u.onclick=()=>{
    document.querySelectorAll(".unit").forEach(x=>x.classList.remove("active"));u.classList.add("active");
  });

  // メニュー
  document.querySelectorAll("[data-view]").forEach(el=>{
    if(el.classList.contains("disabled"))return;
    el.onclick=()=>{
      document.querySelectorAll(".menu-item,.menu-sub").forEach(x=>x.classList.remove("active"));
      el.classList.add("active");
      switchView(el.dataset.view);
    };
  });

  // room calendar nav
  document.getElementById("calPrev").onclick=()=>{selectedDate.setDate(selectedDate.getDate()-1);refreshAll();};
  document.getElementById("calNext").onclick=()=>{selectedDate.setDate(selectedDate.getDate()+1);refreshAll();};
  document.getElementById("calToday").onclick=()=>{selectedDate=new Date(2026,6,14);refreshAll();};

  document.getElementById("logoutBtn").onclick=()=>toast("（プロトタイプ）ログアウトは未実装です");
}
function refreshAll(){renderCalendar();renderMap();renderRoomList();renderRoomCalendar();}

document.addEventListener("DOMContentLoaded",init);
