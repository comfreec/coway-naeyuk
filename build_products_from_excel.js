const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ========================================================
// 🔔 매달 새로운 엑셀로 갱신할 때 아래 3개만 변경해주세요!
// ========================================================
const EXCEL_FILE = '2608아웃수수료.xlsx'; // 예: '2609아웃수수료.xlsx', '2610아웃수수료.xlsx'
const SHEET_NAME_KEYWORD = '코웨이';       // 시트 이름에 포함될 키워드 (다른 브랜드 시 'SK', 'LG' 등)
const SOURCE_TAG = 'excel';                // DB에서 어떤 제품을 지울지 판단하는 태그 (excel로 고정)
// ========================================================

const filePath = path.join(__dirname, EXCEL_FILE);
const outputJson = path.join(__dirname, 'coway_all_products.json');
const outputPreview = path.join(__dirname, 'coway_all_products_preview.json');

console.log(`📊 [${EXCEL_FILE}] 로드 중... (시트: ${SHEET_NAME_KEYWORD})`);
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames.find(n => n.includes(SHEET_NAME_KEYWORD));
if (!sheetName) { console.error(`❌ "${SHEET_NAME_KEYWORD}" 키워드를 포함한 시트를 찾을 수 없습니다!`); process.exit(1); }
console.log(`✅ 시트 발견: ${sheetName}`);
const ws = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log(`✅ 원본 행: ${rows.length}`);

// ===== 1. 헤더 제외, 빈 행 제외 =====
const validRows = [];
let headerFound = false;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const hasAny = row.some(c => String(c).trim() !== '');
  if (!hasAny) continue;
  // 첫 유효행은 헤더 (타이틀/모델명/관리구분/...)
  if (!headerFound) { headerFound = true; continue; }
  validRows.push(row);
}
console.log(`✅ 데이터 행: ${validRows.length}`);

// ===== 2. 빈 제품명/모델명 채우기 (위 행 값 상속) =====
let lastTitle = '';
let lastModel = '';
const filled = [];
for (const row of validRows) {
  const title = String(row[0] || '').trim();
  const model = String(row[1] || '').trim();
  if (title !== '') lastTitle = title;
  if (model !== '') lastModel = model;
  filled.push([
    title || lastTitle,
    model || lastModel,
    String(row[2] || '').trim(),   // 관리구분
    String(row[3] || '').trim(),   // 약정명
    String(row[4] || '').trim(),   // 관리주기
    String(row[5] || '').trim(),   // 프로모션
    row[6],                         // 9개월내재접수
    String(row[7] || '').trim(),   // 총렌탈기간
    row[8],                         // 렌탈료
    row[9],                         // 13.3제외
  ]);
}
console.log(`✅ 상속 완료: ${filled.length}`);

// ===== 3. 카테고리 자동 분류 =====
function categorize(name) {
  const n = name.replace(/\s+/g, '').toLowerCase();
  if (n.includes('정수기')) return '정수기';
  if (n.includes('비데')) return '비데';
  if (n.includes('에어컨') || n.includes('냉난방기')) return '에어컨';
  if (n.includes('제습')) return '제습기';
  if (n.includes('공기청정') || n.includes('청정기')) return '공기청정기';
  if (n.includes('안마의자') || n.includes('마사지') || n.includes('의자')) {
    if (n.includes('안마') || n.includes('마사지')) return '안마의자';
    return '기타';
  }
  if (n.includes('침대') || n.includes('매트리스')) return '침대';
  if (n.includes('프레임')) return '프레임';
  if (n.includes('인덕션') || n.includes('렌지') || n.includes('오븐')) return '인덕션';
  if (n.includes('연수기') || n.includes('연수')) return '연수기';
  if (n.includes('의류청정') || n.includes('드럼') || n.includes('세탁') || n.includes('건조')) return '의류청정기';
  if (n.includes('커튼') || n.includes('블라인드')) return '기타';
  return '기타';
}

// ===== 4. 프로모션 파싱 =====
function parsePromotion(promo) {
  const p = String(promo || '');
  let halfDisc = 0;
  let competitor = 0;
  let extraPromo = [];

  // "X개월반값" → 반값 할인율 세팅 (약정에 따라 3/6/9/12개월 반값은 보통 특별 프로모션이지만, 
  // 시스템의 halfDisc는 %이므로 일단 기본 0으로 두고 프로모션 텍스트만 저장해두거나, 
  // "반값" 문구가 있으면 사용자가 later에 조절하도록 반값할인 관련은 extraPromo로 남겨둡니다)
  const halfMatch = p.match(/(\d+)\s*개월\s*반값/);
  if (halfMatch) extraPromo.push(`${halfMatch[1]}개월 반값`);
  else if (p.includes('반값')) extraPromo.push('반값 프로모션');

  // "12회 1만원 추가할인" 같은 건 competitor나 extraDisc로 넣을 애매하므로 일단 competitor는 타사보상 문구가 있을 때만
  if (p.includes('타사') || p.includes('보상')) {
    // competitor = 0; // 우선 기본값, 추후 약정명에 타사보상 있으면 처리
    extraPromo.push('타사보상');
  }
  const extraMatch = p.match(/(\d+)\s*회\s*(\d+)\s*(?:만|천)?원/);
  if (extraMatch) extraPromo.push(`${extraMatch[1]}회 ${extraMatch[2]}${p.includes('만') ? '만' : ''}원 할인`);

  return { halfDisc, competitor, extraPromo: extraPromo.join(', ') };
}

// ===== 5. 약정명에서 추가 정보 뽑기 =====
function parseContractName(contract) {
  const c = String(contract || '');
  let hasCompetitor = false;
  let years = 0;

  const y = c.match(/(\d+)년/);
  if (y) years = parseInt(y[1], 10);
  if (c.includes('타사')) hasCompetitor = true;
  return { years, hasCompetitor };
}

// ===== 6. 최종 products 배열로 변환 =====
const CATEGORIES_ORDER = ['전체', '제습기', '공기청정기', '정수기', '에어컨', '비데', '침대', '프레임', '안마의자', '인덕션', '연수기', '의류청정기', '기타'];
const products = [];
let uid = 0;

for (const row of filled) {
  const [title, model, careType, contract, cycle, promo, nineMonthWithin, totalMonths, rental, excl133] = row;
  const rentalNum = typeof rental === 'number' ? rental : (parseFloat(String(rental).replace(/[^0-9]/g, '')) || 0);

  // 렌탈료가 0 이하인 건 스킵
  if (!(rentalNum > 0)) continue;

  const contractInfo = parseContractName(contract);
  const promoInfo = parsePromotion(promo);
  const category = categorize(title);

  // 약정명에 타사보상이 포함되거나 프로모션에 타사보상이 보이면 기본 competitor 0으로 둬서 나중에 
  // "타사보상 할인"을 적용하기 쉽게 표시해둠 (금액은 0)
  const competitorFlag = (contractInfo.hasCompetitor || promoInfo.competitor > 0) ? true : false;

  // 이름 뒤에 구분 정보를 덧붙여서 리스트에서 구분이 쉽게 (예: 코웨이 스위치 정수기 [P-2200N/방문관리/5년약정])
  const labelName = title;
  const fullDisplayName = `${title} [${model ? model + '/' : ''}${careType || ''}/${contract || ''}]`;

  products.push({
    // 기존 시스템 필수 필드
    name: labelName,
    rental: rentalNum,
    category,

    // 할인 관련 기본값 (나중에 수정 가능)
    contract: 0,
    halfDisc: promoInfo.halfDisc,
    rerentalDisc: 0,
    disc: 0,
    extraDisc: 0,
    bundleDisc: 0,
    multiDisc: 0,
    competitor: competitorFlag ? 0 : 0,
    card: 0,

    // 🔥 갱신 모드에서 지울 때 사용: 어떤 엑셀 파일에서 왔는지 태깅
    source: SOURCE_TAG,
    importMonth: EXCEL_FILE.slice(0, 4), // '2608' 과 같이 연월 저장
    excelFile: EXCEL_FILE,               // 원본 엑셀 파일명 기록

    // 엑셀에서 가져온 상세 정보 (추가 필드, 없으면 기존 로직에 영향 없음)
    model,
    careType,
    contractName: contract,
    contractYears: contractInfo.years,
    cycle,
    promotion: promo,
    promotionExtra: promoInfo.extraPromo,
    totalMonths,
    nineMonthWithin: typeof nineMonthWithin === 'number' ? nineMonthWithin : null,
    excl133: typeof excl133 === 'number' ? excl133 : null,
    hasCompetitorTag: competitorFlag,

    // 검색용 풀네임
    search: fullDisplayName,

    createdAt: Date.now() + (uid++),
    updatedAt: Date.now() + uid,
  });
}

console.log(`✅ 최종 products: ${products.length}`);

// 카테고리별 통계
const byCat = {};
products.forEach(p => { byCat[p.category] = (byCat[p.category] || 0) + 1; });
console.log('\n📊 카테고리별 통계:');
Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${c}: ${n}개`));

console.log('\n🔍 미리보기 (처음 5개):');
products.slice(0, 5).forEach(p => {
  console.log(`  - ${p.name} / ${p.model} / ${p.contractName} / 렌탈 ${p.rental} / 카테고리 ${p.category}`);
});

// JSON 저장
fs.writeFileSync(outputJson, JSON.stringify(products, null, 2), 'utf8');
console.log('\n💾 전체 JSON 저장:', outputJson);

// 프리뷰 (처음 20개 + 마지막 10개) 저장
const preview = {
  total: products.length,
  categoryStats: byCat,
  first20: products.slice(0, 20),
  last10: products.slice(-10),
};
fs.writeFileSync(outputPreview, JSON.stringify(preview, null, 2), 'utf8');
console.log('💾 프리뷰 JSON 저장:', outputPreview);
