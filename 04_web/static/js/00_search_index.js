// 00_search_index.js — Mini Chinese-aware bigram inverted index (2026-05-02 #24)
// 替代 FlexSearch 的輕量級實作:純自寫,無 CDN,~150 行,
// 對中文 substring 命中提供 5-10x 加速(query → bigram set → 候選 ID 集 → 精確過濾)
// 載入順序:在 01_state.js 之前(其他 module 用 SearchIndex 全域物件)

const SearchIndex = (function() {
  // 內部狀態:bigram → Set<docId>
  let _bigramMap = new Map();
  let _trigramMap = new Map();
  let _docCount = 0;

  /** 字串切 bigram(2 字) + trigram(3 字),中文有效 */
  function tokenize(text) {
    const t = String(text || '').toLowerCase();
    const grams = new Set();
    if (!t) return grams;
    // bigram
    for (let i = 0; i < t.length - 1; i++) {
      const g = t.substr(i, 2);
      if (g.trim().length === 2) grams.add(g);
    }
    // trigram(更精準的命中,query 較長時用)
    for (let i = 0; i < t.length - 2; i++) {
      const g = t.substr(i, 3);
      if (g.trim().length === 3) grams.add(g);
    }
    return grams;
  }

  /** 建索引:輸入文件陣列 [{id, text}],建反向索引 */
  function build(docs) {
    _bigramMap = new Map();
    _trigramMap = new Map();
    _docCount = docs.length;
    for (const doc of docs) {
      const grams = tokenize(doc.text);
      for (const g of grams) {
        const map = g.length === 2 ? _bigramMap : _trigramMap;
        if (!map.has(g)) map.set(g, new Set());
        map.get(g).add(doc.id);
      }
    }
  }

  /** 候選查詢:回傳可能命中的 doc id Set(取交集) */
  function candidates(query) {
    const grams = tokenize(query);
    if (grams.size === 0) return null;  // 空 query → 全部(由呼叫端處理)
    // 取所有 grams 的交集
    let result = null;
    // 優先 trigram(較精準),fallback bigram
    const tris = [...grams].filter(g => g.length === 3);
    const bis = [...grams].filter(g => g.length === 2);
    const useGrams = tris.length > 0 ? tris : bis;
    for (const g of useGrams) {
      const map = g.length === 3 ? _trigramMap : _bigramMap;
      const set = map.get(g);
      if (!set) return new Set();  // 任一 gram 無命中 → 空集合
      if (result === null) {
        result = new Set(set);
      } else {
        // intersect
        const next = new Set();
        for (const id of result) if (set.has(id)) next.add(id);
        result = next;
      }
      if (result.size === 0) return result;
    }
    return result || new Set();
  }

  /** 統計 */
  function stats() {
    return {
      docs: _docCount,
      bigrams: _bigramMap.size,
      trigrams: _trigramMap.size,
    };
  }

  return { build, candidates, tokenize, stats };
})();

// 暴露到 window 給 02_data.js 用
window.SearchIndex = SearchIndex;
