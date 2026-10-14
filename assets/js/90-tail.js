(function bootstrap(){
  /* ① 入口门禁最先跑：未登录访问业务页 → 去登录页（带 ?back= 记住原目标）。
        必须在任何渲染之前，否则会先闪出内容再跳走。 */
  if (requireLogin()) return;

  /* ② 登录页自身不渲染业务内容（表单交互在 login.html 的页内脚本里）。 */
  if (PG_CUR === "pg-login") return;

  /* ②b ★ R61（轮6）：顶栏操作者随会话回填 —— 原为 31 个壳页写死的静态文本，
     而 opUser()（审计署名）与 authRole()（角色判定）都以顶栏为权威取值。详见 10-asset.js 的 sessionTopbar 注释。 */
  sessionTopbar();

  const q = new URLSearchParams(location.search);
  /* 2026-09-30：旧深链 ?pg=pg-adapt（身份适配曾是独立页）→ 重定向到「资产列表」，
     由用户选资产后进「身份适配」页签（该页已并入资产详情，不再是独立页）。 */
  if (q.get("pg") === "pg-adapt") { location.replace("index.html"); return; }
  /* 兼容单文件时代深链：index.html?pg=pg-cred&tab=c2 直接落到目标页 */
  const want = q.get("pg");
  if (want && PG_FILE[want] && want !== PG_CUR) {
    /* ★ R61（轮5）：透传**除 pg 之外的全部参数** —— 原实现只透传 tab，
       使 `index.html?pg=pg-detail&aid=a1` 这类多参数深链丢失 aid（落到详情页后守卫回退到列表）。 */
    const _nq = new URLSearchParams(q); _nq.delete("pg");
    const _qs = _nq.toString();
    location.replace(PG_FILE[want] + (_qs ? ("?" + _qs) : ""));
    return;
  }
  if (location.hash === "#cred" && PG_CUR !== "pg-cred") { location.replace("cred-hosting.html"); return; }

  loadDemoState();

  if (PG_CUR === "pg-list") { assetListRender(); }
  else if (PG_CUR === "pg-detail") {
    const aid = q.get("aid") || window._detailAid || CUR_ACL || "";
    if (aid && byId(aid)) {
      openDetail(aid);
      /* 2026-09-30：支持落到指定页签（如 ?tab=t6 身份适配）—— openDetail 内部固定回 t1，
         故此处在其后再切一次。适配页签须重渲染（内容按资产 _adapt 现算）。 */
      /* ★ R61·轮8：tab 须为**详情页真实面板**的白名单成员 —— 原实现只判 `document.getElementById(wantTab)`
         存在，传 `?tab=detTabs`（页签导航容器本身，该 id 恰存在）即通过：showTab 先摘掉全部 `.tbp.on`，
         再把 `.on` 加给那个导航容器而非任何面板 ⇒ **内容区整片空白**。
         白名单与 asset-detail.html 的页签集一致（t1 基础信息 / t2 资源与访问 / t3 细粒度资源清单 /
         t4 代理与上游 / t6 身份适配；无 t5），先例见 40-identity.js 的 idDeepLink tab 白名单。
         非 Web 资产不存在 t3 / t4 ⇒ 由 applyDetailView 按同一判据回退 t1。 */
      const wantTab = q.get("tab");
      if (wantTab && ["t1", "t2", "t3", "t4", "t6"].indexOf(wantTab) >= 0) {
        showTab("detTabs", wantTab);
        if (typeof applyDetailView === "function") applyDetailView(byId(aid));
        if (wantTab === "t6" && typeof renderAdaptPage === "function") renderAdaptPage();
      }
    } else goPage("pg-list");
  }
  else if (PG_CUR === "pg-edit") {
    const mode = q.get("mode") || "register", aid = q.get("aid") || "", from = q.get("from") || "pg-list";
    if (mode === "edit" && aid && byId(aid)) enterForm("edit", byId(aid), from); else enterForm("register");
  }
  else if (PG_CUR === "pg-cred") { goCred(q.get("tab") || window._credTab || "c1"); }
  /* 新增页族：先 setPage 高亮侧栏，再按其自身渲染函数铺内容（2026-09-21）。
     ⚠ setPage 的**跨页守卫**是「if (pg !== PG_CUR) { goPage(pg); return; }」——
       故这里必须传 PG_CUR 本身：若三子页都写 setPage("pg-websec")，
       pg-rate / pg-reqcon 会被守卫判成「跨页」而直接弹回第一子页，形成打不开的死循环。
     侧栏高亮由 setPage 内的子页映射把 pg-rate / pg-reqcon 归到 pg-websec。 */
  else if (PG_CUR === "pg-websec") { setPage("pg-websec"); renderWebSec(); }
  else if (PG_CUR === "pg-rate") { setPage("pg-rate"); renderRate(); }
  else if (PG_CUR === "pg-reqcon") { setPage("pg-reqcon"); renderReqCon(); }
  else if (PG_CUR === "pg-rulelib") {
    /* ★ R61（轮5）：规则库页支持深链定位页签（`?tab=r2` 落「生效规则」）——
       供检测命中项「前往规则库对应条目」使用；取值白名单，非法值忽略。 */
    const _rlt = q.get("tab");
    if (_rlt === "r1" || _rlt === "r2" || _rlt === "r3") RLTAB = _rlt;
    setPage("pg-rulelib"); renderRuleLib();
  }
  /* 2026-09-29：原「认证族」7 页（场景工作台 / 认证源 / 能力字典 / 策略与场景 /
     生物识别绑定 / 机器与智能体身份 / 免认证访问）已从本原型撤除，改由「身份」「认证」两模块承接。
     2026-09-30：身份适配不再是独立页 —— 已并入资产详情页签（t6），故此处无分支。 */
  /* 2026-09-29：新增「身份」6 页 +「认证」6 页（两模块）。
     ⚠ 每组内部为并列页面，setPage 传 PG_CUR 本身（跨页守卫要求），高亮各自菜单项。 */
  else if (PG_CUR === "pg-iduser") { setPage("pg-iduser"); renderIdUser(); }
  else if (PG_CUR === "pg-idterm") { setPage("pg-idterm"); renderIdTerm(); }
  else if (PG_CUR === "pg-idcsw") { setPage("pg-idcsw"); renderIdCSW(); }
  else if (PG_CUR === "pg-idcin") { setPage("pg-idcin"); renderIdCIN(); }
  else if (PG_CUR === "pg-idagsw") { setPage("pg-idagsw"); renderIdAGSW(); }
  else if (PG_CUR === "pg-idagin") { setPage("pg-idagin"); renderIdAGIN(); }
  else if (PG_CUR === "pg-audict") { setPage("pg-audict"); renderAuDict(); }
  else if (PG_CUR === "pg-ausrc") { setPage("pg-ausrc"); renderAuSrc(); }
  else if (PG_CUR === "pg-auusercred") { setPage("pg-auusercred"); renderAuUserCred(); }
  else if (PG_CUR === "pg-auissue") { setPage("pg-auissue"); renderAuIssue(); }
  else if (PG_CUR === "pg-auauthr") { setPage("pg-auauthr"); renderAuAuthr(); }
  /* 2026-09-30：动态防护 3 页（与既有页同口径：setPage 传 PG_CUR 本身，否则跨页守卫弹回）
     2026-10-08：增第 4 页「对抗能力」 */
  else if (PG_CUR === "pg-dpov") { setPage("pg-dpov"); renderDpOverview(); }
  else if (PG_CUR === "pg-dppol") { setPage("pg-dppol"); renderDpPolicy(); }
  else if (PG_CUR === "pg-dpbase") { setPage("pg-dpbase"); renderDpBaseline(); }
  else if (PG_CUR === "pg-dparms") { setPage("pg-dparms"); renderDpArms(); }
  /* 公共页「风险事件告警」（覆盖各防护域 · 渲染函数复用 DP 模块的告警数据与组件） */
  else if (PG_CUR === "pg-alert") { setPage("pg-alert"); renderDpAlert(); }
  /* 2026-10-13：「系统配置」模块 —— 通知渠道配置页（独立页，与告警页同源同数据） */
  else if (PG_CUR === "pg-syschan") { setPage("pg-syschan"); renderSysChan(); }
  else { setPage(PG_CUR); }

  /* 2026-09-29：身份 / 认证两模块的事件委托统一挂载（挂在各页容器上，
     与本文件既有约定一致 —— 委托在容器，元素不在本页时自然不触发）。 */
  if (typeof idMountEvents === "function") idMountEvents();
  if (typeof auMountEvents === "function") auMountEvents();
  /* ★ 2026-10-10（R15-d）：页签 roving（`tabindex` 0 / -1）此前只挂在 `auRerender()` 与
     `credTab()` 之后 —— 而**启动链并不经 `auRerender()`**（`else if (PG_CUR === "pg-audict")`
     分支是 `setPage(…) + renderAuDict()`），页③ 的 `renderCred()` 也**不调** `credTab()` ⇒
     首次进入时 `#audTabs` / `#credTabs` / `#auucTabs` 的 `tabindex` 全为 null，非活动页签仍
     逐个停留在 Tab 序里。此处补一次（三宿主由 id 直取，与页族无关）。 */
  try { auTabsRoveAll(); } catch (_eboot) { /* 忽略 */ }
  /* 2026-09-30：身份适配页签（资产详情 t6）的交互委托 —— 挂在详情页容器上。
     此前 adaptSave / adaptReset / authGotoCred / authCopy2 / authExportInfo
     全是**死按钮**（无任何 handler），页签即使渲染出来也点不动。 */
  if (typeof adaptMountEvents === "function") adaptMountEvents();
})();

/* ==========================================================================
   身份适配页签（资产详情 t6）· 交互委托
   --------------------------------------------------------------------------
   挂载点：详情页容器（#pg-detail）。委托在容器上，故与详情页其余交互同命。
   ========================================================================== */
function adaptMountEvents() {
  var host = document.getElementById("pg-detail");
  if (!host || host._adaptMounted) return;
  host._adaptMounted = true;
  host.addEventListener("click", adaptOnClick);
  host.addEventListener("change", adaptOnChange);
}
function adaptOnChange(e) {
  var t = e.target; if (!t || !t.getAttribute) return;
  /* ★ 2026-09-30（第七轮）：以下三个「change 即落盘」旧分支已撤除
     （data-auth-adapt-machine / data-auth-adapt-inject INPUT / 通用 data-auth）——
     对应控件均已不存在，且均为「改动即持久化」旧语义；保留会在未来任何
     带 data-auth 的表单控件上复活的 change 劫持（改档位 + 整页重渲染）。 */
  /* 用户身份：第一步「是否传导」—— ★ 2026-09-30 由 radio+change 改为
     `.seg.wrap button` + click（与全站分段选择一致）。此处仅保留 radio 兼容分支，
     button 分支在 adaptOnClick 内处理（值取自 data-auth-adapt-inject 属性）。 */
  /* ⚠ adaptCredSel 分支已撤除（2026-09-30）：旧机器身份卡的控件。
     现机器身份块的托管凭据下拉 id = adCredSel，其 onchange 在 upInjBind() 内直接绑定。 */
  /* 信任声明：勾选后本档参数解锁（重渲染整页，因总览卡的信任标签也变）。
     ★ 2026-09-30（第六轮）：重渲染前先收草稿 —— 否则勾选动作本身会冲掉 A 档已输入未保存的参数。 */
  /* ★ 2026-09-30（第八轮）：bdPath 切换后完整调用地址随之更新（直连 / 网关代理两条完整路径）。 */
  if (t.id === "bdPath") {
    adaptStashF(false);
    renderDetAdapt();
    return;
  }
  /* ★ 2026-09-30（第十五轮 · 用户裁定）：C 档**协议驱动** —— 协议决定配什么、交付什么
     （§5.2 / FR-3.1：CAS 服务地址、SAML 元数据、OIDC client 凭据）。
     此前切换协议不触发任何重渲染 —— 「协议一选、其余照旧」，且选 CAS 时
     交付卡仍输出 OIDC 发现文档。
     ★ 触发面＝**三个改变交付内容的控件**：协议（决定字段集与全部交付物）、
     CAS 协议版本（决定票据校验端点与是否回属性）、SAML NameID 格式（交付卡须列出）。
     切换时：① 收旧值入草稿；② 协议变化时归一主标识（理由同 adaptFormC）；
     ③ 重渲染本档表单 **与** 交付卡（交付卡在折叠区内，不在 renderDetAdapt 的作用域）。 */
  if (t.id === "cdProto" || t.id === "cdCasVer" || t.id === "cdNameFmt") {
    adaptStashF(false);
    var cpk = adaptKey();
    ADAPT_F_TMP[cpk] = ADAPT_F_TMP[cpk] || {};
    var cct = ADAPT_F_TMP[cpk].C = ADAPT_F_TMP[cpk].C || {};
    if (t.id === "cdProto") {
      /* ★ 2026-09-30（用户裁定）：本档已无映射类字段（主标识按协议规范封装），
         切协议只需记住协议名本身。 */
      cct.proto = t.value;
    } else {
      cct[t.id === "cdCasVer" ? "casVer" : "nameFmt"] = t.value;
    }
    renderDetAdapt();
    var cib = document.getElementById("adaptInfoBody");
    if (cib) cib.innerHTML = adaptDeliverCard() + adaptVaultCard();
    return;
  }
  if (t.getAttribute("data-auth-adapt-trust")) {
    /* ★ 2026-09-30（第七轮）：信任声明同样只写草稿（ADAPT_TRUST_TMP）——
       adaptTrust() 读链已改草稿优先，「已保存 trust=true 后取消勾选」方能生效；
       落库随 adaptSave（保存 A 档时随信任拦截一并校验）。 */
    ADAPT_TRUST_TMP[adaptKey()] = !!t.checked;
    adaptStashF(false);
    renderAdaptPage();
    return;
  }
  /* D 档「登录形态」变化 → 第二步选择器组随之展开 / 折叠。
     ★ 2026-09-30（第六轮）：契约弹窗开着时**重开弹窗**展开 / 收起第二步组 ——
       此前只刷新页面表单、弹窗内纹丝不动（切「多步」看不到跳转后页面组，实测坐实）。 */
  if (t.id === "ddKind") {
    adaptStashD(true);
    var dg = document.getElementById("dlg1");
    if (dg && dg.classList.contains("show") && typeof adaptContractDlg === "function") { adaptContractDlg(); return; }
    renderDetAdapt(); return;
  }
  /* ★ 2026-09-30（第十六轮 · 全量评审修复）：**兜底草稿化** ——
     以上分支返回后，用户身份卡内其余参数控件（令牌字段名 / key 字段名 / 换取入口 URL /
     来源限制 / 票据有效期 / 各下拉与勾选组…）的 change 此前**没有任何处理**，值只活在 DOM 里：
     点其它页签再点回 t6 即整页重渲染、未保存输入静默回默认（实测坐实）。
     放在函数末尾 = 已 return 的分支不受影响；只认 #detAdaptForm 内，弹窗（body 级）不误收。 */
  if (t.closest && t.closest("#detAdaptForm")) adaptStashF(false);
}
/* 把 D 档表单当前值暂存到资产 _adapt.d（未点保存也先记住，避免切形态后输入丢失）。 */
/* ★ 2026-09-30（第六轮）：adaptStashD 补新字段 —— 表单识别规则（recogn）/
   启用范围（scope）/ 凭据托管方式（trustee），对齐权威源 §6.6 配置项清单。 */
/* D 档契约读取：**草稿优先**（键级合并到已存值之上）。
   与 adaptF 的优先级链同构：草稿（未提交的编辑）遮住已存值，但不抹掉已存值的其余字段。 */
function adaptDRead() {
  var base = (adaptSt() && adaptSt().d) || {};
  var t = ADAPT_D_TMP[adaptKey()] || {};
  var out = {}, k;
  for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
  for (k in t) { if (Object.prototype.hasOwnProperty.call(t, k)) out[k] = t[k]; }
  return out;
}
function adaptStashD(asDraft) {
  var a = adaptAsset(); if (!a) return;
  /* asDraft=true：只写草稿仓（弹窗内改动的路径）；
     缺省 / false：就地写资产对象（保存路径 + 既有调用方，语义不变）。 */
  var d;
  if (asDraft) {
    ADAPT_D_TMP[adaptKey()] = ADAPT_D_TMP[adaptKey()] || {};
    d = ADAPT_D_TMP[adaptKey()];
  } else {
    a._adapt = a._adapt || {};
    a._adapt.d = a._adapt.d || {};
    d = a._adapt.d;
  }
  var g = function (id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
  ["ddUrl:url","ddUrlAlt:urlAlt","ddKind:kind","ddRecogn:recogn","ddScope:scope","ddTrustee:trustee",
   "ddUserSel:userSel","ddPwdSel:pwdSel",
   "ddSubmitSel:submitSel","ddSubmit:submit","ddCaptcha:captcha","ddVerify:verify",
   /* R61：契约另有「代填失败动作」（ddFail）与「凭据绑定范围」（ddBind）两项关键配置 ——
      表单有控件、指引有口径，此前却未进白名单 ⇒ 改了不保存、刷新回默认。补入后与表单字段一一对应。 */
   "ddFail:fail","ddBind:bind",
   "ddS2Url:S2Url","ddS2User:S2User","ddS2Pwd:S2Pwd","ddS2Submit:S2Submit"].forEach(function (p) {
    var kv = p.split(":"), el = document.getElementById(kv[0]);
    /* ★ 2026-10-12（R61）：与 adaptStashF 同判据 —— **未渲染的字段跳过**（取不到元素时不得写
       空值，否则会抹掉已存的其它形态字段），**已渲染的字段按当前值覆盖（含空串）**。
       原实现 `if (v)` 跳过空值 ⇒ 已保存的文本字段**清不掉**：删掉「登录成功判据」再保存，
       旧值仍留在 _adapt.d，刷新即回旧；而控件是否渲染已由元素存在性表达，无需再看值。 */
    if (!el) return;
    d[kv[1]] = String(el.value || "").trim();
  });
  /* 第二步四项归入 step2 结构（与代填页共用同一契约形状）
     ★ 2026-09-30（第十六轮 · 全量评审修复）：**多步才收、单步即清** ——
     切回单步后第二步字段不再渲染，g() 读不到值、`if (v)` 不写，于是 d.S2Url 保留旧值，
     上面的 if 依旧成立，把**陈旧的第二步**当成有效契约同步给「用户代填账号托管」
     （形态已改单步，托管里却还留着跳转后页面的密码选择器）。 */
  var dKind2 = String(d.kind || "");
  if (dKind2.indexOf("多步") === 0 && (d.S2Url || d.S2Pwd)) {
    d.step2 = { url: d.S2Url || "", userSel: d.S2User || "", pwdSel: d.S2Pwd || "", submitSel: d.S2Submit || "" };
  } else {
    delete d.step2; delete d.S2Url; delete d.S2User; delete d.S2Pwd; delete d.S2Submit;
  }
}

/* D 档契约**变更** → 页④「用户代填账号托管」同资产记录的留痕。
   ★ 抽为独立函数：此前该逻辑内联在 adaptSave 的 D 分支里，契约弹窗也要用
     （弹窗保存走自己的入口），若各写一份必然分叉 —— 单点实现、两处调用。
   ★★ 2026-10-10（R27 · C-4）：**契约不再回写副本** —— 唯一真源是资产侧 `_adapt.d`，
      页④由 ucLoginOf 现读（资产侧优先）。原先此处把契约逐字段复制进 `x.login`，
      与读取侧构成「双写 + 双读」：同一份契约两处存，任一侧被单独改动即成漂移源。
      现只更新「更新时间」留痕，并**清除历史快照里残留的契约副本**（保留 tested / fail）。 */
function adaptSyncAuContract() {
  var a = adaptAsset(); if (!a) return;
  var d = (a._adapt && a._adapt.d) || {};
  if (!d.url) return;
  try {
    if (typeof AU !== "undefined" && AU && AU.uc && Array.isArray(AU.uc.items)) {
      var hit = false;
      AU.uc.items.forEach(function (x) {
        if (x.asset !== a.name) return;
        if (x.login && typeof x.login === "object") {
          delete x.login.url; delete x.login.urlAlt; delete x.login.kind; delete x.login.recogn;
          delete x.login.scope; delete x.login.trustee;
          delete x.login.userSel; delete x.login.pwdSel; delete x.login.submitSel;
          delete x.login.submit; delete x.login.captcha; delete x.login.verify; delete x.login.step2;
        }
        x.upd = AU_TS_STAMP.slice(0, 10);
        hit = true;
      });
      if (hit && typeof auSave === "function") auSave();
    }
  } catch (err) { /* 忽略：认证模块状态不可用时不影响资产侧落库 */ }
}
/* A/B/C 档表单值的暂存与落库。★ 2026-09-30（第六轮）新增 —— 此前只有读取方 adaptF()、
   **没有任何写入方**，实测两处缺陷：①「保存并下发」后参数全部回默认（_adapt.f 从未写入）；
   ②切档后未保存输入丢失（ADAPT_F_TMP 从未写入）。
   save=false → 草稿 ADAPT_F_TMP（切档 / 重渲染前调用，输入不丢）；
   save=true  → 资产 _adapt.f（保存时调用，落库并随 DEMO_KEY 持久化）。 */
function adaptStashF(save){
  var a = adaptAsset(); if (!a) return;
  var m = adaptMode(); if (m === "N" || m === "D") return;
  var ids = {
    A: { scope:"adScope", pos:"adPos", field:"adField", content:"adContent", pass:"adPass", redirect:"adRedirect" },
    B: { scope:"bdScope", pos:"bdPos", field:"bdField", ttl:"bdTtl", path:"bdPath", url:"bdUrl", fields:"bdFields", src:"bdSrc" },
    /* C 档字段集**随协议**（见 CD_PROTO_DEF）：CAS 无签名证书 / 元数据发布。 */
    C: null
  }[m];
  if (m === "C") ids = adaptCIds();
  if (!ids) return;
  var out = {}, had = false;
  Object.keys(ids).forEach(function (k) {
    var el = document.getElementById(ids[k]);
    if (!el) return;
    /* 勾选组（data-chkgrp）：收集勾中的 value 以「、」连接；普通控件读 value */
    var v;
    if (el.getAttribute && el.getAttribute("data-chkgrp")) {
      v = [].slice.call(el.querySelectorAll("input[type=checkbox]"))
        .filter(function (x) { return x.checked; })
        .map(function (x) { return x.value; }).join("、");
    } else {
      v = String(el.value || "").trim();
    }
    /* ★ 2026-09-30（第十七轮 · 全量评审修复）：**空值也要写入** ——
       原实现 `if (v)` 跳过空值，于是已保存的字段**清不掉**：管理员删掉「令牌字段名」再保存，
       旧值仍留在 _adapt.f（save 分支以旧值为底合并），刷新即回旧；与「保存并下发」语义矛盾。
       只要控件已渲染就按当前值（含空串）覆盖；未渲染的字段因 getElementById 返回 null 自然跳过。 */
    out[k] = v; had = true;
  });
  if (!had) return;
  if (save) {
    a._adapt = a._adapt || {};
    a._adapt.f = a._adapt.f || {};
    /* ★ 2026-09-30（第十五轮）：**合并**而非整体替换 —— C 档字段集随协议，
       从 SAML 切到 OIDC 保存时，SAML 专有的「指定证书」不该被抹掉（切回即还原）；
       A / B 档字段集恒定，合并与替换等价。 */
    var _pf = a._adapt.f[m] || {}, _mf = {}, _k2;
    for (_k2 in _pf) { if (Object.prototype.hasOwnProperty.call(_pf, _k2)) _mf[_k2] = _pf[_k2]; }
    for (_k2 in out) { if (Object.prototype.hasOwnProperty.call(out, _k2)) _mf[_k2] = out[_k2]; }
    /* ★ 2026-09-30（用户裁定）：C 档已无映射类字段（主标识由协议规范封装），
       清掉历史存档里残留的 mapSrc / mapDst@<协议> 键，不留无读取方的垃圾键。 */
    if (m === "C") {
      if ("mapSrc" in _mf) delete _mf.mapSrc;
      for (var _k4 in _mf) { if (_k4.indexOf("mapDst@") === 0) delete _mf[_k4]; }
    }
    a._adapt.f[m] = _mf;
    /* ★ 保存后清掉本档草稿 —— adaptF 草稿优先，旧草稿会盖住刚保存的值 */
    var key2 = adaptKey();
    if (ADAPT_F_TMP[key2] && ADAPT_F_TMP[key2][m]) delete ADAPT_F_TMP[key2][m];
  } else {
    var key = adaptKey();
    ADAPT_F_TMP[key] = ADAPT_F_TMP[key] || {};
    /* ★ 2026-09-30（第十六轮 · 全量评审修复）：草稿分支同样**合并**（原为整体替换）——
       C 档字段集随协议：选 SAML 改「NameID 格式 / 签名证书」未保存 → 切 OIDC → 切回 SAML，
       整块草稿被 OIDC 那次替换掉，SAML 专有草稿静默蒸发（已保存值因回落 _adapt.f 尚在，
       未保存的输入则丢）。与上方 save 分支的键级合并语义对齐。 */
    var _bf = ADAPT_F_TMP[key][m] || {}, _bm = {}, _k3;
    for (_k3 in _bf) { if (Object.prototype.hasOwnProperty.call(_bf, _k3)) _bm[_k3] = _bf[_k3]; }
    for (_k3 in out) { if (Object.prototype.hasOwnProperty.call(out, _k3)) _bm[_k3] = out[_k3]; }
    ADAPT_F_TMP[key][m] = _bm;
  }
}

function adaptOnClick(e) {
  /* 模式总览卡：点击即为当前资产选定该档（2026-09-30 补 —— 卡此前 cursor:pointer 却无处理）。 */
  var mk = e.target && e.target.closest ? e.target.closest("[data-adapt-mode]") : null;
  if (mk) {
    var am = adaptAsset(); if (!am) return;
    /* ★ 2026-09-30（第六轮）：切档前先把当前档未保存的输入收进草稿 ——
       此前直接重渲染，A→B→A 后输入实测丢失（ADAPT_F_TMP 从无写入方）。 */
    adaptStashF(false);
    /* ★ 2026-09-30（第七轮）：档位选择只写草稿（ADAPT_MODE_TMP），不写资产对象 ——
       此前直写 a._adapt.mode，机器身份卡任何一次保存（saveDemoState）
       都会把未保存的档位一并持久化。 */
    ADAPT_MODE_TMP[adaptKey()] = mk.getAttribute("data-adapt-mode");
    renderAdaptPage();
    toast("已切换到 " + mk.getAttribute("data-adapt-mode") + " 档（未保存）");
    return;
  }
  var t = e.target && e.target.closest ? e.target.closest("[data-auth]") : null;
  if (!t) return;
  var act = t.getAttribute("data-auth");
  if (act === "authGotoCred") { goPage("pg-auusercred"); return; }
  /* 用户身份卡右上角「凭据在用户代填账号托管」跳转 */
  if (act === "adaptGotoCred") { goPage("pg-auusercred"); return; }
  /* 机器身份卡右上角「凭据在网关凭据托管」跳转 */
  if (act === "adaptGotoCredHost") { goPage("pg-cred"); return; }
  /* D 档「表单契约」弹窗（2026-09-30：长表单由页内移入弹窗） */
  if (act === "adaptOpenContract") { window.__dlgStep = 1; adaptContractDlg(); return; }
  if (act === "authCopy2") {
    /* ★ 2026-09-30（用户裁定）：复制文本**随档位** —— 各档交付物不同，
       复制 / 导出统一取当前档位的交付内容（adaptDeliverInfo），避免卡片与复制两处口径漂移。 */
    var txt = adaptDeliverInfo().text;
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(function(){ toast("接入信息已复制（演示）"); }, function(){ toast("复制失败，请手动选择文本"); }); }
    else { toast("接入信息已复制（演示）"); }
    return;
  }
  if (act === "authExportInfo") { toast("接入信息已导出（演示）"); return; }
  /* 机器身份卡的两个提交按钮（★ 2026-09-30 新增）。
     与「用户身份」卡分开提交：两者写不同的状态键（a._inj / a._injCred vs a._adapt.mode / .d），
     互不覆盖 —— 用一张卡的两个按钮去「顺手保存另一张卡」会让「保存」的语义变得不可预期。 */
  if (act === "adaptInjSave") {
    var ai = adaptAsset(); if (!ai) return;
    upCfgEnsure(ai);
    /* ★ 2026-09-30（第七轮）：从草稿读值（草稿优先、回落已存值）——
       此前读 upCfgDft（即 a._inj），单选点击已污染该值，「保存」只是旧值再落一遍。 */
    var ki = adaptKey();
    var dri = UP_INJ_DRAFT[ki] || {};
    var si = upCfgDft(ai);
    var vInj = (dri.inj != null) ? dri.inj : si.inj;
    var vCred = (dri.cred != null && dri.cred !== "") ? dri.cred : (si.cred || "");
    /* 业务校验：选「注入网关托管凭据」必须已选凭据（空凭据＝注入无效配置） */
    if (vInj === "cred" && !vCred) { toast("已选「注入网关托管凭据」，须先选择托管凭据"); return; }
    ai._inj = (vInj === "cred") ? "cred" : "none";
    ai._injCred = (vInj === "cred") ? vCred : "";
    delete UP_INJ_DRAFT[ki];
    if (typeof saveDemoState === "function") saveDemoState();
    renderAdaptPage();
    toast("机器身份已保存并下发（演示）· " + (ai._inj === "cred" ? "注入网关托管凭据" : "不注入"));
    return;
  }
  if (act === "adaptInjReset") {
    var ar = adaptAsset(); if (!ar) return;
    idAsk("恢复默认", "将把本资产的<b>机器身份注入</b>恢复为出厂默认（<b>不注入</b>），用户身份配置不受影响。<b>此操作入审计</b>。", function () {
      delete ar._inj; delete ar._injCred; delete UP_INJ_DRAFT[adaptKey()];
      /* ★ 2026-09-30（第十六轮）：同上 —— 恢复默认须落盘，否则刷新回滚。 */
      if (typeof saveDemoState === "function") saveDemoState();
      renderAdaptPage(); toast("机器身份已恢复默认（演示）");
    }, "恢复默认");
    return;
  }
  if (act === "adaptReset") {
    var a = adaptAsset(); if (!a) return;
    idAsk("恢复默认", "将把当前资产的适配配置<b>恢复为出厂默认（不注入）</b>，含 D 档表单契约。<b>此操作入审计</b>。", function () {
      delete a._adapt;
      var kr = adaptKey();
      delete ADAPT_MODE_TMP[kr]; delete ADAPT_TRUST_TMP[kr]; delete ADAPT_F_TMP[kr];
      delete ADAPT_D_TMP[kr];
      /* ★ 2026-09-30（第十六轮 · 全量评审修复）：恢复默认须**落盘** ——
         原实现只删内存字段、不写 localStorage，直接刷新即回滚，「恢复默认」形同虚设。 */
      if (typeof saveDemoState === "function") saveDemoState();
      renderAdaptPage(); toast("已恢复默认（演示）");
    }, "恢复默认");
    return;
  }
  if (act === "adaptSave") {
    var a2 = adaptAsset(); if (!a2) return;
    var m = adaptMode();
    /* ★ A 档前置（FR-1.4 / 验收 5）：未声明信任不得保存注入配置 ——
       页内说明早已写「保存并下发将被拒绝」，第六轮补上实际拦截。 */
    if (m === "A" && !adaptTrust()) { toast("未声明信任的资产不能保存 token 注入配置"); return; }
    /* ★ B 档必填校验（第七轮 · §4.7 / FR-2.4）：
       换取入口 URL 是 key 的唯一注入点（空＝key 无处注入、模式空转）；
       来源限制是受信调用方闸门（未配置＝userinfo 暴露给任意来源）；
       key 有效期须为正整数（秒）。A 档信任拦截 / D 档 URL 校验见各自分支。 */
    if (m === "B") {
      var bUrl = (document.getElementById("bdUrl") || {}).value || "";
      var bSrc = (document.getElementById("bdSrc") || {}).value || "";
      var bTtl = (document.getElementById("bdTtl") || {}).value || "";
      if (!String(bUrl).trim()) { markBad("bdUrl", true); toast("B 档须先填写「注入入口 URL」—— key 仅注入该 URL 的请求（§4.7）"); return; }
      if (!String(bSrc).trim()) { markBad("bdSrc", true); toast("B 档须配置「来源限制」（IP 网段 / 域名）—— 受信调用方限定"); return; }
      if (!/^\d+$/.test(String(bTtl).trim()) || parseInt(bTtl, 10) <= 0) { markBad("bdTtl", true); toast("「key 有效期」须为正整数（秒）"); return; }
    }
    /* ★ 2026-09-30（第十七轮 · 全量评审修复）：C 档「票据有效期」**零校验** ——
       help 写「留空＝按协议惯例」，实际是自由文本框：abc / -5 / 0 / 999999999999
       一律被当合法值落库下发。此处只接受「按协议默认」或正整数（≤365 天）。 */
    if (m === "C") {
      var cTtl = String((document.getElementById("cdTtl") || {}).value || "").trim();
      if (cTtl && cTtl !== "按协议默认"
          && (!/^\d+$/.test(cTtl) || parseInt(cTtl, 10) <= 0 || parseInt(cTtl, 10) > 31536000)) {
        toast("「票据有效期」须为「按协议默认」或正整数秒数（≤365 天）");
        return;
      }
    }
    var ks = adaptKey();
    /* ★ 2026-09-30（第十七轮 · 全量评审修复）：D 档契约校验**前置到写内存之前** ——
       原实现先写 a2._adapt.mode / trust 并清档位草稿，再在 D 分支校验失败时 return：
       内存里档位已变 D、卡头状态显示「已保存」，而契约并未配置；此后任意一次
       saveDemoState（如点机器身份「保存并下发」、切页跳转）就把「D 档 + 空契约」持久化。
       校验先行：先收值（草稿）→ 校验 → 通过才提交到资产。
       ★ 同轮：登录页地址补 scheme 校验 —— help 早已写明「须为 https://」，代码只判非空。 */
    if (m === "D") {
      adaptStashD(true);
      var d0 = adaptDRead();
      var rec0 = String(d0.recogn || "").indexOf("自定义") === 0;
      if (!d0.url) { toast("D 档须先填写资产登录页地址"); return; }
      if (!/^https?:\/\//i.test(String(d0.url).trim())) { toast("「资产登录页地址」须为 https:// 开头（存量 http 按例外登记）"); return; }
      /* 自定义识别模式才强制选择器；自动模式由字段特征库识别（§6.6 默认值＝自动） */
      if (rec0 && (!d0.userSel || !d0.pwdSel)) { toast("自定义识别模式须填写账号 / 密码字段选择器"); return; }
      adaptStashD();
      delete ADAPT_D_TMP[ks];
    }
    a2._adapt = a2._adapt || {};
    /* 草稿落库：档位（ADAPT_MODE_TMP）与信任声明（ADAPT_TRUST_TMP）随保存一并生效。
       ★ trust 无条件固化当前生效值（adaptTrust()）—— 若只在「有草稿时」写入，
       首次保存时 seed 默认值（true）不落库，出现「UI 勾选着、库里 undefined」的
       显示与持久化不一致（第七轮旅程 J2/J3 实测坐实）。 */
    a2._adapt.mode = m;
    delete ADAPT_MODE_TMP[ks];
    a2._adapt.trust = adaptTrust();
    delete ADAPT_TRUST_TMP[ks];
    /* ★ A/B/C 档：表单值随保存落库 _adapt.f —— 此前只存档位，保存后参数全部回默认
       （第六轮实测坐实：改字段名 → 保存 → 页面弹回 Authorization）。 */
    if (m === "A" || m === "B" || m === "C") adaptStashF(true);
    /* D 档契约已在上方校验并提交，这里只做「用户代填账号托管」同步 */
    if (m === "D") { adaptSyncAuContract(); }
    /* 资产对象落盘（DEMO_KEY） */
    if (typeof saveDemoState === "function") saveDemoState();
    renderAdaptPage();
    var nm2 = ((ADAPT_MODES.filter(function (x) { return x.k === m; })[0]) || {}).name || m;
    toast("已保存并下发（演示）· " + nm2 + (m === "D" ? "；契约已同步至用户代填账号托管" : ""));
    return;
  }
}

/* ==========================================================================
   场景走查条挂载（2026-10-12）
   --------------------------------------------------------------------------
   由 URL 上的 ?flow=<流程号>&step=<幕号> 驱动，在页面右下角渲染逐幕导航。
   仅当 URL 带 flow 参数时动态注入 assets/walk.js —— 不改任何页面 HTML，
   无参数访问时本块立即返回，对既有渲染零影响。
   流程数据在 assets/flows.js。
   ========================================================================== */
(function amWalkMount() {
  if (window.__amWalkMounted) return;
  if (!/[?&]flow=/.test(location.search)) return;
  window.__amWalkMounted = 1;
  var s = document.createElement("script");
  s.src = "assets/walk.js";
  document.head.appendChild(s);
})();
