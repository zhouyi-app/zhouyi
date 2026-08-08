/* =====================================================
 * 《周易》智慧宝典 — 主逻辑
 * 起卦引擎（铜钱/蓍草/梅花/随机）+ 解卦引擎 + 六爻装卦 + UI
 * ===================================================== */

(function () {
  "use strict";

  /* ================= 工具函数 ================= */

  function $(sel) { return document.querySelector(sel); }
  function $all(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }

  /** HTML 转义,防止用户输入被当作标签解析 */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /** 六爻线数组（自下而上）→ 卦画 HTML。movingIdx: 动爻位集合(0-5) */
  function linesHtml(lines, opts) {
    opts = opts || {};
    const size = opts.size || "";
    const showMoving = opts.showMoving !== false;
    const moving = opts.moving || [];
    let html = `<div class="hex-symbol ${size}">`;
    for (let i = 5; i >= 0; i--) {
      const yang = lines[i] === "1";
      let cls = yang ? "line" : "line yin";
      if (showMoving && moving.indexOf(i) >= 0) cls += " moving";
      html += `<div class="${cls}"></div>`;
    }
    html += `</div>`;
    return html;
  }

  /** 大号卦画（起卦结果用），爻从下往上逐条显现动画 */
  function bigHexHtml(lines, moving) {
    let html = `<div class="big-hex">`;
    for (let i = 5; i >= 0; i--) {
      const yang = lines[i] === "1";
      let cls = yang ? "line" : "line yin";
      if (moving && moving.indexOf(i) >= 0) cls += " moving";
      cls += " yao-pop";
      // 初爻先出、上爻最后出（i 越大 delay 越久）
      html += `<div class="${cls}" style="animation-delay:${(i * 0.12).toFixed(2)}s"></div>`;
    }
    return html + `</div>`;
  }

  /** 由六爻线 + 动爻位生成完整卦象 */
  function buildCast(linesStr, movingPositions) {
    const t = linesToTrigrams(linesStr);
    const hex = getHexByTrigrams(t.upper, t.lower);
    return {
      lines: linesStr,
      moving: movingPositions || [],
      hex: hex,
      upper: t.upper,
      lower: t.lower
    };
  }

  /** 求之卦（变卦） */
  function changeHex(lines, moving) {
    let arr = lines.split("");
    moving.forEach(i => { arr[i] = arr[i] === "1" ? "0" : "1"; });
    const newLines = arr.join("");
    const t = linesToTrigrams(newLines);
    const hex = getHexByTrigrams(t.upper, t.lower);
    return { lines: newLines, hex: hex, upper: t.upper, lower: t.lower };
  }

  /** 互卦 */
  function huHex(lines) {
    const inner = lines.slice(1, 4);   // 2,3,4爻 → 互卦之下卦
    const outer = lines.slice(2, 5);   // 3,4,5爻 → 互卦之上卦
    const t = linesToTrigrams(inner + outer);
    const hex = getHexByTrigrams(t.upper, t.lower);
    // lines 约定为"下卦+上卦"（自下而上），故完整线为 inner + outer
    return { lines: inner + outer, hex: hex, upper: t.upper, lower: t.lower };
  }

  /** 错卦（对卦） */
  function cuoHex(lines) {
    const newLines = lines.split("").map(c => c === "1" ? "0" : "1").join("");
    const t = linesToTrigrams(newLines);
    const hex = getHexByTrigrams(t.upper, t.lower);
    return { lines: newLines, hex: hex, upper: t.upper, lower: t.lower };
  }

  /** 综卦（覆卦）：上下颠倒 */
  function zongHex(lines) {
    const newLines = lines.split("").reverse().join("");
    const t = linesToTrigrams(newLines);
    const hex = getHexByTrigrams(t.upper, t.lower);
    return { lines: newLines, hex: hex, upper: t.upper, lower: t.lower };
  }

  /** 六爻装卦：干支、五行、六亲、六神、世应 */
  function zhuangGua(hex, shi, ying, dayGan) {
    const info = getPalaceInfo(hex.id);
    const palace = info.palace;
    const me = palace.element;
    const rows = [];
    const lines = buildHexLines(hex.upper, hex.lower);
    for (let i = 0; i < 6; i++) {
      const trigram = i < 3 ? hex.lower : hex.upper;
      const ganZhi = i < 3 ? NAJIA[trigram].inner[i] : NAJIA[trigram].outer[i - 3];
      const zhi = ganZhi.slice(1);
      const zhiElement = ELEMENT_ZHI[zhi];
      const liuqin = getLiuqin(me, zhiElement);
      rows.push({
        pos: i + 1,
        // 爻名规范：初爻称"初九/初六"，上爻称"上九/上六"，中间称"九二/六二"等
        yaoName: i === 0 ? (lines[i] === "1" ? "初九" : "初六") : (i === 5 ? (lines[i] === "1" ? "上九" : "上六") : (lines[i] === "1" ? "九" : "六") + ["二", "三", "四", "五"][i - 1]),
        ganZhi: ganZhi,
        zhiElement: zhiElement,
        liuqin: liuqin,
        shi: shi === i + 1,
        ying: ying === i + 1
      });
    }
    // 六神按起卦日天干
    const key = getLiushanKey(dayGan.slice(0, 1));
    const liushan = LIUSHEN[key];
    return { palace: palace.name, palaceElement: me, dayGanZhi: dayGan, rows: rows, liushan: liushan };
  }

  /** 体用关系（动爻在上卦则上为用，否则下为用） */
  function tiYong(upper, lower, movingInUpper) {
    const ti = movingInUpper ? lower : upper;
    const yong = movingInUpper ? upper : lower;
    const tiEl = TRIGRAMS[ti].element, yongEl = TRIGRAMS[yong].element;
    let relation, verdict;
    if (tiEl === yongEl) { relation = "比和"; verdict = "吉"; }
    else if (SHENG[yongEl] === tiEl) { relation = "用生体"; verdict = "吉"; }
    else if (SHENG[tiEl] === yongEl) { relation = "体生用"; verdict = "泄气耗神"; }
    else if (KE[tiEl] === yongEl) { relation = "体克用"; verdict = "小吉，费力"; }
    else { relation = "用克体"; verdict = "凶，多阻"; }
    return { ti: ti, yong: yong, tiEl: tiEl, yongEl: yongEl, relation: relation, verdict: verdict };
  }

  /* ================= 起卦方法 ================= */

  /** 铜钱法：掷三枚，返回 {背数} */
  function throwCoins() {
    const backs = [Math.random() < 0.5 ? 1 : 0, Math.random() < 0.5 ? 1 : 0, Math.random() < 0.5 ? 1 : 0].reduce((a, b) => a + b, 0);
    if (backs === 3) return { yang: true, moving: true, label: "老阳", mark: "○", desc: "三背" };
    if (backs === 2) return { yang: true, moving: false, label: "少阳", mark: "—", desc: "二背一字" };
    if (backs === 1) return { yang: false, moving: false, label: "少阴", mark: "--", desc: "一背二字" };
    return { yang: false, moving: true, label: "老阴", mark: "×", desc: "三字" };
  }

  /** 蓍草法：一变 */
  function yarrowChange(stalks) {
    const left = 1 + Math.floor(Math.random() * (stalks - 2)); // 分二
    const right = stalks - left;
    const guaYi = 1;                                          // 挂一
    let r1 = left % 4; if (r1 === 0) r1 = 4;                  // 揲四
    let r2 = (right - guaYi) % 4; if (r2 === 0) r2 = 4;       // 归奇
    return r1 + r2 + guaYi;
  }

  /** 蓍草法：三变定一爻 */
  function yarrowYao() {
    let stalks = 49;
    const changes = [];
    for (let c = 0; c < 3; c++) {
      const removed = yarrowChange(stalks);
      stalks -= removed;
      changes.push({ before: stalks + removed, removed: removed, after: stalks });
    }
    let yang, moving, label;
    if (stalks === 36) { yang = true; moving = true; label = "老阳（九）"; }
    else if (stalks === 32) { yang = false; moving = false; label = "少阴（八）"; }
    else if (stalks === 28) { yang = true; moving = false; label = "少阳（七）"; }
    else { yang = false; moving = true; label = "老阴（六）"; }
    return { yang: yang, moving: moving, label: label, changes: changes, remaining: stalks };
  }

  const XT_NUM = { 1: "乾", 2: "兑", 3: "离", 4: "震", 5: "巽", 6: "坎", 7: "艮", 8: "坤" };
  function numToTrigram(n) {
    // 负数取模在 JS 中会得负值,先归正再映射(负数按绝对值取余,避免 undefined)
    let v = ((Math.abs(n) % 8) + 8) % 8;
    if (v === 0) v = 8;
    return XT_NUM[v];
  }

  /** 梅花易数：由上下卦与动爻构造六爻线（返回原始本卦线，动爻统一由 changeHex 处理） */
  function plumLines(upperName, lowerName, movingPos) {
    return TRIGRAMS[lowerName].lines + TRIGRAMS[upperName].lines;
  }

  /* ================= 状态 ================= */

  const state = {
    method: "coin",
    coinThrows: [],      // 铜钱已掷结果
    coinLogs: [],        // 铜钱掷出过程日志
    yarrowYaos: [],      // 蓍草已完成之爻
    yarrowLogs: [],
    records: [],
    recFilter: "all",
    studyHexId: 1
  };

  const STORAGE_KEY = "zhouyi_records_v1";

  function loadRecords() {
    try { state.records = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { state.records = []; }
    // 清洗脏数据：过滤 null / 非对象元素，避免启动崩溃
    if (!Array.isArray(state.records)) state.records = [];
    state.records = state.records.filter(r => r && typeof r === "object");
    // 旧记录补上唯一 id，便于云同步去重
    let patched = false;
    state.records.forEach(r => { if (!r.rid) { r.rid = ZhouyiSync.genRid(); patched = true; } });
    if (patched) saveRecords();
  }
  function saveRecords() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records)); } catch (e) { /* 隐私模式等异常忽略 */ }
  }

  /* ================= 导航 ================= */

  function switchView(view) {
    $all(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    $all(".view").forEach(v => v.classList.remove("active"));
    $("#view-" + view).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ================= 卦象总览 ================= */

  function renderOverviewGrid(filter) {
    const grid = $("#hexGrid");
    grid.innerHTML = "";
    let list = HEXAGRAMS.slice();
    const kw = ($("#hexSearch").value || "").trim();
    if (kw) {
      list = list.filter(h =>
        h.name.includes(kw) || h.title.includes(kw) ||
        h.guaci.includes(kw) || h.zong.includes(kw) ||
        h.daxiang.includes(kw) || h.tuanyue.includes(kw) ||
        (h.yong && h.yong.includes(kw)) || (h.yong_bai && h.yong_bai.includes(kw)) ||
        h.shi.includes(kw) || h.ganqing.includes(kw) || h.juece.includes(kw) ||
        h.yao.some(y => y.text.includes(kw) || y.xiang.includes(kw) || y.bai.includes(kw))
      );
    }
    list.forEach(h => {
      const lines = buildHexLines(h.upper, h.lower);
      const card = document.createElement("div");
      card.className = "hex-card";
      card.innerHTML = `
        ${linesHtml(lines)}
        <div class="hex-name">${h.name}</div>
        <div class="hex-title">${h.title}</div>
        <div class="hex-id">第 ${h.id} 卦</div>`;
      card.addEventListener("click", () => openHexModal(h.id));
      grid.appendChild(card);
    });
    if (!list.length) grid.innerHTML = `<p style="text-align:center;color:#8a6d1f;grid-column:1/-1;padding:40px;">未找到匹配的卦象，换个关键词试试。</p>`;
  }

  function renderPalaceList() {
    const box = $("#palaceList");
    box.innerHTML = "";
    PALACES.forEach(p => {
      const card = document.createElement("div");
      card.className = "palace-card";
      let ul = "";
      p.hexes.forEach((id, idx) => {
        const h = getHexById(id);
        const lines = buildHexLines(h.upper, h.lower);
        const tags = ["本宫", "一世", "二世", "三世", "四世", "五世", "游魂", "归魂"];
        ul += `<li data-id="${id}">
          <span class="mini-sym">${linesHtml(lines, { size: "mini" })}</span>
          <span class="p-name">${h.name}（${h.title}）</span>
          <span class="p-tag">${tags[idx]}</span></li>`;
      });
      card.innerHTML = `<h3>${p.name}（${p.element}）</h3><ul>${ul}</ul>`;
      box.appendChild(card);
      $all("li[data-id]", card).forEach(li => li.addEventListener("click", () => openHexModal(+li.dataset.id)));
    });
  }

  /* ================= 卦详情（弹窗 + 学习页共用） ================= */

  function hexDetailHtml(h) {
    const lines = buildHexLines(h.upper, h.lower);
    let html = `
      <div class="detail-head">
        <div class="d-symbol">${bigHexHtml(lines)}</div>
        <h3>${h.name}卦 · ${h.title}</h3>
        <div class="d-sub">上${h.upper}下${h.lower} · 第 ${h.id} 卦
          ${(h.yong ? ` · <span style="color:#a63d2f">${h.yong.replace("：", " ")}</span>` : "")}
        </div>
      </div>`;

    html += `<div class="detail-section">
      <h4>卦辞</h4><p>${h.guaci}</p>`;
    if (h.yong) html += `<p style="color:#5c5649;font-size:13.5px;margin-top:4px;">${h.yong}　${h.yong_bai}</p>`;
    html += `</div>`;

    html += `<div class="detail-section">
      <h4>彖曰</h4><p>${h.tuanyue}</p>
      <h4>象曰（大象）</h4><p>${h.daxiang}</p>
    </div>`;

    html += `<div class="detail-section"><h4>六爻</h4>`;
    const labels = ["初", "二", "三", "四", "五", "上"];
    h.yao.forEach((y, i) => {
      html += `<div class="yao-detail">
        <div class="yd-head">
          <span class="yd-line"><span class="line ${lines[i] === "1" ? "" : "yin"}"></span></span>
          ${y.name}
        </div>
        <div class="yd-body">
          <div class="yd-orig">${y.text}</div>
          <div>象曰：${y.xiang}</div>
          <div style="color:#8a6d1f">白话：${y.bai}</div>
        </div>
      </div>`;
    });
    html += `</div>`;

    html += `<div class="detail-section">
      <h4>白话总解</h4><div class="baihua">${h.zong}</div>
    </div>`;

    html += `<div class="detail-section">
      <h4>占断参考</h4>
      <div class="baihua">
        <p><b>事业：</b>${h.shi}</p>
        <p><b>感情：</b>${h.ganqing}</p>
        <p><b>决策：</b>${h.juece}</p>
      </div>
    </div>`;
    return html;
  }

  function openHexModal(id) {
    const h = getHexById(id);
    const prevId = id === 1 ? 64 : id - 1;
    const nextId = id === 64 ? 1 : id + 1;
    $("#modalBody").innerHTML = `
      <div class="modal-nav">
        <button class="m-nav" id="mPrev">‹ 上一卦</button>
        <span class="m-nav-label">第 ${id} 卦 / 共 64 卦</span>
        <button class="m-nav" id="mNext">下一卦 ›</button>
      </div>
      ${hexDetailHtml(h)}`;
    $("#mPrev").addEventListener("click", () => openHexModal(prevId));
    $("#mNext").addEventListener("click", () => openHexModal(nextId));
    $("#hexModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    const m = $("#hexModal .modal");
    if (m) m.scrollTop = 0;
  }
  function closeHexModal() {
    $("#hexModal").classList.add("hidden");
    document.body.style.overflow = "";
  }

  /* ================= 起卦动画特效 ================= */

  let animTimer = null;
  /** 在结果区播放起卦动画，播完回调 done */
  function playCastAnim(method, done) {
    const box = $("#castAnim");
    if (!box) { done && done(); return; }
    let inner = "", hint = "";
    if (method === "coin") {
      inner = `<div class="coin-tray"><span class="coin">錢</span><span class="coin">錢</span><span class="coin">錢</span></div>`;
      hint = "三枚铜钱翻转，心中默念所问之事…";
    } else if (method === "yarrow") {
      inner = `<div class="yarrow-anim"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>`;
      hint = "分二、挂一、揲四、归奇…";
    } else {
      inner = `<div class="taiji-spin"><span class="taiji"></span></div>`;
      hint = method === "plum" ? "以数推卦，静候片刻…" : "心念入卦，静候片刻…";
    }
    box.innerHTML = `<div class="cast-anim-inner">${inner}<p class="cast-hint">${hint}</p></div>`;
    box.classList.remove("hidden");
    clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      box.classList.add("hidden");
      box.innerHTML = "";
      done && done();
    }, 750);
  }

  /* ================= 起卦交互 ================= */

  function resetMethod(method) {
    state.method = method;
    state.coinThrows = [];
    state.coinLogs = [];
    state.yarrowYaos = [];
    state.yarrowLogs = [];
    $all(".method-card").forEach(m => m.classList.toggle("active", m.dataset.method === method));
    $all(".setup-block").forEach(b => b.classList.add("hidden"));
    $("#setup-" + method).classList.remove("hidden");
    if (method === "coin") updateCoinButton();
    if (method === "yarrow") updateYarrowButton();
  }

  function updateCoinButton() {
    const n = state.coinThrows.length;
    const btn = $("#btnThrows");
    if (n < 6) {
      btn.textContent = `掷铜钱（第 ${n + 1} 次 / 共 6 次）`;
      btn.disabled = false;
    } else {
      btn.textContent = "卦已起成，重新起卦";
      btn.disabled = true;
    }
    const log = $("#coinLog");
    if (log) {
      log.innerHTML = state.coinLogs.map(l => `<div>${l}</div>`).join("");
      log.scrollTop = log.scrollHeight;
    }
  }

  function updateYarrowButton() {
    const n = state.yarrowYaos.length;
    const btn = $("#btnYarrow");
    const log = $("#yarrowLog");
    if (n < 6) {
      btn.textContent = `分揲蓍草（第 ${n + 1} 爻）`;
      btn.disabled = false;
    } else {
      btn.textContent = "卦已起成，重新起卦";
      btn.disabled = true;
    }
    log.innerHTML = state.yarrowLogs.map(l => `<div>${l}</div>`).join("");
    log.scrollTop = log.scrollHeight;
  }

  function doCoinThrow() {
    if (state.coinThrows.length >= 6) return;
    $("#btnThrows").disabled = true;
    playCastAnim("coin", () => {
      // 动画期间用户可能切换了起卦方法，此时丢弃本次结果，避免计数错乱
      if (state.method !== "coin") return;
      const r = throwCoins();
      state.coinThrows.push(r);
      const n = state.coinThrows.length;
      const mark = r.moving ? (r.yang ? "○" : "×") : (r.yang ? "—" : "--");
      const gz = r.yang ? "阳" : "阴";
      state.coinLogs.push(`<b>第 ${n} 次（${["初", "二", "三", "四", "五", "上"][n - 1]}爻）</b>：${r.desc} ⇒ ${r.label}（${gz}爻 ${mark}）${r.moving ? " · 动爻" : ""}`);
      updateCoinButton();
      if (state.coinThrows.length === 6) {
        const lines = state.coinThrows.map(c => c.yang ? "1" : "0").join("");
        const moving = state.coinThrows.map((c, i) => c.moving ? i : -1).filter(i => i >= 0);
        renderResult({ lines: lines, moving: moving, method: "coin", methodName: "三枚铜钱法", question: readQuestion() });
      }
    });
  }

  function doYarrow() {
    if (state.yarrowYaos.length >= 6) return;
    $("#btnYarrow").disabled = true;
    playCastAnim("yarrow", () => {
      // 动画期间用户可能切换了起卦方法，此时丢弃本次结果，避免计数错乱
      if (state.method !== "yarrow") return;
      const y = yarrowYao();
      state.yarrowYaos.push(y);
      const idx = state.yarrowYaos.length;
      const c = y.changes.map((ch, i) => `第${i + 1}变去 ${ch.removed} 策，余 ${ch.after}`).join("；");
      state.yarrowLogs.push(`<b>第 ${idx} 爻（${["初", "二", "三", "四", "五", "上"][idx - 1]}）</b>：${c} ⇒ ${y.label}（余 ${y.remaining}）`);
      updateYarrowButton();
      if (state.yarrowYaos.length === 6) {
        const lines = state.yarrowYaos.map(y2 => y2.yang ? "1" : "0").join("");
        const moving = state.yarrowYaos.map((y2, i) => y2.moving ? i : -1).filter(i => i >= 0);
        renderResult({ lines: lines, moving: moving, method: "yarrow", methodName: "大衍蓍草法", question: readQuestion() });
      }
    });
  }

  function plumByTime(date) {
    const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate(), h = date.getHours();
    const yearZhi = yearZhiOrder(y);
    const hourZhi = Math.floor((h + 1) / 2) % 12 + 1; // 时支序数（23-1点=子=1）
    const upperNum = (yearZhi + mo + d) % 8;
    const lowerNum = (yearZhi + mo + d + hourZhi) % 8;
    const moving = (yearZhi + mo + d + hourZhi) % 6;
    return { upper: numToTrigram(upperNum), lower: numToTrigram(lowerNum), moving: moving === 0 ? 5 : moving - 1, desc: `年支${yearZhi} + ${mo}月 + ${d}日 → 上卦${numToTrigram(upperNum)}；加时支${hourZhi} → 下卦${numToTrigram(lowerNum)}；动爻第${moving === 0 ? 6 : moving}爻` };
  }

  function plumByNumbers(nums) {
    const [a, b, c] = nums;
    let upperNum, lowerNum, movingNum;
    if (c === undefined || c === null || c === "") {
      upperNum = a % 8;
      lowerNum = b % 8;
      movingNum = (a + b) % 6;
      return { upper: numToTrigram(upperNum), lower: numToTrigram(lowerNum), moving: movingNum === 0 ? 5 : movingNum - 1, desc: `${a} % 8 → 上卦${numToTrigram(upperNum)}；${b} % 8 → 下卦${numToTrigram(lowerNum)}；动爻第${movingNum === 0 ? 6 : movingNum}爻` };
    }
    upperNum = (a + b) % 8;
    lowerNum = c % 8;
    movingNum = (a + b + c) % 6;
    return { upper: numToTrigram(upperNum), lower: numToTrigram(lowerNum), moving: movingNum === 0 ? 5 : movingNum - 1, desc: `(${a}+${b}) % 8 → 上卦${numToTrigram(upperNum)}；${c} % 8 → 下卦${numToTrigram(lowerNum)}；动爻第${movingNum === 0 ? 6 : movingNum}爻` };
  }

  function doPlumTime() {
    const inputVal = $("#plumTime").value;
    const date = inputVal ? new Date(inputVal) : new Date();
    const r = plumByTime(date);
    buildFromTrigrams(r, "plum", "梅花易数 · 时间起卦", r.desc);
  }

  function doPlumNum() {
    const a = parseInt($("#num1").value, 10);
    const b = parseInt($("#num2").value, 10);
    const cVal = $("#num3").value;
    const c = cVal === "" ? undefined : parseInt(cVal, 10);
    if (isNaN(a) || isNaN(b)) {
      alert("请至少输入两个数字。");
      return;
    }
    if (a <= 0 || b <= 0 || (c !== undefined && c <= 0)) {
      alert("请输入正整数（大于 0 的自然数）。");
      return;
    }
    const r = plumByNumbers([a, b, c]);
    buildFromTrigrams(r, "plum", "梅花易数 · 报数起卦", r.desc);
  }

  function buildFromTrigrams(r, method, methodName, desc) {
    const hex = getHexByTrigrams(r.upper, r.lower);
    if (!hex) { alert("起卦数据有误，请重试。"); return; }
    const lines = plumLines(r.upper, r.lower, r.moving);
    $("#btnPlumTime").disabled = $("#btnPlumNum").disabled = true;
    playCastAnim("plum", () => {
      $("#btnPlumTime").disabled = $("#btnPlumNum").disabled = false;
      renderResult({ lines: lines, moving: [r.moving], method: method, methodName: methodName, extraDesc: desc, question: readQuestion() });
    });
  }

  function doRandom() {
    const btn = $("#btnRandom");
    btn.disabled = true;
    playCastAnim("random", () => {
      btn.disabled = false;
      const arr = [];
      const moving = [];
      for (let i = 0; i < 6; i++) {
        const yang = Math.random() < 0.5;
        const mv = Math.random() < 0.25; // 25% 变爻
        arr.push(yang ? "1" : "0");
        if (mv) moving.push(i);
      }
      renderResult({ lines: arr.join(""), moving: moving, method: "random", methodName: "心念起卦", question: readQuestion() });
    });
  }

  /* ================= 解卦 & 渲染结果 ================= */

  /** 读取起卦页所问之事 */
  function readQuestion() {
    const el = $("#questionInput");
    return (el && el.value || "").trim();
  }

  function renderResult(cast) {
    const box = $("#divineResult");
    const lines = cast.lines;
    const moving = cast.moving || [];
    const question = cast.question || "";
    const hex = getHexByTrigrams(linesToTrigrams(lines).upper, linesToTrigrams(lines).lower);
    if (!hex) { alert("卦象数据有误，无法解卦，请重新起卦。"); return; }
    const changed = changeHex(lines, moving);
    const hu = huHex(lines);
    const cuo = cuoHex(lines);
    const zong = zongHex(lines);
    const now = new Date();
    const dayGZ = dayGanzhi(now);
    const info = getPalaceInfo(hex.id);
    const zhuang = zhuangGua(hex, info.shi, info.ying, dayGZ);
    const movingInUpper = moving.some(m => m >= 3);
    const ty = tiYong(hex.upper, hex.lower, movingInUpper);
    const hasChange = moving.length > 0;

    // 朱熹七则选辞
    const rule = selectRule(hex, changed.hex, moving, lines);
    const record = {
      rid: ZhouyiSync.genRid(),
      time: now.toISOString(),
      methodName: cast.methodName,
      extraDesc: cast.extraDesc || "",
      question: question,
      lines: lines,
      moving: moving,
      hexId: hex.id,
      hexName: hex.name,
      hexTitle: hex.title,
      changeId: changed.hex ? changed.hex.id : null,
      changeName: changed.hex ? changed.hex.name : null,
      dayGZ: dayGZ
    };
    // 回放历史记录（save:false）时不重复入库，避免污染记录与统计
    if (cast.save !== false) {
      state.records.unshift(record);
      saveRecords();
      renderRecords();
      // 已登录则同步到云端
      if (ZhouyiSync.isLoggedIn()) {
        const indicator = $("#syncStatusIndicator");
        indicator.style.display = "inline-block";
        indicator.textContent = "同步中…";
        indicator.className = "sync-status-indicator syncing";
        ZhouyiSync.pushRecord(record).then(function() {
          // 云端返回后回填 cloudId 并落盘，避免重复推送/丢失关联
          saveRecords();
          indicator.textContent = "✓ 已同步";
          indicator.className = "sync-status-indicator success";
          setTimeout(() => { indicator.style.display = "none"; }, 2000);
        }).catch(function(err) {
          console.error('云同步失败:', err);
          indicator.textContent = "✗ 同步失败";
          indicator.className = "sync-status-indicator error";
          setTimeout(() => { indicator.style.display = "none"; }, 3000);
        });
      }
    }

    let html = "";
    html += `<div class="result-title">
      <h3>${hex.name}卦 · ${hex.title}</h3>
      <p>${cast.methodName} · ${now.toLocaleString("zh-CN")} · 起卦日：${dayGZ}日${cast.extraDesc ? "<br>[" + cast.extraDesc + "]" : ""}</p>
    </div>`;
    if (question) html += `<div class="asked-question">所问之事：<b>${escapeHtml(question)}</b></div>`;
    html += `<div class="result-actions"><button class="btn-ghost" id="btnCopyResult">复制卦文（分享 / 记录）</button></div>`;

    // ===== 白话导读（新手必看）=====
    const verdictText = {
      "比和": "内外和谐、同心同德，事情顺势而行，是个不错的兆头。",
      "用生体": "外部力量在帮衬你，有贵人相助，谋事容易成功。",
      "体生用": "你需要为这件事付出较多心力，记得量力而行、照顾好自己。",
      "体克用": "你能掌控局面，但过程要花些力气，主动一点更易成事。",
      "用克体": "眼下外界阻力不小，不宜硬闯，退一步蓄力更明智。"
    }[ty.relation] || "";
    const mvHint = moving.length === 0
      ? "这一卦六条爻都没有变动，说明事情相对平稳，按卦的本意来理解即可。"
      : moving.length === 1
        ? `这一卦有一个关键的变化（第${moving[0] + 1}爻），提示事情会在某个节点出现转机或转折，重点看下面「变爻详解」里这一爻的白话。`
        : `这一卦有 ${moving.length} 处变化，说明事情正处在比较明显的变动之中，要多加留意、随机应变。`;
    html += `<div class="plain-read">
      <div class="pr-title">白话导读 <span class="pr-tag">新手先看这里</span></div>
      <p class="pr-summary">你占到的是<strong>「${hex.name}卦」</strong>，卦名叫「${hex.title}」。${verdictText}</p>
      <div class="pr-block"><b>卦在说什么：</b>${hex.zong}</div>
      <div class="pr-block"><b>变化提示：</b>${mvHint}</div>
    </div>`;

    html += `<div class="hexagram-compare">
      <div class="compare-col">
        <div class="c-label">本卦（${hex.name}）</div>
        ${bigHexHtml(lines, moving)}
        <div class="c-name primary">${hex.name}</div>
        <div class="c-label">${hex.title}</div>
      </div>`;
    if (hasChange) {
      html += `<div class="compare-arrow">→</div>
      <div class="compare-col">
        <div class="c-label">之卦（${changed.hex.name}）</div>
        ${bigHexHtml(changed.lines)}
        <div class="c-name secondary">${changed.hex.name}</div>
        <div class="c-label">${changed.hex.title}</div>
      </div>`;
    }
    html += `</div>`;

    html += `<div class="compare-sub">
      <span class="chip-tag" data-open="${hu.hex.id}">互卦 <b>${hu.hex.name}（${hu.hex.title}）</b></span>
      <span class="chip-tag" data-open="${cuo.hex.id}">错卦 <b>${cuo.hex.name}（${cuo.hex.title}）</b></span>
      <span class="chip-tag" data-open="${zong.hex.id}">综卦 <b>${zong.hex.name}（${zong.hex.title}）</b></span>
      <span class="chip-tag">卦宫 <b>${zhuang.palace}</b></span>
      <span class="chip-tag">卦德 <b>${hex.upper}·${TRIGRAMS[hex.upper].virtue} / ${hex.lower}·${TRIGRAMS[hex.lower].virtue}</b></span>
    </div>`;

    html += `<div class="tip"><b>注</b> 上方的「互卦 / 错卦 / 综卦」是看卦的三种辅助角度，相当于从不同方向照镜子看这件事，新手点一点看看热闹即可，不影响下面白话结论。</div>`;

    html += `<div class="change-list">${moving.length ? "变爻：" + moving.map(m => `<b>第${m + 1}爻</b>`).join("、") : "<b>六爻皆静</b>"}</div>`;

    html += `<div class="reading">`;

    // 解卦规则
    html += `<h4>解卦依据（怎么读这一卦）</h4>`;
    html += `<div class="rule-banner"><strong>${rule.title}</strong> —— ${rule.desc}</div>`;
    html += `<div class="tip"><b>注</b> 占卜看什么，取决于这一卦有几条「变爻」（打圈或打叉的那几条）。规则就一条：<b>有变的看变化处，没变看整体</b>。下面是原文与白话，看不懂没关系，直接看白话行即可。</div>`;

    // 主辞
    html += `<h4>卦辞原文</h4><div class="guaci-text">${hex.guaci}</div>`;
    html += `<h4>卦辞白话</h4><div class="guaci-text" style="border-left-color:#b08d3e">${hex.zong}</div>`;

    // 变爻爻辞
    if (moving.length) {
      html += `<h4>变爻详解（本卦）</h4>`;
      html += `<table class="yao-table"><tr><th>爻</th><th>爻辞</th><th>象曰</th><th>白话</th></tr>`;
      hex.yao.forEach((y, i) => {
        const isMv = moving.indexOf(i) >= 0;
        html += `<tr class="${isMv ? "moving" : ""}">
          <td class="yao-label">${y.name}${isMv ? " ●" : ""}</td>
          <td>${y.text}</td><td>${y.xiang}</td><td>${y.bai}</td></tr>`;
      });
      html += `</table>`;
    }

    // 指定爻辞（rule.yaoIndexes）
    if (rule.refText) {
      html += `<h4>当用之辞</h4><div class="guaci-text" style="border-left-color:#a63d2f">${rule.refText}</div>`;
    }

    // 体用（无动爻时梅花不分体用，避免给出失真结论）
    html += `<h4>体用生克（你与事情的相处模式）</h4>`;
    if (moving.length === 0) {
      html += `<div class="tip"><b>注</b> 「体」= 你自己，「用」= 你要面对的事。本卦<b>六爻皆静，没有动爻，传统上不分体用</b>，直接按卦辞与整体卦意理解即可。</div>`;
    } else {
    html += `<div class="tip"><b>注</b> 「体」= 你自己，「用」= 你要面对的事。下面这组五行关系，就是古人用来判断“你和这件事合不合得来”的方法。</div>`;
    const triSym = t => TRIGRAMS[t].lines.split("").map(c => `<span class="line ${c === "1" ? "" : "yin"}"></span>`).join("");
    html += `<div class="tiyong-grid">
      <div class="tiyong-cell"><div class="ty-name">体卦（你）· ${ty.ti}（${ty.tiEl}）</div><span class="tg-sym" style="margin:6px auto;display:inline-flex;flex-direction:column;gap:2px">${triSym(ty.ti)}</span></div>
      <div class="tiyong-cell"><div class="ty-name">用卦（事）· ${ty.yong}（${ty.yongEl}）</div><span class="tg-sym" style="margin:6px auto;display:inline-flex;flex-direction:column;gap:2px">${triSym(ty.yong)}</span></div>
      <div class="tiyong-cell"><div class="ty-name">关系 · ${ty.relation}</div><p class="badge ${ty.verdict.indexOf("凶") >= 0 ? "bad" : (ty.verdict.indexOf("吉") >= 0 ? "good" : "mid")}">${ty.verdict}</p><small>${ty.ti}${ty.tiEl} ${ty.relation} ${ty.yong}${ty.yongEl}</small></div>
    </div>`;
    html += `<p class="change-list" style="text-align:left;font-size:12.5px;color:#5c5649">${ty.relation === "比和" ? "体用五行相同，同心协力之象，谋事顺遂。" : ty.relation === "用生体" ? "外方生助于我，有贵人扶持，谋事可成。" : ty.relation === "体生用" ? "我方耗泄于外，付出多而收效少，宜防损耗。" : ty.relation === "体克用" ? "我方能克制外方，事可成但须费力争取。" : "外方克制于我，谋事多阻，宜守不宜攻。"}</p>`;
    }

    // 六爻装卦
    html += `<h4>六爻装卦（纳甲筮法 · 进阶内容）</h4>`;
    html += `<div class="tip"><b>注</b> 这是一套专业的排盘表格（用来看更细的吉凶），属于进阶玩法。新手可以完全跳过，不影响上面白话结论。</div>`;
    html += `<div class="liuyao-box"><table class="liuyao-table">
      <tr><th>世应</th><th>爻位</th><th>六神</th><th>干支</th><th>五行</th><th>六亲</th></tr>`;
    const shiText = { 1: "初", 2: "二", 3: "三", 4: "四", 5: "五", 6: "上" };
    for (let i = 5; i >= 0; i--) {
      const r = zhuang.rows[i];
      const isMv = moving.indexOf(i) >= 0;
      let shiying = r.shi ? "世" : (r.ying ? "应" : "");
      html += `<tr class="${isMv ? "ly-moving" : ""}">
        <td>${shiying}</td><td>${shiText[i + 1]}</td><td>${zhuang.liushan[i]}</td>
        <td>${r.ganZhi}</td><td>${r.zhiElement}</td><td>${r.liuqin}</td></tr>`;
    }
    html += `</table>
      <p class="change-list" style="text-align:left;font-size:12.5px;color:#5c5649">卦宫：${zhuang.palace}（${zhuang.palaceElement}）　起卦日：${dayGZ}　装卦以${dayGZ.slice(0, 1)}日六神顺布。</p></div>`;

    // 之卦简解
    if (hasChange) {
      html += `<h4>之卦简解</h4><div class="guaci-text">${changed.hex.name} · ${changed.hex.guaci}<br><span style="color:#5c5649;font-size:13px">${changed.hex.zong}</span></div>`;
    }

    // 运势参考
    html += `<h4>占断参考（结合你问的事）</h4>`;
    html += `<div class="tip"><b>注</b> 这下面是针对「事业、感情、决策」三类问题的人话提示，对照你问的事看对应那一条就好。</div>`;
    html += `<div class="baihua">
      <p><b>事业（工作/学业）：</b>${hex.shi}</p>
      <p><b>感情（爱情/家庭/人际）：</b>${hex.ganqing}</p>
      <p><b>决策（该不该做/怎么做）：</b>${hex.juece}</p>
    </div>`;

    html += `<div class="disclaimer">小提醒：占卜不是“算命下结论”，它是帮你换一个角度思考问题的古老智慧。无论卦象如何，选择权始终在你手里。</div>`;

    html += `</div>`;

    box.innerHTML = html;
    box.querySelectorAll(".chip-tag[data-open]").forEach(t => {
      t.addEventListener("click", () => openHexModal(+t.dataset.open));
    });

    // 复制卦文
    const cpBtn = $("#btnCopyResult");
    if (cpBtn) {
      const tyLine = ty && ty.relation
        ? `体用：${ty.ti}（${ty.tiEl}）对 ${ty.yong}（${ty.yongEl}）——${ty.relation}`
        : "";
      const shareText = [
        `【${hex.name}卦 · ${hex.title}】`,
        `${cast.methodName} · ${now.toLocaleString("zh-CN")}（${dayGZ}日）`,
        question ? `所问之事：${question}` : "",
        "",
        `卦辞原文：${hex.guaci}`,
        `白话解读：${hex.zong}`,
        moving.length ? `变爻：第${moving.map(m => m + 1).join("、")}爻` : "六爻安静，无动爻",
        tyLine,
        `事业 / 学业：${hex.shi}`,
        `感情 / 人际：${hex.ganqing}`,
        `决策：${hex.juece}`,
        "",
        `—— 来自「周易智慧宝典」`
      ].filter(Boolean).join("\n");
      cpBtn.addEventListener("click", () => {
        copyText(shareText);
        const old = cpBtn.textContent;
        cpBtn.textContent = "✓ 已复制";
        setTimeout(() => { cpBtn.textContent = old; }, 1600);
      });
    }
  }

  /** 复制文本到剪贴板（带降级方案） */
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(() => legacyCopy(txt));
    } else {
      legacyCopy(txt);
    }
  }
  function legacyCopy(txt) {
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  /** 同步主题切换按钮文案 */
  function updateThemeBtn() {
    const b = $("#btnTheme");
    if (!b) return;
    b.textContent = document.body.classList.contains("dark") ? "日间模式" : "夜间模式";
  }

  /** 朱熹七则：依据变爻数量选择解卦辞 */
  function selectRule(hex, changeHex, moving, lines) {
    const n = moving.length;
    const yaoLabel = ["初", "二", "三", "四", "五", "上"];
    const isQian = hex.id === 1, isKun = hex.id === 2;
    if (n === 0) {
      return { title: "六爻不变 · 占本卦卦辞", desc: `以本卦【${hex.name}】卦辞断之：${hex.guaci}`, refText: `本卦卦辞：${hex.guaci}` };
    }
    if (n === 1) {
      const y = hex.yao[moving[0]];
      return { title: "一爻变 · 占本卦变爻爻辞", desc: `以本卦【${hex.name}】变爻【${y.name}】爻辞断之。`, refText: `${y.name}：${y.text}　（象曰：${y.xiang}）` };
    }
    if (n === 2) {
      const main = Math.max(moving[0], moving[1]);
      const y1 = hex.yao[moving[0]], y2 = hex.yao[moving[1]], ym = hex.yao[main];
      return { title: "两爻变 · 占本卦两变爻爻辞（以上爻为主）", desc: `以本卦两变爻爻辞断之，以上位之【${ym.name}】为主。`, refText: `${ym.name}：${ym.text}（主）　${y1.name}：${y1.text}　${y2.name}：${y2.text}` };
    }
    if (n === 3) {
      return { title: "三爻变 · 占本卦及之卦卦辞（本卦为贞，之卦为悔）", desc: `以本卦【${hex.name}】为贞（主事），之卦【${changeHex.name}】为悔（所趋）。`, refText: `本卦卦辞：${hex.guaci}<br>之卦卦辞：${changeHex.guaci}` };
    }
    if (n === 4) {
      const still = [0, 1, 2, 3, 4, 5].filter(i => moving.indexOf(i) < 0);
      const main = Math.min(still[0], still[1]);
      const y = changeHex.yao[main];
      return { title: "四爻变 · 占之卦两不变爻爻辞（以下爻为主）", desc: `以之卦【${changeHex.name}】两个不变爻爻辞断之，以下位之【${y.name}】为主。`, refText: `${y.name}：${y.text}（主）　${changeHex.yao[still[0] === main ? still[1] : still[0]].name}：${changeHex.yao[still[0] === main ? still[1] : still[0]].text}` };
    }
    if (n === 5) {
      const still = [0, 1, 2, 3, 4, 5].filter(i => moving.indexOf(i) < 0)[0];
      const y = changeHex.yao[still];
      return { title: "五爻变 · 占之卦不变爻爻辞", desc: `以之卦【${changeHex.name}】唯一不变爻【${y.name}】爻辞断之。`, refText: `${y.name}：${y.text}　（象曰：${y.xiang}）` };
    }
    // n === 6
    if (isQian) return { title: "六爻全变 · 乾卦用「用九」", desc: "乾卦六爻全变，用「用九」断之。", refText: `用九：见群龙无首，吉。` };
    if (isKun) return { title: "六爻全变 · 坤卦用「用六」", desc: "坤卦六爻全变，用「用六」断之。", refText: `用六：利永贞。` };
    return { title: "六爻全变 · 占之卦卦辞", desc: `其余六十二卦六爻全变，以之卦【${changeHex.name}】卦辞断之。`, refText: `之卦卦辞：${changeHex.guaci}` };
  }

  /* ================= 记录 ================= */

  /** 按起卦方法统计记录条数 */
  function recMethodCounts() {
    const map = {};
    state.records.forEach(r => {
      const m = r.methodName || "未知方法";
      map[m] = (map[m] || 0) + 1;
    });
    return map;
  }

  /** 重建筛选下拉选项（保持当前选中项） */
  function refreshRecFilter() {
    const sel = $("#recFilter");
    if (!sel) return;
    const counts = recMethodCounts();
    const names = Object.keys(counts).sort((a, b) => a.localeCompare(b, "zh"));
    const cur = sel.value;
    sel.innerHTML = `<option value="all">全部方法（${state.records.length}）</option>` +
      names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}（${counts[n]}）</option>`).join("");
    sel.value = names.indexOf(cur) >= 0 ? cur : "all";
    state.recFilter = sel.value;
  }

  function renderRecords() {
    const box = $("#recordsList");
    const stats = $("#recStats");
    const counts = recMethodCounts();
    const names = Object.keys(counts);
    if (stats) {
      stats.innerHTML = `<span class="rs-total">共 <b>${state.records.length}</b> 条记录</span>` +
        (names.length ? `<span class="rs-sep">｜</span>` + names.map(n =>
          `<span class="rs-item"><b>${counts[n]}</b> ${escapeHtml(n)}</span>`).join("") : "");
    }
    refreshRecFilter();
    const filter = state.recFilter;
    const list = filter === "all" ? state.records : state.records.filter(r => (r.methodName || "未知方法") === filter);
    if (!list.length) {
      box.innerHTML = `<div class="empty-records">${state.records.length ? "当前筛选条件下没有记录，换个方法再筛。可在「导入记录」中恢复备份。" : "暂无起卦记录。去「在线起卦」试试吧。"}</div>`;
      return;
    }
    box.innerHTML = "";
    list.forEach(r => {
      const idx = state.records.indexOf(r);
      const card = document.createElement("div");
      card.className = "record-card";
      const q = (r.question || "").trim();
      card.innerHTML = `
        <div class="rec-sym">${linesHtml(r.lines, { size: "mini" })}</div>
        <div class="rec-main">
          <b>${r.hexName}卦</b><span>${r.hexTitle}　${(r.moving || []).length ? "变爻" + r.moving.map(m => m + 1).join(",") : "六爻静"}　${r.changeName ? "→ 之卦" + r.changeName : ""}</span><br>
          <span style="font-size:12px;color:#8a6d1f">${escapeHtml(r.methodName)}</span>${q ? `<div class="rec-q">问：${escapeHtml(q.length > 26 ? q.slice(0, 26) + "…" : q)}</div>` : ""}
        </div>
        <div class="rec-time">${new Date(r.time).toLocaleString("zh-CN")}</div>
        <button class="rec-del" title="删除此记录">×</button>`;
      card.addEventListener("click", () => replayRecord(idx));
      const del = card.querySelector(".rec-del");
      del.addEventListener("click", e => {
        e.stopPropagation();
        if (confirm("确定删除这条起卦记录吗？")) {
          const rec = state.records[idx];
          state.records.splice(idx, 1);
          saveRecords();
          renderRecords();
          // 云同步：本地记墓碑，已登录则同时删云端
          ZhouyiSync.markDeleted(rec.rid);
          if (ZhouyiSync.isLoggedIn() && rec.cloudId) {
            ZhouyiSync.deleteCloud(rec.cloudId).catch(function () {});
          }
        }
      });
      box.appendChild(card);
    });
  }

  /** 从本地备份 JSON 文件导入记录（按时间去重） */
  function importRecords(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); }
      catch (e) { alert("导入失败：文件不是有效的 JSON。"); return; }
      if (!Array.isArray(data)) { alert("导入失败：文件中没有找到记录列表。"); return; }
      const valid = data.filter(r => r && typeof r.lines === "string" && r.lines.length === 6 && r.hexName && r.time);
      if (!valid.length) { alert("导入失败：未找到有效的起卦记录。"); return; }
      const seen = {};
      state.records.forEach(r => { seen[r.time] = true; });
      let added = 0, dup = 0;
      valid.forEach(r => {
        if (seen[r.time]) { dup++; return; }
        seen[r.time] = true;
        if (!r.rid) r.rid = ZhouyiSync.genRid(); // 补 id，确保能参与云同步
        if (!r.moving) r.moving = [];             // 补默认字段，避免渲染/回放崩溃
        state.records.push(r);
        added++;
      });
      if (added) {
        saveRecords();
        alert(`导入成功：新增 ${added} 条记录${dup ? `，跳过 ${dup} 条重复` : ""}。`);
      } else {
        alert("这些记录此前已存在，没有新增内容。");
      }
      renderRecords();
    };
    reader.onerror = () => alert("读取文件失败，请重试。");
    reader.readAsText(file);
  }

  function replayRecord(idx) {
    const r = state.records[idx];
    renderResult({ lines: r.lines, moving: r.moving || [], methodName: r.methodName + "（历史记录）", question: r.question || "", save: false });
    switchView("divine");
  }

  /** 导出记录为 JSON 文件（本地备份用） */
  function exportRecords() {
    if (!state.records.length) {
      alert("暂无记录可导出。");
      return;
    }
    const blob = new Blob([JSON.stringify(state.records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "周易起卦记录_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ================= 学习宝典 ================= */

  function renderStudy() {
    const sel = $("#studyHexSelect");
    sel.innerHTML = HEXAGRAMS.map(h => `<option value="${h.id}">${h.id}. ${h.name}（${h.title}）</option>`).join("");
    showStudyHex(HEXAGRAMS[0].id);
  }

  function showStudyHex(id) {
    const h = getHexById(id);
    state.studyHexId = id;
    const sel = $("#studyHexSelect");
    if (sel) sel.value = id;
    $("#studyHexContent").innerHTML = hexDetailHtml(h);
  }

  /* ================= 基础入门 ================= */

  /** 学习宝典 · 64卦速查记忆表 */
  function renderQuickRef() {
    const box = $("#studyQuickRef");
    if (!box) return;
    let html = `<table class="quickref-table"><tr><th>序</th><th>卦画</th><th>卦名 · 卦题</th><th>一句话读懂它</th></tr>`;
    HEXAGRAMS.forEach(h => {
      const lines = buildHexLines(h.upper, h.lower);
      const sym = lines.split("").map(c => `<span class="line ${c === "1" ? "" : "yin"}"></span>`).join("");
      html += `<tr data-id="${h.id}"><td>${h.id}</td><td><span class="mini-sym qr-sym">${sym}</span></td><td><b>${h.name} · ${h.title}</b></td><td class="qr-zong">${h.zong}</td></tr>`;
    });
    html += `</table>`;
    box.innerHTML = html;
    $all("#studyQuickRef tr[data-id]").forEach(tr => tr.addEventListener("click", () => openHexModal(+tr.dataset.id)));
  }

  function renderTrigramTable() {
    const box = $("#trigramTable");
    let html = `<table><tr><th>卦名</th><th>卦画</th><th>卦德</th><th>五行</th><th>先天数</th><th>后天方位</th><th>万物类象</th></tr>`;
    const order = ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"];
    order.forEach(n => {
      const t = TRIGRAMS[n];
      const sym = t.lines.split("").map(c => `<span class="line ${c === "1" ? "" : "yin"}"></span>`).join("");
      html += `<tr><td>${n}（${t.symbol}）</td><td><span class="tg-sym">${sym}</span></td><td>${t.virtue}</td><td>${t.element}</td><td>${t.xiantian}</td><td>${t.houtianDir}</td><td style="text-align:left;font-size:12.5px">${t.classification}</td></tr>`;
    });
    html += `</table>`;
    box.innerHTML = html;
  }

  /* ================= 五行相生相克图 ================= */

  function renderWuxingChart() {
    const box = $("#wuxingChart");
    if (!box) return;
    // 五元素五角星布局(中心 180,165,半径 115)
    const nodes = {
      木: { x: 180, y: 50, c: "#4f6b3f" },
      火: { x: 289, y: 129, c: "#a63d2f" },
      土: { x: 248, y: 258, c: "#9c7a3c" },
      金: { x: 112, y: 258, c: "#b08d3e" },
      水: { x: 71, y: 129, c: "#3e5c58" }
    };
    const sheng = [["木", "火"], ["火", "土"], ["土", "金"], ["金", "水"], ["水", "木"]];
    const ke = [["木", "土"], ["土", "水"], ["水", "火"], ["火", "金"], ["金", "木"]];
    const line = (a, b, cls) => {
      const n1 = nodes[a], n2 = nodes[b];
      const dx = n2.x - n1.x, dy = n2.y - n1.y;
      const d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d, len = 34;
      return `<line class="${cls}" x1="${(n1.x + ux * len).toFixed(1)}" y1="${(n1.y + uy * len).toFixed(1)}" x2="${(n2.x - ux * len).toFixed(1)}" y2="${(n2.y - uy * len).toFixed(1)}"/>`;
    };
    let svg = `<svg class="wuxing-svg" viewBox="0 0 360 330" role="img" aria-label="五行相生相克图">
      <defs>
        <marker id="arrSheng" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#3e5c58"/></marker>
        <marker id="arrKe" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#a63d2f"/></marker>
      </defs>
      <g class="wx-sheng">${sheng.map(p => line(p[0], p[1], "sheng")).join("")}</g>
      <g class="wx-ke">${ke.map(p => line(p[0], p[1], "ke")).join("")}</g>`;
    Object.keys(nodes).forEach(k => {
      const n = nodes[k];
      svg += `<g class="wx-node">
        <circle cx="${n.x}" cy="${n.y}" r="30" fill="none" stroke="${n.c}" stroke-width="2"/>
        <text x="${n.x}" y="${n.y + 7}" text-anchor="middle" fill="${n.c}" font-size="22">${k}</text>
      </g>`;
    });
    svg += `</svg>`;
    box.innerHTML = svg + `<div class="wx-legend">
      <span><i class="lg-sheng"></i>实线顺向：相生（一个帮一个）</span>
      <span><i class="lg-ke"></i>虚线交叉：相克（一个管一个）</span>
      <span>记法：顺五角星外圈读生，连五角星交叉线读克。</span>
    </div>`;
  }

  /* ================= 每日一卦 ================= */

  /** 以日期为种子确定性地选一卦（同一天结果一致） */
  function dailyIndex(date) {
    const s = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    let h = s * 48271 % 2147483647;
    h = (h ^ (h >>> 13)) * 48271 % 2147483647;
    return ((h % 64) + 64) % 64;
  }

  function renderDaily(hexId) {
    const box = $("#dailyBox");
    if (!box) return;
    const h = getHexById(hexId);
    const lines = buildHexLines(h.upper, h.lower);
    const now = new Date();
    const dayGZ = dayGanzhi(now);
    let html = "";
    html += `<div class="daily-hex">
      <div class="daily-symbol">${bigHexHtml(lines)}</div>
      <div class="daily-name">${h.name}卦 · ${h.title}</div>
      <div class="daily-meta">${dayGZ}日 · 第 ${h.id} 卦 · 上${h.upper}下${h.lower}</div>
    </div>`;
    html += `<div class="daily-guaci">
      <h4>卦辞原文</h4><div class="guaci-text">${h.guaci}</div>
      <h4>这卦在说什么</h4><div class="guaci-text" style="border-left-color:#b08d3e">${h.zong}</div>
    </div>`;
    html += `<div class="daily-tips">
      <div class="dt-item"><b>事业 · 学业</b><p>${h.shi}</p></div>
      <div class="dt-item"><b>感情 · 人际</b><p>${h.ganqing}</p></div>
      <div class="dt-item"><b>今日决策</b><p>${h.juece}</p></div>
    </div>`;
    html += `<div class="disclaimer">每日一卦是为你换一种心情看今天的小仪式，仅供趣味参考，不代替任何实际决策。</div>`;
    box.innerHTML = html;
  }

  /* ================= 记忆游戏 · 认卦速记 ================= */

  function shuffleArr(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ================= 记忆游戏 ================= */

  const GAME_BEST_KEY = "zhouyi_game_best";

  function gameInit() {
    let best = 0;
    try { best = parseInt(localStorage.getItem(GAME_BEST_KEY), 10) || 0; } catch (e) { best = 0; }
    // 清除旧的自动下一题定时器，避免重新开始后被旧定时器额外跳题
    if (state.game && state.game.timer) clearTimeout(state.game.timer);
    state.game = { level: 0, score: 0, streak: 0, lastId: -1, answered: false, used: [], mode: "sym2name", correct: 0, total: 0, best: best, timer: null };
    gameNewRound();
  }

  /** 刷新得分栏（分数/最佳/连击/正确率） */
  function gameUpdateScorebar() {
    const g = state.game;
    if (!g) return;
    $("#gameScore").textContent = g.score;
    $("#gameBest").textContent = g.best;
    $("#gameStreak").textContent = g.streak;
    $("#gameAcc").textContent = g.total ? Math.round(g.correct / g.total * 100) + "%" : "–";
  }

  function gameSetMode(mode) {
    const g = state.game;
    if (!g || g.mode === mode) return;
    if (g.timer) clearTimeout(g.timer);
    g.mode = mode;
    $("#gameModeSym2Name").classList.toggle("active", mode === "sym2name");
    $("#gameModeName2Sym").classList.toggle("active", mode === "name2sym");
    gameNewRound();
  }

  function gameNewRound() {
    const g = state.game;
    if (!g) return;
    if (g.used.length >= 64) {
      // 一轮 64 卦打完，最佳战绩即时落盘，重新洗牌再来
      gameSaveBest();
      g.used = [];
    }
    let id;
    // 只排除已用过的卦；不额外排除 lastId，否则当只剩一卦且恰是上一卦时会死循环
    do { id = 1 + Math.floor(Math.random() * 64); } while (g.used.indexOf(id) >= 0);
    g.used.push(id);
    g.lastId = id;
    g.answered = false;
    g.level++;
    const h = getHexById(id);
    const lines = buildHexLines(h.upper, h.lower);
    $("#gameLevel").textContent = g.level;
    gameUpdateScorebar();
    $("#gameHint").innerHTML = "";
    if (g.mode === "sym2name") {
      $("#gameHex").innerHTML = `<div class="game-sym">${bigHexHtml(lines)}</div>`;
      const opts = new Set([id]);
      while (opts.size < 4) opts.add(1 + Math.floor(Math.random() * 64));
      const optIds = shuffleArr(Array.from(opts));
      $("#gameOptions").innerHTML = optIds.map(oid => {
        const oh = getHexById(oid);
        return `<button class="game-opt" data-id="${oid}">${oh.name} · ${oh.title}</button>`;
      }).join("");
    } else {
      $("#gameHex").innerHTML = `<div class="game-sym game-sym-name">${h.name}<span>${h.title}</span></div>`;
      const opts = new Set([id]);
      while (opts.size < 4) opts.add(1 + Math.floor(Math.random() * 64));
      const optIds = shuffleArr(Array.from(opts));
      $("#gameOptions").innerHTML = optIds.map(oid => {
        const oh = getHexById(oid);
        const ol = buildHexLines(oh.upper, oh.lower);
        return `<button class="game-opt" data-id="${oid}"><span class="game-opt-sym">${linesHtml(ol, { size: "mini" })}</span><span class="game-opt-name">${oh.name}</span></button>`;
      }).join("");
    }
    $all(".game-opt").forEach(b => b.addEventListener("click", () => gameAnswer(+b.dataset.id, id, b)));
  }

  function gameSaveBest() {
    const g = state.game;
    if (!g) return;
    if (g.score > g.best) {
      g.best = g.score;
      try { localStorage.setItem(GAME_BEST_KEY, String(g.best)); } catch (e) { /* 忽略存储异常 */ }
    }
  }

  function gameAnswer(chosen, correctId, btn) {
    const g = state.game;
    if (!g || g.answered) return;
    g.answered = true;
    g.total++;
    const hint = $("#gameHint");
    const isSymMode = g.mode === "sym2name";
    if (chosen === correctId) {
      const gain = 10 + g.streak * 2;
      g.score += gain;
      g.streak++;
      g.correct++;
      btn.classList.add("correct");
      hint.innerHTML = `<b>✓ 答对了！</b>+${gain} 分，连击 ×${g.streak}`;
    } else {
      g.streak = 0;
      btn.classList.add("wrong");
      const h = getHexById(correctId);
      $all(".game-opt").forEach(b => { if (+b.dataset.id === correctId) b.classList.add("correct"); });
      hint.innerHTML = isSymMode
        ? `✗ 这卦是 <b>「${h.name} · ${h.title}」</b>。记住它：${h.zong}`
        : `✗ 这卦画对应 <b>「${h.name} · ${h.title}」</b>。记住它：${h.zong}`;
    }
    gameSaveBest();
    gameUpdateScorebar();
    $all(".game-opt").forEach(b => b.disabled = true);
    g.timer = setTimeout(gameNewRound, 1500);
  }

  /** 提示：扣 5 分显示上下卦 */
  function gameUseTip() {
    const g = state.game;
    if (!g || g.answered) return;
    if (g.score < 5) { $("#gameHint").innerHTML = "得分不足 5 分，暂时用不了提示。"; return; }
    g.score -= 5;
    const h = getHexById(g.lastId);
    gameUpdateScorebar();
    $("#gameHint").innerHTML = `提示：此卦<b>上${h.upper}、下${h.lower}</b>（上${TRIGRAMS[h.upper].nature} · 下${TRIGRAMS[h.lower].nature}）`;
  }

  /* ================= 账号登录 ================= */
  const auth = { mode: "login" };

  function renderAuthUI() {
    const btn = $("#btnUser");
    const indicator = $("#syncStatusIndicator");
    if (ZhouyiSync.isLoggedIn()) {
      const u = ZhouyiSync.getUser();
      const name = ((u.email || "我的").split("@")[0]) || "我的";
      btn.textContent = name.length > 10 ? name.slice(0, 10) + "…" : name;
      btn.classList.add("logged");
      indicator.style.display = "inline-block";
      indicator.textContent = "云同步已开启";
      indicator.className = "sync-status-indicator success";
      setTimeout(() => {
        if (indicator.textContent === "云同步已开启") indicator.style.display = "none";
      }, 3000);
      const mail = $("#userMail");
      if (mail) mail.textContent = u.email || "";
    } else {
      btn.textContent = "登录";
      btn.classList.remove("logged");
      indicator.style.display = "none";
    }
  }

  /** 登录后全量同步：拉云端 → 合并 → 补传 */
  function syncAll() {
    if (!ZhouyiSync.isLoggedIn()) return Promise.resolve({ added: 0, pushed: 0, removed: 0 });
    return ZhouyiSync.syncRecords(
      function () { return state.records; },
      function (recs) { state.records = recs; saveRecords(); renderRecords(); }
    );
  }

  function submitAuth() {
    const email = $("#loginEmail").value.trim();
    const pwd = $("#loginPwd").value;
    const tip = $("#loginTip");
    tip.textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { tip.textContent = "请输入正确的邮箱地址。"; return; }
    if (pwd.length < 6) { tip.textContent = "密码至少 6 位。"; return; }
    const btn = $("#loginSubmit");
    btn.disabled = true;
    const action = auth.mode === "register" ? ZhouyiSync.register(email, pwd) : ZhouyiSync.login(email, pwd);
    action.then(function () {
      $("#loginModal").classList.add("hidden");
      $("#loginEmail").value = "";
      $("#loginPwd").value = "";
      renderAuthUI();
      btn.disabled = false;
      // 同步与登录解耦：同步失败用顶部指示器提示，不影响登录成功状态
      const indicator = $("#syncStatusIndicator");
      indicator.style.display = "inline-block";
      indicator.textContent = "正在同步记录…";
      indicator.className = "sync-status-indicator syncing";
      syncAll().then(function (res) {
        indicator.textContent = (res.added > 0 || res.pushed > 0) ? `✓ 同步完成 (+${res.added}/↑${res.pushed})` : "✓ 已是最新";
        indicator.className = "sync-status-indicator success";
        setTimeout(() => { indicator.style.display = "none"; }, 3000);
      }).catch(function (err) {
        indicator.textContent = "✗ 同步失败：" + ((err && err.message) || "稍后再试");
        indicator.className = "sync-status-indicator error";
        setTimeout(() => { indicator.style.display = "none"; }, 4000);
      });
    }).catch(function (err) {
      btn.disabled = false;
      tip.textContent = (err && err.message) || "操作失败，请稍后再试。";
    });
  }

  function openLogin(mode) {
    auth.mode = mode === "register" ? "register" : "login";
    $("#loginTitle").textContent = auth.mode === "register" ? "注册" : "登录";
    $("#loginDesc").textContent = auth.mode === "register"
      ? "用邮箱注册一个账号，记录将自动备份到云端，换电脑 / 手机不丢失。"
      : "登录后，起卦记录会自动保存到云端，换电脑 / 手机都能找回来。";
    $("#loginSubmit").textContent = auth.mode === "register" ? "注 册" : "登 录";
    $("#loginSwitch").textContent = auth.mode === "register" ? "已有账号？去登录" : "没有账号？注册一个";
    $("#loginTip").textContent = "";
    $("#loginModal").classList.remove("hidden");
  }

  function initAuth() {
    renderAuthUI();
    $("#btnUser").addEventListener("click", function () {
      if (ZhouyiSync.isLoggedIn()) {
        $("#userModal").classList.remove("hidden");
      } else {
        openLogin("login");
      }
    });
    $("#loginSwitch").addEventListener("click", function () {
      openLogin(auth.mode === "register" ? "login" : "register");
    });
    $("#loginSubmit").addEventListener("click", submitAuth);
    $all("[data-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        if (el.dataset.close === "login") $("#loginModal").classList.add("hidden");
        else if (el.dataset.close === "user") $("#userModal").classList.add("hidden");
      });
    });
    $("#loginModal").addEventListener("click", e => { if (e.target === $("#loginModal")) $("#loginModal").classList.add("hidden"); });
    $("#userModal").addEventListener("click", e => { if (e.target === $("#userModal")) $("#userModal").classList.add("hidden"); });
    $("#btnLogout").addEventListener("click", function () {
      if (confirm("退出登录？本机记录会保留，云端记录不删除。")) {
        ZhouyiSync.logout();
        renderAuthUI();
        $("#userModal").classList.add("hidden");
      }
    });
    $("#btnSyncNow").addEventListener("click", function () {
      const tip = $("#userSyncTip");
      tip.textContent = "正在同步…";
      syncAll().then(function (res) {
        tip.textContent = "同步完成。" + (res.added ? "新增 " + res.added + " 条；" : "") + (res.pushed ? "上传 " + res.pushed + " 条。" : "记录已是最新。");
      }).catch(function (err) {
        tip.textContent = "同步失败：" + ((err && err.message) || "网络问题，稍后再试。");
      });
    });
    // 恢复上次会话；若已登录则拉取云端记录
    ZhouyiSync.init(function () { renderAuthUI(); }).then(function (user) {
      if (user) {
        const indicator = $("#syncStatusIndicator");
        indicator.style.display = "inline-block";
        indicator.textContent = "加载云端记录…";
        indicator.className = "sync-status-indicator syncing";
        syncAll().then(function(res) {
          if (res.added > 0 || res.pushed > 0) {
            indicator.textContent = `✓ 同步完成 (+${res.added}/↑${res.pushed})`;
          } else {
            indicator.textContent = "✓ 已是最新";
          }
          indicator.className = "sync-status-indicator success";
          setTimeout(() => { indicator.style.display = "none"; }, 3000);
        }).catch(function(err) {
          console.error('启动同步失败:', err);
          indicator.textContent = "✗ 同步失败";
          indicator.className = "sync-status-indicator error";
          setTimeout(() => { indicator.style.display = "none"; }, 3000);
        });
      }
    });
  }

  /* ================= 初始化 ================= */

  function init() {
    loadRecords();
    initAuth();

    // 导航
    $all(".nav-btn").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));

    // 总览
    renderOverviewGrid();
    renderPalaceList();
    const hexSearchInput = $("#hexSearch");
    // 阻止浏览器自动填充：聚焦时才解除 readonly
    hexSearchInput.addEventListener("focus", () => { hexSearchInput.readOnly = false; });
    // 终极保险：Chrome 常在页面加载完成（load 事件）后才填充表单，
    // 这里在多个时间点强制清空，直到用户真正开始输入为止
    var userTyped = false;
    hexSearchInput.addEventListener("input", () => { userTyped = true; });
    var clearAutofill = () => { if (!userTyped) hexSearchInput.value = ""; };
    clearAutofill();
    window.addEventListener("load", function () {
      setTimeout(clearAutofill, 100);
      setTimeout(clearAutofill, 500);
      setTimeout(clearAutofill, 1500);
      setTimeout(clearAutofill, 3000);
    });
    hexSearchInput.addEventListener("input", () => {
      // 搜索时同步高亮"全部"标签，避免视觉状态不一致
      $all(".filter-tabs .chip").forEach(x => x.classList.toggle("active", x.dataset.filter === "all"));
      setOverviewMode("all");
      renderOverviewGrid();
    });
    $all(".filter-tabs .chip").forEach(c => c.addEventListener("click", () => {
      $all(".filter-tabs .chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
      setOverviewMode(c.dataset.filter);
    }));

    // 弹窗
    $("#modalClose").addEventListener("click", closeHexModal);
    $("#hexModal").addEventListener("click", e => { if (e.target === $("#hexModal")) closeHexModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeHexModal(); });

    // 起卦方法切换
    $all(".method-card").forEach(m => m.addEventListener("click", () => resetMethod(m.dataset.method)));

    // 各起卦按钮
    $("#btnThrows").addEventListener("click", doCoinThrow);
    $("#btnYarrow").addEventListener("click", doYarrow);
    $("#btnPlumTime").addEventListener("click", doPlumTime);
    $("#btnPlumNum").addEventListener("click", doPlumNum);
    $("#btnRandom").addEventListener("click", doRandom);
    // 默认当前时间填入
    const now = new Date();
    now.setSeconds(0, 0);
    const pad = n => String(n).padStart(2, "0");
    $("#plumTime").value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // 记录
    const btnExp = $("#btnExportRecords");
    if (btnExp) btnExp.addEventListener("click", exportRecords);
    const btnImp = $("#btnImportRecords");
    if (btnImp) {
      btnImp.addEventListener("click", () => $("#recImportInput").click());
      $("#recImportInput").addEventListener("change", e => {
        const f = e.target.files && e.target.files[0];
        if (f) importRecords(f);
        e.target.value = "";
      });
    }
    const recFilter = $("#recFilter");
    if (recFilter) recFilter.addEventListener("change", e => {
      state.recFilter = e.target.value;
      renderRecords();
    });
    $("#btnClearRecords").addEventListener("click", () => {
      if (confirm("确定清空所有起卦记录吗？")) {
        state.records.forEach(r => ZhouyiSync.markDeleted(r.rid));
        const toDel = state.records.filter(r => r.cloudId).map(r => r.cloudId);
        state.records = [];
        saveRecords();
        renderRecords();
        if (ZhouyiSync.isLoggedIn()) {
          toDel.forEach(id => ZhouyiSync.deleteCloud(id).catch(function () {}));
        }
      }
    });

    // 学习
    $all(".study-toc li").forEach(li => li.addEventListener("click", () => {
      $all(".study-toc li").forEach(x => x.classList.remove("active"));
      li.classList.add("active");
      $all(".study-block").forEach(b => b.classList.remove("active"));
      $("#" + li.dataset.target).classList.add("active");
    }));
    $("#studyHexSelect").addEventListener("change", e => showStudyHex(+e.target.value));
    const btnStudyPrev = $("#btnStudyPrev"), btnStudyNext = $("#btnStudyNext");
    if (btnStudyPrev) btnStudyPrev.addEventListener("click", () => {
      showStudyHex(state.studyHexId === 1 ? 64 : state.studyHexId - 1);
    });
    if (btnStudyNext) btnStudyNext.addEventListener("click", () => {
      showStudyHex(state.studyHexId === 64 ? 1 : state.studyHexId + 1);
    });
    renderStudy();

    // 基础
    renderTrigramTable();
    renderWuxingChart();
    renderQuickRef();

    // 返回顶部
    const btnTop = $("#btnTop");
    if (btnTop) {
      btnTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
      window.addEventListener("scroll", () => btnTop.classList.toggle("show", (window.scrollY || 0) > 400));
    }

    // 夜间模式
    const btnTheme = $("#btnTheme");
    if (btnTheme) {
      if (localStorage.getItem("zhouyi_theme") === "dark") document.body.classList.add("dark");
      updateThemeBtn();
      btnTheme.addEventListener("click", () => {
        const dark = document.body.classList.toggle("dark");
        localStorage.setItem("zhouyi_theme", dark ? "dark" : "light");
        updateThemeBtn();
      });
    }

    // 每日一卦
    if ($("#btnDailyToday")) {
      renderDaily(HEXAGRAMS[dailyIndex(new Date())].id);
      $("#btnDailyToday").addEventListener("click", () => renderDaily(HEXAGRAMS[dailyIndex(new Date())].id));
      $("#btnDailyShuffle").addEventListener("click", () => renderDaily(HEXAGRAMS[Math.floor(Math.random() * 64)].id));
    }

    // 记忆游戏
    if ($("#gameHex")) {
      gameInit();
      $("#btnGameRestart").addEventListener("click", gameInit);
      $("#btnGameTip").addEventListener("click", gameUseTip);
      $("#gameModeSym2Name").addEventListener("click", () => gameSetMode("sym2name"));
      $("#gameModeName2Sym").addEventListener("click", () => gameSetMode("name2sym"));
    }

    renderRecords();
  }

  function setOverviewMode(mode) {
    const grid = $("#hexGrid"), palace = $("#palaceList"), song = $("#sequenceSong");
    grid.classList.toggle("hidden", mode !== "all");
    palace.classList.toggle("hidden", mode !== "palace");
    song.classList.toggle("hidden", mode !== "sequence");
  }

  document.addEventListener("DOMContentLoaded", init);

})();
