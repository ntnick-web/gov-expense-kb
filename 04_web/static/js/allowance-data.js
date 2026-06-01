// 行政院主計總處日支數額表（115年1月1日生效）
// 來源：中央政府各機關派赴國外各地區出差人員生活費日支數額表
//       中央政府各機關派赴大陸地區、香港及澳門出差人員生活費日支數額表
// 單位：美元

// ── 城市樹狀結構（供 UI 下拉選單用）────────────────────────────────────────
// seasonal: [{from:'MM-DD', to:'MM-DD', rate:數字}]
//   from <= to 表示同年內範圍；from > to 表示跨年範圍（如 10-01 ~ 03-31）
// rate: 無 seasonal 或 seasonal 未命中時的預設費率
const CITY_TREE = [
{
  region: '大陸、香港及澳門',
  countries: [
    { country: '中國大陸',
      cities: [
        { key:'CN_BEIJING',   name:'北京(Beijing)',    rate:295 },
        { key:'CN_SHANGHAI',  name:'上海(Shanghai)',   rate:268 },
        { key:'CN_DALIAN',    name:'大連(Dalian)',     rate:195 },
        { key:'CN_JINAN',     name:'濟南(Jinan)',      rate:236 },
        { key:'CN_QINGDAO',   name:'青島(Quingdao)',   rate:202 },
        { key:'CN_WUHAN',     name:'武漢(Wu Han)',     rate:225 },
        { key:'CN_CHANGSHA',  name:'長沙(Changsha)',   rate:223 },
        { key:'CN_XIAN',      name:'西安(Xian)',       rate:226 },
        { key:'CN_CHENGDU',   name:'成都(Chengdu)',    rate:256 },
        { key:'CN_GUIYANG',   name:'貴陽(Guiyang)',    rate:212 },
        { key:'CN_SHENZHEN',  name:'深圳(Shenzhen)',   rate:245 },
        { key:'CN_GUANGZHOU', name:'廣州(Guangzhou)',  rate:216 },
        { key:'CN_HAIKOU',    name:'海口(Haikou)',     rate:225 },
        { key:'CN_HANGZHOU',  name:'杭州(Hangzhou)',   rate:214 },
        { key:'CN_SANYA',     name:'三亞(Sanya)',      rate:218 },
        { key:'CN_XIAMEN',    name:'廈門(Xiamen)',     rate:238 },
        { key:'CN_OTHER',     name:'其他(Other)',      rate:194 },
      ]},
    { country: '香港(Hong Kong)',
      cities: [{ key:'HK', name:'香港(Hong Kong)', rate:339 }]},
    { country: '澳門(Macau)',
      cities: [{ key:'MO', name:'澳門(Macau)', rate:211 }]},
  ]
},
{
  region: 'A 亞太地區',
  countries: [
    { country: '日本(Japan)',
      cities: [
        { key:'JP_FUKUOKA',   name:'福岡(Fukuoka)',   rate:246 },
        { key:'JP_KOBE',      name:'神戶(Kobe)',       rate:216 },
        { key:'JP_KYOTO',     name:'京都(Kyoto)',      rate:282 },
        { key:'JP_NAGOYA',    name:'名古屋(Nagoya)',   rate:291 },
        { key:'JP_OSAKA',     name:'大阪(Osaka)',      rate:246 },
        { key:'JP_TOKYO',     name:'東京(Tokyo)',      rate:299 },
        { key:'JP_YOKOHAMA',  name:'橫濱(Yokohama)',  rate:231 },
        { key:'JP_OTHER',     name:'其他(Other)',      rate:209 },
      ]},
    { country: '北韓(Korea, Dem. People\'s Rep. of)',
      cities: [
        { key:'KP_PYONGYANG', name:'平壤(Pyongyang)', rate:275 },
        { key:'KP_OTHER',     name:'其他(Other)',      rate:108 },
      ]},
    { country: '南韓(Korea)',
      cities: [
        { key:'KR_CHEJU',     name:'濟州(Cheju)',     rate:321 },
        { key:'KR_DAEJON',    name:'大田(Daejon)',    rate:297 },
        { key:'KR_INCHEON',   name:'仁川(Incheon)',   rate:294 },
        { key:'KR_KWANGJU',   name:'光州(Kwangju)',   rate:316 },
        { key:'KR_KYONGJU',   name:'慶州(Kyongju)',   rate:305 },
        { key:'KR_SEOUL',     name:'首爾(Seoul)',     rate:290 },
        { key:'KR_YEOSU',     name:'麗水(Yeosu)',     rate:277 },
        { key:'KR_OTHER',     name:'其他(Other)',     rate:261 },
      ]},
    { country: '蒙古(Mongolia)',
      cities: [
        { key:'MN_UB',    name:'烏蘭巴托(Ulaanbaatar)', rate:184 },
        { key:'MN_OTHER', name:'其他(Other)',             rate:116 },
      ]},
    { country: '菲律賓(Philippines)',
      cities: [
        { key:'PH_BAGUIO',  name:'碧瑤(Baguio)',               rate:187 },
        { key:'PH_CEBU',    name:'宿霧(Cebu)',                  rate:228 },
        { key:'PH_DAVAO',   name:'納卯(Davao)',                 rate:221 },
        { key:'PH_MANILA',  name:'大馬尼拉都會區(Metro Manila)',rate:315 },
        { key:'PH_BATAAN',  name:'巴丹(Bataan)',                rate:203 },
        { key:'PH_CLARK',   name:'克拉克(Clark, Pampanga)',     rate:270 },
        { key:'PH_TAGAY',   name:'大雅台(Tagaytay)',            rate:224 },
        { key:'PH_OTHER',   name:'其他(Other)',                 rate:165 },
      ]},
    { country: '密克羅尼西亞(Micronesia)',
      cities: [
        { key:'FM_CHUUK',   name:'恰克(Chuuk)',   rate:225 },
        { key:'FM_POHNPEI', name:'波納佩(Pohnpei)',rate:223 },
        { key:'FM_YAP',     name:'雅浦(Yap)',      rate:262 },
      ]},
    { country: '薩摩亞(Samoa)',
      cities: [{ key:'WS', name:'薩摩亞(Samoa)', rate:210 }]},
    { country: '汶萊(Brunei)',
      cities: [{ key:'BN', name:'汶萊(Brunei)', rate:198 }]},
    { country: '泰國(Thailand)',
      cities: [
        { key:'TH_BANGKOK',  name:'曼谷(Bangkok)',        rate:284 },
        { key:'TH_CHIANGMAI',name:'清邁(Chiang Mai)',     rate:178 },
        { key:'TH_HUAHIN',   name:'華欣(Hua Hin)',        rate:243 },
        { key:'TH_PATTAYA',  name:'芭達雅(Pattaya)',      rate:173 },
        { key:'TH_PHUKET',   name:'普吉(Phuket)',         rate:358 },
        { key:'TH_RAYONG',   name:'羅勇(Rayong)',         rate:192 },
        { key:'TH_SAMUI',    name:'蘇梅島(Samui Island)', rate:145 },
        { key:'TH_OTHER',    name:'其他(Other)',           rate:103 },
      ]},
    { country: '馬來西亞(Malaysia)',
      cities: [
        { key:'MY_SABAH',    name:'沙巴(Kota Kinabalu Sabah)', rate:214 },
        { key:'MY_KL',       name:'吉隆坡(Kuala Lumpur)',       rate:251 },
        { key:'MY_KUCHING',  name:'古晉(Kuching)',               rate:235 },
        { key:'MY_PUTRAJAYA',name:'布城(Putrajaya)',             rate:251 },
        { key:'MY_OTHER',    name:'其他(Other)',                 rate:197 },
      ]},
    { country: '新加坡(Singapore)',
      cities: [{ key:'SG', name:'新加坡(Singapore)', rate:452 }]},
    { country: '印尼(Indonesia)',
      cities: [
        { key:'ID_BALI',    name:'巴里島(Bali Island)', rate:295 },
        { key:'ID_BANDUNG', name:'萬隆(Bandung)',        rate:143 },
        { key:'ID_BOGOR',   name:'茂物(Bogor City)',     rate:135 },
        { key:'ID_JAKARTA', name:'雅加達(Jakarta)',      rate:212 },
        { key:'ID_MEDAN',   name:'棉蘭(Medan)',          rate:152 },
        { key:'ID_SURABAYA',name:'泗水(Surabaya)',       rate:198 },
        { key:'ID_YOGYA',   name:'日惹(Yogyakarta)',     rate:156 },
        { key:'ID_OTHER',   name:'其他(Other)',           rate:114 },
      ]},
    { country: '緬甸(Burma)',
      cities: [
        { key:'MM_RANGOON',  name:'仰光(Rangoon)',     rate:206 },
        { key:'MM_NPT',      name:'內比都(Naypyitaw)', rate:145 },
        { key:'MM_MANDALAY', name:'曼德勒(Mandalay)',  rate:184 },
        { key:'MM_CHAUNG',   name:'羌達(Chaung Tha)',  rate:114 },
        { key:'MM_NGWE',     name:'內維桑(Ngwe Saung)',rate:119 },
        { key:'MM_PUTAO',    name:'葡萄(Putao)',        rate:141 },
        { key:'MM_NGAPALI',  name:'額不里(Ngapali)',    rate:146 },
        { key:'MM_OTHER',    name:'其他(Other)',         rate:100 },
      ]},
    { country: '印度(India)',
      cities: [
        { key:'IN_BANGALORE', name:'邦加羅爾(Bangalore)', rate:249 },
        { key:'IN_KOLKATA',   name:'加爾各答(Kolkata)',    rate:183 },
        { key:'IN_CHENNAI',   name:'清奈(Chennai)',        rate:208 },
        { key:'IN_GOA',       name:'果阿(Goa)',            rate:250 },
        { key:'IN_HYD',       name:'海得拉巴(Hyderabad)',  rate:219 },
        { key:'IN_MUMBAI',    name:'孟買(Mumbai)',         rate:260 },
        { key:'IN_DELHI',     name:'德里(Delhi NCT/NCR)',
          seasonal:[{from:'04-01',to:'08-31',rate:227}], rate:259 },
        { key:'IN_PUNE',      name:'浦內(Pune)',           rate:186 },
        { key:'IN_OTHER',     name:'其他(Other)',           rate:156 },
      ]},
    { country: '斯里蘭卡(Sri Lanka)',
      cities: [
        { key:'LK_COLOMBO', name:'可倫坡(Colombo)', rate:192 },
        { key:'LK_OTHER',   name:'其他(Other)',       rate:102 },
      ]},
    { country: '不丹(Bhutan)',
      cities: [
        { key:'BT_THIMPHU', name:'亭布(Thimphu)', rate:120 },
        { key:'BT_OTHER',   name:'其他(Other)',    rate:100 },
      ]},
    { country: '尼泊爾(Nepal)',
      cities: [
        { key:'NP_KATHMANDU', name:'加德滿都(Kathmandu)', rate:189 },
        { key:'NP_POKHARA',   name:'波卡拉(Pokhara)',      rate:107 },
        { key:'NP_OTHER',     name:'其他(Other)',           rate:100 },
      ]},
    { country: '澳大利亞(Australia)',
      cities: [
        { key:'AU_CANBERRA',  name:'坎培拉(Canberra)',   rate:304 },
        { key:'AU_MELBOURNE', name:'墨爾本(Melbourne)',  rate:304 },
        { key:'AU_SYDNEY',    name:'雪梨(Sydney)',        rate:304 },
        { key:'AU_BRISBANE',  name:'布里斯本(Brisbane)', rate:304 },
        { key:'AU_OTHER',     name:'其他(Other)',         rate:295 },
      ]},
    { country: '紐西蘭(New Zealand)',
      cities: [
        { key:'NZ_AUCKLAND',    name:'奧克蘭(Auckland)',     rate:294 },
        { key:'NZ_WELLINGTON',  name:'威靈頓(Wellington)',    rate:294 },
        { key:'NZ_OTHER',       name:'其他(Other)',            rate:271 },
      ]},
    { country: '斐濟(Fiji)',
      cities: [
        { key:'FJ_NADI',  name:'南地(Nadi)',  rate:229 },
        { key:'FJ_SUVA',  name:'蘇瓦(Suva)',  rate:317 },
        { key:'FJ_OTHER', name:'其他(Other)', rate:165 },
      ]},
    { country: '東加王國(Tonga)',
      cities: [
        { key:'TO_NUKUALOFA', name:'努瓜婁發(Nukualofa)', rate:274 },
        { key:'TO_OTHER',     name:'其他(Other)',           rate:197 },
      ]},
    { country: '諾魯(Nauru)',
      cities: [{ key:'NR', name:'諾魯(Nauru)', rate:194 }]},
    { country: '索羅門群島(Solomon Islands)',
      cities: [
        { key:'SB_HONIARA', name:'荷尼阿拉市(Honiara)', rate:376 },
        { key:'SB_OTHER',   name:'其他(Other)',           rate:150 },
      ]},
    { country: '巴布亞紐幾內亞(Papua New Guinea)',
      cities: [
        { key:'PG_MORESBY', name:'摩士比港(Port Moresby)', rate:272 },
        { key:'PG_BUKA',    name:'布卡(Buka)',               rate:188 },
        { key:'PG_KOKOPO',  name:'可可坡(Kokopo)',           rate:202 },
        { key:'PG_LAE',     name:'萊城(Lae)',                rate:224 },
        { key:'PG_RABAUL',  name:'拉包爾(Rabaul)',           rate:222 },
        { key:'PG_OTHER',   name:'其他(Other)',               rate:154 },
      ]},
    { country: '柬埔寨(Cambodia)',
      cities: [
        { key:'KH_PHNOM',    name:'金邊(Phnom Penh)',         rate:157 },
        { key:'KH_SIEM',     name:'暹粒(Siem Riep)',           rate:122 },
        { key:'KH_SIHA',     name:'施亞努市(Sihanoukville)',   rate:110 },
        { key:'KH_OTHER',    name:'其他(Other)',                rate:100 },
      ]},
    { country: '阿富汗(Afghanistan)',
      cities: [
        { key:'AF_KABUL', name:'喀布爾(Kabul)', rate:163 },
        { key:'AF_OTHER', name:'其他(Other)',    rate:100 },
      ]},
    { country: '孟加拉(Bangladesh)',
      cities: [
        { key:'BD_DHAKA', name:'達卡(Dhaka)', rate:157 },
        { key:'BD_OTHER', name:'其他(Other)', rate:100 },
      ]},
    { country: '庫克群島(Cook Islands)',
      cities: [
        { key:'CK_RAROTONGA', name:'拉羅東加(Rarotonga)', rate:383 },
        { key:'CK_OTHER',     name:'其他(Other)',           rate:253 },
      ]},
    { country: '寮國(Laos)',
      cities: [
        { key:'LA_VIENTIANE', name:'永珍(Vientiane)', rate:249 },
        { key:'LA_OTHER',     name:'其他(Other)',       rate:100 },
      ]},
    { country: '馬爾地夫(Maldives)',
      cities: [
        { key:'MV_MALE',  name:'馬利(Male)',   rate:280 },
        { key:'MV_OTHER', name:'其他(Other)',  rate:144 },
      ]},
    { country: '托克勞群島(Tokelau Islands)',
      cities: [{ key:'TK', name:'托克勞群島(Tokelau Islands)', rate:100 }]},
    { country: '吉里巴斯共和國(Kiribati)',
      cities: [
        { key:'KI_CHRISTMAS', name:'聖誕島(Christmas Island)', rate:121 },
        { key:'KI_OTHER',     name:'其他(Other)',                rate:138 },
      ]},
    { country: '吐瓦魯(Tuvalu)',
      cities: [{ key:'TV', name:'吐瓦魯(Tuvalu)', rate:197 }]},
    { country: '帛琉共和國(Palau Rep.of)',
      cities: [{ key:'PW', name:'帛琉(Palau)', rate:314 }]},
    { country: '越南(Vietnam)',
      cities: [
        { key:'VN_DALAT',   name:'大叻(Dalat)',                rate:118 },
        { key:'VN_DANANG',  name:'蜆港(Danang)',               rate:138 },
        { key:'VN_HANOI',   name:'河內(Hanoi)',                rate:167 },
        { key:'VN_HCM',     name:'胡志明市(Ho Chi Minh City)', rate:155 },
        { key:'VN_HAIPHONG',name:'海防市(Hai Phong)',           rate:109 },
        { key:'VN_HOIAN',   name:'會安(Hoi An)',               rate:105 },
        { key:'VN_HALONG',  name:'下龍(Ha Long City)',         rate:110 },
        { key:'VN_OTHER',   name:'其他(Other)',                 rate:100 },
      ]},
    { country: '法屬新喀里多尼亞島(New Caledonia Is.)',
      cities: [{ key:'NC', name:'法屬新喀里多尼亞島(New Caledonia Is.)', rate:344 }]},
    { country: '馬紹爾群島(Marshall Islands)',
      cities: [
        { key:'MH_KWAJ', name:'瓜加蓮環礁(Kwajalein Atoll)', rate:265 },
        { key:'MH_MAJURO',name:'馬久羅環礁(Majuro Atoll)',   rate:221 },
        { key:'MH_OTHER', name:'其他(Other)',                  rate:144 },
      ]},
    { country: '萬那杜(Vanuatu)',
      cities: [
        { key:'VU_VILA',   name:'維拉港(Port Vila)',  rate:281 },
        { key:'VU_SANTOS', name:'三多港(Santos)',      rate:235 },
        { key:'VU_TANNA',  name:'唐納島(Tanna Is.)',  rate:351 },
        { key:'VU_OTHER',  name:'其他(Other)',          rate:100 },
      ]},
  ]
},
{
  region: 'B 亞西地區',
  countries: [
    { country: '巴基斯坦(Pakistan)',
      cities: [
        { key:'PK_FAISALABAD', name:'費沙拉巴德(Faisalabad)', rate:238 },
        { key:'PK_ISLAMABAD',  name:'伊斯蘭馬巴德(Islamabad)',rate:316 },
        { key:'PK_KARACHI',    name:'喀拉蚩(Karachi)',         rate:147 },
        { key:'PK_LAHORE',     name:'拉合爾(Lahore)',          rate:113 },
        { key:'PK_QUETTA',     name:'圭塔(Quetta)',            rate:220 },
        { key:'PK_OTHER',      name:'其他(Other)',              rate:100 },
      ]},
    { country: '伊朗(Iran)',
      cities: [
        { key:'IR_TEHRAN', name:'德黑蘭(Tehran)', rate:177 },
        { key:'IR_OTHER',  name:'其他(Other)',      rate:118 },
      ]},
    { country: '伊拉克(Iraq)',
      cities: [
        { key:'IQ_BAGHDAD', name:'巴格達(Baghdad)', rate:278 },
        { key:'IQ_OTHER',   name:'其他(Other)',       rate:174 },
      ]},
    { country: '約旦(Jordan)',
      cities: [
        { key:'JO_AMMAN',    name:'安曼(Amman)',     rate:264 },
        { key:'JO_AQABA',    name:'阿卡巴(Aqaba)',   rate:290 },
        { key:'JO_DEADSEA',  name:'死海(Dead Sea)',  rate:290 },
        { key:'JO_OTHER',    name:'其他(Other)',      rate:157 },
      ]},
    { country: '科威特(Kuwait)',
      cities: [{ key:'KW', name:'科威特(Kuwait)', rate:321 }]},
    { country: '巴林(Bahrain)',
      cities: [{ key:'BH', name:'巴林(Bahrain)', rate:326 }]},
    { country: '卡達(Qatar)',
      cities: [{ key:'QA', name:'卡達(Qatar)', rate:354 }]},
    { country: '阿拉伯聯合大公國(UAE)',
      cities: [
        { key:'AE_ABU',   name:'阿布達比(Abu Dhabi)',
          seasonal:[{from:'04-01',to:'09-30',rate:362},{from:'11-01',to:'11-30',rate:540}], rate:417 },
        { key:'AE_DUBAI', name:'杜拜(Dubai)',
          seasonal:[{from:'04-01',to:'07-31',rate:368},{from:'10-01',to:'10-31',rate:368},{from:'12-01',to:'12-31',rate:590}], rate:493 },
        { key:'AE_OTHER', name:'其他(Other)', rate:341 },
      ]},
    { country: '敘利亞(Syria)',
      cities: [
        { key:'SY_DAMASCUS', name:'大馬士革(Damascus)', rate:236 },
        { key:'SY_OTHER',    name:'其他(Other)',          rate:133 },
      ]},
    { country: '黎巴嫩(Lebanon)',
      cities: [
        { key:'LB_BEIRUT', name:'貝魯特(Beirut)', rate:232 },
        { key:'LB_OTHER',  name:'其他(Other)',      rate:204 },
      ]},
    { country: '阿曼(Oman)',
      cities: [
        { key:'OM_MUSCAT', name:'馬斯開特(Muscat)',
          seasonal:[{from:'04-01',to:'08-31',rate:257}], rate:327 },
        { key:'OM_OTHER',  name:'其他(Other)', rate:239 },
      ]},
    { country: '葉門(Yemen)',
      cities: [
        { key:'YE_ADEN',  name:'亞丁(Aden)',   rate:248 },
        { key:'YE_SANAA', name:'沙那(Sanaa)',   rate:278 },
        { key:'YE_OTHER', name:'其他(Other)',   rate:100 },
      ]},
    { country: '沙烏地阿拉伯(Saudi Arabia)',
      cities: [
        { key:'SA_JEDDAH', name:'吉達(Jeddah)',   rate:474 },
        { key:'SA_RIYADH', name:'利雅德(Riyadh)', rate:384 },
        { key:'SA_OTHER',  name:'其他(Other)',     rate:368 },
      ]},
    { country: '耶路撒冷(Jerusalem)',
      cities: [{ key:'JE', name:'耶路撒冷(Jerusalem)', rate:300 }]},
    { country: '以色列(Israel)',
      cities: [
        { key:'IL_HAIFA',   name:'海法(Haifa)',         rate:354 },
        { key:'IL_TELAVIV', name:'台拉維夫(Tel Aviv)',   rate:359 },
        { key:'IL_OTHER',   name:'其他(Other)',           rate:298 },
      ]},
    { country: '土耳其(Turkey)',
      cities: [
        { key:'TR_ANKARA',   name:'安卡拉(Ankara)',    rate:311 },
        { key:'TR_ANTALYA',  name:'安達利亞(Antalya)', rate:246 },
        { key:'TR_ISTANBUL', name:'伊斯坦堡(Istanbul)',rate:378 },
        { key:'TR_IZMIR',    name:'伊士麥(Izmir)',      rate:255 },
        { key:'TR_OTHER',    name:'其他(Other)',         rate:165 },
      ]},
    { country: '俄羅斯(Russia)',
      cities: [
        { key:'RU_MOSCOW',     name:'莫斯科(Moscow)',          rate:289 },
        { key:'RU_STPETE',     name:'聖彼得堡(Saint Petersburg)',
          seasonal:[{from:'05-01',to:'09-30',rate:272}], rate:208 },
        { key:'RU_VLADIVOSTOK',name:'海參崴(Vladivostok)',     rate:175 },
        { key:'RU_OTHER',      name:'其他(Other)',              rate:162 },
      ]},
    { country: '亞塞拜然(Azerbaijan)',
      cities: [
        { key:'AZ_BAKU',  name:'巴庫(Baku)',   rate:194 },
        { key:'AZ_OTHER', name:'其他(Other)',  rate:108 },
      ]},
    { country: '白俄羅斯(Belarus)',
      cities: [
        { key:'BY_MINSK', name:'明斯克(Minsk)', rate:265 },
        { key:'BY_OTHER', name:'其他(Other)',    rate:100 },
      ]},
    { country: '亞美尼亞(Armenia)',
      cities: [
        { key:'AM_YEREVAN', name:'葉里溫(Yerevan)', rate:205 },
        { key:'AM_OTHER',   name:'其他(Other)',       rate:142 },
      ]},
    { country: '喬治亞(Georgia)',
      cities: [
        { key:'GE_TBILISI', name:'第比利斯(Tbilisi)', rate:199 },
        { key:'GE_OTHER',   name:'其他(Other)',         rate:172 },
      ]},
    { country: '吉爾吉斯(Kyrgyzstan)',
      cities: [
        { key:'KG_BISHKEK', name:'比什凱克(Bishkek)', rate:164 },
        { key:'KG_OTHER',   name:'其他(Other)',         rate:100 },
      ]},
    { country: '哈薩克(Kazakhstan)',
      cities: [
        { key:'KZ_ALMATY', name:'阿拉木圖(Almaty)', rate:231 },
        { key:'KZ_ASTANA', name:'阿斯坦納(Astana)', rate:245 },
        { key:'KZ_OTHER',  name:'其他(Other)',        rate:152 },
      ]},
    { country: '塔吉克(Tajikistan)',
      cities: [
        { key:'TJ_DUSHANBE', name:'杜尚別(Dushanbe)', rate:173 },
        { key:'TJ_OTHER',    name:'其他(Other)',         rate:100 },
      ]},
    { country: '土庫曼(Turkmenistan)',
      cities: [
        { key:'TM_ASHGABAT', name:'阿什哈巴德(Ashgabat)', rate:314 },
        { key:'TM_OTHER',    name:'其他(Other)',             rate:188 },
      ]},
    { country: '烏克蘭(Ukraine)',
      cities: [
        { key:'UA_KIEV', name:'基輔(Kiev)',   rate:178 },
        { key:'UA_LVIV', name:'利維夫(Lviv)', rate:157 },
        { key:'UA_OTHER',name:'其他(Other)',  rate:113 },
      ]},
    { country: '烏茲別克(Uzbekistan)',
      cities: [
        { key:'UZ_TASHKENT', name:'塔什干(Tashkent)', rate:172 },
        { key:'UZ_OTHER',    name:'其他(Other)',         rate:100 },
      ]},
    { country: '摩爾多瓦(Moldova)',
      cities: [
        { key:'MD_CHISINAU', name:'基希訥烏(Chisinau)', rate:177 },
        { key:'MD_OTHER',    name:'其他(Other)',           rate:162 },
      ]},
  ]
},
{
  region: 'C 歐洲地區',
  countries: [
    { country: '法國(France)',
      cities: [
        { key:'FR_PARIS', name:'巴黎(Paris)',   rate:439 },
        { key:'FR_OTHER', name:'其他(Other)',   rate:379 },
      ]},
    { country: '德國(Germany)',
      cities: [
        { key:'DE_BERLIN',  name:'柏林(Berlin)',   rate:374 },
        { key:'DE_HAMBURG', name:'漢堡(Hamburg)',  rate:437 },
        { key:'DE_MUNICH',  name:'慕尼黑(Munich)',
          seasonal:[{from:'09-01',to:'10-31',rate:492}], rate:377 },
        { key:'DE_OTHER',   name:'其他(Other)',    rate:340 },
      ]},
    { country: '荷蘭(Netherlands)',
      cities: [{ key:'NL', name:'荷蘭(Netherlands)', rate:359 }]},
    { country: '比利時(Belgium)',
      cities: [
        { key:'BE_BRUSSELS', name:'布魯塞爾(Brussels)', rate:457 },
        { key:'BE_OTHER',    name:'其他(Other)',          rate:301 },
      ]},
    { country: '盧森堡(Luxembourg)',
      cities: [{ key:'LU', name:'盧森堡(Luxembourg)', rate:500 }]},
    { country: '瑞士(Switzerland)',
      cities: [{ key:'CH', name:'瑞士(Switzerland)', rate:465 }]},
    { country: '北馬其頓共和國(Republic of North Macedonia)',
      cities: [
        { key:'MK_SKOPJE', name:'史可普利(Skopje)', rate:194 },
        { key:'MK_OTHER',  name:'其他(Other)',        rate:100 },
      ]},
    { country: '塞爾維亞(Serbia)',
      cities: [
        { key:'RS_BELGRADE', name:'貝爾格勒(Belgrade)', rate:276 },
        { key:'RS_OTHER',    name:'其他(Other)',          rate:154 },
      ]},
    { country: '蒙特內哥羅(Montenegro)',
      cities: [
        { key:'ME_PODGORICA', name:'波多里察(Podgorica)', rate:207 },
        { key:'ME_OTHER',     name:'其他(Other)',           rate:120 },
      ]},
    { country: '科索沃(Kosovo)',
      cities: [{ key:'XK', name:'科索沃(Kosovo)', rate:161 }]},
    { country: '列支敦斯登(Liechtenstein)',
      cities: [{ key:'LI', name:'列支敦斯登(Liechtenstein)', rate:461 }]},
    { country: '奧地利(Austria)',
      cities: [{ key:'AT', name:'奧地利(Austria)', rate:325 }]},
    { country: '安道爾拉(Andorra)',
      cities: [{ key:'AD', name:'安道爾拉(Andorra)', rate:283 }]},
    { country: '摩納哥(Monaco)',
      cities: [{ key:'MC', name:'摩納哥(Monaco)', rate:338 }]},
    { country: '丹麥(Denmark)',
      cities: [{ key:'DK', name:'丹麥(Denmark)', rate:399 }]},
    { country: '冰島(Iceland)',
      cities: [{ key:'IS', name:'冰島(Iceland)',
        seasonal:[{from:'05-01',to:'09-30',rate:365}], rate:285 }]},
    { country: '挪威(Norway)',
      cities: [{ key:'NO', name:'挪威(Norway)', rate:390 }]},
    { country: '瑞典(Sweden)',
      cities: [
        { key:'SE_STOCKHOLM', name:'斯德哥爾摩(Stockholm)', rate:422 },
        { key:'SE_OTHER',     name:'其他(Other)',             rate:319 },
      ]},
    { country: '芬蘭(Finland)',
      cities: [
        { key:'FI_HELSINKI', name:'赫爾辛基(Helsinki)', rate:388 },
        { key:'FI_OTHER',    name:'其他(Other)',          rate:335 },
      ]},
    { country: '英國(United Kingdom)',
      cities: [
        { key:'GB_LONDON', name:'倫敦(London)', rate:510 },
        { key:'GB_OTHER',  name:'其他(Other)',   rate:324 },
      ]},
    { country: '愛爾蘭(Ireland)',
      cities: [{ key:'IE', name:'愛爾蘭(Ireland)', rate:336 }]},
    { country: '西班牙(Spain)',
      cities: [
        { key:'ES_BARCELONA', name:'巴塞隆納(Barcelona)',       rate:445 },
        { key:'ES_MADRID',    name:'馬德里(Madrid)',             rate:458 },
        { key:'ES_SANSEB',    name:'聖塞巴斯提安(San Sebastian)',
          seasonal:[{from:'04-01',to:'10-31',rate:467}], rate:290 },
        { key:'ES_VALENCIA',  name:'瓦倫西亞(Valencia)',        rate:334 },
        { key:'ES_OTHER',     name:'其他(Other)',                rate:290 },
      ]},
    { country: '葡萄牙(Portugal)',
      cities: [
        { key:'PT_LISBON', name:'里斯本(Lisbon)',  rate:320 },
        { key:'PT_OPORTO', name:'奧波多(Oporto)',  rate:346 },
        { key:'PT_OTHER',  name:'其他(Other)',      rate:207 },
      ]},
    { country: '直布羅陀(Gibraltar)',
      cities: [{ key:'GI', name:'直布羅陀(Gibraltar)', rate:207 }]},
    { country: '聖馬利諾(San Marino)',
      cities: [{ key:'SM', name:'聖馬利諾(San Marino)', rate:242 }]},
    { country: '義大利(Italy)',
      cities: [
        { key:'IT_BOLOGNA',  name:'波隆那(Bologna)',    rate:360 },
        { key:'IT_FLORENCE', name:'佛羅倫斯(Florence)',
          seasonal:[{from:'04-01',to:'10-31',rate:429}], rate:348 },
        { key:'IT_MILAN',    name:'米蘭(Milan)',
          seasonal:[{from:'04-01',to:'10-31',rate:550}], rate:488 },
        { key:'IT_NAPLES',   name:'那不勒斯(Naples)',   rate:450 },
        { key:'IT_PALERMO',  name:'巴勒摩(Palermo)',    rate:346 },
        { key:'IT_ROME',     name:'羅馬(Rome)',
          seasonal:[{from:'04-01',to:'10-31',rate:485}], rate:393 },
        { key:'IT_TURIN',    name:'杜林(Turin)',         rate:350 },
        { key:'IT_VENICE',   name:'威尼斯(Venice)',
          seasonal:[{from:'04-01',to:'10-31',rate:560}], rate:426 },
        { key:'IT_OTHER',    name:'其他(Other)',         rate:242 },
      ]},
    { country: '馬爾他(Malta)',
      cities: [
        { key:'MT_MALTA', name:'馬爾他島(Malta Island)',
          seasonal:[{from:'04-01',to:'06-30',rate:500},{from:'07-01',to:'09-30',rate:540},{from:'10-01',to:'12-31',rate:421}], rate:376 },
        { key:'MT_GOZO',  name:'哥佐島(Gozo Island)', rate:297 },
      ]},
    { country: '希臘(Greece)',
      cities: [
        { key:'GR_ATHENS',  name:'雅典(Athens)',              rate:311 },
        { key:'GR_THESSA',  name:'塞薩羅尼基(Thessaloniki)',  rate:220 },
        { key:'GR_OTHER',   name:'其他(Other)',                rate:199 },
      ]},
    { country: '愛沙尼亞(Estonia)',
      cities: [{ key:'EE', name:'愛沙尼亞(Estonia)', rate:319 }]},
    { country: '拉脫維亞(Latvia)',
      cities: [
        { key:'LV_RIGA',  name:'里加(Riga)',
          seasonal:[{from:'05-01',to:'09-30',rate:297}], rate:261 },
        { key:'LV_OTHER', name:'其他(Other)', rate:192 },
      ]},
    { country: '立陶宛(Lithuania)',
      cities: [
        { key:'LT_VILNIUS', name:'維爾紐斯(Vilnius)', rate:228 },
        { key:'LT_OTHER',   name:'其他(Other)',         rate:153 },
      ]},
    { country: '波蘭(Poland)',
      cities: [
        { key:'PL_WARSAW', name:'華沙(Warsaw)', rate:236 },
        { key:'PL_OTHER',  name:'其他(Other)',  rate:219 },
      ]},
    { country: '捷克(Czech Republic)',
      cities: [
        { key:'CZ_PRAGUE',  name:'布拉格(Prague)',            rate:248 },
        { key:'CZ_BRNO',    name:'布爾諾(Brno)',              rate:212 },
        { key:'CZ_KRUMLOV', name:'克魯姆洛夫(Cesky Krumlov)',rate:207 },
        { key:'CZ_OSTRAVA', name:'奧斯特拉瓦(Ostrava)',       rate:172 },
        { key:'CZ_OTHER',   name:'其他(Other)',                rate:146 },
      ]},
    { country: '斯洛伐克(Slovakia)',
      cities: [
        { key:'SK_BRATISLAVA', name:'布拉提斯拉瓦(Bratislava)', rate:248 },
        { key:'SK_OTHER',      name:'其他(Other)',                rate:214 },
      ]},
    { country: '羅馬尼亞(Romania)',
      cities: [
        { key:'RO_BUCHAREST', name:'布加勒斯特(Bucharest)',  rate:261 },
        { key:'RO_TIMISOARA', name:'蒂米什瓦拉(Timisoara)', rate:163 },
        { key:'RO_OTHER',     name:'其他(Other)',             rate:129 },
      ]},
    { country: '保加利亞(Bulgaria)',
      cities: [
        { key:'BG_SOFIA', name:'索菲亞(Sofia)', rate:223 },
        { key:'BG_OTHER', name:'其他(Other)',   rate:121 },
      ]},
    { country: '匈牙利(Hungary)',
      cities: [
        { key:'HU_BUDAPEST', name:'布達佩斯(Budapest)', rate:261 },
        { key:'HU_OTHER',    name:'其他(Other)',          rate:169 },
      ]},
    { country: '教廷(Holy See)',
      cities: [{ key:'VA', name:'教廷(Holy See)', rate:272 }]},
    { country: '克羅埃西亞(Croatia)',
      cities: [
        { key:'HR_DUBROVNIK', name:'杜布羅夫尼克(Dubrovnik)', rate:328 },
        { key:'HR_ZAGREB',    name:'札格雷布(Zagreb)',         rate:344 },
        { key:'HR_OTHER',     name:'其他(Other)',               rate:209 },
      ]},
    { country: '塞浦路斯(Cyprus)',
      cities: [
        { key:'CY_NICOSIA', name:'尼古西亞(Nicosia)', rate:249 },
        { key:'CY_OTHER',   name:'其他(Other)',         rate:151 },
      ]},
    { country: '斯洛維尼亞(Slovenia)',
      cities: [{ key:'SI', name:'斯洛維尼亞(Slovenia)', rate:297 }]},
    { country: '波士尼亞赫塞哥維納(Bosnia-Herzegovina)',
      cities: [
        { key:'BA_SARAJEVO', name:'塞拉耶佛(Sarajevo)', rate:188 },
        { key:'BA_OTHER',    name:'其他(Other)',          rate:107 },
      ]},
    { country: '阿爾巴尼亞(Albania)',
      cities: [
        { key:'AL_TIRANA',  name:'地拉那(Tirana)',  rate:164 },
        { key:'AL_DURRES',  name:'都拉斯(Durres)',  rate:143 },
        { key:'AL_KORCA',   name:'科爾察(Korca)',   rate:246 },
        { key:'AL_SARANDA', name:'薩蘭達(Saranda)',
          seasonal:[{from:'06-01',to:'09-30',rate:298}], rate:213 },
        { key:'AL_OTHER',   name:'其他(Other)',      rate:108 },
      ]},
  ]
},
{
  region: 'D 北美洲地區',
  countries: [
    { country: '加拿大(Canada)',
      cities: [
        { key:'CA_CALGARY',   name:'卡爾加利(Calgary)',  rate:296 },
        { key:'CA_MONTREAL',  name:'蒙特婁(Montreal)',   rate:358 },
        { key:'CA_OTTAWA',    name:'渥太華(Ottawa)',      rate:392 },
        { key:'CA_TORONTO',   name:'多倫多(Toronto)',     rate:392 },
        { key:'CA_VANCOUVER', name:'溫哥華(Vancouver)',   rate:392 },
        { key:'CA_OTHER',     name:'其他(Other)',         rate:281 },
      ]},
    { country: '美國(U.S.A.)',
      cities: [
        { key:'US_SF',     name:'舊金山(San Francisco)',  rate:440 },
        { key:'US_LA',     name:'洛杉磯(Los Angeles)',    rate:372 },
        { key:'US_MIAMI',  name:'邁阿密(Miami)',           rate:326 },
        { key:'US_HAWAII', name:'夏威夷(Hawaii)',          rate:385 },
        { key:'US_CHICAGO',name:'芝加哥(Chicago)',         rate:339 },
        { key:'US_BOSTON', name:'波士頓(Boston)',          rate:395 },
        { key:'US_NYC',    name:'紐約市(New York City)',
          seasonal:[{from:'09-01',to:'12-31',rate:580}], rate:510 },
        { key:'US_PHILLY', name:'費城(Philadelphia)',      rate:331 },
        { key:'US_DC',     name:'華盛頓特區(Washington DC)',rate:403 },
        { key:'US_GUAM',   name:'關島(Guam)',              rate:266 },
        { key:'US_OTHER',  name:'其他(Other)',              rate:320 },
      ]},
  ]
},
{
  region: 'E 拉丁美洲及加勒比海地區',
  countries: [
    { country: '墨西哥(Mexico)',
      cities: [
        { key:'MX_ACAPULCO',  name:'亞加普爾科(Acapulco)',     rate:231 },
        { key:'MX_CANCUN',    name:'坎昆(Cancun)',               rate:261 },
        { key:'MX_CHIHUAHUA', name:'濟華花(Chihuahua)',          rate:209 },
        { key:'MX_JUAREZ',    name:'華瑞茲城(Ciudad Juarez)',    rate:209 },
        { key:'MX_CUERNAVACA',name:'奎納瓦卡(Cuernavaca)',       rate:219 },
        { key:'MX_ENSENADA',  name:'恩瑟納達(Ensenada)',         rate:210 },
        { key:'MX_GDL',       name:'瓜達拉哈拉(Guadalajara)',    rate:216 },
        { key:'MX_MERIDA',    name:'梅里達(Merida)',              rate:188 },
        { key:'MX_MEXICO',    name:'墨西哥城(Mexico City)',      rate:367 },
        { key:'MX_MONTERREY', name:'墨德勒(Monterrey)',           rate:225 },
        { key:'MX_PUEBLA',    name:'拍布拉(Puebla)',              rate:220 },
        { key:'MX_PV',        name:'瓦雅塔港(Puerto Vallarta)',  rate:251 },
        { key:'MX_OTHER',     name:'其他(Other)',                 rate:141 },
      ]},
    { country: '瓜地馬拉(Guatemala)',
      cities: [
        { key:'GT_ANTIGUA', name:'安地瓜(Antigua)',              rate:247 },
        { key:'GT_CITY',    name:'瓜地馬拉城(Guatemala City)',   rate:229 },
        { key:'GT_OTHER',   name:'其他(Other)',                   rate:124 },
      ]},
    { country: '薩爾瓦多(El Salvador)',
      cities: [
        { key:'SV_SANSALVADOR', name:'聖薩爾瓦多(San Salvador)', rate:235 },
        { key:'SV_OTHER',       name:'其他(Other)',                rate:144 },
      ]},
    { country: '宏都拉斯(Honduras)',
      cities: [
        { key:'HN_BAY',    name:'海灣島(Bay Islands)',    rate:210 },
        { key:'HN_SPS',    name:'汕埠(San Pedro Sula)',   rate:234 },
        { key:'HN_TGU',    name:'德古西加巴(Tegucigalpa)',rate:237 },
        { key:'HN_OTHER',  name:'其他(Other)',             rate:133 },
      ]},
    { country: '巴哈馬(Bahamas)',
      cities: [{ key:'BS', name:'巴哈馬(Bahamas)', rate:590 }]},
    { country: '尼加拉瓜(Nicaragua)',
      cities: [
        { key:'NI_MANAGUA', name:'馬拿瓜(Managua)', rate:171 },
        { key:'NI_OTHER',   name:'其他(Other)',       rate:100 },
      ]},
    { country: '哥斯大黎加(Costa Rica)',
      cities: [
        { key:'CR_SANJOSE', name:'聖荷西(San Jose)', rate:219 },
        { key:'CR_OTHER',   name:'其他(Other)',        rate:144 },
      ]},
    { country: '巴拿馬(Panama)',
      cities: [
        { key:'PA_CITY',  name:'巴拿馬市(Panama City)', rate:230 },
        { key:'PA_OTHER', name:'其他(Other)',             rate:156 },
      ]},
    { country: '海地(Haiti)',
      cities: [
        { key:'HT_PAP',   name:'太子港(Port-au-Prince)', rate:246 },
        { key:'HT_OTHER', name:'其他(Other)',              rate:173 },
      ]},
    { country: '多米尼克(Dominica)',
      cities: [{ key:'DM', name:'多米尼克(Dominica)', rate:444 }]},
    { country: '多明尼加共和國(Dominican Rep.)',
      cities: [
        { key:'DO_LAROMANA', name:'拉羅馬拉(La Romana)',  rate:182 },
        { key:'DO_PP',       name:'布拉達港(Puerto Plata)',rate:184 },
        { key:'DO_SD',       name:'聖多明哥(Santo Domingo)',rate:243 },
        { key:'DO_PC',       name:'迦納角(Punta Cana)',    rate:334 },
        { key:'DO_OTHER',    name:'其他(Other)',            rate:100 },
      ]},
    { country: '千里達及托貝哥(Trinidad and Tobago)',
      cities: [{ key:'TT', name:'千里達及托貝哥(Trinidad and Tobago)', rate:336 }]},
    { country: '牙買加(Jamaica)',
      cities: [{ key:'JM', name:'牙買加(Jamaica)', rate:319 }]},
    { country: '巴貝多(Barbados)',
      cities: [{ key:'BB', name:'巴貝多(Barbados)',
        seasonal:[{from:'04-16',to:'12-15',rate:450}], rate:540 }]},
    { country: '貝里斯(Belize)',
      cities: [
        { key:'BZ_CITY',  name:'貝里斯市(Belize City)', rate:270 },
        { key:'BZ_SP',    name:'聖佩卓(San Pedro)',       rate:300 },
        { key:'BZ_OTHER', name:'其他(Other)',              rate:201 },
      ]},
    { country: '百慕達(Bermuda)',
      cities: [{ key:'BM', name:'百慕達(Bermuda)',
        seasonal:[{from:'04-01',to:'11-30',rate:708}], rate:582 }]},
    { country: '聖文森(Saint Vincent and the Grenadines)',
      cities: [{ key:'VC', name:'聖文森(Saint Vincent)', rate:326 }]},
    { country: '聖露西亞(Saint Lucia)',
      cities: [{ key:'LC', name:'聖露西亞(Saint Lucia)',
        seasonal:[{from:'04-15',to:'12-14',rate:496}], rate:530 }]},
    { country: '古巴(Cuba)',
      cities: [
        { key:'CU_HAVANA', name:'哈瓦那(Havana)', rate:256 },
        { key:'CU_OTHER',  name:'其他(Other)',      rate:103 },
      ]},
    { country: '格瑞那達(Grenada)',
      cities: [{ key:'GD', name:'格瑞那達(Grenada)',
        seasonal:[{from:'04-16',to:'12-14',rate:259}], rate:319 }]},
    { country: '聖克里斯多福及尼維斯(Saint Kitts and Nevis)',
      cities: [{ key:'KN', name:'聖克里斯多福及尼維斯(Saint Kitts and Nevis)',
        seasonal:[{from:'04-15',to:'12-14',rate:352}], rate:407 }]},
    { country: '安地卡及巴布達(Antigua and Barbuda)',
      cities: [{ key:'AG', name:'安地卡及巴布達(Antigua and Barbuda)',
        seasonal:[{from:'06-02',to:'12-31',rate:341}], rate:484 }]},
    { country: '委內瑞拉(Venezuela)',
      cities: [
        { key:'VE_CARACAS',   name:'卡拉卡斯(Caracas)',   rate:284 },
        { key:'VE_MARACAIBO', name:'馬拉開波(Maracaibo)', rate:127 },
        { key:'VE_OTHER',     name:'其他(Other)',           rate:100 },
      ]},
    { country: '哥倫比亞(Colombia)',
      cities: [
        { key:'CO_BOGOTA',    name:'波哥大(Bogota)',      rate:133 },
        { key:'CO_BARRANQ',   name:'巴蘭幾亞(Barranquilla)',rate:129 },
        { key:'CO_CARTAGENA', name:'迦太基娜(Cartagena)', rate:175 },
        { key:'CO_MEDELLIN',  name:'麥德林(Medellin)',    rate:167 },
        { key:'CO_OTHER',     name:'其他(Other)',          rate:100 },
      ]},
    { country: '蓋亞那(Guyana)',
      cities: [
        { key:'GY_GEORGETOWN', name:'佐治市(Georgetown)', rate:252 },
        { key:'GY_OTHER',      name:'其他(Other)',          rate:148 },
      ]},
    { country: '厄瓜多爾(Ecuador)',
      cities: [
        { key:'EC_CUENCA',   name:'庫恩卡(Cuenca)',        rate:183 },
        { key:'EC_GUAYAQUIL',name:'瓜亞基爾(Guayaquil)',   rate:197 },
        { key:'EC_MANTA',    name:'曼塔(Manta)',            rate:195 },
        { key:'EC_QUITO',    name:'基多(Quito)',            rate:199 },
        { key:'EC_GALAPAGOS',name:'拉巴島(Galapagos)',     rate:322 },
        { key:'EC_OTHER',    name:'其他(Other)',            rate:112 },
      ]},
    { country: '巴西(Brazil)',
      cities: [
        { key:'BR_BRASILIA',    name:'巴西利亞(Brasilia)',            rate:174 },
        { key:'BR_CURITIBA',    name:'古里提巴(Curitiba)',             rate:137 },
        { key:'BR_FLORIPA',     name:'佛羅里安諾波里斯(Florianopolis)',rate:139 },
        { key:'BR_RIO',         name:'里約熱內盧(Rio de Janeiro)',     rate:233 },
        { key:'BR_SAOPAULO',    name:'聖保羅(Sao Paulo)',              rate:239 },
        { key:'BR_OTHER',       name:'其他(Other)',                    rate:126 },
      ]},
    { country: '秘魯(Peru)',
      cities: [
        { key:'PE_AREQUIPA', name:'阿雷基帕(Arequipa)', rate:220 },
        { key:'PE_CUZCO',    name:'庫斯科(Cuzco)',       rate:237 },
        { key:'PE_LIMA',     name:'利馬(Lima)',           rate:221 },
        { key:'PE_TRUJILLO', name:'特魯希略(Trujillo)',  rate:230 },
        { key:'PE_OTHER',    name:'其他(Other)',          rate:163 },
      ]},
    { country: '玻利維亞(Bolivia)',
      cities: [
        { key:'BO_LAPAZ',      name:'拉巴斯(LaPaz)',      rate:171 },
        { key:'BO_SANTACRUZ',  name:'聖塔克拉斯(Santa Cruz)',rate:121 },
        { key:'BO_OTHER',      name:'其他(Other)',          rate:100 },
      ]},
    { country: '智利(Chile)',
      cities: [
        { key:'CL_SANTIAGO', name:'聖地牙哥(Santiago)', rate:256 },
        { key:'CL_OTHER',    name:'其他(Other)',          rate:244 },
      ]},
    { country: '阿根廷(Argentina)',
      cities: [
        { key:'AR_BUENOSAIRES', name:'布宜諾斯艾利斯(Buenos Aires)',  rate:368 },
        { key:'AR_MENDOZA',     name:'門多薩(Mendoza)',                rate:413 },
        { key:'AR_SALTA',       name:'薩爾塔(Salta)',                  rate:185 },
        { key:'AR_JUJUY',       name:'胡胡伊(San Salvador de Jujuy)',  rate:188 },
        { key:'AR_BAHIA',       name:'布蘭卡港及馬德普拉塔(Bahia Blanca)',rate:214 },
        { key:'AR_BARILOCHE',   name:'巴里洛切(Bariloche)',            rate:343 },
        { key:'AR_NEUQUEN',     name:'內烏肯(Neuquen)',                rate:281 },
        { key:'AR_USHUAIA',     name:'烏蘇懷亞(Ushuaia)',              rate:305 },
        { key:'AR_OTHER',       name:'其他(Other)',                    rate:155 },
      ]},
    { country: '巴拉圭(Paraguay)',
      cities: [
        { key:'PY_ASUNCION', name:'亞松森(Asuncion)',      rate:220 },
        { key:'PY_CDE',      name:'東方市(Ciudad del Este)',rate:181 },
        { key:'PY_OTHER',    name:'其他(Other)',             rate:120 },
      ]},
    { country: '烏拉圭(Uruguay)',
      cities: [
        { key:'UY_MONTEVIDEO', name:'蒙特維多(Montevideo)', rate:231 },
        { key:'UY_PDE',        name:'東岬(Punta del Este)',
          seasonal:[{from:'04-01',to:'11-30',rate:206}], rate:340 },
        { key:'UY_OTHER',      name:'其他(Other)',           rate:114 },
      ]},
    { country: '蘇利南(Suriname)',
      cities: [
        { key:'SR_PARAMARIBO', name:'巴拉馬利波(Paramaribo)', rate:260 },
        { key:'SR_OTHER',      name:'其他(Other)',              rate:227 },
      ]},
  ]
},
{
  region: 'F 非洲地區',
  countries: [
    { country: '埃及(Egypt)',
      cities: [
        { key:'EG_ALEX',   name:'亞力山大港(Alexandria)',    rate:272 },
        { key:'EG_ASWAN',  name:'亞斯文(Aswan)',             rate:276 },
        { key:'EG_CAIRO',  name:'開羅(Cairo)',               rate:305 },
        { key:'EG_SHARM',  name:'夏姆錫克(Sharmel Sheikh)',  rate:259 },
        { key:'EG_OTHER',  name:'其他(Other)',                rate:196 },
      ]},
    { country: '利比亞(Libya)',
      cities: [
        { key:'LY_TRIPOLI', name:'的黎波里(Tripoli)', rate:191 },
        { key:'LY_OTHER',   name:'其他(Other)',         rate:156 },
      ]},
    { country: '阿爾及利亞(Algeria)',
      cities: [
        { key:'DZ_ALGIERS', name:'阿爾及爾(Algiers)', rate:267 },
        { key:'DZ_OTHER',   name:'其他(Other)',         rate:104 },
      ]},
    { country: '幾內亞(Guinea)',
      cities: [
        { key:'GN_CONAKRY', name:'科納克里(Conakry)', rate:239 },
        { key:'GN_OTHER',   name:'其他(Other)',         rate:173 },
      ]},
    { country: '幾內亞比索(Guinea-Bissau)',
      cities: [
        { key:'GW_BISSAU', name:'比索(Bissau)', rate:134 },
        { key:'GW_OTHER',  name:'其他(Other)',  rate:100 },
      ]},
    { country: '獅子山國(Sierra Leone)',
      cities: [
        { key:'SL_FREETOWN', name:'自由城(Freetown)', rate:239 },
        { key:'SL_OTHER',    name:'其他(Other)',        rate:105 },
      ]},
    { country: '賴比瑞亞(Liberia)',
      cities: [
        { key:'LR_MONROVIA', name:'蒙羅維亞(Monrovia)', rate:247 },
        { key:'LR_OTHER',    name:'其他(Other)',           rate:128 },
      ]},
    { country: '象牙海岸(Cote D\'ivoire)',
      cities: [
        { key:'CI_ABIDJAN', name:'阿比尚(Abidjan)',       rate:256 },
        { key:'CI_YAMOUSSO',name:'雅穆索戈(Yamoussoukro)',rate:219 },
        { key:'CI_OTHER',   name:'其他(Other)',            rate:149 },
      ]},
    { country: '迦納(Ghana)',
      cities: [
        { key:'GH_ACCRA', name:'阿克拉(Accra)', rate:311 },
        { key:'GH_OTHER', name:'其他(Other)',    rate:204 },
      ]},
    { country: '多哥(Togo)',
      cities: [
        { key:'TG_LOME',  name:'洛梅(Lome)',   rate:253 },
        { key:'TG_OTHER', name:'其他(Other)',  rate:108 },
      ]},
    { country: '貝南(Benin)',
      cities: [
        { key:'BJ_COTONOU', name:'柯多努(Cotonou)', rate:219 },
        { key:'BJ_OTHER',   name:'其他(Other)',       rate:102 },
      ]},
    { country: '布吉納法索(Burkina Faso)',
      cities: [
        { key:'BF_BOBO',  name:'卜卜迪拉索(Bobo-Dioulasso)', rate:165 },
        { key:'BF_OUAGA', name:'瓦加杜古(Ouagadougou)',        rate:249 },
        { key:'BF_OTHER', name:'其他(Other)',                   rate:132 },
      ]},
    { country: '奈及利亞(Nigeria)',
      cities: [
        { key:'NG_ABUJA',     name:'阿布札(Abuja)',       rate:213 },
        { key:'NG_LAGOS',     name:'拉哥斯(Lagos)',        rate:222 },
        { key:'NG_PH',        name:'哈科特港(Port Harcourt)',rate:158 },
        { key:'NG_BENIN',     name:'貝寧城(Benin City)',   rate:186 },
        { key:'NG_KANO',      name:'卡諾(Kano)',           rate:111 },
        { key:'NG_OTHER',     name:'其他(Other)',           rate:100 },
      ]},
    { country: '喀麥隆(Cameroon)',
      cities: [
        { key:'CM_DOUALA',  name:'杜阿拉(Douala)',  rate:207 },
        { key:'CM_YAOUNDE', name:'雅恩德(Yaounde)', rate:224 },
        { key:'CM_OTHER',   name:'其他(Other)',      rate:125 },
      ]},
    { country: '中非共和國(Central African Rep)',
      cities: [
        { key:'CF_BANGUI', name:'班基(Bangui)', rate:235 },
        { key:'CF_OTHER',  name:'其他(Other)',  rate:100 },
      ]},
    { country: '赤道幾內亞(Equatorial Guinea)',
      cities: [
        { key:'GQ_MALABO', name:'馬拉布(Malabo)', rate:251 },
        { key:'GQ_OTHER',  name:'其他(Other)',     rate:230 },
      ]},
    { country: '加彭(Gabon)',
      cities: [
        { key:'GA_LIBREVILLE', name:'自由市(Libreville)', rate:351 },
        { key:'GA_OTHER',      name:'其他(Other)',          rate:148 },
      ]},
    { country: '剛果共和國(Republic of the Congo)',
      cities: [
        { key:'CG_BRAZZAVILLE', name:'布拉薩市(Brazzaville)', rate:329 },
        { key:'CG_OTHER',       name:'其他(Other)',             rate:135 },
      ]},
    { country: '剛果民主共和國(Democratic Rep. of the Congo)',
      cities: [
        { key:'CD_BUKAVU',    name:'布卡烏(Bukavu)',   rate:199 },
        { key:'CD_GOMA',      name:'哥馬(Goma)',        rate:205 },
        { key:'CD_KINSHASA',  name:'金夏沙(Kinshasa)', rate:373 },
        { key:'CD_LUBUMBASHI',name:'羅彭巴布(Lubumbashi)',rate:213 },
        { key:'CD_MBUJI',     name:'木布吉馬伊(Mbuji Mayi)',rate:175 },
        { key:'CD_OTHER',     name:'其他(Other)',       rate:141 },
      ]},
    { country: '安哥拉(Angola)',
      cities: [
        { key:'AO_LUANDA', name:'羅安達(Luanda)', rate:382 },
        { key:'AO_OTHER',  name:'其他(Other)',     rate:122 },
      ]},
    { country: '波札那(Botswana)',
      cities: [
        { key:'BW_GABORONE', name:'嘉伯隆里(Gaborone)', rate:216 },
        { key:'BW_KASANE',   name:'卡薩尼(Kasane)',       rate:260 },
        { key:'BW_OTHER',    name:'其他(Other)',           rate:156 },
      ]},
    { country: '辛巴威(Zimbabwe)',
      cities: [
        { key:'ZW_HARARE',  name:'阿拉爾(Harare)',                  rate:258 },
        { key:'ZW_VICFALLS',name:'維多利亞瀑布城(Victoria Falls)',  rate:281 },
        { key:'ZW_OTHER',   name:'其他(Other)',                       rate:125 },
      ]},
    { country: '馬拉威(Malawi)',
      cities: [
        { key:'MW_BLANTYRE', name:'布蘭岱(Blantyre)', rate:206 },
        { key:'MW_LILONGWE', name:'里朗威(Lilongwe)', rate:157 },
        { key:'MW_OTHER',    name:'其他(Other)',        rate:110 },
      ]},
    { country: '莫三比克(Mozambique)',
      cities: [
        { key:'MZ_MAPUTO', name:'馬布多(Maputo)', rate:237 },
        { key:'MZ_BEIRA',  name:'貝拉(Beira)',    rate:191 },
        { key:'MZ_OTHER',  name:'其他(Other)',    rate:172 },
      ]},
    { country: '尚比亞(Zambia)',
      cities: [
        { key:'ZM_LIVINGSTONE', name:'利文斯頓(Livingstone)', rate:337 },
        { key:'ZM_LUSAKA',      name:'路沙卡(Lusaka)',          rate:318 },
        { key:'ZM_OTHER',       name:'其他(Other)',              rate:126 },
      ]},
    { country: '坦尚尼亞(Tanzania)',
      cities: [
        { key:'TZ_DAR',   name:'沙蘭港(Dares Salaam)', rate:225 },
        { key:'TZ_OTHER', name:'其他(Other)',            rate:123 },
      ]},
    { country: '蒲隆地(Burundi)',
      cities: [
        { key:'BI_BUJUMBURA', name:'布松布拉(Bujumbura)',     rate:273 },
        { key:'BI_GITEGA',    name:'吉特加及恩戈齊(Gitega)',   rate:126 },
        { key:'BI_RUMONGE',   name:'魯蒙蓋(Rumonge)',          rate:279 },
        { key:'BI_OTHER',     name:'其他(Other)',               rate:105 },
      ]},
    { country: '盧安達(Rwanda)',
      cities: [
        { key:'RW_KIGALI',    name:'吉佳利(Kigali)',       rate:251 },
        { key:'RW_RUHENGERI', name:'魯亨蓋里(Ruhengeri)',  rate:265 },
        { key:'RW_OTHER',     name:'其他(Other)',           rate:155 },
      ]},
    { country: '烏干達(Uganda)',
      cities: [
        { key:'UG_ENTEBBE', name:'安德比(Entebbe)',  rate:232 },
        { key:'UG_KAMPALA', name:'康培拉(Kampala)',  rate:252 },
        { key:'UG_OTHER',   name:'其他(Other)',       rate:100 },
      ]},
    { country: '肯亞(Kenya)',
      cities: [
        { key:'KE_MOMBASA', name:'蒙巴沙(Mombasa)', rate:217 },
        { key:'KE_NAIROBI', name:'奈洛比(Nairobi)', rate:267 },
        { key:'KE_OTHER',   name:'其他(Other)',       rate:102 },
      ]},
    { country: '索馬利亞(Somalia)',
      cities: [
        { key:'SO_MOGADISHU', name:'摩加迪休(Mogadishu)', rate:191 },
        { key:'SO_OTHER',     name:'其他(Other)',           rate:100 },
      ]},
    { country: '索馬利蘭共和國(Republic of Somaliland)',
      cities: [{ key:'XS', name:'索馬利蘭共和國(Republic of Somaliland)', rate:126 }]},
    { country: '吉布地(Djibouti)',
      cities: [
        { key:'DJ_CITY',  name:'吉布地(Djibouti)', rate:260 },
        { key:'DJ_OTHER', name:'其他(Other)',        rate:115 },
      ]},
    { country: '衣索匹亞(Ethiopia)',
      cities: [
        { key:'ET_ADDIS', name:'阿迪斯阿貝巴(Addis Ababa)', rate:209 },
        { key:'ET_OTHER', name:'其他(Other)',                  rate:100 },
      ]},
    { country: '厄利垂亞(Eritrea)',
      cities: [
        { key:'ER_ASMARA', name:'阿斯馬拉(Asmara)', rate:159 },
        { key:'ER_OTHER',  name:'其他(Other)',        rate:115 },
      ]},
    { country: '蘇丹(Sudan)',
      cities: [
        { key:'SD_KHARTOUM', name:'喀土木(Khartoum)', rate:208 },
        { key:'SD_OTHER',    name:'其他(Other)',         rate:125 },
      ]},
    { country: '南蘇丹(South Sudan)',
      cities: [
        { key:'SS_JUBA',  name:'朱巴(Juba)',   rate:128 },
        { key:'SS_OTHER', name:'其他(Other)',  rate:100 },
      ]},
    { country: '模里西斯(Mauritius)',
      cities: [{ key:'MU', name:'模里西斯(Mauritius)', rate:276 }]},
    { country: '馬達加斯加(Madagascar)',
      cities: [
        { key:'MG_ANTANANARIVO', name:'安塔那那利佛(Antananarivo)', rate:206 },
        { key:'MG_OTHER',        name:'其他(Other)',                  rate:100 },
      ]},
    { country: '南非共和國(South Africa)',
      cities: [
        { key:'ZA_CAPETOWN',     name:'開普敦(Cape Town)',       rate:263 },
        { key:'ZA_DURBAN',       name:'德班(Durban)',             rate:244 },
        { key:'ZA_EASTLONDON',   name:'東倫敦(East London)',     rate:160 },
        { key:'ZA_JOHANNESBURG', name:'約翰尼斯堡(Johannesburg)',rate:237 },
        { key:'ZA_PRETORIA',     name:'普利托里亞(Pretoria)',    rate:169 },
        { key:'ZA_OTHER',        name:'其他(Other)',              rate:122 },
      ]},
    { country: '納密比亞(Namibia)',
      cities: [
        { key:'NA_WINDHOEK', name:'文豪克(Windhoek)', rate:164 },
        { key:'NA_OTHER',    name:'其他(Other)',        rate:100 },
      ]},
    { country: '史瓦帝尼(Eswatini)',
      cities: [
        { key:'SZ_MBABANE', name:'墨巴本(Mbabane)', rate:168 },
        { key:'SZ_OTHER',   name:'其他(Other)',       rate:138 },
      ]},
    { country: '賴索托(Lesotho)',
      cities: [
        { key:'LS_MASERU', name:'馬塞魯(Maseru)', rate:217 },
        { key:'LS_OTHER',  name:'其他(Other)',     rate:100 },
      ]},
    { country: '查德(Chad)',
      cities: [
        { key:'TD_NDJAMENA', name:'恩加美納(Ndjamena)', rate:246 },
        { key:'TD_OTHER',    name:'其他(Other)',           rate:115 },
      ]},
    { country: '葛摩(Comoros)',
      cities: [
        { key:'KM_MORONI', name:'莫洛尼(Moroni)', rate:283 },
        { key:'KM_OTHER',  name:'其他(Other)',     rate:232 },
      ]},
    { country: '甘比亞(Gambia)',
      cities: [
        { key:'GM_BANJUL', name:'班竹(Banjul)', rate:194 },
        { key:'GM_OTHER',  name:'其他(Other)',  rate:100 },
      ]},
    { country: '茅利塔尼亞(Mauritania)',
      cities: [
        { key:'MR_NOUAKCHOTT', name:'諾克少(Nouakchott)', rate:147 },
        { key:'MR_OTHER',      name:'其他(Other)',          rate:100 },
      ]},
    { country: '馬利(Mali)',
      cities: [
        { key:'ML_BAMAKO', name:'巴馬科(Bamako)', rate:228 },
        { key:'ML_OTHER',  name:'其他(Other)',     rate:113 },
      ]},
    { country: '尼日(Niger)',
      cities: [
        { key:'NE_NIAMEY', name:'尼阿美(Niamey)', rate:182 },
        { key:'NE_OTHER',  name:'其他(Other)',      rate:112 },
      ]},
    { country: '塞內加爾(Senegal)',
      cities: [
        { key:'SN_DAKAR', name:'達卡(Dakar)', rate:276 },
        { key:'SN_OTHER', name:'其他(Other)', rate:187 },
      ]},
    { country: '突尼西亞(Tunisia)',
      cities: [
        { key:'TN_TUNIS', name:'突尼斯(Tunis)', rate:217 },
        { key:'TN_OTHER', name:'其他(Other)',    rate:140 },
      ]},
    { country: '維德角(Cabo Verde)',
      cities: [
        { key:'CV_PRAIA', name:'培亞(Praia)', rate:217 },
        { key:'CV_OTHER', name:'其他(Other)', rate:148 },
      ]},
    { country: '摩洛哥(Morocco)',
      cities: [
        { key:'MA_CASABLANCA', name:'卡薩布蘭加(Casablanca)', rate:274 },
        { key:'MA_MARRAKECH',  name:'馬拉喀什(Marrakech)',     rate:275 },
        { key:'MA_RABAT',      name:'拉巴特(Rabat)',            rate:277 },
        { key:'MA_TANGIER',    name:'丹吉爾(Tangier)',          rate:273 },
        { key:'MA_OTHER',      name:'其他(Other)',              rate:222 },
      ]},
    { country: '塞席爾(Seychelles)',
      cities: [{ key:'SC', name:'塞席爾(Seychelles)', rate:403 }]},
    { country: '聖多美普林西比(Sao Tome and Principe)',
      cities: [
        { key:'ST_SAOTOME',  name:'聖多美(Sao Tome)',   rate:199 },
        { key:'ST_PRINCIPE', name:'普林西比(Principe)', rate:132 },
      ]},
  ]
},
];

// ── 建立扁平查詢表 ────────────────────────────────────────────────────────────
const CITY_RATES = {};
for (const region of CITY_TREE) {
    for (const country of region.countries) {
        for (const city of country.cities) {
            CITY_RATES[city.key] = city;
        }
    }
}

// ── 季節性費率查詢 ────────────────────────────────────────────────────────────
function _inRange(md, from, to) {
    if (from <= to) return md >= from && md <= to;
    return md >= from || md <= to; // 跨年範圍
}

function getDailyRate(cityKey, dateStr) {
    const city = CITY_RATES[cityKey];
    if (!city) return null;
    if (!city.seasonal || !dateStr) return city.rate;
    const d = new Date(dateStr);
    if (isNaN(d)) return city.rate;
    const md = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    for (const s of city.seasonal) {
        if (_inRange(md, s.from, s.to)) return s.rate;
    }
    return city.rate;
}

// ── 建立城市 <option> HTML（供 <select> 使用）────────────────────────────────
// filter: 可選關鍵字過濾（C3）
function buildCityOptions(selectedKey, filter) {
    const sel = selectedKey || '';
    const q = filter ? filter.toLowerCase().trim() : '';
    let html = `<option value="">─ 請選擇城市 ─</option>`;
    for (const region of CITY_TREE) {
        for (const country of region.countries) {
            let groupHtml = '';
            for (const city of country.cities) {
                if (q) {
                    const haystack = (city.name + country.country + region.region).toLowerCase();
                    if (!haystack.includes(q)) continue;
                }
                const s = city.key === sel ? ' selected' : '';
                groupHtml += `<option value="${city.key}"${s}>${city.name}（$${city.rate}${city.seasonal ? '+' : ''}）</option>`;
            }
            if (groupHtml) {
                html += `<optgroup label="${country.country}（${region.region}）">`;
                html += groupHtml;
                html += `</optgroup>`;
            }
        }
    }
    return html;
}

// C3: 城市搜尋 combo 外層 HTML（包含 search input + select）
function buildCityComboHTML(selectedKey, selectId, onchangeFn, placeholder) {
    const ph = placeholder || '輸入城市名稱搜尋…';
    const idAttr = selectId ? `id="${selectId}"` : '';
    return `<div class="city-combo-wrap">
      <input type="text" class="city-search-inp" placeholder="${ph}" autocomplete="off"
        oninput="onCitySearch(this)" onfocus="onCitySearch(this)">
      <select ${idAttr} class="city-select" ${onchangeFn ? `onchange="${onchangeFn}"` : ''}>
        ${buildCityOptions(selectedKey)}
      </select>
    </div>`;
}

// C3: 城市搜尋輸入時過濾 select options
function onCitySearch(input) {
    const wrap = input.closest('.city-combo-wrap');
    if (!wrap) return;
    const sel = wrap.querySelector('.city-select');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = buildCityOptions(currentVal, input.value);
    if (!input.value.trim()) sel.value = currentVal;
}
