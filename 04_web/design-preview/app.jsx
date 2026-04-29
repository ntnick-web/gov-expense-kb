// ─────────────────────────────────────────────────────────────────
// 核銷 Let's go! — 重新設計
// 編輯感留白 + 馬卡龍柔和卡片;無 emoji、無線框、極簡
// ─────────────────────────────────────────────────────────────────

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ───── Tweaks (palette + density) ─────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "macaron",
  "density": "comfortable",
  "showLandingHero": true,
  "serifDisplay": true
}/*EDITMODE-END*/;

const PALETTES = {
  macaron: {
    bg:        "oklch(98.5% 0.008 80)",
    paper:     "oklch(99.5% 0.004 80)",
    ink:       "oklch(22% 0.02 60)",
    ink2:      "oklch(46% 0.018 60)",
    ink3:      "oklch(64% 0.014 60)",
    rule:      "oklch(90% 0.012 80)",
    mint:      "oklch(93% 0.045 165)",
    peach:     "oklch(93% 0.045 45)",
    lavender:  "oklch(93% 0.045 295)",
    butter:    "oklch(94% 0.05 95)",
    rose:      "oklch(93% 0.045 15)",
    sky:       "oklch(93% 0.04 235)",
    accent:    "oklch(58% 0.13 25)",
  },
  sage: {
    bg: "oklch(98% 0.008 130)", paper: "oklch(99.5% 0.004 130)",
    ink: "oklch(22% 0.02 150)", ink2: "oklch(46% 0.018 150)", ink3: "oklch(64% 0.014 150)",
    rule: "oklch(89% 0.012 130)",
    mint: "oklch(92% 0.04 150)", peach: "oklch(92% 0.04 70)",
    lavender: "oklch(92% 0.04 250)", butter: "oklch(93% 0.045 100)",
    rose: "oklch(92% 0.04 25)", sky: "oklch(92% 0.04 215)",
    accent: "oklch(48% 0.13 150)",
  },
  graphite: {
    bg: "oklch(97% 0.004 270)", paper: "oklch(99.5% 0.002 270)",
    ink: "oklch(18% 0.012 270)", ink2: "oklch(42% 0.012 270)", ink3: "oklch(62% 0.01 270)",
    rule: "oklch(88% 0.008 270)",
    mint: "oklch(93% 0.025 200)", peach: "oklch(93% 0.025 50)",
    lavender: "oklch(93% 0.025 290)", butter: "oklch(94% 0.03 95)",
    rose: "oklch(93% 0.025 15)", sky: "oklch(93% 0.025 230)",
    accent: "oklch(28% 0.04 270)",
  },
};

function applyTokens(palette) {
  const p = PALETTES[palette] || PALETTES.macaron;
  const r = document.documentElement;
  Object.entries(p).forEach(([k, v]) => r.style.setProperty(`--c-${k}`, v));
}

// ───── Utilities ─────
const NODE_BY_ID = Object.fromEntries((window.KB_NODES || []).map(n => [n.id, n]));

function categoryTone(parent) {
  switch (parent) {
    case "國內旅費":     return "mint";
    case "國外旅費":     return "peach";
    case "出席費鐘點費": return "lavender";
    case "禮品交際費":   return "butter";
    case "支出憑證與結報":return "sky";
    default:             return "rose";
  }
}

function nodeTypeLabel(t) {
  return ({核心法規: "A 法規", 支出標準: "B 標準", 解釋函令: "C 函令", 問答集: "D 問答"}[t]) || t;
}

// ───── Shell ─────
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useState("landing"); // landing | scenarios | corpus | calc
  const [drawerNode, setDrawerNode] = useState(null);
  const [scenarioOpen, setScenarioOpen] = useState(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [filterParent, setFilterParent] = useState(null);

  useEffect(() => { applyTokens(tweaks.palette); }, [tweaks.palette]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setCmdkOpen(o => !o);
      }
      if (e.key === "Escape") { setCmdkOpen(false); setDrawerNode(null); setScenarioOpen(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goCorpusFilter = (parent) => { setFilterParent(parent); setView("corpus"); };
  const goCorpusFromScenario = (ids) => {
    setScenarioOpen(null);
    if (ids && ids[0] && NODE_BY_ID[ids[0]]) setDrawerNode(NODE_BY_ID[ids[0]]);
  };

  return (
    <div className={`shell ${tweaks.serifDisplay ? "serif-on" : "serif-off"} density-${tweaks.density}`}>
      <Topbar
        view={view}
        onView={(v)=>{ setView(v); setFilterParent(null); }}
        onCmdk={()=>setCmdkOpen(true)}
      />
      <main className="main">
        {view === "landing"  && <Landing tweaks={tweaks} onView={setView} onCmdk={()=>setCmdkOpen(true)} onPickCategory={goCorpusFilter} />}
        {view === "scenarios"&& <Scenarios onOpen={(s)=>setScenarioOpen(s)} />}
        {view === "corpus"   && <Corpus filterParent={filterParent} setFilterParent={setFilterParent} onOpen={(n)=>setDrawerNode(n)} />}
        {view === "calc"     && <Calc onOpenNode={(n)=>setDrawerNode(n)} />}
      </main>
      <Footer />
      {drawerNode && <Drawer node={drawerNode} list={(window.KB_NODES||[])} onClose={()=>setDrawerNode(null)} onNav={(n)=>setDrawerNode(n)} onPick={(id)=>{ const n=NODE_BY_ID[id]; if(n) setDrawerNode(n); }} />}
      {scenarioOpen && <ScenarioModal scenario={scenarioOpen} onClose={()=>setScenarioOpen(null)} onGoCorpus={goCorpusFromScenario} onOpenNode={(n)=>{setScenarioOpen(null); setDrawerNode(n);}} />}
      {cmdkOpen && <CmdK onClose={()=>setCmdkOpen(false)} onPickNode={(n)=>{setCmdkOpen(false); setDrawerNode(n);}} onPickScenario={(s)=>{setCmdkOpen(false); setScenarioOpen(s);}} onView={(v)=>{setCmdkOpen(false); setView(v);}} />}
      <TweaksPanel title="Tweaks">
        <TweakSection title="調色">
          <TweakRadio label="色票" value={tweaks.palette} onChange={v=>setTweak("palette", v)}
            options={[{label:"馬卡龍",value:"macaron"},{label:"鼠尾草",value:"sage"},{label:"石墨",value:"graphite"}]} />
        </TweakSection>
        <TweakSection title="密度">
          <TweakRadio label="行高" value={tweaks.density} onChange={v=>setTweak("density", v)}
            options={[{label:"鬆",value:"comfortable"},{label:"中",value:"standard"},{label:"緊",value:"compact"}]} />
        </TweakSection>
        <TweakSection title="排版">
          <TweakToggle label="使用襯線體大標題" checked={tweaks.serifDisplay} onChange={v=>setTweak("serifDisplay", v)} />
          <TweakToggle label="首頁顯示大標 hero" checked={tweaks.showLandingHero} onChange={v=>setTweak("showLandingHero", v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// ───── Top bar (text-only, no icons) ─────
function Topbar({ view, onView, onCmdk }) {
  const tabs = [
    { k: "landing",   label: "首頁" },
    { k: "scenarios", label: "情境檢索" },
    { k: "corpus",    label: "條文庫" },
    { k: "calc",      label: "試算表" },
  ];
  return (
    <header className="topbar">
      <button className="brand" onClick={()=>onView("landing")}>
        <span className="brand-mark">核銷</span>
        <span className="brand-sub">Let's go.</span>
      </button>
      <nav className="tabs">
        {tabs.map(t => (
          <button key={t.k} className={`tab ${view===t.k?"active":""}`} onClick={()=>onView(t.k)}>{t.label}</button>
        ))}
      </nav>
      <button className="cmdk-btn" onClick={onCmdk}>
        <span>搜尋條文 / 城市 / 情境</span>
        <kbd>⌘K</kbd>
      </button>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-row">
        <span>核銷 Let's go!</span>
        <span className="dot">·</span>
        <span>政府支出法規知識庫</span>
        <span className="dot">·</span>
        <span>v2026.04.30</span>
      </div>
      <div className="footer-row dim">
        <span>本站僅彙整法規條文,實際結果以主計室認定為準。</span>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────
// 01 · Landing
// ─────────────────────────────────────────────────────────────────
function Landing({ tweaks, onView, onCmdk, onPickCategory }) {
  const meta = window.KB_META;
  return (
    <section className="landing">
      {tweaks.showLandingHero && (
        <div className="hero">
          <div className="hero-meta">
            <span>編號 #001</span>
            <span>2026 — 春</span>
            <span>單一靜態網站</span>
          </div>
          <h1 className="hero-title">
            把<em>使用者語言</em><br/>
            翻成<em>法律語言</em>。
          </h1>
          <p className="hero-lede">
            一個給承辦人員的支出核銷查詢工具。
            從你會說的「跨夜出差」「未列載城市」開始,
            找到應該援引的條文、附表、解釋函令與問答。
          </p>
          <div className="hero-cta">
            <button className="link-cta" onClick={()=>onView("scenarios")}>從情境開始 →</button>
            <button className="link-cta sub" onClick={onCmdk}>或直接搜尋(⌘K)</button>
          </div>
        </div>
      )}

      <div className="big-stats">
        <Stat n={meta.node_count} label="條文 · 附表 · 函釋 · 問答" />
        <Stat n={meta.scenario_count} label="核銷情境" />
        <Stat n={Object.keys(meta.category_counts).length} label="支出類別" />
        <Stat n={meta.last_indexed} label="最後更新" mono small />
      </div>

      <div className="entries">
        <EntryCard
          tone="mint"  num="01"  kicker="使用者語言"
          title="情境檢索" sub="我要報⋯⋯,該帶什麼?"
          desc="117 張核銷情境卡。從「當日往返」「跨夜住宿」「未列載城市」直接找到該援引的條文。"
          cta="進入情境檢索" onGo={()=>onView("scenarios")}
          notes={["逐步問答 · 結論卡","附帶單據清單","核章流程"]}
        />
        <EntryCard
          tone="peach" num="02"  kicker="法律語言"
          title="條文庫" sub="第 5 條怎麼說?"
          desc="520 張條文卡。核心法規 A · 支出標準 B · 解釋函令 C · 問答集 D。三層信度標示與抽屜全文。"
          cta="進入條文庫" onGo={()=>onView("corpus")}
          notes={["全文檢索","信度三層","跨條目比較"]}
        />
        <EntryCard
          tone="lavender" num="03" kicker="算給你看"
          title="試算表" sub="東京一週多少美元?"
          desc="日支生活費 · 旅行平安保險費 · 住宿折扣計算。城市別名與英文/簡稱輸入皆可。"
          cta="進入試算表" onGo={()=>onView("calc")}
          notes={["城市別名比對","新舊規定切換","可列印"]}
        />
      </div>

      <div className="cat-strip">
        <div className="cat-strip-head">
          <h3>依支出類別瀏覽</h3>
          <span className="dim mono">{Object.keys(meta.category_counts).length} categories</span>
        </div>
        <div className="cat-list">
          {Object.entries(meta.category_counts).map(([name, count]) => (
            <button key={name} className={`cat-row tone-${categoryTone(name)}`} onClick={()=>onPickCategory(name)}>
              <span className="cat-name">{name}</span>
              <span className="cat-count">{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="editorial-note">
        <span className="kicker">—— 編輯說明</span>
        <p>
          本站收錄之資料來自<u>行政院主計總處</u>、<u>國科會</u>、<u>教育部</u>與<u>成功大學</u>校內函釋。
          {meta.review_level_counts.人工} 筆經人工審校、
          {meta.review_level_counts.自動初校} 筆自動初校。
          標示為 <span className="pill pill-amber">推論</span> 或 <span className="pill pill-rose">爭議</span> 之卡片,
          請以主計室實務認定為準。
        </p>
      </div>
    </section>
  );
}

function Stat({ n, label, mono, small }) {
  return (
    <div className="stat">
      <div className={`stat-num ${mono?"mono":""} ${small?"small":""}`}>{n}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function EntryCard({ tone, num, kicker, title, sub, desc, cta, onGo, notes }) {
  return (
    <button className={`entry tone-${tone}`} onClick={onGo}>
      <div className="entry-top">
        <span className="entry-num">{num}</span>
        <span className="entry-kicker">{kicker}</span>
      </div>
      <h2 className="entry-title">{title}</h2>
      <div className="entry-sub">「{sub}」</div>
      <p className="entry-desc">{desc}</p>
      <ul className="entry-notes">
        {notes.map(n => <li key={n}>{n}</li>)}
      </ul>
      <div className="entry-cta">{cta} <span>→</span></div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// 02 · Scenarios
// ─────────────────────────────────────────────────────────────────
function Scenarios({ onOpen }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of (window.KB_SCENARIOS || [])) {
      if (q && !(s.title.includes(q) || s.subtitle.includes(q) || (s.tags||[]).some(t=>t.includes(q)))) continue;
      if (!map.has(s.parent)) map.set(s.parent, []);
      map.get(s.parent).push(s);
    }
    return [...map.entries()];
  }, [q]);
  const total = (window.KB_SCENARIOS || []).filter(s=>!q || s.title.includes(q) || s.subtitle.includes(q) || (s.tags||[]).some(t=>t.includes(q))).length;

  return (
    <section className="view scenarios">
      <ViewHead num="01" kicker="情境檢索 · Scenarios"
        title={<>用你的話<em>搜起來。</em></>}
        lede="從具體情境出發,系統會把對應的法規條文、附表、解釋函令與單據需求一起呈現。"
      />
      <div className="search-bar">
        <input className="search-input" placeholder="搜尋情境⋯⋯ 例:跨夜、東京、商務艙、簽案影本" value={q} onChange={e=>setQ(e.target.value)} />
        <span className="search-meta mono">{total} / {(window.KB_SCENARIOS||[]).length}</span>
      </div>
      {groups.length === 0 && <div className="empty">沒有符合的情境 — 試試其他關鍵字。</div>}
      {groups.map(([parent, items]) => (
        <div key={parent} className={`scen-group bg-${categoryTone(parent)}`}>
          <div className="scen-group-head">
            <h3>{parent}</h3>
            <span className="dim mono">{items.length} scenarios</span>
          </div>
          <div className="scen-grid">
            {items.map(s => (
              <button key={s.id} className={`scen-card ${s.flow ? "has-flow" : ""}`} onClick={()=>onOpen(s)}>
                <div className="scen-meta mono">
                  <span>{s.expense}</span>
                  {s.flow && <span className="scen-flowtag">逐步問答</span>}
                </div>
                <div className="scen-title">{s.title}</div>
                <div className="scen-sub">{s.subtitle}</div>
                <div className="scen-tags">
                  {(s.tags||[]).slice(0,4).map(t => <span key={t} className="tag">{t}</span>)}
                </div>
                <div className="scen-foot mono">
                  <span>援引 {s.primary_ids.length} 筆條文</span>
                  <span>→</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ViewHead({ num, kicker, title, lede }) {
  return (
    <div className="view-head">
      <div className="view-meta mono">
        <span>{num}</span>
        <span>{kicker}</span>
      </div>
      <h1 className="view-title">{title}</h1>
      <p className="view-lede">{lede}</p>
    </div>
  );
}

// ─── Scenario modal (with optional decision flow) ───
function ScenarioModal({ scenario, onClose, onGoCorpus, onOpenNode }) {
  const [path, setPath] = useState([]); // array of {qkey, optionLabel}
  const flow = scenario.flow;
  const currentKey = useMemo(() => {
    if (!flow) return null;
    let cur = flow.start;
    for (const step of path) {
      const opt = (flow.questions[step.qkey].options||[]).find(o=>o.label===step.optionLabel);
      if (!opt) break;
      if (opt.conclude) return { conclude: opt.conclude };
      if (opt.next) cur = opt.next;
    }
    return cur ? { ask: cur } : null;
  }, [flow, path]);
  const conclusion = currentKey?.conclude ? flow.conclusions[currentKey.conclude] : null;
  const askQ = currentKey?.ask ? flow.questions[currentKey.ask] : null;
  const refs = (conclusion?.refs || scenario.primary_ids || []).map(id => NODE_BY_ID[id]).filter(Boolean);

  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal scen-modal bg-${categoryTone(scenario.parent)}`} onClick={e=>e.stopPropagation()}>
        <div className="modal-top">
          <div className="modal-meta mono">
            <span>情境</span><span>{scenario.parent}</span><span>{scenario.expense}</span>
          </div>
          <button className="modal-close" onClick={onClose}>關閉 ✕</button>
        </div>
        <h2 className="modal-title">{scenario.title}</h2>
        <p className="modal-sub">{scenario.subtitle}</p>

        <div className="modal-grid">
          <div className="modal-col">
            {flow && (
              <div className="flow-box">
                <div className="section-kicker mono">逐步問答 · Decision flow</div>
                <ol className="flow-steps">
                  {path.map((step, i) => {
                    const q = flow.questions[step.qkey];
                    return (
                      <li key={i} className="flow-step done">
                        <div className="flow-q">{q.label}</div>
                        <div className="flow-a">→ {step.optionLabel}</div>
                      </li>
                    );
                  })}
                  {askQ && (
                    <li className="flow-step active">
                      <div className="flow-q">{askQ.label}</div>
                      {askQ.hint && <div className="flow-hint">{askQ.hint}</div>}
                      <div className="flow-options">
                        {askQ.options.map(opt => (
                          <button key={opt.label} className="flow-opt"
                            onClick={()=>setPath(p=>[...p,{qkey: currentKey.ask, optionLabel: opt.label}])}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  )}
                  {conclusion && (
                    <li className="flow-step conclusion">
                      <div className="conc-kicker mono">結論</div>
                      <div className="conc-title">{conclusion.title}</div>
                      <div className="conc-limit">{conclusion.limit}</div>
                      {conclusion.note && <div className="conc-note">{conclusion.note}</div>}
                    </li>
                  )}
                </ol>
                {path.length > 0 && (
                  <button className="link-cta sub small" onClick={()=>setPath([])}>↺ 重新作答</button>
                )}
              </div>
            )}

            {!flow && (
              <div className="section">
                <div className="section-kicker mono">概要</div>
                <p className="section-body">{scenario.subtitle}。本情境牽涉 {(scenario.tags||[]).join("、")}。</p>
              </div>
            )}

            <div className="section">
              <div className="section-kicker mono">需附單據</div>
              <ol className="checklist">
                {(scenario.attachments||[]).map((a,i) => (<li key={i}><span className="num mono">{String(i+1).padStart(2,"0")}</span>{a}</li>))}
              </ol>
            </div>

            <div className="section">
              <div className="section-kicker mono">核章流程</div>
              <div className="approve-flow">
                {(scenario.approvers||[]).map((a,i,arr)=>(
                  <React.Fragment key={i}>
                    <span className="approve-step">{a}</span>
                    {i<arr.length-1 && <span className="approve-arrow">→</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <aside className="modal-aside">
            <div className="section-kicker mono">援引條文 · {refs.length}</div>
            <ul className="ref-list">
              {refs.map(n => (
                <li key={n.id} className="ref-item">
                  <button className="ref-link" onClick={()=>onOpenNode(n)}>
                    <div className="ref-id mono">{n.id}</div>
                    <div className="ref-title">{n.title}</div>
                    <div className="ref-summary">{n.summary.slice(0, 80)}⋯</div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 03 · Corpus (條文庫)
// ─────────────────────────────────────────────────────────────────
function Corpus({ filterParent, setFilterParent, onOpen }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all"); // all | 核心法規 | 支出標準 | 解釋函令 | 問答集
  const [status, setStatus] = useState("all"); // all | 現行 | 已廢止
  const [certainty, setCertainty] = useState("all"); // all | normal | inferred | contested

  const all = window.KB_NODES || [];
  const filtered = useMemo(() => all.filter(n => {
    if (filterParent && n.parent !== filterParent) return false;
    if (type !== "all" && n.type !== type) return false;
    if (status !== "all" && n.status !== status) return false;
    if (certainty === "normal" && n.certainty) return false;
    if (certainty === "inferred" && n.certainty !== "inferred") return false;
    if (certainty === "contested" && n.certainty !== "contested") return false;
    if (q) {
      const blob = (n.id+n.title+n.summary+(n.tags||[]).join("")).toLowerCase();
      if (!blob.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [all, filterParent, type, status, certainty, q]);

  const types = [
    {k:"all", label:"全部"},
    {k:"核心法規", label:"A 法規"},
    {k:"支出標準", label:"B 標準"},
    {k:"解釋函令", label:"C 函令"},
    {k:"問答集",   label:"D 問答"},
  ];

  return (
    <section className="view corpus">
      <ViewHead num="02" kicker="條文庫 · Corpus"
        title={<>第 X 條<em>怎麼說?</em></>}
        lede="520 張條文卡 — 以類別、信度、狀態三個維度過濾,點開抽屜閱讀全文。"
      />
      <div className="filters">
        <div className="filter-row">
          <span className="filter-label mono">類別</span>
          {types.map(t => (
            <button key={t.k} className={`chip ${type===t.k?"on":""}`} onClick={()=>setType(t.k)}>{t.label}</button>
          ))}
        </div>
        <div className="filter-row">
          <span className="filter-label mono">支出類別</span>
          <button className={`chip ${!filterParent?"on":""}`} onClick={()=>setFilterParent(null)}>全部</button>
          {(window.KB_PARENTS||[]).map(p => (
            <button key={p} className={`chip ${filterParent===p?"on":""}`} onClick={()=>setFilterParent(p)}>{p}</button>
          ))}
        </div>
        <div className="filter-row">
          <span className="filter-label mono">狀態</span>
          {[{k:"all",label:"全部"},{k:"現行",label:"現行"},{k:"已廢止",label:"已廢止"}].map(t=>(
            <button key={t.k} className={`chip ${status===t.k?"on":""}`} onClick={()=>setStatus(t.k)}>{t.label}</button>
          ))}
          <span className="filter-label mono" style={{marginLeft:24}}>信度</span>
          {[{k:"all",label:"全部"},{k:"normal",label:"一般"},{k:"inferred",label:"推論"},{k:"contested",label:"爭議"}].map(t=>(
            <button key={t.k} className={`chip ${certainty===t.k?"on":""}`} onClick={()=>setCertainty(t.k)}>{t.label}</button>
          ))}
        </div>
        <div className="filter-row search">
          <input className="search-input" placeholder="關鍵字 · 條號 · tag⋯⋯" value={q} onChange={e=>setQ(e.target.value)} />
          <span className="search-meta mono">{filtered.length} / {all.length}</span>
        </div>
      </div>

      <div className="corpus-grid">
        {filtered.map(n => <NodeCard key={n.id} node={n} onClick={()=>onOpen(n)} />)}
      </div>
      {filtered.length === 0 && <div className="empty">沒有符合的條文 — 試著放寬條件。</div>}
    </section>
  );
}

function NodeCard({ node, onClick }) {
  const tone = categoryTone(node.parent);
  return (
    <button className={`node-card bg-${tone}`} onClick={onClick}>
      <div className="node-meta mono">
        <span>{node.id}</span>
        <span>{nodeTypeLabel(node.type)}</span>
      </div>
      <div className="node-title">{node.title}</div>
      <div className="node-summary">{node.summary}</div>
      <div className="node-foot">
        <div className="node-tags">
          {(node.tags||[]).slice(0,3).map(t => <span key={t} className="tag">{t}</span>)}
          {(node.tags||[]).length > 3 && <span className="tag muted">+{node.tags.length-3}</span>}
        </div>
        <div className="node-flags">
          {node.certainty === "inferred"  && <span className="pill pill-amber">推論</span>}
          {node.certainty === "contested" && <span className="pill pill-rose">爭議</span>}
          {node.status === "已廢止"        && <span className="pill pill-gray">已廢止</span>}
          {node.rate_table                 && <span className="pill pill-mint">含費率表</span>}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Drawer for node detail
// ─────────────────────────────────────────────────────────────────
function Drawer({ node, list, onClose, onNav, onPick }) {
  const tone = categoryTone(node.parent);
  const idx = useMemo(() => (list || []).findIndex(n => n.id === node.id), [list, node.id]);
  const prevNode = idx > 0 ? list[idx - 1] : null;
  const nextNode = idx >= 0 && idx < (list?.length || 0) - 1 ? list[idx + 1] : null;
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches?.('input,textarea,[contenteditable]')) return;
      if (e.key === 'ArrowLeft' && prevNode) { e.preventDefault(); onNav(prevNode); }
      if (e.key === 'ArrowRight' && nextNode) { e.preventDefault(); onNav(nextNode); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevNode, nextNode, onNav]);
  return (
    <div className="overlay" onClick={onClose}>
      <aside className={`drawer bg-${tone}`} onClick={e=>e.stopPropagation()}>
        <div className="drawer-top">
          <div className="drawer-meta mono">
            <span>{node.id}</span>
            <span>{nodeTypeLabel(node.type)}</span>
            <span>{node.parent}</span>
            {idx >= 0 && (
              <span className="drawer-nav">
                <button onClick={()=>prevNode && onNav(prevNode)} disabled={!prevNode} title="上一張(←)">‹</button>
                <span className="nav-counter">{idx + 1} / {list.length}</span>
                <button onClick={()=>nextNode && onNav(nextNode)} disabled={!nextNode} title="下一張(→)">›</button>
              </span>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>關閉 ✕</button>
        </div>
        {node.certainty === "inferred" && (
          <div className="banner banner-amber">
            <strong>推論 · Inferred</strong> {node.no_inference_note}
          </div>
        )}
        {node.certainty === "contested" && (
          <div className="banner banner-rose">
            <strong>爭議 · Contested</strong> {node.no_inference_note}
          </div>
        )}
        {node.status === "已廢止" && (
          <div className="banner banner-gray">
            <strong>此表已廢止</strong> 適用期間 {node.effective_period}。新版見 {node.superseded_by}。
          </div>
        )}
        <h2 className="drawer-title">{node.title}</h2>
        <div className="drawer-summary">{node.summary}</div>

        <div className="kv">
          <div className="kv-row"><span className="kv-k mono">主管機關</span><span>{node.agency}</span></div>
          <div className="kv-row"><span className="kv-k mono">版本</span><span className="mono">{node.version}</span></div>
          <div className="kv-row"><span className="kv-k mono">最後審校</span><span className="mono">{node.reviewed} · {node.review_level}</span></div>
          <div className="kv-row"><span className="kv-k mono">原始出處</span>
            {node.source_url
              ? <a className="mono" href={node.source_url} target="_blank" rel="noopener">{node.source} ↗</a>
              : <span className="mono dim">{node.source || "—"}</span>}
          </div>
        </div>

        {node.rate_table && <RateTablePreview rt={node.rate_table} />}

        <div className="drawer-tags">
          {(node.tags||[]).map(t => <span key={t} className="tag">{t}</span>)}
        </div>

        <div className="related">
          <div className="section-kicker mono">相關規定</div>
          <div className="related-list">
            {(window.KB_NODES||[]).filter(o=>o.id!==node.id && o.parent===node.parent).slice(0,4).map(o => (
              <button key={o.id} className="related-item" onClick={()=>onPick(o.id)}>
                <span className="mono">{o.id}</span>
                <span>{o.title}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function RateTablePreview({ rt }) {
  const [q, setQ] = useState("");
  if (rt.lookup_type === "insurance") {
    return <div className="section"><div className="section-kicker mono">費率查詢</div>
      <p className="section-body">至「試算表」查詢國外旅行平安保險費(依天數與地區)。</p></div>;
  }
  const filterRow = (r) => !q || r.some(c => String(typeof c === "object" ? c.v : c).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="section">
      <div className="section-head">
        <div className="section-kicker mono">{rt.caption} · 單位 {rt.unit}</div>
        <div className="dim mono">生效 {rt.effective}</div>
      </div>
      {rt.searchable && (
        <input className="search-input small" placeholder="搜尋城市/國家⋯" value={q} onChange={e=>setQ(e.target.value)} />
      )}
      <div className="ratetable-wrap">
        <table className="ratetable">
          <thead><tr>{rt.headers.map(h=><th key={h}>{h}</th>)}</tr></thead>
          {rt.sectioned ? rt.sections.map(sec => (
            <tbody key={sec.title}>
              <tr className="sec-row"><td colSpan={rt.headers.length} className="mono">{sec.title}</td></tr>
              {sec.rows.filter(filterRow).map((r,i)=>(<tr key={i}>{r.map((c,j)=><td key={j} className={typeof c==="number"?"num mono":""}>{typeof c==="object"?c.v:c}</td>)}</tr>))}
            </tbody>
          )) : (
            <tbody>{rt.rows.filter(filterRow).map((r,i)=>(<tr key={i}>{r.map((c,j)=><td key={j} className={typeof c==="number"?"num mono":""}>{typeof c==="object"?c.v:c}</td>)}</tr>))}</tbody>
          )}
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 04 · Calc (試算表)
// ─────────────────────────────────────────────────────────────────
function Calc({ onOpenNode }) {
  const [tab, setTab] = useState("daily"); // daily | insurance | hotel
  return (
    <section className="view calc">
      <ViewHead num="03" kicker="試算表 · Calculators"
        title={<>東京一週<em>多少美元?</em></>}
        lede="把規則寫成計算機:輸入城市、日數、職等,直接看到上限與依據條文。"
      />
      <div className="calc-tabs">
        {[{k:"daily",label:"國外日支生活費"},{k:"insurance",label:"旅行平安保險費"},{k:"hotel",label:"國內住宿費(長期遞減)"}].map(t=>(
          <button key={t.k} className={`calc-tab ${tab===t.k?"on":""}`} onClick={()=>setTab(t.k)}>{t.label}</button>
        ))}
      </div>
      {tab === "daily"     && <CalcDaily onOpenNode={onOpenNode} />}
      {tab === "insurance" && <CalcInsurance onOpenNode={onOpenNode} />}
      {tab === "hotel"     && <CalcHotel onOpenNode={onOpenNode} />}
    </section>
  );
}

// 月支生活費級距(從 A-國外旅費-024 抽出 — 派外進修/研究/實習 ≥31 日適用)
function parseMonthlyTier(row) {
  const range = (row[0] || "").replace(/\s/g, "");
  const monthly = parseInt((row[1] || "").replace(/,/g, ""), 10);
  let min, max;
  const m1 = range.match(/^(\d+)以上/);
  const m2 = range.match(/^(\d+)以下/);
  const m3 = range.match(/^(\d+)[–\-~](\d+)/);
  if (m1) { min = +m1[1]; max = Infinity; }
  else if (m2) { min = 0; max = +m2[1]; }
  else if (m3) { min = +m3[1]; max = +m3[2]; }
  return { range: row[0], min, max, monthly };
}

function CalcDaily({ onOpenNode }) {
  const node = NODE_BY_ID["B-國外旅費-003"];
  const studyAbroad = NODE_BY_ID["A-國外旅費-024"];
  const all = useMemo(() => {
    const out = [];
    for (const sec of node.rate_table.sections) {
      for (const r of sec.rows) out.push({ region: sec.title, country: r[0], city: r[1], amount: r[2] });
    }
    return out;
  }, []);
  const monthlyTiers = useMemo(() => {
    const rows = studyAbroad?.rate_table?.sections?.[0]?.rows || [];
    return rows.map(parseMonthlyTier).filter(t => Number.isFinite(t.min));
  }, []);
  const findMonthly = useCallback((daily) => monthlyTiers.find(t => daily >= t.min && daily <= t.max), [monthlyTiers]);

  const [q, setQ] = useState("東京");
  const [days, setDays] = useState(7);
  const [pct, setPct] = useState(100);
  const hits = useMemo(() => all.filter(r => !q || (r.city+r.country+r.region).toLowerCase().includes(q.toLowerCase())).slice(0,8), [all, q]);
  const sel = hits[0];
  const tier = sel ? findMonthly(sel.amount) : null;
  const dailyTotal = sel ? Math.ceil(sel.amount * days * pct / 100) : 0;
  const isLongStay = days >= 31;

  return (
    <div className="calc-pane bg-peach">
      <div className="calc-grid">
        <div className="calc-form">
          <Field label="搜尋城市 · 國家">
            <input className="big-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="東京 · Tokyo · Japan⋯" />
          </Field>
          <div className="calc-suggests">
            {hits.map(h => (
              <button key={h.region+h.country+h.city} className={`sugg ${sel===h?"on":""}`} onClick={()=>setQ(h.city)}>
                <span>{h.city}</span><span className="dim">{h.country}</span><span className="num mono">{h.amount}</span>
              </button>
            ))}
            {hits.length === 0 && <div className="dim small">未列載 — 將按該國「其他」或該區「其他」支給。</div>}
          </div>
          <Field label="出差天數">
            <div className="stepper">
              <button onClick={()=>setDays(d=>Math.max(1,d-1))}>−</button>
              <input className="big-input num mono" value={days} onChange={e=>setDays(Math.max(1, +e.target.value||1))} />
              <button onClick={()=>setDays(d=>d+1)}>+</button>
            </div>
          </Field>
          <Field label="百分率(配偶/眷屬同行折算)">
            <div className="seg">
              {[100, 80, 50].map(v=>(<button key={v} className={`seg-btn ${pct===v?"on":""}`} onClick={()=>setPct(v)}>{v}%</button>))}
            </div>
          </Field>
        </div>
        <div className="calc-out">
          <div className="calc-out-kicker mono">試算結果(短期出差 · 日支)</div>
          {sel ? (
            <>
              <div className="calc-bigamt mono">USD {dailyTotal.toLocaleString()}</div>
              <div className="calc-formula mono">{sel.amount} × {days} 天 × {pct}% = {dailyTotal} (尾數進位)</div>
              <div className="calc-pickline">
                <span className="dim mono">城市</span>
                <span>{sel.city}</span>
                <span className="dim mono">國家</span>
                <span>{sel.country}</span>
                <span className="dim mono">區域</span>
                <span>{sel.region}</span>
              </div>
              <div className="calc-monthly">
                <div className="section-kicker mono">月支生活費(派外進修/研究/實習 ≥ 31 日)</div>
                {tier ? (
                  <>
                    <div className="calc-monthly-row">
                      <span className="calc-monthly-amt mono">USD {tier.monthly.toLocaleString()} <span className="dim small">/月</span></span>
                      <span className="dim small">日支級距 {tier.range} → 月支 {tier.monthly.toLocaleString()}</span>
                    </div>
                    {isLongStay && (
                      <div className="calc-monthly-hint mono">
                        本次 {days} 日 ≥ 31 日 · 改採月支:{Math.floor(days/30)} 個月 × {tier.monthly.toLocaleString()} + {days%30} 日 × ({tier.monthly.toLocaleString()} ÷ 30) ≈ <strong>USD {(Math.floor(days/30)*tier.monthly + Math.round(days%30 * tier.monthly/30) ).toLocaleString()}</strong>
                      </div>
                    )}
                    {!isLongStay && (
                      <div className="calc-monthly-hint dim">短期出差(未滿 31 日)以日支為主,此區僅供長期派駐參考。</div>
                    )}
                    <button className="ref-link" onClick={()=>onOpenNode(NODE_BY_ID["A-國外旅費-024"])}>
                      <div className="ref-id mono">A-國外旅費-024</div>
                      <div className="ref-title">月支生活費級距表 + 計算規則</div>
                    </button>
                  </>
                ) : (
                  <div className="dim small">該日支金額無對應月支級距(範圍外)。</div>
                )}
              </div>
            </>
          ) : (
            <div className="dim">輸入城市以開始試算。</div>
          )}
          <div className="calc-refs">
            <div className="section-kicker mono">援引依據</div>
            {["A-國外旅費-007","B-國外旅費-003","A-國外旅費-024","C-國外旅費-012"].map(id => {
              const n = NODE_BY_ID[id]; if (!n) return null;
              return (<button key={id} className="ref-link" onClick={()=>onOpenNode(n)}>
                <div className="ref-id mono">{id}</div>
                <div className="ref-title">{n.title}</div>
              </button>);
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalcInsurance({ onOpenNode }) {
  const [days, setDays] = useState(7);
  const [region, setRegion] = useState("亞太");
  const RATES = { 亞太: 7.5, 歐洲: 9, 北美: 10.5, 其他: 8 };
  const total = Math.ceil(days * RATES[region]);
  return (
    <div className="calc-pane bg-lavender">
      <div className="calc-grid">
        <div className="calc-form">
          <Field label="出差天數">
            <div className="stepper">
              <button onClick={()=>setDays(d=>Math.max(1,d-1))}>−</button>
              <input className="big-input num mono" value={days} onChange={e=>setDays(Math.max(1,+e.target.value||1))} />
              <button onClick={()=>setDays(d=>d+1)}>+</button>
            </div>
          </Field>
          <Field label="出差地區">
            <div className="seg">
              {Object.keys(RATES).map(r => <button key={r} className={`seg-btn ${region===r?"on":""}`} onClick={()=>setRegion(r)}>{r}</button>)}
            </div>
          </Field>
        </div>
        <div className="calc-out">
          <div className="calc-out-kicker mono">外交部標準保險費</div>
          <div className="calc-bigamt mono">USD {total}</div>
          <div className="calc-formula mono">{days} 天 × {RATES[region]}/天 = {total}(尾數進位)</div>
          <div className="calc-refs">
            <div className="section-kicker mono">援引依據</div>
            <button className="ref-link" onClick={()=>onOpenNode(NODE_BY_ID["B-國外旅費-006"])}>
              <div className="ref-id mono">B-國外旅費-006</div>
              <div className="ref-title">國外出差人員旅行平安保險費</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalcHotel({ onOpenNode }) {
  const [type, setType] = useState("平日");
  const [nights, setNights] = useState(45);
  const cap = type === "平日" ? 3500 : 4500;
  const calc = (n) => {
    const d1 = Math.min(n, 30); // 1 個月內
    const d2 = Math.max(0, Math.min(n, 60) - 30); // 1~2 個月部分,8 折
    const d3 = Math.max(0, n - 60); // 2 個月以上,7 折
    return {
      seg: [
        { label: "1 個月內", days: d1, rate: cap, total: d1*cap },
        { label: "1~2 個月(8 折)", days: d2, rate: Math.round(cap*0.8), total: d2*Math.round(cap*0.8) },
        { label: "2 個月以上(7 折)", days: d3, rate: Math.round(cap*0.7), total: d3*Math.round(cap*0.7) },
      ],
    };
  };
  const r = calc(nights);
  const total = r.seg.reduce((s,x)=>s+x.total,0);
  return (
    <div className="calc-pane bg-mint">
      <div className="calc-grid">
        <div className="calc-form">
          <Field label="日別">
            <div className="seg">
              {["平日","假日"].map(t => <button key={t} className={`seg-btn ${type===t?"on":""}`} onClick={()=>setType(t)}>{t}</button>)}
            </div>
          </Field>
          <Field label="夜數(同一地點)">
            <div className="stepper">
              <button onClick={()=>setNights(n=>Math.max(1,n-1))}>−</button>
              <input className="big-input num mono" value={nights} onChange={e=>setNights(Math.max(1,+e.target.value||1))} />
              <button onClick={()=>setNights(n=>n+1)}>+</button>
            </div>
          </Field>
        </div>
        <div className="calc-out">
          <div className="calc-out-kicker mono">住宿費上限合計</div>
          <div className="calc-bigamt mono">NTD {total.toLocaleString()}</div>
          <div className="calc-formula mono">{type} 上限 {cap.toLocaleString()} 元 / 夜</div>
          <div className="calc-segments">
            {r.seg.map((s,i) => (
              <div key={i} className="calc-segrow">
                <span>{s.label}</span>
                <span className="num mono">{s.days} 夜 × {s.rate.toLocaleString()}</span>
                <span className="num mono">{s.total.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="calc-refs">
            <div className="section-kicker mono">援引依據</div>
            {["A-國內旅費-009","A-國內旅費-011","B-國內旅費-001"].map(id => {
              const n = NODE_BY_ID[id]; if (!n) return null;
              return (<button key={id} className="ref-link" onClick={()=>onOpenNode(n)}>
                <div className="ref-id mono">{id}</div>
                <div className="ref-title">{n.title}</div>
              </button>);
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (<label className="field"><span className="field-label mono">{label}</span>{children}</label>);
}

// ─────────────────────────────────────────────────────────────────
// CmdK
// ─────────────────────────────────────────────────────────────────
function CmdK({ onClose, onPickNode, onPickScenario, onView }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);
  useEffect(()=>{ inputRef.current?.focus(); }, []);

  const items = useMemo(() => {
    const out = [];
    out.push({ kind:"view", label:"前往 · 情境檢索", action:()=>onView("scenarios") });
    out.push({ kind:"view", label:"前往 · 條文庫",   action:()=>onView("corpus") });
    out.push({ kind:"view", label:"前往 · 試算表",   action:()=>onView("calc") });
    for (const s of (window.KB_SCENARIOS||[])) {
      out.push({ kind:"scenario", label:s.title, sub:s.subtitle, scen:s, action:()=>onPickScenario(s) });
    }
    for (const n of (window.KB_NODES||[])) {
      out.push({ kind:"node", label:n.title, sub:`${n.id} · ${n.parent}`, node:n, action:()=>onPickNode(n) });
    }
    if (!q) return out.slice(0, 30);
    const ql = q.toLowerCase();
    return out.filter(it => (it.label+(it.sub||"")).toLowerCase().includes(ql)).slice(0, 40);
  }, [q]);

  useEffect(()=>{ setHi(0); }, [q]);
  useEffect(()=>{
    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setHi(h=>Math.min(items.length-1,h+1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setHi(h=>Math.max(0,h-1)); }
      if (e.key === "Enter")     { e.preventDefault(); items[hi]?.action(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, hi]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="cmdk" onClick={e=>e.stopPropagation()}>
        <div className="cmdk-head">
          <input ref={inputRef} className="cmdk-input" placeholder="搜尋條文 · 城市 · 情境⋯⋯" value={q} onChange={e=>setQ(e.target.value)} />
          <kbd>ESC</kbd>
        </div>
        <div className="cmdk-list">
          {items.map((it, i) => (
            <button key={i} className={`cmdk-item ${i===hi?"on":""}`} onMouseEnter={()=>setHi(i)} onClick={it.action}>
              <span className="cmdk-kind mono">{({view:"頁",scenario:"情境",node:"條文"}[it.kind])}</span>
              <span className="cmdk-label">{it.label}</span>
              {it.sub && <span className="cmdk-sub mono">{it.sub}</span>}
            </button>
          ))}
          {items.length === 0 && <div className="empty small">沒有結果。</div>}
        </div>
        <div className="cmdk-foot mono">
          <span>↑↓ 選擇</span><span>↵ 開啟</span><span>esc 關閉</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mount ───
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
