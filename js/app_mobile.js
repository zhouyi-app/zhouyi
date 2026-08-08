/* =====================================================
 * 《周易》手机版 — 移动端逻辑
 * 复用 data_*.js 全量卦数据；与电脑版共用本机记录（localStorage）
 * ===================================================== */

(function () {
  "use strict";

  /* ================= 工具 ================= */
  function $(sel) { return document.querySelector(sel); }
  function $all(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /** 六爻线（自下而上）→ 卦画 HTML */
  function linesHtml(lines, opts) {
    opts = opts || {};
    let html = `<div class="m-hex-symbol">`;
    for (let i = 5; i >= 0; i--) {
      const yang = lines[i] === "1";
      html += `<div class="line ${yang ? "" : "yin"}"></div>`;
    }
    return html + `</div>`;
  }

  /** 大号卦画（动爻标红） */
  function bigHexHtml(lines, moving) {
    let html = `<div class="m-big-hex">`;
    for (let i = 5; i >= 0; i--) {
      const yang = lines[i] === "1";
      let cls = yang ? "line" : "line yin";
      if (moving && moving.indexOf(i) >= 0) cls += " moving";
      html += `<div class="${cls}"></div>`;
    }
    return html + `</div>`;
  }

  function triSym(name) {
    return TRIGRAMS[name].lines.split("").map(c => `<span class="line ${c === "1" ? "" : "yin"}"></span>`).join("");
  }

  /* ================= 状态 ================= */
  const state = {
    method: "coin",
    coinThrows: [],
    coinLogs: [],
    yarrowLogs: [],
    records: [],
    studyHexId: 1
  };
  const REC_KEY = "zhouyi_records_v1";
  const THEME_KEY = "zhouyi_theme";

  function loadRecords() {
    try { state.records = JSON.parse(localStorage.getItem(REC_KEY)) || []; }
    catch (e) { state.records = []; }
    // 旧记录补上唯一 id，便于云同步去重
    let patched = false;
    state.records.forEach(r => { if (!r.rid) { r.rid = ZhouyiSync.genRid(); patched = true; } });
    if (patched) saveRecords();
  }
  function saveRecords() {
    localStorage.setItem(REC_KEY, JSON.stringify(state.records));
  }

  /* ================= 起卦引擎 ================= */
  function throwCoins() {
    const backs = [Math.random() < 0.5 ? 1 : 0, Math.random() < 0.5 ? 1 : 0, Math.random() < 0.5 ? 1 : 0].reduce((a, b) => a + b, 0);
    if (backs === 3) return { yang: true, moving: true, label: "老阳", mark: "○", desc: "三背" };
    if (backs === 2) return { yang: true, moving: false, label: "少阳", mark: "—", desc: "二背一字" };
    if (backs === 1) return { yang: false, moving: false, label: "少阴", mark: "--", desc: "一背二字" };
    return { yang: false, moving: true, label: "老阴", mark: "×", desc: "三字" };
  }

  function yarrowYao() {
    let stalks = 49;
    for (let c = 0; c < 3; c++) {
      const left = 1 + Math.floor(Math.random() * (stalks - 2));
      const right = stalks - left;
      let r1 = left % 4; if (r1 === 0) r1 = 4;
      let r2 = (right - 1) % 4; if (r2 === 0) r2 = 4;
      stalks -= (r1 + r2 + 1);
    }
    if (stalks === 36) return { yang: true, moving: true, label: "老阳（九）" };
    if (stalks === 32) return { yang: false, moving: false, label: "少阴（八）" };
    if (stalks === 28) return { yang: true, moving: false, label: "少阳（七）" };
    return { yang: false, moving: true, label: "老阴（六）" };
  }

  const XT_NUM = { 1: "乾", 2: "兑", 3: "离", 4: "震", 5: "巽", 6: "坎", 7: "艮", 8: "坤" };
  function numToTrigram(n) {
    let v = ((Math.abs(n) % 8) + 8) % 8;
    if (v === 0) v = 8;
    return XT_NUM[v];
  }

  function changeHex(lines, moving) {
    let arr = lines.split("");
    moving.forEach(i => { arr[i] = arr[i] === "1" ? "0" : "1"; });
    const newLines = arr.join("");
    const t = linesToTrigrams(newLines);
    return { lines: newLines, hex: getHexByTrigrams(t.upper, t.lower) };
  }
  function huHex(lines) {
    const t = linesToTrigrams(lines.slice(1, 4) + lines.slice(2, 5));
    return { hex: getHexByTrigrams(t.upper, t.lower) };
  }
  function cuoHex(lines) {
    const nl = lines.split("").map(c => c === "1" ? "0" : "1").join("");
    const t = linesToTrigrams(nl);
    return { hex: getHexByTrigrams(t.upper, t.lower) };
  }
  function zongHex(lines) {
    const nl = lines.split("").reverse().join("");
    const t = linesToTrigrams(nl);
    return { hex: getHexByTrigrams(t.upper, t.lower) };
  }
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

  /** 朱熹七则（简版） */
  function selectRule(hex, changeHexObj, moving) {
    const n = moving.length;
    const yaoLabel = ["初", "二", "三", "四", "五", "上"];
    if (n === 0) return { title: "六爻不变 · 占本卦卦辞", desc: `以本卦【${hex.name}】卦辞断之。` };
    if (n === 1) { const y = hex.yao[moving[0]]; return { title: "一爻变 · 占本卦变爻爻辞", desc: `以本卦【${hex.name}】变爻【${y.name}】爻辞断之。` }; }
    if (n === 2) { const main = Math.max(moving[0], moving[1]); return { title: "两爻变 · 占两变爻爻辞（以上爻为主）", desc: `以上位之【${hex.yao[main].name}】为主。` }; }
    if (n === 3) return { title: "三爻变 · 占本卦及之卦卦辞", desc: `本卦【${hex.name}】为贞，之卦【${changeHexObj.name}】为悔。` };
    if (n === 4) {
      const still = [0, 1, 2, 3, 4, 5].filter(i => moving.indexOf(i) < 0);
      return { title: "四爻变 · 占之卦两不变爻爻辞（以下爻为主）", desc: `以之卦【${changeHexObj.name}】不变爻之【${changeHexObj.yao[Math.min(still[0], still[1])].name}】为主。` };
    }
    if (n === 5) {
      const still = [0, 1, 2, 3, 4, 5].filter(i => moving.indexOf(i) < 0)[0];
      return { title: "五爻变 · 占之卦不变爻爻辞", desc: `以之卦【${changeHexObj.name}】唯一不变爻【${changeHexObj.yao[still].name}】断之。` };
    }
    if (hex.id === 1) return { title: "六爻全变 · 乾卦用「用九」", desc: "见群龙无首，吉。" };
    if (hex.id === 2) return { title: "六爻全变 · 坤卦用「用六」", desc: "利永贞。" };
    return { title: "六爻全变 · 占之卦卦辞", desc: `以之卦【${changeHexObj.name}】卦辞断之。` };
  }

  /* ================= 动画 ================= */
  let animTimer = null;
  function playAnim(method, done) {
    const box = $("#mAnim");
    let inner = "", hint = "";
    if (method === "coin") {
      inner = `<span class="m-coin">錢</span><span class="m-coin">錢</span><span class="m-coin">錢</span>`;
      hint = "铜钱翻转，默念所问之事…";
    } else if (method === "yarrow") {
      inner = `<div class="m-taiji"></div>`;
      hint = "分二、挂一、揲四、归奇…";
    } else {
      inner = `<div class="m-taiji"></div>`;
      hint = method === "plum" ? "以数推卦…" : "心念入卦…";
    }
    box.innerHTML = `<div class="m-anim-inner">${inner}<p class="m-anim-hint">${hint}</p></div>`;
    box.classList.remove("hidden");
    clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      box.classList.add("hidden");
      box.innerHTML = "";
      done && done();
    }, 700);
  }

  /* ================= 起卦交互 ================= */
  function resetMethod(m) {
    state.method = m;
    state.coinThrows = [];
    state.coinLogs = [];
    state.yarrowLogs = [];
    $all(".m-method").forEach(b => b.classList.toggle("active", b.dataset.method === m));
    $all(".m-setup").forEach(s => s.classList.add("hidden"));
    $("#setup-" + m).classList.remove("hidden");
    if (m === "coin") updateCoinBtn();
  }

  function updateCoinBtn() {
    const n = state.coinThrows.length;
    const btn = $("#mBtnCoin");
    if (n < 6) {
      btn.textContent = `掷铜钱（第 ${n + 1} 次 / 共 6 次）`;
      btn.disabled = false;
    } else {
      btn.textContent = "卦已起成，重新起卦";
      btn.disabled = true;
    }
    $("#mCoinLog").innerHTML = state.coinLogs.map(l => `<div>${l}</div>`).join("");
  }

  function doCoin() {
    if (state.coinThrows.length >= 6) return;
    $("#mBtnCoin").disabled = true;
    playAnim("coin", () => {
      const r = throwCoins();
      state.coinThrows.push(r);
      const n = state.coinThrows.length;
      const mark = r.moving ? (r.yang ? "○" : "×") : (r.yang ? "—" : "--");
      state.coinLogs.push(`<b>第 ${n} 次（${["初", "二", "三", "四", "五", "上"][n - 1]}爻）</b>：${r.desc} ⇒ ${r.label}（${r.yang ? "阳" : "阴"}爻 ${mark}）${r.moving ? " · 动爻" : ""}`);
      updateCoinBtn();
      if (state.coinThrows.length === 6) {
        const lines = state.coinThrows.map(c => c.yang ? "1" : "0").join("");
        const moving = state.coinThrows.map((c, i) => c.moving ? i : -1).filter(i => i >= 0);
        castResult({ lines: lines, moving: moving, methodName: "三枚铜钱法", question: readQ() });
      }
    });
  }

  function doYarrow() {
    const btn = $("#mBtnYarrow");
    btn.disabled = true;
    playAnim("yarrow", () => {
      btn.disabled = false;
      const yaos = [];
      const moving = [];
      for (let i = 0; i < 6; i++) {
        const y = yarrowYao();
        yaos.push(y.yang ? "1" : "0");
        if (y.moving) moving.push(i);
        state.yarrowLogs.push(`<b>第 ${i + 1} 爻（${["初", "二", "三", "四", "五", "上"][i]}）</b>：${y.label}${y.moving ? " · 动爻" : ""}`);
      }
      $("#mYarrowLog").innerHTML = state.yarrowLogs.map(l => `<div>${l}</div>`).join("");
      castResult({ lines: yaos.join(""), moving: moving, methodName: "大衍蓍草法", question: readQ() });
    });
  }

  function doPlumNum() {
    const a = parseInt($("#mNum1").value, 10);
    const b = parseInt($("#mNum2").value, 10);
    if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) { alert("请输入两个正整数。"); return; }
    const upper = numToTrigram(a % 8);
    const lower = numToTrigram(b % 8);
    const movingNum = (a + b) % 6;
    const moving = movingNum === 0 ? 5 : movingNum - 1;
    buildFromTrigrams(upper, lower, moving, "梅花易数 · 报数起卦", `${a} % 8 → 上卦${upper}；${b} % 8 → 下卦${lower}；动爻第${movingNum === 0 ? 6 : movingNum}爻`);
  }

  function doPlumTime() {
    const now = new Date();
    const y = now.getFullYear(), mo = now.getMonth() + 1, d = now.getDate(), h = now.getHours();
    const yearZhi = yearZhiOrder(y);
    const hourZhi = Math.floor((h + 1) / 2) % 12 + 1;
    const upperNum = (yearZhi + mo + d) % 8;
    const lowerNum = (yearZhi + mo + d + hourZhi) % 8;
    const movingNum = (yearZhi + mo + d + hourZhi) % 6;
    const upper = numToTrigram(upperNum), lower = numToTrigram(lowerNum);
    const moving = movingNum === 0 ? 5 : movingNum - 1;
    buildFromTrigrams(upper, lower, moving, "梅花易数 · 时间起卦", `年月日之和推上卦${upper}，加时推下卦${lower}，动爻第${movingNum === 0 ? 6 : movingNum}爻`);
  }

  function buildFromTrigrams(upper, lower, moving, methodName, desc) {
    const hex = getHexByTrigrams(upper, lower);
    if (!hex) { alert("起卦数据有误，请重试。"); return; }
    let arr = (TRIGRAMS[lower].lines + TRIGRAMS[upper].lines).split("");
    arr[moving] = arr[moving] === "1" ? "0" : "1";
    playAnim("plum", () => {
      castResult({ lines: arr.join(""), moving: [moving], methodName: methodName, extraDesc: desc, question: readQ() });
    });
  }

  function doRandom() {
    const btn = $("#mBtnRandom");
    btn.disabled = true;
    playAnim("random", () => {
      btn.disabled = false;
      const arr = [], moving = [];
      for (let i = 0; i < 6; i++) {
        const yang = Math.random() < 0.5;
        arr.push(yang ? "1" : "0");
        if (Math.random() < 0.25) moving.push(i);
      }
      castResult({ lines: arr.join(""), moving: moving, methodName: "心念起卦", question: readQ() });
    });
  }

  function readQ() {
    return ($("#mQuestion").value || "").trim();
  }

  /* ================= 解卦渲染 ================= */
  function castResult(cast) {
    const lines = cast.lines;
    const moving = cast.moving || [];
    const t = linesToTrigrams(lines);
    const hex = getHexByTrigrams(t.upper, t.lower);
    const changed = changeHex(lines, moving);
    const hu = huHex(lines), cuo = cuoHex(lines), zong = zongHex(lines);
    const now = new Date();
    const dayGZ = dayGanzhi(now);
    const rule = selectRule(hex, changed.hex, moving);
    const movingInUpper = moving.some(m => m >= 3);
    const ty = tiYong(hex.upper, hex.lower, movingInUpper);
    const hasChange = moving.length > 0;
    const question = cast.question || "";

    // 入库（回放 save:false 不重复）
    if (cast.save !== false) {
      const rec = {
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
      state.records.unshift(rec);
      saveRecords();
      renderRecords();
      // 已登录则同步到云端（失败不打扰，下次登录会补传）
      if (ZhouyiSync.isLoggedIn()) {
        ZhouyiSync.pushRecord(rec).catch(function () {});
      }
    }

    const verdictText = {
      "比和": "内外和谐、同心同德，事情顺势而行，是不错的兆头。",
      "用生体": "外部力量在帮衬你，有贵人相助，谋事容易成功。",
      "体生用": "你要为这件事付出较多心力，记得量力而行。",
      "体克用": "你能掌控局面，但过程要花些力气，主动一点更易成事。",
      "用克体": "眼下外界阻力不小，不宜硬闯，退一步蓄力更明智。"
    }[ty.relation] || "";
    const mvHint = moving.length === 0
      ? "六爻皆静，事情相对平稳，按卦的本意理解即可。"
      : moving.length === 1
        ? `有一个关键的变化（第${moving[0] + 1}爻），事情会在某节点出现转机，重点看下面「变爻详解」。`
        : `有 ${moving.length} 处变化，事情变动较明显，要多加留意、随机应变。`;

    let html = "";
    html += `<div class="m-result-title"><h3>${hex.name}卦 · ${hex.title}</h3><p>${cast.methodName} · ${now.toLocaleString("zh-CN")}（${dayGZ}日）${cast.extraDesc ? "<br>[" + cast.extraDesc + "]" : ""}</p></div>`;
    if (question) html += `<div class="m-asked">所问之事：<b>${escapeHtml(question)}</b></div>`;
    html += `<div class="m-result-actions"><button class="m-btn-ghost btn-sm" id="mCopyResult">复制卦文</button></div>`;

    html += `<div class="m-plain">
      <div class="m-plain-title">白话导读 <span class="m-plain-tag">新手先看</span></div>
      <p class="m-plain-sum">你占到的是<strong>「${hex.name}卦」</strong>，卦名叫「${hex.title}」。${verdictText}</p>
      <div class="m-plain-block"><b>卦在说什么：</b>${hex.zong}</div>
      <div class="m-plain-block"><b>变化提示：</b>${mvHint}</div>
    </div>`;

    html += `<div class="m-compare">
      <div class="m-col"><div class="m-c-label">本卦（${hex.name}）</div>${bigHexHtml(lines, moving)}<div class="m-c-name primary">${hex.name}</div><div class="m-c-label">${hex.title}</div></div>`;
    if (hasChange) {
      html += `<div class="m-compare-arrow">→</div>
      <div class="m-col"><div class="m-c-label">之卦（${changed.hex.name}）</div>${bigHexHtml(changed.lines)}<div class="m-c-name secondary">${changed.hex.name}</div><div class="m-c-label">${changed.hex.title}</div></div>`;
    }
    html += `</div>`;

    html += `<div class="m-compare-sub">
      <span class="m-chip-tag" data-open="${hu.hex.id}">互卦 <b>${hu.hex.name}</b></span>
      <span class="m-chip-tag" data-open="${cuo.hex.id}">错卦 <b>${cuo.hex.name}</b></span>
      <span class="m-chip-tag" data-open="${zong.hex.id}">综卦 <b>${zong.hex.name}</b></span>
      <span class="m-chip-tag">卦宫 <b>${getPalaceInfo(hex.id).palace.name}</b></span>
    </div>`;
    html += `<div class="m-change">${moving.length ? "变爻：" + moving.map(m => `<b>第${m + 1}爻</b>`).join("、") : "<b>六爻皆静</b>"}</div>`;

    html += `<div class="m-sec-title">解卦依据</div>`;
    html += `<div class="m-tip"><b>${rule.title}</b> —— ${rule.desc}<br>口诀：有变的看变化处，没变看整体。</div>`;

    html += `<div class="m-sec-title">卦辞</div>`;
    html += `<div class="m-guaci">${hex.guaci}</div>`;
    html += `<div class="m-guaci" style="border-left-color:#b08d3e">${hex.zong}</div>`;

    if (moving.length) {
      html += `<div class="m-sec-title">变爻详解（本卦）</div><div class="m-yao-list">`;
      hex.yao.forEach((y, i) => {
        const isMv = moving.indexOf(i) >= 0;
        html += `<div class="m-yao-row ${isMv ? "mv" : ""}">
          <div class="m-yao-name">${y.name}${isMv ? " ●" : ""}</div>
          <div class="m-yao-orig">${y.text}</div>
          <div class="m-yao-bai"><b>白话：</b>${y.bai}</div>
        </div>`;
      });
      html += `</div>`;
    }

    html += `<div class="m-sec-title">体用生克（你与事情的相处模式）</div>`;
    html += `<div class="m-tip">「体」= 你自己，「用」= 你要面对的事。</div>`;
    html += `<div class="m-tiyong">
      <div class="m-ty-cell"><div class="ty-name">体卦 · ${ty.ti}</div><span class="m-tg-sym">${triSym(ty.ti)}</span><small>${ty.tiEl}</small></div>
      <div class="m-ty-cell"><div class="ty-name">用卦 · ${ty.yong}</div><span class="m-tg-sym">${triSym(ty.yong)}</span><small>${ty.yongEl}</small></div>
      <div class="m-ty-cell"><div class="ty-name">${ty.relation}</div><span class="m-badge ${ty.verdict.indexOf("凶") >= 0 ? "bad" : (ty.verdict.indexOf("吉") >= 0 ? "good" : "mid")}">${ty.verdict}</span><small>${ty.ti}${ty.tiEl}对${ty.yong}${ty.yongEl}</small></div>
    </div>`;

    if (hasChange) {
      html += `<div class="m-sec-title">之卦简解</div>`;
      html += `<div class="m-guaci">${changed.hex.name} · ${changed.hex.guaci}</div>`;
      html += `<div class="m-guaci" style="border-left-color:#b08d3e">${changed.hex.zong}</div>`;
    }

    html += `<div class="m-sec-title">占断参考（对照你问的事）</div>`;
    html += `<div class="m-zhanshu">
      <p><b>事业 · 学业：</b>${hex.shi}</p>
      <p><b>感情 · 人际：</b>${hex.ganqing}</p>
      <p><b>决策：</b>${hex.juece}</p>
    </div>`;

    html += `<div class="m-disclaimer">占卜不是"算命下结论"，它是帮你换一个角度思考问题的古老智慧。选择权始终在你手里。</div>`;
    html += `<div class="m-detail-link"><button class="m-btn-ghost btn-sm" data-open="${hex.id}">查看本卦完整经文 ›</button></div>`;

    $("#mResult").innerHTML = html;
    $all("[data-open]").forEach(el => el.addEventListener("click", () => openDetail(+el.dataset.open)));

    const cpBtn = $("#mCopyResult");
    if (cpBtn) {
      const shareText = [
        `【${hex.name}卦 · ${hex.title}】`,
        `${cast.methodName} · ${now.toLocaleString("zh-CN")}（${dayGZ}日）`,
        question ? `所问之事：${question}` : "",
        "",
        `卦辞原文：${hex.guaci}`,
        `白话解读：${hex.zong}`,
        moving.length ? `变爻：第${moving.map(m => m + 1).join("、")}爻` : "六爻安静，无动爻",
        `体用：${ty.ti}（${ty.tiEl}）对 ${ty.yong}（${ty.yongEl}）——${ty.relation}`,
        `事业 / 学业：${hex.shi}`,
        `感情 / 人际：${hex.ganqing}`,
        `决策：${hex.juece}`,
        "",
        `—— 来自「周易智慧宝典·手机版」`
      ].filter(Boolean).join("\n");
      cpBtn.addEventListener("click", () => {
        copyText(shareText);
        const old = cpBtn.textContent;
        cpBtn.textContent = "✓ 已复制";
        setTimeout(() => { cpBtn.textContent = old; }, 1600);
      });
    }
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(() => legacyCopy(txt));
    } else legacyCopy(txt);
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

  /* ================= 详情视图 ================= */
  function hexDetailHtml(h) {
    const lines = buildHexLines(h.upper, h.lower);
    let html = `<div class="m-detail-head-sym">
      ${bigHexHtml(lines)}
      <h3>${h.name}卦 · ${h.title}</h3>
      <div class="m-d-sub">上${h.upper}下${h.lower} · 第 ${h.id} 卦${h.yong ? ` · <span style="color:#a63d2f">${h.yong.replace("：", " ")}</span>` : ""}</div>
    </div>`;
    html += `<div class="m-sec-title">卦辞</div><div class="m-guaci">${h.guaci}</div>`;
    if (h.yong) html += `<div class="m-guaci" style="border-left-color:#b08d3e">${h.yong}　${h.yong_bai}</div>`;
    html += `<div class="m-sec-title">彖曰</div><div class="m-guaci">${h.tuanyue}</div>`;
    html += `<div class="m-sec-title">象曰（大象）</div><div class="m-guaci">${h.daxiang}</div>`;
    html += `<div class="m-sec-title">六爻</div><div class="m-yao-list">`;
    h.yao.forEach(y => {
      html += `<div class="m-yao-row">
        <div class="m-yao-name">${y.name}</div>
        <div class="m-yao-orig">${y.text}</div>
        <div class="m-yao-bai">象曰：${y.xiang}<br><b>白话：</b>${y.bai}</div>
      </div>`;
    });
    html += `</div>`;
    html += `<div class="m-sec-title">白话总解</div><div class="m-guaci" style="border-left-color:#b08d3e">${h.zong}</div>`;
    html += `<div class="m-sec-title">占断参考</div><div class="m-zhanshu">
      <p><b>事业：</b>${h.shi}</p>
      <p><b>感情：</b>${h.ganqing}</p>
      <p><b>决策：</b>${h.juece}</p>
    </div>`;
    return html;
  }

  function openDetail(id) {
    const h = getHexById(id);
    if (!h) return;
    $("#mDetailBody").innerHTML = `
      <div class="m-detail-nav">
        <button class="m-btn-ghost btn-sm" id="mDetPrev">‹ 上一卦</button>
        <span class="m-nav-label">${h.id} / 64</span>
        <button class="m-btn-ghost btn-sm" id="mDetNext">下一卦 ›</button>
      </div>
      ${hexDetailHtml(h)}`;
    $("#mDetPrev").addEventListener("click", () => openDetail(h.id === 1 ? 64 : h.id - 1));
    $("#mDetNext").addEventListener("click", () => openDetail(h.id === 64 ? 1 : h.id + 1));
    $("#mDetail").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    $("#mDetailBody").scrollTop = 0;
  }
  function closeDetail() {
    $("#mDetail").classList.add("hidden");
    document.body.style.overflow = "";
  }

  /* ================= 速查 ================= */
  function renderHexGrid() {
    const box = $("#mHexGrid");
    const kw = ($("#mHexSearch").value || "").trim();
    let list = HEXAGRAMS;
    if (kw) {
      list = list.filter(h =>
        h.name.includes(kw) || h.title.includes(kw) || h.guaci.includes(kw) || h.zong.includes(kw) ||
        h.shi.includes(kw) || h.ganqing.includes(kw) || h.juece.includes(kw)
      );
    }
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = `<p class="m-no-match">未找到匹配的卦象，换个关键词试试。</p>`;
      return;
    }
    list.forEach(h => {
      const lines = buildHexLines(h.upper, h.lower);
      const card = document.createElement("div");
      card.className = "m-hex-card";
      card.innerHTML = `
        ${linesHtml(lines)}
        <div class="m-hex-name">${h.name}</div>
        <div class="m-hex-title">${h.title}</div>
        <div class="m-hex-id">第 ${h.id} 卦</div>`;
      card.addEventListener("click", () => openDetail(h.id));
      box.appendChild(card);
    });
  }

  /* ================= 每日一卦 ================= */
  function dailyIndex(date) {
    const s = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    let h = s * 48271 % 2147483647;
    h = (h ^ (h >>> 13)) * 48271 % 2147483647;
    return ((h % 64) + 64) % 64;
  }
  function renderDaily(id) {
    const h = getHexById(id);
    const lines = buildHexLines(h.upper, h.lower);
    const dayGZ = dayGanzhi(new Date());
    $("#mDailyBox").innerHTML = `
      <div class="m-daily-hex">
        ${bigHexHtml(lines)}
        <div class="m-daily-name">${h.name}卦 · ${h.title}</div>
        <div class="m-daily-meta">${dayGZ}日 · 第 ${h.id} 卦 · 上${h.upper}下${h.lower}</div>
      </div>
      <div class="m-sec-title">卦辞</div><div class="m-guaci">${h.guaci}</div>
      <div class="m-sec-title">这卦在说什么</div><div class="m-guaci" style="border-left-color:#b08d3e">${h.zong}</div>
      <div class="m-sec-title">今日提示</div>
      <div class="m-zhanshu">
        <p><b>事业 · 学业：</b>${h.shi}</p>
        <p><b>感情 · 人际：</b>${h.ganqing}</p>
        <p><b>决策：</b>${h.juece}</p>
      </div>
      <div class="m-detail-link"><button class="m-btn-ghost btn-sm" data-open="${h.id}">查看完整经文 ›</button></div>
      <div class="m-disclaimer">每日一卦是为你换一种心情看今天的小仪式，仅供趣味参考。</div>`;
    $all("#mDailyBox [data-open]").forEach(el => el.addEventListener("click", () => openDetail(+el.dataset.open)));
  }

  /* ================= 记录 ================= */
  function renderRecords() {
    const box = $("#mRecords");
    if (!state.records.length) {
      box.innerHTML = `<div class="m-rec-empty">暂无起卦记录。去「起卦」试试吧。</div>`;
      return;
    }
    box.innerHTML = "";
    state.records.forEach((r, idx) => {
      const q = (r.question || "").trim();
      const card = document.createElement("div");
      card.className = "m-record";
      card.innerHTML = `
        <div class="m-record-top">
          <div class="m-record-sym">${linesHtml(r.lines)}</div>
          <div class="m-record-main">
            <b>${r.hexName}卦</b><span>${r.hexTitle}${r.changeName ? " → " + r.changeName : ""}</span>
            <div class="m-rec-method">${escapeHtml(r.methodName || "未知方法")}${q ? " · " + escapeHtml(q.length > 18 ? q.slice(0, 18) + "…" : q) : ""}</div>
          </div>
          <button class="m-record-del" data-idx="${idx}" title="删除">×</button>
        </div>
        <div class="m-record-time">${new Date(r.time).toLocaleString("zh-CN")}${r.moving && r.moving.length ? " · 变爻" + r.moving.map(m => m + 1).join(",") : ""}</div>`;
      box.appendChild(card);
      card.addEventListener("click", () => {
        renderResultFromRec(r);
        switchView("cast");
      });
    });
    $all(".m-record-del").forEach(d => d.addEventListener("click", e => {
      e.stopPropagation();
      const idx = +d.dataset.idx;
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
    }));
  }

  function renderResultFromRec(r) {
    castResult({
      lines: r.lines,
      moving: r.moving || [],
      methodName: r.methodName + "（历史记录）",
      extraDesc: r.extraDesc || "",
      question: r.question || "",
      save: false
    });
    const box = $("#mResult");
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportRecords() {
    if (!state.records.length) { alert("暂无记录可导出。"); return; }
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

  /* ================= 学习 ================= */
  function renderStudySelect() {
    const sel = $("#mStudySelect");
    sel.innerHTML = HEXAGRAMS.map(h => `<option value="${h.id}">${h.id}. ${h.name}（${h.title}）</option>`).join("");
    showStudyHex(1);
  }
  function showStudyHex(id) {
    const h = getHexById(id);
    state.studyHexId = id;
    $("#mStudySelect").value = id;
    $("#mStudyContent").innerHTML = hexDetailHtml(h);
  }

  /* ================= 导航 / 主题 ================= */
  function switchView(view) {
    $all(".m-tab").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    $all(".m-view").forEach(v => v.classList.remove("active"));
    $("#view-" + view).classList.add("active");
    window.scrollTo({ top: 0 });
  }

  function applyTheme() {
    const dark = document.body.classList.contains("dark");
    $("#mTheme").textContent = dark ? "日间" : "夜间";
  }
  function initTheme() {
    if (localStorage.getItem(THEME_KEY) === "dark") document.body.classList.add("dark");
    applyTheme();
    $("#mTheme").addEventListener("click", () => {
      const dark = document.body.classList.toggle("dark");
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
      applyTheme();
    });
  }

  /* ================= 账号登录 ================= */
  const auth = { mode: "login" };

  function renderAuthUI() {
    const btn = $("#mUserBtn");
    if (ZhouyiSync.isLoggedIn()) {
      const u = ZhouyiSync.getUser();
      const name = ((u.email || "我的").split("@")[0]) || "我的";
      btn.textContent = name.length > 8 ? name.slice(0, 8) + "…" : name;
      $("#mUserMail").textContent = u.email || "";
      $("#mUserSyncTip").textContent = "已开启云同步，记录会自动保存。";
    } else {
      btn.textContent = "登录";
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
    const email = $("#mLoginEmail").value.trim();
    const pwd = $("#mLoginPwd").value;
    const tip = $("#mLoginTip");
    tip.textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { tip.textContent = "请输入正确的邮箱地址。"; return; }
    if (pwd.length < 6) { tip.textContent = "密码至少 6 位。"; return; }
    const btn = $("#mLoginSubmit");
    btn.disabled = true;
    const action = auth.mode === "register" ? ZhouyiSync.register(email, pwd) : ZhouyiSync.login(email, pwd);
    action.then(function () {
      $("#mLoginModal").classList.add("hidden");
      $("#mLoginEmail").value = "";
      $("#mLoginPwd").value = "";
      renderAuthUI();
      return syncAll();
    }).then(function () {
      btn.disabled = false;
    }).catch(function (err) {
      btn.disabled = false;
      tip.textContent = (err && err.message) || "操作失败，请稍后再试。";
    });
  }

  function openLogin(mode) {
    auth.mode = mode === "register" ? "register" : "login";
    $("#mLoginTitle").textContent = auth.mode === "register" ? "注册" : "登录";
    $("#mLoginDesc").textContent = auth.mode === "register"
      ? "用邮箱注册一个账号，记录将自动备份到云端，换设备不丢失。"
      : "登录后，起卦记录会自动保存到云端，换手机也能找回来。";
    $("#mLoginSubmit").textContent = auth.mode === "register" ? "注 册" : "登 录";
    $("#mLoginSwitch").textContent = auth.mode === "register" ? "已有账号？去登录" : "没有账号？注册一个";
    $("#mLoginTip").textContent = "";
    $("#mLoginModal").classList.remove("hidden");
  }

  function initAuth() {
    renderAuthUI();
    $("#mUserBtn").addEventListener("click", function () {
      if (ZhouyiSync.isLoggedIn()) {
        $("#mUserModal").classList.remove("hidden");
      } else {
        openLogin("login");
      }
    });
    $("#mLoginSwitch").addEventListener("click", function () {
      openLogin(auth.mode === "register" ? "login" : "register");
    });
    $("#mLoginSubmit").addEventListener("click", submitAuth);
    $all("[data-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        if (el.dataset.close === "login") $("#mLoginModal").classList.add("hidden");
        else if (el.dataset.close === "user") $("#mUserModal").classList.add("hidden");
      });
    });
    $("#mLogoutBtn").addEventListener("click", function () {
      if (confirm("退出登录？本机记录会保留，云端记录不删除。")) {
        ZhouyiSync.logout();
        renderAuthUI();
        $("#mUserModal").classList.add("hidden");
      }
    });
    $("#mBtnSyncNow").addEventListener("click", function () {
      const tip = $("#mUserSyncTip");
      tip.textContent = "正在同步…";
      syncAll().then(function (res) {
        tip.textContent = "同步完成。" + (res.added ? "新增 " + res.added + " 条；" : "") + (res.pushed ? "上传 " + res.pushed + " 条。" : "记录已是最新。");
      }).catch(function (err) {
        tip.textContent = "同步失败：" + ((err && err.message) || "网络问题，稍后再试。");
      });
    });
    // 恢复上次会话；若已登录则拉取云端记录
    ZhouyiSync.init(function () { renderAuthUI(); }).then(function (user) {
      if (user) syncAll().catch(function () {});
    });
  }

  /* ================= 初始化 ================= */
  function init() {
    loadRecords();
    initTheme();
    initAuth();

    // 底部导航
    $all(".m-tab").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));

    // 方法切换
    $all(".m-method").forEach(b => b.addEventListener("click", () => resetMethod(b.dataset.method)));
    $("#mBtnCoin").addEventListener("click", doCoin);
    $("#mBtnYarrow").addEventListener("click", doYarrow);
    $("#mBtnPlumNum").addEventListener("click", doPlumNum);
    $("#mBtnPlumTime").addEventListener("click", doPlumTime);
    $("#mBtnRandom").addEventListener("click", doRandom);

    // 速查
    renderHexGrid();
    $("#mHexSearch").addEventListener("input", renderHexGrid);

    // 每日
    renderDaily(HEXAGRAMS[dailyIndex(new Date())].id);
    $("#mBtnDailyToday").addEventListener("click", () => renderDaily(HEXAGRAMS[dailyIndex(new Date())].id));
    $("#mBtnDailyShuffle").addEventListener("click", () => renderDaily(HEXAGRAMS[Math.floor(Math.random() * 64)].id));

    // 学习
    $all(".m-snav").forEach(b => b.addEventListener("click", () => {
      $all(".m-snav").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      $all(".m-sblock").forEach(x => x.classList.remove("active"));
      $("#study-" + b.dataset.study).classList.add("active");
    }));
    $("#mStudySelect").addEventListener("change", e => showStudyHex(+e.target.value));
    $("#mStudyPrev").addEventListener("click", () => showStudyHex(state.studyHexId === 1 ? 64 : state.studyHexId - 1));
    $("#mStudyNext").addEventListener("click", () => showStudyHex(state.studyHexId === 64 ? 1 : state.studyHexId + 1));
    renderStudySelect();

    // 记录
    renderRecords();
    $("#mRecExport").addEventListener("click", exportRecords);
    $("#mRecImport").addEventListener("click", () => $("#mRecInput").click());
    $("#mRecInput").addEventListener("change", e => {
      const f = e.target.files && e.target.files[0];
      if (f) importRecords(f);
      e.target.value = "";
    });
    $("#mRecClear").addEventListener("click", () => {
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

    // 详情
    $("#mDetailClose").addEventListener("click", closeDetail);
  }

  document.addEventListener("DOMContentLoaded", init);

})();
