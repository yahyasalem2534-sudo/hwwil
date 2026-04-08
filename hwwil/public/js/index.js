// ══════════════════════════════════════
// js/index.js — منطق الواجهة الرئيسية للعميل
// ══════════════════════════════════════

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, getDocs, where, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

let BANKS = [];
let GAMES = [];
let STOCK = []; 
let selectedFrom = null;
let selectedTo   = null;
let selectedGame = null;
let selectedPkg  = null;
let activeOrderListener = null;

// المتغير المسؤول عن حفظ كود الصورة (الوصل)
window.currentImageBase64 = "";

// ── تحميل البيانات لحظياً (Real-time Auto Update) ──
function loadContent() {
  // التحديث اللحظي للبنوك
  onSnapshot(query(collection(db,'banks'), orderBy('order','asc')), snap => {
    BANKS = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderBanks('fromBanks','from');
    renderBanks('toBanks','to');
  });

  // التحديث اللحظي للألعاب
  onSnapshot(query(collection(db,'games'), orderBy('order','asc')), snap => {
    GAMES = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderGamesList(GAMES.slice(0, 8), 'homeGamesGrid', 'لا توجد منتجات حالياً');
    
    if(document.getElementById('gamesOnlyGrid') || document.getElementById('servicesOnlyGrid')) {
      window.filterGames('all');
    }
    
    // تحديث النافذة المفتوحة إذا طرأ تغيير على اللعبة
    if(selectedGame && document.getElementById('modal').classList.contains('open')) {
      window.openModal(selectedGame.id);
    }
  });

  // التحديث اللحظي للمخزون
  onSnapshot(query(collection(db,'stock'), where('status','==','available')), snap => {
    STOCK = snap.docs.map(d => d.data());
    
    // تحديث النافذة المفتوحة ليعرف العميل أن الكمية توفرت
    if(selectedGame && document.getElementById('modal').classList.contains('open')) {
      window.openModal(selectedGame.id);
    }
  });

  // تفعيل التتبع التلقائي إذا كان العميل يملك طلباً محفوظاً
  const savedOrder = localStorage.getItem('activeOrderId');
  if(savedOrder) {
    if(document.getElementById('orderIdInput')) {
      document.getElementById('orderIdInput').value = savedOrder;
    }
    window.trackLiveOrder(savedOrder);
  }
}

// ── 1. دالة معالجة وضغط الصور ──
window.handleImagePreview = function(event, type = 'transfer') {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800; // تصغير الأبعاد لتقليل الحجم
        
        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6); // ضغط الجودة
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
  document.getElementById('page-'+name).classList.add('active');
  const map={home:0,transfer:1,cards:2};
  document.querySelectorAll('.nav-tab')[map[name]]?.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
};

window.renderBanks = function(containerId, type){
  const container = document.getElementById(containerId);
  if(!container) return; 
  if(!BANKS.length) {
      container.innerHTML = '<p style="color:var(--mid);font-size:.85rem;padding:.5rem;width:100%;text-align:center">لا توجد بنوك متاحة حالياً. سيتم إضافتها قريباً.</p>';
      return;
  }
  container.innerHTML = BANKS.map(b=>`
    <button class="bank-btn" id="${type}-${b.id}" onclick="selectBank('${type}','${b.id}')">
      <div class="bank-logo-wrap">
        ${b.logo
          ? `<img src="${b.logo}" alt="${b.name}" class="bank-logo-img"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
             <div class="bank-logo-fallback" style="display:none;background:${b.color||'#0A7C4E'}">${(b.name||'').substring(0,3)}</div>`
          : `<div class="bank-logo-fallback" style="background:${b.color||'#0A7C4E'}">${(b.name||'').substring(0,3)}</div>`
        }
      </div>
      <div class="bank-name">${b.name}</div>
    </button>`).join('');
};

window.selectBank = function(type, id){
  BANKS.forEach(b=>document.getElementById(type+'-'+b.id)?.classList.remove('selected'));
  document.getElementById(type+'-'+id)?.classList.add('selected');
  if(type==='from') selectedFrom=id;
  else selectedTo=id;
};

window.calcAmount = function(){
  const amtEl = document.getElementById('sendAmount');
  const rateEl = document.getElementById('commRate');
  if(!amtEl || !rateEl) return;
  const amt  = parseFloat(amtEl.value)||0;
  const rate = parseFloat(rateEl.value)/100;
  const comm = amt*rate;
  const recv = amt-comm;
  document.getElementById('calcSent').textContent    = amt ? fmt(amt)+' أوقية':'—';
  document.getElementById('calcComm').textContent    = amt ? '-'+fmt(comm)+' أوقية':'—';
  document.getElementById('calcReceive').textContent = amt ? fmt(recv)+' أوقية':'—';
};

// ── 2. إرسال التحويل البنكي ──
window.submitTransfer = async function(){
  const name    = document.getElementById('clientName').value.trim();
  const phone   = document.getElementById('clientPhone').value.trim();
  const amount  = parseFloat(document.getElementById('sendAmount').value)||0;
  const rate    = parseFloat(document.getElementById('commRate').value);
  const account = document.getElementById('toAccount').value.trim();
  const notes   = document.getElementById('notes').value.trim();
  
  if(!name || !phone || !amount || !selectedFrom || !selectedTo || !account){
    showToast('⚠️ يرجى ملء جميع الحقول بما فيها رقم حساب المستلم'); return;
  }
  
  if(selectedFrom === selectedTo){ 
    showToast('⚠️ بنك الإرسال والاستلام لا يمكن أن يكونا نفس البنك'); return; 
  }
  
  if(!window.currentImageBase64) {
    showToast('⚠️ يرجى إرفاق صورة الوصل (الدليل)'); return;
  }
  
  const comm = amount*rate/100;
  const recv = amount-comm;
  const ref  = 'HW-'+Math.floor(Math.random()*90000+10000);
  const btn  = document.querySelector('#page-transfer .submit-btn');
  
  if(btn) { btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...'; }
  
  try {
    const fb = BANKS.find(b=>b.id===selectedFrom);
    const tb = BANKS.find(b=>b.id===selectedTo);
    
    await addDoc(collection(db,'transfers'),{
      ref: ref, 
      name: name, 
      phone: phone, 
      amount: amount, 
      commRate: rate, 
      commission: comm, 
      receive: recv,
      fromBank: fb?.name||selectedFrom, 
      toBank: tb?.name||selectedTo,
      account: account, 
      notes: notes,
      image: window.currentImageBase64,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    
    document.getElementById('successRef').textContent='رقم الطلب: #'+ref;
    document.getElementById('transferForm').style.display='none';
    document.getElementById('successCard').style.display='block';
    showToast('✅ تم إرسال طلبك بنجاح!');
    
    localStorage.setItem('activeOrderId', ref);
    if(document.getElementById('orderIdInput')) document.getElementById('orderIdInput').value = ref;
    window.trackLiveOrder(ref);
    
  } catch(e){ 
    console.error("خطأ في الإرسال:", e);
    showToast('❌ خطأ في الإرسال، حاول مجدداً'); 
  }
  
  if(btn) { btn.disabled = false; btn.textContent = '✅ إرسال طلب التحويل'; }
};

window.resetTransfer = function(){
  document.getElementById('transferForm').style.display='block';
  document.getElementById('successCard').style.display='none';
  
  ['clientName','clientPhone','sendAmount','toAccount','notes'].forEach(id=>{
    if(document.getElementById(id)) document.getElementById(id).value='';
  });
  
  document.getElementById('calcSent').textContent=
  document.getElementById('calcComm').textContent=
  document.getElementById('calcReceive').textContent='—';
  
  selectedFrom=selectedTo=null;
  document.querySelectorAll('.bank-btn').forEach(b=>b.classList.remove('selected'));
  
  window.currentImageBase64 = "";
  if(document.getElementById('imgPreview')) document.getElementById('imgPreview').src = "#";
  if(document.getElementById('imagePreviewContainer')) document.getElementById('imagePreviewContainer').style.display = 'none';
  if(document.getElementById('uploadPlaceholder')) document.getElementById('uploadPlaceholder').style.display = 'block';
  if(document.getElementById('receiptImage')) document.getElementById('receiptImage').value = '';
};

// ── 3. تصفية الألعاب والبطاقات ──
window.filterGames = function(provider, btnEl) {
  if(btnEl) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }
  
  let filtered = GAMES;
  if(provider && provider !== 'all') {
    filtered = GAMES.filter(g => g.provider === provider);
  }
  
  const gamesOnly = filtered.filter(g => g.productType === 'game' || !g.productType); 
  const servicesOnly = filtered.filter(g => g.productType === 'service');
  
  renderGamesList(gamesOnly, 'gamesOnlyGrid', '🎮 لا توجد ألعاب في هذا القسم حالياً');
  renderGamesList(servicesOnly, 'servicesOnlyGrid', '💳 لا توجد بطاقات/خدمات في هذا القسم حالياً');
};

function renderGamesList(list, containerId, emptyMsg) {
  const container = document.getElementById(containerId);
  if(!container) return;
  
  if(!list || !list.length) {
      container.innerHTML = `<p style="color:var(--mid);font-size:.85rem;padding:2rem;width:100%;text-align:center;background:#fff;border-radius:12px">${emptyMsg}</p>`;
      return;
  }
  
  container.innerHTML = list.map(g=>`
    <div class="game-card" onclick="openModal('${g.id}')">
      <div class="game-cover" style="background:${g.bg||'#1a1a2e'}">
        ${g.logo
          ? `<img src="${g.logo}" alt="${g.name}" class="game-cover-img"
               onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/>
             <span style="display:none;font-size:3.5rem">${g.icon||'🎮'}</span>`
          : `<span style="font-size:3.5rem">${g.icon||'🎮'}</span>`
        }
        ${g.badge?`<div class="game-badge">${g.badge}</div>`:''}
      </div>
      <div class="game-body">
        <div class="game-name">${g.name}</div>
        <div class="game-desc">${g.desc||''}</div>
        <div class="packages-grid">
          ${(g.pkgs||[]).slice(0,3).map(p=>`
            <div class="pkg"><div class="pkg-amount">${p.amount}</div>
            <div class="pkg-price">${fmt(p.price)} أوقية</div></div>`).join('')}
        </div>
      </div>
    </div>`).join('');
}

// ── 4. ربط المخزون ──
window.openModal = function(gameId){
  selectedGame = GAMES.find(g=>g.id===gameId);
  selectedPkg  = null;
  window.currentImageBase64 = ""; 
  
  if(!selectedGame) return;
  document.getElementById('modalTitle').textContent    = selectedGame.name;
  document.getElementById('modalGameName').textContent = selectedGame.name;
  const iconEl = document.getElementById('modalIcon');
  iconEl.style.background = selectedGame.bg||'#1a1a2e';
  iconEl.innerHTML = selectedGame.logo
    ? `<img src="${selectedGame.logo}" style="width:50px;height:50px;object-fit:contain;border-radius:8px"
         onerror="this.outerHTML='<span style=font-size:2.5rem>${selectedGame.icon||'🎮'}</span>'"/>`
    : `<span style="font-size:2.5rem">${selectedGame.icon||'🎮'}</span>`;
  document.getElementById('modalPlayerId').value='';
  document.getElementById('modalPhone').value='';
  document.getElementById('modalTotal').textContent='اختر باقة أولاً';
  
  if(document.getElementById('modalImgPreview')) document.getElementById('modalImgPreview').src = "#";
  if(document.getElementById('modalImagePreviewContainer')) document.getElementById('modalImagePreviewContainer').style.display = 'none';
  if(document.getElementById('modalUploadPlaceholder')) document.getElementById('modalUploadPlaceholder').style.display = 'block';
  if(document.getElementById('modalReceiptImage')) document.getElementById('modalReceiptImage').value = '';

  document.getElementById('modalPkgs').innerHTML=(selectedGame.pkgs||[]).map((p,i)=>{
    const available = STOCK.filter(s => {
      const matchCategory = s.category && (
        s.category.trim().toLowerCase() === (selectedGame.provider || '').trim().toLowerCase() ||
        s.category.trim().toLowerCase() === selectedGame.name.trim().toLowerCase()
      );
      const matchValue = s.value && s.value.trim().toLowerCase() === p.amount.trim().toLowerCase();
      return matchCategory && matchValue;
    }).length;

    const isOutOfStock = available === 0;
    
    return `
    <div class="modal-pkg ${isOutOfStock ? 'out-of-stock' : ''}" ${!isOutOfStock ? `onclick="selectPkg(${i})"` : ''} style="${isOutOfStock ? 'opacity:0.5; cursor:not-allowed; border-color:var(--red);' : ''}">
      <div class="modal-pkg-amount">${p.amount}</div>
      <div class="modal-pkg-price">${fmt(p.price)} أوقية</div>
      ${isOutOfStock 
        ? '<div style="font-size:.7rem; color:var(--red); font-weight:bold; margin-top:5px;">❌ نفدت الكمية</div>' 
        : `<div style="font-size:.7rem; color:var(--green); font-weight:bold; margin-top:5px;">✅ متوفر: ${available}</div>`
      }
    </div>`;
  }).join('');
  
  document.getElementById('modal').classList.add('open');
};

window.selectPkg = function(i){
  selectedPkg = selectedGame.pkgs[i];
  document.querySelectorAll('.modal-pkg').forEach((el,idx)=>{
    if(!el.classList.contains('out-of-stock')) {
      el.classList.toggle('active',idx===i);
    }
  });
  document.getElementById('modalTotal').textContent=fmt(selectedPkg.price)+' أوقية';
};

window.closeModal = function(e){
  if(!e||e.target===document.getElementById('modal'))
    document.getElementById('modal').classList.remove('open');
};

// ── 5. إرسال البطاقة وتفعيل التتبع ──
window.submitCard = async function(){
  const pid   = document.getElementById('modalPlayerId').value.trim();
  const phone = document.getElementById('modalPhone').value.trim();
  
  if(!selectedPkg) { showToast('⚠️ اختر باقة أولاً'); return; }
  
  if(selectedGame.productType !== 'service' && !pid) { 
    showToast('⚠️ أدخل الحساب / معرف اللاعب'); return; 
  }
  
  if(!phone)       { showToast('⚠️ أدخل رقم هاتفك'); return; }
  if(!window.currentImageBase64) { showToast('⚠️ يرجى إرفاق صورة الوصل'); return; }

  const ref = 'CRD-'+Math.floor(Math.random()*90000+10000);
  const btn = document.querySelector('#modal .submit-btn');
  
  if(btn) { btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...'; }

  try {
    await addDoc(collection(db,'cards'),{
      ref,
      game:selectedGame.name,
      gameId:selectedGame.id,
      package:selectedPkg.amount,
      price:selectedPkg.price,
      playerId:pid || 'غير مطلوب',
      phone,
      image: window.currentImageBase64,
      status:'pending',
      createdAt:serverTimestamp()
    });
    
    document.getElementById('modal').classList.remove('open');
    showToast('✅ تم إرسال طلبك بنجاح!');
    alert('✅ تم استلام طلبك بنجاح!\n\nرقم طلبك للتتبع هو: ' + ref);
    
    // تفعيل التتبع الآلي
    localStorage.setItem('activeOrderId', ref);
    if(document.getElementById('orderIdInput')) document.getElementById('orderIdInput').value = ref;
    window.trackLiveOrder(ref);

  } catch(e){ 
    console.error(e); 
    showToast('❌ حدث خطأ، يرجى المحاولة لاحقاً');
  }
  
  if(btn) { btn.disabled = false; btn.textContent = '✅ إرسال الطلب الآن'; }
};

// ── 6. التتبع اللحظي وعرض الكود (Real-time Order Tracking) ──
window.trackLiveOrder = function(ref) {
  if(activeOrderListener) activeOrderListener(); // إيقاف التتبع السابق إن وجد
  
  const col = ref.startsWith('HW') ? 'transfers' : 'cards';
  const res = document.getElementById('orderStatusResult');
  
  if(res) res.innerHTML = "⏳ جاري الاتصال المباشر بالطلب...";
  
  activeOrderListener = onSnapshot(query(collection(db, col), where("ref", "==", ref)), snap => {
    if(!res) return;
    
    if(snap.empty) {
      // بحث كبديل إذا كان المدخل مجرد أرقام
      if(/^\d+$/.test(ref)) {
          window.trackLiveOrder('HW-'+ref);
          return;
      }
      res.innerHTML = "<div style='color:red'>❌ عذراً، لم نجد طلباً بهذا الرقم</div>";
      return;
    }
    
    const data = snap.docs[0].data();
    const status = data.status;
    
    if(status === 'done') {
       let html = `<div style="color:var(--green); font-size:1.1rem; margin-bottom:10px; font-weight:bold;">✅ تم اكتمال طلبك بنجاح!</div>`;
       
       if(data.deliveredCode) {
           html += `
           <div style="background:var(--green-light); padding:15px; border-radius:12px; border:2px dashed var(--green); display:inline-block; margin-top:10px;">
               <div style="font-size:0.85rem; color:var(--mid); margin-bottom:5px;">كود الشحن الخاص بك هو:</div>
               <div style="font-family:monospace; font-size:1.4rem; font-weight:900; color:var(--ink); letter-spacing:1px; margin-bottom:10px;">${data.deliveredCode}</div>
               <button onclick="navigator.clipboard.writeText('${data.deliveredCode}').then(()=>window.showToast('📋 تم نسخ الكود بنجاح!'))" 
                       style="background:var(--green); color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-weight:bold; font-family:inherit;">📋 نسخ الكود</button>
           </div>`;
       }
       res.innerHTML = html;
       localStorage.removeItem('activeOrderId');
       if(activeOrderListener) { activeOrderListener(); activeOrderListener = null; }
    } else if(status === 'rejected') {
       res.innerHTML = `<div style="color:var(--red); font-weight:bold;">❌ عذراً، تم رفض الطلب. يرجى التواصل مع الدعم.</div>`;
    } else {
       res.innerHTML = `<div style="color:#D4A853; font-weight:bold;">⏳ طلبك قيد المراجعة... (سيتم تحديث هذه الخانة تلقائياً)</div>`;
    }
  });
};

window.checkOrderStatus = function() {
    let input = document.getElementById('orderIdInput').value.trim().replace('#', '').toUpperCase();
    if(!input) { showToast('⚠️ يرجى إدخال رقم الطلب'); return; }
    window.trackLiveOrder(input);
};

function fmt(n){ return Number(n).toLocaleString('ar-MA'); }

window.showToast = function(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
};

// بدء تشغيل النظام وتحميل البيانات
loadContent();
