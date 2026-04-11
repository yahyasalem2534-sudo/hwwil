// ══════════════════════════════════════
// js/index.js — منطق الواجهة الرئيسية للعميل
// ══════════════════════════════════════

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, getDocs, where, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA4W0Rq_Rd7c7zmh-Vuw8YV9v4WDFCgoeI",
  authDomain:        "hawwil2.firebaseapp.com",
  projectId:         "hawwil2",
  storageBucket:     "hawwil2.firebasestorage.app",
  messagingSenderId: "350634992471",
  appId:             "1:350634992471:web:5c1da802f0bad15332715c"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

let BANKS = [];
let GAMES = [];
let selectedFrom = null;
let selectedTo   = null;
let selectedGame = null;
let selectedPkg  = null;
let activeOrderListener = null;
let currentUser = null;

window.currentImageBase64 = "";

// ── إرسال إشعار تليجرام السري (الاستشعار) ──
window.sendTelegramNotification = function(message) {
  const token = "8710007016:AAEYafJuYblld43Las00My1W5F5ymzNPxhQ";
  const chatId = "2109725437";
  const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`;
  fetch(url).catch(err => console.error("Telegram Notification Error", err));
};

// ── مراقب حالة تسجيل الدخول ──
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const loginBtn = document.getElementById('navLoginBtn');
  const profileBtn = document.getElementById('navProfileBtn');
  
  if (user) {
    if(loginBtn) loginBtn.style.display = 'none';
    if(profileBtn) profileBtn.style.display = 'inline-block';
    
    const emailLabel = document.getElementById('profileUserEmail');
    if(emailLabel) emailLabel.textContent = user.email;

    const authModal = document.getElementById('authModal');
    if(authModal) authModal.classList.remove('open');

    if(document.getElementById('page-profile') && document.getElementById('page-profile').classList.contains('active')) {
      window.loadUserOrders();
    }
  } else {
    if(loginBtn) loginBtn.style.display = 'inline-block';
    if(profileBtn) profileBtn.style.display = 'none';

    if(document.getElementById('page-profile') && document.getElementById('page-profile').classList.contains('active')) {
      window.showPage('home');
    }
  }
});

// ── دوال نافذة تسجيل الدخول ──
let authMode = 'login';
window.openAuthModal = () => document.getElementById('authModal').classList.add('open');
window.closeAuthModal = (e) => { if(!e || e.target.id === 'authModal') document.getElementById('authModal').classList.remove('open'); };

window.switchAuthMode = (mode) => {
  authMode = mode;
  document.getElementById('authLoginTab').classList.toggle('active', mode === 'login');
  document.getElementById('authRegisterTab').classList.toggle('active', mode === 'register');
  document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد';
  document.getElementById('authErrorMsg').style.display = 'none';
};

window.handleAuthEmail = async () => {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPass').value.trim();
  const errMsg = document.getElementById('authErrorMsg');
  const btn = document.getElementById('authSubmitBtn');

  if(!email || !pass) { errMsg.textContent = 'يرجى إدخال البريد وكلمة المرور'; errMsg.style.display = 'block'; return; }
  
  btn.disabled = true; btn.textContent = '⏳ جاري...';
  errMsg.style.display = 'none';

  try {
    if(authMode === 'login') {
      await signInWithEmailAndPassword(auth, email, pass);
      window.showToast('✅ تم تسجيل الدخول بنجاح');
    } else {
      await createUserWithEmailAndPassword(auth, email, pass);
      window.showToast('✅ تم إنشاء الحساب بنجاح');
    }
  } catch(e) {
    console.error(e);
    errMsg.textContent = '❌ ' + (e.code === 'auth/email-already-in-use' ? 'البريد مستخدم مسبقاً' : 'تأكد من صحة البيانات (كلمة المرور 6 أحرف على الأقل)');
    errMsg.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = authMode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد';
};

window.handleAuthGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    window.showToast('✅ تم الدخول بواسطة Google');
  } catch(e) {
    console.error(e);
    window.showToast('❌ حدث خطأ أثناء الدخول بحساب Google');
  }
};

window.logoutUser = async () => {
  try {
    await signOut(auth);
    window.showToast('👋 تم تسجيل الخروج');
  } catch(e) {
    console.error(e);
  }
};

// ── تحميل البيانات لحظياً ──
function loadContent() {
  onSnapshot(query(collection(db,'banks'), orderBy('order','asc')), snap => {
    BANKS = snap.docs.map(d => ({id:d.id, ...d.data()}));
    window.renderBanks('fromBanks','from');
    window.renderBanks('toBanks','to');
  });

  onSnapshot(query(collection(db,'games'), orderBy('order','asc')), snap => {
    GAMES = snap.docs.map(d => ({id:d.id, ...d.data()}));
    window.renderGamesList(GAMES.slice(0, 8), 'homeGamesGrid', 'لا توجد منتجات حالياً');
    if(document.getElementById('gamesOnlyGrid') || document.getElementById('servicesOnlyGrid')) {
      window.filterGames('all');
    }
    // تحديث النافذة إذا كانت مفتوحة
    if(selectedGame && document.getElementById('modal') && document.getElementById('modal').classList.contains('open')) {
      window.openModal(selectedGame.id);
    }
  });

  const savedOrder = localStorage.getItem('activeOrderId');
  if(savedOrder) {
    if(document.getElementById('orderIdInput')) document.getElementById('orderIdInput').value = savedOrder;
    window.trackLiveOrder(savedOrder);
  }
}

// ── معالجة وضغط الصور ──
window.handleImagePreview = function(event, type = 'transfer') {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width; let height = img.height;
        const MAX_SIZE = 800; 
        if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } 
        else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6); 
        window.currentImageBase64 = compressedBase64;
        
        const prefix = type === 'card' ? 'modal' : '';
        const previewImg = document.getElementById(prefix + 'ImgPreview');
        const previewCont = document.getElementById(prefix + 'ImagePreviewContainer');
        const placeholder = document.getElementById(prefix + 'UploadPlaceholder');
        
        if(previewImg) previewImg.src = compressedBase64;
        if(previewCont) previewCont.style.display = 'block';
        if(placeholder) placeholder.style.display = 'none';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
};

window.showPage = function(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  
  const pageEl = document.getElementById('page-'+name);
  if(pageEl) pageEl.classList.add('active');
  
  if(name === 'home') document.querySelectorAll('.nav-tab')[0]?.classList.add('active');
  if(name === 'transfer') document.querySelectorAll('.nav-tab')[1]?.classList.add('active');
  if(name === 'cards') document.querySelectorAll('.nav-tab')[2]?.classList.add('active');
  if(name === 'profile') {
    document.getElementById('navProfileBtn')?.classList.add('active');
    window.loadUserOrders(); 
  }
  
  window.scrollTo({top:0,behavior:'smooth'});
};

window.renderBanks = function(containerId, type){
  const container = document.getElementById(containerId);
  if(!container) return; 
  if(!BANKS.length) { container.innerHTML = '<p style="color:var(--mid);font-size:.85rem;padding:.5rem;width:100%;text-align:center">لا توجد بنوك متاحة حالياً.</p>'; return; }
  container.innerHTML = BANKS.map(b=>`
    <button class="bank-btn" id="${type}-${b.id}" onclick="selectBank('${type}','${b.id}')">
      <div class="bank-logo-wrap">
        ${b.logo ? `<img src="${b.logo}" alt="${b.name}" class="bank-logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><div class="bank-logo-fallback" style="display:none;background:${b.color||'#0A7C4E'}">${(b.name||'').substring(0,3)}</div>` : `<div class="bank-logo-fallback" style="background:${b.color||'#0A7C4E'}">${(b.name||'').substring(0,3)}</div>`}
      </div><div class="bank-name">${b.name}</div>
    </button>`).join('');
};

window.selectBank = function(type, id){
  BANKS.forEach(b=>{
    const el = document.getElementById(type+'-'+b.id);
    if(el) el.classList.remove('selected');
  });
  const selectedEl = document.getElementById(type+'-'+id);
  if(selectedEl) selectedEl.classList.add('selected');
  
  if(type==='from') selectedFrom=id; else selectedTo=id;
};

window.calcAmount = function(){
  const amtEl = document.getElementById('sendAmount'); const rateEl = document.getElementById('commRate');
  if(!amtEl || !rateEl) return;
  const amt  = parseFloat(amtEl.value)||0; const rate = parseFloat(rateEl.value)/100;
  const comm = amt*rate; const recv = amt-comm;
  const cSent = document.getElementById('calcSent');
  const cComm = document.getElementById('calcComm');
  const cRecv = document.getElementById('calcReceive');
  
  if(cSent) cSent.textContent = amt ? fmt(amt)+' أوقية':'—';
  if(cComm) cComm.textContent = amt ? '-'+fmt(comm)+' أوقية':'—';
  if(cRecv) cRecv.textContent = amt ? fmt(recv)+' أوقية':'—';
};

// ── إرسال التحويل البنكي ──
window.submitTransfer = async function(){
  if(!currentUser) {
    window.showToast('⚠️ يرجى تسجيل الدخول أولاً لإتمام التحويل');
    window.openAuthModal();
    return;
  }

  const name = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();
  const amount = parseFloat(document.getElementById('sendAmount').value)||0;
  const rate = parseFloat(document.getElementById('commRate').value);
  const account = document.getElementById('toAccount').value.trim();
  const notes = document.getElementById('notes').value.trim();
  
  if(!name || !phone || !amount || !selectedFrom || !selectedTo || !account){ window.showToast('⚠️ يرجى ملء جميع الحقول'); return; }
  if(selectedFrom === selectedTo){ window.showToast('⚠️ بنك الإرسال والاستلام لا يمكن أن يكونا نفس البنك'); return; }
  if(!window.currentImageBase64) { window.showToast('⚠️ يرجى إرفاق صورة الوصل (الدليل)'); return; }
  
  const comm = amount*rate/100; const recv = amount-comm;
  const ref  = 'HW-'+Math.floor(Math.random()*90000+10000);
  const btn  = document.querySelector('#page-transfer .submit-btn');
  
  if(btn) { btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...'; }
  
  try {
    const fb = BANKS.find(b=>b.id===selectedFrom); const tb = BANKS.find(b=>b.id===selectedTo);
    await addDoc(collection(db,'transfers'),{
      uid: currentUser.uid, 
      ref: ref, name: name, phone: phone, amount: amount, commRate: rate, commission: comm, receive: recv,
      fromBank: fb?.name||selectedFrom, toBank: tb?.name||selectedTo, account: account, notes: notes,
      image: window.currentImageBase64, status: 'pending', createdAt: serverTimestamp()
    });
    
    if(document.getElementById('successRef')) document.getElementById('successRef').textContent='رقم الطلب: #'+ref;
    if(document.getElementById('transferForm')) document.getElementById('transferForm').style.display='none';
    if(document.getElementById('successCard')) document.getElementById('successCard').style.display='block';
    
    window.showToast('✅ تم إرسال طلبك بنجاح!');
    
    // إرسال الإشعار لتليجرام
    const tMsg = `🔔 طلب تحويل بنكي جديد!\nالرقم: ${ref}\nالاسم: ${name}\nالمبلغ: ${fmt(amount)} أوقية\nمن: ${fb?.name||selectedFrom} ➡️ إلى: ${tb?.name||selectedTo}`;
    if(window.sendTelegramNotification) window.sendTelegramNotification(tMsg);
    
    localStorage.setItem('activeOrderId', ref);
    if(document.getElementById('orderIdInput')) document.getElementById('orderIdInput').value = ref;
    window.trackLiveOrder(ref);
    
  } catch(e){ console.error(e); window.showToast('❌ خطأ في الإرسال'); }
  if(btn) { btn.disabled = false; btn.textContent = '✅ إرسال طلب التحويل'; }
};

window.resetTransfer = function(){
  if(document.getElementById('transferForm')) document.getElementById('transferForm').style.display='block';
  if(document.getElementById('successCard')) document.getElementById('successCard').style.display='none';
  
  ['clientName','clientPhone','sendAmount','toAccount','notes'].forEach(id=>{ if(document.getElementById(id)) document.getElementById(id).value=''; });
  
  if(document.getElementById('calcSent')) document.getElementById('calcSent').textContent='—';
  if(document.getElementById('calcComm')) document.getElementById('calcComm').textContent='—';
  if(document.getElementById('calcReceive')) document.getElementById('calcReceive').textContent='—';
  
  selectedFrom=selectedTo=null; document.querySelectorAll('.bank-btn').forEach(b=>b.classList.remove('selected'));
  
  window.currentImageBase64 = "";
  if(document.getElementById('imgPreview')) document.getElementById('imgPreview').src = "#";
  if(document.getElementById('imagePreviewContainer')) document.getElementById('imagePreviewContainer').style.display = 'none';
  if(document.getElementById('uploadPlaceholder')) document.getElementById('uploadPlaceholder').style.display = 'block';
  if(document.getElementById('receiptImage')) document.getElementById('receiptImage').value = '';
};

// ── الألعاب ──
window.filterGames = function(provider, btnEl) {
  if(btnEl) { document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active')); btnEl.classList.add('active'); }
  let filtered = GAMES;
  if(provider && provider !== 'all') filtered = GAMES.filter(g => g.provider === provider);
  const gamesOnly = filtered.filter(g => g.productType === 'game' || !g.productType); 
  const servicesOnly = filtered.filter(g => g.productType === 'service');
  window.renderGamesList(gamesOnly, 'gamesOnlyGrid', '🎮 لا توجد ألعاب');
  window.renderGamesList(servicesOnly, 'servicesOnlyGrid', '💳 لا توجد بطاقات');
};

window.renderGamesList = function(list, containerId, emptyMsg) {
  const container = document.getElementById(containerId);
  if(!container) return;
  if(!list || !list.length) { container.innerHTML = `<p style="color:var(--mid);font-size:.85rem;padding:2rem;width:100%;text-align:center">${emptyMsg}</p>`; return; }
  container.innerHTML = list.map(g=>`
    <div class="game-card" onclick="openModal('${g.id}')">
      <div class="game-cover" style="background:${g.bg||'#1a1a2e'}">
        ${g.logo ? `<img src="${g.logo}" alt="${g.name}" class="game-cover-img" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px 12px 0 0;" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/><span style="display:none;font-size:3.5rem">${g.icon||'🎮'}</span>` : `<span style="font-size:3.5rem">${g.icon||'🎮'}</span>`}
        ${g.badge?`<div class="game-badge">${g.badge}</div>`:''}
      </div>
      <div class="game-body"><div class="game-name">${g.name}</div><div class="game-desc">${g.desc||''}</div>
        <div class="packages-grid">${(g.pkgs||[]).slice(0,3).map(p=>`<div class="pkg"><div class="pkg-amount">${p.amount}</div><div class="pkg-price">${fmt(p.price)} أوقية</div></div>`).join('')}</div>
      </div>
    </div>`).join('');
};

window.openModal = function(gameId){
  selectedGame = GAMES.find(g=>g.id===gameId); selectedPkg  = null; window.currentImageBase64 = ""; 
  if(!selectedGame) return;
  if(document.getElementById('modalTitle')) document.getElementById('modalTitle').textContent = selectedGame.name;
  if(document.getElementById('modalGameName')) document.getElementById('modalGameName').textContent = selectedGame.name;
  
  const iconEl = document.getElementById('modalIcon'); 
  if(iconEl) {
      iconEl.style.background = selectedGame.bg||'#1a1a2e';
      // 🎯 السطر المحدث لجعل الصورة تملأ مساحتها تماماً داخل النافذة المنبثقة
      iconEl.innerHTML = selectedGame.logo ? `<img src="${selectedGame.logo}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>` : `<span style="font-size:2.5rem">${selectedGame.icon||'🎮'}</span>`;
  }
  
  const playerIdInput = document.getElementById('modalPlayerId');
  if(playerIdInput) {
      playerIdInput.value = ''; 
      // إخفاء حقل (معرف اللاعب) للبطاقات/الخدمات فقط
      if(selectedGame.productType === 'service') {
          playerIdInput.parentElement.style.display = 'none';
      } else {
          playerIdInput.parentElement.style.display = 'block';
      }
  }

  if(document.getElementById('modalPhone')) document.getElementById('modalPhone').value=''; 
  if(document.getElementById('modalTotal')) document.getElementById('modalTotal').textContent='اختر باقة أولاً';
  
  if(document.getElementById('modalImgPreview')) document.getElementById('modalImgPreview').src = "#";
  if(document.getElementById('modalImagePreviewContainer')) document.getElementById('modalImagePreviewContainer').style.display = 'none';
  if(document.getElementById('modalUploadPlaceholder')) document.getElementById('modalUploadPlaceholder').style.display = 'block';
  if(document.getElementById('modalReceiptImage')) document.getElementById('modalReceiptImage').value = '';

  const pkgsCont = document.getElementById('modalPkgs');
  if(pkgsCont) {
      pkgsCont.innerHTML=(selectedGame.pkgs||[]).map((p,i)=>{
        return `
        <div class="modal-pkg" onclick="selectPkg(${i})">
          <div class="modal-pkg-amount">${p.amount}</div><div class="modal-pkg-price">${fmt(p.price)} أوقية</div>
        </div>`;
      }).join('');
  }
  const modal = document.getElementById('modal');
  if(modal) modal.classList.add('open');
};

window.selectPkg = function(i){
  selectedPkg = selectedGame.pkgs[i];
  document.querySelectorAll('.modal-pkg').forEach((el,idx)=>{ el.classList.toggle('active',idx===i); });
  if(document.getElementById('modalTotal')) document.getElementById('modalTotal').textContent=fmt(selectedPkg.price)+' أوقية';
};

window.closeModal = function(e){ 
    const modal = document.getElementById('modal');
    if(!e || e.target === modal) {
        if(modal) modal.classList.remove('open'); 
    }
};

// ── إرسال طلب البطاقة ──
window.submitCard = async function(){
  if(!currentUser) {
    window.showToast('⚠️ يرجى تسجيل الدخول أولاً لإتمام الشراء');
    window.openAuthModal();
    return;
  }

  const pid = document.getElementById('modalPlayerId') ? document.getElementById('modalPlayerId').value.trim() : '';
  const phone = document.getElementById('modalPhone') ? document.getElementById('modalPhone').value.trim() : '';
  
  if(!selectedPkg) { window.showToast('⚠️ اختر باقة أولاً'); return; }
  
  // التحقق من الحساب فقط إذا كان المنتج ليس "خدمة/بطاقة"
  if(selectedGame.productType !== 'service' && !pid) { window.showToast('⚠️ أدخل الحساب / معرف اللاعب'); return; }
  
  if(!phone) { window.showToast('⚠️ أدخل رقم هاتفك'); return; }
  if(!window.currentImageBase64) { window.showToast('⚠️ يرجى إرفاق صورة الوصل'); return; }

  const ref = 'CRD-'+Math.floor(Math.random()*90000+10000);
  const btn = document.querySelector('#modal .submit-btn');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...'; }

  try {
    await addDoc(collection(db,'cards'),{
      uid: currentUser.uid, 
      ref, game:selectedGame.name, gameId:selectedGame.id, package:selectedPkg.amount, price:selectedPkg.price,
      playerId:pid || 'غير مطلوب', phone, image: window.currentImageBase64, status:'pending', createdAt:serverTimestamp()
    });
    
    const modal = document.getElementById('modal');
    if(modal) modal.classList.remove('open');
    window.showToast('✅ تم إرسال طلبك بنجاح!');
    alert('✅ تم استلام طلبك بنجاح!\n\nرقم طلبك للتتبع هو: ' + ref);
    
    // إرسال الإشعار لتليجرام
    const tMsg = `🎮 طلب منتج رقمي جديد!\nالرقم: ${ref}\nالمنتج: ${selectedGame.name}\nالباقة: ${selectedPkg.amount}\nالسعر: ${fmt(selectedPkg.price)} أوقية\nالهاتف: ${phone}`;
    if(window.sendTelegramNotification) window.sendTelegramNotification(tMsg);
    
    localStorage.setItem('activeOrderId', ref);
    if(document.getElementById('orderIdInput')) document.getElementById('orderIdInput').value = ref;
    window.trackLiveOrder(ref);
    
    const pageProfile = document.getElementById('page-profile');
    if(pageProfile && pageProfile.classList.contains('active')) window.loadUserOrders();

  } catch(e){ console.error(e); window.showToast('❌ حدث خطأ، يرجى المحاولة لاحقاً'); }
  if(btn) { btn.disabled = false; btn.textContent = '✅ إرسال الطلب الآن'; }
};

// ── لوحة تحكم العميل ──
window.switchProfileTab = function(tab) {
  const tabTrans = document.getElementById('tabMyTransfers');
  const tabCards = document.getElementById('tabMyCards');
  const contTrans = document.getElementById('myTransfersContainer');
  const contCards = document.getElementById('myCardsContainer');
  
  if(tabTrans) tabTrans.classList.toggle('active', tab === 'transfers');
  if(tabCards) tabCards.classList.toggle('active', tab === 'cards');
  if(contTrans) contTrans.style.display = tab === 'transfers' ? 'block' : 'none';
  if(contCards) contCards.style.display = tab === 'cards' ? 'block' : 'none';
};

window.getStatusBadge = function(status) {
  if(status === 'done') return '<span class="order-status status-done">✅ مكتمل</span>';
  if(status === 'rejected') return '<span class="order-status status-rejected">❌ مرفوض</span>';
  return '<span class="order-status status-pending">⏳ قيد المراجعة</span>';
};

window.loadUserOrders = async function() {
  if(!currentUser) return;
  const transList = document.getElementById('myTransfersList');
  const cardsList = document.getElementById('myCardsList');
  
  if(transList) transList.innerHTML = '<p style="text-align:center; padding:2rem;">⏳ جاري جلب التحويلات...</p>';
  if(cardsList) cardsList.innerHTML = '<p style="text-align:center; padding:2rem;">⏳ جاري جلب البطاقات...</p>';

  try {
    const tQ = query(collection(db, 'transfers'), where('uid', '==', currentUser.uid));
    const tSnap = await getDocs(tQ);
    let transfers = tSnap.docs.map(d => d.data());
    transfers.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)); 

    if(transList) {
        if(transfers.length === 0) {
          transList.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--muted); background:var(--white); border-radius:12px; border:1px solid var(--sand);">لا توجد تحويلات سابقة.</p>';
        } else {
          transList.innerHTML = transfers.map(t => `
            <div class="order-card">
              <div class="order-card-header">
                <span class="order-ref">${t.ref}</span>
                ${window.getStatusBadge(t.status)}
              </div>
              <div style="font-size:0.9rem; margin-bottom:5px;"><strong>المبلغ المُرسل:</strong> ${fmt(t.amount)} أوقية</div>
              <div style="font-size:0.9rem; margin-bottom:5px;"><strong>من:</strong> ${t.fromBank} ➡️ <strong>إلى:</strong> ${t.toBank}</div>
              <div style="font-size:0.9rem; color:var(--green); font-weight:bold;"><strong>يستلم:</strong> ${fmt(t.receive)} أوقية</div>
            </div>
          `).join('');
        }
    }

    const cQ = query(collection(db, 'cards'), where('uid', '==', currentUser.uid));
    const cSnap = await getDocs(cQ);
    let cards = cSnap.docs.map(d => d.data());
    cards.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

    if(cardsList) {
        if(cards.length === 0) {
          cardsList.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--muted); background:var(--white); border-radius:12px; border:1px solid var(--sand);">لا توجد طلبات بطاقات سابقة.</p>';
        } else {
          cardsList.innerHTML = cards.map(c => {
            let codeHtml = '';
            if(c.status === 'done' && c.deliveredCode) {
              codeHtml = `
                <div style="background:var(--green-light); padding:10px; border-radius:8px; border:1.5px dashed var(--green); margin-top:10px;">
                  <div style="font-size:0.75rem; color:var(--mid); margin-bottom:3px;">كود الشحن / البطاقة:</div>
                  <div style="font-family:monospace; font-size:1.1rem; font-weight:900; color:var(--ink);">${c.deliveredCode}</div>
                  <button onclick="navigator.clipboard.writeText('${c.deliveredCode}').then(()=>window.showToast('📋 تم النسخ'))" style="background:var(--green); color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.75rem; margin-top:5px;">نسخ الكود</button>
                </div>
              `;
            }
            return `
            <div class="order-card">
              <div class="order-card-header">
                <span class="order-ref">${c.ref}</span>
                ${window.getStatusBadge(c.status)}
              </div>
              <div style="font-size:0.9rem; margin-bottom:5px;"><strong>المنتج:</strong> ${c.game} (${c.package})</div>
              <div style="font-size:0.9rem;"><strong>السعر:</strong> ${fmt(c.price)} أوقية</div>
              ${codeHtml}
            </div>
          `;
          }).join('');
        }
    }

  } catch(e) {
    console.error("خطأ في جلب الطلبات:", e);
    if(transList) transList.innerHTML = '<p style="color:red; text-align:center;">حدث خطأ في جلب البيانات</p>';
    if(cardsList) cardsList.innerHTML = '<p style="color:red; text-align:center;">حدث خطأ في جلب البيانات</p>';
  }
};

// ── التتبع اللحظي ──
window.trackLiveOrder = function(ref) {
  if(activeOrderListener) activeOrderListener();
  const col = ref.startsWith('HW') ? 'transfers' : 'cards';
  const res = document.getElementById('orderStatusResult');
  if(res) res.innerHTML = "⏳ جاري الاتصال المباشر بالطلب...";
  
  activeOrderListener = onSnapshot(query(collection(db, col), where("ref", "==", ref)), snap => {
    if(!res) return;
    if(snap.empty) {
      if(/^\d+$/.test(ref)) { window.trackLiveOrder('HW-'+ref); return; }
      res.innerHTML = "<div style='color:red'>❌ عذراً، لم نجد طلباً بهذا الرقم</div>"; return;
    }
    const data = snap.docs[0].data();
    if(data.status === 'done') {
       let html = `<div style="color:var(--green); font-size:1.1rem; margin-bottom:10px; font-weight:bold;">✅ تم اكتمال طلبك بنجاح!</div>`;
       if(data.deliveredCode) {
           html += `<div style="background:var(--green-light); padding:15px; border-radius:12px; border:2px dashed var(--green); display:inline-block; margin-top:10px;">
               <div style="font-size:0.85rem; color:var(--mid); margin-bottom:5px;">كود الشحن الخاص بك هو:</div>
               <div style="font-family:monospace; font-size:1.4rem; font-weight:900; color:var(--ink); margin-bottom:10px;">${data.deliveredCode}</div>
               <button onclick="navigator.clipboard.writeText('${data.deliveredCode}').then(()=>window.showToast('📋 تم النسخ'))" style="background:var(--green); color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-weight:bold; font-family:inherit;">📋 نسخ الكود</button>
           </div>`;
       }
       res.innerHTML = html;
       localStorage.removeItem('activeOrderId');
       if(activeOrderListener) { activeOrderListener(); activeOrderListener = null; }
    } else if(data.status === 'rejected') {
       res.innerHTML = `<div style="color:var(--red); font-weight:bold;">❌ عذراً، تم رفض الطلب. يرجى التواصل مع الدعم.</div>`;
    } else {
       res.innerHTML = `<div style="color:#D4A853; font-weight:bold;">⏳ طلبك قيد المراجعة... (سيتم تحديث هذه الخانة تلقائياً)</div>`;
    }
  });
};

window.checkOrderStatus = function() {
    const inputEl = document.getElementById('orderIdInput');
    if(!inputEl) return;
    let input = inputEl.value.trim().replace('#', '').toUpperCase();
    if(!input) { window.showToast('⚠️ يرجى إدخال رقم الطلب'); return; }
    window.trackLiveOrder(input);
};

function fmt(n){ return Number(n).toLocaleString('ar-MA'); }
window.showToast = function(msg){ 
    const t=document.getElementById('toast'); 
    if(!t) return; 
    t.textContent=msg; 
    t.classList.add('show'); 
    setTimeout(()=>t.classList.remove('show'),3000); 
};

// بدء التشغيل
loadContent();
