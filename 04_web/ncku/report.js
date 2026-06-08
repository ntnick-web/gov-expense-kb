// report.js — 國科會出差旅費報告表（嵌入 P01 ncku/ 版）
// 依賴: ../static/js/allowance-data.js (CITY_TREE, CITY_RATES, getDailyRate, buildCityOptions)

// ═══════════════ 工具函式 ═══════════════════════════════════════════════════

function toRocDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const year = d.getFullYear() - 1911;
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}年${month}月${day}日`;
}
function getMonthFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d) ? '' : String(d.getMonth() + 1);
}
function getDayFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d) ? '' : String(d.getDate());
}
function calcTripDays(startStr, endStr) {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr), end = new Date(endStr);
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    return Math.round((end - start) / 86400000) + 1;
}
function getDateRange(startStr, endStr) {
    const dates = [];
    if (!startStr || !endStr) return dates;
    const start = new Date(startStr), end = new Date(endStr);
    if (isNaN(start) || isNaN(end)) return dates;
    const cur = new Date(start);
    while (cur <= end) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
    return dates;
}
function fmt(val) { const n = Number(val); if (!n) return ''; return n.toLocaleString('zh-TW'); }
function parseCurrency(str) { if (!str) return 0; return Number(String(str).replace(/,/g, '')) || 0; }
function toChineseAmount(num) {
    const n = Math.round(Number(num));
    if (isNaN(n) || n === 0) return '零元整';
    if (n < 0) return '負' + toChineseAmount(-n);
    const digits = ['零','壹','貳','參','肆','伍','陸','柒','捌','玖'];
    const groupUnits = ['','萬','億'];
    function convertGroup(g) {
        if (g === 0) return '';
        const d4 = [Math.floor(g/1000),Math.floor((g%1000)/100),Math.floor((g%100)/10),g%10];
        const u4 = ['仟','佰','拾',''];
        let s='',prevZero=false;
        for (let i=0;i<4;i++){if(d4[i]===0){if(s.length>0)prevZero=true;}else{if(prevZero){s+='零';prevZero=false;}s+=digits[d4[i]]+u4[i];}}
        return s;
    }
    const groups=[Math.floor(n/100000000),Math.floor((n%100000000)/10000),n%10000];
    let result='',prevWasZeroGroup=false;
    for(let i=0;i<3;i++){if(groups[i]===0){if(result.length>0)prevWasZeroGroup=true;continue;}if(result.length>0&&(prevWasZeroGroup||groups[i]<1000))result+='零';prevWasZeroGroup=false;result+=convertGroup(groups[i])+groupUnits[2-i];}
    return result+'元整';
}
function paginateEntries(entries) {
    const pages=[];
    for(let i=0;i<entries.length;i+=7)pages.push(entries.slice(i,i+7));
    if(pages.length===0)pages.push([]);
    return pages;
}
function calcLivingFee(usdRate,exchangeRate,{hasLodging,hasBreakfast,hasLunch,hasDinner}) {
    if(!usdRate||!exchangeRate)return 0;
    const basePct=hasLodging?30:100;
    const mealPct=(hasBreakfast?4:0)+(hasLunch?8:0)+(hasDinner?8:0);
    const finalPct=Math.max(0,basePct-mealPct);
    const raw=Math.round(usdRate*exchangeRate*finalPct/100*1e4)/1e4;
    return Math.round(raw);
}
function livingFeeNote(usdRate,exchangeRate,{hasLodging,hasBreakfast,hasLunch,hasDinner}) {
    if(!usdRate||!exchangeRate)return '';
    const basePct=hasLodging?30:100;
    const mealPct=(hasBreakfast?4:0)+(hasLunch?8:0)+(hasDinner?8:0);
    const finalPct=Math.max(0,basePct-mealPct);
    const factorStr=mealPct>0?`(${basePct}%-${mealPct}%)=${finalPct}%`:`${finalPct}%`;
    return `$${usdRate}×${exchangeRate}×${factorStr}`;
}
function sumField(entries,field){return entries.reduce((s,e)=>s+parseCurrency(e[field]||0),0);}
const EXPENSE_FIELDS=['airfare','ship','ground','living','handling','insurance','admin','gifts'];
function dayTotal(entry){return EXPENSE_FIELDS.reduce((s,f)=>s+parseCurrency(entry[f]||0),0);}
function pageTotal(entries){return entries.reduce((s,e)=>s+dayTotal(e),0);}

// ═══════════════ 表單狀態管理 ══════════════════════════════════════════════

const STORAGE_KEY='ncku_travel_form_v1';
const defaultEntry=()=>({
    month:'',day:'',location:'',workNote:'',
    airfare:'',ship:'',ground:'',living:'',
    handling:'',insurance:'',admin:'',gifts:'',
    cityKey:'',hasLodging:false,hasBreakfast:false,
    hasLunch:false,hasDinner:false,specialDay:'none',livingLocked:false,
});
let formData={
    accountingNumber:'',name:'',title:'',grade:'',
    tripReason:'',startDate:'',endDate:'',
    bankCode:'',bankAccount:'',remarks:'',
    declarationType:'1',traveler:'',phone:'',
    usesForeignAirline:false,exchangeRate:'',defaultCityKey:'',
    dailyEntries:[],
    lastStep:1,  // M9：記住最後一步，匯入備份後從此步恢復
};
function loadFromStorage(){
    try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)formData=Object.assign({},formData,JSON.parse(saved));}
    catch(e){}
}
let _saveTimer=null;
function saveToStorage(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(formData));_showSaveStatus('ok');}
    catch(e){_showSaveStatus('error');}
}
function _showSaveStatus(type){
    const el=document.getElementById('save-indicator');if(!el)return;
    clearTimeout(_saveTimer);
    if(type==='ok'){
        const now=new Date();
        el.textContent=`已儲存 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        el.className='save-indicator save-ok';
        _saveTimer=setTimeout(()=>{el.textContent='';el.className='save-indicator';},4000);
    }else{
        el.textContent='⚠ 儲存失敗（可能為私密模式）';
        el.className='save-indicator save-error';
    }
}
function clearStorage(){try{localStorage.removeItem(STORAGE_KEY);}catch(e){}}

// L9：匯出後在按鈕顯示「✓ 已匯出」回饋
function exportFormData(){
    const name=formData.name||'未命名';
    const date=formData.startDate||'unknown';
    const blob=new Blob([JSON.stringify(formData,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`旅費草稿_${name}_${date}.json`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    const btn=document.getElementById('btnExport');
    if(btn){const orig=btn.textContent;btn.textContent='✓ 已匯出';btn.disabled=true;
        setTimeout(()=>{btn.textContent=orig;btn.disabled=false;},2000);}
}

function importFormData(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=function(e){
        try{
            const data=JSON.parse(e.target.result);
            if(!data.name&&!data.startDate)throw new Error('格式不符');
            formData=Object.assign({},formData,data);
            saveToStorage();
            restoreStep1Fields();
            showStep(1);  // 匯入後回 Step 1，讓使用者點「下一步」重建表格
            alert(`已成功匯入「${data.name||'未命名'}」的旅費草稿。`);
        }catch(err){alert('匯入失敗：請選擇由本系統匯出的 JSON 檔。');}
    };
    reader.readAsText(file,'utf-8');
}
function rebuildEntries(startDate,endDate){
    const dates=getDateRange(startDate,endDate);
    const old=formData.dailyEntries||[];
    const lastIdx=dates.length-1;
    formData.dailyEntries=dates.map((dateStr,i)=>{
        const d=new Date(dateStr);
        const base=i<old.length?Object.assign({},old[i]):defaultEntry();
        base.month=String(d.getMonth()+1);base.day=String(d.getDate());base._dateStr=dateStr;
        base.cityKey=formData.defaultCityKey||base.cityKey||'';
        if(i===lastIdx){base.specialDay='return';base.hasLodging=true;}
        return base;
    });
}
function collectStep1(){
    formData.accountingNumber=v('accountingNumber');
    formData.name=v('name');formData.title=v('title');formData.grade=v('grade');
    formData.tripReason=v('tripReason');
    formData.startDate=v('startDate');formData.endDate=v('endDate');
    formData.bankCode=v('bankCode');formData.bankAccount=v('bankAccount');
    formData.remarks=v('remarks');formData.traveler=v('traveler');formData.phone=v('phone');
    formData.usesForeignAirline=document.getElementById('usesForeignAirline')?.checked||false;
    formData.exchangeRate=v('exchangeRate');
    const cityComboEl=document.getElementById('defaultCityKey');
    formData.defaultCityKey=cityComboEl?cityComboEl.value:'';
}
function collectStep2(){
    const rows=document.querySelectorAll('#view-report .day-row');
    rows.forEach((row,i)=>{
        if(!formData.dailyEntries[i])formData.dailyEntries[i]=defaultEntry();
        ['location','workNote','airfare','ship','ground','living','handling','insurance','admin','gifts'].forEach(field=>{
            const el=row.querySelector(`[data-field="${field}"]`);if(el)formData.dailyEntries[i][field]=el.value;
        });
        const cityEl=row.querySelector('[data-field="cityKey"]');if(cityEl)formData.dailyEntries[i].cityKey=cityEl.value;
        ['hasLodging','hasBreakfast','hasLunch','hasDinner'].forEach(f=>{
            const el=row.querySelector(`[data-field="${f}"]`);if(el)formData.dailyEntries[i][f]=el.checked;
        });
        const specialEl=row.querySelector('[data-field="specialDay"]');if(specialEl)formData.dailyEntries[i].specialDay=specialEl.value;
        const lockedEl=row.querySelector('[data-field="livingLocked"]');if(lockedEl)formData.dailyEntries[i].livingLocked=lockedEl.dataset.locked==='true';
    });
}
function collectStep3(){
    const radios=document.querySelectorAll('#view-report input[name="declarationType"]');
    radios.forEach(r=>{if(r.checked)formData.declarationType=r.value;});
}
function v(id){const el=document.getElementById(id);return el?el.value.trim():'';}
function getGrandTotal(){return(formData.dailyEntries||[]).reduce((s,e)=>s+dayTotal(e),0);}
function getFieldTotals(){const totals={};EXPENSE_FIELDS.forEach(f=>{totals[f]=sumField(formData.dailyEntries||[],f);});totals.grand=getGrandTotal();return totals;}

// ═══════════════ 步驟導航 ══════════════════════════════════════════════════

let currentStep=1;

// M9：showStep 同時記住 lastStep，供備份還原使用
function showStep(step){
    currentStep=step;
    formData.lastStep=step;
    document.querySelectorAll('#view-report .section-card').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('#view-report .rpt-step').forEach(el=>{
        el.classList.remove('active','done');
        const n=parseInt(el.dataset.step);
        if(n<step)el.classList.add('done');
        else if(n===step)el.classList.add('active');
    });
    const card=document.getElementById(`step${step}`);
    if(card){
        card.classList.add('active');
        const view=document.getElementById('view-report');
        if(view&&!view.classList.contains('hidden'))card.scrollIntoView({behavior:'smooth',block:'start'});
    }
}

// P1-A：匯率超出範圍改為阻擋式錯誤（不讓使用者帶錯誤值進 Step 2）
function validateStep1(){
    let ok=true;
    const required=[
        {id:'name',msg:'請填寫姓名'},
        {id:'tripReason',msg:'請填寫出差事由'},
        {id:'startDate',msg:'請選擇出差起始日期'},
        {id:'endDate',msg:'請選擇出差結束日期'},
    ];
    required.forEach(({id,msg})=>{
        const el=document.getElementById(id);
        const group=el?.closest('.rpt-form-group');
        const errEl=group?.querySelector('.error-msg');
        if(!el?.value.trim()){ok=false;group?.classList.add('has-error');if(errEl)errEl.textContent=msg;}
        else{group?.classList.remove('has-error');}
    });
    const s=document.getElementById('startDate')?.value;
    const e=document.getElementById('endDate')?.value;
    if(s&&e&&e<s){
        ok=false;
        const group=document.getElementById('endDate')?.closest('.rpt-form-group');
        const errEl=group?.querySelector('.error-msg');
        group?.classList.add('has-error');
        if(errEl)errEl.textContent='結束日期不可早於起始日期';
    }
    // P1-A：阻擋式匯率錯誤
    const rateEl=document.getElementById('exchangeRate');
    const rateWarn=document.getElementById('exchangeRateWarn');
    if(rateEl&&rateWarn){
        const r=parseFloat(rateEl.value);
        if(rateEl.value&&(r<20||r>50)){
            ok=false;
            rateWarn.textContent=`⚠ 匯率 ${r} 超出常見範圍（USD→TWD 通常為 20–50），請確認填入「現金賣出匯率」後再繼續`;
            rateWarn.style.display='block';
            rateEl.closest('.rpt-form-group')?.classList.add('has-error');
        }else{
            rateWarn.style.display='none';
            rateEl.closest('.rpt-form-group')?.classList.remove('has-error');
        }
    }
    return ok;
}

function buildDayTable(){
    collectStep1();
    rebuildEntries(formData.startDate,formData.endDate);
    saveToStorage();

    const container=document.getElementById('dayTableContainer');

    document.getElementById('tripSummaryText').innerHTML=
        `<strong>${formData.name}</strong> 出差
         <strong>${toRocDate(formData.startDate)}</strong> 至
         <strong>${toRocDate(formData.endDate)}</strong>，共
         <strong style="color:var(--brand);">${formData.dailyEntries.length}</strong> 天`;

    const infoFields=[
        {key:'location',label:'起訖地點',type:'text',width:'90px'},
        {key:'workNote',label:'工作記要',type:'text',width:'110px'},
    ];

    // M7：外籍航空提醒延續到 Step 2
    const foreignBanner=formData.usesForeignAirline
        ?`<div class="rpt-inline-warn">⚠ 已勾選搭乘外籍航空，記得在 Step 4 填寫並檢附<strong>表03 外籍航空申請書</strong>。</div>`:'';

    const missingRate=!formData.exchangeRate;
    const missingCity=!formData.defaultCityKey;
    const warningBanner=(missingRate||missingCity)?`
      <div class="rpt-rate-missing-banner">
        ⚠ ${missingRate?'未填寫匯率':''}${missingRate&&missingCity?'、':''}${missingCity?'未選擇預設城市':''}，生活費無法自動計算。
        <button onclick="showStep(1)" style="margin-left:8px;padding:2px 10px;cursor:pointer;">返回填寫</button>
      </div>`:'';

    // P4-A：全程套用快捷列
    const batchBar=`<div class="rpt-batch-bar">
      <span class="rpt-batch-label">全程套用：</span>
      <label class="rpt-batch-item"><input type="checkbox" class="rpt-batch-chk" data-batch="hasLodging" onchange="onBatchApply(this)"> 供宿</label>
      <label class="rpt-batch-item"><input type="checkbox" class="rpt-batch-chk" data-batch="hasBreakfast" onchange="onBatchApply(this)"> 早餐</label>
      <label class="rpt-batch-item"><input type="checkbox" class="rpt-batch-chk" data-batch="hasLunch" onchange="onBatchApply(this)"> 午餐</label>
      <label class="rpt-batch-item"><input type="checkbox" class="rpt-batch-chk" data-batch="hasDinner" onchange="onBatchApply(this)"> 晚餐</label>
      <span class="rpt-batch-hint">（勾選後一鍵套用至所有天，再逐日微調）</span>
    </div>`;

    const scrollHint=`<div class="rpt-scroll-hint">← 左右滑動查看所有欄位 →</div>`;

    let html=foreignBanner+warningBanner+batchBar+scrollHint+`<div class="rpt-day-table-wrap"><table class="rpt-day-table">
    <thead>
      <tr class="rpt-group-hdr">
        <th>日期</th>
        <th colspan="2">基本資訊</th>
        <th colspan="3">交通費</th>
        <th colspan="5" class="rpt-living-hdr-group">生活費自動計算</th>
        <th colspan="3">辦公費</th>
        <th>禮品雜費</th>
        <th>日小計</th>
      </tr>
      <tr>
        <th style="min-width:55px;">日期</th>
        ${infoFields.map(f=>`<th style="min-width:${f.width};">${f.label}</th>`).join('')}
        <th style="min-width:65px;">飛機費</th>
        <th style="min-width:55px;">船舶</th>
        <th style="min-width:65px;">長途陸運</th>
        <th style="min-width:150px;" class="rpt-living-hdr">城市搜尋</th>
        <th style="min-width:95px;" class="rpt-living-hdr">供宿<br><span style="font-size:9px;font-weight:400;">✈=機上過夜</span></th>
        <th style="min-width:115px;" class="rpt-living-hdr">供餐（外方提供請勾選）<br><span style="font-size:9px;font-weight:400;">早4% / 午8% / 晚8%</span></th>
        <th style="min-width:75px;" class="rpt-living-hdr">生活費<br><span style="font-weight:400;font-size:10px;">（自動/手填）</span></th>
        <th style="min-width:120px;" class="rpt-living-hdr">計算依據</th>
        <th style="min-width:60px;">手續費</th>
        <th style="min-width:60px;">保險費</th>
        <th style="min-width:60px;">行政費</th>
        <th style="min-width:65px;">禮品雜費</th>
        <th style="min-width:65px;">小計</th>
      </tr>
    </thead>
    <tbody>`;

    if(formData.defaultCityKey&&CITY_RATES[formData.defaultCityKey]){
        const cityName=CITY_RATES[formData.defaultCityKey].name;
        html=html.replace(scrollHint,scrollHint+
            `<div class="rpt-city-preset-hint">所有日期已預設套用城市「${cityName}」。多城市行程可在各列單獨修改。</div>`);
    }

    formData.dailyEntries.forEach((entry,i)=>{
        const dateLabel=`${entry.month}/${entry.day}`;
        const dateStr=entry._dateStr||'';
        const cityKey=entry.cityKey||formData.defaultCityKey||'';
        const isReturn=entry.specialDay==='return';
        const isAirplane=entry.specialDay==='airplane';
        const specialTag=isReturn
            ?'<span class="rpt-special-tag rpt-return-tag" title="回國當天依規定視為供宿（30%基礎）">回國</span>'
            :isAirplane?'<span class="rpt-special-tag rpt-plane-tag" title="機上過夜視為供宿（30%基礎）">機上</span>':'';

        html+=`<tr class="day-row${isReturn?' rpt-row-return':''}${isAirplane?' rpt-row-airplane':''}" data-idx="${i}" data-date="${dateStr}">
      <td class="rpt-date-cell">${dateLabel}${specialTag}</td>`;

        infoFields.forEach(f=>{
            // L1：workNote 改用 placeholder，不預填「如事由」
            // location 空白時自動帶入城市名稱
            const cityName=cityKey&&CITY_RATES[cityKey]?CITY_RATES[cityKey].name:'';
            const val=entry[f.key]||(f.key==='location'?cityName:'');
            const ph=f.key==='workNote'?'如事由':f.label;
            html+=`<td><input type="${f.type}" data-field="${f.key}" value="${val}"
              placeholder="${ph}" oninput="onExpenseInput(this)"></td>`;
        });

        ['airfare','ship','ground'].forEach(k=>{
            html+=`<td><input type="number" data-field="${k}" value="${entry[k]||''}"
              min="0" placeholder="0" oninput="onExpenseInput(this)"></td>`;
        });

        html+=`<td class="rpt-living-cell">
          <div class="city-combo-wrap">
            <input type="text" class="city-search-inp"
              placeholder="城市搜尋…" autocomplete="off"
              value="${cityKey&&CITY_RATES[cityKey]?CITY_RATES[cityKey].name:''}"
              oninput="onCitySearch(this)" onfocus="this.select()">
            <select class="city-select" data-field="cityKey" onchange="onCitySelectChange(this)">
              ${buildCityOptions(cityKey)}
            </select>
          </div>
        </td>`;

        const lodgingChecked=entry.hasLodging?'checked':'';
        html+=`<td class="rpt-living-cell rpt-center rpt-lodging-cell">
          <label class="rpt-lodging-label">
            <input type="checkbox" data-field="hasLodging" ${lodgingChecked}
              onchange="onLodgingChange(this)"> 供宿
          </label>
          <button class="rpt-airplane-btn${isAirplane?' active':''}"
            onclick="toggleAirplane(this)"
            title="標記機上過夜（視為供宿，係數30%）">✈ 機上</button>
          <input type="hidden" data-field="specialDay" value="${entry.specialDay}">
        </td>`;

        html+=`<td class="rpt-living-cell rpt-center">
          <label class="rpt-meal-chk"><input type="checkbox" data-field="hasBreakfast" ${entry.hasBreakfast?'checked':''} onchange="onLivingChange(this)">早</label>
          <label class="rpt-meal-chk"><input type="checkbox" data-field="hasLunch" ${entry.hasLunch?'checked':''} onchange="onLivingChange(this)">午</label>
          <label class="rpt-meal-chk"><input type="checkbox" data-field="hasDinner" ${entry.hasDinner?'checked':''} onchange="onLivingChange(this)">晚</label>
        </td>`;

        const locked=!!entry.livingLocked;
        const autoVal=autoCalcLiving(entry,dateStr);
        if(!locked&&autoVal)entry.living=String(autoVal);
        const displayVal=entry.living||(autoVal?String(autoVal):'');
        html+=`<td class="rpt-living-cell rpt-living-input-cell">
          <input type="number" data-field="living" value="${displayVal}"
            min="0" placeholder="0"
            class="rpt-living-inp${locked?' locked':''}"
            oninput="onLivingManualEdit(this)"
            title="${locked?'手動覆蓋（點🔄重設）':'自動計算（可手動修改為較低金額）'}">
          <button class="rpt-living-reset-btn" onclick="resetLiving(this)" title="重設為自動計算值"
            style="${locked?'':'display:none'}">🔄 重設</button>
          <input type="hidden" data-field="livingLocked" data-locked="${locked}">
        </td>`;

        const exRate=parseFloat(formData.exchangeRate)||0;
        const usd=getDailyRate(cityKey,dateStr);
        const noteText=(usd&&exRate)?livingFeeNote(usd,exRate,entry):'—';
        const noteTitle=(usd&&exRate)?`日支數額$${usd}×匯率${exRate}×折扣=${noteText}`:'未設定城市或匯率';
        html+=`<td class="rpt-living-cell rpt-note-cell" id="livingNote_${i}" title="${noteTitle}">
          <span class="rpt-living-note">${noteText}</span>
        </td>`;

        ['handling','insurance','admin','gifts'].forEach(k=>{
            html+=`<td><input type="number" data-field="${k}" value="${entry[k]||''}"
              min="0" placeholder="0" oninput="onExpenseInput(this)"></td>`;
        });

        html+=`<td class="rpt-row-total" id="rowTotal_${i}">0</td></tr>`;
    });

    // L5：說明回國標籤含義
    html+=`</tbody></table></div>
    <p class="rpt-page-notice">每頁顯示 7 天，列印時自動分頁。<span style="color:var(--ok);">■</span>綠底=自動計算；<span style="color:var(--warn);">■</span>黃底=手動覆蓋。外方供餐請勾選相應項目。<br>
    <span class="rpt-return-tag" style="display:inline-block;font-size:9px;padding:0 3px;border-radius:3px;margin-right:2px;">回國</span>回國當天依法規自動標記供宿（30%）；如有外方供餐請在該日補勾。</p>`;

    container.innerHTML=html;
    updateAllRowTotals();
}

function onCitySelectStep1(sel){
    const wrap=sel.closest('.city-combo-wrap');
    if(wrap){const inp=wrap.querySelector('.city-search-inp');if(inp){const city=CITY_RATES[sel.value];inp.value=city?city.name:'';}}
    saveToStorage();
}
function onCitySelectChange(sel){
    const wrap=sel.closest('.city-combo-wrap');
    const row=sel.closest('.day-row');
    if(wrap){const searchInp=wrap.querySelector('.city-search-inp');if(searchInp){const city=CITY_RATES[sel.value];searchInp.value=city?city.name:'';}}
    // 城市變動時同步更新起訖地點
    if(row&&CITY_RATES[sel.value]){
        const locInp=row.querySelector('[data-field="location"]');
        if(locInp)locInp.value=CITY_RATES[sel.value].name;
    }
    onLivingChange(sel);
}
function toggleAirplane(btn){
    const row=btn.closest('.day-row');const idx=parseInt(row.dataset.idx);
    const entry=formData.dailyEntries[idx];if(!entry)return;
    const specialEl=row.querySelector('[data-field="specialDay"]');
    const lodgingCb=row.querySelector('[data-field="hasLodging"]');
    const isOn=entry.specialDay==='airplane';
    if(isOn){entry.specialDay='none';btn.classList.remove('active');}
    else{entry.specialDay='airplane';btn.classList.add('active');if(lodgingCb){lodgingCb.checked=true;entry.hasLodging=true;}}
    if(specialEl)specialEl.value=entry.specialDay;
    const dateCell=row.querySelector('.rpt-date-cell');
    if(dateCell){
        const base=`${entry.month}/${entry.day}`;
        const tag=entry.specialDay==='return'?'<span class="rpt-special-tag rpt-return-tag">回國</span>':entry.specialDay==='airplane'?'<span class="rpt-special-tag rpt-plane-tag">機上</span>':'';
        dateCell.innerHTML=base+tag;
    }
    onLivingChange(btn);
}
function autoCalcLiving(entry,dateStr){
    const rate=parseFloat(formData.exchangeRate)||0;if(!rate)return 0;
    const cityKey=entry.cityKey||formData.defaultCityKey||'';if(!cityKey)return 0;
    const usd=getDailyRate(cityKey,dateStr||entry._dateStr||'');if(!usd)return 0;
    return calcLivingFee(usd,rate,entry);
}
function refreshLivingCell(row,idx){
    const entry=formData.dailyEntries[idx];if(!entry)return;
    const dateStr=row.dataset.date||'';
    const autoVal=autoCalcLiving(entry,dateStr);
    const inp=row.querySelector('[data-field="living"]');
    const noteEl=document.getElementById(`livingNote_${idx}`);
    const resetBtn=row.querySelector('.rpt-living-reset-btn');
    if(!entry.livingLocked){
        if(inp){inp.value=autoVal||'';inp.classList.remove('locked');entry.living=autoVal?String(autoVal):'';}
        if(resetBtn)resetBtn.style.display='none';
    }
    const cityKey=entry.cityKey||formData.defaultCityKey||'';
    const exRate=parseFloat(formData.exchangeRate)||0;
    const usd=getDailyRate(cityKey,dateStr);
    const note=(usd&&exRate)?livingFeeNote(usd,exRate,entry):'—';
    const fullTitle=(usd&&exRate)?`日支數額$${usd}×匯率${exRate}×折扣=${note}`:'未設定城市或匯率';
    if(noteEl){noteEl.innerHTML=`<span class="rpt-living-note">${note}</span>`;noteEl.title=fullTitle;}
}
function onExpenseInput(el){const row=el.closest('.day-row');const idx=parseInt(row.dataset.idx);collectRowData(row,idx);updateRowTotal(idx);saveToStorage();}
function onLivingChange(el){const row=el.closest('.day-row');const idx=parseInt(row.dataset.idx);collectRowData(row,idx);refreshLivingCell(row,idx);updateRowTotal(idx);saveToStorage();}

// P2-A：改用 rptConfirm 取代 window.confirm()
function onLodgingChange(el){
    const row=el.closest('.day-row');const idx=parseInt(row.dataset.idx);
    const entry=formData.dailyEntries[idx];
    const specialHidden=row.querySelector('[data-field="specialDay"]');
    if(!el.checked){
        const isReturn=(specialHidden?.value==='return');
        if(isReturn){
            el.checked=true;  // 先恢復，等使用者確認
            rptConfirm(
                '回國當天依行政院規定視為供宿（生活費取 30% 基礎計算）。\n\n取消後將以未供宿（100%）計算，可能導致金額超出規定上限。\n\n確定要取消供宿嗎？',
                ()=>{
                    el.checked=false;
                    if(specialHidden)specialHidden.value='none';
                    if(entry)entry.specialDay='none';
                    onLivingChange(el);
                }
            );
            return;
        }
        if(specialHidden)specialHidden.value='none';
        if(entry)entry.specialDay='none';
    }
    onLivingChange(el);
}
function onLivingManualEdit(el){
    const row=el.closest('.day-row');const idx=parseInt(row.dataset.idx);
    const entry=formData.dailyEntries[idx];if(!entry)return;
    entry.livingLocked=true;entry.living=el.value;el.classList.add('locked');
    const resetBtn=row.querySelector('.rpt-living-reset-btn');if(resetBtn)resetBtn.style.display='';
    const lockedHidden=row.querySelector('[data-field="livingLocked"]');if(lockedHidden)lockedHidden.dataset.locked='true';
    updateRowTotal(idx);saveToStorage();
}
function resetLiving(btn){
    const row=btn.closest('.day-row');const idx=parseInt(row.dataset.idx);
    const entry=formData.dailyEntries[idx];if(!entry)return;
    entry.livingLocked=false;
    const lockedHidden=row.querySelector('[data-field="livingLocked"]');if(lockedHidden)lockedHidden.dataset.locked='false';
    refreshLivingCell(row,idx);updateRowTotal(idx);saveToStorage();
}
function collectRowData(row,idx){
    if(!formData.dailyEntries[idx])return;
    const entry=formData.dailyEntries[idx];
    ['location','workNote','airfare','ship','ground','living','handling','insurance','admin','gifts'].forEach(field=>{
        const el=row.querySelector(`[data-field="${field}"]`);if(el)entry[field]=el.value;
    });
    const cityEl=row.querySelector('.city-select[data-field="cityKey"]');if(cityEl)entry.cityKey=cityEl.value;
    ['hasLodging','hasBreakfast','hasLunch','hasDinner'].forEach(f=>{
        const el=row.querySelector(`[data-field="${f}"]`);if(el)entry[f]=el.checked;
    });
    const specialEl=row.querySelector('[data-field="specialDay"]');if(specialEl)entry.specialDay=specialEl.value;
}
function updateRowTotal(idx){
    const entry=formData.dailyEntries[idx];if(!entry)return;
    const total=dayTotal(entry);
    const el=document.getElementById(`rowTotal_${idx}`);
    if(el)el.textContent=total?total.toLocaleString('zh-TW'):'0';
}
function updateAllRowTotals(){formData.dailyEntries.forEach((_,i)=>updateRowTotal(i));}

// P1-B：有勾選供宿/供餐時，自動高亮申報聲明選項二
function buildSummary(){
    collectStep2();saveToStorage();
    const totals=getFieldTotals();
    const grandTotal=totals.grand;
    const pages=paginateEntries(formData.dailyEntries);

    document.getElementById('sumGrand').textContent=grandTotal?grandTotal.toLocaleString('zh-TW')+' 元':'0 元';
    document.getElementById('sumChinese').textContent=toChineseAmount(grandTotal);
    document.getElementById('sumDays').textContent=formData.dailyEntries.length+' 天';
    document.getElementById('sumPages').textContent=pages.length+' 頁（費用表含簽核）';

    const exRate=parseFloat(formData.exchangeRate)||0;
    let livingRows=formData.dailyEntries.map(entry=>{
        const cityKey=entry.cityKey||'';
        const city=CITY_RATES[cityKey];
        const usd=getDailyRate(cityKey,entry._dateStr||'');
        const note=(usd&&exRate)?livingFeeNote(usd,exRate,entry):'—';
        const meals=[entry.hasBreakfast?'早':'',entry.hasLunch?'午':'',entry.hasDinner?'晚':''].filter(Boolean).join('')||'—';
        const livingAmt=parseCurrency(entry.living||0);
        const manualMark=entry.livingLocked?'<span style="color:var(--stop);font-size:10px;">※手動</span>':'';
        return `<tr>
            <td style="white-space:nowrap">${entry.month}/${entry.day}</td>
            <td>${city?city.name:'—'}</td>
            <td>${entry.hasLodging?'☑ 供宿':'□ 未供宿'}</td>
            <td>${meals}</td>
            <td style="font-size:11px;white-space:nowrap">${note}</td>
            <td style="text-align:right;font-weight:bold">${livingAmt?livingAmt.toLocaleString('zh-TW'):'0'}</td>
            <td style="text-align:center">${manualMark}</td>
        </tr>`;
    }).join('');
    const livingTotal=sumField(formData.dailyEntries,'living');
    const detailEl=document.getElementById('livingDetailBody');
    const totalEl=document.getElementById('livingDetailTotal');
    if(detailEl)detailEl.innerHTML=livingRows;
    if(totalEl)totalEl.textContent=livingTotal?livingTotal.toLocaleString('zh-TW'):'0';

    // 恢復選擇的申報聲明
    const saved=formData.declarationType||'1';
    const radio=document.querySelector(`#view-report input[name="declarationType"][value="${saved}"]`);
    if(radio){radio.checked=true;radio.closest('.rpt-radio-option')?.classList.add('selected');}

    // P1-B：偵測到供宿/供餐，提示確認聲明選項
    const hasMealsOrLodging=formData.dailyEntries.some(e=>e.hasLodging||e.hasBreakfast||e.hasLunch||e.hasDinner);
    const declHint=document.getElementById('declHint');
    if(declHint){
        declHint.style.display=hasMealsOrLodging?'block':'none';
    }

    // M7：Step 3 也顯示外籍航空提醒
    const foreignHint=document.getElementById('step3ForeignHint');
    if(foreignHint)foreignHint.style.display=formData.usesForeignAirline?'block':'none';
}
function toggleLivingDetail(){
    const detail=document.getElementById('livingDetailTable');
    const btn=document.getElementById('toggleDetailBtn');
    if(!detail)return;
    const isOpen=detail.style.display!=='none';
    detail.style.display=isOpen?'none':'';
    if(btn)btn.textContent=isOpen?'▶ 展開逐日生活費計算明細':'▼ 收合';
}
function buildPrintStep(){
    collectStep3();saveToStorage();
    const warn=document.getElementById('foreignWarn');
    if(warn)warn.classList.toggle('show',!!formData.usesForeignAirline);
}
function printForm01(){collectStep2();collectStep3();const html=generateForm01(formData);openPrintWindow(html);}
function printChecklist(){const html=generateChecklist(formData);openPrintWindow(html);}

// M10：列印被封鎖時給出更清楚的解決說明
function openPrintWindow(html){
    const win=window.open('','_blank');
    if(!win){
        alert('列印視窗被封鎖。\n\n解決方式：\n1. 在網址列尋找「彈出視窗被封鎖」提示，點選「一律允許」\n2. Safari：設定 → 進階 → 關閉「封鎖彈出視窗」\n3. 如仍無法開啟，建議改用 Chrome 瀏覽器');
        return;
    }
    win.document.write(html);win.document.close();
}
function onRadioChange(radio){
    document.querySelectorAll('#view-report .rpt-radio-option').forEach(el=>el.classList.remove('selected'));
    radio.closest('.rpt-radio-option')?.classList.add('selected');
    formData.declarationType=radio.value;
}
function restoreStep1Fields(){
    const map={accountingNumber:'accountingNumber',name:'name',title:'title',
        tripReason:'tripReason',startDate:'startDate',endDate:'endDate',
        bankCode:'bankCode',bankAccount:'bankAccount',remarks:'remarks',
        traveler:'traveler',phone:'phone',exchangeRate:'exchangeRate',grade:'grade'};
    Object.entries(map).forEach(([key,id])=>{const el=document.getElementById(id);if(el&&formData[key])el.value=formData[key];});
    const cb=document.getElementById('usesForeignAirline');if(cb)cb.checked=!!formData.usesForeignAirline;
    const cityEl=document.getElementById('defaultCityKey');
    if(cityEl){
        cityEl.innerHTML=buildCityOptions(formData.defaultCityKey||'');
        if(formData.defaultCityKey){
            cityEl.value=formData.defaultCityKey;
            const wrap=cityEl.closest('.city-combo-wrap');
            if(wrap){const searchInp=wrap.querySelector('.city-search-inp');if(searchInp){const city=CITY_RATES[formData.defaultCityKey];searchInp.value=city?city.name:'';}}
        }
    }
}

// ═══════════════ 新功能函式 ══════════════════════════════════════════════════

// P4-B：城市搜尋增強 — 唯一命中時自動選定（覆蓋 allowance-data.js 的版本）
function onCitySearch(input){
    const wrap=input.closest('.city-combo-wrap');if(!wrap)return;
    const sel=wrap.querySelector('.city-select');if(!sel)return;
    const currentVal=sel.value;
    sel.innerHTML=buildCityOptions(currentVal,input.value);
    if(!input.value.trim()){sel.value=currentVal;return;}
    // 唯一命中時自動選定
    const validOpts=Array.from(sel.options).filter(o=>o.value);
    if(validOpts.length===1){
        sel.value=validOpts[0].value;
        sel.dispatchEvent(new Event('change'));
    }
}

// P4-A：全程套用供宿/供餐至所有日期
function onBatchApply(chk){
    const field=chk.dataset.batch;
    const checked=chk.checked;
    formData.dailyEntries.forEach((entry,i)=>{
        entry[field]=checked;
        const row=document.querySelector(`.day-row[data-idx="${i}"]`);
        if(row){
            const el=row.querySelector(`[data-field="${field}"]`);
            if(el){el.checked=checked;}
            refreshLivingCell(row,i);
            updateRowTotal(i);
        }
    });
    saveToStorage();
}

// P2-A：自訂確認 modal，取代阻塞式 window.confirm()
function rptConfirm(msg,onOk){
    const overlay=document.getElementById('rptConfirmOverlay');
    const msgEl=document.getElementById('rptConfirmMsg');
    if(!overlay||!msgEl){if(window.confirm(msg))onOk();return;}
    // 將訊息換行符轉為換行
    msgEl.innerHTML=msg.replace(/\n/g,'<br>');
    overlay.style.display='flex';
    const btnOk=document.getElementById('rptConfirmOk');
    const btnCancel=document.getElementById('rptConfirmCancel');
    const close=(execute)=>{overlay.style.display='none';if(execute)onOk();};
    btnOk.onclick=()=>close(true);
    btnCancel.onclick=()=>close(false);
}

// ═══════════════ 列印生成器 ════════════════════════════════════════════════

function generateForm01(data){
    const entries=data.dailyEntries||[];
    const pages=paginateEntries(entries.length>0?entries:[{}]);
    const totalPages=pages.length;
    const grandTotals={};EXPENSE_FIELDS.forEach(f=>{grandTotals[f]=sumField(entries,f);});
    const grandSum=entries.reduce((s,e)=>s+dayTotal(e),0);
    const dateRange=data.startDate&&data.endDate
        ?`自民國 ${toRocDate(data.startDate)}起至${toRocDate(data.endDate)}止，共 ${calcTripDays(data.startDate,data.endDate)} 日`:'';
    const decl1=data.declarationType!=='2';
    const decl2=data.declarationType==='2';

    let html=`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>國立成功大學出差旅費報告表</title>
<style>
:root{--h-hdr1:7mm;--h-hdr2:5mm;--h-hdr3:6mm;--h-name:10mm;--h-reason:9mm;--h-daterange:11mm;--h-date-info:8mm;--h-expense:8mm;--h-total:8mm;--h-remark:17mm;--h-decl:11mm;--h-amount:11mm;--h-sig-label:6mm;--h-sig:14mm;--h-stamp-label:5mm;--h-stamp:20mm;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'標楷體','DFKai-SB','PMingLiU','細明體',serif;font-size:9pt;background:#fff;}
.print-page{width:175mm;margin:0 auto;padding:3mm 0;page-break-after:always;}
.print-page:last-child{page-break-after:auto;}
.form-title{text-align:center;font-size:18pt;font-weight:bold;letter-spacing:4px;margin-bottom:1mm;}
.page-num{text-align:center;font-size:8pt;margin-bottom:1.5mm;}
table{border-collapse:collapse;width:100%;table-layout:fixed;}
td,th{border:1px solid #000;padding:0.5mm 1mm;vertical-align:middle;font-size:10pt;}
.lbl{font-weight:bold;white-space:nowrap;text-align:center;}
.val{text-align:left;word-break:break-word;overflow-wrap:break-word;white-space:normal;}
.center{text-align:center;}.right{text-align:right;}.bold{font-weight:bold;}
.rotate-text{writing-mode:vertical-rl;text-orientation:mixed;letter-spacing:2px;text-align:center;white-space:nowrap;}
.day-val{text-align:right;}.subtotal-hdr{text-align:center;font-weight:bold;font-size:9pt;}
.small-note{font-size:8pt;}.footer-note{font-size:8pt;margin-top:1.5mm;line-height:1.6;}
.tr-hdr1{height:var(--h-hdr1);}.tr-hdr2{height:var(--h-hdr2);}.tr-hdr3{height:var(--h-hdr3);}
.tr-name{height:var(--h-name);}.tr-reason{height:var(--h-reason);}.tr-daterange{height:var(--h-daterange);}
.tr-date-info{height:var(--h-date-info);}.tr-expense{height:var(--h-expense);}.tr-total{height:var(--h-total);}
.tr-remark{height:var(--h-remark);}.tr-decl{height:var(--h-decl);}.tr-amount{height:var(--h-amount);}
.tr-sig-label{height:var(--h-sig-label);}.tr-sig{height:var(--h-sig);}
.tr-stamp-label{height:var(--h-stamp-label);}.tr-stamp{height:var(--h-stamp);}
@page{size:A4 portrait;margin:5mm 10mm 5mm 25mm;}
@media print{.print-page{margin:0;padding:0;width:100%;}td,th{font-size:9pt;}}
</style></head><body>`;

    pages.forEach((pageDays,pageIdx)=>{
        const isLastPage=(pageIdx===totalPages-1);
        html+=generateOnePage(data,pageDays,pageIdx,totalPages,isLastPage,grandSum,dateRange,decl1,decl2);
    });
    html+=`\n</body>\n</html>`;
    return html;
}

function generateOnePage(data,pageDays,pageIdx,totalPages,isLastPage,grandSum,dateRange,decl1,decl2){
    const N=7;const dayCount=pageDays.length;
    const pageSubtotals={};EXPENSE_FIELDS.forEach(f=>{pageSubtotals[f]=sumField(pageDays,f);});
    const pageTot=pageTotal(pageDays);
    const dayTotals=Array.from({length:N},(_,i)=>i<dayCount?dayTotal(pageDays[i]):0);
    const colgroup=`<colgroup>
      <col class="col-cat" style="width:5.5%"><col class="col-sub" style="width:9.5%">
      <col class="col-day" style="width:10.71%"><col class="col-day" style="width:10.71%"><col class="col-day" style="width:10.71%">
      <col class="col-day" style="width:10.71%"><col class="col-day" style="width:10.71%"><col class="col-day" style="width:10.71%">
      <col class="col-day" style="width:10.71%"><col class="col-tot" style="width:10%">
    </colgroup>`;
    function dayCell(dayIdx,field){if(dayIdx>=dayCount)return`<td class="day-val"></td>`;const val=parseCurrency(pageDays[dayIdx][field]||0);return`<td class="day-val">${val?fmt(val):''}</td>`;}
    function dayCols(field){let s='';for(let i=0;i<N;i++)s+=dayCell(i,field);return s;}
    function infoRowDays(field){let s='';for(let i=0;i<N;i++){const val=i<dayCount?(pageDays[i][field]||''):'';s+=`<td class="center" style="font-size:9pt;">${val}</td>`;}return s;}
    const sub=`<td class="right bold" style="font-size:10pt;">`;
    const travelerName=data.traveler||data.name||'';
    const travelerPhone=[travelerName,data.phone].filter(Boolean).join('　');
    const amountChinese=toChineseAmount(grandSum);
    const check1=decl1?'■':'□';const check2=decl2?'■':'□';

    // L8：只有真的有手動覆蓋時才顯示「※手動」
    const hasManual=pageDays.some(e=>e.livingLocked);

    const sigTablesHTML=isLastPage?`
  <table style="margin-top:1mm;margin-bottom:1mm;">
    <colgroup><col class="col-rem-lbl" style="width:7%"><col class="col-rem-val" style="width:43%"><col class="col-rem-lbl" style="width:7%"><col class="col-rem-val" style="width:43%"></colgroup>
    <tr class="tr-remark">
      <td class="lbl center" style="white-space:nowrap;">備　　註</td><td class="val" style="vertical-align:top;padding-top:1mm;">${data.remarks||''}</td>
      <td class="lbl center" style="white-space:nowrap;">帳　號</td>
      <td class="val">${data.bankCode?data.bankCode+'－':''}${data.bankAccount||''}</td>
    </tr>
  </table>
  <table style="margin-bottom:1mm;">
    <tr class="tr-decl">
      <td style="padding:2mm;font-size:10pt;vertical-align:top;">
        ${check1} 本次出差無其他來源供膳宿；報名或註冊等費用亦不含膳宿。<br><br>
        ${check2} 本次出差有其他來源（外國政府、國際組織、報名或註冊費等）提供膳宿或現金津貼，生活費已依「國外出差旅費報支要點」第九點規定扣除。<br>
        <span class="small-note">（請二擇一勾選）</span>
      </td>
    </tr>
  </table>
  <table style="margin-bottom:1mm;">
    <tr class="tr-amount">
      <td style="padding:1.5mm 2mm;font-size:10pt;white-space:nowrap;">
        上列出差旅費計新臺幣（大寫）&nbsp;&nbsp;<strong>${amountChinese}</strong>。&emsp;&emsp;&emsp;具領人（蓋章 sign）
      </td>
    </tr>
  </table>
  <table style="margin-bottom:2mm;">
    <colgroup><col class="col-sig1" style="width:22%"><col class="col-sig2" style="width:36%"><col class="col-sig3" style="width:42%"></colgroup>
    <tr class="tr-sig-label">
      <td class="lbl center" style="font-size:9pt;">出差人及<br>聯絡電話</td>
      <td class="lbl center" style="font-size:9pt;">指導教授</td>
      <td class="lbl center" style="font-size:9pt;">單位主管</td>
    </tr>
    <tr class="tr-sig">
      <td style="vertical-align:top;font-size:9pt;padding:1mm;">${travelerPhone}</td>
      <td style="vertical-align:bottom;text-align:center;font-size:9pt;padding:1mm;">（蓋章 sign）</td>
      <td style="vertical-align:bottom;text-align:center;font-size:9pt;padding:1mm;">（蓋章 sign）</td>
    </tr>
  </table>`:'';

    const stampSectionHTML=isLastPage?`
  <table style="margin-top:2mm;">
    <colgroup><col class="col-stmp1" style="width:33%"><col class="col-stmp2" style="width:33%"><col class="col-stmp3" style="width:34%"></colgroup>
    <tr class="tr-stamp-label"><td class="lbl center">主計室</td><td class="lbl center">主計室主任</td><td class="lbl center">校長（系主任）或其授權代簽人</td></tr>
    <tr class="tr-stamp"><td></td><td></td><td></td></tr>
  </table>`:'';

    const footerNoteHTML=isLastPage?`<p class="footer-note">附註：校長欄位依本校分層負責表授權決行，金額15萬元（含）以下視經費授權二或三層決行。</p>`:'';

    return `
<div class="print-page">
  <div class="form-title">國立成功大學國外出差旅費報告表</div>
  <div class="page-num">第 ${pageIdx+1} 頁　共 ${totalPages} 頁</div>
  <table>${colgroup}
        <tr class="tr-hdr1">
          <td class="lbl center" colspan="2">預算科目</td><td class="lbl center">憑證編號</td>
          <td class="lbl center" colspan="2">傳票編號</td><td class="lbl center" colspan="4">請購單號</td><td class="lbl center">會計編號</td>
        </tr>
        <tr class="tr-hdr2">
          <td class="val center" colspan="2">國外差旅費</td>
          <td class="val center" colspan="6" style="color:#666;font-size:9pt;">（無須填寫）</td>
          <td class="val center" colspan="2">${data.accountingNumber||''}</td>
        </tr>
        <tr class="tr-hdr3"><td class="val" colspan="10" style="font-size:9pt;padding-left:2mm;">510303-7210　國外旅費－獎助學員生</td></tr>
        <tr class="tr-name">
          <td class="lbl" colspan="2">姓　　名</td><td class="val" colspan="3">${data.name||''}</td>
          <td class="lbl">職　　稱</td><td class="val" colspan="2">${data.title||''}</td>
          <td class="lbl">職　　等</td><td class="val">${data.grade||''}</td>
        </tr>
        <tr class="tr-reason">
          <td class="lbl" colspan="2">出差事由</td>
          <td class="val" colspan="8" style="position:relative;">${data.tripReason||''}
            <span class="small-note" style="float:right;color:#555;margin-left:4mm;">※本表請逐日逐欄填寫清楚，如有塗改應加蓋私章。</span>
          </td>
        </tr>
        <tr class="tr-daterange">
          <td class="lbl" colspan="2" style="font-size:9pt;">出差起訖日期</td><td class="val" colspan="8">${dateRange}</td>
        </tr>
        <tr class="tr-date-info"><td class="lbl center" colspan="2">月</td>${infoRowDays('month')}<td class="subtotal-hdr" rowspan="4">本<br>頁<br>合<br>計</td></tr>
        <tr class="tr-date-info"><td class="lbl center" colspan="2">日</td>${infoRowDays('day')}</tr>
        <tr class="tr-date-info"><td class="lbl center" colspan="2">起訖地點</td>${infoRowDays('location')}</tr>
        <tr class="tr-date-info"><td class="lbl center" colspan="2">工作記要</td>${infoRowDays('workNote')}</tr>
        <tr class="tr-expense"><td class="center bold" rowspan="3"><div class="rotate-text">交通費</div></td><td class="lbl center">飛機</td>${dayCols('airfare')}${sub}${fmt(pageSubtotals.airfare)}</td></tr>
        <tr class="tr-expense"><td class="lbl center">船舶</td>${dayCols('ship')}${sub}${fmt(pageSubtotals.ship)}</td></tr>
        <tr class="tr-expense"><td class="lbl center" style="font-size:8pt;line-height:1.2;">長途大眾<br>陸運工具</td>${dayCols('ground')}${sub}${fmt(pageSubtotals.ground)}</td></tr>
        <tr class="tr-expense"><td class="lbl center bold" colspan="2">生活費</td>${dayCols('living')}${sub}${fmt(pageSubtotals.living)}</td></tr>
        <tr class="tr-living-note">
          <td class="lbl center" colspan="2" style="font-size:7pt;color:#666;padding:0 1mm;">計算依據</td>
          ${Array.from({length:N},(_,i)=>{
            if(i>=dayCount)return'<td></td>';
            const entry=pageDays[i];
            const exRate=parseFloat(data.exchangeRate)||0;
            const usd=getDailyRate(entry.cityKey,entry._dateStr||'');
            let txt='';if(usd&&exRate)txt=livingFeeNote(usd,exRate,entry);
            const mark=entry.livingLocked?'<span style="color:#c00;">※</span>':'';
            return`<td style="font-size:6.5pt;color:#555;text-align:center;vertical-align:top;line-height:1.3;padding:0 0.5mm;word-break:break-all;white-space:normal;overflow-wrap:break-word;">${txt}${mark}</td>`;
          }).join('')}
          ${hasManual?'<td style="font-size:6.5pt;color:#c00;vertical-align:top;text-align:right;padding:0 0.5mm;">※手動</td>':'<td></td>'}
        </tr>
        <tr class="tr-expense"><td class="center bold" rowspan="4"><div class="rotate-text">辦公費</div></td><td class="lbl center">手續費</td>${dayCols('handling')}${sub}${fmt(pageSubtotals.handling)}</td></tr>
        <tr class="tr-expense"><td class="lbl center">保險費</td>${dayCols('insurance')}${sub}${fmt(pageSubtotals.insurance)}</td></tr>
        <tr class="tr-expense"><td class="lbl center">行政費</td>${dayCols('admin')}${sub}${fmt(pageSubtotals.admin)}</td></tr>
        <tr class="tr-expense"><td class="lbl center" style="font-size:8pt;line-height:1.2;">禮品交際<br>及雜費</td>${dayCols('gifts')}${sub}${fmt(pageSubtotals.gifts)}</td></tr>
        <tr class="tr-total"><td class="lbl center bold" colspan="2">本頁合計</td>
          ${Array.from({length:N},(_,i)=>`<td class="right bold">${i<dayCount&&dayTotals[i]?fmt(dayTotals[i]):''}</td>`).join('')}
          ${sub}${fmt(pageTot)}</td>
        </tr>
        ${isLastPage?`<tr class="tr-total"><td class="lbl center bold" colspan="2">總　　計</td>${Array(N).fill('<td></td>').join('')}${sub}${fmt(grandSum)}</td></tr>`:''}
  </table>
  ${sigTablesHTML}${stampSectionHTML}${footerNoteHTML}
</div>
`;
}

// ═══════════════ 文件檢核表生成器 ══════════════════════════════════════════

function generateChecklist(data){
    const name=data.name||'';
    const today=new Date().toISOString().slice(0,10);
    const printDate=toRocDate(today);
    const usesForeignAirline=!!data.usesForeignAirline;
    const items=[
        {no:1,doc:'國外差旅費報告表',ref:'表 01',notes:['須有出差人、計畫主持人、單位主管等簽章','免送研發處及人事室會核','報告表免登打系統憑單編號']},
        {no:2,doc:'國立成功大學「兼任」專案工作人員國內外差假申請單',ref:'表 02',notes:['須有出差人、計畫主持人、單位主管等簽章','如係返回後補登，請於「差假申請事後補登說明」欄位填寫說明','如使用線上請假系統，需檢附系統產出含 QR Code 之列印頁面']},
        {no:3,doc:'國立成功大學因公出國人員搭乘外國籍航空公司班機申請書',ref:'表 03',notes:[usesForeignAirline?'【本次出差需填寫】搭乘非華航、長榮、台灣虎航、星宇等國籍航班時須檢附':'搭乘非國籍航班時須檢附（不含轉機段）','中途轉機搭乘外籍航空不適用'],highlight:usesForeignAirline},
        {no:4,doc:'國科會補助公文',ref:'—',notes:['國科會核准補助之公文或電子函文']},
        {no:5,doc:'註冊費 invoice（收據）',ref:'—',notes:['請於發票上註記「本張為唯一收據」並簽名','如以信用卡付款，須另附信用卡對帳單']},
        {no:6,doc:'議程及論文接受函',ref:'—',notes:['需含完整會議議程（含場次、時間）','論文接受通知信（acceptance letter）或摘要收錄證明']},
        {no:7,doc:'電子機票',ref:'—',notes:['電子機票訂位紀錄（e-ticket itinerary）','影本需有簽章確認']},
        {no:8,doc:'機票付款收據',ref:'—',notes:['旅行社收據或線上購票收據','影本需有簽章確認']},
        {no:9,doc:'國科會線上經費結報登錄送出畫面（截圖）',ref:'—',notes:['須完成國科會線上系統結報登錄並列印送出畫面截圖','截圖需顯示計畫編號及補助金額']},
    ];
    const rows=items.map(item=>{
        const notesHtml=item.notes.map(n=>`<li style="${item.highlight&&n.includes('【')?'color:#c00;font-weight:bold;':''}">${n}</li>`).join('');
        return`<tr style="${item.highlight?'background:#fff3f3;':''}">
      <td class="center" style="width:5%;font-weight:bold;">${item.no}</td>
      <td style="width:30%;font-weight:${item.highlight?'bold':'normal'};color:${item.highlight?'#c00':'inherit'};">${item.doc}${item.highlight?'<br><span style="font-size:8pt;">(本次出差必填)</span>':''}</td>
      <td class="center" style="width:8%;">${item.ref}</td>
      <td style="width:57%;"><ul style="margin:0;padding-left:4mm;font-size:8.5pt;">${notesHtml}</ul></td>
    </tr>`;
    }).join('');
    return`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>國科會補助研究生出席國際會議檢附文件檢核表</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'標楷體','DFKai-SB','PMingLiU','細明體',serif;font-size:10pt;background:#fff;}
.print-page{width:190mm;margin:0 auto;padding:8mm 10mm;}
.form-title{text-align:center;font-size:13pt;font-weight:bold;margin-bottom:2mm;}
.sub-title{text-align:center;font-size:10pt;margin-bottom:4mm;}
table{border-collapse:collapse;width:100%;}td{border:1px solid #000;padding:1.5mm 2mm;vertical-align:middle;}
.center{text-align:center;}li{margin-bottom:0.5mm;}
@page{size:A4 portrait;margin:10mm 10mm;}@media print{body{background:#fff;}.print-page{margin:0;padding:0;width:100%;}}
</style></head><body>
<div class="print-page">
  <div class="form-title">國科會補助研究生出席國際會議</div>
  <div class="form-title" style="font-size:12pt;">檢附文件檢核表（2026 適用）</div>
  <div class="sub-title">出差人：<strong>${name}</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;列印日期：${printDate}</div>
  <table>
    <thead><tr style="background:#ddd;">
      <td class="center" style="font-weight:bold;width:5%;">序號</td>
      <td style="font-weight:bold;width:30%;">檢附文件項目</td>
      <td class="center" style="font-weight:bold;width:8%;">表單<br>編號</td>
      <td style="font-weight:bold;width:57%;">備註說明</td>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:4mm;font-size:8pt;color:#555;">
    ※ 請確認上述文件均已備齊並完成簽章後，連同本檢核表一併繳交。如有疑問請洽計畫主辦人員。
    ${usesForeignAirline?'<br>※ <strong style="color:#c00;">本次出差搭乘外籍航空，請務必填寫並檢附表 03。</strong>':''}
  </p>
</div></body></html>`;
}

// ═══════════════ 初始化 ════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded',function(){
    if(!document.getElementById('view-report'))return;
    loadFromStorage();
    restoreStep1Fields();
    showStep(1);  // 頁面載入永遠從 Step 1 開始（避免 buildDayTable 未呼叫造成空白）

    document.getElementById('btnNext1')?.addEventListener('click',()=>{if(!validateStep1())return;buildDayTable();showStep(2);});
    document.getElementById('btnNext2')?.addEventListener('click',()=>{buildSummary();showStep(3);});
    document.getElementById('btnNext3')?.addEventListener('click',()=>{buildPrintStep();showStep(4);});
    document.getElementById('btnBack2')?.addEventListener('click',()=>{
        const hasData=formData.dailyEntries.some(e=>parseCurrency(e.living||0)||parseCurrency(e.airfare||0)||(e.workNote&&e.workNote!==''));
        if(hasData){rptConfirm('返回上一步修改日期後，超出新天數範圍的費用資料將遺失。\n確定繼續？',()=>showStep(1));}
        else showStep(1);
    });
    document.getElementById('btnBack3')?.addEventListener('click',()=>showStep(2));
    document.getElementById('btnBack4')?.addEventListener('click',()=>showStep(3));
    document.getElementById('btnPrintForm')?.addEventListener('click',printForm01);
    document.getElementById('btnPrintChecklist')?.addEventListener('click',printChecklist);

    // P2-A：清除重填改用自訂 modal
    document.getElementById('btnReset')?.addEventListener('click',()=>{
        const name=formData.name||'（未填姓名）';
        const total=getGrandTotal();
        const totalStr=total?total.toLocaleString('zh-TW')+' 元':'0 元';
        rptConfirm(`確定清除「${name}」的出差資料（旅費合計 ${totalStr}）並重新開始？\n\n此操作無法復原。建議先點「匯出備份」再清除。`,()=>{clearStorage();location.reload();});
    });

    document.getElementById('btnExport')?.addEventListener('click',exportFormData);
    document.getElementById('btnImportFile')?.addEventListener('change',function(){
        if(this.files[0])importFormData(this.files[0]);this.value='';
    });
});
