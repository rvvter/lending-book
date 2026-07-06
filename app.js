/* ================================================================
   借贷记账 App — 核心逻辑
   ================================================================ */

// ==================== IndexedDB 数据层 ====================

const DB_NAME = 'lending-book';
const DB_VERSION = 1;
const STORE_NAME = 'records';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbAdd(record) {
  return openDB().then(db => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function dbDelete(id) {
  return openDB().then(db => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function dbGetAll() {
  return openDB().then(db => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbGetByName(name) {
  return openDB().then(db => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('name');
    const req = index.getAll(name);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbGetDistinctNames() {
  return dbGetAll().then(records => {
    return [...new Set(records.map(r => r.name))].sort();
  });
}

// ==================== 工具函数 ====================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatMoney(n) {
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = d.toDateString();
  const todayOnly = now.toDateString();
  const yesterdayOnly = yesterday.toDateString();

  if (dateOnly === todayOnly) return '今天';
  if (dateOnly === yesterdayOnly) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function getWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `周${days[d.getDay()]}`;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 2000);
}

// ==================== 数据计算 ====================

function calcSummary(records) {
  let totalLend = 0;
  let totalRepay = 0;
  records.forEach(r => {
    if (r.type === 'lend') totalLend += r.amount;
    else totalRepay += r.amount;
  });
  return { totalLend, totalRepay, totalOwing: totalLend - totalRepay };
}

function calcByPerson(records) {
  const map = {};
  records.forEach(r => {
    if (!map[r.name]) map[r.name] = { name: r.name, lend: 0, repay: 0, count: 0 };
    map[r.name].count++;
    if (r.type === 'lend') map[r.name].lend += r.amount;
    else map[r.name].repay += r.amount;
  });
  return Object.values(map).map(p => ({
    ...p,
    balance: p.lend - p.repay
  })).sort((a, b) => b.balance - a.balance);
}

function calcByMonth(records) {
  const map = {};
  records.forEach(r => {
    const month = r.date.slice(0, 7); // YYYY-MM
    if (!map[month]) map[month] = { month, lend: 0, repay: 0 };
    if (r.type === 'lend') map[month].lend += r.amount;
    else map[month].repay += r.amount;
  });
  return Object.values(map).sort((a, b) => b.month.localeCompare(a.month));
}

// ==================== 页面渲染 ====================

let currentFilter = 'all';
let currentTab = 'records';

function groupByDate(records) {
  const groups = {};
  records.forEach(r => {
    if (!groups[r.date]) groups[r.date] = [];
    groups[r.date].push(r);
  });
  // 按日期倒序
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function renderSummary(records) {
  const { totalLend, totalRepay, totalOwing } = calcSummary(records);
  document.getElementById('sum-lend').textContent = formatMoney(totalLend);
  document.getElementById('sum-repay').textContent = formatMoney(totalRepay);
  document.getElementById('sum-owing').textContent = formatMoney(totalOwing);
}

function renderRecords(records) {
  const container = document.getElementById('record-list');

  // 筛选
  let filtered = records;
  if (currentFilter !== 'all') {
    filtered = records.filter(r => r.type === currentFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📒</div>
        <p>${currentFilter === 'all' ? '还没有记录' : (currentFilter === 'lend' ? '没有借出记录' : '没有还款记录')}</p>
        <p class="empty-hint">${currentFilter === 'all' ? '点击底部按钮添加第一笔' : ''}</p>
      </div>`;
    return;
  }

  const groups = groupByDate(filtered);
  container.innerHTML = groups.map(([date, items]) => `
    <div class="date-group">
      <div class="date-label">${formatDate(date)} · ${getWeekLabel(date)}</div>
      ${items.sort((a, b) => b.createdAt - a.createdAt).map(r => `
        <div class="record-card" data-id="${r.id}" data-name="${r.name}">
          <div class="record-left">
            <div class="record-badge ${r.type === 'lend' ? 'badge-lend' : 'badge-repay'}">
              ${r.type === 'lend' ? '借出' : '还款'}
            </div>
            <div class="record-info">
              <div class="record-name">${escapeHtml(r.name)}</div>
              <div class="record-meta">
                ${r.note ? `<span class="record-note">${escapeHtml(r.note)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="record-amount ${r.type === 'lend' ? 'amount-lend' : 'amount-repay'}">
            ${r.type === 'lend' ? '-' : '+'} ${formatMoney(r.amount)}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  // 点击记录 → 显示操作选项
  container.querySelectorAll('.record-card').forEach(card => {
    card.addEventListener('click', () => showRecordActions(card.dataset.id, card.dataset.name));
  });
}

function renderContacts(records) {
  const container = document.getElementById('contact-list');
  const persons = calcByPerson(records);

  if (persons.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👤</div>
        <p>还没有联系人</p>
      </div>`;
    return;
  }

  container.innerHTML = persons.map((p, i) => {
    const colors = ['#4F46E5','#DD6B20','#38A169','#E53E3E','#319795','#6B46C1','#B7791F','#2B6CB0'];
    const color = colors[i % colors.length];
    const isCleared = p.balance <= 0;
    return `
      <div class="contact-card ${isCleared ? 'cleared' : 'owing'}" data-name="${escapeHtml(p.name)}">
        <div class="contact-left">
          <div class="contact-avatar" style="background:${color}">${p.name[0]}</div>
          <div>
            <div class="contact-name">${escapeHtml(p.name)}</div>
            <div class="contact-summary">${p.count}笔 · 借出${formatMoney(p.lend)} · 还款${formatMoney(p.repay)}</div>
          </div>
        </div>
        <div>
          <div class="contact-balance ${isCleared ? 'cleared' : 'owing'}">
            ${isCleared ? '已还清 ✓' : '欠 ' + formatMoney(p.balance)}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 点击联系人 → 查看详情
  container.querySelectorAll('.contact-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.name;
      showPersonDetail(records, name);
    });
  });
}

function renderStats(records) {
  const container = document.getElementById('monthly-stats');
  const monthly = calcByMonth(records);

  if (monthly.length === 0) {
    container.innerHTML = '<p style="color:#A0AEC0;text-align:center;padding:20px;">暂无数据</p>';
    return;
  }

  const monthNames = {
    '01':'1月','02':'2月','03':'3月','04':'4月','05':'5月','06':'6月',
    '07':'7月','08':'8月','09':'9月','10':'10月','11':'11月','12':'12月'
  };

  container.innerHTML = monthly.map(m => {
    const maxAmount = Math.max(m.lend, m.repay, 1);
    return `
      <div class="stat-row">
        <span class="stat-name">${m.month.slice(0,4)}年${monthNames[m.month.slice(5,7)]}</span>
        <div style="flex:1;margin:0 12px;">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
            <span style="font-size:11px;color:#C53030;width:28px;">借出</span>
            <div class="stat-bar-wrap">
              <div class="stat-bar stat-bar-lend" style="width:${(m.lend / maxAmount) * 100}%"></div>
            </div>
            <span style="font-size:11px;color:#C53030;width:56px;text-align:right;">${formatMoney(m.lend)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:11px;color:#38A169;width:28px;">还款</span>
            <div class="stat-bar-wrap">
              <div class="stat-bar stat-bar-repay" style="width:${(m.repay / maxAmount) * 100}%"></div>
            </div>
            <span style="font-size:11px;color:#38A169;width:56px;text-align:right;">${formatMoney(m.repay)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== 核心刷新 ====================

async function refreshAll() {
  const records = await dbGetAll();
  renderSummary(records);
  if (currentTab === 'records') renderRecords(records);
  if (currentTab === 'contacts') renderContacts(records);
  if (currentTab === 'stats') renderStats(records);
  await updateNameSuggestions();
}

async function updateNameSuggestions() {
  const names = await dbGetDistinctNames();
  const datalist = document.getElementById('name-suggestions');
  datalist.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">`).join('');
}

// ==================== 弹窗控制 ====================

let modalMode = 'lend'; // 'lend' | 'repay'

function openModal(mode) {
  modalMode = mode;
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const submitBtn = document.getElementById('btn-submit');

  if (mode === 'lend') {
    title.textContent = '🔴 记录借出';
    submitBtn.textContent = '确认借出';
    submitBtn.className = 'btn btn-submit lend';
  } else {
    title.textContent = '🟢 记录还款';
    submitBtn.textContent = '确认还款';
    submitBtn.className = 'btn btn-submit repay';
  }

  document.getElementById('input-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('form-add').reset();
  document.getElementById('input-date').value = new Date().toISOString().slice(0, 10);
  overlay.classList.remove('hidden');
  setTimeout(() => document.getElementById('input-name').focus(), 300);
  updateNameSuggestions();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ==================== 记录详情 / 操作 ====================

function showRecordActions(id, name) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet" style="text-align:center;">
      <div class="modal-handle"></div>
      <h3 style="margin-bottom:20px;">${escapeHtml(name)}</h3>
      <button class="btn" style="width:100%;margin-bottom:8px;background:#4F46E5;color:#fff;" id="act-iou">📄 生成借条</button>
      <button class="btn" style="width:100%;margin-bottom:8px;background:#FFF5F5;color:#C53030;" id="act-delete">🗑 删除记录</button>
      <button class="btn btn-cancel" style="width:100%;" id="act-close">取消</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#act-close').onclick = () => overlay.remove();
  overlay.querySelector('#act-iou').onclick = () => {
    overlay.remove();
    showIOU(id);
  };
  overlay.querySelector('#act-delete').onclick = async () => {
    if (confirm('确定删除这条记录吗？此操作不可恢复。')) {
      await dbDelete(id);
      overlay.remove();
      await refreshAll();
      showToast('已删除');
    }
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function showPersonDetail(records, name) {
  const personRecords = records.filter(r => r.name === name).sort((a, b) => b.createdAt - a.createdAt);
  const { totalLend, totalRepay, totalOwing } = calcSummary(personRecords);
  const isCleared = totalOwing <= 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h3 style="text-align:center;margin-bottom:4px;">${escapeHtml(name)}</h3>
      <div style="display:flex;justify-content:center;gap:24px;margin-bottom:16px;font-size:13px;color:#718096;">
        <span>借出 <b style="color:#C53030">${formatMoney(totalLend)}</b></span>
        <span>还款 <b style="color:#38A169">${formatMoney(totalRepay)}</b></span>
        <span>${isCleared ? '✅ 已还清' : '欠 <b style="color:#C53030">' + formatMoney(totalOwing) + '</b>'}</span>
      </div>
      <div style="max-height:50vh;overflow-y:auto;">
        ${personRecords.map(r => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:12px;padding:2px 8px;border-radius:10px;font-weight:600;${r.type === 'lend' ? 'background:#FED7D7;color:#C53030' : 'background:#C6F6D5;color:#38A169'}">${r.type === 'lend' ? '借出' : '还款'}</span>
              <span style="font-size:13px;color:#718096;">${r.date}${r.note ? ' · ' + r.note : ''}</span>
            </div>
            <span style="font-weight:700;${r.type === 'lend' ? 'color:#C53030' : 'color:#38A169'}">${r.type === 'lend' ? '-' : '+'}${formatMoney(r.amount)}</span>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-cancel" style="width:100%;margin-top:16px;" id="detail-close">关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#detail-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ==================== 借条生成 ====================

async function showIOU(id) {
  const records = await dbGetAll();
  const record = records.find(r => r.id === id);
  if (!record || record.type !== 'lend') {
    showToast('只能为借出记录生成借条');
    return;
  }

  const overlay = document.getElementById('iou-overlay');
  overlay.classList.remove('hidden');
  overlay._iouRecord = record;

  // 等待 DOM 渲染后绘制
  await new Promise(r => setTimeout(r, 100));
  drawIOU(record);

  // 预绑定下载
  document.getElementById('iou-download').onclick = () => downloadIOU(record);
  document.getElementById('iou-close').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
}

function drawIOU(record) {
  const canvas = document.getElementById('iou-canvas');
  const ctx = canvas.getContext('2d');

  const width = 340;
  const height = 440;
  canvas.width = width * 2; // Retina
  canvas.height = height * 2;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(2, 2);

  // 背景
  ctx.fillStyle = '#FFFEF7';
  ctx.fillRect(0, 0, width, height);

  // 边框
  ctx.strokeStyle = '#D4A574';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // 内边框
  ctx.strokeStyle = '#E8D5B7';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // 标题
  ctx.fillStyle = '#8B4513';
  ctx.font = 'bold 22px "KaiTi", "STKaiti", serif';
  ctx.textAlign = 'center';
  ctx.fillText('借  条', width / 2, 60);

  // 分割线
  ctx.strokeStyle = '#D4A574';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(40, 70);
  ctx.lineTo(width - 40, 70);
  ctx.stroke();

  // 正文
  ctx.fillStyle = '#333';
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  const leftX = 40;
  let y = 100;
  const lineH = 28;

  const amountCN = numberToChinese(record.amount);

  const lines = [
    `兹借到  ${record.name}  人民币（大写）：`,
    `${amountCN}`,
    `（小写：¥ ${record.amount.toFixed(2)}）`,
    ``,
    `借款日期：${record.date}`,
    record.note ? `借款事由：${record.note}` : '',
    ``,
    `此据。`,
  ];

  lines.forEach(line => {
    if (line) {
      ctx.fillText(line, leftX, y);
    }
    y += lineH;
  });

  // 底部签名区
  y = height - 90;
  ctx.fillText('借款人签名：', leftX, y);
  y += lineH;
  ctx.fillText('日期：', leftX, y);

  // 右下角印章（简易红圈）
  const sealX = width - 70;
  const sealY = height - 80;
  ctx.save();
  ctx.strokeStyle = '#CC0000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sealX, sealY, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#CC0000';
  ctx.font = 'bold 9px "KaiTi", "STKaiti", serif';
  ctx.textAlign = 'center';
  ctx.fillText('借条', sealX, sealY + 4);
  ctx.restore();
}

function numberToChinese(n) {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const bigUnits = ['', '万', '亿'];

  if (n === 0) return '零元整';

  const yuan = Math.floor(n);
  const jiao = Math.round((n - yuan) * 100);

  function convertInt(num) {
    if (num === 0) return '零';
    let str = '';
    let unitIndex = 0;
    while (num > 0) {
      const part = num % 10000;
      if (part > 0) {
        let partStr = '';
        let temp = part;
        let leadingZero = false;
        for (let i = 0; temp > 0; i++) {
          const d = temp % 10;
          if (d !== 0) {
            partStr = (leadingZero ? '零' : '') + digits[d] + units[i] + partStr;
            leadingZero = false;
          } else {
            leadingZero = true;
          }
          temp = Math.floor(temp / 10);
        }
        str = partStr + bigUnits[unitIndex] + str;
      }
      num = Math.floor(num / 10000);
      unitIndex++;
    }
    // 去除多余的零
    str = str.replace(/零+/g, '零').replace(/零$/, '');
    return str || '零';
  }

  let result = convertInt(yuan) + '元';
  if (jiao > 0) {
    const j = Math.floor(jiao / 10);
    const f = jiao % 10;
    if (j > 0) result += digits[j] + '角';
    if (f > 0) result += digits[f] + '分';
  } else {
    result += '整';
  }
  return result;
}

function downloadIOU(record) {
  const canvas = document.getElementById('iou-canvas');
  const link = document.createElement('a');
  link.download = `借条_${record.name}_${record.date}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('借条已保存');
}

// ==================== CSV 导出 ====================

function exportCSV(records) {
  if (records.length === 0) {
    showToast('没有数据可导出');
    return;
  }

  // UTF-8 BOM 使 Excel 正确识别中文
  const BOM = '﻿';
  const header = '日期,类型,姓名,金额,备注\n';
  const rows = records
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(r => `${r.date},${r.type === 'lend' ? '借出' : '还款'},"${r.name}",${r.amount},"${r.note || ''}"`)
    .join('\n');

  const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `借贷记录_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('导出成功');
}

// ==================== 事件绑定 ====================

function init() {
  // Tab 切换
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;

      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + currentTab).classList.add('active');

      // 筛选栏仅在流水页显示
      document.getElementById('filter-bar').style.display = currentTab === 'records' ? 'flex' : 'none';

      refreshAll();
    });
  });

  // 筛选
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      refreshAll();
    });
  });

  // 借出按钮
  document.getElementById('btn-lend').addEventListener('click', () => openModal('lend'));

  // 还款按钮
  document.getElementById('btn-repay').addEventListener('click', () => openModal('repay'));

  // 更多菜单
  document.getElementById('btn-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('menu-popup').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('menu-popup').classList.add('hidden');
  });

  // 导出菜单
  document.getElementById('menu-export').addEventListener('click', async () => {
    document.getElementById('menu-popup').classList.add('hidden');
    const records = await dbGetAll();
    exportCSV(records);
  });

  // 表单提交
  document.getElementById('form-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('input-name').value.trim();
    const amount = parseFloat(document.getElementById('input-amount').value);
    const date = document.getElementById('input-date').value;
    const note = document.getElementById('input-note').value.trim();

    if (!name) { showToast('请输入姓名'); return; }
    if (!amount || amount <= 0) { showToast('请输入有效金额'); return; }
    if (!date) { showToast('请选择日期'); return; }

    const record = {
      id: generateId(),
      name,
      type: modalMode,
      amount,
      date,
      note,
      createdAt: Date.now()
    };

    await dbAdd(record);
    closeModal();
    await refreshAll();
    showToast(modalMode === 'lend' ? `借出 ${formatMoney(amount)} 给 ${name}` : `${name} 还款 ${formatMoney(amount)}`);
  });

  // 关闭弹窗
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // 借条弹窗关闭
  document.getElementById('iou-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // 初始加载
  refreshAll();
}

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
