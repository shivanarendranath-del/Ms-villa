// ms-villa-app / js/app.js
//
// Core render engine (view router, back-button history handling), the
// "Chat with us" WhatsApp FAB, and every non-admin, non-auth screen: home,
// a room's attendance sheet, house instructions, duty roster, room
// expenses/ledger, rent info, complaints, and meetings. Also owns the
// generic [data-nav] click delegation, the periodic background sync
// against the shared data store, and app startup (init).
//
// Depends on globals from database.js (state, $, app, ICONS, IMAGES,
// helpers, storage functions) and calls into auth.js / admin.js /
// notifications.js for screens and actions those files own.

let lastPushedView = null;
function render(){
  // History integration so the device/browser back button and iOS swipe-back
  // navigate within the app instead of leaving it or doing nothing.
  if(state.view !== lastPushedView){
    try{
      history.pushState({view: state.view, roomId: state.roomId}, "", "#"+state.view);
    }catch(e){}
    lastPushedView = state.view;
  }
  saveViewState();
  renderView();
  renderChatFab();
}

// Remembers which screen the person was on so a page refresh (or reopening
// the PWA) lands back where they were instead of bouncing to Login. Only
// meaningful alongside "keep me logged in" — if there's no remembered
// session, init() always shows Login regardless of what's saved here.
const LAST_VIEW_KEY = "ms-villa:last-view";
function saveViewState(){
  try{
    if(state.view==="login" || state.view==="phoneLogin"){ localStorage.removeItem(LAST_VIEW_KEY); return; }
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify({ view: state.view, roomId: state.roomId }));
  }catch(e){}
}
function getSavedViewState(){
  try{
    const v = localStorage.getItem(LAST_VIEW_KEY);
    return v ? JSON.parse(v) : null;
  }catch(e){ return null; }
}

window.addEventListener("popstate", (e)=>{
  if(e.state && e.state.view){
    state.view = e.state.view;
    if(e.state.roomId) state.roomId = e.state.roomId;
  } else {
    state.view = state.session ? "home" : "login";
  }
  lastPushedView = state.view;
  saveViewState();
  renderView();
  renderChatFab();
});

function renderView(){
  if(state.view==="login") return renderLogin();
  if(state.view==="phoneLogin") return renderPhoneLogin();
  if(state.view==="home") return renderHome();
  if(state.view==="room") return renderRoom();
  if(state.view==="instructions") return renderInstructions();
  if(state.view==="settings") return renderSettings();
  if(state.view==="changepass") return renderChangePass();
  if(state.view==="duty") return renderDuty();
  if(state.view==="expenses") return renderExpenses();
  if(state.view==="dailyExpenses") return renderDailyExpenses();
  if(state.view==="rent") return renderRent();
  if(state.view==="complaints") return renderComplaints();
  if(state.view==="meetings") return renderMeetings();
  if(state.view==="roommates") return renderRoommates();
  if(state.view==="gallery") return renderGallery();
}

// Floating "Chat with us" button - shown on every screen once signed in.
// It hands off to WhatsApp using the support number set by an admin in Settings.
function renderChatFab(){
  let fab = document.getElementById("chat-fab");
  if(!state.session){ if(fab) fab.remove(); return; }
  if(!fab){
    fab = document.createElement("button");
    fab.id = "chat-fab";
    fab.className = "chat-fab";
    fab.title = "Chat with us";
    fab.innerHTML = ICONS.chat;
    document.body.appendChild(fab);
  }
  fab.onclick = ()=>{
    const num = (state.supportPhone||"").replace(/[^0-9]/g,"");
    if(num){
      window.open(`https://wa.me/${num}?text=${encodeURIComponent("Hi, I need help with Ms Villa.")}`, "_blank");
    } else {
      alert("No support WhatsApp number has been set yet. An admin can add one from Settings.");
    }
  };
}


function topbar(title, backView){
  const me = state.members.find(m=>m.username===state.session.username);
  return `
    <div class="topbar">
      <div class="back" data-nav="${backView}" style="cursor:pointer;">${backView? "&larr; Back" : ""}</div>
      <div class="who">Signed in as<br><b>${me.name}</b></div>
    </div>
  `;
}

function renderHome(){
  const duty = vesselDutyFor(todayKey());
  const dutyName = duty ? nameFor(duty, state.members) : "Unassigned";
  const tiles = state.rooms.map(r=>`
    <div class="room-tile" data-room="${r.id}" style="cursor:pointer;">
      ${ICONS[r.id]||""}
      <div class="name">${r.name}</div>
      <div class="count">${r.assigned.length} assigned</div>
    </div>
  `).join("");
  const quickLinks = [
    {id:"duty", name:"Duty Schedule"},
    {id:"expenses", name:"Room Expenses"},
    {id:"dailyExpenses", name:"Daily Expenses"},
    {id:"rent", name:"Rent & Pay"},
    {id:"complaints", name:"Complaints"},
    {id:"meetings", name:"Meetings"},
    {id:"roommates", name:"Roommates"},
    {id:"gallery", name:"Photos"}
  ];
  const quickTiles = quickLinks.map(q=>`
    <div class="quick-tile" data-nav2="${q.id}">${ICONS[q.id]}<div class="name">${q.name}</div></div>
  `).join("");

  const myRow = ledgerRowFor(state.session.username);
  let duesBlock;
  if(myRow){
    const balance = myRow.due - myRow.paid;
    const isDue = balance > 0;
    const isCredit = balance < 0;
    const pillClass = isDue ? "status-open" : "status-closed";
    const pillText = isDue ? "Due" : (isCredit ? "Credit" : "Completed");
    const amountText = isDue ? inr(balance) : (isCredit ? inr(Math.abs(balance)) : inr(0));
    duesBlock = `
      <div class="card dues-card">
        <div class="dues-top">
          <div class="dues-label">${state.ledger.month} Rent — ${myRow.name}</div>
          <span class="status-pill ${pillClass}">${pillText}</span>
        </div>
        <div class="dues-amount">${amountText}</div>
        <div class="dues-note">${myRow.status}</div>
        <button class="btn-primary" data-nav2="rent" style="margin-top:12px;">Pay Now</button>
      </div>
    `;
  } else {
    duesBlock = `
      <div class="card dues-card">
        <div class="dues-label">${state.ledger.month} Rent</div>
        <div class="dues-note" style="margin-top:6px;">No ledger entry found under your name yet — check with the admin.</div>
      </div>
    `;
  }

  app.innerHTML = `
    ${topbar("Ms Villa", null)}
    ${heroWrap("kitchen", `
      <div class="house-title">
        <h1>Ms Villa</h1>
        <div class="sub">Household Duties &amp; Attendance</div>
      </div>
    `)}
    <div class="duty-strip">
      <div class="lbl">Today's Vessel Cleaning Duty</div>
      <div class="name">${dutyName}</div>
      <div class="sub2">Cooking: ${cookingStaffFor(todayKey()).join(" & ")} · Water can: ${nameFor(state.waterDuty, state.members)}</div>
    </div>
    <div class="section-title">Payment Dues</div>
    ${duesBlock}
    <div class="section-title">Rooms</div>
    <div class="grid">${tiles}</div>
    <div class="section-title">Quick Links</div>
    <div class="grid">${quickTiles}</div>
    <div class="nav-row" style="margin-top:8px;">
      <button class="btn-line" data-nav2="instructions">House Rules</button>
      <button class="btn-line" data-nav2="settings">Settings</button>
    </div>
  `;
  app.querySelectorAll("[data-room]").forEach(el=>{
    el.onclick = ()=>{ state.roomId = el.getAttribute("data-room"); state.view="room"; render(); };
  });
  const nav2 = app.querySelectorAll("[data-nav2]");
  nav2.forEach(el=> el.onclick = ()=>{ state.view = el.getAttribute("data-nav2"); render(); });
}


async function renderRoom(){
  const room = state.rooms.find(r=>r.id===state.roomId);
  const date = todayKey();
  state.attendance[state.roomId] = await loadAttendance(state.roomId, date);
  const att = state.attendance[state.roomId];

  const rows = room.assigned.map(username=>{
    const m = state.members.find(x=>x.username===username) || {name:username};
    const rec = att[username];
    const present = rec && rec.present;
    const photo = rec && rec.photo;
    return `
      <div class="member-row">
        <div class="left">
          ${photo ? `<img class="avatar" src="${photo}">` : `<div class="avatar-empty">${(m.name||"?")[0]}</div>`}
          <div>
            <div class="name">${m.name}</div>
            <span class="status-pill ${present?'status-present':'status-pending'}">${present? 'Present · marked' : 'Not marked yet'}</span>
          </div>
        </div>
        <div>
          <input type="file" accept="image/*" capture="environment" id="file-${username}">
          <button class="cam-btn" data-mark="${username}">${present? 'Update' : 'Mark'}</button>
        </div>
      </div>
    `;
  }).join("") || `<div class="foot-note" style="padding:20px 0;">No one assigned to this room yet. Add members from the button below.</div>`;

  app.innerHTML = `
    ${topbar(room.name,"home")}
    ${heroWrap(imageForRoom(room.id), `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">${room.name}</h1>
        <div class="sub">${date}</div>
      </div>
    `)}
    <div class="info-block"><div class="lbl">About this room</div>${ROOM_NOTES[room.id]||""}</div>
    <div class="section-title">Assigned Members</div>
    <div class="card" style="padding:6px 18px;">
      ${rows}
    </div>
    <div class="nav-row">
      <button class="btn-line" id="edit-assign">Edit Assignment</button>
    </div>
  `;

  room.assigned.forEach(username=>{
    const btn = app.querySelector(`[data-mark="${username}"]`);
    const file = app.querySelector(`#file-${username}`);
    btn.onclick = ()=> file.click();
    file.onchange = async ()=>{
      const f = file.files[0];
      if(!f) return;
      btn.disabled = true; btn.textContent = "Uploading...";
      try{
        const photo = await readAndCompressImage(f);
        att[username] = { present:true, photo, time: new Date().toISOString() };
        const ok = await saveAttendance(state.roomId, date, att);
        if(!ok) alert("Couldn't save — check your connection and try again.");
      }catch(e){
        alert("That photo couldn't be processed. Try a different one.");
      }
      renderRoom();
    };
  });

  $("#edit-assign").onclick = ()=> openAssignModal(room);
}

function openAssignModal(room){
  const chips = state.members.map(m=>{
    const on = room.assigned.includes(m.username);
    return `<div class="chip ${on?'on':''}" data-chip="${m.username}">${m.name}</div>`;
  }).join("");
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `
    <div class="modal">
      <h3>Assign — ${room.name}</h3>
      <div class="chip-select">${chips}</div>
      <button class="btn-primary" id="save-assign">Save</button>
      <button class="btn-ghost" id="cancel-assign">Cancel</button>
    </div>
  `;
  document.body.appendChild(wrap);
  let selected = new Set(room.assigned);
  wrap.querySelectorAll("[data-chip]").forEach(chip=>{
    chip.onclick = ()=>{
      const u = chip.getAttribute("data-chip");
      if(selected.has(u)){ selected.delete(u); chip.classList.remove("on"); }
      else { selected.add(u); chip.classList.add("on"); }
    };
  });
  wrap.querySelector("#cancel-assign").onclick = ()=> wrap.remove();
  wrap.querySelector("#save-assign").onclick = async ()=>{
    room.assigned = Array.from(selected);
    await sset("ms-villa:rooms", state.rooms);
    wrap.remove();
    renderRoom();
  };
}


function renderInstructions(){
  const items = INSTRUCTIONS.map(t=>`<li>${t}</li>`).join("");
  app.innerHTML = `
    ${topbar("House Rules","home")}
    ${heroWrap("kitchen", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">House Rules</h1>
        <div class="sub">General Cleaning &amp; Maintenance</div>
      </div>
    `)}
    <div class="instr-list"><ol>${items}</ol></div>
    <div class="instr-note">Cleanliness is everyone's responsibility. Please complete your assigned duty on time and maintain the common areas as if they were your own.</div>
  `;
}

function renderDuty(){
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const todayDow = new Date().getDay();
  const today = todayKey();
  const hasVesselOverride = !!state.vesselOverrides[today];
  const hasCookingOverride = !!(state.cookingOverrides[today] && state.cookingOverrides[today].length);
  const rows = dayNames.map((dn, i)=>{
    const isToday = i===todayDow;
    const uname = isToday ? vesselDutyFor(today) : state.weeklyVesselDuty[i];
    const who = uname ? nameFor(uname, state.members) : "—";
    return `<div class="weekday-row ${isToday?'today':''}"><div class="day">${dn}</div><div class="who">${who}${isToday && hasVesselOverride ? ' (override)' : ''}</div></div>`;
  }).join("");
  const overrideNote = (hasVesselOverride || hasCookingOverride)
    ? `<div class="instr-note">An admin has set a today-only override for ${[hasVesselOverride?'vessel duty':null, hasCookingOverride?'cooking staff':null].filter(Boolean).join(" and ")}. The weekly schedule below is unaffected.</div>`
    : "";
  app.innerHTML = `
    ${topbar("Duty Schedule","home")}
    ${heroWrap("bedroomA", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Weekly Vessel Duty</h1>
        <div class="sub">Clean vessels on your day, before 12 PM</div>
      </div>
    `)}
    <div class="card" style="padding:6px 18px;">${rows}</div>
    ${overrideNote}
    <div class="section-title">Also Assigned (Default)</div>
    <div class="card">
      <div class="member-row"><div class="name">Cooking (today)</div><div class="tag">${cookingStaffFor(today).join(" & ")}</div></div>
      <div class="member-row"><div class="name">Water Can Refill</div><div class="tag">${nameFor(state.waterDuty, state.members)}</div></div>
    </div>
    <div class="instr-note">Every individual must clean the vessels on their assigned day itself, before 12 PM — or the next person's duty is affected.</div>
    ${(state.members.find(m=>m.username===state.session.username)||{}).admin ? `<div class="nav-row"><button class="btn-line" id="edit-duty" style="flex:1;">Edit Duty Assignments</button></div>` : ""}
  `;
  const editBtn = $("#edit-duty");
  if(editBtn) editBtn.onclick = ()=> openEditDutyModal();
}

function renderExpenses(){
  const me = state.members.find(m=>m.username===state.session.username);
  const ledger = state.ledger;
  const rows = ledger.rows.map(r=>`
    <tr>
      <td>${r.name}</td>
      <td class="num">${inr(r.due)}</td>
      <td class="num">${inr(r.paid)}</td>
      <td style="font-size:11px; color:var(--muted);">${r.status}</td>
    </tr>
  `).join("");
  const bills = ledger.bills.map(b=>`
    <div class="member-row"><div class="name">${b.label}</div><div class="tag">${inr(b.amount)}</div></div>
  `).join("");
  const totalDue = ledger.rows.reduce((s,r)=> s + Math.max(0, r.due - r.paid), 0);
  app.innerHTML = `
    ${topbar("Room Expenses","home")}
    ${heroWrap("kitchen", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Room Expenses</h1>
        <div class="sub">${ledger.month} Ledger</div>
      </div>
    `)}
    <div class="section-title">Payment Dues</div>
    <div class="card dues-card">
      <div class="dues-top">
        <div class="dues-label">Total Outstanding</div>
      </div>
      <div class="dues-amount">${inr(totalDue)}</div>
      <div class="dues-note">Across ${ledger.rows.filter(r=> r.due - r.paid > 0).length} member(s) with a pending balance this month.</div>
    </div>
    <div class="card" style="padding:14px 12px; overflow-x:auto;">
      <table class="ledger-table">
        <tr><th>Member</th><th>Due</th><th>Paid</th><th>Status</th></tr>
        ${rows}
      </table>
    </div>
    <div class="section-title">Shared Bills</div>
    <div class="card">
      ${bills}
      <div class="ledger-total"><span>Total Bills${ledger.totalBillsAuto ? ' <span style="font-weight:400; color:var(--muted); font-size:11px;">(auto)</span>' : ''}</span><b>${inr(effectiveTotalBills(ledger))}</b></div>
      <div class="ledger-total"><span>Remaining Balance${ledger.remainingAuto ? ' <span style="font-weight:400; color:var(--muted); font-size:11px;">(auto)</span>' : ''}</span><b>${inr(effectiveRemaining(ledger))}</b></div>
    </div>
    <div class="instr-note">${ledger.remainingNote}. Figures are transcribed from the handwritten monthly ledger — confirm with the admin if any amount looks unclear.</div>
    ${me.admin ? `<div class="nav-row"><button class="btn-line" id="edit-expenses" style="flex:1;">Edit Room Expenses</button></div>` : ""}
  `;
  const editBtn = $("#edit-expenses");
  if(editBtn) editBtn.onclick = ()=> openEditExpensesModal();
}

// Day-wise spending log, separate from the monthly Room Expenses ledger
// above. Anyone in the house (not just the admin) can add or edit an
// entry here — it's meant as a shared running log of day-to-day
// household spending (groceries, gas, quick repairs, etc.), grouped by
// the date each entry was logged under.
// Returns each member's net balance from the "split expenses" feature:
// positive = the house owes them money (they paid more than their share),
// negative = they owe the house. An entry with no splitAmong (added before
// this feature, or left as "everyone") is split across every current member.
function computeSplitBalances(entries, members){
  const paid = {}, owed = {};
  members.forEach(m=>{ paid[m.username]=0; owed[m.username]=0; });
  entries.forEach(e=>{
    const amt = Number(e.amount)||0;
    if(e.addedBy && paid[e.addedBy]!==undefined) paid[e.addedBy]+=amt;
    const group = (e.splitAmong && e.splitAmong.length) ? e.splitAmong : members.map(m=>m.username);
    const share = amt / group.length;
    group.forEach(u=>{ if(owed[u]!==undefined) owed[u]+=share; });
  });
  return members.map(m=>({ username:m.username, name:m.name, balance: Math.round((paid[m.username]-owed[m.username])*100)/100 }));
}

async function renderDailyExpenses(){
  const list = (state.dailyExpenses||[]).slice().sort((a,b)=>
    (b.date||"").localeCompare(a.date||"") || (b.id||"").localeCompare(a.id||"")
  );
  const monthKey = todayKey().slice(0,7);
  const monthEntries = dailyExpensesForMonth(list, monthKey);
  const monthTotal = sumDailyExpenses(monthEntries);
  const grandTotal = sumDailyExpenses(list);
  const balances = computeSplitBalances(monthEntries, state.members)
    .filter(b=> Math.abs(b.balance) >= 1)
    .sort((a,b)=> b.balance - a.balance);

  await preloadPhotos(list.map(e=>e.photoId));

  const groups = {};
  list.forEach(e=>{
    const d = e.date || "";
    if(!groups[d]) groups[d] = [];
    groups[d].push(e);
  });
  const dateKeys = Object.keys(groups).sort((a,b)=> b.localeCompare(a));

  const daysHtml = dateKeys.map(d=>{
    const entries = groups[d];
    const dayTotal = sumDailyExpenses(entries);
    const rows = entries.map(e=>{
      const photoSrc = e.photoId ? state.photoCache[e.photoId] : null;
      const splitLabel = (e.splitAmong && e.splitAmong.length && e.splitAmong.length !== state.members.length)
        ? `Split: ${e.splitAmong.map(u=>nameFor(u, state.members)).join(", ")}`
        : "Split: everyone";
      return `
      <div class="member-row">
        <div class="left">
          ${photoSrc ? `<img class="avatar" src="${photoSrc}" data-view-photo="${e.id}" style="cursor:pointer;">` : ""}
          <div>
            <div class="name">${e.note || "Expense"}</div>
            <div class="tag">${e.addedBy ? "Added by " + nameFor(e.addedBy, state.members) : ""} · ${splitLabel}</div>
          </div>
        </div>
        <div class="tag" style="font-size:14px; font-weight:700; color:var(--ink);">${inr(Number(e.amount)||0)}</div>
      </div>
    `;}).join("");
    return `
      <div class="card" style="padding:14px 16px 4px;">
        <div class="dues-top" style="margin-bottom:2px;">
          <div class="dues-label" style="text-transform:none; letter-spacing:0; font-size:13px; color:var(--ink); font-weight:700;">${formatDayLabel(d)}</div>
          <b style="font-family:'Cormorant Garamond',serif; font-style:italic; font-size:17px; color:var(--accent);">${inr(dayTotal)}</b>
        </div>
        ${rows}
      </div>
    `;
  }).join("") || `<div class="foot-note" style="padding:20px 0;">No expenses recorded yet. Anyone in the house can add one below.</div>`;

  const splitRows = balances.map(b=>`
    <div class="member-row">
      <div class="left"><div class="name">${b.name}</div></div>
      <div class="tag" style="font-size:14px; font-weight:700; color:${b.balance>=0?'var(--good)':'var(--danger)'};">
        ${b.balance>=0 ? `+${inr(b.balance)} (gets back)` : `${inr(b.balance)} (owes)`}
      </div>
    </div>
  `).join("") || `<div class="foot-note" style="padding:4px 0;">Everyone's even so far this month.</div>`;

  app.innerHTML = `
    ${topbar("Daily Expenses","home")}
    ${heroWrap("kitchen", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Daily Expenses</h1>
        <div class="sub">Day-wise spending log</div>
      </div>
    `)}
    <div class="section-title">This Month</div>
    <div class="card dues-card">
      <div class="dues-top">
        <div class="dues-label">Spent in ${monthKey}</div>
      </div>
      <div class="dues-amount">${inr(monthTotal)}</div>
      <div class="dues-note">All-time total: ${inr(grandTotal)}</div>
    </div>
    <div class="nav-row"><button class="btn-primary" id="add-daily-expense" style="flex:1;">+ Add Expense</button></div>
    <div class="section-title">Split Summary (This Month)</div>
    <div class="card" style="padding:6px 18px;">${splitRows}</div>
    <div class="foot-note" style="padding:4px 18px 0;">Based on who paid vs. who each expense was split between.</div>
    <div class="section-title">Day-wise Log</div>
    ${daysHtml}
    <div class="foot-note" style="padding:4px 18px 0;">Everyone in the house can add, edit, or remove entries here.</div>
  `;
  $("#add-daily-expense").onclick = ()=> openEditDailyExpensesModal();
  app.querySelectorAll("[data-view-photo]").forEach(el=>{
    el.onclick = ()=>{
      const id = el.getAttribute("data-view-photo");
      const entry = (state.dailyExpenses||[]).find(e=>e.id===id);
      const src = entry && entry.photoId ? state.photoCache[entry.photoId] : null;
      if(src) openPhotoLightbox(src);
    };
  });
}

// Simple full-screen preview for a stored receipt/complaint photo.
function openPhotoLightbox(src){
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `
    <div class="modal" style="padding:10px; text-align:center;">
      <img src="${src}" style="max-width:100%; max-height:70vh; border-radius:8px;">
      <button class="btn-ghost" id="photo-close" style="margin-top:12px;">Close</button>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.onclick = (e)=>{ if(e.target===wrap) wrap.remove(); };
  wrap.querySelector("#photo-close").onclick = ()=> wrap.remove();
}

// Open to every signed-in member (unlike the Room Expenses ledger, which
// is admin-only) since day-to-day spending is meant to be logged by
// whoever actually paid for something.
async function openEditDailyExpensesModal(){
  const draft = JSON.parse(JSON.stringify(state.dailyExpenses||[]));
  await preloadPhotos(draft.map(e=>e.photoId));
  const newPhotos = {}; // draft index -> freshly-picked base64, not yet uploaded
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  document.body.appendChild(wrap);

  function splitChips(e, i){
    const group = (e.splitAmong && e.splitAmong.length) ? e.splitAmong : state.members.map(m=>m.username);
    return state.members.map(m=>{
      const active = group.includes(m.username);
      return `<span data-split-chip="${i}" data-split-user="${m.username}" style="display:inline-block; padding:4px 10px; border-radius:14px; font-size:11px; margin:2px 4px 2px 0; cursor:pointer; border:1px solid ${active?'var(--accent)':'var(--line)'}; background:${active?'var(--panel-2)':'transparent'}; color:${active?'var(--ink)':'var(--muted)'};">${m.name}</span>`;
    }).join("");
  }

  function rowHtml(e, i){
    const thumb = newPhotos[i] || (e.photoId ? state.photoCache[e.photoId] : null);
    return `
      <div class="member-row" style="align-items:flex-start; flex-wrap:wrap; gap:8px 10px;">
        <input type="text" class="de-date" data-i="${i}" value="${e.date||''}" placeholder="YYYY-MM-DD" style="width:130px; margin-bottom:0;" onfocus="(this.type='date')">
        <input type="text" inputmode="numeric" class="de-amount" data-i="${i}" value="${e.amount||''}" placeholder="Amount" style="width:90px; margin-bottom:0;">
        <input type="text" class="de-note" data-i="${i}" value="${e.note||''}" placeholder="What was it for?" style="flex:1 1 100%; margin-bottom:0;">
        <div style="display:flex; align-items:center; gap:8px; flex:1 1 100%;">
          ${thumb ? `<img class="avatar" src="${thumb}" style="width:36px; height:36px;">` : ""}
          <input type="file" accept="image/*" capture="environment" class="de-photo-file" data-i="${i}" style="display:none;">
          <span data-add-photo="${i}" style="color:var(--accent); font-size:12px; cursor:pointer;">${thumb ? "Change photo" : "Add photo"}</span>
          ${thumb ? `<span data-remove-photo="${i}" style="color:var(--danger); font-size:12px; cursor:pointer;">Remove photo</span>` : ""}
          <span data-remove-exp="${i}" style="color:var(--danger); font-size:12px; cursor:pointer; margin-left:auto;">Remove entry</span>
        </div>
        <div style="flex:1 1 100%;">
          <div style="font-size:11px; color:var(--muted); margin-bottom:2px;">Split between</div>
          ${splitChips(e, i)}
        </div>
        <div style="flex:1 1 100%; border-bottom:1px solid var(--line); margin-top:4px;"></div>
      </div>
    `;
  }

  function renderModal(){
    wrap.innerHTML = `
      <div class="modal">
        <h3>Daily Expenses</h3>
        <div class="foot-note" style="text-align:left; padding:0 0 12px; margin:0;">Anyone in the house can add or edit an entry below. Tap names to change who an expense is split between.</div>
        ${draft.length ? draft.map(rowHtml).join("") : `<div class="foot-note" style="padding:0 0 12px; text-align:left; margin:0;">No entries yet — add your first one below.</div>`}
        <button type="button" class="btn-ghost" id="de-add-row" style="margin-top:2px;">+ Add Expense Row</button>
        <div class="error" id="de-err" style="display:none;"></div>
        <button class="btn-primary" id="de-save" style="margin-top:14px;">Save Changes</button>
        <button class="btn-ghost" id="de-cancel">Cancel</button>
      </div>
    `;

    wrap.querySelector("#de-cancel").onclick = ()=> wrap.remove();
    wrap.querySelector("#de-add-row").onclick = ()=>{
      draft.push({
        id: "de_" + Date.now() + Math.random().toString(36).slice(2,6),
        date: todayKey(),
        amount: 0,
        note: "",
        photoId: null,
        splitAmong: state.members.map(m=>m.username),
        addedBy: state.session.username
      });
      renderModal();
    };
    wrap.querySelectorAll("[data-remove-exp]").forEach(el=>{
      el.onclick = ()=>{ draft.splice(parseInt(el.getAttribute("data-remove-exp"),10),1); renderModal(); };
    });
    wrap.querySelectorAll("[data-remove-photo]").forEach(el=>{
      el.onclick = ()=>{
        const i = parseInt(el.getAttribute("data-remove-photo"),10);
        draft[i].photoId = null;
        delete newPhotos[i];
        renderModal();
      };
    });
    wrap.querySelectorAll("[data-add-photo]").forEach(el=>{
      el.onclick = ()=>{
        const i = el.getAttribute("data-add-photo");
        wrap.querySelector(`.de-photo-file[data-i="${i}"]`).click();
      };
    });
    wrap.querySelectorAll(".de-photo-file").forEach(fileInput=>{
      fileInput.onchange = async ()=>{
        const f = fileInput.files[0];
        if(!f) return;
        const i = parseInt(fileInput.getAttribute("data-i"),10);
        try{
          newPhotos[i] = await readAndCompressImage(f);
          renderModal();
        }catch(e){ alert("That photo couldn't be processed. Try a different one."); }
      };
    });
    wrap.querySelectorAll("[data-split-chip]").forEach(el=>{
      el.onclick = ()=>{
        const i = parseInt(el.getAttribute("data-split-chip"),10);
        const username = el.getAttribute("data-split-user");
        let group = (draft[i].splitAmong && draft[i].splitAmong.length) ? draft[i].splitAmong.slice() : state.members.map(m=>m.username);
        if(group.includes(username)){
          if(group.length>1) group = group.filter(u=>u!==username); // keep at least one person in the split
        } else {
          group.push(username);
        }
        draft[i].splitAmong = group;
        renderModal();
      };
    });

    wrap.querySelector("#de-save").onclick = async ()=>{
      const err = wrap.querySelector("#de-err");
      err.style.display = "none";

      wrap.querySelectorAll(".de-date").forEach(el=> draft[parseInt(el.getAttribute("data-i"),10)].date = el.value.trim());
      wrap.querySelectorAll(".de-amount").forEach(el=> draft[parseInt(el.getAttribute("data-i"),10)].amount = Number(el.value)||0);
      wrap.querySelectorAll(".de-note").forEach(el=> draft[parseInt(el.getAttribute("data-i"),10)].note = el.value.trim());

      if(draft.some(e=> !e.date)){ err.style.display="block"; err.textContent="Every entry needs a date."; return; }

      const btn = wrap.querySelector("#de-save");
      btn.disabled = true; btn.textContent = "Saving...";

      // Upload any newly-picked photos to their own keys first — the daily
      // expenses list itself should only ever hold short photoId strings,
      // never the base64 photo data, so it can't balloon past the shared
      // storage function's payload limit as entries pile up.
      for(const iStr of Object.keys(newPhotos)){
        const i = parseInt(iStr,10);
        const photoId = `expense_${draft[i].id}`;
        const photoOk = await savePhoto(photoId, newPhotos[i]);
        if(!photoOk){
          btn.disabled = false; btn.textContent = "Save Changes";
          err.style.display="block"; err.textContent="Couldn't upload a photo — check your connection and try again.";
          return;
        }
        state.photoCache[photoId] = newPhotos[i];
        draft[i].photoId = photoId;
      }

      state.dailyExpenses = draft;
      const ok = await sset("ms-villa:daily-expenses", state.dailyExpenses);
      btn.disabled = false; btn.textContent = "Save Changes";
      if(!ok){ err.style.display="block"; err.textContent="Couldn't save to the server — check your connection and try again."; return; }
      wrap.remove();
      renderDailyExpenses();
      notifyMembers("Daily expenses updated", `${nameFor(state.session.username, state.members)} added or edited an entry in the daily expenses log.`);
    };
  }

  renderModal();
}


function renderRent(){
  const upiLink = `upi://pay?pa=${encodeURIComponent(RENT_INFO.upiId)}&pn=${encodeURIComponent(RENT_INFO.payeeName)}&cu=INR`;
  app.innerHTML = `
    ${topbar("Rent & Pay","home")}
    ${heroWrap("living", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Room Rent</h1>
        <div class="sub">Pay via UPI</div>
      </div>
    `)}
    <div class="upi-box">
      <div>UPI ID</div>
      <div class="id">${RENT_INFO.upiId}</div>
    </div>
    <div class="pay-btn-row">
      <a class="pay-app-btn" href="${upiLink}"><b>PhonePe</b>Tap to pay</a>
      <a class="pay-app-btn" href="${upiLink}"><b>Google Pay</b>Tap to pay</a>
      <a class="pay-app-btn" href="${upiLink}"><b>Super Money</b>Tap to pay</a>
    </div>
    <div class="foot-note" style="margin-bottom:8px;">These buttons open your phone's UPI app chooser using the ID above. If nothing opens, copy the UPI ID into the app manually.</div>
    <div class="instr-note">Always keep a payment screenshot until your name is marked completed in the monthly ledger.</div>
  `;
}

async function renderComplaints(){
  const me = state.members.find(m=>m.username===state.session.username);
  const mine = state.complaints.slice().reverse();
  await preloadPhotos(mine.map(c=>c.photoId));
  const rows = mine.map(c=>{
    const photoSrc = c.photoId ? state.photoCache[c.photoId] : null;
    return `
    <div class="complaint-card">
      <div class="top">
        <div class="cat">${c.category}</div>
        <span class="status-pill ${c.status==='closed'?'status-closed':'status-open'}">${c.status==='closed'?'Resolved':'Open'}</span>
      </div>
      <div class="desc">${c.description}</div>
      ${photoSrc ? `<img src="${photoSrc}" data-view-photo="${c.id}" style="width:100%; max-width:220px; border-radius:8px; margin-top:8px; cursor:pointer; display:block;">` : ""}
      <div class="meta">${nameFor(c.username, state.members)} · ${new Date(c.createdAt).toLocaleDateString()} ${c.status!=='closed' && me.admin ? `<span data-close="${c.id}" style="color:var(--accent); cursor:pointer; margin-left:8px;">Mark resolved</span>` : ""}</div>
    </div>
  `;}).join("") || `<div class="foot-note" style="padding:20px 0;">No complaints raised yet.</div>`;

  app.innerHTML = `
    ${topbar("Complaints","home")}
    ${heroWrap("bedroomB", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Raise a Complaint</h1>
        <div class="sub">Maintenance &amp; Issues</div>
      </div>
    `)}
    <div class="nav-row"><button class="btn-primary" id="new-complaint">+ New Complaint</button></div>
    <div class="section-title">All Complaints</div>
    ${rows}
  `;
  $("#new-complaint").onclick = ()=> openComplaintModal();
  app.querySelectorAll("[data-close]").forEach(el=>{
    el.onclick = async ()=>{
      const id = el.getAttribute("data-close");
      const c = state.complaints.find(x=>x.id===id);
      if(c){ c.status="closed"; await sset("ms-villa:complaints", state.complaints); renderComplaints(); }
    };
  });
  app.querySelectorAll("[data-view-photo]").forEach(el=>{
    el.onclick = ()=>{
      const id = el.getAttribute("data-view-photo");
      const c = state.complaints.find(x=>x.id===id);
      const src = c && c.photoId ? state.photoCache[c.photoId] : null;
      if(src) openPhotoLightbox(src);
    };
  });
}

function openComplaintModal(){
  const cats = COMPLAINT_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join("");
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  let photoData = null;
  const complaintId = "c" + Date.now();
  wrap.innerHTML = `
    <div class="modal">
      <h3>New Complaint</h3>
      <label>Category</label>
      <select id="c-cat">${cats}</select>
      <label>Describe the issue</label>
      <textarea id="c-desc" placeholder="e.g. Washing machine drum not spinning, making loud noise"></textarea>
      <label>Photo (optional)</label>
      <div style="display:flex; align-items:center; gap:10px;">
        <input type="file" accept="image/*" capture="environment" id="c-photo-file" style="display:none;">
        <button type="button" class="btn-ghost" id="c-photo-btn" style="margin:0;">Add Photo</button>
        <img id="c-photo-preview" style="display:none; width:48px; height:48px; object-fit:cover; border-radius:8px;">
        <span id="c-photo-remove" style="display:none; color:var(--danger); font-size:12px; cursor:pointer;">Remove</span>
      </div>
      <div class="error" id="c-err" style="display:none;"></div>
      <button class="btn-primary" id="c-save" style="margin-top:14px;">Submit Complaint</button>
      <button class="btn-ghost" id="c-cancel">Cancel</button>
    </div>
  `;
  document.body.appendChild(wrap);
  const fileInput = wrap.querySelector("#c-photo-file");
  const preview = wrap.querySelector("#c-photo-preview");
  const removeBtn = wrap.querySelector("#c-photo-remove");
  wrap.querySelector("#c-photo-btn").onclick = ()=> fileInput.click();
  fileInput.onchange = async ()=>{
    const f = fileInput.files[0];
    if(!f) return;
    try{
      photoData = await readAndCompressImage(f);
      preview.src = photoData;
      preview.style.display = "block";
      removeBtn.style.display = "inline";
    }catch(e){ alert("That photo couldn't be processed. Try a different one."); }
  };
  removeBtn.onclick = ()=>{
    photoData = null;
    fileInput.value = "";
    preview.style.display = "none";
    removeBtn.style.display = "none";
  };
  wrap.querySelector("#c-cancel").onclick = ()=> wrap.remove();
  wrap.querySelector("#c-save").onclick = async ()=>{
    const desc = wrap.querySelector("#c-desc").value.trim();
    const err = wrap.querySelector("#c-err");
    err.style.display = "none";
    if(!desc){ err.style.display="block"; err.textContent="Please describe the issue."; return; }

    const btn = wrap.querySelector("#c-save");
    btn.disabled = true; btn.textContent = "Submitting...";

    // Photo (if any) is uploaded to its own key first — the complaints list
    // only ever stores the short photoId, never the base64 photo itself.
    let photoId = null;
    if(photoData){
      photoId = `complaint_${complaintId}`;
      const photoOk = await savePhoto(photoId, photoData);
      if(!photoOk){
        btn.disabled = false; btn.textContent = "Submit Complaint";
        err.style.display="block"; err.textContent="Couldn't upload the photo — check your connection and try again.";
        return;
      }
      state.photoCache[photoId] = photoData;
    }

    const complaint = {
      id: complaintId,
      username: state.session.username,
      category: wrap.querySelector("#c-cat").value,
      description: desc,
      photoId,
      status: "open",
      createdAt: new Date().toISOString()
    };
    state.complaints.push(complaint);
    const ok = await sset("ms-villa:complaints", state.complaints);
    btn.disabled = false; btn.textContent = "Submit Complaint";
    if(!ok){ err.style.display="block"; err.textContent="Couldn't save to the server — check your connection and try again."; state.complaints.pop(); return; }
    wrap.remove();
    renderComplaints();
    notifyMembers("New complaint raised", `${complaint.category}: ${complaint.description.slice(0,80)}`);
  };
}

function renderMeetings(){
  const me = state.members.find(m=>m.username===state.session.username);
  const now = Date.now();
  const sorted = [...state.meetings].sort((a,b)=> new Date(a.time) - new Date(b.time));
  const upcoming = sorted.filter(m=> !m.time || new Date(m.time).getTime() >= now - 60*60*1000);
  const past = sorted.filter(m=> m.time && new Date(m.time).getTime() < now - 60*60*1000);

  function card(m){
    const when = m.time ? new Date(m.time).toLocaleString([], {dateStyle:"medium", timeStyle:"short"}) : "No time set";
    return `
      <div class="meeting-card">
        <div class="top">
          <div>
            <div class="title">${m.title}</div>
            <div class="meta">${when}</div>
          </div>
          <span class="meeting-platform-pill">${m.platform}</span>
        </div>
        ${m.notes ? `<div class="meta" style="margin-top:6px;">${m.notes}</div>` : ""}
        <a class="join-btn" href="${m.link}" target="_blank" rel="noopener">Join ${m.platform}</a>
        ${me.admin ? `<span data-del-meeting="${m.id}" style="color:var(--danger); font-size:11px; margin-left:12px; cursor:pointer;">Remove</span>` : ""}
      </div>
    `;
  }

  app.innerHTML = `
    ${topbar("Meetings","home")}
    ${heroWrap("living", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Meetings</h1>
        <div class="sub">Zoom &amp; Google Meet links</div>
      </div>
    `)}
    ${me.admin ? `<div class="fab-add"><button class="btn-primary" id="add-meeting">+ Schedule a Meeting</button></div>` : ""}
    <div class="section-title">Upcoming</div>
    ${upcoming.length ? upcoming.map(card).join("") : `<div class="foot-note" style="padding:0 18px 18px;">No meetings scheduled yet.</div>`}
    ${past.length ? `<div class="section-title">Past</div>${past.map(card).join("")}` : ""}
  `;

  if(me.admin){
    $("#add-meeting").onclick = ()=> openMeetingModal();
    app.querySelectorAll("[data-del-meeting]").forEach(el=>{
      el.onclick = async ()=>{
        const id = el.getAttribute("data-del-meeting");
        state.meetings = state.meetings.filter(m=>m.id!==id);
        await sset("ms-villa:meetings", state.meetings);
        renderMeetings();
      };
    });
  }
}

function openMeetingModal(){
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `
    <div class="modal">
      <h3>Schedule a Meeting</h3>
      <label>Title</label>
      <input type="text" id="m-title" placeholder="e.g. Monthly house meeting">
      <label>Platform</label>
      <select id="m-platform">
        <option>Zoom</option>
        <option>Google Meet</option>
        <option>Microsoft Teams</option>
        <option>Other</option>
      </select>
      <label>Meeting link</label>
      <input type="text" id="m-link" placeholder="https://zoom.us/j/...">
      <label>Date &amp; time</label>
      <input type="text" id="m-time" placeholder="YYYY-MM-DDTHH:MM" onfocus="(this.type='datetime-local')">
      <label>Notes (optional)</label>
      <textarea id="m-notes" placeholder="Agenda, dial-in details, etc."></textarea>
      <div class="error" id="m-error" style="display:none;"></div>
      <button class="btn-primary" id="m-save">Save Meeting</button>
      <button class="btn-ghost" id="m-cancel">Cancel</button>
    </div>
  `;
  document.body.appendChild(wrap);
  $("#m-cancel").onclick = ()=> wrap.remove();
  $("#m-save").onclick = async ()=>{
    const title = $("#m-title").value.trim();
    const link = $("#m-link").value.trim();
    const err = $("#m-error");
    if(!title || !link){ err.style.display="block"; err.textContent="Title and link are required."; return; }
    const time = $("#m-time").value || null;
    state.meetings.push({
      id: "m_" + Date.now(),
      title,
      platform: $("#m-platform").value,
      link,
      time,
      notes: $("#m-notes").value.trim(),
      createdBy: state.session.username
    });
    await sset("ms-villa:meetings", state.meetings);
    wrap.remove();
    renderMeetings();
    notifyMembers(`Meeting scheduled: ${title}`, time ? `Starts ${time}` : "Check the Meetings tab for details.");
  };
}

// Simple house directory — a photo, name, and education line for every
// resident. Anyone signed in can view it; only an admin can edit a
// person's entry (photo/name/education), from an "Edit" link on each card.
async function renderRoommates(){
  const me = state.members.find(m=>m.username===state.session.username);
  await preloadPhotos(state.members.map(m=>m.photoId));
  const cards = state.members.map(m=>{
    const photoSrc = m.photoId ? state.photoCache[m.photoId] : null;
    return `
    <div class="roommate-card">
      ${photoSrc ? `<img class="roommate-photo" src="${photoSrc}">` : `<div class="roommate-photo-empty">${(m.name||"?")[0]}</div>`}
      <div class="roommate-name">${m.name}${m.admin ? ' <span style="color:var(--accent); font-size:10px;">(admin)</span>' : ''}</div>
      <div class="roommate-edu">${m.education || "Education not added yet"}</div>
      ${me.admin ? `<span class="roommate-edit" data-edit-roommate="${m.username}">Edit</span>` : ""}
    </div>
  `;}).join("");

  app.innerHTML = `
    ${topbar("Roommates","home")}
    ${heroWrap("living", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Roommates</h1>
        <div class="sub">Who lives at Ms Villa</div>
      </div>
    `)}
    <div class="roommate-grid">${cards}</div>
    <div class="foot-note" style="padding:16px 18px 0;">${me.admin ? "Tap Edit on a card to update someone's photo, name, or education." : "Only an admin can edit these details."}</div>
  `;

  if(me.admin){
    app.querySelectorAll("[data-edit-roommate]").forEach(el=>{
      el.onclick = ()=> openEditRoommateModal(el.getAttribute("data-edit-roommate"));
    });
  }
}

async function openEditRoommateModal(username){
  const member = state.members.find(m=>m.username===username);
  if(!member) return;
  // photoData holds a fresh base64 photo only while it's being picked/previewed
  // in this modal; on Save it's handed off to savePhoto() and only the short
  // photoId ever gets written into state.members.
  let photoData = member.photoId ? await loadPhoto(member.photoId) : null;
  let photoRemoved = false;

  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `
    <div class="modal">
      <h3>Edit — ${member.name}</h3>
      <label>Photo</label>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        ${photoData ? `<img id="rm-photo-preview" class="roommate-photo" src="${photoData}" style="width:56px; height:56px; margin:0;">` : `<div id="rm-photo-preview-empty" class="roommate-photo-empty" style="width:56px; height:56px; margin:0; font-size:18px;">${(member.name||"?")[0]}</div>`}
        <input type="file" accept="image/*" id="rm-photo-file" style="display:none;">
        <button type="button" class="btn-ghost" id="rm-photo-btn" style="margin:0; width:auto; padding:8px 12px;">Change Photo</button>
        ${photoData ? `<span id="rm-photo-remove" style="color:var(--danger); font-size:12px; cursor:pointer;">Remove</span>` : ""}
      </div>
      <label>Name</label>
      <input type="text" id="rm-name" value="${member.name}">
      <label>Education</label>
      <input type="text" id="rm-edu" placeholder="e.g. B.Tech, XYZ College" value="${member.education||""}">
      <div class="error" id="rm-err" style="display:none;"></div>
      <button class="btn-primary" id="rm-save">Save Changes</button>
      <button class="btn-ghost" id="rm-cancel">Cancel</button>
    </div>
  `;
  document.body.appendChild(wrap);

  function refreshPreview(){
    const holder = wrap.querySelector("#rm-photo-preview") || wrap.querySelector("#rm-photo-preview-empty");
    if(photoData){
      const img = document.createElement("img");
      img.id = "rm-photo-preview";
      img.className = "roommate-photo";
      img.src = photoData;
      img.style.cssText = "width:56px; height:56px; margin:0;";
      holder.replaceWith(img);
      if(!wrap.querySelector("#rm-photo-remove")){
        const rm = document.createElement("span");
        rm.id = "rm-photo-remove";
        rm.style.cssText = "color:var(--danger); font-size:12px; cursor:pointer;";
        rm.textContent = "Remove";
        wrap.querySelector("#rm-photo-btn").insertAdjacentElement("afterend", rm);
        wireRemove();
      }
    }
  }
  function wireRemove(){
    const rm = wrap.querySelector("#rm-photo-remove");
    if(rm) rm.onclick = ()=>{
      photoData = null;
      photoRemoved = true;
      const holder = wrap.querySelector("#rm-photo-preview");
      const div = document.createElement("div");
      div.id = "rm-photo-preview-empty";
      div.className = "roommate-photo-empty";
      div.style.cssText = "width:56px; height:56px; margin:0; font-size:18px;";
      div.textContent = (member.name||"?")[0];
      holder.replaceWith(div);
      rm.remove();
    };
  }
  wireRemove();

  wrap.querySelector("#rm-photo-btn").onclick = ()=> wrap.querySelector("#rm-photo-file").click();
  wrap.querySelector("#rm-photo-file").onchange = async ()=>{
    const f = wrap.querySelector("#rm-photo-file").files[0];
    if(!f) return;
    try{
      photoData = await readAndCompressImage(f);
      photoRemoved = false;
      refreshPreview();
    }catch(e){ alert("That photo couldn't be processed. Try a different one."); }
  };
  wrap.querySelector("#rm-cancel").onclick = ()=> wrap.remove();
  wrap.querySelector("#rm-save").onclick = async ()=>{
    const name = wrap.querySelector("#rm-name").value.trim();
    const edu = wrap.querySelector("#rm-edu").value.trim();
    const err = wrap.querySelector("#rm-err");
    err.style.display = "none";
    if(!name){ err.style.display="block"; err.textContent="Name can't be empty."; return; }

    const btn = wrap.querySelector("#rm-save");
    btn.disabled = true; btn.textContent = "Saving...";

    // A NEW photo was picked (photoData is fresh base64, not just the
    // preloaded existing one) — save it under its own key first, separately
    // from the members list, so the members list itself stays tiny.
    let photoId = member.photoId || null;
    const isNewPhoto = photoData && photoData !== state.photoCache[member.photoId];
    if(isNewPhoto){
      photoId = `roommate_${member.username}`;
      const photoOk = await savePhoto(photoId, photoData);
      if(!photoOk){
        btn.disabled = false; btn.textContent = "Save Changes";
        err.style.display="block"; err.textContent="Couldn't upload the photo — check your connection and try again.";
        return;
      }
      state.photoCache[photoId] = photoData;
    } else if(photoRemoved){
      photoId = null;
    }

    const prevName = member.name, prevEdu = member.education, prevPhotoId = member.photoId;
    member.name = name;
    member.education = edu;
    member.photoId = photoId;

    const ok = await sset("ms-villa:members", state.members);
    btn.disabled = false; btn.textContent = "Save Changes";
    if(!ok){
      member.name = prevName; member.education = prevEdu; member.photoId = prevPhotoId;
      err.style.display="block"; err.textContent="Couldn't save to the server — check your connection and try again.";
      return;
    }
    wrap.remove();
    renderRoommates();
  };
}

// A simple shared photo album for the house — anyone can upload, anyone can
// view, and (like complaints) only the uploader or an admin can delete one.
// Only a small metadata record is stored per photo (id/photoId/caption/etc);
// the actual image bytes live under their own key via savePhoto, same
// pattern as Roommates and Daily Expenses, so the gallery can grow without
// ever risking the shared storage payload limit.
async function renderGallery(){
  const me = state.members.find(m=>m.username===state.session.username);
  const items = (state.gallery||[]).slice().reverse();
  await preloadPhotos(items.map(p=>p.photoId));

  const grid = items.map(p=>{
    const src = state.photoCache[p.photoId];
    if(!src) return "";
    const canDelete = me.admin || p.uploadedBy===me.username;
    return `
      <div style="position:relative;">
        <img src="${src}" data-view-photo="${p.id}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px; cursor:pointer; display:block;">
        ${canDelete ? `<span data-delete-photo="${p.id}" style="position:absolute; top:6px; right:6px; background:rgba(22,39,63,.75); color:#fff; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; cursor:pointer;">✕</span>` : ""}
        ${p.caption ? `<div style="font-size:11px; color:var(--muted); margin-top:4px;">${p.caption}</div>` : ""}
      </div>
    `;
  }).join("");

  app.innerHTML = `
    ${topbar("Photos","home")}
    ${heroWrap("living", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Photos</h1>
        <div class="sub">Shared house album</div>
      </div>
    `)}
    <div class="nav-row"><button class="btn-primary" id="upload-photo" style="flex:1;">+ Upload Photo</button></div>
    <div class="roommate-grid" style="grid-template-columns:1fr 1fr; margin-top:4px;">
      ${grid || `<div class="foot-note" style="grid-column:1/-1; padding:16px 0;">No photos yet — be the first to add one.</div>`}
    </div>
  `;

  $("#upload-photo").onclick = ()=> openUploadPhotoModal();
  app.querySelectorAll("[data-view-photo]").forEach(el=>{
    el.onclick = ()=>{
      const id = el.getAttribute("data-view-photo");
      const p = items.find(x=>x.id===id);
      const src = p ? state.photoCache[p.photoId] : null;
      if(src) openPhotoLightbox(src);
    };
  });
  app.querySelectorAll("[data-delete-photo]").forEach(el=>{
    el.onclick = async (ev)=>{
      ev.stopPropagation();
      if(!confirm("Remove this photo for everyone?")) return;
      state.gallery = state.gallery.filter(p=>p.id!==el.getAttribute("data-delete-photo"));
      await sset("ms-villa:gallery", state.gallery);
      renderGallery();
    };
  });
}

function openUploadPhotoModal(){
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  let photoData = null;
  wrap.innerHTML = `
    <div class="modal">
      <h3>Upload Photo</h3>
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
        <input type="file" accept="image/*" capture="environment" id="gp-file" style="display:none;">
        <button type="button" class="btn-ghost" id="gp-btn" style="margin:0;">Choose Photo</button>
        <img id="gp-preview" style="display:none; width:56px; height:56px; object-fit:cover; border-radius:8px;">
      </div>
      <label>Caption (optional)</label>
      <input type="text" id="gp-caption" placeholder="e.g. New sofa in the living room">
      <div class="error" id="gp-err" style="display:none;"></div>
      <button class="btn-primary" id="gp-save" style="margin-top:14px;">Upload</button>
      <button class="btn-ghost" id="gp-cancel">Cancel</button>
    </div>
  `;
  document.body.appendChild(wrap);
  const fileInput = wrap.querySelector("#gp-file");
  const preview = wrap.querySelector("#gp-preview");
  wrap.querySelector("#gp-btn").onclick = ()=> fileInput.click();
  fileInput.onchange = async ()=>{
    const f = fileInput.files[0];
    if(!f) return;
    try{
      photoData = await readAndCompressImage(f, 900, 0.8);
      preview.src = photoData;
      preview.style.display = "block";
    }catch(e){ alert("That photo couldn't be processed. Try a different one."); }
  };
  wrap.querySelector("#gp-cancel").onclick = ()=> wrap.remove();
  wrap.querySelector("#gp-save").onclick = async ()=>{
    const err = wrap.querySelector("#gp-err");
    err.style.display = "none";
    if(!photoData){ err.style.display="block"; err.textContent="Choose a photo first."; return; }

    const btn = wrap.querySelector("#gp-save");
    btn.disabled = true; btn.textContent = "Uploading...";

    const id = "gp_" + Date.now();
    const photoId = `gallery_${id}`;
    const photoOk = await savePhoto(photoId, photoData);
    if(!photoOk){
      btn.disabled = false; btn.textContent = "Upload";
      err.style.display="block"; err.textContent="Couldn't upload the photo — check your connection and try again.";
      return;
    }
    state.photoCache[photoId] = photoData;

    state.gallery.push({
      id, photoId,
      caption: wrap.querySelector("#gp-caption").value.trim(),
      uploadedBy: state.session.username,
      createdAt: new Date().toISOString()
    });
    const ok = await sset("ms-villa:gallery", state.gallery);
    btn.disabled = false; btn.textContent = "Upload";
    if(!ok){
      state.gallery.pop();
      err.style.display="block"; err.textContent="Couldn't save to the server — check your connection and try again.";
      return;
    }
    wrap.remove();
    renderGallery();
    notifyMembers("New photo added", `${nameFor(state.session.username, state.members)} added a new photo to the album.`);
  };
}

function renderSettings(){
  const me = state.members.find(m=>m.username===state.session.username);
  const memberRows = state.members.map(m=>`
    <div class="member-row">
      <div class="left"><div class="avatar-empty">${m.name[0]}</div><div>
        <div class="name">${m.name}</div><div class="tag">${m.username}${m.admin? ' · admin':''}${m.phone? ' · '+m.phone : ''}</div>
      </div></div>
      ${me.admin ? `<span data-edit-phone="${m.username}" style="color:var(--accent); font-size:11px; cursor:pointer;">${m.phone? 'Edit phone' : 'Add phone'}</span>` : ""}
    </div>
  `).join("");
  app.innerHTML = `
    ${topbar("Settings","home")}
    ${heroWrap("living", `
      <div class="house-title" style="padding-top:0;">
        <h1 style="font-size:26px;">Settings</h1>
        <div class="sub">${me.name}</div>
      </div>
    `)}
    <div class="nav-row">
      <button class="btn-primary" id="go-changepass">Change Password</button>
    </div>
    <div class="section-title">Notifications</div>
    <div class="card">
      <div class="foot-note" style="margin:0 0 12px; text-align:left;" id="notif-status">${notificationStatusLabel()}</div>
      <button class="btn-line" id="toggle-notif" style="width:100%;">${notificationsEnabled() ? "Turn Off Notifications" : "Enable Notifications"}</button>
    </div>
    ${me.admin ? `
      <div class="section-title">All Members (${state.members.length}/15)</div>
      <div class="card" style="padding:6px 18px;">${memberRows}</div>
      <div class="nav-row"><button class="btn-line" id="add-member" style="flex:1;">Add Member</button></div>
      <div class="section-title">Send Announcement</div>
      <div class="card">
        <div class="foot-note" style="margin:0 0 10px; text-align:left;">Push a notification to every subscribed resident.</div>
        <label>Title</label>
        <input type="text" id="announce-title" placeholder="e.g. Water will be off tomorrow">
        <label>Message</label>
        <textarea id="announce-body" placeholder="Details for everyone..."></textarea>
        <div class="error" id="announce-err" style="display:none;"></div>
        <div class="msg" id="announce-msg" style="display:none;"></div>
        <button class="btn-primary" id="send-announce">Send to Everyone</button>
      </div>
      <div class="section-title">Support / Chat with us</div>
      <div class="card">
        <label>WhatsApp number for "Chat with us" (with country code)</label>
        <input type="text" id="support-phone" placeholder="+91 98765 43210" value="${state.supportPhone||''}">
        <button class="btn-primary" id="save-support">Save Number</button>
      </div>
    ` : ""}
    <div class="nav-row"><button class="btn-ghost" id="logout">Sign Out</button></div>
  `;
  $("#go-changepass").onclick = ()=>{ state.view="changepass"; render(); };
  $("#logout").onclick = ()=>{ state.session=null; forgetSession(); localStorage.removeItem(LAST_VIEW_KEY); state.view="login"; render(); };
  $("#toggle-notif").onclick = async ()=>{
    if(notificationsEnabled()){ await unsubscribeFromPush(); } else { await subscribeToPush(); }
    renderSettings();
  };
  if(me.admin){
    $("#add-member").onclick = ()=> openAddMemberModal();
    $("#send-announce").onclick = async ()=>{
      const title = $("#announce-title").value.trim();
      const body = $("#announce-body").value.trim();
      const err = $("#announce-err"), msg = $("#announce-msg");
      err.style.display="none"; msg.style.display="none";
      if(!title || !body){ err.style.display="block"; err.textContent="Please add both a title and a message."; return; }
      const btn = $("#send-announce");
      btn.disabled = true; btn.textContent = "Sending...";
      // Announcements go to everyone, including the admin sending it — pass
      // excludeUsername explicitly as null so notifyMembers' default
      // (excluding the sender) doesn't apply here.
      const result = await notifyMembers(title, body, { excludeUsername: null });
      btn.disabled = false; btn.textContent = "Send to Everyone";
      msg.style.display="block";
      if(!result){
        msg.textContent = "Sent, but couldn't confirm delivery (no response from server).";
      } else if(result.reason){
        msg.textContent = `Not delivered: ${result.reason}`;
      } else {
        msg.textContent = `Delivered to ${result.sent||0} of ${result.total||0} subscribed resident(s)${result.failed?` (${result.failed} failed)`:""}.`;
      }
      $("#announce-title").value = ""; $("#announce-body").value = "";
    };
    $("#save-support").onclick = async ()=>{
      state.supportPhone = $("#support-phone").value.trim();
      await sset("ms-villa:support-phone", state.supportPhone);
      renderChatFab();
      renderSettings();
    };
    app.querySelectorAll("[data-edit-phone]").forEach(el=>{
      el.onclick = async ()=>{
        const username = el.getAttribute("data-edit-phone");
        const m = state.members.find(x=>x.username===username);
        const phone = prompt(`Mobile number for ${m.name} (used for OTP sign-in):`, m.phone||"");
        if(phone===null) return;
        m.phone = phone.trim();
        await sset("ms-villa:members", state.members);
        renderSettings();
      };
    });
  }
}


document.addEventListener("click", (e)=>{
  const t = e.target.closest("[data-nav]");
  if(t && t.getAttribute("data-nav")){
    const target = t.getAttribute("data-nav");
    if(target==="home"){ state.view="home"; render(); }
    if(target==="settings"){ state.view="settings"; render(); }
    if(target==="login"){ state.view="login"; render(); }
    if(target==="phoneLogin"){ state.view="phoneLogin"; render(); }
  }
});

// Keeps everyone's data fresh without needing a manual refresh.
// The shared data function has no websocket/push support of its own for
// in-app state, so this polls it periodically and also re-syncs the moment
// the app regains focus
// (e.g. switching back from another app), which covers the common
// "admin changed something and I don't see it" case quickly.
let syncing = false;
async function syncNow(){
  if(syncing || !state.session) return;
  syncing = true;
  try{
    const before = JSON.stringify({
      members: state.members, meetings: state.meetings, ledger: state.ledger,
      cookingStaff: state.cookingStaff, waterDuty: state.waterDuty,
      weeklyVesselDuty: state.weeklyVesselDuty, supportPhone: state.supportPhone,
      vesselOverrides: state.vesselOverrides, cookingOverrides: state.cookingOverrides,
      complaints: state.complaints, dailyExpenses: state.dailyExpenses
    });
    await loadCore();
    const after = JSON.stringify({
      members: state.members, meetings: state.meetings, ledger: state.ledger,
      cookingStaff: state.cookingStaff, waterDuty: state.waterDuty,
      weeklyVesselDuty: state.weeklyVesselDuty, supportPhone: state.supportPhone,
      vesselOverrides: state.vesselOverrides, cookingOverrides: state.cookingOverrides,
      complaints: state.complaints, dailyExpenses: state.dailyExpenses
    });
    if(before !== after && state.view !== "room"){ renderView(); renderChatFab(); }
  }catch(e){ /* offline or storage hiccup - ignore and try again next tick */ }
  syncing = false;
}
setInterval(syncNow, 6000);
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) syncNow(); });
window.addEventListener("focus", syncNow);
window.addEventListener("online", syncNow);

(async function init(){
  await loadCore();
  const remembered = getRememberedSession();
  if(remembered && state.members.some(m=>m.username===remembered.username)){
    state.session = { username: remembered.username };
    const saved = getSavedViewState();
    const validViews = ["home","room","instructions","settings","changepass","duty","expenses","dailyExpenses","rent","complaints","meetings","roommates","gallery"];
    if(saved && validViews.includes(saved.view) && (saved.view!=="room" || state.rooms.some(r=>r.id===saved.roomId))){
      state.view = saved.view;
      state.roomId = saved.roomId || null;
    } else {
      state.view = "home";
    }
  }
  render();
  initNotifications();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}


