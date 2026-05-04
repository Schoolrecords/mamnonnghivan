/*
============================================================================
 app.js — Logic chính của Hệ thống Hồ sơ số Mầm non + KĐCL-TĐG
============================================================================
 Tách ra từ index.html (Tuần 2 Giai đoạn 2) — giảm HTML từ 824 KB → ~620 KB.
 File này chứa:
   • Setup Wizard (lần đầu cấu hình URL Apps Script)
   • Logic chính: render hồ sơ/giáo viên/lớp/minh chứng
   • Admin panel: login, đổi mật khẩu, import Excel, quản lý ảnh/HSS
   • fetchGAS, admPostToGAS (JSONP + POST tới Apps Script)
   • Print template (in A4 ngang theo NĐ 30/2020)
   • KĐCL view-swap glue (lazy load React app khi user click "KĐCL-TĐG")
 KHÔNG chứa (vẫn giữ inline trong index.html):
   • const API_URL — mỗi trường có URL Apps Script riêng
   • IIFE chèn ?from=hoso vào URL (chạy ngay khi parse, không cần defer)
 Khi sửa logic JS:
   1. Sửa file này
   2. Bump query string trong index.html (?v=YYYYMMDD)
   3. Push lên hosting → mọi trường tự nhận update sau lần refresh
============================================================================
*/

/* ===== Phần 1: Setup Wizard (lần đầu cấu hình URL Apps Script) ===== */
// ============ SETUP WIZARD HANDLERS ============
  function showSetupWizard(){
    var wiz = document.getElementById('setupWizard');
    if(!wiz) return;
    wiz.style.display = 'flex';
    var ls = document.getElementById('loadScreen');
    if(ls) ls.style.display = 'none';
    try{
      var cur = (typeof getApiUrl === 'function') ? getApiUrl() : '';
      if(cur && cur.indexOf('AKfyc') >= 0){
        document.getElementById('setupApiUrl').value = cur;
      }
    } catch(e){}
    setTimeout(function(){ try{ document.getElementById('setupApiUrl').focus(); } catch(e){} }, 200);
  }
  function setupCloseWizard(){
    document.getElementById('setupWizard').style.display = 'none';
    var ls = document.getElementById('loadScreen');
    if(ls){
      ls.innerHTML = '<div style="text-align:center;padding:40px;max-width:520px"><div style="font-size:3rem;margin-bottom:16px">⚙️</div><h3 style="font-family:Fraunces,serif;margin-bottom:10px">Chưa cấu hình kết nối</h3><p style="opacity:.85;font-size:.95rem;margin-bottom:18px">Trang web cần URL Apps Script để hoạt động. Bấm nút bên dưới để mở lại trình hướng dẫn cài đặt.</p><button class="btn btn-primary" onclick="showSetupWizard()">🚀 Mở Setup Wizard</button></div>';
      ls.style.display = 'grid';
    }
  }
  function _setupShowMsg(text, kind){
    var m = document.getElementById('setupMsg');
    m.innerHTML = text;
    m.className = kind || '';
  }
  function _setupValidUrl(url){
    if(!url) return false;
    return url.indexOf('AKfyc') >= 0
      && url.indexOf('script.google.com') >= 0
      && /\/exec(\?|$)/.test(url);
  }
  function setupTestConnection(){
    var url = (document.getElementById('setupApiUrl').value || '').trim();
    if(!_setupValidUrl(url)){
      _setupShowMsg('❌ URL không hợp lệ. Phải có dạng <code>https://script.google.com/macros/s/AKfyc.../exec</code>', 'err');
      return;
    }
    _setupShowMsg('⏳ Đang kiểm tra kết nối (tối đa 15 giây)…', 'info');
    var cbName = 'setupCb_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    var script = document.createElement('script');
    var timer = setTimeout(function(){
      cleanup();
      _setupShowMsg('❌ Quá thời gian chờ. Kiểm tra lại: (1) URL có đúng không? (2) Web App đã <b>Deploy → Anyone</b> chưa? (3) Đã chạy <code>setupAll</code> chưa?', 'err');
    }, 15000);
    function cleanup(){ clearTimeout(timer); try{ delete window[cbName]; }catch(e){} try{ script.remove(); }catch(e){} }
    window[cbName] = function(resp){
      cleanup();
      if(resp && resp.ok && resp.data){
        var s = resp.data.stats || {};
        var nGroups = (resp.data.hss || []).length;
        _setupShowMsg('✅ Kết nối thành công! Tìm thấy <b>' + nGroups + ' nhóm hồ sơ</b>, <b>' + (s.totalTeachers || 0) + ' CBGV</b>, <b>' + (s.totalChildren || 0) + ' học sinh</b>. Bấm <b>"Lưu &amp; Tải lại"</b> để tiếp tục.', 'ok');
      } else {
        _setupShowMsg('⚠ Kết nối được nhưng phản hồi bất thường: ' + (resp && resp.error ? resp.error : 'không có dữ liệu') + '. Có thể chưa chạy <code>setupAll</code> để tạo 7 tab.', 'err');
      }
    };
    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cbName + '&action=all';
    script.onerror = function(){
      cleanup();
      _setupShowMsg('❌ Không gọi được API. Kiểm tra URL hoặc quyền triển khai (phải là <b>Anyone</b>).', 'err');
    };
    document.body.appendChild(script);
  }
  function setupSaveAndContinue(){
    var url = (document.getElementById('setupApiUrl').value || '').trim();
    if(!_setupValidUrl(url)){
      _setupShowMsg('❌ URL không hợp lệ. Phải kết thúc bằng <code>/exec</code> và chứa <code>AKfyc</code>.', 'err');
      return;
    }
    try{ localStorage.setItem('mn_api_url_v1', url); } catch(e){
      _setupShowMsg('❌ Không lưu được vào localStorage: ' + e.message, 'err'); return;
    }
    _setupShowMsg('✅ Đã lưu. Đang tải lại trang…', 'ok');
    setTimeout(function(){ location.reload(); }, 600);
  }
  // Phím tắt Enter trong ô URL → test connection
  document.addEventListener('DOMContentLoaded', function(){
    var inp = document.getElementById('setupApiUrl');
    if(inp) inp.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); setupTestConnection(); }
    });
  });

/* ===== Phần 2: Logic chính (render, admin, fetchGAS, import, print) ===== */
// ============ STATE ============
  let HSS = [], TEACHERS = [], CLASSES = [], IMAGES = [], STATS = {};
  let FOLDER_STATUS = {items:{}, lastChecked:null}; // {items:{'mã':{status,count}}, lastChecked:ISO}
  let currentClass = null;
  const CAT_ICONS = ['🏫','👩‍🏫','🏢','🤝','👶','🎗️','📁','📁'];
  const CAT_TINTS = ['#cfe1f5','#fff0d1','#dae7ff','#f0dcff','#ffdfd1','#ffe5b4','#e8f5ee','#e8f5ee'];
  const AGE_META = {
    nha_tre: {icon:'🍼', label:'Nhà trẻ'},
    mg3:     {icon:'🎈', label:'3 tuổi'},
    mg4:     {icon:'🎨', label:'4 tuổi'},
    mg5:     {icon:'🎓', label:'5 tuổi'}
  };

  function toggleMenu(){
    document.getElementById('mobileMenu').classList.toggle('open');
    document.getElementById('backdrop').classList.toggle('open');
  }

  function initials(name){
    const p = String(name||'').trim().split(/\s+/);
    const first = (p[0] && p[0][0]) || '';
    const last = (p[p.length-1] && p[p.length-1][0]) || '';
    return (first + last).toUpperCase();
  }
  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  // Debounce: gom các lần gọi liên tiếp trong `delay` ms thành 1 — dùng cho input search
  // tránh re-render mỗi keystroke khi data lớn (>500 trẻ / >100 hồ sơ).
  function _debounce(fn, delay){
    let t = null;
    return function(){
      const args = arguments, ctx = this;
      if(t) clearTimeout(t);
      t = setTimeout(function(){ fn.apply(ctx, args); }, delay);
    };
  }
  // SHA-256 (hex). Dùng cho pwdHash gửi backend verify quyền Admin (v2026.05+).
  // Block KĐCL ở cuối file có 1 hàm cùng tên trong IIFE, nhưng không expose ra ngoài —
  // declare lại ở đây để admPostToGAS / admDoLogin / admChangePwd truy cập được.
  // Trả '' nếu môi trường không có crypto.subtle (file:// hiếm gặp) → backend ở
  // chế độ legacy sẽ vẫn chấp nhận; ở chế độ STRICT_AUTH=1 sẽ trả "Thiếu pwdHash".
  async function _sha256hex(text){
    if(!text) return '';
    if(!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest) return '';
    try{
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch(e){ return ''; }
  }
  // Whitelist URL ảnh trước khi đưa vào CSS background-image. Trả '' nếu không an toàn.
  // Loại bỏ control char, dấu nháy, ngoặc, backslash — để CSS url(...) không thể bị inject.
  function _safeImageUrl(url){
    if(!url) return '';
    const s = String(url).trim();
    if(/[\x00-\x1F\x7F"'()\\]/.test(s)) return '';
    try{
      const u = new URL(s, location.href);
      if(u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'data:') return s;
    } catch(e){}
    return '';
  }
  function countLeaves(nodes){
    let t=0,f=0;
    nodes.forEach(n => {
      if(n.leaf){ t++; if(n.has) f++; }
      else if(n.children){ const x = countLeaves(n.children); t+=x.t; f+=x.f; }
    });
    return {t,f};
  }

  // ============ RENDER STATS ============
  function renderStats(){
    document.getElementById('stRecords').textContent = STATS.totalRecords || 0;
    document.getElementById('stTeachers').textContent = STATS.totalTeachers || 0;
    document.getElementById('stClasses').textContent = STATS.totalClasses || 0;
    document.getElementById('stChildren').textContent = STATS.totalChildren || 0;
    document.getElementById('recCount').textContent = STATS.totalRecords || 0;
    if(STATS.config){
      document.getElementById('cfgAddress').textContent = STATS.config.address || '';
      document.getElementById('cfgPhone').textContent = STATS.config.phone || '';
      document.getElementById('cfgEmail').textContent = STATS.config.email || '';
      document.getElementById('schoolYear').textContent = STATS.config.schoolYear || '';
    }
  }

  // ============ RECORDS (Hồ sơ số) ============
  function renderCategories(){
    document.getElementById('catGrid').innerHTML = HSS.map((cat, i) => {
      const c = countLeaves(cat.children || []);
      const groups = (cat.children || []).length;
      return `<div class="cat-card" onclick="openCat(${i})">
        <span class="cat-num">NHÓM 0${i+1}</span>
        <span class="cat-icon">${CAT_ICONS[i] || '📁'}</span>
        <h3>${escapeHtml(cat.name)}</h3>
        <div class="cat-meta">
          <div class="cat-count"><span><b>${c.t}</b>hồ sơ</span><span><b>${groups}</b>nhóm</span></div>
          <div class="cat-arrow">→</div>
        </div></div>`;
    }).join('');
  }

  // Format khoảng thời gian từ ISO timestamp tới hiện tại thành chuỗi tiếng Việt:
  // "vài giây trước" / "5 phút trước" / "3 giờ trước" / "2 ngày trước" / "12/01"
  function _relativeTime(iso){
    if(!iso) return '';
    const t = Date.parse(iso);
    if(isNaN(t)) return '';
    const diff = Date.now() - t;
    if(diff < 60*1000)        return 'vài giây trước';
    if(diff < 60*60*1000)     return Math.floor(diff/60000) + ' phút trước';
    if(diff < 24*60*60*1000)  return Math.floor(diff/3600000) + ' giờ trước';
    if(diff < 7*24*60*60*1000) return Math.floor(diff/86400000) + ' ngày trước';
    const d = new Date(t);
    return d.getDate() + '/' + (d.getMonth()+1);
  }

  // Trả về object trạng thái cho 1 mã HSS — dựa trên cache _FolderStatus + có link hay không.
  // 2 nhãn user-facing: "Đã có" (xanh) | "Chưa có" (đỏ).
  // OK   = "Đã có"  (folder có file)
  // EMPTY/NO_LINK/ERROR = "Chưa có" (3 lý do, hover xem chi tiết)
  function _statusOf(code, link){
    const fs = (FOLDER_STATUS.items || {})[code];
    const status = fs ? fs.status : (link ? 'EMPTY' : 'NO_LINK'); // chưa refresh → đoán theo link
    const count  = fs ? fs.count : 0;
    // v2026.05: append "(cập nhật X trước)" vào tooltip để user biết kết quả còn mới không.
    const ts = fs ? _relativeTime(fs.lastChecked) : '';
    const stale = ts ? ' · cập nhật ' + ts : '';
    if(status === 'OK')       return {label:'Đã có', cls:'has', count, tip: 'Folder có nội dung' + stale};
    if(status === 'EMPTY')    return {label:'Chưa có', cls:'no', count:0, tip:'Folder rỗng — chưa upload tài liệu' + stale};
    if(status === 'ERROR')    return {label:'Chưa có', cls:'no', count:0, tip:'Lỗi truy cập folder — kiểm tra link/quyền share' + stale};
    return                          {label:'Chưa có', cls:'no', count:0, tip:'Chưa dán link Drive vào sheet HSS'};
  }

  // Thu thập tất cả mã leaf có link trong 1 category/group (đệ quy)
  function _collectLeafCodes(node){
    const out = [];
    (function walk(n){
      if(n.leaf){ if(n.link) out.push(n.code); return; }
      (n.children || []).forEach(walk);
    })(node);
    return out;
  }

  // Lazy real-time check: chỉ POST cho những mã có lastChecked > 5 phút (hoặc chưa từng check).
  // Backend cap 30 mã/request. Fire-and-forget — nhận response thì update DOM in-place.
  function _lazyCheckFolders(codes){
    if(!codes || !codes.length) return;
    const STALE_MS = 5 * 60 * 1000;
    const now = Date.now();
    const stale = codes.filter(code => {
      const fs = (FOLDER_STATUS.items || {})[code];
      if(!fs || !fs.lastChecked) return true;
      const t = Date.parse(fs.lastChecked);
      return isNaN(t) || (now - t > STALE_MS);
    });
    if(!stale.length) return;
    for(let i = 0; i < stale.length; i += 30){
      const batch = stale.slice(i, i + 30);
      _publicPostToGAS({action:'checkFolderBatch', codes: batch}, function(ok, data){
        if(!ok || !data || !Array.isArray(data.results)) return;
        FOLDER_STATUS.items = FOLDER_STATUS.items || {};
        data.results.forEach(r => {
          if(!r.code) return;
          FOLDER_STATUS.items[r.code] = { status: r.status, count: r.count, lastChecked: r.lastChecked };
          _updateLeafBadge(r.code);
        });
      });
    }
  }

  // Cập nhật DOM badge của 1 leaf sau khi check xong (in-place — không re-render full)
  function _updateLeafBadge(code){
    document.querySelectorAll('.leaf').forEach(el => {
      const codeEl = el.querySelector('.leaf-code');
      if(!codeEl || codeEl.textContent.trim() !== code) return;
      const linkAnchor = el.querySelector('a.leaf-folder');
      const link = linkAnchor ? linkAnchor.getAttribute('href') : '';
      const st = _statusOf(code, link);
      const badge = el.querySelector('.leaf-badge');
      if(!badge) return;
      badge.className = 'leaf-badge ' + st.cls;
      badge.textContent = st.label;
      badge.setAttribute('title', st.tip);
    });
  }

  // Public POST tới GAS (action thuộc _HSS_PUBLIC_ACTIONS — backend không yêu cầu pwdHash)
  function _publicPostToGAS(body, callback){
    const url = getApiUrl();
    if(!isApiUrlValid()){ if(callback) callback(false, 'Chưa cấu hình URL'); return; }
    fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(body),
      redirect: 'follow'
    })
    .then(r => r.text())
    .then(text => {
      try {
        const j = JSON.parse(text);
        if(callback) callback(j.ok, j.error || j.data);
      } catch(e) { if(callback) callback(false, 'Phản hồi không đọc được'); }
    })
    .catch(err => { if(callback) callback(false, err.message); });
  }

  function renderLeaves(items){
    return items.map(it => {
      const st = _statusOf(it.code, it.link);
      const assign = String(it.assign || '').trim();
      const folderIcon = it.link
        ? `<a class="leaf-folder" href="${escapeHtml(it.link)}" target="_blank" rel="noopener" title="Mở folder Drive">📁</a>`
        : `<span class="leaf-folder disabled" title="Chưa có link Drive">📁</span>`;
      return `<div class="leaf">
        <span class="leaf-code">${escapeHtml(it.code)}</span>
        <span class="leaf-name">${escapeHtml(it.name)}</span>
        <span class="leaf-assign" title="Người phụ trách">${assign ? escapeHtml(assign) : '<span class="leaf-assign-empty">—</span>'}</span>
        <span class="leaf-status">
          <span class="leaf-badge ${st.cls}" title="${escapeHtml(st.tip)}">${st.label}</span>
          ${folderIcon}
        </span>
      </div>`;
    }).join('');
  }

  function renderSubgroup(g){
    // Nếu g là leaf (không phải group) → render trực tiếp
    if(g.leaf) return renderLeaves([g]);

    const children = g.children || [];
    const leafCount = countLeaves(children).t;

    // Render children ĐÚNG THỨ TỰ gốc (không tách leaves/groups)
    let innerHtml = '';
    children.forEach(child => {
      if(child.leaf){
        innerHtml += renderLeaves([child]);
      } else {
        // Nested group — render đệ quy nếu có sub-groups sâu hơn
        const nested = child.children || [];
        const hasDeeper = nested.some(x => !x.leaf);
        if(hasDeeper){
          // Có sub-group con → render từng item theo thứ tự
          let nestInner = '';
          nested.forEach(n => {
            if(n.leaf) nestInner += renderLeaves([n]);
            else {
              const nLeaves = (n.children || []).filter(x => x.leaf);
              nestInner += `<div class="sub-nest">
                <div class="nest-head" onclick="this.parentElement.classList.toggle('open')">
                  <div class="nest-title"><span>📁</span><span>${escapeHtml(n.code)}. ${escapeHtml(n.name)}</span></div>
                  <span class="sub-badge">${countLeaves(n.children||[]).t}</span>
                </div>
                <div class="nest-list">${renderLeaves(nLeaves)}</div>
              </div>`;
            }
          });
          innerHtml += `<div class="sub-nest">
            <div class="nest-head" onclick="this.parentElement.classList.toggle('open')">
              <div class="nest-title"><span>📁</span><span>${escapeHtml(child.code)}. ${escapeHtml(child.name)}</span></div>
              <span class="sub-badge">${countLeaves(nested).t}</span>
            </div>
            <div class="nest-list">${nestInner}</div>
          </div>`;
        } else {
          // Chỉ có leaves → render đơn giản
          innerHtml += `<div class="sub-nest">
            <div class="nest-head" onclick="this.parentElement.classList.toggle('open')">
              <div class="nest-title"><span>📁</span><span>${escapeHtml(child.code)}. ${escapeHtml(child.name)}</span></div>
              <span class="sub-badge">${nested.filter(x=>x.leaf).length}</span>
            </div>
            <div class="nest-list">${renderLeaves(nested.filter(x=>x.leaf))}</div>
          </div>`;
        }
      }
    });

    // Header cột (chỉ hiện khi sub-group mở) — gắn vào đầu sub-list
    const colHeader = `<div class="leaf-header">
      <span>Mã hồ sơ</span>
      <span>Danh mục Hồ sơ</span>
      <span>Người phụ trách</span>
      <span class="leaf-header-status">Trạng thái</span>
    </div>`;
    return `<div class="sub-group">
      <div class="sub-head" onclick="this.parentElement.classList.toggle('open')">
        <div class="sub-title"><span>📂</span><span>${escapeHtml(g.code)}. ${escapeHtml(g.name)}</span></div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="sub-badge">${leafCount} hồ sơ</span>
          <span class="sub-toggle">▸</span>
        </div>
      </div>
      <div class="sub-list">${colHeader}${innerHtml}</div>
    </div>`;
  }

  // Đếm số leaf trong cat đã có file (status === OK), dựa trên FOLDER_STATUS cache
  function _countCatStatus(cat){
    let total = 0, hasFile = 0;
    (function walk(nodes){
      nodes.forEach(n => {
        if(n.leaf){
          total++;
          const fs = (FOLDER_STATUS.items || {})[n.code];
          if(fs && fs.status === 'OK') hasFile++;
        } else if(n.children) walk(n.children);
      });
    })(cat.children || []);
    return {total, hasFile};
  }

  function _formatCheckedTime(iso){
    if(!iso) return 'Chưa kiểm tra lần nào';
    try{
      const d = new Date(iso);
      const pad = n => String(n).padStart(2,'0');
      return `Cập nhật: ${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
    } catch(e){ return ''; }
  }

  function _renderDetailMeta(cat){
    const c = _countCatStatus(cat);
    const ts = _formatCheckedTime((FOLDER_STATUS || {}).lastChecked);
    return `<span class="stat">📊 ${c.hasFile}/${c.total} hồ sơ đã có file</span>
      <span class="ts">${escapeHtml(ts)}</span>
      <button class="refresh-btn" onclick="refreshFolderStatusFE(this)">🔄 Kiểm tra ngay</button>`;
  }

  // v2026.05: thay vì quét toàn bộ 77 folder (60-120s), chỉ check NHÓM hiện đang mở (~5-10s).
  // Dùng action public `checkFolderBatch` — không cần pwdHash. Force-stale các mã trong nhóm để
  // bypass cache 30s ở backend. Update DOM in-place khi response về (không cần reload toàn bộ).
  window.refreshFolderStatusFE = function(btn){
    if(!btn) return;
    const original = btn.innerHTML;
    const detailName = document.getElementById('detailName').textContent;
    const cat = HSS.find(c => c.name === detailName);
    if(!cat){
      btn.innerHTML = '❌ Không xác định nhóm';
      setTimeout(() => { btn.disabled = false; btn.innerHTML = original; }, 2000);
      return;
    }
    const codes = _collectLeafCodes(cat);
    if(!codes.length){
      btn.innerHTML = '✓ Nhóm này không có link';
      setTimeout(() => { btn.disabled = false; btn.innerHTML = original; }, 2000);
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '⏳ Đang kiểm tra ' + codes.length + ' hồ sơ...';

    // Force-stale: clear lastChecked để không bị cache hit
    FOLDER_STATUS.items = FOLDER_STATUS.items || {};
    codes.forEach(c => {
      if(FOLDER_STATUS.items[c]) FOLDER_STATUS.items[c].lastChecked = null;
    });

    const batches = [];
    for(let i = 0; i < codes.length; i += 30) batches.push(codes.slice(i, i + 30));
    let done = 0;
    batches.forEach(function(batch){
      _publicPostToGAS({action:'checkFolderBatch', codes: batch}, function(ok, data){
        done++;
        if(ok && data && Array.isArray(data.results)){
          data.results.forEach(r => {
            if(!r.code) return;
            FOLDER_STATUS.items[r.code] = { status:r.status, count:r.count, lastChecked:r.lastChecked };
            _updateLeafBadge(r.code);
          });
        }
        if(done === batches.length){
          FOLDER_STATUS.lastChecked = new Date().toISOString();
          // Re-render meta strip với số liệu mới
          try { document.getElementById('detailMeta').innerHTML = _renderDetailMeta(cat); } catch(e){}
          btn.innerHTML = '✅ Đã cập nhật';
          setTimeout(() => { btn.disabled = false; btn.innerHTML = original; }, 2500);
        }
      });
    });
  };

  function openCat(i){
    const cat = HSS[i];
    if(!cat) return;
    document.getElementById('detailIcon').textContent = CAT_ICONS[i] || '📁';
    document.getElementById('detailName').textContent = cat.name;

    // Render meta strip (thống kê tỉ lệ "Đã có" + thời gian cập nhật + nút refresh)
    document.getElementById('detailMeta').innerHTML = _renderDetailMeta(cat);

    // Render children theo đúng thứ tự, xử lý cả leaf lẫn group
    const children = cat.children || [];
    let html = '';
    children.forEach(child => {
      html += renderSubgroup(child);
    });
    document.getElementById('detailBody').innerHTML = html;

    const first = document.querySelector('#detailBody .sub-group');
    if(first) first.classList.add('open');
    const detail = document.getElementById('catDetail');
    detail.classList.add('active');
    setTimeout(() => detail.scrollIntoView({behavior:'smooth', block:'start'}), 100);

    // v2026.05: Real-time check trạng thái folder cho các mã trong nhóm này.
    // Skip mã có cache mới (< 5 phút). Cập nhật DOM in-place khi response về (~1-3s).
    try { _lazyCheckFolders(_collectLeafCodes(cat)); } catch(e){}
  }
  function closeDetail(){
    document.getElementById('catDetail').classList.remove('active');
    document.getElementById('records').scrollIntoView({behavior:'smooth'});
  }

  // Search records (debounce 250ms để tránh re-render mỗi keystroke khi HSS > 100 hồ sơ)
  document.getElementById('recSearch').addEventListener('input', _debounce(function(e){
    const q = e.target.value.trim().toLowerCase();
    if(!q){
      document.querySelectorAll('.cat-card').forEach(c => c.style.display='');
      closeDetail(); return;
    }
    const matches = [];
    HSS.forEach((cat, ci) => {
      (function walk(nodes){
        nodes.forEach(n => {
          if(n.leaf){
            if(n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q))
              matches.push({...n, catIdx: ci, catName: cat.name});
          } else if(n.children){ walk(n.children); }
        });
      })(cat.children || []);
    });
    document.querySelectorAll('.cat-card').forEach(c => c.style.display='none');
    document.getElementById('detailIcon').textContent = '🔍';
    document.getElementById('detailName').textContent = `Kết quả tìm: "${q}" (${matches.length} hồ sơ)`;
    document.getElementById('detailBody').innerHTML = matches.length
      ? `<div class="sub-group open"><div class="sub-list">${renderLeaves(matches)}</div></div>`
      : '<p style="padding:30px;text-align:center;color:#64748b">Không tìm thấy hồ sơ phù hợp.</p>';
    document.getElementById('catDetail').classList.add('active');
  }, 250));

  // ============ CLASSES (Quản lý trẻ) ============
  function renderAgeTabs(){
    const counts = {all: CLASSES.length, nha_tre:0, mg3:0, mg4:0, mg5:0};
    CLASSES.forEach(c => { if(counts[c.ageKey] !== undefined) counts[c.ageKey]++; });
    const tabs = document.getElementById('ageTabs');
    tabs.innerHTML = `<button class="age-tab active" data-age="all">Tất cả (${counts.all})</button>
      ${counts.nha_tre ? `<button class="age-tab" data-age="nha_tre">🍼 Nhà trẻ (${counts.nha_tre})</button>` : ''}
      ${counts.mg3 ? `<button class="age-tab" data-age="mg3">🎈 3 tuổi (${counts.mg3})</button>` : ''}
      ${counts.mg4 ? `<button class="age-tab" data-age="mg4">🎨 4 tuổi (${counts.mg4})</button>` : ''}
      ${counts.mg5 ? `<button class="age-tab" data-age="mg5">🎓 5 tuổi (${counts.mg5})</button>` : ''}`;
    tabs.querySelectorAll('.age-tab').forEach(t => {
      t.addEventListener('click', () => {
        tabs.querySelectorAll('.age-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        renderClasses(t.dataset.age);
      });
    });
  }
  function renderClasses(filter){
    filter = filter || 'all';
    const list = filter === 'all' ? CLASSES : CLASSES.filter(c => c.ageKey === filter);
    document.getElementById('classGrid').innerHTML = list.map(c => {
      const meta = AGE_META[c.ageKey] || {icon:'🏫', label:c.ageLabel||''};
      return `<div class="class-card" data-age="${c.ageKey}" onclick="openClass('${escapeHtml(c.name).replace(/'/g,'&#39;')}')">
        <span class="class-age-chip">${meta.icon} ${meta.label}</span>
        <div class="class-name">${escapeHtml(c.name)}</div>
        <span class="class-age-text">${escapeHtml(c.ageGroup||'')}</span>
        <div class="class-stats">
          <div class="class-stat"><b>${c.students.length}</b><small>Tổng</small></div>
          <div class="class-stat male"><b>${c.male}</b><small>Nam</small></div>
          <div class="class-stat female"><b>${c.female}</b><small>Nữ</small></div>
        </div>
        <div class="class-cta">Xem danh sách →</div>
      </div>`;
    }).join('');
  }
  function openClass(name){
    name = name.replace(/&#39;/g, "'");
    const cls = CLASSES.find(c => c.name === name);
    if(!cls) return;
    currentClass = cls;
    document.getElementById('spTitle').textContent = cls.name;
    document.getElementById('spMeta').textContent = `${cls.ageGroup} · ${cls.students.length} trẻ (${cls.male} nam / ${cls.female} nữ)`;
    document.getElementById('stSearch').value = '';
    renderStudents(cls.students);
    const panel = document.getElementById('studentsPanel');
    panel.classList.add('active');
    setTimeout(() => panel.scrollIntoView({behavior:'smooth', block:'start'}), 100);
  }
  function closeStudents(){
    document.getElementById('studentsPanel').classList.remove('active');
    document.getElementById('classes').scrollIntoView({behavior:'smooth'});
  }
  function renderStudents(list){
    const wrap = document.getElementById('stTableWrap');
    if(!list.length){
      wrap.innerHTML = '<div class="st-empty">Không tìm thấy trẻ phù hợp.</div>';
      return;
    }
    wrap.innerHTML = `<table class="st-table">
      <thead><tr><th>STT</th><th>Họ và tên</th><th>Ngày sinh</th><th>Giới tính</th><th>Nơi sinh</th><th>SĐT phụ huynh</th></tr></thead>
      <tbody>${list.map((s, i) => {
        const isFemale = /nữ|nu/i.test(s.gender);
        const init = initials(s.name);
        const rowId = 'st' + i;
        return `<tr class="st-row" id="${rowId}" onclick="toggleStudent('${rowId}', ${i})">
          <td class="st-idx" data-lbl="STT">${i+1}</td>
          <td class="st-name-cell" data-lbl="Trẻ">
            <span class="st-avatar ${isFemale?'female':''}">${init}</span>
            <span class="st-name">${escapeHtml(s.name)}</span>
          </td>
          <td data-lbl="Ngày sinh">${escapeHtml(s.dob)}</td>
          <td data-lbl="Giới tính"><span class="st-gender ${isFemale?'f':'m'}">${escapeHtml(s.gender)}</span></td>
          <td data-lbl="Nơi sinh">${escapeHtml(s.birthplace || '–')}</td>
          <td data-lbl="SĐT">${escapeHtml(s.phone || '–')}</td>
        </tr>
        <tr class="st-detail-row" id="${rowId}_d" style="display:none">
          <td colspan="6"><div class="st-detail-inner">
            <div class="st-field"><strong>Mã học sinh</strong><span>${escapeHtml(s.studentCode || '–')}</span></div>
            <div class="st-field"><strong>Dân tộc / Tôn giáo</strong><span>${escapeHtml(s.ethnic || '–')} / ${escapeHtml(s.religion || '–')}</span></div>
            <div class="st-field"><strong>Địa chỉ thường trú</strong><span>${escapeHtml([s.hamlet, s.ward, s.province].filter(Boolean).join(', ') || '–')}</span></div>
            <div class="st-field"><strong>Họ tên cha</strong><span>${escapeHtml(s.father || '–')} ${s.fatherYear ? '('+escapeHtml(s.fatherYear)+')' : ''}</span></div>
            <div class="st-field"><strong>Họ tên mẹ</strong><span>${escapeHtml(s.mother || '–')} ${s.motherYear ? '('+escapeHtml(s.motherYear)+')' : ''}</span></div>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }
  function toggleStudent(rowId, i){
    const row = document.getElementById(rowId);
    const det = document.getElementById(rowId + '_d');
    if(det.style.display === 'none'){ det.style.display = ''; row.classList.add('open'); }
    else { det.style.display = 'none'; row.classList.remove('open'); }
  }
  document.getElementById('stSearch').addEventListener('input', _debounce(function(e){
    if(!currentClass) return;
    const q = e.target.value.trim().toLowerCase();
    if(!q){ renderStudents(currentClass.students); return; }
    renderStudents(currentClass.students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.father || '').toLowerCase().includes(q) ||
      (s.mother || '').toLowerCase().includes(q)
    ));
  }, 250));

  // ============ TEACHERS ============
  function teacherType(t){
    const r = (t.role || '').toLowerCase();
    if(r.includes('hiệu trưởng') || r.includes('phó hiệu')) return 'bgh';
    if(r.includes('giáo viên')) return 'gv';
    return 'nv';
  }
  function renderRoleFilter(){
    const counts = {all: TEACHERS.length, bgh:0, gv:0, nv:0};
    TEACHERS.forEach(t => counts[teacherType(t)]++);
    const filter = document.getElementById('roleFilter');
    filter.innerHTML = `<button class="role-chip active" data-role="all">Tất cả (${counts.all})</button>
      <button class="role-chip" data-role="bgh">Ban giám hiệu (${counts.bgh})</button>
      <button class="role-chip" data-role="gv">Giáo viên (${counts.gv})</button>
      <button class="role-chip" data-role="nv">Nhân viên (${counts.nv})</button>`;
    filter.querySelectorAll('.role-chip').forEach(c => {
      c.addEventListener('click', () => {
        filter.querySelectorAll('.role-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        renderTeachers(c.dataset.role);
      });
    });
  }
  function renderTeachers(role){
    role = role || 'all';
    const list = role === 'all' ? TEACHERS : TEACHERS.filter(t => teacherType(t) === role);
    document.getElementById('teacherGrid').innerHTML = list.map(t => {
      const extra = t.dob ? 'Ngày sinh ' + t.dob : '';
      const btn = t.link
        ? `<a class="teacher-profile" href="${escapeHtml(t.link)}" target="_blank" rel="noopener">📂 Hồ sơ cá nhân</a>`
        : `<span class="teacher-profile disabled">📂 Chưa có</span>`;
      return `<div class="teacher-card">
        <div class="teacher-avatar">${initials(t.name)}</div>
        <h4>${escapeHtml(t.name)}</h4>
        <span class="teacher-role">${escapeHtml(t.role)}</span>
        ${extra ? `<span class="teacher-tag">${escapeHtml(extra)}</span>` : ''}
        <div>${btn}</div>
      </div>`;
    }).join('');
  }

  // ============ GUIDE TABS ============
  function guideTab(id, btn){
    const map = {use:'guideUse', faq:'guideFaq'};
    document.querySelectorAll('.guide-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.guide-panel').forEach(p => p.classList.remove('active'));
    if(btn) btn.classList.add('active');
    document.getElementById(map[id]).classList.add('active');
  }

  // ============ FAQ ============
  const faqs = [
    {q:'⭐ Cột "Trạng thái" hồ sơ — Đã có / Chưa có nghĩa là gì?', a:'<b>Đã có</b> (xanh): folder Drive của hồ sơ đó có ít nhất 1 file (PDF, Word, Excel, ảnh, … bất kể loại). Hệ thống quét cả file trong subfolder lồng nhau (vd "Năm học 2025-2026"). <b>Chưa có</b> (đỏ): có 3 lý do — folder rỗng / chưa dán link Drive / không truy cập được folder. Hover badge để xem tooltip chi tiết. Bấm <b>📁 icon</b> bên cạnh badge để mở thẳng folder Drive trong tab mới.'},
    {q:'⭐ Khi nào trạng thái hồ sơ được cập nhật?', a:'<b>🌙 Tự động</b>: <b>02:00 sáng mỗi đêm</b> hệ thống quét toàn bộ folder Drive bằng cron Apps Script — sáng vào web có số liệu mới, KHÔNG cần ai làm gì. <b>⚡ Real-time</b> (v2026.05+): mở chi tiết 1 nhóm hồ sơ → tự động quét lại các mã có cache > 5 phút (~3-8s) → badge "Đã có/Chưa có" tự cập nhật in-place. <b>👆 Thủ công</b>: (1) header nhóm hồ sơ → <b>"🔄 Kiểm tra ngay"</b> — quét nhóm hiện tại (~3-8s), (2) Admin → tab Hệ thống → <b>"🔄 Quét trạng thái Drive ngay"</b> — quét toàn bộ 77 folder (~15-25s, có thống kê 🟢 Đã có / 🔴 Trống / ⚪ Chưa link / ⚠ Lỗi).'},
    {q:'⭐ Nút "Xem/In Danh mục" Hồ sơ số dùng làm gì?', a:'Sinh bản in <b>A4 ngang</b> đầy đủ: Quốc hiệu - Tiêu ngữ + Tên trường + Tiêu đề "Danh mục Hồ sơ số" + Năm học + Bảng 4 cột (Mã / Danh mục / Người phụ trách / Trạng thái) + Chữ ký Người lập và Hiệu trưởng + Footnote tổng số. Lề trái 3cm (đóng quyển), các phía 1.5cm theo NĐ 30/2020. Dùng để in lưu trữ, báo cáo Sở GD&ĐT, hoặc Save as PDF.'},
    {q:'⭐ Cột "Người phụ trách" lấy dữ liệu từ đâu?', a:'Từ cột "Phân công nhiệm vụ" trong sheet "Danh muc HSS". Có 2 cách điền: <b>(1) Nhập tay</b> qua Admin → tab 📋 Hồ sơ số → cột Người phụ trách. <b>(2) Tự động</b>: chạy hàm <code>applyDefaultAssignments</code> trong Apps Script editor → tự điền vai trò mặc định cho 77 hồ sơ theo TT 52/2020 + thực tiễn QL trường mầm non (Hiệu trưởng, Phó HT-CM, Phó HT-CSVC, NV Văn phòng, NV Kế toán, NV Y tế, Bí thư Chi bộ, …). An toàn: chỉ điền ô trống, giữ nguyên ô đã sửa thủ công.'},
    {q:'⭐ Có thể đổi tone màu giao diện không?', a:'Có 2 chủ đề: <b>Xanh navy</b> (mặc định, hiện đại, đồng bộ KĐCL) và <b>Xanh lá</b> (cổ điển, ấm). Đổi: Admin → tab 🏫 Thông tin → cuộn xuống "Chủ đề màu sắc" → click chọn → 💾 Lưu thay đổi. Toàn bộ giao diện (HSS + KĐCL + Admin) đổi tone NGAY không cần reload. Chủ đề lưu lên Google Sheet → đồng bộ cho mọi thiết bị truy cập web của trường.'},
    {q:'⭐ Hệ thống KĐCL - TĐG dùng như thế nào?', a:'Bấm menu <b>"KĐCL - TĐG"</b> trên thanh nav → chuyển sang không gian Tự đánh giá với 5 workspace: <b>Tổng quan / Báo cáo TĐG / Phiếu TĐG / Minh chứng / Kế hoạch</b>. Thông tin trường và danh mục minh chứng tự động đồng bộ từ Hồ sơ số. Bấm nút <b>"← Hồ sơ số"</b> trên topbar để quay lại. Tất cả trong cùng 1 trang, không mở tab mới.'},
    {q:'⭐ Làm sao để AI tự viết báo cáo tự đánh giá?', a:'Trong KĐCL → workspace <b>"Báo cáo TĐG"</b> → click vào tiêu chí bất kỳ (ví dụ 1.1) ở sidebar dàn ý → bấm <b>"✨ AI"</b> → Gemini sẽ viết Mô tả hiện trạng / Điểm mạnh / Điểm yếu / Kế hoạch cải tiến theo đúng khung TT 19/2018 + TT 22/2024, tự trích dẫn mã minh chứng [H1-1.1-01] từ danh mục. Nút <b>"Tạo tất cả"</b> ở Tổng quan sẽ batch viết cả 22 tiêu chí liên tục.'},
    {q:'⭐ FAB "📋 Minh chứng HSS" ở góc phải dưới là gì?', a:'Khi đang trong view KĐCL, FAB góc phải dưới mở <b>Danh mục Minh chứng</b> đồng bộ từ Hồ sơ số. Có search theo mã/nội dung/đơn vị ban hành, nút <b>"+ Dùng"</b> chèn mã vào báo cáo TĐG, nút <b>"📋 Copy tất cả"</b> export ra clipboard. Rất tiện để tra cứu khi viết báo cáo mà không phải chuyển tab.'},
    {q:'⭐ API Key Gemini hết hạn, cập nhật ở đâu?', a:'Vào <b>https://aistudio.google.com/apikey</b> → Create API key → copy key mới. Sau đó vào <b>script.google.com</b> → project <b>MN_Backend</b> → ⚙ Project Settings → Script Properties → sửa <code>GEMINI_API_KEY</code> → Lưu. KHÔNG cần redeploy, không cần sửa HTML. Nếu bị lỗi 429 "quota exceeded" → đổi <code>GEMINI_MODEL</code> = <code>gemini-2.5-flash</code> (miễn phí 1500 request/ngày).'},
    {q:'Làm sao tìm nhanh một hồ sơ hoặc minh chứng?', a:'Dùng ô tìm kiếm ở đầu mục. Mục "Hồ sơ số": gõ tên hoặc mã (VD: "thi đua", "1.2.1"). Mục "Minh chứng KĐCL": gõ mã MC (VD: "H1-1.1-01") hoặc từ khóa trong nội dung. Danh sách tự lọc ngay lập tức.'},
    {q:'⭐ Bảng mã hóa minh chứng có những tính năng gì?', a:'Hiển thị đầy đủ 5 tiêu chuẩn · 22 tiêu chí · 81 minh chứng — cập nhật theo TT 22/2024 (TC3 đã gộp từ 6 → 3 tiêu chí). Mỗi MC có mã [H1-1.1-01] và mã HSS liên kết — bấm biểu tượng 📁 để mở thẳng thư mục Drive. Có nút 📜 "Căn cứ pháp lý" để xem văn bản quy định.'},
    {q:'⭐ Nút "In theo mẫu" hoạt động như thế nào?', a:'Bấm nút 🖨 "In theo mẫu" (viền cam, cạnh nút Căn cứ pháp lý) → sinh ra bản in A4 ngang đúng Phụ lục CV 5942/BGDĐT-QLCL: có quốc hiệu, tên trường, tiêu đề, bảng 7 cột đầy đủ (STT, Mã MC, Tên, Ngày BH, Nơi BH, Mã HSS, Ghi chú), phần ký Hiệu trưởng. Tự điền tên trường, địa chỉ, năm học từ cấu hình. Chọn "Save as PDF" để xuất file.'},
    {q:'⭐ Sửa/xóa/thêm minh chứng ở đâu?', a:'Vào Admin → tab 🎯 Minh chứng → chọn Tiêu chuẩn từ dropdown → xuất hiện các Tiêu chí + minh chứng con dạng form. Sửa trực tiếp các trường (Mã MC, Nội dung, Ngày BH, Nơi BH, Mã HSS). Nút ＋ Thêm minh chứng tự sinh mã [Hn-a.b-XX]. Nút 🗑 Xóa có xác nhận. Bấm 💾 "Lưu lên Google Sheet" để đồng bộ.'},
    {q:'Nút "🔄 Khôi phục khung TT 22/2024" làm gì?', a:'Khôi phục cấu trúc chuẩn 22 tiêu chí theo TT 19/2018 đã được TT 22/2024 sửa đổi (TC3 còn 3 tiêu chí). Các minh chứng đã nhập được giữ nguyên, chỉ bổ sung các tiêu chí còn thiếu và sửa tên tiêu chí về đúng quy định. Dùng khi cập nhật lần đầu từ phiên bản cũ.'},
    {q:'Vì sao có hồ sơ hiện chấm xám?', a:'Chấm xám = chưa có link Drive. Vào Admin → tab 📋 Hồ sơ số → dán link Drive vào ô tương ứng → bấm 💾 Lưu thay đổi → chấm chuyển xanh + nút "Mở" xuất hiện.'},
    {q:'Dữ liệu cập nhật thế nào?', a:'Toàn bộ dữ liệu lưu trên Google Sheet. Sửa qua Admin → tự đồng bộ. Hoặc sửa trực tiếp Sheet → vào web bấm Admin → tab Nhập dữ liệu → "🔄 Làm mới dữ liệu". Dữ liệu cache 10 phút trong trình duyệt.'},
    {q:'Làm sao đổi tên trường, địa chỉ, hiệu trưởng?', a:'Admin → tab 🏫 Thông tin → sửa các ô (gồm cả <b>Logo emoji</b> và <b>Slogan</b>) → 💾 Lưu thay đổi. <b>Tự động đồng bộ lên Google Sheet</b> — mọi máy mở web đều thấy thông tin mới (không cần làm gì thêm). Cách thay thế: sửa trực tiếp Sheet <code>CauHinh</code> cột "Giá trị" rồi vào Admin → tab Hệ thống → 🔄 Làm mới dữ liệu.'},
    {q:'⭐ Chia sẻ link qua Zalo/Facebook có ảnh preview đẹp không?', a:'Có! Dán link vào Zalo, Facebook, Messenger, Telegram → thẻ preview tự hiện (ảnh banner, tiêu đề, mô tả, domain) nhờ Open Graph meta tags. Nếu preview không hiện ngay, đợi 5s hoặc thêm ?v=2 vào cuối URL để crawl lại.'},
    {q:'Thêm ảnh hoạt động vào slideshow ở Hero?', a:'Mở Sheet tab "Hinh Anh" → thêm dòng: STT, Tiêu đề, Mô tả, Link ảnh Drive, Loại (truong/hoatdong/banru/lehoi) → về web bấm Admin → Nhập dữ liệu → Làm mới.'},
    {q:'Xem trên điện thoại có được không?', a:'Hoàn toàn được. Giao diện responsive, menu thu gọn ☰ góc phải. Mọi tính năng (xem hồ sơ, mở Drive, admin CRUD, in minh chứng, chia sẻ Zalo) đều chạy bình thường trên mobile.'},
    {q:'Mật khẩu mặc định & quên mật khẩu?', a:'<b>Hồ sơ số (nút ⚙ Admin)</b>: mật khẩu mặc định <code>admin@2026</code>. <b>Hệ thống KĐCL (viết báo cáo / xuất Word / tải phiếu)</b>: cùng mật khẩu <code>admin@2026</code>. Khách KHÔNG có mật khẩu chỉ xem được thông tin, không thao tác được. <b>Đổi mật khẩu</b>: Admin panel → tab 🔑 Mật khẩu. <b>Quên mật khẩu — cách reset nhanh nhất:</b> mở Google Sheet (link trong Apps Script) → tab <code>CauHinh</code> → tìm hàng "Mật khẩu Admin" → sửa cột "Giá trị" thành mật khẩu mới → vào web bấm Admin → tab Hệ thống → 🔄 Làm mới dữ liệu → đăng nhập bằng mật khẩu vừa đặt. Nếu vẫn không vào được, liên hệ Nhà thiết kế (Chung Trần — Zalo 0913 031 073).'},
    {q:'⭐ Upload Excel DSGV/DSHS có ghi đè dữ liệu cũ không?', a:'<b>CÓ — ghi đè TOÀN BỘ</b>. Backend xoá hết dữ liệu cũ rồi ghi data mới (xem hàm <code>_writeTeachers</code> / <code>_writeStudents</code> trong Apps Script). <b>Best practice:</b> (1) Vào Admin → tab DSGV/HS → bấm <b>"📥 Tải mẫu Excel GV/HS"</b> để có file kèm <i>data hiện tại</i>. (2) Mở file đó trong Excel/LibreOffice, sửa/thêm hàng. (3) Lưu lại với tên mới. (4) Drag-drop file mới vào ô upload → preview → 📤 Tải lên. Như vậy giữ được toàn bộ data cũ + thêm data mới. Nếu chỉ tải mẫu trống thì sau import sẽ MẤT data cũ.'},
    {q:'⭐ Mã lớp đặt như thế nào để hệ thống tự lọc theo độ tuổi?', a:'Hệ thống tự nhận diện độ tuổi từ <b>Mã lớp</b> dựa vào <b>5 từ khoá</b>: <code>Nhà trẻ</code> · <code>25-36 tháng</code> · <code>3 tuổi</code> · <code>4 tuổi</code> · <code>5 tuổi</code>. ✅ <b>Mã đúng:</b> <code>"MG 3 tuổi A"</code>, <code>"Nhà trẻ B"</code>, <code>"Mẫu giáo 4 tuổi C"</code>, <code>"Lớp 5 tuổi 1"</code>. ❌ <b>Mã không match:</b> <code>"Lớp A"</code>, <code>"Hoa Mai"</code>, <code>"MG3A"</code> (không có dấu cách + chữ "tuổi") → trẻ rơi vào nhóm "other", tab "Quản lý trẻ" sẽ KHÔNG lọc được theo độ tuổi. <b>v2026.05+</b>: khi import Excel, hệ thống cảnh báo nếu phát hiện mã lớp không match — cho phép tiếp tục nếu thầy/cô có chủ đích.'},
    {q:'⭐ Tooltip "cập nhật vài giây / 5 phút / 3 giờ trước" trên badge nghĩa là gì?', a:'(v2026.05+) Hover chuột vào badge "Đã có" / "Chưa có" → tooltip hiện thông tin về kết quả check folder Drive: <b>"Folder có nội dung · cập nhật 8 phút trước"</b> chẳng hạn. Đây là độ <b>"tươi" của dữ liệu</b>. Nếu thấy "cập nhật 6 giờ trước" → dữ liệu cũ, có thể đã upload file mới mà chưa được scan lại — bấm <b>"🔄 Kiểm tra ngay"</b> trong header nhóm để force refresh nhóm hiện tại (~3-8s). Nếu thấy "vài giây trước" → kết quả vừa được check real-time, chính xác.'},
    {q:'⭐ Sheet `_AuditLog` để làm gì?', a:'(v2026.05+) Sheet <code>_AuditLog</code> (tab thứ 9 trong Google Sheet của trường) tự động ghi lại <b>mọi thao tác POST</b> tới backend: thời gian, action (updateConfig / importTeachers / importStudents / saveReport / ai…), kết quả (✅ OK / ❌ FAIL), thông tin tóm tắt. Phục vụ <b>truy vết lỗi</b> ("ai đã xoá DSHS lúc 3h chiều?", "AI gọi tới Gemini lần cuối khi nào?") + <b>tuân thủ NĐ 13/2023</b> về log thao tác dữ liệu. Sheet tự xoay vòng giữ tối đa 1000 dòng gần nhất — không bao giờ phình to.'},
    {q:'⭐ STRICT_AUTH là gì, khi nào nên bật?', a:'(v2026.05+) Mặc định backend chạy <b>"soft auth"</b>: chấp nhận cả request không có <code>pwdHash</code> để frontend cũ chưa cập nhật vẫn dùng được. Khi MỌI máy CBGV đã hard reload (Ctrl+Shift+R) lên frontend ≥ v2026.05 → vào <b>Apps Script editor → Project Settings → Script Properties → thêm <code>STRICT_AUTH = 1</code></b> → từ giờ mọi POST không có pwdHash hợp lệ sẽ bị backend từ chối với <code>code: "UNAUTHORIZED"</code>. Đây là chế độ bảo mật cứng — bật sau ~1-2 tuần để đảm bảo các máy đều đã update. Cách kiểm tra: mở sheet <code>_AuditLog</code> → nếu KHÔNG còn dòng "Thông tin = legacy (no pwdHash)" → an toàn để bật STRICT_AUTH.'},
    {q:'Ai có thể chỉnh sửa dữ liệu?', a:'Chỉ người có mật khẩu Admin của trang web, HOẶC người được cấp quyền chỉnh sửa Google Sheet gốc. Trang web công khai chỉ hiển thị (chỉ đọc) — an toàn cho phụ huynh xem.'},
    {q:'Trường khác muốn dùng hệ thống này?', a:'Liên hệ Nhà thiết kế (Chung Trần — Zalo 0913 031 073) để được hỗ trợ triển khai. Mỗi trường có file HTML + Google Sheet + Apps Script riêng, màu sắc và thông tin tự tùy biến qua Admin.'}
  ];
  // ⚠ Hướng dẫn mới (v2026.06b) hard-code 6 FAQ trong HTML, không còn #faqList động.
  // Giữ array faqs[] cho tham khảo (có thể tái sử dụng sau này), nhưng KHÔNG render
  // nếu container đã bị xóa khỏi DOM.
  const _faqListEl = document.getElementById('faqList');
  if (_faqListEl) {
    _faqListEl.innerHTML = faqs.map(f => `<div class="faq-item">
    <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
      <span class="faq-q-text">${f.q}</span>
      <span class="faq-toggle">+</span>
    </div>
    <div class="faq-a"><div class="faq-a-inner">${f.a}</div></div>
  </div>`).join('');
  }

  // ============ GIỚI THIỆU ============
  function renderAbout(){
    // Ảnh: lấy ảnh loại 'truong' đầu tiên, hoặc ảnh đầu tiên bất kỳ
    if(IMAGES && IMAGES.length){
      var img = IMAGES.find(function(i){return i.type==='truong';}) || IMAGES[0];
      if(img && img.url){
        document.getElementById('aboutImg').src = img.url;
        document.getElementById('aboutImg').alt = img.title || 'Trường Mầm non [Tên trường]';
      }
    }
    // Cập nhật mô tả với thông tin thật
    var cfg = STATS.config || {};
    var name = cfg.name || 'Trường Mầm non [Tên trường]';
    var addr = cfg.address || '[Xã/Phường], [Tỉnh/Thành phố]';
    var tcCount = STATS.totalTeachers || 0;
    document.getElementById('aboutDesc1').textContent = name + ' tọa lạc tại ' + addr + '. Trường luôn nỗ lực xây dựng môi trường giáo dục an toàn, thân thiện.';
    if(tcCount) document.getElementById('aboutDesc2').textContent = 'Với đội ngũ ' + tcCount + ' CB,GV,NV tận tâm, nhà trường cam kết mang đến chương trình giáo dục chất lượng cao.';
  }

  // ============ HERO CAROUSEL (ảnh từ Sheet "Hinh Anh") ============
  const TYPE_LABELS = {truong:'Toàn cảnh',hoatdong:'Hoạt động',banru:'Bán trú',lehoi:'Lễ hội'};

  function renderCarousel(){
    if(!IMAGES.length) return;
    const carousel = document.getElementById('carousel');
    carousel.textContent = ''; // clear

    IMAGES.forEach((img) => {
      const safeUrl = _safeImageUrl(img.url);
      const tag = TYPE_LABELS[img.type] || img.type || 'Mới';

      const slide = document.createElement('div');
      slide.className = 'slide';
      if(safeUrl){
        // Gán qua property — CSS parser nhận diện url() như 1 giá trị, không thể inject property khác.
        slide.style.backgroundImage = "linear-gradient(180deg,transparent 50%,rgba(0,0,0,.3)),url('" + safeUrl + "')";
      }

      const caption = document.createElement('div');
      caption.className = 'slide-caption';

      const inner = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = img.title || '';
      const span = document.createElement('span');
      span.textContent = img.desc || '';
      inner.appendChild(strong);
      inner.appendChild(span);

      const tagSpan = document.createElement('span');
      tagSpan.className = 'slide-tag';
      tagSpan.dataset.type = img.type || '';
      tagSpan.textContent = tag;

      caption.appendChild(inner);
      caption.appendChild(tagSpan);
      slide.appendChild(caption);
      carousel.appendChild(slide);
    });

    const slides = carousel.querySelectorAll('.slide');
    let current = 0;
    const total = slides.length;
    function render(){
      slides.forEach((s, i) => {
        s.classList.remove('active','next','prev');
        if(i === current) s.classList.add('active');
        else if(i === (current+1)%total) s.classList.add('next');
        else if(i === (current-1+total)%total) s.classList.add('prev');
      });
    }
    // Cleanup timer cũ nếu renderCarousel được gọi lại (vd: sau khi update IMAGES từ admin)
    if(window._carouselTimer){ clearInterval(window._carouselTimer); window._carouselTimer = null; }
    // Skip auto-rotate khi tab ẩn (document.hidden) → tiết kiệm CPU/pin trên mobile.
    window._carouselTimer = setInterval(() => {
      if(document.hidden) return;
      current = (current+1)%total;
      render();
    }, 5000);
    render();
  }


  // ============ MINH CHỨNG KĐCL ============
  let MINHCHUNG = [];
  const MC_TC_ICONS = ['🏫','👩‍🏫','🏢','🤝','👶'];

  // ===== SEED MC: Khung 5 TC / 22 TCh — CẬP NHẬT THEO BẢNG MỚI 2025-2026 (đồng bộ DATA_MINHCHUNG) =====
  // Schema mỗi evidence: { tt, code, content, issueDate, hssRef, link, responsible, note }
  // Lưu ý: 'issuer' (legacy) → 'responsible' (vai trò người PT, không ghi tên cụ thể)
  const MC_SEED = [
    { name:'Tiêu chuẩn 1', desc:'Tổ chức và quản lý nhà trường', criteria:[
      {code:'1.1', desc:'Phương hướng, chiến lược xây dựng và phát triển nhà trường', evidences:[
        {tt:'1',code:'[H1-1.1-01]',content:'Kế hoạch chiến lược xây dựng phát triển nhà trường giai đoạn 2025-2030, tầm nhìn đến 2035',issueDate:'Giai đoạn 2025-2030',hssRef:'1.1.1',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'2',code:'[H1-1.1-02]',content:'Kế hoạch phát triển nhà trường năm học (KH năm)',issueDate:'Năm học 2025-2026',hssRef:'1.1.2',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'3',code:'[H1-1.1-03]',content:'Biên bản họp hội đồng sư phạm',issueDate:'Năm học 2025-2026',hssRef:'1.1.4',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'4',code:'[H1-1.1-04]',content:'Tài liệu Hội nghị Viên chức - Người lao động',issueDate:'Năm học 2025-2026',hssRef:'1.1.5',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'5',code:'[H1-1.1-05]',content:'Báo cáo sơ kết, tổng kết năm học',issueDate:'Năm học 2025-2026',hssRef:'1.1.6',link:'',responsible:'Hiệu trưởng',note:''}
      ]},
      {code:'1.2', desc:'Hội đồng trường và các hội đồng khác', evidences:[
        {tt:'1',code:'[H1-1.2-01]',content:'Hồ sơ thi đua, khen thưởng (QĐ thành lập HĐ TĐKT; Quy chế nội bộ; Hồ sơ đề nghị; Các QĐ công nhận; Sổ theo dõi)',issueDate:'Năm học 2025-2026',hssRef:'1.2.1.1; 1.2.1.2; 1.2.1.3; 1.2.1.4; 1.2.1.5',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'2',code:'[H1-1.2-02]',content:'Hồ sơ SKKN (Danh sách đăng ký; QĐ thành lập HĐ chấm; Biên bản chấm; Phiếu chấm; QĐ công nhận; Tờ trình đề nghị; Kết quả các cấp)',issueDate:'Năm học 2025-2026',hssRef:'1.2.2',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'3',code:'[H1-1.2-03]',content:'Hồ sơ thi giáo viên giỏi (KH hội thi cấp trường; QĐ thành lập HĐ chấm; Tổng hợp kết quả; QĐ và danh sách đạt danh hiệu)',issueDate:'Năm học 2025-2026',hssRef:'1.2.3',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''}
      ]},
      {code:'1.3', desc:'Tổ chức Đảng Cộng sản Việt Nam, các đoàn thể và tổ chức khác trong nhà trường', evidences:[
        {tt:'1',code:'[H1-1.3-01]',content:'Hồ sơ Chi bộ (QĐ chuẩn y cấp ủy; Biên bản họp Chi ủy/Chi bộ; Nghị quyết; Chương trình kiểm tra giám sát; Báo cáo; Sổ theo dõi đảng viên)',issueDate:'Năm học 2025-2026',hssRef:'1.3.1.1; 1.3.1.2; 1.3.1.3; 1.3.1.4; 1.3.1.5; 1.3.1.6',link:'',responsible:'Bí thư / Phó Bí thư Chi bộ',note:''},
        {tt:'2',code:'[H1-1.3-02]',content:'Hồ sơ Chi đoàn (QĐ chuẩn y BCH; Kế hoạch; Biên bản sinh hoạt từng nhiệm kỳ)',issueDate:'Năm học 2025-2026',hssRef:'1.3.2',link:'',responsible:'Bí thư Chi đoàn',note:''},
        {tt:'3',code:'[H1-1.3-03]',content:'Hồ sơ Ban thanh tra nhân dân (QĐ công nhận BTTND; Chương trình, kế hoạch giám sát; Báo cáo hàng năm)',issueDate:'Năm học 2025-2026',hssRef:'1.3.3',link:'',responsible:'Trưởng Ban thanh tra nhân dân',note:''}
      ]},
      {code:'1.4', desc:'Hiệu trưởng, phó hiệu trưởng, tổ chuyên môn và tổ văn phòng', evidences:[
        {tt:'1',code:'[H1-1.4-01]',content:'Hồ sơ quản lý nhân sự: QĐ bổ nhiệm Hiệu trưởng, Phó Hiệu trưởng',issueDate:'Năm học 2025-2026',hssRef:'1.4.1',link:'',responsible:'Hiệu trưởng, Phó Hiệu trưởng',note:''},
        {tt:'2',code:'[H1-1.4-02]',content:'Hồ sơ tổ chức cán bộ: QĐ thành lập tổ; bổ nhiệm Tổ trưởng, Tổ phó',issueDate:'Năm học 2025-2026',hssRef:'1.4.2',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'3',code:'[H1-1.4-03]',content:'Hồ sơ tổ chuyên môn (Tổ nhà trẻ; Tổ mẫu giáo)',issueDate:'Năm học 2025-2026',hssRef:'1.4.3; 1.4.4',link:'',responsible:'Tổ trưởng CM (Nhà trẻ / Mẫu giáo)',note:''},
        {tt:'4',code:'',content:'Báo cáo sơ kết, tổng kết năm học',issueDate:'Năm học 2025-2026',hssRef:'1.1.6',link:'',responsible:'Hiệu trưởng',note:'[H1-1.1-05]'}
      ]},
      {code:'1.5', desc:'Tuyển sinh, tổ chức nhóm trẻ và lớp mẫu giáo', evidences:[
        {tt:'1',code:'[H1-1.5-01]',content:'Hồ sơ tuyển sinh (KH tuyển sinh; Quy chế; Thông báo; Danh sách dự tuyển/trúng tuyển; Biên bản họp HĐ tuyển sinh)',issueDate:'Năm học 2025-2026',hssRef:'1.5.2',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''},
        {tt:'2',code:'',content:'Kế hoạch phát triển nhà trường năm học',issueDate:'Năm học 2025-2026',hssRef:'1.1.2',link:'',responsible:'Hiệu trưởng',note:'[H1-1.1-02]'},
        {tt:'3',code:'[H1-1.5-02]',content:'Hồ sơ quản lý trẻ khuyết tật học hòa nhập (Danh sách + hồ sơ trẻ khuyết tật tại các lớp)',issueDate:'Năm học 2025-2026',hssRef:'1.5.3',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''},
        {tt:'4',code:'[H1-1.5-03]',content:'Hồ sơ quản lý trẻ em (Danh bạ trẻ + Phần mềm theo dõi trẻ)',issueDate:'Năm học 2025-2026',hssRef:'1.5.1',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''},
        {tt:'5',code:'[H1-1.5-04]',content:'Hồ sơ phổ cập GDMNTENT (Sổ theo dõi phổ cập; Danh sách trẻ HTCTGDMN; Danh sách trẻ chuyển đi/đến)',issueDate:'Năm học 2025-2026',hssRef:'1.5.4',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''}
      ]},
      {code:'1.6', desc:'Quản lý hành chính, tài chính và tài sản', evidences:[
        {tt:'1',code:'[H1-1.6-01]',content:'Hồ sơ quản lý hành chính (Công văn đi/đến; Phần mềm quản lý văn bản)',issueDate:'Năm học 2025-2026',hssRef:'1.6.1.1; 1.6.1.2',link:'',responsible:'Nhân viên Văn phòng',note:''},
        {tt:'2',code:'[H1-1.6-02]',content:'Hồ sơ quản lý tài chính (Quy chế chi tiêu nội bộ; Dự toán; Báo cáo quyết toán)',issueDate:'Năm học 2025-2026',hssRef:'1.6.2.1; 1.6.2.2; 1.6.2.3',link:'',responsible:'Nhân viên Kế toán',note:''},
        {tt:'3',code:'[H1-1.6-03]',content:'Hồ sơ quản lý tài sản (Biên bản kiểm tra khảo sát CSVC; KH mua sắm/sửa chữa; QĐ Ban QLCSVC; Sổ tổng hợp; QĐ phân bổ; Biên bản bàn giao/kiểm kê)',issueDate:'Năm học 2025-2026',hssRef:'1.6.3.1; 1.6.3.2; 1.6.3.3; 1.6.3.4; 1.6.3.5',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:''},
        {tt:'4',code:'[H1-1.6-04]',content:'Quy chế quản lý, sử dụng tài sản công trong trường học',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:''}
      ]},
      {code:'1.7', desc:'Quản lý cán bộ, giáo viên và nhân viên', evidences:[
        {tt:'1',code:'[H1-1.7-01]',content:'Hồ sơ quản lý chuyên môn (KH bồi dưỡng năng lực CMNV cho CB-GV-NV; Kết quả bồi dưỡng CMNV)',issueDate:'Năm học 2025-2026',hssRef:'1.7.1',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''},
        {tt:'2',code:'',content:'Hồ sơ tổ chức cán bộ (QĐ phân công nhiệm vụ + Sổ theo dõi CB-GV-NV)',issueDate:'Năm học 2025-2026',hssRef:'1.7.2',link:'',responsible:'Hiệu trưởng',note:'[H1-1.4-02]'},
        {tt:'3',code:'',content:'Hồ sơ thi đua, khen thưởng',issueDate:'Năm học 2025-2026',hssRef:'1.2.1',link:'',responsible:'Hiệu trưởng',note:'[H1-1.2-01]'}
      ]},
      {code:'1.8', desc:'Quản lý các hoạt động giáo dục', evidences:[
        {tt:'1',code:'[H1-1.8-01]',content:'Kế hoạch giáo dục năm học của nhà trường',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'2',code:'[H1-1.8-02]',content:'Hồ sơ giáo viên: KH giáo dục năm nhóm/lớp; KH chăm sóc giáo dục trẻ từng chủ đề',issueDate:'Năm học 2025-2026',hssRef:'1.8.1',link:'',responsible:'Giáo viên',note:''},
        {tt:'3',code:'[H1-1.8-03]',content:'Kế hoạch hoạt động lễ hội, tham quan trải nghiệm',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''},
        {tt:'4',code:'[H1-1.8-04]',content:'Hồ sơ giáo dục tăng cường, lồng ghép (Tiếng Anh tăng cường; Aerobic)',issueDate:'Năm học 2025-2026',hssRef:'1.8.3',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''},
        {tt:'5',code:'[H1-1.8-05]',content:'Hồ sơ kiểm tra nội bộ',issueDate:'Năm học 2025-2026',hssRef:'1.7.3',link:'',responsible:'Hiệu trưởng',note:''}
      ]},
      {code:'1.9', desc:'Thực hiện quy chế dân chủ cơ sở', evidences:[
        {tt:'1',code:'[H1-1.9-01]',content:'Bộ quy chế của nhà trường: Hồ sơ quy chế dân chủ',issueDate:'Năm học 2025-2026',hssRef:'1.9.1',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'2',code:'',content:'Hồ sơ Hội nghị Viên chức - Người lao động',issueDate:'Năm học 2025-2026',hssRef:'1.1.5',link:'',responsible:'Hiệu trưởng',note:'[H1-1.1-04]'},
        {tt:'3',code:'',content:'Hồ sơ Ban Thanh tra nhân dân',issueDate:'Năm học 2025-2026',hssRef:'1.3.3',link:'',responsible:'Trưởng Ban TTND',note:'[H1-1.3-03]'},
        {tt:'4',code:'[H1-1.9-02]',content:'Hồ sơ công khai theo Thông tư 36/2017',issueDate:'Năm học 2025-2026',hssRef:'1.9.2',link:'',responsible:'Hiệu trưởng',note:''}
      ]},
      {code:'1.10', desc:'Đảm bảo an ninh trật tự, an toàn trường học', evidences:[
        {tt:'1',code:'[H1-1.10-01]',content:'Hồ sơ PCCC',issueDate:'Năm học 2025-2026',hssRef:'1.10.1',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:''},
        {tt:'2',code:'[H1-1.10-02]',content:'Hồ sơ trường học an toàn, PCTNTT',issueDate:'Năm học 2025-2026',hssRef:'1.10.2',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:''},
        {tt:'3',code:'[H1-1.10-03]',content:'Hồ sơ bán trú (HĐ cung ứng thực phẩm; Thực đơn; Khẩu phần ăn; Sổ kiểm thực 3 bước; Sổ lưu mẫu thức ăn; Biên bản kiểm tra bếp ăn đủ ATTP; Kết quả xét nghiệm nước)',issueDate:'Năm học 2025-2026',hssRef:'1.10.3.1; 1.10.3.2; 1.10.3.3; 1.10.3.4; 1.10.3.5; 1.10.3.6; 1.10.3.7',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:''},
        {tt:'4',code:'',content:'Hồ sơ công khai TT 36/2017 (tiếp dân, hòm thư góp ý)',issueDate:'Năm học 2025-2026',hssRef:'1.9.2',link:'',responsible:'Hiệu trưởng',note:'[H1-1.9-02]'},
        {tt:'5',code:'',content:'Bộ quy chế của nhà trường',issueDate:'Năm học 2025-2026',hssRef:'1.10.5',link:'',responsible:'Hiệu trưởng',note:'[H1-1.9-01]'}
      ]}
    ]},
    { name:'Tiêu chuẩn 2', desc:'Cán bộ quản lý, giáo viên, nhân viên', criteria:[
      {code:'2.1', desc:'Đối với hiệu trưởng, phó hiệu trưởng', evidences:[
        {tt:'1',code:'',content:'Hồ sơ QL nhân sự (QĐ bổ nhiệm CBQL; Văn bằng chứng chỉ HT, PHT; Kết quả đánh giá xếp loại chuẩn HT, PHT)',issueDate:'Năm học 2025-2026',hssRef:'2.1',link:'',responsible:'Hiệu trưởng',note:'[H1-1.4-01]'},
        {tt:'2',code:'',content:'Hồ sơ QL chuyên môn: Hồ sơ bồi dưỡng năng lực CMNV cho CBQL',issueDate:'Năm học 2025-2026',hssRef:'1.8.1',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.7-01]'}
      ]},
      {code:'2.2', desc:'Đối với giáo viên', evidences:[
        {tt:'1',code:'',content:'Hồ sơ tổ chức cán bộ: Sổ theo dõi CB-QL-GV-NV',issueDate:'Năm học 2025-2026',hssRef:'2.2',link:'',responsible:'Hiệu trưởng',note:'[H1-1.4-02]'},
        {tt:'2',code:'',content:'Hồ sơ quản lý nhân sự của giáo viên',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:'[H1-1.4-01]'},
        {tt:'3',code:'',content:'Hồ sơ QL chuyên môn: KH bồi dưỡng cho GV',issueDate:'Năm học 2025-2026',hssRef:'1.8.2',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.7-01]'},
        {tt:'4',code:'[H2-2.2-01]',content:'Hồ sơ đánh giá xếp loại (Đánh giá xếp loại viên chức; Đánh giá theo Chuẩn nghề nghiệp GVMN)',issueDate:'Năm học 2025-2026',hssRef:'2.3; 2.3.1; 2.3.2',link:'',responsible:'Hiệu trưởng',note:''}
      ]},
      {code:'2.3', desc:'Đối với nhân viên', evidences:[
        {tt:'1',code:'',content:'Hồ sơ tổ chức cán bộ: QĐ phân công nhiệm vụ nhân viên',issueDate:'Năm học 2025-2026',hssRef:'2.2.1',link:'',responsible:'Hiệu trưởng',note:'[H1-1.4-02]'},
        {tt:'2',code:'',content:'Hồ sơ quản lý nhân sự của nhân viên (Hồ sơ cá nhân)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:'[H1-1.4-01]'},
        {tt:'3',code:'[H2-2.1-01]',content:'Hồ sơ đánh giá xếp loại nhân viên (Đánh giá viên chức nhân viên hằng năm)',issueDate:'Năm học 2025-2026',hssRef:'2.3',link:'',responsible:'Hiệu trưởng',note:''}
      ]}
    ]},
    { name:'Tiêu chuẩn 3', desc:'Cơ sở vật chất và thiết bị dạy học', criteria:[
      {code:'3.1', desc:'Địa điểm, quy mô, diện tích đảm bảo theo quy định của Bộ Giáo dục và Đào tạo', evidences:[
        {tt:'1',code:'',content:'Hồ sơ quản lý đất đai (Giấy chứng nhận QSD đất; Sơ đồ quy hoạch nhà trường; Bản thiết kế xây dựng)',issueDate:'Năm học 2025-2026',hssRef:'3.1',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:'[H1-1.6-03]'},
        {tt:'2',code:'',content:'Kế hoạch phát triển nhà trường',issueDate:'Năm học 2025-2026',hssRef:'1.1.2',link:'',responsible:'Hiệu trưởng',note:'[H1-1.1-02]'}
      ]},
      {code:'3.2', desc:'Các hạng mục công trình đảm bảo tiêu chuẩn cơ sở vật chất mức độ 1 đối với trường mầm non', evidences:[
        {tt:'1',code:'[H3-3.2-01]',content:'Danh mục các khối phòng: hành chính, nuôi dưỡng - CSGD trẻ, tổ chức ăn, phụ trợ (Phần mềm cơ sở dữ liệu ngành)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'2',code:'',content:'Hồ sơ quản lý tài sản',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:'[H1-1.6-03]'},
        {tt:'3',code:'',content:'Hồ sơ bán trú: Biên bản kiểm tra bếp ăn đủ điều kiện ATTP',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:'[H1-1.10-03]'}
      ]},
      {code:'3.3', desc:'Hạ tầng kỹ thuật, các hạng mục công trình kiên cố và thiết bị dạy học', evidences:[
        {tt:'1',code:'',content:'Hồ sơ bán trú: Kết quả xét nghiệm nước dùng nấu ăn cho học sinh',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Nhân viên Y tế',note:'[H1-1.10-03]'},
        {tt:'2',code:'[H3-3.3-01]',content:'Hạ tầng CNTT (Hệ thống mạng, máy tính, camera, thiết bị trình chiếu)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'3',code:'',content:'Hồ sơ PCCC',issueDate:'Năm học 2025-2026',hssRef:'1.10.1',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:'[H1-1.10-01]'},
        {tt:'4',code:'',content:'Hồ sơ quản lý tài sản (Tổng hợp tài sản; Danh mục đồ dùng đồ chơi; Biên bản kiểm kê)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CSVC)',note:'[H1-1.6-03]'}
      ]}
    ]},
    { name:'Tiêu chuẩn 4', desc:'Quan hệ giữa nhà trường, gia đình và xã hội', criteria:[
      {code:'4.1', desc:'Ban đại diện cha mẹ trẻ', evidences:[
        {tt:'1',code:'[H4-4.1-01]',content:'Hồ sơ Ban đại diện cha mẹ trẻ (Danh sách BĐDCMHS; KH hoạt động; Biên bản họp phụ huynh; Biên bản kiểm tra giám sát; Sổ thu chi quỹ; Quy chế phối hợp)',issueDate:'Năm học 2025-2026',hssRef:'4.1',link:'',responsible:'Hiệu trưởng',note:''}
      ]},
      {code:'4.2', desc:'Công tác tham mưu cấp ủy đảng, chính quyền và phối hợp với các tổ chức, cá nhân của nhà trường', evidences:[
        {tt:'1',code:'[H4-4.2-01]',content:'Hồ sơ tham mưu (Các loại tờ trình tham mưu UBND xã, Sở GD&ĐT)',issueDate:'Năm học 2025-2026',hssRef:'4.2',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'2',code:'[H4-4.2-02]',content:'Hồ sơ tổ chức các chuyên đề phối hợp (KH phối hợp đoàn thể; KH tổng kết chuyên đề; Báo cáo thực hiện chuyên đề)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''},
        {tt:'3',code:'[H4-4.2-03]',content:'Hồ sơ an ninh trật tự (Quy chế phối hợp đảm bảo ANTT trường học với công an xã)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:''},
        {tt:'4',code:'[H4-4.2-04]',content:'Hồ sơ Y tế trường học (HĐ chăm sóc SK ban đầu với trạm y tế xã; KH kiểm tra SK; HĐ khám SK chuyên khoa; KH PCD; KH ATTP)',issueDate:'Năm học 2025-2026',hssRef:'5.2',link:'',responsible:'Nhân viên Y tế',note:''},
        {tt:'5',code:'',content:'Biên bản họp hội đồng sư phạm',issueDate:'Năm học 2025-2026',hssRef:'1.1.4',link:'',responsible:'Hiệu trưởng',note:'[H1-1.1-03]'},
        {tt:'6',code:'[H4-4.2-05]',content:'Hồ sơ vận động tài trợ, xã hội hóa giáo dục (VĐTT)',issueDate:'Năm học 2025-2026',hssRef:'4.3',link:'',responsible:'Hiệu trưởng',note:''}
      ]}
    ]},
    { name:'Tiêu chuẩn 5', desc:'Hoạt động và kết quả nuôi dưỡng, chăm sóc, giáo dục trẻ', criteria:[
      {code:'5.1', desc:'Thực hiện Chương trình giáo dục mầm non', evidences:[
        {tt:'1',code:'',content:'Kế hoạch giáo dục năm học của nhà trường',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:'[H1-1.8-01]'},
        {tt:'2',code:'[H5-5.1-01]',content:'Hồ sơ CB-GV-NV (KH giáo dục nhóm/lớp; KH ND-CSGD các chủ đề; Đánh giá trẻ cuối chủ đề; Phiếu đánh giá phát triển cá nhân trẻ; Phiếu tổng hợp đánh giá cuối năm; Phiếu đánh giá trẻ cuối độ tuổi)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Giáo viên',note:''},
        {tt:'3',code:'',content:'Kế hoạch hoạt động lễ hội, tham quan trải nghiệm',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.8-03]'},
        {tt:'4',code:'',content:'Hồ sơ giáo dục tăng cường, lồng ghép (Tiếng Anh; Aerobic)',issueDate:'Năm học 2025-2026',hssRef:'1.8.3',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.8-04]'},
        {tt:'5',code:'[H5-5.1-02]',content:'Hồ sơ đánh giá trẻ (Tổng hợp kết quả phát triển trẻ theo khối; Tổng hợp toàn trường năm học)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CM)',note:''}
      ]},
      {code:'5.2', desc:'Tổ chức hoạt động nuôi dưỡng, chăm sóc và giáo dục mầm non, có điều chỉnh kịp thời phù hợp', evidences:[
        {tt:'1',code:'',content:'Kế hoạch giáo dục năm học của nhà trường',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Hiệu trưởng',note:'[H1-1.1-01]'},
        {tt:'2',code:'',content:'Kế hoạch hoạt động lễ hội, tham quan trải nghiệm',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.8-03]'},
        {tt:'3',code:'',content:'Hồ sơ giáo dục tăng cường (Tiếng Anh; Aerobic)',issueDate:'Năm học 2025-2026',hssRef:'1.8.3',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.8-04]'},
        {tt:'4',code:'',content:'Hồ sơ tổ chức các chuyên đề phối hợp',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H4-4.2-02]'},
        {tt:'5',code:'',content:'Hồ sơ CB-GV-NV (KH ND-CSGD; Đánh giá trẻ; KH GD nhóm/lớp; Phiếu đánh giá)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Giáo viên',note:'[H5-5.1-01]'}
      ]},
      {code:'5.3', desc:'Kết quả nuôi dưỡng, chăm sóc sức khỏe', evidences:[
        {tt:'1',code:'',content:'Hồ sơ Y tế trường học (đầy đủ: QĐ Ban chỉ đạo y tế; HĐ chăm sóc SK ban đầu; KH kiểm tra SK; HĐ khám SK chuyên khoa; KH phòng chống dịch; KH ATTP; KH hoạt động y tế; KH phục hồi trẻ suy dinh dưỡng; Sổ theo dõi SK trẻ - phần mềm; Tổng hợp cân đo khám SK; Sổ cấp phát thuốc; Bảng chấm điểm; Báo cáo khám SK định kỳ)',issueDate:'Năm học 2025-2026',hssRef:'5.3',link:'',responsible:'Nhân viên Y tế',note:'[H4-4.2-04]'}
      ]},
      {code:'5.4', desc:'Kết quả giáo dục', evidences:[
        {tt:'1',code:'',content:'Hồ sơ đánh giá trẻ (Tổng hợp kết quả phát triển trẻ theo khối; Tổng hợp toàn trường)',issueDate:'Năm học 2025-2026',hssRef:'',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H5-5.1-02]'},
        {tt:'2',code:'',content:'Hồ sơ quản lý trẻ khuyết tật học hòa nhập',issueDate:'Năm học 2025-2026',hssRef:'1.5.3',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.5-02]'},
        {tt:'3',code:'',content:'Hồ sơ quản lý trẻ em (Danh bạ trẻ + Phần mềm)',issueDate:'Năm học 2025-2026',hssRef:'1.5.1',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.5-03]'},
        {tt:'4',code:'',content:'Hồ sơ phổ cập GDMN cho trẻ em 5 tuổi',issueDate:'Năm học 2025-2026',hssRef:'1.5.4',link:'',responsible:'Phó Hiệu trưởng (CM)',note:'[H1-1.5-04]'},
        {tt:'5',code:'',content:'Báo cáo tổng kết năm học',issueDate:'Năm học 2025-2026',hssRef:'1.1.6',link:'',responsible:'Hiệu trưởng',note:'[H1-1.1-05]'}
      ]}
    ]}
  ];

  // Merge dữ liệu GAS vào SEED — giữ minh chứng cũ, bổ sung tiêu chí còn thiếu theo TT 19/2018
  function mergeMCSeed(fromGAS){
    const src = Array.isArray(fromGAS) ? fromGAS : [];
    return MC_SEED.map((seedTC, i) => {
      const matched = src.find(g => (g.name||'').trim() === seedTC.name) || src[i] || {};
      const gasCriteria = matched.criteria || [];
      // Tập các code tiêu chí trong seed (VD: {'3.1','3.2','3.3'})
      const seedCodes = new Set(seedTC.criteria.map(c => c.code));
      // Các tiêu chí cũ trong GAS KHÔNG còn trong seed (VD: 3.4, 3.5, 3.6 cũ khi TT 22/2024 gộp)
      // → gom tất cả minh chứng mồ côi để dồn vào tiêu chí CUỐI CÙNG của seed (không mất dữ liệu)
      const orphanEvidences = [];
      gasCriteria.forEach(gCh => {
        const code = (gCh.code||'').trim();
        if (!seedCodes.has(code) && Array.isArray(gCh.evidences)) {
          gCh.evidences.forEach(ev => orphanEvidences.push(ev));
        }
      });
      return {
        name: seedTC.name,
        desc: seedTC.desc,  // luôn dùng desc từ seed (đúng chuẩn TT 22/2024)
        criteria: seedTC.criteria.map((seedCH, idx) => {
          const matchedCH = gasCriteria.find(g => (g.code||'').trim() === seedCH.code) || {};
          const gasEv = Array.isArray(matchedCH.evidences) ? matchedCH.evidences : [];
          // Nếu GAS có evidences → dùng GAS (user custom); không thì fallback về seed evidences (TT 22/2024)
          let evidences = gasEv.length > 0 ? gasEv.slice() : (Array.isArray(seedCH.evidences) ? seedCH.evidences.slice() : []);
          // Tiêu chí cuối cùng của tiêu chuẩn → nhận thêm các MC mồ côi
          if (idx === seedTC.criteria.length - 1 && orphanEvidences.length) {
            evidences = evidences.concat(orphanEvidences);
          }
          return {
            code: seedCH.code,
            desc: seedCH.desc,  // luôn dùng desc từ seed
            evidences: evidences
          };
        })
      };
    });
  }

  // Auto-link: tìm link HSS từ mã hồ sơ (VD: "1.1.1" → link Drive)
  function findHSSByCode(code){
    if(!code || !HSS.length) return null;
    code = String(code).trim();
    let found = null;
    (function walk(nodes){
      for(let n of nodes){
        if(n.code === code) { found = n; return; }
        if(n.children && !found) walk(n.children);
      }
    })(HSS);
    return found;
  }

  function renderMinhChung(){
    const wrap = document.getElementById('mcWrap');
    if(!MINHCHUNG || !MINHCHUNG.length){
      wrap.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">Chưa có dữ liệu minh chứng.</p>';
      return;
    }
    // Count
    let totalEv = 0, linkedEv = 0;
    MINHCHUNG.forEach(tc => (tc.criteria||[]).forEach(chi => (chi.evidences||[]).forEach(ev => {
      totalEv++;
      const hss = findHSSByCode(ev.hssRef);
      if(hss && hss.link) linkedEv++;
    })));

    document.getElementById('mcStatsBar').innerHTML =
      `<div class="mc-stat"><b>${MINHCHUNG.length}</b><small>Tiêu chuẩn</small></div>
       <div class="mc-stat"><b>${MINHCHUNG.reduce((s,tc)=>s+(tc.criteria||[]).length,0)}</b><small>Tiêu chí</small></div>
       <div class="mc-stat"><b>${totalEv}</b><small>Minh chứng</small></div>
       <div class="mc-stat"><b>${linkedEv}/${totalEv}</b><small>Đã liên kết HSS</small></div>`;

    wrap.innerHTML = MINHCHUNG.map((tc, ti) => {
      const totalInTC = (tc.criteria||[]).reduce((s,c)=>s+(c.evidences||[]).length,0);
      let chiHtml = (tc.criteria||[]).map(chi => {
        const rows = (chi.evidences||[]).map(ev => {
          // Tách mã HSS + link tương ứng — mỗi mã = 1 chip riêng
          const hssCodes = String(ev.hssRef||'').split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
          const linkLines = String(ev.link||'').split('\n').map(s=>s.trim()).filter(Boolean);
          let chipsHtml = '';
          if(hssCodes.length){
            chipsHtml = '<div class="mc-hss-chips">' + hssCodes.map((raw, i) => {
              const m = raw.match(/(\d+(?:\.\d+)+)/);
              const cleanCode = m ? m[1] : raw;
              // Ưu tiên link cùng index (đã đồng bộ ev.link) → fallback: tra cứu từ HSS tree
              let chipLink = linkLines[i] || '';
              if(!chipLink && m){
                const node = findHSSByCode(m[1]);
                if(node && node.link) chipLink = node.link;
              }
              if(chipLink){
                return '<a class="mc-hss-chip" href="'+escapeHtml(chipLink)+'" target="_blank" rel="noopener" title="Mở Hồ sơ '+escapeHtml(cleanCode)+' trên Drive">📁 '+escapeHtml(cleanCode)+'</a>';
              }
              return '<span class="mc-hss-chip empty" title="Hồ sơ '+escapeHtml(cleanCode)+' chưa có link Drive">📁 '+escapeHtml(cleanCode)+'</span>';
            }).join('') + '</div>';
          }
          // MC tham chiếu = không có mã riêng, dùng cột Ghi chú trỏ đến MC khác
          const isRef = !ev.code && !!ev.note;
          const codeDisplay = ev.code || (ev.note ? '→ ' + ev.note : '');
          const codeClass = isRef ? 'mc-code mc-code-ref' : 'mc-code';
          const rowClass = isRef ? 'mc-row-ref' : '';
          return '<tr class="'+rowClass+'" data-mc="'+(ev.code+' '+ev.content).toLowerCase().replace(/"/g,'')+'">'+
            '<td data-lbl="TT">'+(ev.tt||'')+'</td>'+
            '<td data-lbl="Mã MC" class="'+codeClass+'">'+escapeHtml(codeDisplay)+'</td>'+
            '<td data-lbl="Tên MC" class="mc-content mc-content-cell">'+escapeHtml(ev.content||'').replace(/\n/g,'<br>')+'</td>'+
            '<td data-lbl="Ngày BH">'+escapeHtml(ev.issueDate||'')+'</td>'+
            '<td data-lbl="Nơi lưu (HSS)">'+chipsHtml+'</td>'+
            '<td data-lbl="Người phụ trách">'+escapeHtml(ev.responsible||'')+'</td></tr>';
        }).join('');
        return '<div class="mc-tchi">'+
          '<div class="mc-tchi-label"><span class="code">'+escapeHtml(chi.code)+'</span>'+escapeHtml(chi.desc)+'</div>'+
          '<table class="mc-table"><thead><tr><th>TT</th><th>Mã MC</th><th>Tên minh chứng</th><th>Số/ngày BH</th><th>Nơi lưu (HSS)</th><th>Người phụ trách</th></tr></thead>'+
          '<tbody>'+rows+'</tbody></table></div>';
      }).join('');
      return '<div class="mc-tc"><div class="mc-tc-head" onclick="this.parentElement.classList.toggle(\'open\')">'+
        '<div class="mc-tc-title"><div class="mc-tc-icon">'+(MC_TC_ICONS[ti]||'📋')+'</div>'+
        '<div><h4>'+escapeHtml(tc.name)+'</h4><span>'+escapeHtml(tc.desc)+'</span></div></div>'+
        '<div class="mc-tc-meta"><span class="mc-tc-badge">'+totalInTC+' MC</span>'+
        '<span class="mc-tc-toggle">▸</span></div></div>'+
        '<div class="mc-tc-body">'+chiHtml+'</div></div>';
    }).join('');
  }

  // ========== IN BẢNG MÃ HÓA MINH CHỨNG (theo mẫu Phụ lục CV 5942/BGDĐT-QLCL) ==========
  // Wrapper: fetch DỮ LIỆU MỚI NHẤT từ GAS (clear cache) → rồi mới in để đảm bảo
  // bảng in luôn khớp với Sheet "MinhChung" theo thời gian thực.
  async function printMinhChung(){
    // Nếu URL chưa cấu hình → in luôn data hiện có (không thể fetch)
    if(!isApiUrlValid()){
      if(!MINHCHUNG || !MINHCHUNG.length){
        alert('Chưa có dữ liệu minh chứng để in.');
        return;
      }
      return _doPrintMinhChung();
    }

    // Hiện overlay đang fetch
    const overlay = document.createElement('div');
    overlay.id = 'mcPrintFetchOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(20,40,30,.55);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)';
    overlay.innerHTML = '<div style="background:white;color:#1a3027;padding:28px 36px;border-radius:14px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4);max-width:400px"><div style="font-size:2.6rem;margin-bottom:12px;animation:spin 1.5s linear infinite;display:inline-block">🔄</div><div style="font-weight:600;font-size:1rem;margin-bottom:6px">Đang tải dữ liệu mới nhất…</div><div style="font-size:.82rem;color:#7a8a82">Để bảng in luôn chính xác theo thời gian thực</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(overlay);

    // Clear cache để buộc fetch tươi
    try { localStorage.removeItem(CACHE_KEY); } catch(e){}

    try {
      await new Promise((resolve, reject) => {
        fetchGAS(
          function(data){
            // Update cache
            _cacheSave(data);
            // Cập nhật MINHCHUNG global theo data mới nhất
            if(data.minhChung) MINHCHUNG = mergeMCSeed(data.minhChung);
            if(data.hss) HSS = data.hss;
            if(data.teachers) TEACHERS = data.teachers;
            if(data.stats) STATS = data.stats;
            resolve();
          },
          function(err){ reject(new Error(err || 'Fetch lỗi')); },
          2 // retries
        );
      });
      overlay.remove();
    } catch(e) {
      overlay.remove();
      if (!confirm('⚠ Không tải được dữ liệu mới nhất:\n  ' + (e.message || 'Lỗi') + '\n\nVẫn in với dữ liệu hiện có trên trình duyệt?')) {
        return;
      }
    }

    if(!MINHCHUNG || !MINHCHUNG.length){
      alert('Chưa có dữ liệu minh chứng để in.');
      return;
    }
    _doPrintMinhChung();
  }

  // Hàm thực hiện build HTML + in (tách riêng để wrapper async ở trên gọi)
  function _doPrintMinhChung(){
    const cfg = (STATS && STATS.config) || {};
    const schoolName = (cfg.name || 'Trường Mầm non [Tên trường]').toUpperCase();
    const schoolAddr = cfg.address || '';
    const schoolYear = cfg.schoolYear || '';
    // Tên Hiệu trưởng: ưu tiên admin config → tự lấy từ DSGV (role có "Hiệu trưởng" nhưng không có "Phó")
    let principal = (window._admGet && _admGet().principal) || '';
    if (!principal && Array.isArray(TEACHERS)) {
      const ht = TEACHERS.find(t => {
        const r = (t.role || '').toLowerCase();
        return r.includes('hiệu trưởng') && !r.includes('phó');
      });
      if (ht) principal = ht.name || '';
    }
    const today = new Date();
    const dd = today.getDate(), mm = today.getMonth()+1, yy = today.getFullYear();
    // Tách địa chỉ: ["Xã [Xã/Phường]", "[Tỉnh/Thành phố]"] → UBND lấy phần đầu (xã), location line cũng chỉ lấy xã (bỏ tỉnh)
    const addrParts = schoolAddr.split(',').map(s => s.trim()).filter(Boolean);
    const ubndLocation = 'UBND ' + (addrParts[0] || 'XÃ/PHƯỜNG').toUpperCase();
    const locShort = addrParts[0] || schoolAddr;

    // Xây dựng các dòng bảng
    let tbody = '';
    let grandStt = 0;
    MINHCHUNG.forEach((tc, ti) => {
      tbody += '<tr class="tc-row"><td colspan="7"><b>'+escapeHtml(tc.name)+':</b> '+escapeHtml(tc.desc)+'</td></tr>';
      (tc.criteria||[]).forEach(chi => {
        tbody += '<tr class="chi-row"><td></td><td colspan="6"><b>Tiêu chí '+escapeHtml(chi.code)+'.</b> '+escapeHtml(chi.desc)+'</td></tr>';
        (chi.evidences||[]).forEach((ev, ei) => {
          grandStt++;
          tbody += '<tr>'+
            '<td style="text-align:center">'+(ei+1)+'</td>'+
            '<td style="text-align:center"><b>'+escapeHtml(ev.code||'')+'</b></td>'+
            '<td>'+escapeHtml(ev.content||'').replace(/\n/g,'<br>')+'</td>'+
            '<td>'+escapeHtml(ev.issueDate||'')+'</td>'+
            '<td>'+escapeHtml(ev.hssRef||'')+'</td>'+         /* Nơi lưu HSS */
            '<td>'+escapeHtml(ev.responsible||'')+'</td>'+   /* Người phụ trách */
            '<td>'+escapeHtml(ev.note||'')+'</td>'+
          '</tr>';
        });
      });
    });

    const html = '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">'+
      '<title>Bảng mã hóa minh chứng - '+escapeHtml(schoolName)+'</title>'+
      '<style>'+
      /* Lề A4 ngang theo NĐ 30/2020 + CV 5942: lề trái 2cm (cho đóng quyển), phải 1.5cm, trên 1.5cm, dưới 1.5cm */
      '@page{size:A4 landscape;margin:1.5cm 1.5cm 1.5cm 2cm}'+
      'body{font-family:"Times New Roman",Times,serif;font-size:12pt;color:#000;line-height:1.4}'+
      '.letterhead{display:table;width:100%;margin-bottom:10pt}'+
      '.letterhead>div{display:table-cell;text-align:center;vertical-align:top;width:50%;font-size:11.5pt;line-height:1.35}'+
      '.letterhead .left b,.letterhead .right b{font-weight:bold;text-transform:uppercase}'+
      '.letterhead .left .line,.letterhead .right .line{display:inline-block;width:40%;border-top:1pt solid #000;margin-top:3pt}'+
      '.letterhead .right .motto{font-style:italic;font-weight:bold}'+
      '.title{text-align:center;margin:14pt 0 6pt}'+
      '.title h1{font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0 0 4pt}'+
      '.title h2{font-size:13pt;font-weight:bold;text-transform:uppercase;margin:0 0 5pt}'+
      '.title .sub{font-size:11.5pt;font-style:italic;margin-bottom:4pt}'+
      '.title .year{font-size:12pt;font-weight:bold;margin-top:4pt}'+
      'table{width:100%;border-collapse:collapse;margin-top:10pt;font-size:11pt;page-break-inside:auto}'+
      'tr{page-break-inside:avoid;page-break-after:auto}'+
      'thead{display:table-header-group}'+
      'th,td{border:1pt solid #000;padding:4pt 6pt;vertical-align:top;line-height:1.35}'+
      'th{background:#d9e8df !important;text-align:center;font-weight:bold;font-size:10.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      'tr.tc-row td{background:#b8dbc5 !important;font-size:11.5pt;font-weight:bold;padding:5pt 7pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      'tr.chi-row td{background:#eef5f0 !important;font-size:11pt;padding:4pt 7pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      'tr.chi-row td b{color:#1e6b54}'+
      '.col-stt{width:4%}.col-ma{width:11%}.col-ten{width:32%}.col-bh{width:13%}.col-hss{width:11%}.col-resp{width:18%}.col-ghi{width:11%}'+
      '.sign{margin-top:24pt;display:table;width:100%}'+
      '.sign-box{display:table-cell;text-align:center;width:45%;font-size:12pt;vertical-align:top}'+
      '.sign-box.right{margin-left:auto}'+
      '.sign .spacer{display:table-cell;width:10%}'+
      '.sign .loc{font-style:italic;margin-bottom:4pt;font-size:11.5pt}'+
      '.sign .role{font-weight:bold;text-transform:uppercase;margin-bottom:3pt}'+
      '.sign .note{font-style:italic;font-size:11pt;margin-bottom:42pt}'+
      '.sign .name{font-weight:bold;font-size:12pt}'+
      '.footnote{margin-top:16pt;font-size:10pt;color:#333;font-style:italic;text-align:center;border-top:1px dashed #999;padding-top:6pt}'+
      '@media print{.no-print{display:none}}'+
      '.print-bar{position:fixed;top:10px;right:10px;background:#2d8a6e;color:white;padding:10px 18px;border-radius:999px;font-family:sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:9999}'+
      '.print-bar button{background:white;color:#2d8a6e;border:none;padding:6px 14px;border-radius:999px;font-weight:bold;margin-left:10px;cursor:pointer;font-family:inherit}'+
      '</style></head><body>'+
      '<div class="no-print print-bar">👁 Xem trước bản in <button onclick="window.print()">🖨 In ngay</button> <button onclick="window.close()" style="background:#c04a2a;color:white">✕ Đóng</button></div>'+
      '<div class="letterhead">'+
        '<div class="left"><b>'+escapeHtml(ubndLocation)+'</b><br><b>'+escapeHtml(schoolName)+'</b><br><span class="line"></span></div>'+
        '<div class="right"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><span class="motto">Độc lập - Tự do - Hạnh phúc</span><br><span class="line"></span></div>'+
      '</div>'+
      '<div class="title">'+
        '<h1>BẢNG MÃ HÓA MINH CHỨNG</h1>'+
        '<h2>Kiểm định chất lượng giáo dục và công nhận đạt chuẩn quốc gia</h2>'+
        '<div class="sub">(Theo Thông tư số 19/2018/TT-BGDĐT ngày 22/8/2018, sửa đổi, bổ sung bởi Thông tư số 22/2024/TT-BGDĐT;<br>Hướng dẫn tại Công văn số 5942/BGDĐT-QLCL ngày 28/12/2018 của Bộ Giáo dục và Đào tạo)</div>'+
        (schoolYear ? '<div class="year">Năm học: '+escapeHtml(schoolYear)+'</div>' : '') +
      '</div>'+
      '<table>'+
        '<thead><tr>'+
          '<th class="col-stt">STT</th>'+
          '<th class="col-ma">Mã minh chứng</th>'+
          '<th class="col-ten">Tên minh chứng</th>'+
          '<th class="col-bh">Số/ngày ban hành<br>hoặc thời điểm khảo sát</th>'+
          '<th class="col-hss">Nơi lưu trên<br>Hồ sơ số</th>'+
          '<th class="col-resp">Bộ phận/<br>Người phụ trách</th>'+
          '<th class="col-ghi">Ghi chú</th>'+
        '</tr></thead>'+
        '<tbody>'+tbody+'</tbody>'+
      '</table>'+
      '<div class="sign">'+
        '<div class="sign-box">'+
          '<div class="role">Người lập bảng</div>'+
          '<div class="note">(Ký, ghi rõ họ tên)</div>'+
          '<div class="name">&nbsp;</div>'+
        '</div>'+
        '<div class="spacer"></div>'+
        '<div class="sign-box right">'+
          '<div class="loc">'+escapeHtml(locShort)+', ngày '+dd+' tháng '+mm+' năm '+yy+'</div>'+
          '<div class="role">Hiệu trưởng</div>'+
          '<div class="note">(Ký, ghi rõ họ tên, đóng dấu)</div>'+
          '<div class="name">'+escapeHtml(principal||'')+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="footnote">Tổng số: '+MINHCHUNG.length+' tiêu chuẩn · '+MINHCHUNG.reduce((s,tc)=>s+(tc.criteria||[]).length,0)+' tiêu chí · '+grandStt+' minh chứng</div>'+
      '</body></html>';

    // Dùng iframe ẩn thay vì window.open để tránh popup blocker
    let iframe = document.getElementById('mcPrintFrame');
    if(iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.id = 'mcPrintFrame';
    iframe.style.cssText = 'position:fixed;right:-9999px;bottom:-9999px;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    // Đợi render rồi mới in
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch(e) {
        // Fallback: mở cửa sổ mới
        const w = window.open('', '_blank');
        if(w){ w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
        else alert('Trình duyệt chặn cửa sổ in. Vui lòng cho phép popup và thử lại.');
      }
    }, 500);
  }

  // ============ XEM / IN DANH MỤC HỒ SƠ SỐ ============
  // Mở preview A4 ngang (lề trái 3cm, các phía 1.5cm — theo NĐ 30/2020 + yêu cầu user).
  // Gồm: letterhead Quốc hiệu + Tên trường, tiêu đề, bảng 4 cột (STT/Mã/Danh mục/Người PT),
  // group headers cho 6 Tiêu chuẩn + sub-groups, chữ ký Người lập + Hiệu trưởng.
  async function printDanhMucHSS(){
    if(!isApiUrlValid()){
      if(!HSS || !HSS.length){
        alert('Chưa có dữ liệu Hồ sơ số để in.');
        return;
      }
      return _doPrintDanhMucHSS();
    }
    // Hiện overlay đang fetch
    const overlay = document.createElement('div');
    overlay.id = 'hssPrintFetchOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(7,67,136,.55);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)';
    overlay.innerHTML = '<div style="background:white;color:#0f172a;padding:28px 36px;border-radius:14px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4);max-width:400px"><div style="font-size:2.6rem;margin-bottom:12px;animation:spin 1.5s linear infinite;display:inline-block">🔄</div><div style="font-weight:600;font-size:1rem;margin-bottom:6px">Đang tải dữ liệu mới nhất…</div><div style="font-size:.82rem;color:#64748b">Để Danh mục in luôn chính xác theo thời gian thực</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(overlay);

    try { localStorage.removeItem(CACHE_KEY); } catch(e){}

    try {
      await new Promise((resolve, reject) => {
        fetchGAS(
          function(data){
            _cacheSave(data);
            if(data.hss) HSS = data.hss;
            if(data.stats) STATS = data.stats;
            if(data.teachers) TEACHERS = data.teachers;
            resolve();
          },
          function(err){ reject(new Error(err || 'Fetch lỗi')); },
          2
        );
      });
      overlay.remove();
    } catch(e) {
      overlay.remove();
      if (!confirm('⚠ Không tải được dữ liệu mới nhất:\n  ' + (e.message || 'Lỗi') + '\n\nVẫn in với dữ liệu hiện có trên trình duyệt?')) {
        return;
      }
    }

    if(!HSS || !HSS.length){
      alert('Chưa có dữ liệu Hồ sơ số để in.');
      return;
    }
    _doPrintDanhMucHSS();
  }

  function _doPrintDanhMucHSS(){
    const cfg = (STATS && STATS.config) || {};
    const schoolName = (cfg.name || 'Trường Mầm non [Tên trường]').toUpperCase();
    const schoolAddr = cfg.address || '';
    const schoolYear = cfg.schoolYear || '';
    // Tên Hiệu trưởng — ưu tiên admin config, fallback từ DSGV
    let principal = (window._admGet && _admGet().principal) || '';
    if (!principal && Array.isArray(TEACHERS)) {
      const ht = TEACHERS.find(t => {
        const r = (t.role || '').toLowerCase();
        return r.includes('hiệu trưởng') && !r.includes('phó');
      });
      if (ht) principal = ht.name || '';
    }
    const today = new Date();
    const dd = today.getDate(), mm = today.getMonth()+1, yy = today.getFullYear();
    const addrParts = schoolAddr.split(',').map(s => s.trim()).filter(Boolean);
    const ubndLocation = 'UBND ' + (addrParts[0] || 'XÃ/PHƯỜNG').toUpperCase();
    const locShort = addrParts[0] || schoolAddr;

    // Walk HSS tree → flat rows
    const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X'];
    let tbody = '';
    let stt = 0;

    HSS.forEach(cat => {
      // Top-level header (Tiêu chuẩn 1, 2, ...) — chữ trắng nền navy
      const roman = ROMAN[parseInt(cat.code, 10)] || cat.code;
      tbody += '<tr class="cat-row"><td colspan="4"><b>' + roman + '. ' + escapeHtml(cat.name).toUpperCase() + '</b></td></tr>';

      function walkLevel(node, depth){
        if(node.leaf){
          stt++;
          tbody += '<tr>'+
            '<td style="text-align:center">'+stt+'</td>'+
            '<td style="text-align:center"><b>'+escapeHtml(node.code)+'</b></td>'+
            '<td>'+escapeHtml(node.name)+'</td>'+
            '<td>'+escapeHtml(node.assign||'')+'</td>'+
            '</tr>';
          return;
        }
        // Sub-group header (1.1, 1.2, hoặc nested 1.10.3...)
        if(depth >= 1){
          const dCls = 'd' + Math.min(depth, 3);
          tbody += '<tr class="grp-row '+dCls+'"><td colspan="4"><b>'+escapeHtml(node.code)+'.</b> '+escapeHtml(node.name)+'</td></tr>';
        }
        (node.children||[]).forEach(child => walkLevel(child, depth+1));
      }

      (cat.children||[]).forEach(child => walkLevel(child, 1));
    });

    const totalLeaves = stt;
    const totalCats = HSS.length;

    const html = '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">'+
      '<title>Danh mục Hồ sơ số - '+escapeHtml(schoolName)+'</title>'+
      '<style>'+
      /* Khổ A4 ngang. Lề: trái 3cm (đóng quyển), phải 1.5cm, trên 1.5cm, dưới 1.5cm — theo yêu cầu user. */
      '@page{size:A4 landscape;margin:1.5cm 1.5cm 1.5cm 3cm}'+
      'body{font-family:"Times New Roman",Times,serif;font-size:13pt;color:#000;line-height:1.4}'+
      '.letterhead{display:table;width:100%;margin-bottom:10pt}'+
      '.letterhead>div{display:table-cell;text-align:center;vertical-align:top;width:50%;font-size:12pt;line-height:1.35}'+
      '.letterhead .left b,.letterhead .right b{font-weight:bold;text-transform:uppercase}'+
      '.letterhead .line{display:inline-block;width:40%;border-top:1pt solid #000;margin-top:3pt}'+
      '.letterhead .right .motto{font-style:italic;font-weight:bold}'+
      '.title{text-align:center;margin:14pt 0 8pt}'+
      '.title h1{font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0 0 4pt}'+
      '.title .year{font-size:13pt;font-weight:bold;font-style:italic;margin-top:6pt}'+
      'table{width:100%;border-collapse:collapse;margin-top:10pt;font-size:12pt;page-break-inside:auto}'+
      'tr{page-break-inside:avoid;page-break-after:auto}'+
      'thead{display:table-header-group}'+
      'th,td{border:1pt solid #000;padding:5pt 7pt;vertical-align:top;line-height:1.35}'+
      'th{background:#d6e5f3 !important;text-align:center;font-weight:bold;font-size:12pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      'tr.cat-row td{background:#0c5da5 !important;color:white !important;font-size:13pt;padding:6pt 8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      'tr.grp-row.d1 td{background:#dbeafe !important;font-size:12.5pt;padding:5pt 8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      'tr.grp-row.d2 td{background:#eff6fc !important;font-size:12pt;padding:4pt 10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      'tr.grp-row.d3 td{background:#f8fafc !important;font-size:12pt;padding:4pt 14pt;font-style:italic;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      '.col-stt{width:5%}.col-ma{width:12%}.col-ten{width:60%}.col-resp{width:23%}'+
      '.sign{margin-top:24pt;display:table;width:100%}'+
      '.sign-box{display:table-cell;text-align:center;width:45%;vertical-align:top;font-size:13pt}'+
      '.sign .spacer{display:table-cell;width:10%}'+
      '.sign .loc{font-style:italic;margin-bottom:4pt;font-size:12pt}'+
      '.sign .role{font-weight:bold;text-transform:uppercase;margin-bottom:3pt}'+
      '.sign .note{font-style:italic;font-size:12pt;margin-bottom:50pt}'+
      '.sign .name{font-weight:bold;font-size:13pt}'+
      '.footnote{margin-top:16pt;font-size:11pt;color:#333;font-style:italic;text-align:center;border-top:1px dashed #999;padding-top:6pt}'+
      '@media print{.no-print{display:none}}'+
      '.print-bar{position:fixed;top:10px;right:10px;background:#0c5da5;color:white;padding:10px 18px;border-radius:999px;font-family:sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:9999}'+
      '.print-bar button{background:white;color:#0c5da5;border:none;padding:6px 14px;border-radius:999px;font-weight:bold;margin-left:10px;cursor:pointer;font-family:inherit}'+
      '</style></head><body>'+
      '<div class="no-print print-bar">👁 Xem trước bản in <button onclick="window.print()">🖨 In ngay</button> <button onclick="window.close()" style="background:#dc2626;color:white">✕ Đóng</button></div>'+
      '<div class="letterhead">'+
        '<div class="left"><b>'+escapeHtml(ubndLocation)+'</b><br><b>'+escapeHtml(schoolName)+'</b><br><span class="line"></span></div>'+
        '<div class="right"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><span class="motto">Độc lập - Tự do - Hạnh phúc</span><br><span class="line"></span></div>'+
      '</div>'+
      '<div class="title">'+
        '<h1>DANH MỤC HỒ SƠ SỐ</h1>'+
        (schoolYear ? '<div class="year">Năm học: '+escapeHtml(schoolYear)+'</div>' : '') +
      '</div>'+
      '<table>'+
        '<thead><tr>'+
          '<th class="col-stt">STT</th>'+
          '<th class="col-ma">Mã hồ sơ</th>'+
          '<th class="col-ten">Danh mục Hồ sơ</th>'+
          '<th class="col-resp">Người phụ trách</th>'+
        '</tr></thead>'+
        '<tbody>'+tbody+'</tbody>'+
      '</table>'+
      '<div class="sign">'+
        '<div class="sign-box">'+
          '<div class="role">Người lập danh mục</div>'+
          '<div class="note">(Ký, ghi rõ họ tên)</div>'+
          '<div class="name">&nbsp;</div>'+
        '</div>'+
        '<div class="spacer"></div>'+
        '<div class="sign-box">'+
          '<div class="loc">'+escapeHtml(locShort)+', ngày '+dd+' tháng '+mm+' năm '+yy+'</div>'+
          '<div class="role">Hiệu trưởng</div>'+
          '<div class="note">(Ký, ghi rõ họ tên, đóng dấu)</div>'+
          '<div class="name">'+escapeHtml(principal||'')+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="footnote">Tổng số: '+totalCats+' nhóm lớn · '+totalLeaves+' hồ sơ</div>'+
      '</body></html>';

    // iframe ẩn để in
    let iframe = document.getElementById('hssPrintFrame');
    if(iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.id = 'hssPrintFrame';
    iframe.style.cssText = 'position:fixed;right:-9999px;bottom:-9999px;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch(e) {
        const w = window.open('', '_blank');
        if(w){ w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
        else alert('Trình duyệt chặn cửa sổ in. Vui lòng cho phép popup và thử lại.');
      }
    }, 500);
  }

  // Search minh chứng (debounce 250ms — bảng có ~80 minh chứng)
  document.getElementById('mcSearch').addEventListener('input', _debounce(function(e){
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.mc-table tbody tr').forEach(el => {
      el.style.display = !q || (el.dataset.mc||'').includes(q) ? '' : 'none';
    });
    if(q) document.querySelectorAll('.mc-tc').forEach(tc => tc.classList.add('open'));
  }, 250));

  // ============ FETCH DATA FROM GAS API ============
  const CACHE_KEY = 'mnDienXuan_data';
  const CACHE_VERSION = 'v2026.04'; // ⚠ TĂNG khi đổi schema (VD: thêm cột vào MinhChung) → mọi trình duyệt tự xoá cache cũ
  const CACHE_TTL = 10 * 60 * 1000; // 10 phút — dữ liệu cache hết hạn sau 10 phút

  // Đọc cache nếu version khớp; nếu schema cũ → tự xoá, trả null.
  function _cacheLoad(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      const c = JSON.parse(raw);
      if(!c || c.version !== CACHE_VERSION || !c.d){
        try{ localStorage.removeItem(CACHE_KEY); } catch(e){}
        return null;
      }
      return c;
    } catch(e){
      try{ localStorage.removeItem(CACHE_KEY); } catch(x){}
      return null;
    }
  }
  // Ghi cache có version. Khi vỡ quota → bỏ phần "classes" (lớn nhất, có thể build lại từ stats), thử lưu lại;
  // nếu vẫn vỡ → bỏ luôn (im lặng — UI vẫn chạy bình thường, chỉ là load lần sau gọi GAS lại).
  function _cacheSave(data){
    const payload = {version: CACHE_VERSION, ts: Date.now(), d: data};
    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      return true;
    } catch(e){
      if(e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)){
        try{
          const slim = Object.assign({}, data);
          delete slim.classes; // build lại được từ students nếu có sau này
          localStorage.setItem(CACHE_KEY, JSON.stringify({version: CACHE_VERSION, ts: Date.now(), d: slim, partial: true}));
          return true;
        } catch(e2){
          try{ localStorage.removeItem(CACHE_KEY); } catch(x){}
        }
      }
      return false;
    }
  }

  function boot(data, isCache){
    HSS = data.hss || [];
    TEACHERS = data.teachers || [];
    CLASSES = data.classes || [];
    IMAGES = data.images || [];
    MINHCHUNG = mergeMCSeed(data.minhChung);
    STATS = data.stats || {};
    FOLDER_STATUS = data.folderStatus || {items:{}, lastChecked:null};
    renderCarousel();
    renderAbout();
    renderStats();
    admApplyConfig();
    renderCategories();
    renderAgeTabs();
    renderClasses('all');
    renderRoleFilter();
    renderTeachers('all');
    renderMinhChung();
    const ls = document.getElementById('loadScreen');
    if(ls){ ls.classList.add('done'); setTimeout(() => ls.remove(), 500); }
    if(isCache){
      // Đã dùng cache → refresh ngầm từ GAS
      fetchGAS(function(freshData){
        _cacheSave(freshData);
        boot(freshData, false);
      }, function(){}); // im lặng nếu lỗi refresh ngầm
    }
  }

  function loadError(msg, kind){
    const ls = document.getElementById('loadScreen');
    if(!ls) return;
    // kind = 'notConfigured' → URL chưa hợp lệ (không chứa 'AKfyc')
    //      = 'connection'    → URL có nhưng gọi API lỗi
    //      = (rỗng)          → tự nhận diện theo URL hiện tại
    if(!kind){
      const u = (typeof getApiUrl === 'function') ? getApiUrl() : '';
      kind = (!u || u.indexOf('AKfyc') < 0) ? 'notConfigured' : 'connection';
    }
    if(kind === 'notConfigured'){
      ls.innerHTML = `
        <div style="text-align:center;padding:40px;max-width:640px">
          <div style="font-size:3rem;margin-bottom:20px">⚙️</div>
          <h3 style="font-family:Fraunces,serif;margin-bottom:12px">Trang web chưa được cấu hình</h3>
          <p style="opacity:.95;margin-bottom:14px;font-size:.96rem;line-height:1.55">Người triển khai (admin trường / Phòng IT) chưa cấu hình URL Google Apps Script trong file <code style="background:rgba(255,255,255,.2);padding:2px 8px;border-radius:6px">index.html</code>.</p>
          <div style="background:rgba(255,255,255,.12);padding:14px 18px;border-radius:10px;margin-bottom:18px;text-align:left;font-size:.88rem;line-height:1.7;max-width:560px;margin-left:auto;margin-right:auto">
            <b>👨‍💻 Dành cho người triển khai:</b><br>
            1. Mở <code style="background:rgba(0,0,0,.18);padding:1px 6px;border-radius:4px">index.html</code> bằng Notepad / VS Code<br>
            2. Bấm <b>Ctrl+F</b> → tìm: <code style="background:rgba(0,0,0,.18);padding:1px 6px;border-radius:4px">const API_URL =</code><br>
            3. Sửa CHỈ chuỗi giữa 2 dấu nháy đơn thành URL Web App của bạn<br>
            &nbsp;&nbsp;&nbsp;(dạng <code>https://script.google.com/macros/s/AKfyc.../exec</code>)<br>
            4. <b>Ctrl+S</b> lưu file → Tải lại trang
          </div>
          <p style="opacity:.7;font-size:.78rem;margin-bottom:18px">Hoặc nhập URL qua wizard: Admin → "🔧 Cấu hình kết nối".<br>Xem chi tiết tại <code>backend/HUONG_DAN_CAI_DAT.md</code></p>
          <button class="btn btn-primary" onclick="location.reload()">Đã sửa URL — Tải lại</button>
        </div>`;
    } else {
      ls.innerHTML = `
        <div style="text-align:center;padding:40px;max-width:560px">
          <div style="font-size:3rem;margin-bottom:20px">⚠️</div>
          <h3 style="font-family:Fraunces,serif;margin-bottom:12px">Không tải được dữ liệu</h3>
          <p style="opacity:.9;margin-bottom:8px;font-size:.95rem">${escapeHtml(msg)}</p>
          <p style="opacity:.7;font-size:.82rem;margin-bottom:20px">Kiểm tra lại URL Apps Script (đã đúng dạng <code>https://script.google.com/macros/s/AKfyc.../exec</code>?), quyền truy cập <b>"Anyone"</b> của Web App, và đã chạy hàm <code>setupAll</code> chưa?</p>
          <button class="btn btn-primary" onclick="location.reload()">Thử lại</button>
        </div>`;
    }
  }

  // JSONP fetch với retry tự động.
  // ⚠ QW4 v2026.06+: thêm tham số `action` (mặc định 'all') để gọi `stats` riêng cho splash.
  //   action='stats' chỉ trả ~5KB (totalRecords, totalTeachers, ...) → nhanh hơn 10-40x so với 'all' (~200KB).
  //   Frontend dùng 'stats' để hiện splash số liệu sớm, sau đó mới 'all' để render full.
  function fetchGAS(onOk, onFail, retries, action){
    retries = retries == null ? 2 : retries;
    action = action || 'all';
    const url = getApiUrl();
    if(!isApiUrlValid()){
      onFail('Chưa cấu hình URL Apps Script.'); return;
    }
    const cbName = 'jsonpCb_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      if(retries > 0){ fetchGAS(onOk, onFail, retries - 1, action); }
      else { onFail('Quá hạn chờ phản hồi từ máy chủ (đã thử ' + (3 - retries) + ' lần).'); }
    }, 20000);

    function cleanup(){ clearTimeout(timer); delete window[cbName]; try{ script.remove(); } catch(e){} }

    window[cbName] = function(resp){
      cleanup();
      if(resp && resp.ok){ onOk(resp.data); }
      else if(retries > 0){ fetchGAS(onOk, onFail, retries - 1, action); }
      else { onFail(resp && resp.error ? resp.error : 'Phản hồi không hợp lệ.'); }
    };
    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cbName + '&action=' + encodeURIComponent(action);
    script.onerror = function(){
      cleanup();
      if(retries > 0){ fetchGAS(onOk, onFail, retries - 1, action); }
      else { onFail('Không gọi được API. Kiểm tra URL hoặc quyền triển khai.'); }
    };
    document.body.appendChild(script);
  }

  // Khởi động: ưu tiên cache → hiển thị ngay → refresh ngầm
  // ⚠ QW4 v2026.06+: nếu không có cache → strategy 2 bước:
  //   Bước 1 (nhanh, ~5KB): action=stats → hiện ngay số liệu (totalRecords, totalTeachers...) trên splash
  //   Bước 2 (chậm, ~200KB): action=all → render đầy đủ HSS + Teachers + Students + MinhChung
  //   User cảm nhận: splash hiện sau ~1s thay vì màn hình trắng đợi 3-5s.
  function loadData(){
    // Nếu URL Apps Script chưa cấu hình → hiện hướng dẫn dán URL (cho người triển khai)
    if(!isApiUrlValid()){
      loadError('', 'notConfigured');
      return;
    }
    const cache = _cacheLoad();
    if(cache && cache.d){
      // Cache còn dùng được (đúng version) → boot ngay, refresh ngầm
      boot(cache.d, true);
      return;
    }

    // Không có cache → SMART FETCH 2 BƯỚC
    // Bước 1: stats nhanh để hiện splash số liệu
    fetchGAS(
      function(statsData){
        // statsData chỉ có {totalRecords, totalTeachers, totalChildren, totalClasses, config, sheetUrl}
        try{ _renderSplashStats(statsData); }catch(e){}

        // Bước 2: action=all để render đầy đủ
        fetchGAS(
          function(fullData){
            _cacheSave(fullData);
            boot(fullData, false);
          },
          function(msg){ loadError(msg, 'connection'); },
          /*retries*/ 2,
          /*action*/ 'all'
        );
      },
      function(msg){
        // Stats fail → bỏ splash, fallback về full all (giữ behavior cũ)
        fetchGAS(
          function(data){ _cacheSave(data); boot(data, false); },
          function(m){ loadError(m, 'connection'); },
          2, 'all'
        );
      },
      /*retries*/ 1,  // stats chỉ retry 1 lần — nhanh là chính
      /*action*/ 'stats'
    );
  }

  // Render số liệu nhanh trên splash khi action=stats về (trước khi 'all' về).
  // Chỉ update các counter ngoài splash; KHÔNG render full UI.
  function _renderSplashStats(s){
    if(!s) return;
    try{
      const elR = document.getElementById('stRecords');     if(elR && s.totalRecords != null) elR.textContent = s.totalRecords;
      const elT = document.getElementById('stTeachers');    if(elT && s.totalTeachers != null) elT.textContent = s.totalTeachers;
      const elC = document.getElementById('stClasses');     if(elC && s.totalClasses != null) elC.textContent = s.totalClasses;
      const elK = document.getElementById('stChildren');    if(elK && s.totalChildren != null) elK.textContent = s.totalChildren;
      // Cập nhật tên trường + năm học sớm trên splash
      if(s.config){
        const nameEl = document.getElementById('cfgAddress'); if(nameEl) nameEl.textContent = s.config.address || '';
        const yearEl = document.getElementById('schoolYear'); if(yearEl) yearEl.textContent = s.config.schoolYear || '';
      }
    }catch(e){}
  }
  // ============ ADMIN PANEL ============
  const ADM_KEY = 'mnDXAdmin';
  const ADM_FALLBACK_PWD = 'admin@2026'; // chỉ dùng khi Sheet CauHinh chưa có row "Mật khẩu Admin"

  function _admGet(){
    try{ return JSON.parse(localStorage.getItem(ADM_KEY)) || {}; } catch(e){ return {}; }
  }
  function _admSet(obj){
    const cur = _admGet();
    Object.assign(cur, obj);
    try{ localStorage.setItem(ADM_KEY, JSON.stringify(cur)); } catch(e){}
  }
  // v2026.05: backend không còn trả `adminPassword` plaintext.
  // ⚠ HOTFIX v2026.06: KHÔNG lưu plaintext password vào localStorage nữa.
  //   - localStorage chỉ giữ `pwdHash` (SHA-256, an toàn cho rest-at-disk).
  //   - Plaintext giữ trong memory (window._admInMemoryPwd) cho đến khi tab đóng,
  //     để các thao tác cần verify lại (đổi mật khẩu) còn dùng được trong session.
  //   - admPostToGAS dùng pwdHash từ localStorage trực tiếp — không cần re-hash.
  //   - Migration: nếu localStorage còn key `pwd` cũ → tự xóa, force user login lại 1 lần.
  function _admPwd(){
    // Plaintext chỉ tồn tại trong session memory (sau khi user vừa login).
    // Nếu tab refresh hoặc user mở từ tab mới → plaintext mất, trả null.
    return window._admInMemoryPwd || null;
  }
  function _admPwdHash(){
    return _admGet().pwdHash || '';
  }
  // Migration: clean key `pwd` plaintext từ phiên cũ (chỉ chạy 1 lần khi load trang)
  (function _admMigrateLegacyPwd(){
    try{
      const cur = _admGet();
      if(cur && cur.pwd){
        delete cur.pwd;
        // Giữ pwdSetAt + pwdHash nếu có; xóa toàn bộ object nếu chỉ còn pwdSetAt
        try{ localStorage.setItem(ADM_KEY, JSON.stringify(cur)); } catch(e){}
        console.info('[adm] Đã xóa plaintext password cũ khỏi localStorage (HOTFIX v2026.06).');
      }
    } catch(e){}
  })();
  // Đang dùng password mặc định? Dựa vào flag `isDefaultPwd` từ backend.
  function _admIsDefaultPwd(){
    // Nếu user đã đổi password trong session này (memory plaintext khác fallback) → không phải default
    if(window._admInMemoryPwd && window._admInMemoryPwd !== ADM_FALLBACK_PWD) return false;
    // Nếu localStorage có pwdHash khác hash của fallback → user đã từng đổi
    const localHash = _admGet().pwdHash;
    if(localHash && typeof FALLBACK_ADMIN_HASH !== 'undefined' && localHash !== FALLBACK_ADMIN_HASH) return false;
    const cfg = (STATS && STATS.config) || {};
    // Backend mới (v2026.05+) trả isDefaultPwd; backend cũ chưa có → fallback so plaintext.
    if(typeof cfg.isDefaultPwd === 'boolean') return cfg.isDefaultPwd;
    const eff = cfg.adminPassword || ADM_FALLBACK_PWD; // legacy
    return !eff || eff === ADM_FALLBACK_PWD || eff === 'admin@2026';
  }

  function openAdmin(){
    document.getElementById('adminOverlay').classList.add('open');
    document.getElementById('admPwdInput').value = '';
    document.getElementById('admLoginMsg').className = 'adm-alert';
    if(window._admLoggedIn){
      document.getElementById('admLogin').style.display = 'none';
      document.getElementById('admMain').style.display = 'flex';
      admLoadInfo();
    } else {
      document.getElementById('admLogin').style.display = '';
      document.getElementById('admMain').style.display = 'none';
      setTimeout(() => document.getElementById('admPwdInput').focus(), 200);
    }
  }
  function closeAdmin(){
    document.getElementById('adminOverlay').classList.remove('open');
  }

  // Phím ESC đóng Admin hoặc menu mobile
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    const overlay = document.getElementById('adminOverlay');
    if(overlay && overlay.classList.contains('open')){ closeAdmin(); return; }
    const mm = document.getElementById('mobileMenu');
    if(mm && mm.classList.contains('open')){ toggleMenu(); }
  });

  async function admDoLogin(){
    const input = document.getElementById('admPwdInput').value;
    const cfg = (STATS && STATS.config) || {};

    // v2026.05: so sánh hash với adminPasswordHash từ Sheet.
    // Fallback (backend cũ): so plaintext với cfg.adminPassword.
    let ok = false;
    let inputHash = '';
    const remoteHash = cfg.adminPasswordHash || '';
    if(remoteHash){
      try{
        inputHash = await _sha256hex(input);
        if(inputHash === remoteHash) ok = true;
      } catch(e){}
    } else if(cfg.adminPassword){
      // Backend cũ chưa migrate → so plaintext (legacy)
      if(input === cfg.adminPassword) ok = true;
    }
    // Fallback: nếu user đã đổi password ở trình duyệt này (lưu hash local v2026.06+)
    const localHash = _admGet().pwdHash;
    if(!ok && localHash){
      try{ if(!inputHash) inputHash = await _sha256hex(input); }catch(e){}
      if(inputHash && inputHash === localHash) ok = true;
    }
    // Sheet hoàn toàn chưa cấu hình → cho phép mật khẩu mặc định
    if(!ok && !remoteHash && !cfg.adminPassword && input === ADM_FALLBACK_PWD) ok = true;

    if(ok){
      // ⚠ HOTFIX v2026.06: lưu HASH (an toàn) thay vì plaintext.
      //   Plaintext chỉ giữ trong memory (window._admInMemoryPwd) — mất khi tab đóng.
      try{ if(!inputHash) inputHash = await _sha256hex(input); }catch(e){}
      window._admInMemoryPwd = input; // memory only — không bao giờ lưu disk
      _admSet({pwdHash: inputHash, pwdSetAt: _admGet().pwdSetAt || new Date().toISOString()});
      try{ if(typeof _precomputeAdminHash === 'function') _precomputeAdminHash(); } catch(e){}
      window._admLoggedIn = true;
      document.getElementById('admLogin').style.display = 'none';
      document.getElementById('admMain').style.display = 'flex';
      admLoadInfo();
      // ⚠ HOTFIX v2026.06: BẮT BUỘC đổi mật khẩu nếu đang dùng admin@2026.
      //   Trước đây chỉ toast nhẹ → nhiều trường bỏ qua → giữ pwd mặc định.
      //   Giờ: tự động chuyển sang tab "🔑 Mật khẩu", hiện banner đỏ, disable các tab khác cho đến khi đổi.
      if(_admIsDefaultPwd()){
        window._admForcePwdChange = true;
        admTab('pwd');
        _admShowForcePwdBanner();
      } else {
        window._admForcePwdChange = false;
        _admHideForcePwdBanner();
      }
    } else {
      const msg = document.getElementById('admLoginMsg');
      msg.textContent = '❌ Sai mật khẩu. Liên hệ với Nhà thiết kế để được cấp lại';
      msg.className = 'adm-alert err';
    }
  }

  // ⚠ HOTFIX v2026.06: helpers cho cơ chế bắt buộc đổi mật khẩu mặc định
  function _admShowForcePwdBanner(){
    let banner = document.getElementById('admForcePwdBanner');
    if(!banner){
      banner = document.createElement('div');
      banner.id = 'admForcePwdBanner';
      banner.style.cssText = 'background:linear-gradient(135deg,#dc2626,#991b1b);color:white;padding:14px 18px;font-size:.92rem;font-weight:500;border-radius:10px;margin:14px;box-shadow:0 4px 12px rgba(220,38,38,.3);line-height:1.5';
      banner.innerHTML = '⛔ <b>BẮT BUỘC ĐỔI MẬT KHẨU NGAY</b><br><span style="font-weight:400;opacity:.95">Trường đang dùng mật khẩu mặc định <code style="background:rgba(255,255,255,.2);padding:1px 6px;border-radius:3px">admin@2026</code> — ai biết URL Apps Script đều có thể truy cập. Hãy đặt mật khẩu riêng của trường (≥6 ký tự) để các tab khác mở khóa.</span>';
      // Chèn ngay đầu admMain
      const main = document.getElementById('admMain');
      if(main) main.insertBefore(banner, main.firstChild);
    }
    banner.style.display = 'block';
    // Visual disable các tab khác (trừ pwd) — vẫn click được nhưng admTab() sẽ chặn
    document.querySelectorAll('.admin-tab').forEach(t => {
      if(t.dataset.tab !== 'pwd'){
        t.style.opacity = '0.45';
        t.style.cursor = 'not-allowed';
        t.title = 'Đổi mật khẩu trước khi sử dụng';
      } else {
        t.style.opacity = '';
        t.style.cursor = '';
        t.title = '';
      }
    });
  }
  function _admHideForcePwdBanner(){
    const banner = document.getElementById('admForcePwdBanner');
    if(banner) banner.style.display = 'none';
    document.querySelectorAll('.admin-tab').forEach(t => {
      t.style.opacity = '';
      t.style.cursor = '';
      t.title = '';
    });
  }

  function admTab(tab){
    // ⚠ HOTFIX v2026.06: chặn chuyển sang tab khác nếu chưa đổi pwd mặc định
    if(window._admForcePwdChange && tab !== 'pwd'){
      const msg = document.getElementById('admPwdMsg') || document.getElementById('admLoginMsg');
      if(msg){
        msg.textContent = '⛔ Đổi mật khẩu mặc định trước khi sử dụng các chức năng khác.';
        msg.className = 'adm-alert err';
      }
      // Vẫn force về tab pwd
      tab = 'pwd';
    }
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const map = {info:'Info', images:'Images', hss:'Hss', mc:'MC', import:'Import', pwd:'Pwd', system:'System'};
    document.getElementById('admSec' + (map[tab]||tab)).classList.add('active');
    if(tab === 'hss') admLoadHSS();
    if(tab === 'mc') admMCRender();
    if(tab === 'images') admLoadImages();
  }

  // --- Tab 1: Thông tin trường ---
  function admLoadInfo(){
    const adm = _admGet();
    const cfg = STATS.config || {};
    document.getElementById('admName').value = adm.schoolName || cfg.name || '';
    document.getElementById('admAddr').value = adm.schoolAddr || cfg.address || '';
    document.getElementById('admPhone').value = adm.schoolPhone || cfg.phone || '';
    document.getElementById('admEmail').value = adm.schoolEmail || cfg.email || '';
    document.getElementById('admYear').value = adm.schoolYear || cfg.schoolYear || '';
    document.getElementById('admPrincipal').value = adm.principal || cfg.principal || '';
    document.getElementById('admLogoEmoji').value = adm.logoEmoji || cfg.logoEmoji || '🌱';
    document.getElementById('admSlogan').value = adm.slogan || cfg.slogan || '';
    // Theme picker — chỉ 2 lựa chọn hợp lệ: 'navy' | 'green'. Mọi giá trị khác (legacy 'blue', 'pink', etc.) → navy.
    const rawTheme = adm.theme || cfg.themeName || 'navy';
    const curTheme = rawTheme === 'green' ? 'green' : 'navy';
    document.querySelectorAll('#admThemePicker label').forEach(l => {
      const v = l.dataset.tv;
      l.style.borderColor = v === curTheme ? 'var(--g2)' : '#cbd5e1';
      l.style.background = v === curTheme ? '#e8f1fa' : '';
      l.querySelector('input').checked = v === curTheme;
    });
    document.querySelectorAll('#admThemePicker label').forEach(l => {
      l.onclick = function(){ admSelectTheme(l.dataset.tv); };
    });
  }

  function admSelectTheme(v){
    document.querySelectorAll('#admThemePicker label').forEach(l => {
      l.style.borderColor = l.dataset.tv === v ? 'var(--g2)' : '#cbd5e1';
      l.style.background = l.dataset.tv === v ? '#e8f1fa' : '';
      l.querySelector('input').checked = l.dataset.tv === v;
    });
  }

  function admSaveInfo(){
    const checkedTheme = document.querySelector('#admThemePicker input:checked');
    const data = {
      schoolName: document.getElementById('admName').value.trim(),
      schoolAddr: document.getElementById('admAddr').value.trim(),
      schoolPhone: document.getElementById('admPhone').value.trim(),
      schoolEmail: document.getElementById('admEmail').value.trim(),
      schoolYear: document.getElementById('admYear').value.trim(),
      principal: document.getElementById('admPrincipal').value.trim(),
      logoEmoji: document.getElementById('admLogoEmoji').value.trim() || '🌱',
      slogan: document.getElementById('admSlogan').value.trim(),
      theme: checkedTheme ? checkedTheme.value : 'navy'
    };
    _admSet(data);
    admApplyConfig();

    // Đồng bộ lên Google Sheet (CauHinh) — để mọi người dùng đều thấy
    const msg = document.getElementById('admInfoMsg');
    msg.textContent = '⏳ Đã lưu trên trình duyệt. Đang đồng bộ lên Google Sheet…';
    msg.className = 'adm-alert info';
    const rows = [
      ['Tên trường',     data.schoolName],
      ['Địa chỉ',       data.schoolAddr],
      ['Điện thoại',     data.schoolPhone],
      ['Email',          data.schoolEmail],
      ['Năm học',        data.schoolYear],
      ['Hiệu trưởng',   data.principal],
      ['Logo emoji',    data.logoEmoji],
      ['Slogan',         data.slogan],
      ['Chủ đề màu',    data.theme]
    ];
    admPostToGAS({action:'updateConfig', rows: rows}, function(ok, info){
      if(ok){
        msg.innerHTML = '✅ <b>Đã lưu &amp; đồng bộ lên Google Sheet.</b> Mọi người mở web sẽ thấy thông tin mới.';
        msg.className = 'adm-alert ok';
      } else {
        msg.innerHTML = '⚠ Đã lưu trên trình duyệt này, nhưng <b>không đồng bộ được lên Google Sheet</b>: ' + escapeHtml(String(info||'')) + '<br>Người dùng khác mở web sẽ chưa thấy. Kiểm tra kết nối hoặc thử lại.';
        msg.className = 'adm-alert err';
      }
      setTimeout(() => msg.className = 'adm-alert', 6000);
    });
  }

  function admApplyConfig(){
    const adm = _admGet();
    const cfg = STATS.config || {};
    // Theme — chỉ 2 lựa chọn hợp lệ: 'navy' (default :root) | 'green' (data-theme="green").
    // Mọi giá trị khác (legacy 'blue', 'pink', stale từ Sheet cũ) → navy default.
    const rawTheme = adm.theme || cfg.themeName || 'navy';
    const theme = rawTheme === 'green' ? 'green' : 'navy';
    if(theme === 'green') document.documentElement.setAttribute('data-theme', 'green');
    else document.documentElement.removeAttribute('data-theme');
    // Logo emoji + Slogan — render lên header và footer
    const logoEmoji = adm.logoEmoji || cfg.logoEmoji || '🌱';
    document.querySelectorAll('.logo-mark').forEach(el => { el.textContent = logoEmoji; });
    const slogan = adm.slogan || cfg.slogan || '';
    if(slogan){
      const sloganEls = document.querySelectorAll('[data-config="slogan"]');
      sloganEls.forEach(el => { el.textContent = slogan; });
    }
    // Tên trường: ưu tiên localStorage → fallback API (Google Sheet)
    const schoolName = adm.schoolName || cfg.name || '';
    const schoolAddr = adm.schoolAddr || cfg.address || '';
    const schoolPhone = adm.schoolPhone || cfg.phone || '';
    const schoolEmail = adm.schoolEmail || cfg.email || '';
    const schoolYear = adm.schoolYear || cfg.schoolYear || '';
    if(schoolName){
      document.querySelectorAll('.logo span').forEach(el => {
        if(!el.classList.contains('dot')) el.textContent = schoolName.replace(/^Trường\s*/i,'');
      });
      document.title = 'Hồ sơ số - ' + schoolName;
    }
    if(schoolAddr) document.getElementById('cfgAddress').textContent = schoolAddr;
    if(schoolPhone) document.getElementById('cfgPhone').textContent = schoolPhone;
    if(schoolEmail) document.getElementById('cfgEmail').textContent = schoolEmail;
    if(schoolYear) document.getElementById('schoolYear').textContent = schoolYear;
    if(schoolName && schoolAddr){
      const heroP = document.querySelector('.hero-content p');
      if(heroP) heroP.textContent = '📍 ' + schoolName + ' – ' + schoolAddr;
      const fd = document.getElementById('footDesc');
      if(fd) fd.textContent = 'Hồ sơ số chính thức của ' + schoolName + ' – ' + schoolAddr + '.';
      const fc = document.getElementById('footCopy');
      if(fc) fc.textContent = '© 2026 ' + schoolName + ' – ' + schoolAddr;
    }
    // Lưu ý: meta tag (Open Graph cho Zalo/FB) là BRAND CHUNG cố định
    // ("Hồ sơ Trường Mầm non · Giải pháp Công nghệ số") — không cập nhật theo từng trường
    // để bot social hiển thị đồng nhất khi share link (bot KHÔNG chạy JS).

    // Precompute admin hash (async, không block — cached cho showKdcl dùng sau)
    if(typeof _precomputeAdminHash === 'function'){
      _precomputeAdminHash();
    }
  }

  // --- Tab 2: Chỉnh sửa Hồ sơ số ---
  let _hssRawRows = []; // lưu dữ liệu gốc từ Sheet

  function admLoadHSS(){
    // Lấy dữ liệu từ cache hoặc API đã fetch
    const wrap = document.getElementById('admHssTable');
    if(!HSS.length){
      wrap.innerHTML = '<p style="padding:30px;text-align:center;color:#94a3b8">Chưa có dữ liệu. Nhấn Làm mới.</p>';
      return;
    }
    // Flatten HSS tree thành danh sách phẳng
    _hssRawRows = [];
    function walk(nodes, depth){
      nodes.forEach(n => {
        _hssRawRows.push({
          code: n.code || '',
          name: n.name || '',
          link: n.link || '',
          assign: n.assign || '',
          leaf: !!n.leaf,
          has: !!n.has,
          depth: depth
        });
        if(n.children) walk(n.children, depth + 1);
      });
    }
    walk(HSS, 0);
    admRenderHSSTable(_hssRawRows);
  }

  function admRenderHSSTable(rows){
    const wrap = document.getElementById('admHssTable');
    if(!rows.length){
      wrap.innerHTML = '<p style="padding:20px;text-align:center;color:#94a3b8">Không tìm thấy hồ sơ.</p>';
      return;
    }
    let html = `<table class="adm-edit-table"><thead><tr>
      <th style="width:24px"></th>
      <th style="width:78px">Mã hồ sơ</th>
      <th>Danh mục Hồ sơ</th>
      <th style="width:24%">Link Google Drive</th>
      <th style="width:18%">Người phụ trách</th>
      <th style="width:36px"></th>
    </tr></thead><tbody>`;
    rows.forEach((r, i) => {
      const isGroup = !r.leaf;
      const dot = r.leaf ? (r.has ? '<span style="color:#15803d;font-size:1.1rem">●</span>' : '<span style="color:#cbd5e1;font-size:1.1rem">●</span>') : '<span style="font-size:.95rem">📂</span>';
      const groupBg = isGroup ? 'background:#f8fafc' : '';
      const codeStyle = isGroup ? 'font-weight:600;color:var(--g-deep);background:#eef4fb' : '';
      const nameStyle = isGroup ? 'font-weight:600;color:var(--g-deep)' : '';
      html += `<tr data-idx="${i}" style="${groupBg}">
        <td class="row-status">${dot}</td>
        <td><input type="text" value="${escapeHtml(r.code)}" onchange="admHssField(${i},'code',this.value)" style="${codeStyle}" title="Mã hồ sơ (vd: 1.1.1)"></td>
        <td><input type="text" value="${escapeHtml(r.name)}" onchange="admHssField(${i},'name',this.value)" style="${nameStyle}" title="Tên danh mục"></td>
        <td>${isGroup ? '<span style="color:#cbd5e1;padding-left:8px">—</span>' : `<input type="text" value="${escapeHtml(r.link)}" placeholder="https://drive.google.com/..." onchange="admHssField(${i},'link',this.value)" title="Link Drive folder">`}</td>
        <td>${isGroup ? '<span style="color:#cbd5e1;padding-left:8px">—</span>' : `<input type="text" value="${escapeHtml(r.assign||'')}" placeholder="VD: Hiệu trưởng" onchange="admHssField(${i},'assign',this.value)" title="Người phụ trách (vai trò)">`}</td>
        <td style="text-align:center"><button onclick="admHssDelete(${i})" title="Xóa dòng" style="background:none;border:none;cursor:pointer;font-size:.95rem;color:#dc2626;padding:2px 6px;border-radius:4px;opacity:.4" onmouseover="this.style.opacity=1;this.style.background='#fef2f2'" onmouseout="this.style.opacity=.4;this.style.background='none'">🗑</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  function admHssField(i, field, val){
    if(_hssRawRows[i]) _hssRawRows[i][field] = String(val || '').trim();
  }

  function admHssDelete(i){
    if(!_hssRawRows[i]) return;
    const r = _hssRawRows[i];
    if(!confirm('Xóa dòng "' + r.code + '. ' + r.name + '"?\nCần nhấn "💾 Lưu thay đổi" sau đó để áp dụng lên Google Sheet.')) return;
    _hssRawRows.splice(i, 1);
    admRenderHSSTable(_hssRawRows);
    const msg = document.getElementById('admHssMsg');
    if(msg){
      msg.textContent = '🗑 Đã xoá "' + r.code + '". Nhấn "💾 Lưu thay đổi" để ghi lên Sheet.';
      msg.className = 'adm-alert warn';
      setTimeout(() => msg.className = 'adm-alert', 4000);
    }
  }

  function admAddHSS(){
    const code = document.getElementById('admNewCode').value.trim();
    const name = document.getElementById('admNewName').value.trim();
    const link = document.getElementById('admNewLink').value.trim();
    const assign = document.getElementById('admNewAssign').value.trim();
    const msg = document.getElementById('admHssMsg');
    if(!code || !name){
      msg.textContent = '❌ Vui lòng nhập mã và tên danh mục hồ sơ.';
      msg.className = 'adm-alert err';
      setTimeout(() => msg.className = 'adm-alert', 3000);
      return;
    }
    // Xác định depth từ mã (1 = depth 0, 1.1 = depth 1, 1.1.1 = depth 2, ...)
    const depth = (code.match(/\./g) || []).length;
    const isLeaf = !!link; // có link = hồ sơ lá
    const newRow = { code, name, link, assign, leaf: isLeaf, has: !!link, depth };

    // Chèn vào vị trí đúng theo mã
    let insertAt = _hssRawRows.length;
    for(let i = 0; i < _hssRawRows.length; i++){
      if(_hssRawRows[i].code.localeCompare(code, 'vi', {numeric:true}) > 0){
        insertAt = i; break;
      }
    }
    _hssRawRows.splice(insertAt, 0, newRow);
    admRenderHSSTable(_hssRawRows);

    // Xóa form
    document.getElementById('admNewCode').value = '';
    document.getElementById('admNewName').value = '';
    document.getElementById('admNewLink').value = '';
    document.getElementById('admNewAssign').value = '';
    msg.textContent = '✅ Đã thêm "' + code + '. ' + name + '". Nhấn "Lưu thay đổi" để ghi lên Sheet.';
    msg.className = 'adm-alert ok';
    setTimeout(() => msg.className = 'adm-alert', 4000);

    // Cuộn đến dòng vừa thêm
    const wrap = document.getElementById('admHssTable');
    const row = wrap.querySelector('tr[data-idx="' + insertAt + '"]');
    if(row){ row.style.background = '#dbeafe'; row.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(() => row.style.background = '', 2000); }
  }

  function admFilterHSS(){
    const q = document.getElementById('admHssSearch').value.trim().toLowerCase();
    if(!q){ admRenderHSSTable(_hssRawRows); return; }
    admRenderHSSTable(_hssRawRows.filter(r =>
      r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    ));
  }

  function admSaveHSS(){
    const msg = document.getElementById('admHssMsg');
    if(!_hssRawRows.length){
      msg.textContent = '❌ Chưa có dữ liệu hồ sơ.';
      msg.className = 'adm-alert err'; return;
    }
    // Rebuild rows for Sheet format: [TT, "Tên", "Link", "Phân công", "Mã hóa"]
    const sheetRows = _hssRawRows.map((r, i) => {
      const tt = r.leaf ? (i + 1) : '';
      const fullName = r.code + '. ' + r.name;
      return [tt, fullName, r.link || '', r.assign || '', ''];
    });
    msg.textContent = '⏳ Đang lưu...';
    msg.className = 'adm-alert warn';
    admPostToGAS({action: 'updateHSS', rows: sheetRows}, function(ok, resp){
      if(ok){
        msg.textContent = '✅ Đã lưu ' + sheetRows.length + ' dòng hồ sơ lên Google Sheet!';
        msg.className = 'adm-alert ok';
      } else {
        msg.textContent = '❌ Lỗi: ' + (resp || 'Không kết nối được API');
        msg.className = 'adm-alert err';
      }
      setTimeout(() => msg.className = 'adm-alert', 5000);
    });
  }

  // --- Tab: Minh chứng KĐCL ---
  function admMCRender(){
    _admBuildHssLinkMap(); // refresh link map mỗi lần render (HSS có thể đã thay đổi)
    const sel = +document.getElementById('admMCSel').value || 0;
    const body = document.getElementById('admMCBody');
    if(!MINHCHUNG[sel]){ body.innerHTML = '<p style="padding:20px;text-align:center;color:#94a3b8">Chưa có dữ liệu. Bấm "🔄 Khôi phục khung TT 19".</p>'; return; }
    const tc = MINHCHUNG[sel];
    const tcNum = sel + 1;
    let html = '<div style="background:#eef4fb;padding:12px 16px;border-radius:10px;margin-bottom:14px;border-left:3px solid var(--g2)"><b style="color:var(--g-deep);font-family:Fraunces,serif">'+escapeHtml(tc.name)+'</b> — <span style="color:#5a6b64">'+escapeHtml(tc.desc)+'</span></div>';
    (tc.criteria||[]).forEach((chi, ci) => {
      const evs = chi.evidences || [];
      html += '<div class="adm-mc-chi">'+
        '<div class="adm-mc-chi-head">'+
          '<span class="adm-mc-chi-code">'+escapeHtml(chi.code)+'</span>'+
          '<input type="text" class="adm-mc-chi-desc" value="'+escapeHtml(chi.desc)+'" onchange="admMCChiDesc('+sel+','+ci+',this.value)" title="Sửa tên tiêu chí">'+
          '<span class="adm-mc-chi-count">'+evs.length+' MC</span>'+
        '</div>'+
        '<div class="adm-mc-list">';
      if(!evs.length){
        html += '<p style="padding:12px;color:#94a3b8;font-size:.8rem;text-align:center;margin:0">— Chưa có minh chứng —</p>';
      } else {
        evs.forEach((ev, ei) => {
          // Auto-fill link từ HSS map (xây từ HSS toàn cục)
          var firstHssCode = String(ev.hssRef||'').split(/[,;]+/)[0].trim().match(/(\d+(?:\.\d+)+)/);
          var displayLink = ev.link || (firstHssCode ? _hssLinkMap[firstHssCode[1]] || '' : '');
          var linkHtml = displayLink
            ? '<a class="adm-mc-link" href="'+escapeHtml(displayLink)+'" target="_blank" rel="noopener" title="'+escapeHtml(displayLink)+'">🔗 Mở Drive</a>'
            : '<span class="adm-mc-link empty" title="Chưa có link — nhập mã HSS đúng và bấm \'Đồng bộ Link\'">— Chưa có link —</span>';
          html += '<div class="adm-mc-row" data-ei="'+ei+'">'+
            '<span class="adm-mc-tt">'+(ei+1)+'</span>'+
            '<input type="text" class="adm-mc-code" placeholder="[H'+tcNum+'-'+chi.code+'-'+String(ei+1).padStart(2,'0')+']" value="'+escapeHtml(ev.code||'')+'" onchange="admMCField('+sel+','+ci+','+ei+',\'code\',this.value)" title="Mã MC (để rỗng nếu MC tham chiếu MC khác)">'+
            '<textarea class="adm-mc-content" rows="2" placeholder="Nội dung minh chứng..." onchange="admMCField('+sel+','+ci+','+ei+',\'content\',this.value)" title="Nội dung minh chứng">'+escapeHtml(ev.content||'')+'</textarea>'+
            '<input type="text" class="adm-mc-date" placeholder="Số/ngày BH" value="'+escapeHtml(ev.issueDate||'')+'" onchange="admMCField('+sel+','+ci+','+ei+',\'issueDate\',this.value)" title="Số/ngày ban hành hoặc thời điểm khảo sát">'+
            '<div class="adm-mc-link-wrap">'+
              '<input type="text" class="adm-mc-hss" placeholder="Mã HSS (VD: 1.1.1; 1.1.2)" value="'+escapeHtml(ev.hssRef||'')+'" onchange="admMCField('+sel+','+ci+','+ei+',\'hssRef\',this.value);_admMCRefreshLink('+sel+','+ci+','+ei+')" title="Mã HSS — phân cách nhiều mã bằng dấu chấm phẩy ;">'+
              linkHtml+
            '</div>'+
            '<input type="text" class="adm-mc-resp" placeholder="VD: Hiệu trưởng, NV Y tế..." value="'+escapeHtml(ev.responsible||'')+'" onchange="admMCField('+sel+','+ci+','+ei+',\'responsible\',this.value)" title="Bộ phận / Người phụ trách (vai trò)">'+
            '<input type="text" class="adm-mc-note" placeholder="VD: [H1-1.1-04]" value="'+escapeHtml(ev.note||'')+'" onchange="admMCField('+sel+','+ci+','+ei+',\'note\',this.value)" title="Ghi chú / mã MC tham chiếu nếu trùng">'+
            '<button class="adm-mc-del" onclick="admMCDel('+sel+','+ci+','+ei+')" title="Xóa minh chứng">🗑</button>'+
          '</div>';
        });
      }
      html += '</div>'+
        '<button class="adm-mc-add" onclick="admMCAdd('+sel+','+ci+')">＋ Thêm minh chứng</button>'+
      '</div>';
    });
    body.innerHTML = html;
  }

  function admMCField(tc, ch, ev, key, val){
    if(MINHCHUNG[tc] && MINHCHUNG[tc].criteria[ch] && MINHCHUNG[tc].criteria[ch].evidences[ev]){
      MINHCHUNG[tc].criteria[ch].evidences[ev][key] = val.trim();
    }
  }
  function admMCChiDesc(tc, ch, val){
    if(MINHCHUNG[tc] && MINHCHUNG[tc].criteria[ch]) MINHCHUNG[tc].criteria[ch].desc = val.trim();
  }
  // Map mã HSS (VD "1.1.1") → link Drive — build từ HSS toàn cục, dùng trong admMCRender
  let _hssLinkMap = {};
  function _admBuildHssLinkMap(){
    _hssLinkMap = {};
    function walk(nodes){
      (nodes||[]).forEach(n => {
        if(n.leaf && n.code && n.link) _hssLinkMap[n.code] = n.link;
        if(n.children) walk(n.children);
      });
    }
    walk(window.HSS || []);
  }
  function _admMCRefreshLink(tc, ch, ev){
    // Re-render row để cập nhật hiển thị link sau khi user sửa hssRef
    setTimeout(admMCRender, 80);
  }

  function admMCAdd(tc, ch){
    const chi = MINHCHUNG[tc].criteria[ch];
    const n = chi.evidences.length + 1;
    const code = '[H'+(tc+1)+'-'+chi.code+'-'+String(n).padStart(2,'0')+']';
    chi.evidences.push({tt:String(n), code, content:'', issueDate:'Năm học 2025-2026', hssRef:'', link:'', responsible:'', note:''});
    admMCRender();
    // Focus vào ô nội dung của dòng vừa thêm
    setTimeout(() => {
      const rows = document.querySelectorAll('.adm-mc-row');
      const last = rows[rows.length-1];
      if(last){ last.scrollIntoView({behavior:'smooth',block:'center'}); last.querySelector('.adm-mc-content')?.focus(); }
    }, 100);
  }
  function admMCDel(tc, ch, ev){
    const e = MINHCHUNG[tc].criteria[ch].evidences[ev];
    if(!confirm('Xóa minh chứng '+(e.code||'#'+(ev+1))+'?\n\nNội dung: '+(e.content||'(trống)').slice(0,80))) return;
    MINHCHUNG[tc].criteria[ch].evidences.splice(ev, 1);
    // Đánh lại TT
    MINHCHUNG[tc].criteria[ch].evidences.forEach((x, i) => x.tt = String(i+1));
    admMCRender();
  }
  // Nạp lại sheet MinhChung từ DATA_MINHCHUNG trong GAS (ghi đè hoàn toàn)
  function admMCResetFromSeed(){
    if(!confirm('⚡ Nạp lại 81 MC từ DATA_MINHCHUNG (TT 22/2024) trong GAS?\n\n✅ Ghi đè TOÀN BỘ sheet MinhChung bằng khung chuẩn 5 TC / 22 TCh / 81 MC.\n✅ Các sheet khác (DSGV, DS HS, Danh muc HSS, CauHinh, Hinh Anh) KHÔNG bị đụng.\n⚠️ Mọi chỉnh sửa thủ công trên sheet MinhChung hiện có sẽ bị MẤT.\n\nBạn chắc chắn muốn tiếp tục?')) return;
    const msg = document.getElementById('admMCMsg');
    msg.textContent = '⏳ Đang nạp lại khung MC chuẩn TT 22/2024 lên Google Sheet...';
    msg.className = 'adm-alert warn';
    admPostToGAS({action:'resetMinhChungSeed'}, function(ok, resp){
      if(ok){
        const rows = (resp && typeof resp === 'object' && resp.rows) ? resp.rows : '?';
        msg.textContent = '✅ Đã nạp lại ' + rows + ' dòng minh chứng chuẩn TT 22/2024! Đang tải lại trang sau 2 giây...';
        msg.className = 'adm-alert ok';
        try { localStorage.removeItem(CACHE_KEY); } catch(e){}
        setTimeout(() => location.reload(), 2000);
      } else {
        msg.textContent = '❌ Lỗi: ' + (resp || 'Không kết nối được GAS. Kiểm tra đã deploy phiên bản mới chưa (có action "resetMinhChungSeed").');
        msg.className = 'adm-alert err';
      }
      setTimeout(() => msg.className = 'adm-alert', 8000);
    });
  }

  function admMCReset(){
    if(!confirm('Khôi phục khung 22 tiêu chí theo TT 19/2018 sửa đổi bởi TT 22/2024?\n\n✓ Các minh chứng đã nhập sẽ được GIỮ NGUYÊN.\n✓ Các tiêu chí còn thiếu sẽ được bổ sung.\n✓ Tên tiêu chí sẽ trả về mặc định.\n✓ TC3 sẽ gộp còn 3 tiêu chí theo TT 22/2024.')) return;
    // Giữ evidences hiện có, reset tên
    MINHCHUNG = MC_SEED.map((seedTC, i) => {
      const cur = MINHCHUNG[i] || {};
      return {
        name: seedTC.name,
        desc: seedTC.desc,
        criteria: seedTC.criteria.map(seedCH => {
          const matchedCH = (cur.criteria||[]).find(g => g.code === seedCH.code) || {};
          return { code:seedCH.code, desc:seedCH.desc, evidences: Array.isArray(matchedCH.evidences) ? matchedCH.evidences : [] };
        })
      };
    });
    admMCRender();
    renderMinhChung();
    const msg = document.getElementById('admMCMsg');
    msg.textContent = '✅ Đã khôi phục khung 22 tiêu chí theo TT 22/2024. Nhấn "Lưu" để ghi lên Sheet.';
    msg.className = 'adm-alert ok';
    setTimeout(() => msg.className = 'adm-alert', 4000);
  }
  function admMCSave(){
    const msg = document.getElementById('admMCMsg');
    // Flatten sang đúng format 9 cột của Sheet "MinhChung":
    // [Mã TC/TC | TT | Mã MC | Nội dung | Số/ngày BH | Nơi lưu HSS | Link HSS | Người phụ trách | Ghi chú]
    // Cột 7 (Link HSS) gửi rỗng — backend tự fill bằng _syncMinhChungLinks() sau khi ghi.
    const rows = [];
    MINHCHUNG.forEach((tc, ti) => {
      rows.push(['TC'+(ti+1), '', tc.name, tc.desc, '', '', '', '', '']);
      (tc.criteria||[]).forEach(chi => {
        rows.push([chi.code, '', 'Tiêu chí '+chi.code, chi.desc, '', '', '', '', '']);
        (chi.evidences||[]).forEach((ev, ei) => {
          rows.push([
            '',                                    // 1. Mã TC/TC
            ei+1,                                  // 2. TT
            ev.code || '',                         // 3. Mã MC
            ev.content || '',                      // 4. Nội dung
            ev.issueDate || '',                    // 5. Số/ngày BH
            ev.hssRef || '',                       // 6. Nơi lưu HSS (mã)
            '',                                    // 7. Link HSS — backend auto-fill
            ev.responsible || '',                  // 8. Người phụ trách
            ev.note || ''                          // 9. Ghi chú
          ]);
        });
      });
    });
    msg.textContent = '⏳ Đang lưu '+rows.length+' dòng + đồng bộ Link HSS…';
    msg.className = 'adm-alert warn';
    admPostToGAS({action:'updateMinhChung', rows: rows}, function(ok, resp){
      if(ok){
        msg.innerHTML = '✅ Đã lưu <b>'+rows.length+' dòng</b> lên Sheet "MinhChung" và đồng bộ cột Link HSS từ Hồ sơ số. Nhấn <b>"Làm mới"</b> để xem trên website.';
        msg.className = 'adm-alert ok';
        renderMinhChung();
      } else {
        msg.textContent = '❌ Lỗi: '+(resp||'Không kết nối được API.');
        msg.className = 'adm-alert err';
      }
      setTimeout(() => msg.className = 'adm-alert', 6000);
    });
  }

  // Nút riêng: đồng bộ lại cột "Link HSS" trong Sheet MinhChung từ Sheet "Danh muc HSS"
  // (Không thay đổi nội dung MC — chỉ refresh cột 7 = Link)
  function admMCSyncLinks(){
    const msg = document.getElementById('admMCMsg');
    msg.textContent = '⏳ Đang đồng bộ cột Link HSS từ Sheet "Danh muc HSS"…';
    msg.className = 'adm-alert info';
    admPostToGAS({action:'syncMinhChungLinks'}, function(ok, resp){
      if(ok){
        const synced = (resp && typeof resp === 'object' && resp.synced != null) ? resp.synced : '?';
        msg.innerHTML = '✅ Đã đồng bộ Link HSS — <b>'+synced+' minh chứng</b> có link Drive. Nhấn <b>"Làm mới dữ liệu"</b> để xem trên giao diện.';
        msg.className = 'adm-alert ok';
      } else {
        msg.textContent = '❌ Lỗi: ' + (resp || 'Không kết nối được API. Kiểm tra đã deploy phiên bản backend mới chưa.');
        msg.className = 'adm-alert err';
      }
      setTimeout(() => msg.className = 'adm-alert', 6000);
    });
  }

  // --- Tab 3: Nhập dữ liệu Excel ---
  let _pendingGV = null, _pendingHS = null;

  // ===== STYLE CONSTANTS (khớp pixel-perfect mẫu Excel gốc) =====
  // ===== MẪU EXCEL NHÚNG SẴN (base64) =====
  const _TPL_GV = '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';
  const _TPL_HS = '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';

  function _b64toBlob(b64){
    var raw=atob(b64),arr=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
    return new Blob([arr],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  // Slugify tên trường để dùng cho tên file Excel: bỏ dấu Việt, viết hoa chữ cái đầu mỗi từ, nối bằng `_`.
  // VD: "Trường Mầm non Nghi Văn" → "TruongMamNon_NghiVan"
  function _slugSchoolName(){
    var name = (STATS && STATS.config && STATS.config.name) || 'Truong';
    return String(name)
      .normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D')
      .replace(/[^a-zA-Z0-9\s]/g,' ')
      .trim().split(/\s+/).filter(Boolean)
      .map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); })
      .join('_').slice(0, 60) || 'Truong';
  }

  // Tải mẫu Excel: LUÔN xuất phát từ mẫu base64 đã có style (màu, viền, freeze pane, banner, ghi chú).
  // Nếu trường có data → mở mẫu bằng JSZip, inject dữ liệu vào các dòng đã sẵn style trong sheet1.xml,
  //                       giữ nguyên 100% style ô; tự nhân thêm dòng nếu data > 30.
  // Nếu chưa có data → tải nguyên mẫu trống (đã được patch để bỏ tên trường/xã).
  async function admDownloadTemplate(type){
    if(typeof JSZip==='undefined'){alert('Thư viện JSZip chưa tải xong, vui lòng kiểm tra mạng và thử lại.');return;}
    var hasData,fileName,dataCount=0,dataRows=[];
    var slug = _slugSchoolName();
    if(type==='gv'){
      hasData=TEACHERS&&TEACHERS.length>0;dataCount=hasData?TEACHERS.length:0;
      fileName='Mau_DSGV_'+slug+'.xlsx';
      if(hasData){
        dataRows=TEACHERS.map(function(t,i){
          return [i+1, t.name||'', t.dob||'', t.role||'', t.degree||'', t.phone||'', t.email||'', t.link||''];
        });
      }
    }else{
      hasData=CLASSES&&CLASSES.length>0&&CLASSES.some(function(c){return c.students.length>0;});
      dataCount=hasData?CLASSES.reduce(function(s,c){return s+c.students.length;},0):0;
      fileName='Mau_DSHocSinh_'+slug+'.xlsx';
      if(hasData){
        var stt=0;
        CLASSES.forEach(function(cls){cls.students.forEach(function(s){stt++;
          dataRows.push([stt, s.classCode||'', s.studentCode||'', s.name||'', s.dob||'', s.gender||'', s.ethnic||'', s.religion||'', s.province||'', '', s.ward||'', s.hamlet||'', s.birthplace||'', s.phone||'', s.father||'', s.fatherYear||'', s.mother||'', s.motherYear||'']);
        });});
      }
    }

    try {
      var b64 = (type==='gv') ? _TPL_GV : _TPL_HS;
      var raw = atob(b64);
      var bytes = new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++) bytes[i] = raw.charCodeAt(i);

      var zip = await JSZip.loadAsync(bytes);
      var sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');

      if(hasData){
        sheetXml = _injectDataIntoSheet(sheetXml, dataRows);
      }

      zip.file('xl/worksheets/sheet1.xml', sheetXml);
      var blob = await zip.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});

      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=fileName;
      a.click();
      URL.revokeObjectURL(a.href);

      var msg=document.getElementById('admImportMsg');
      msg.textContent='✅ Đã tải '+fileName+(dataCount?' (kèm '+dataCount+' dòng dữ liệu)':' (mẫu trống)');
      msg.className='adm-alert ok';
      setTimeout(function(){msg.className='adm-alert';},4000);
    } catch(err){
      console.error('admDownloadTemplate error:', err);
      alert('Lỗi tạo file Excel: ' + (err && err.message ? err.message : err));
    }
  }

  // Inject dữ liệu vào sheet1.xml của mẫu styled, GIỮ NGUYÊN style từng ô (alternating stripes, viền, font…).
  // Nếu data > số dòng có sẵn trong template (30 cho HS, 20 cho GV), tự nhân thêm dòng theo cùng pattern style.
  // Đồng thời shift các dòng ghi chú + mergeCells + dimension nếu có mở rộng số dòng.
  function _injectDataIntoSheet(xml, dataRows){
    var rowRe = /<row\s+r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, allRows=[], m;
    while((m=rowRe.exec(xml))!==null){
      allRows.push({rowNum:parseInt(m[1],10), attrs:m[2], inner:m[3], startIdx:m.index, endIdx:m.index+m[0].length});
    }
    var tplData=[];
    for(var i=0;i<allRows.length;i++){
      var r=allRows[i];
      if(r.rowNum<4) continue;
      var cellCount=(r.inner.match(/<c\s/g)||[]).length;
      if(cellCount>=5) tplData.push(r); else break;
    }
    if(tplData.length===0) return xml;

    var oddTpl  = tplData[0];
    var evenTpl = tplData.length>=2 ? tplData[1] : oddTpl;

    function extractCells(rowInner){
      var cells=[], re=/<c\s+r="([A-Z]+)\d+"\s+s="(\d+)"/g, x;
      while((x=re.exec(rowInner))!==null) cells.push({col:x[1], style:x[2]});
      return cells;
    }
    var oddCells  = extractCells(oddTpl.inner);
    var evenCells = extractCells(evenTpl.inner);

    function escXml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    function buildRow(rowNum, rowData){
      var isOdd = ((rowNum-4)%2===0);
      var set   = isOdd ? oddCells  : evenCells;
      var attrs = isOdd ? oddTpl.attrs : evenTpl.attrs;
      var out=[];
      for(var c=0;c<set.length;c++){
        var ref = set[c].col + rowNum;
        var s   = set[c].style;
        var v   = (rowData && rowData[c]!==undefined && rowData[c]!==null) ? rowData[c] : '';
        if(v===''){
          out.push('<c r="'+ref+'" s="'+s+'" t="n"></c>');
        } else if(typeof v==='number' || (typeof v==='string' && /^-?\d+(\.\d+)?$/.test(String(v).trim()))){
          out.push('<c r="'+ref+'" s="'+s+'" t="n"><v>'+(typeof v==='number'?v:String(v).trim())+'</v></c>');
        } else {
          out.push('<c r="'+ref+'" s="'+s+'" t="inlineStr"><is><t>'+escXml(v)+'</t></is></c>');
        }
      }
      return '<row r="'+rowNum+'"'+attrs+'>'+out.join('')+'</row>';
    }

    var oldCount = tplData.length;
    var newCount = Math.max(oldCount, dataRows.length);
    var newRowsXml=[];
    for(var rr=0;rr<newCount;rr++){
      newRowsXml.push(buildRow(rr+4, dataRows[rr]||null));
    }

    var first = tplData[0], last = tplData[oldCount-1], lastRowNum = last.rowNum;
    var beforeRows = xml.substring(0, first.startIdx);
    var afterRows  = xml.substring(last.endIdx);

    var shift = newCount - oldCount;
    if(shift > 0){
      afterRows = afterRows.replace(/<row\s+r="(\d+)"/g, function(_m,n){
        var num=parseInt(n,10); return num>lastRowNum ? '<row r="'+(num+shift)+'"' : _m;
      });
      afterRows = afterRows.replace(/<c\s+r="([A-Z]+)(\d+)"/g, function(_m,col,n){
        var num=parseInt(n,10); return num>lastRowNum ? '<c r="'+col+(num+shift)+'"' : _m;
      });
      afterRows = afterRows.replace(/<mergeCell\s+ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g, function(_m,c1,n1,c2,n2){
        var a=parseInt(n1,10), b=parseInt(n2,10);
        if(a>lastRowNum) a+=shift;
        if(b>lastRowNum) b+=shift;
        return '<mergeCell ref="'+c1+a+':'+c2+b+'"';
      });
      beforeRows = beforeRows.replace(/<dimension\s+ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/, function(_m,c1,n1,c2,n2){
        return '<dimension ref="'+c1+n1+':'+c2+(parseInt(n2,10)+shift)+'"';
      });
    }

    return beforeRows + newRowsXml.join('') + afterRows;
  }

  // ===== ĐỌC FILE EXCEL HOẶC CSV =====
  function admHandleFile(file, type){
    if(!file) return;
    var ext=file.name.split('.').pop().toLowerCase();
    if(ext==='xlsx'||ext==='xls'){
      if(typeof XLSX==='undefined'){alert('Thư viện XLSX chưa tải xong.');return;}
      var reader=new FileReader();
      reader.onload=function(ev){
        var data=new Uint8Array(ev.target.result);
        var workbook=XLSX.read(data,{type:'array',cellDates:false,raw:false});
        var sheet=workbook.Sheets[workbook.SheetNames[0]];
        var rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
        var strRows=rows.map(function(r){return r.map(function(c){return String(c==null?'':c).trim();});});
        if(type==='gv'){_pendingGV=strRows;admPreviewUpload('previewGV',strRows,type);}
        else{_pendingHS=strRows;admPreviewUpload('previewHS',strRows,type);}
      };
      reader.readAsArrayBuffer(file);
    } else {
      var reader=new FileReader();
      reader.onload=function(ev){
        var rows=_parseCSV(ev.target.result);
        if(type==='gv'){_pendingGV=rows;admPreviewUpload('previewGV',rows,type);}
        else{_pendingHS=rows;admPreviewUpload('previewHS',rows,type);}
      };
      reader.readAsText(file,'UTF-8');
    }
  }

  function _parseCSV(text){
    var lines=text.split(/\r?\n/).filter(function(l){return l.trim();});
    return lines.map(function(line){
      var cols=[],cur='',inQ=false;
      for(var i=0;i<line.length;i++){var c=line[i];if(c==='"')inQ=!inQ;else if(c===','&&!inQ){cols.push(cur.trim());cur='';}else cur+=c;}
      cols.push(cur.trim());return cols;
    });
  }

  function admPreviewUpload(containerId, rows, type){
    var el=document.getElementById(containerId), data=rows;

    // ⚠ FIX BUG v2026.06+: skip header rows một cách ROBUST
    // Trước đây: dùng regex match nội dung header (stt/tt/họ/...) → bỏ sót khi template
    //   có dòng phụ như "Năm học 2025-2026", tên trường, "(Mẫu file)" → import dư 2 dòng.
    // Bây giờ: tìm dòng đầu tiên có cột STT là SỐ NGUYÊN → mọi dòng phía trên là header.
    // Nguyên tắc: dòng data thực sự LUÔN có TT (1, 2, 3...) ở cột 0.
    var startIdx = -1;
    for(var i = 0; i < data.length; i++){
      var firstCell = String(data[i][0]||'').trim();
      // Cột 0 là số nguyên dương → đây là dòng data thực sự đầu tiên
      if(/^\d+$/.test(firstCell)){
        startIdx = i;
        break;
      }
    }

    if(startIdx >= 0){
      // Tìm thấy hàng STT số → giữ từ đó trở đi, lọc giữ CHỈ những hàng có TT số
      // (loại bỏ dòng ghi chú/tổng cộng/lưu ý ở cuối hoặc giữa template)
      data = data.slice(startIdx).filter(function(r){
        return /^\d+$/.test(String(r[0]||'').trim());
      });
    } else {
      // Fallback: file CSV không có cột STT (vd user copy data từ Excel khác mất cột TT)
      // → giữ logic cũ làm fallback an toàn
      while(data.length && /^(stt|tt|họ|ho|📋|danh\s*s|xã|trường|năm\s*h|\(trống\)|\(mẫu)/i.test(
        String(data[0][0]||'') + String(data[0][1]||'') + String(data[0][3]||'')
      )) data = data.slice(1);
      data = data.filter(function(r){
        return r.some(function(c){return c&&String(c).trim();})
          && !/^[💡📌⚠️]/.test(String(r[0]||'') + String(r[1]||''));
      });
    }

    if(!data.length){el.innerHTML='<div class="adm-alert err" style="display:block">❌ File rỗng hoặc không có dữ liệu.</div>';return;}
    var maxShow=Math.min(data.length,5);
    var html='';

    // ===== Validate mã lớp (cột 1, index 1) cho file HS =====
    // Backend `_detectAge` map độ tuổi qua từ khoá: nhà trẻ | 25 | 36 tháng | 3 tuổi | 4 tuổi | 5 tuổi.
    // Nếu mã lớp KHÔNG chứa từ khoá → tab "Quản lý trẻ" sẽ KHÔNG lọc được theo độ tuổi (rơi vào nhóm "other").
    if(type==='hs'){
      var agePattern = /(nhà\s*trẻ|nha\s*tre|25\s*[-–]?\s*36|36\s*tháng|3\s*tuổi|4\s*tuổi|5\s*tuổi|3\s*tuoi|4\s*tuoi|5\s*tuoi)/i;
      var bad = [], totalChecked = 0;
      data.forEach(function(r, idx){
        var classCode = String(r[1]||'').trim();
        if(!classCode) return;
        totalChecked++;
        if(!agePattern.test(classCode)) bad.push({line: idx+1, code: classCode});
      });
      if(bad.length && totalChecked > 0){
        var sample = bad.slice(0, 3).map(function(b){ return '"'+escapeHtml(b.code)+'"'; }).join(', ');
        var more = bad.length > 3 ? ' (và '+(bad.length-3)+' mã khác)' : '';
        html += '<div class="adm-alert" style="display:block;background:#fff7e6;border:1px solid #f0c860;color:#7a5500;margin-bottom:14px;padding:12px 14px;border-radius:8px;font-size:.85rem;line-height:1.6">'
          + '⚠ <b>Cảnh báo mã lớp</b>: phát hiện <b>'+bad.length+'/'+totalChecked+'</b> mã lớp không chứa từ khoá độ tuổi (vd: '+sample+more+').<br>'
          + 'Hệ thống tự nhận diện độ tuổi từ mã lớp dựa trên các từ khoá: <code>Nhà trẻ</code> · <code>3 tuổi</code> · <code>4 tuổi</code> · <code>5 tuổi</code>. '
          + 'Mã không match → trẻ rơi vào nhóm "other", tab <b>"Quản lý trẻ"</b> sẽ không lọc được theo độ tuổi.<br>'
          + '<b>Khuyến nghị:</b> đặt mã lớp dạng <code>MG 3 tuổi A</code>, <code>Nhà trẻ B</code>, <code>4 tuổi C</code>… Vẫn có thể tiếp tục import nếu đây là chủ đích.'
          + '</div>';
      }
    }

    html+='<div class="adm-preview"><table><thead><tr>';
    var headers=type==='gv'?['TT','Họ tên','Ngày sinh','Chức vụ','Trình độ','SĐT','Gmail','Link']:['STT','Mã lớp','Mã HS','Họ tên','Ngày sinh','GT','Dân tộc','Tôn giáo'];
    headers.forEach(function(h){html+='<th>'+h+'</th>';});
    html+='</tr></thead><tbody>';
    for(var i=0;i<maxShow;i++){html+='<tr>'+data[i].slice(0,headers.length).map(function(c){return'<td>'+escapeHtml(c)+'</td>';}).join('')+'</tr>';}
    if(data.length>maxShow)html+='<tr><td colspan="'+headers.length+'" style="text-align:center;color:#94a3b8">... và '+(data.length-maxShow)+' dòng nữa</td></tr>';
    html+='</tbody></table></div>';
    html+='<p style="font-size:.85rem;color:var(--g-deep);margin:8px 0"><b>'+data.length+'</b> dòng dữ liệu sẵn sàng.</p>';
    html+='<button class="adm-btn adm-btn-primary" onclick="admDoImport(\''+type+'\')">📤 Tải lên Google Sheet</button>';
    el.innerHTML=html;
    if(type==='gv')_pendingGV=data;else _pendingHS=data;
  }


  function admDoImport(type){
    const msg = document.getElementById('admImportMsg');
    let rows, action, label;
    if(type === 'gv'){
      rows = _pendingGV; action = 'importTeachers'; label = 'giáo viên';
      // Đảm bảo 8 cột
      rows = rows.map(r => { while(r.length < 8) r.push(''); return r.slice(0,8); });
    } else {
      rows = _pendingHS; action = 'importStudents'; label = 'học sinh';
      rows = rows.map(r => { while(r.length < 18) r.push(''); return r.slice(0,18); });
    }
    if(!rows || !rows.length){
      msg.textContent = '❌ Chưa chọn file.';
      msg.className = 'adm-alert err'; return;
    }
    // ⚠ QW3 v2026.06+: confirm 2-step cho thao tác phá hoại (xóa toàn bộ rồi ghi mới).
    //   Backend importTeachers/importStudents clear toàn bộ data cũ trước khi ghi → không undo được.
    //   Step 1: hiện preview rõ ràng (số dòng cũ → số dòng mới).
    //   Step 2: yêu cầu user gõ "XOA" để xác nhận — chống lỡ tay click OK quá nhanh.
    const oldCount = (type === 'gv'
      ? (window.TEACHERS && TEACHERS.length) || 0
      : (window.CLASSES || []).reduce((s, c) => s + ((c.students && c.students.length) || 0), 0));
    const warning =
      '⚠ XÁC NHẬN THAO TÁC PHÁ HOẠI ⚠\n\n' +
      'Đây là thao tác KHÔNG THỂ HOÀN TÁC trên Google Sheet.\n\n' +
      '• Sẽ XÓA: ' + oldCount + ' ' + label + ' hiện có\n' +
      '• Sẽ GHI MỚI: ' + rows.length + ' ' + label + ' từ file Excel vừa chọn\n\n' +
      'Đề nghị: hãy mở Google Sheet → Tệp → Lịch sử phiên bản → ghi nhận bản hiện tại trước khi tiếp tục.\n\n' +
      'Để tiếp tục, gõ chính xác chữ XOA (viết hoa, không dấu) rồi bấm OK:';
    const userInput = prompt(warning, '');
    if(userInput === null) return; // user đã bấm Cancel
    if(String(userInput).trim().toUpperCase() !== 'XOA'){
      msg.textContent = '🛑 Đã hủy: bạn không gõ đúng "XOA". An toàn — dữ liệu cũ vẫn nguyên vẹn.';
      msg.className = 'adm-alert warn';
      setTimeout(() => msg.className = 'adm-alert', 5000);
      return;
    }
    msg.textContent = '⏳ Đang tải lên ' + rows.length + ' ' + label + '...';
    msg.className = 'adm-alert warn';
    admPostToGAS({action: action, rows: rows}, function(ok, resp){
      if(ok){
        msg.textContent = '✅ Đã tải lên thành công ' + rows.length + ' ' + label + '! (Đã thay thế ' + oldCount + ' bản ghi cũ)';
        msg.className = 'adm-alert ok';
        if(type === 'gv'){ _pendingGV = null; document.getElementById('previewGV').innerHTML = ''; }
        else { _pendingHS = null; document.getElementById('previewHS').innerHTML = ''; }
      } else {
        msg.textContent = '❌ Lỗi: ' + (resp || 'Không kết nối được API');
        msg.className = 'adm-alert err';
      }
      setTimeout(() => msg.className = 'adm-alert', 5000);
    });
  }

  // --- POST dữ liệu tới GAS ---
  // v2026.05: tự inject pwdHash (SHA-256 của _admPwd()) → backend verify quyền Admin trước khi ghi.
  // Backend trả code='UNAUTHORIZED' nếu hash sai → hiện thông báo rõ ràng, không retry câm.
  async function admPostToGAS(body, callback){
    const url = getApiUrl();
    if(!isApiUrlValid()){ callback(false, 'Chưa cấu hình URL Apps Script'); return; }
    // ⚠ HOTFIX v2026.06: ưu tiên dùng pwdHash sẵn có từ localStorage (an toàn, không cần plaintext).
    //   Fallback: nếu memory có plaintext thì hash lại; cuối cùng dùng FALLBACK_ADMIN_HASH.
    try {
      const stored = _admPwdHash();
      if(stored){
        body.pwdHash = stored;
      } else {
        const pwd = _admPwd(); // memory only
        body.pwdHash = pwd ? await _sha256hex(pwd) : (typeof FALLBACK_ADMIN_HASH !== 'undefined' ? FALLBACK_ADMIN_HASH : '');
      }
    } catch(e) { body.pwdHash = ''; }

    // ⚠ HOTFIX v2026.06: phân biệt "thực sự fail" với "CORS fallback (đã gửi nhưng không đọc được response)".
    //   Trước đây mọi catch đều fake success "Đã gửi dữ liệu" → user không biết khi mạng fail thật.
    let responseRead = false;
    fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(body),
      redirect: 'follow'
    })
    .then(r => {
      responseRead = true; // đã có response (dù status thế nào)
      return r.text();
    })
    .then(text => {
      try {
        const j = JSON.parse(text);
        if(j.code === 'UNAUTHORIZED'){
          callback(false, '🔒 Mật khẩu Admin không khớp với Sheet "CauHinh". Hãy đăng nhập lại bằng mật khẩu mới, hoặc vào Sheet sửa hàng "Mật khẩu Admin".');
          // Force re-login lần kế tiếp + xóa memory + xóa hash cũ trong localStorage
          window._admLoggedIn = false;
          window._admInMemoryPwd = null;
          try{
            const cur = _admGet();
            delete cur.pwdHash;
            localStorage.setItem(ADM_KEY, JSON.stringify(cur));
          } catch(e){}
          return;
        }
        callback(j.ok, j.error || j.data);
      } catch(e) {
        // Response không parse được — có thể là HTML redirect của GAS. GAS thường chấp nhận POST → coi như OK.
        callback(true, 'Đã gửi (phản hồi không đọc được — dữ liệu thường vẫn được lưu, hãy bấm Làm mới để xác nhận).');
      }
    })
    .catch(err => {
      // Phân biệt:
      //   - Nếu responseRead = false → không hề có response (mất mạng, DNS fail, CORS preflight fail thật) → BÁO LỖI THẬT
      //   - Nếu responseRead = true mà vẫn rơi vào catch → response có nhưng .text() lỗi → vẫn coi là gửi được
      if(!responseRead){
        callback(false, '❌ Không gửi được dữ liệu: ' + (err && err.message ? err.message : 'mất kết nối mạng') + '. Kiểm tra mạng và thử lại.');
      } else {
        callback(true, 'Đã gửi dữ liệu. Nhấn Làm mới để xem kết quả.');
      }
    });
  }

  function admRefresh(){
    try{ localStorage.removeItem(CACHE_KEY); } catch(e){}
    const url = getApiUrl();
    if(isApiUrlValid()) {
      const s = document.createElement('script');
      s.src = url + '?action=all&nocache=1&callback=_admNoop';
      window._admNoop = function(){ delete window._admNoop; };
      document.body.appendChild(s);
    }
    setTimeout(() => location.reload(), 500);
  }

  // Quét trạng thái Drive folder ngay (admin tab Hệ thống)
  // ⚠ HOTFIX v2026.05+: dùng admPostToGAS để có pwdHash. Trước đây gọi fetch trực tiếp
  //   (thiếu pwdHash) → khi bật STRICT_AUTH=1 sẽ bị backend trả UNAUTHORIZED.
  function admRefreshFolderStatus(btn){
    if(!btn) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Đang quét... (15-25s)';
    const msgEl = document.getElementById('admSysMsg');
    if(msgEl){ msgEl.textContent = ''; msgEl.className = 'adm-alert'; }

    admPostToGAS({action:'refreshFolderStatus'}, function(ok, info){
      if(!ok){
        if(msgEl){
          msgEl.innerHTML = '❌ Lỗi: ' + escapeHtml(typeof info === 'string' ? info : 'Không rõ');
          msgEl.className = 'adm-alert err';
        }
        btn.disabled = false; btn.innerHTML = original;
        return;
      }
      // info có thể là string (CORS fallback) hoặc object data từ backend
      const r = (typeof info === 'object' && info) ? info : {};
      const s = r.stats || {};
      if(msgEl){
        if(r.refreshed != null){
          msgEl.innerHTML = '✅ Đã quét ' + (r.refreshed||0) + ' hồ sơ — ' +
            '🟢 Đã có: ' + (s.ok||0) + ' · 🔴 Trống: ' + (s.empty||0) +
            ' · ⚪ Chưa link: ' + (s.noLink||0) + ' · ⚠ Lỗi: ' + (s.error||0);
        } else {
          msgEl.innerHTML = '✅ Đã gửi yêu cầu quét — đang làm mới dữ liệu...';
        }
        msgEl.className = 'adm-alert ok';
      }
      // Reload data để frontend có folderStatus mới
      try{ localStorage.removeItem(CACHE_KEY); } catch(e){}
      fetchGAS(function(freshData){
        _cacheSave(freshData);
        boot(freshData, false);
        btn.disabled = false; btn.innerHTML = '✅ Đã quét xong';
        setTimeout(() => { btn.innerHTML = original; }, 4000);
      }, function(){
        btn.disabled = false; btn.innerHTML = original;
      });
    });
  }

  function admClearCache(){
    if(!confirm('Xóa toàn bộ bộ nhớ đệm? Trang sẽ tải lại dữ liệu mới từ Google Sheet.')) return;
    try{ localStorage.removeItem(CACHE_KEY); } catch(e){}
    location.reload();
  }

  // ==================================================================
  // TAB: Ảnh hoạt động — CRUD trực tiếp (không cần mở Google Sheet)
  // ==================================================================
  let _admImagesData = [];

  function admLoadImages(){
    // Đọc từ biến IMAGES global (đã được boot() set từ data backend)
    const src = (window.IMAGES || []);
    _admImagesData = src.map(im => ({
      title: String(im.title || ''),
      desc: String(im.desc || ''),
      url: String(im.url || im.originalUrl || ''),
      type: String(im.type || 'hoatdong')
    }));
    admRenderImages();
  }

  function admRenderImages(){
    const list = document.getElementById('admImagesList');
    const cnt = document.getElementById('admImgCount');
    if(cnt) cnt.textContent = _admImagesData.length + ' ảnh';
    if(!_admImagesData.length){
      list.innerHTML = '<p style="padding:30px;text-align:center;color:#94a3b8;font-size:.88rem">Chưa có ảnh nào.<br>Bấm <b>"＋ Thêm ảnh"</b> để bắt đầu.</p>';
      return;
    }
    list.innerHTML = _admImagesData.map((im, i) => `
      <div class="adm-img-row">
        <div class="adm-img-thumb">${im.url ? `<img src="${escapeHtml(im.url)}" alt="" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'⚠\'">` : '🖼'}</div>
        <div class="adm-img-fields">
          <input type="text" placeholder="Tiêu đề (VD: Lễ khai giảng)" value="${escapeHtml(im.title)}" oninput="_admImagesData[${i}].title=this.value" data-idx="${i}" data-fld="title">
          <select onchange="_admImagesData[${i}].type=this.value">
            <option value="truong" ${im.type==='truong'?'selected':''}>🏫 Toàn cảnh trường</option>
            <option value="hoatdong" ${im.type==='hoatdong'?'selected':''}>🎈 Hoạt động bé</option>
            <option value="banru" ${im.type==='banru'?'selected':''}>🍱 Bữa ăn / Bán trú</option>
            <option value="lehoi" ${im.type==='lehoi'?'selected':''}>🎉 Lễ hội / Sự kiện</option>
          </select>
          <input type="text" placeholder="Mô tả ngắn (không bắt buộc)" value="${escapeHtml(im.desc)}" oninput="_admImagesData[${i}].desc=this.value" data-idx="${i}" data-fld="desc" style="grid-column:1/-1">
          <input type="text" class="adm-img-url" placeholder="https://drive.google.com/file/d/... (đã share Anyone)" value="${escapeHtml(im.url)}" oninput="_admImagesData[${i}].url=this.value;_admImgUpdateThumb(${i},this.value)" data-idx="${i}" data-fld="url">
        </div>
        <button class="adm-btn adm-btn-danger adm-img-del" style="padding:8px 12px;font-size:.85rem" onclick="admDelImage(${i})" title="Xóa ảnh này">🗑</button>
      </div>
    `).join('');
  }

  function _admImgUpdateThumb(i, url){
    const row = document.querySelectorAll('.adm-img-row')[i];
    if(!row) return;
    const thumb = row.querySelector('.adm-img-thumb');
    if(!thumb) return;
    thumb.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='⚠'">` : '🖼';
  }

  function admAddImage(){
    _admImagesData.push({ title:'', desc:'', url:'', type:'hoatdong' });
    admRenderImages();
    // Cuộn xuống cuối + focus vào ô URL của ảnh mới
    setTimeout(() => {
      const rows = document.querySelectorAll('.adm-img-row');
      const last = rows[rows.length - 1];
      if(last){
        last.scrollIntoView({behavior:'smooth', block:'center'});
        const urlInput = last.querySelector('.adm-img-url');
        if(urlInput) urlInput.focus();
      }
    }, 80);
  }

  function admDelImage(i){
    const im = _admImagesData[i];
    const label = im && (im.title || im.url) ? '"' + (im.title || im.url.slice(0, 50)) + '"' : 'ảnh #' + (i+1);
    if(!confirm('Xóa ' + label + '?')) return;
    _admImagesData.splice(i, 1);
    admRenderImages();
  }

  function admSaveImages(){
    const msg = document.getElementById('admImagesMsg');
    // Lọc các dòng có URL (bỏ ảnh trống)
    const valid = _admImagesData.filter(im => im.url && im.url.trim());
    const rows = valid.map((im, i) => [i+1, im.title || '', im.desc || '', im.url.trim(), im.type || 'hoatdong']);

    if(!valid.length){
      if(!confirm('Danh sách ảnh đang trống. Lưu sẽ XÓA TOÀN BỘ ảnh đang có trên Sheet. Tiếp tục?')) return;
    }
    msg.textContent = '⏳ Đang lưu ' + rows.length + ' ảnh lên Google Sheet…';
    msg.className = 'adm-alert info';
    admPostToGAS({action:'updateImages', rows: rows}, function(ok, info){
      if(ok){
        msg.innerHTML = '✅ <b>Đã lưu ' + rows.length + ' ảnh.</b> Bấm "Làm mới" hoặc reload để xem trên trang chủ.';
        msg.className = 'adm-alert ok';
        setTimeout(() => msg.className = 'adm-alert', 5000);
      } else {
        msg.textContent = '❌ Lỗi: ' + (info || 'Không kết nối được API');
        msg.className = 'adm-alert err';
      }
    });
  }

  // --- Tab 4: Đổi mật khẩu ---
  // v2026.05: ngoài lưu local, đồng bộ password mới lên Sheet CauHinh để các thiết bị khác cùng dùng.
  async function admChangePwd(){
    const old = document.getElementById('admOldPwd').value;
    const nw = document.getElementById('admNewPwd').value;
    const nw2 = document.getElementById('admNewPwd2').value;
    const msg = document.getElementById('admPwdMsg');

    // ⚠ HOTFIX v2026.06: verify mật khẩu hiện tại dựa trên session memory.
    //   Plaintext không còn lưu trên disk → nếu user reload tab và chưa đăng nhập lại → memory rỗng.
    //   Trường hợp đó: yêu cầu đăng nhập lại trước khi đổi (an toàn hơn).
    const memoryPwd = window._admInMemoryPwd;
    if(!memoryPwd){
      msg.textContent = '❌ Phiên đăng nhập đã hết. Vui lòng đóng panel Admin, đăng nhập lại bằng mật khẩu hiện tại, rồi thử đổi.';
      msg.className = 'adm-alert err'; return;
    }
    if(old !== memoryPwd){
      msg.textContent = '❌ Mật khẩu hiện tại không đúng.';
      msg.className = 'adm-alert err'; return;
    }
    if(!nw || nw.length < 6){
      msg.textContent = '❌ Mật khẩu mới phải có ít nhất 6 ký tự.';
      msg.className = 'adm-alert err'; return;
    }
    if(nw === ADM_FALLBACK_PWD || nw === 'admin@2026' || nw.toLowerCase() === 'admin'){
      msg.textContent = '❌ Không được dùng mật khẩu mặc định. Hãy chọn mật khẩu riêng của trường.';
      msg.className = 'adm-alert err'; return;
    }
    if(nw !== nw2){
      msg.textContent = '❌ Xác nhận mật khẩu không khớp.';
      msg.className = 'adm-alert err'; return;
    }

    msg.textContent = '⏳ Đang đồng bộ mật khẩu mới lên Google Sheet...';
    msg.className = 'adm-alert';

    // Gửi password CŨ (qua pwdHash hiện tại trong admPostToGAS) lên backend để verify, ghi Sheet với password MỚI.
    admPostToGAS({action:'updateConfig', rows:[['Mật khẩu Admin', nw]]}, async function(ok, info){
      if(!ok){
        msg.textContent = '❌ Không lưu được lên Sheet: ' + (typeof info === 'string' ? info : JSON.stringify(info));
        msg.className = 'adm-alert err'; return;
      }
      // ⚠ HOTFIX v2026.06: lưu HASH (an toàn) + cập nhật memory plaintext.
      try{
        const newHash = await _sha256hex(nw);
        window._admInMemoryPwd = nw; // memory only
        _admSet({pwdHash: newHash, pwdSetAt: new Date().toISOString()});
        // Cập nhật STATS.config để các check sau dùng hash mới
        if(window.STATS && STATS.config){
          STATS.config.adminPasswordHash = newHash;
          STATS.config.isDefaultPwd = false;
        }
        try{ if(typeof _precomputeAdminHash === 'function') _precomputeAdminHash(); } catch(e){}
      }catch(e){}

      document.getElementById('admOldPwd').value = '';
      document.getElementById('admNewPwd').value = '';
      document.getElementById('admNewPwd2').value = '';

      msg.textContent = '✅ Đổi mật khẩu thành công! Mật khẩu mới đã được đồng bộ lên Sheet — các máy khác sẽ dùng được.';
      msg.className = 'adm-alert ok';
      setTimeout(() => msg.className = 'adm-alert', 5000);
      // ⚠ HOTFIX v2026.06: gỡ bắt buộc đổi pwd, ẩn banner đỏ, mở khóa các tab khác
      window._admForcePwdChange = false;
      try{ if(typeof _admHideForcePwdBanner === 'function') _admHideForcePwdBanner(); }catch(e){}
    });
  }

  // Áp dụng config từ localStorage khi boot
  admApplyConfig();

  loadData();

  /* ==================================================================
     BRIDGE: Hồ sơ số  →  Tab mới Hệ thống KĐCL (TDG_MamNon/app.html?from=hoso)
     - User click nav "KĐCL - TĐG" → trình duyệt mở tab mới (target=_blank)
     - Onclick synchronously ghi payload vào localStorage (share được giữa tab)
     - Trên tab KĐCL: nút "← Hồ sơ số" → window.close() | fallback navigate
  ================================================================== */
  const HSO_TO_TDG_KEY = 'hso_to_tdg_v1';

  function _buildSchoolInfoPayload(){
    const adm = _admGet();
    const cfg = (STATS && STATS.config) || {};
    const name = adm.schoolName || cfg.name || 'Trường Mầm non';
    // Tách địa chỉ thành ward/province nếu được (VN 2 cấp: "Xã X, tỉnh Y")
    const addr = adm.schoolAddr || cfg.address || '';
    let ward = '', province = '';
    const m = addr.match(/^(.*?),\s*(.+)$/);
    if(m){ ward = m[1].trim(); province = m[2].trim(); }
    // Năm học → academicYearFrom/To
    const yr = adm.schoolYear || cfg.schoolYear || '';
    let yf = '', yt = '';
    const ym = yr.match(/(\d{4})\s*[–-]\s*(\d{4})/);
    if(ym){ yf = ym[1]; yt = ym[2]; }
    // Thống kê từ STATS
    const st = STATS || {};
    return {
      name: name,
      type: 'mamnon',
      address: addr,
      ward: ward,
      province: province,
      principal: adm.principal || '',
      phone: adm.schoolPhone || cfg.phone || '',
      email: adm.schoolEmail || cfg.email || '',
      academicYearFrom: yf,
      academicYearTo: yt,
      numStudents: st.children || st.numStudents || 0,
      numClasses: st.classes || st.numClasses || 0,
      numTeachers: st.teachers || st.numTeachers || 0,
      numStaff: st.staff || st.numStaff || 0
    };
  }

  function _buildEvidencePayload(){
    // Chuyển MINHCHUNG thành danh sách markdown cho TDG.sources.evidenceList
    if(!Array.isArray(MINHCHUNG) || !MINHCHUNG.length) return '';
    const lines = ['# Danh mục minh chứng đã mã hoá (từ Hồ sơ số MN)'];
    let curTC = '', curTChi = '';
    for(const r of MINHCHUNG){
      const ma = (r[0]||'').toString().trim();
      const tt = r[1];
      const maMC = (r[2]||'').toString().trim();
      const noiDung = (r[3]||'').toString().trim();
      const ngayBH = (r[4]||'').toString().trim();
      const nguon = (r[5]||'').toString().trim();
      if(ma && ma.startsWith('TC')){
        curTC = `\n## ${ma} · ${noiDung}`;
        lines.push(curTC);
      } else if(ma && /^\d+\.\d+$/.test(ma)){
        curTChi = `\n### Tiêu chí ${ma} · ${noiDung}`;
        lines.push(curTChi);
      } else if(maMC){
        let line = `- ${maMC} ${noiDung}`;
        if(nguon) line += ` _(${nguon}`;
        if(nguon && ngayBH) line += `, ${ngayBH}`;
        else if(ngayBH) line += ` _(${ngayBH}`;
        if(nguon || ngayBH) line += ')_';
        lines.push(line);
      }
    }
    return lines.join('\n');
  }

  // Build cấu trúc phân cấp { id, title, name, tieuchi:[ {id, title, name, items:[ {code, content, issueDate, hssRef, link, responsible, note, tt} ]} ] }
  // từ MINHCHUNG (nested object đã được mergeMCSeed). Phục vụ KĐCL bridge — workspace Quản lý minh chứng.
  // Schema 9 cột: chấp nhận cả `responsible` (mới) và `issuer` (legacy fallback từ MC_SEED) → unify ra `responsible`.
  function _buildMinhChungTree(){
    if(!Array.isArray(MINHCHUNG) || !MINHCHUNG.length) return [];
    return MINHCHUNG.map((tc, ti) => ({
      id: 'TC' + (ti + 1),
      title: tc.name || ('Tiêu chuẩn ' + (ti + 1)),
      name: tc.desc || '',
      tieuchi: (tc.criteria || []).map(chi => ({
        id: chi.code || '',
        title: 'Tiêu chí ' + (chi.code || ''),
        name: chi.desc || '',
        items: (chi.evidences || []).map(ev => ({
          tt: ev.tt || '',
          code: ev.code || '',
          content: ev.content || '',
          issueDate: ev.issueDate || '',
          hssRef: ev.hssRef || '',
          link: ev.link || '',
          responsible: ev.responsible || ev.issuer || '',  // legacy MC_SEED dùng `issuer`
          note: ev.note || ''
        }))
      }))
    }));
  }

  function _countMC(){
    if(!Array.isArray(MINHCHUNG)) return 0;
    return MINHCHUNG.filter(r => {
      const c0 = (r[0]||'').toString().trim();
      return c0 === '' && (r[2]||'').toString().trim().startsWith('[');
    }).length;
  }

  /* ==================================================================
     GUIDE MODAL — popup Hướng dẫn (thay section phẳng)
  ================================================================== */
  function openGuideModal(ev){
    if(ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    const m = document.getElementById('guideModal');
    if(!m) return false;
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Cuộn body modal về đầu mỗi lần mở
    const body = m.querySelector('.guide-modal-body');
    if(body) body.scrollTop = 0;
    return false;
  }
  function closeGuideModal(){
    const m = document.getElementById('guideModal');
    if(!m) return;
    m.classList.remove('open');
    document.body.style.overflow = '';
  }
  // Đóng khi click vào backdrop (ngoài panel)
  document.addEventListener('click', function(ev){
    const m = document.getElementById('guideModal');
    if(m && m.classList.contains('open') && ev.target === m) closeGuideModal();
  });
  // ESC để đóng
  document.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape'){
      const m = document.getElementById('guideModal');
      if(m && m.classList.contains('open')) closeGuideModal();
    }
  });

  // ==================================================================
  // window.refreshHsoData() — được TDG gọi khi Admin bấm "Làm mới dữ liệu trường"
  // Fetch fresh data từ Google Sheet, cập nhật window globals, dispatch
  // CustomEvent 'tdg:applyBridge' để TDG re-apply payload vào state.
  // Ghi chú: báo cáo ĐÃ SAVE trên Drive vẫn giữ snapshot cũ (không ảnh hưởng).
  //          Chỉ áp dụng cho báo cáo MỚI đang soạn + sau khi save sẽ snapshot dữ liệu mới.
  // ==================================================================
  window.refreshHsoData = function(){
    return new Promise(function(resolve, reject){
      try{
        fetchGAS(
          function(freshData){
            _cacheSave(freshData);
            // Re-boot để cập nhật window.TEACHERS, CLASSES, STATS, MINHCHUNG
            boot(freshData, false);
            // Đợi 1 frame để boot hoàn tất (render xong các section)
            setTimeout(function(){
              try{
                var payload = _buildBridgePayload();
                window.__HSS_MINHCHUNG__ = payload.hssMinhChung;
                window.__HSS_DATA__ = payload.hssData;
                window.dispatchEvent(new CustomEvent('tdg:applyBridge', { detail: payload }));
                resolve({
                  ok: true,
                  teachers: (payload.hssData && payload.hssData.teacherStats && payload.hssData.teacherStats.total) || 0,
                  students: (payload.hssData && payload.hssData.studentStats && payload.hssData.studentStats.total) || 0,
                  classes: (payload.hssData && payload.hssData.classes && payload.hssData.classes.length) || 0,
                  minhchung: (payload.hssMinhChung || []).reduce(function(a, tc){
                    return a + (tc.tieuchi || []).reduce(function(b, t){ return b + (t.items || []).length; }, 0);
                  }, 0),
                  at: new Date().toLocaleString('vi-VN')
                });
              }catch(e){ reject(e); }
            }, 200);
          },
          function(err){ reject(new Error(err)); },
          2
        );
      }catch(e){ reject(e); }
    });
  };

  // Prepare handoff: chạy synchronously trong onclick của nav link KĐCL-TĐG.
  // Ghi payload vào localStorage NGAY trước khi tab mới mở ra, để pre-boot của
  // trang KĐCL đọc được. Dùng localStorage (share giữa tab cùng origin), không
  // sessionStorage (sessionStorage của tab mới sẽ rỗng hoàn toàn).
  function kdclPrepareHandoff(){
    try{
      const payload = {
        schoolInfo: _buildSchoolInfoPayload(),
        evidenceList: _buildEvidencePayload(),
        minhChungRaw: _buildMinhChungTree(),
        from: 'hoso',
        backUrl: location.href.replace(/#.*$/, ''),
        ts: Date.now()
      };
      localStorage.setItem(HSO_TO_TDG_KEY, JSON.stringify(payload));
    }catch(e){
      console.warn('[HSO→TDG] Không ghi được localStorage:', e);
    }
    // Trả về true để <a target="_blank"> tiếp tục mở tab (không preventDefault)
    return true;
  }

/* ===== Phần 3: Utility (scrollToTop, etc.) ===== */
function scrollToTop(){
    window.scrollTo({top:0, behavior:'smooth'});
    const fab = document.getElementById('backtopFab');
    if(fab) fab.blur();
  }
  (function setupBackTopFab(){
    const fab = document.getElementById('backtopFab');
    if(!fab) return;
    let ticking = false;
    function update(){
      const scrolled = window.scrollY > 400;
      fab.classList.toggle('visible', scrolled);
      ticking = false;
    }
    window.addEventListener('scroll', function(){
      if(!ticking){
        requestAnimationFrame(update);
        ticking = true;
      }
    }, {passive:true});
    // Lắng nghe ESC để đóng guide modal hoặc quay về đầu trang khi đang scroll sâu
    document.addEventListener('keydown', function(ev){
      if(ev.key === 'Home' && ev.ctrlKey){ ev.preventDefault(); scrollToTop(); }
    });
  })();
  // Fix "đóng băng": đảm bảo body overflow luôn reset khi chuyển section qua anchor
  window.addEventListener('hashchange', function(){
    if(document.body.style.overflow === 'hidden'){
      // Nếu không có modal nào đang mở thì reset
      const openModal = document.querySelector('.guide-modal.open, .admin-overlay.open');
      if(!openModal) document.body.style.overflow = '';
    }
  });

/* ===== Phần 4: KĐCL view-swap glue (lazy load React app khi user click "KĐCL-TĐG") ===== */
(function(){
  // LOCK __tdgBackToHso: Object.defineProperty với setter no-op để TDG's IIFE
  // không thể override function này về window.close()+location.href nữa.
  var _backFn = function(){ showHoso(); };
  try{
    Object.defineProperty(window, '__tdgBackToHso', {
      get: function(){ return _backFn; },
      set: function(){},
      configurable: false
    });
  }catch(e){
    window.__tdgBackToHso = _backFn;
  }

  window.__TDG_FROM_HSO__ = true;
  window.__TDG_BACK_URL__ = location.href.replace(/#.*$/, '');

  /* ==================================================================
     LAZY LOAD: chỉ tải React+Babel+Tailwind+Mammoth khi user click K\u0110CL
     l\u1ea7n \u0111\u1ea7u. Trang H\u1ed3 s\u01a1 s\u1ed1 kh\u00f4ng c\u1ea7n c\u00e1c lib n\u00e0y \u2192 initial load nhanh.
  ================================================================== */
  let _kdclLibsPromise = null;

  function _loadScriptOnce(src, attrs){
    return new Promise(function(resolve, reject){
      var exists = document.querySelector('script[data-lib="'+src+'"]');
      if(exists){ resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.setAttribute('data-lib', src);
      if(attrs && attrs.crossOrigin) s.crossOrigin = attrs.crossOrigin;
      s.onload = function(){ resolve(); };
      s.onerror = function(){ reject(new Error('Không tải được: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function _setKdclBootText(txt){
    var main = document.getElementById('bootMain');
    if(main) main.textContent = txt;
  }

  async function loadKdclLibs(){
    if(_kdclLibsPromise) return _kdclLibsPromise;
    _kdclLibsPromise = (async function(){
      _setKdclBootText('Đang đồng bộ dữ liệu. Vui lòng đợi!');
      // Tải Tailwind + config (song song được vì config set sau khi load xong)
      await _loadScriptOnce('https://cdn.tailwindcss.com');
      try{ if(window.tailwind) window.tailwind.config = {corePlugins:{preflight:false}}; }catch(e){}
      await _loadScriptOnce('https://unpkg.com/react@18/umd/react.production.min.js', {crossOrigin:''});
      await _loadScriptOnce('https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', {crossOrigin:''});
      await _loadScriptOnce('https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js');
      // JSZip — phục vụ tải lô 25 mẫu Phiếu TĐG (1 file .zip)
      await _loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      await _loadScriptOnce('https://unpkg.com/@babel/standalone/babel.min.js');
      // Transform TDG source + execute
      var srcEl = document.getElementById('tdgReactSource');
      if(!srcEl) throw new Error('Không tìm thấy #tdgReactSource');
      var src = srcEl.textContent;
      var transformed = window.Babel.transform(src, {presets:['react']}).code;
      // Dùng script injection thay cho eval để code chạy ở global scope
      var execScript = document.createElement('script');
      execScript.textContent = transformed;
      document.body.appendChild(execScript);
    })();
    return _kdclLibsPromise;
  }

  // Hash mật khẩu Admin được tính từ config Sheet CauHinh (row "Mật khẩu Admin").
  // Fallback 'admin@2026' nếu Sheet chưa có row hoặc crypto.subtle không khả dụng (file://).
  var FALLBACK_ADMIN_HASH = '8b3ce0c3977ee6e8d53efeb1fb5b4f82bfb85e44b706c4eded197bd78875da67';
  var _cachedAdminHash = FALLBACK_ADMIN_HASH;

  // Tính hash từ password với timeout 2s (phòng crypto.subtle hang trên file://)
  async function _sha256hex(text){
    if(!text) return FALLBACK_ADMIN_HASH;
    if(!window.crypto || !window.crypto.subtle || typeof window.crypto.subtle.digest !== 'function'){
      console.warn('[sha256] crypto.subtle không khả dụng → dùng FALLBACK_ADMIN_HASH');
      return FALLBACK_ADMIN_HASH;
    }
    try{
      var buf = await Promise.race([
        window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
        new Promise(function(_, reject){ setTimeout(function(){ reject(new Error('crypto.subtle timeout')); }, 2000); })
      ]);
      return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
    }catch(e){
      console.warn('[sha256] lỗi:', e.message, '→ dùng FALLBACK');
      return FALLBACK_ADMIN_HASH;
    }
  }

  // Precompute hash khi config từ Sheet load xong (gọi trong admApplyConfig)
  // ⚠ HOTFIX v2026.06: dùng pwdHash đã lưu sẵn (an toàn) thay vì re-hash plaintext.
  // Ưu tiên: pwdHash trong localStorage (user đã đổi) > hash từ Sheet CauHinh > fallback
  async function _precomputeAdminHash(){
    try{
      // 1. Thử lấy pwdHash đã lưu sẵn (HOTFIX v2026.06: chỉ lưu hash, không lưu plaintext)
      try{
        var adm = JSON.parse(localStorage.getItem('mnDXAdmin') || '{}');
        if(adm && adm.pwdHash){
          _cachedAdminHash = adm.pwdHash;
          return;
        }
        // Migration nhánh cũ: nếu còn plaintext `pwd` từ phiên trước v2026.06 → hash + lưu lại + xóa plaintext
        if(adm && adm.pwd){
          _cachedAdminHash = await _sha256hex(adm.pwd);
          adm.pwdHash = _cachedAdminHash;
          delete adm.pwd;
          try{ localStorage.setItem('mnDXAdmin', JSON.stringify(adm)); }catch(e){}
          return;
        }
      }catch(e){}
      // 2. Backend mới (v2026.05+) trả adminPasswordHash trực tiếp → dùng luôn, không cần hash
      var cfg = (window.STATS && STATS.config) || {};
      if(cfg.adminPasswordHash){
        _cachedAdminHash = cfg.adminPasswordHash;
        return;
      }
      // 3. Legacy backend: plaintext adminPassword (rất cũ, gần như không gặp)
      if(cfg.adminPassword){
        _cachedAdminHash = await _sha256hex(cfg.adminPassword);
        return;
      }
      _cachedAdminHash = FALLBACK_ADMIN_HASH;
    }catch(e){ _cachedAdminHash = FALLBACK_ADMIN_HASH; }
  }

  // Build payload SYNCHRONOUSLY — không await crypto trong showKdcl (tránh hang file://)
  function _buildBridgePayload(){
    var si = typeof _buildSchoolInfoPayload === 'function' ? _buildSchoolInfoPayload() : {};
    si.adminPasswordHash = _cachedAdminHash;
    si.passwordSetAt = si.passwordSetAt || new Date().toISOString();
    // Bổ sung số liệu thô từ Hồ sơ số vào schoolInfo (AI sẽ dùng trực tiếp)
    var hssData = _buildHssDataPayload();
    if(hssData && hssData.teacherStats){
      si.numTeachers = hssData.teacherStats.total;
      si.numStaff = (hssData.teacherStats.byRole && hssData.teacherStats.byRole['Nhân viên']) || 0;
    }
    if(hssData && hssData.studentStats){
      si.numStudents = hssData.studentStats.total;
    }
    if(hssData && hssData.classes){
      si.numClasses = hssData.classes.length;
      // Đếm theo độ tuổi
      var ageCounts = { nha_tre:0, mg3:0, mg4:0, mg5:0 };
      hssData.classes.forEach(function(c){
        if(ageCounts[c.ageGroup] !== undefined) ageCounts[c.ageGroup]++;
      });
      si.numNhomNhaTre = ageCounts.nha_tre;
      si.numLopMGBe = ageCounts.mg3;
      si.numLopMGNho = ageCounts.mg4;
      si.numLopMGLon = ageCounts.mg5;
    }
    return {
      schoolInfo: si,
      evidenceList: typeof _buildEvidencePayload === 'function' ? _buildEvidencePayload() : '',
      hssMinhChung: typeof _buildMinhChungTree === 'function' ? _buildMinhChungTree() : [],
      hssData: hssData,
      // SSO: nếu user đã đăng nhập admin ở HSS → KĐCL tự nhận admin (không cần login lần 2)
      isAdminFromHsoSo: !!window._admLoggedIn
    };
  }

  // Trích dữ liệu thô từ DSGV + DS HocSinh + CLASSES thành object có cấu trúc cho AI
  function _buildHssDataPayload(){
    try {
      // ===== CBGVNV =====
      var teachers = (window.TEACHERS || []).map(function(t){
        // Format DSGV: [TT, Họ tên, Ngày sinh, Chức vụ, Trình độ, SĐT, Email, Link]
        return {
          name: t[1] || '',
          dob: t[2] || '',
          role: t[3] || '',
          degree: t[4] || '',
          phone: t[5] || '',
          email: t[6] || ''
        };
      }).filter(function(t){ return t.name; });

      var teacherStats = { total: teachers.length, byRole: {}, byDegree: {}, byAge: {} };
      var currentYear = new Date().getFullYear();
      teachers.forEach(function(t){
        // By role
        var role = t.role || 'Khác';
        teacherStats.byRole[role] = (teacherStats.byRole[role] || 0) + 1;
        // By degree
        var deg = t.degree || 'Khác';
        teacherStats.byDegree[deg] = (teacherStats.byDegree[deg] || 0) + 1;
        // By age
        var dobMatch = (t.dob || '').match(/(\d{4})/);
        if(dobMatch){
          var birth = parseInt(dobMatch[1]);
          var age = currentYear - birth;
          var bucket = age < 30 ? 'under30' : age < 40 ? '30-39' : age < 50 ? '40-49' : '50plus';
          teacherStats.byAge[bucket] = (teacherStats.byAge[bucket] || 0) + 1;
        }
      });

      // ===== TRẺ + LỚP =====
      var classes = (window.CLASSES || []).map(function(c){
        var students = c.students || [];
        var male = 0, female = 0, ethnic = {};
        students.forEach(function(s){
          // DS HocSinh format — giới tính thường ở col 6 (index 5), dân tộc col 7 (index 6)
          var gender = (s[5] || s.gender || '').toString().toLowerCase();
          if(gender.indexOf('nữ') >= 0 || gender === 'nu' || gender === 'f') female++;
          else if(gender.indexOf('nam') >= 0 || gender === 'm') male++;
          var dt = s[6] || s.ethnic || 'Kinh';
          if(dt) ethnic[dt] = (ethnic[dt] || 0) + 1;
        });
        return {
          name: c.name || '',
          ageGroup: c.ageGroup || '',
          total: students.length,
          male: c.male || male,
          female: c.female || female,
          ethnic: ethnic
        };
      });

      var studentStats = { total: 0, byAge: { nha_tre:0, mg3:0, mg4:0, mg5:0 }, male:0, female:0, ethnic: {} };
      classes.forEach(function(c){
        studentStats.total += c.total;
        if(studentStats.byAge[c.ageGroup] !== undefined) studentStats.byAge[c.ageGroup] += c.total;
        studentStats.male += c.male || 0;
        studentStats.female += c.female || 0;
        Object.keys(c.ethnic || {}).forEach(function(dt){
          studentStats.ethnic[dt] = (studentStats.ethnic[dt] || 0) + c.ethnic[dt];
        });
      });

      return {
        teachers: teachers,
        teacherStats: teacherStats,
        classes: classes,
        studentStats: studentStats
      };
    } catch(e) {
      console.warn('[_buildHssDataPayload] error:', e);
      return null;
    }
  }

  window.showKdcl = function(ev){
    if(ev && ev.preventDefault) ev.preventDefault();
    document.body.classList.add('kdcl-active');
    window.scrollTo(0, 0);
    // Build payload SYNC — tránh await crypto (có thể hang trên file://)
    try{
      var payload = _buildBridgePayload();
      window.__HSS_MINHCHUNG__ = payload.hssMinhChung;
      window.__TDG_PENDING_BRIDGE__ = payload;
    }catch(e){ console.warn('[bridge] build payload fail:', e); }
    // Load libs async (không block return)
    (async function(){
      try{
        await loadKdclLibs();
        await new Promise(function(r){ requestAnimationFrame(function(){ setTimeout(r, 120); }); });
        if(window.__TDG_PENDING_BRIDGE__){
          window.dispatchEvent(new CustomEvent('tdg:applyBridge', { detail: window.__TDG_PENDING_BRIDGE__ }));
        }
      }catch(e){
        console.error('[loadKdclLibs]', e);
        _setKdclBootText('⚠ Lỗi đồng bộ dữ liệu: ' + e.message + ' — Kiểm tra kết nối mạng và F5');
      }
    })();
    return false;
  };

  window.showHoso = function(){
    document.body.classList.remove('kdcl-active');
    window.scrollTo(0, 0);
  };

  document.addEventListener('DOMContentLoaded', function(){
    const kdclLinks = document.querySelectorAll('a[href*="TDG_MamNon"], a[href*="app.html"]');
    kdclLinks.forEach(function(a){
      a.setAttribute('target', '_self');
      const oldOnClick = a.getAttribute('onclick') || '';
      a.setAttribute('onclick', 'try{' + oldOnClick + '}catch(e){} return showKdcl(event);');
      a.setAttribute('href', '#');
    });
  });
})();
