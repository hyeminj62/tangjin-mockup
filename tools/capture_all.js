/*
 * 전체 화면 캡처 + 모아 보기 생성
 *   node tools/capture_all.js
 *
 * 결과
 *   screenshots/S00.png … S14.png, A01.png … A10.png, E01.png … E06.png (S09는 S09_1, S09_2)
 *   screenshots/overview.html  (S / A / E 구역별 썸네일 격자, 클릭하면 크게 보기)
 *   screenshots/overview.png   (overview.html을 한 장으로)
 *   screenshots/capture_report.json (빠진 화면 · 깨진 이미지 점검 결과)
 *
 * index.html / extra.html 은 수정하지 않는다.
 * - 화면 이동은 매 캡처마다 새 페이지로 #해시를 열어서 한다 (전환 애니메이션 없이 첫 화면으로 뜸).
 * - 애니메이션/전환은 screenshot 의 animations: 'disabled' 로 끈다.
 * - 타이핑 효과는 말풍선을 탭해서 끝까지 완료시킨 뒤 찍는다. (탭 = 화면 root 의 click 이벤트)
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
const EXTRA = pathToFileURL(path.join(ROOT, 'extra.html')).href;

/* ---------- Playwright 로드 (프로젝트/전역 → 없으면 npx 캐시) ---------- */
function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return require(name); } catch (e) { /* 다음 후보 */ }
  }
  const base = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      for (const name of ['playwright', 'playwright-core']) {
        const p = path.join(base, d, 'node_modules', name);
        if (fs.existsSync(p)) { try { return require(p); } catch (e) { /* 계속 */ } }
      }
    }
  }
  throw new Error('Playwright를 찾을 수 없습니다. 프로젝트 폴더에서 `npm i -D playwright` 후 다시 실행하세요.');
}

async function launch(chromium) {
  const tries = [{ channel: 'chrome' }, {}, { channel: 'msedge' }];
  let last;
  for (const o of tries) {
    try { return await chromium.launch(o); } catch (e) { last = e; }
  }
  throw last;
}

/* ---------- 화면 목록 (ID · 이름) ---------- */
const S_NAMES = {
  S00: '배우자 선택', S01: '인트로 스토리', S02: '상품 유형 질문', S03: 'ELS 안내', S04: '증권앱 구매',
  S05: '앵커 상품 설명', S06: '상황 1 · 관세', S07: '상황 2 · 중동 전쟁', S08: '상황 3 · 만기(기준선 통과 후)',
  S09: '결과', S10: '앵커 해설', S11: '퀴즈(정답 피드백)', S12: '메인', S13: '마이페이지', S14: '상품 상세'
};
const A_NAMES = {
  A01: '로그인', A02: '약관 동의', A03: '투자성향 질문 1', A04: '투자성향 질문 2', A05: '투자성향 질문 3',
  A06: '투자성향 질문 4', A07: '투자성향 질문 5', A08: '투자성향 질문 6', A09: '성향 결과', A10: "관리자 '투자자 정보' (PC)"
};
const E_NAMES = {
  E01: '스텝다운 구조', E02: '만기 수익 구조', E03: 'Worst-of 원리', E04: '3년 타임라인', E05: '예금과 비교', E06: '용어 카드'
};

/* 캡처 결과 파일 목록 (overview 의 순서) */
const ITEMS = [];
Object.keys(S_NAMES).forEach(id => {
  if (id === 'S09') {
    ITEMS.push({ sec: 'S', id: 'S09_1', file: 'S09_1', name: '결과 · 축하', pc: false });
    ITEMS.push({ sec: 'S', id: 'S09_2', file: 'S09_2', name: '결과 · 반전', pc: false });
  } else ITEMS.push({ sec: 'S', id, file: id, name: S_NAMES[id], pc: false });
});
Object.keys(A_NAMES).forEach(id => ITEMS.push({ sec: 'A', id, file: id, name: A_NAMES[id], pc: id === 'A10' }));
Object.keys(E_NAMES).forEach(id => ITEMS.push({ sec: 'E', id, file: id, name: E_NAMES[id], pc: false }));

/* ---------- 페이지 안에서 쓰는 헬퍼 ---------- */
const curRoot = `[...document.querySelectorAll('#stage .screen')].filter(e => !e.classList.contains('out')).pop()`;
const tap = page => page.evaluate(`(${curRoot}).click()`);            // 화면 탭 (버튼은 누르지 않는다)
const finishTyping = page => page.evaluate(`(() => {
  const r = ${curRoot}; const bs = r.querySelectorAll('.bubble'); const b = bs[bs.length - 1];
  if (b && !b.classList.contains('done') && !b.classList.contains('gone')) r.click();   // 타이핑 중이면 즉시 완료
})()`);
const hashNow = page => page.evaluate('location.hash');

async function tapUntil(page, sel, expectHash, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await page.$(sel)) return;
    if (expectHash && (await hashNow(page)) !== expectHash) throw new Error(`화면이 ${expectHash} 에서 벗어남 (${await hashNow(page)})`);
    await tap(page);
    await page.waitForTimeout(40);
  }
  throw new Error(`${sel} 가 나타나지 않음`);
}

async function settle(page) {
  await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(250);
}

/* ---------- index.html 화면별 준비 동작 ---------- */
const PREP = {
  async S01(page) {                          // 대사 3번째(배우자) 줄까지, 타이핑 완료
    await finishTyping(page); await tap(page);
    await finishTyping(page); await tap(page);
    await finishTyping(page);
  },
  async S05(page) {                          // 계단 도식이 나오는 대사
    await tapUntil(page, '.stairs-ov.show', '#S05');
    await finishTyping(page);
  },
  async S06(page) { await tapUntil(page, '.nextbtn.show', '#S06'); await settle(page); },
  async S07(page) { await tapUntil(page, '.nextbtn.show', '#S07'); await settle(page); },
  async S08(page) { await tapUntil(page, '.nextbtn.show', '#S08'); await settle(page); },   // 기준선 통과 후 최종 상태
  async S10(page) { await tapUntil(page, '.sheet.show', '#S10'); },
  async S12(page) { await page.waitForSelector('.speech.show', { timeout: 8000 }); },
  async S13(page) {                          // 퀴즈를 맞힌 상태의 배지를 보여준다 (state 만 바꿔 화면을 다시 그림)
    await page.evaluate(() => { state.quizCorrect = true; go('S13', { first: true, replace: true }); });
    await page.waitForTimeout(500);
  }
};

async function captureIndex(ctx, id, snap) {
  const page = await ctx.newPage();
  const problems = watch(page);
  try {
    await page.goto(INDEX + '#' + id, { waitUntil: 'load' });
    await page.waitForSelector('#stage .screen');
    await settle(page);

    if (id === 'S09') {
      await page.waitForSelector('.stats.in', { timeout: 8000 });        // 수익률 카운트업 완료
      await finishTyping(page);
      await snap(page, 'S09_1', problems);
      await tap(page);                                                    // 다음 대사 (반전)
      await finishTyping(page);
      await page.waitForSelector('.rwrap .rcard:nth-child(2).on', { timeout: 3000 });
      await snap(page, 'S09_2', problems);
    } else if (id === 'S11') {
      await tapUntil(page, '.qcard.show', '#S11');
      await page.evaluate(() => document.querySelectorAll('.qc')[CONTENT.S11.answer].click());   // 정답 선택
      await page.waitForSelector('.nextbtn.show', { timeout: 8000 });
      await finishTyping(page);
      await snap(page, 'S11', problems);
    } else {
      if (PREP[id]) await PREP[id](page);
      else if (id === 'S00' || id === 'S02' || id === 'S03' || id === 'S04' || id === 'S14') { /* 정적 화면 */ }
      await snap(page, id, problems);
    }
  } finally { await page.close(); }
}

async function captureExtra(ctx, id, snap) {
  const page = await ctx.newPage();
  const problems = watch(page);
  try {
    await page.goto(EXTRA + '?capture=1#' + id, { waitUntil: 'load' });
    await page.waitForSelector('#stage > *');
    await settle(page);
    await snap(page, id, problems);
  } finally { await page.close(); }
}

/* ---------- 콘솔 오류 / 이미지 실패 수집 ---------- */
function watch(page) {
  const p = { failed: [], console: [] };
  page.on('requestfailed', r => {
    const t = r.resourceType();
    if (t === 'image') p.failed.push(path.basename(decodeURIComponent(r.url())));
  });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.console.push(m.text()); });
  page.on('pageerror', e => p.console.push(String(e)));
  return p;
}

/* ---------- 메인 ---------- */
(async () => {
  const { chromium } = loadPlaywright();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch(chromium);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const pc = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const report = [];

  const snap = async (page, file, problems) => {
    const out = path.join(OUT, file + '.png');
    await page.screenshot({ path: out, animations: 'disabled' });
    // 깨진 이미지 / 플레이스홀더(파일 없음) 점검
    const info = await page.evaluate(() => ({
      placeholders: [...document.querySelectorAll('.ph')].map(e => e.textContent.trim()),
      broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src'))
    }));
    report.push({ file: file + '.png', placeholders: info.placeholders, brokenImages: info.broken, failedRequests: problems.failed.slice(), consoleErrors: problems.console.slice() });
    console.log('  ✓', file + '.png', info.placeholders.length ? '  ⚠ 플레이스홀더: ' + info.placeholders.join(', ') : '');
  };

  const errors = [];
  console.log('[index.html]');
  for (const id of Object.keys(S_NAMES)) {
    try { await captureIndex(mobile, id, snap); } catch (e) { errors.push(id + ': ' + e.message); console.log('  ✗', id, e.message); }
  }
  console.log('[extra.html]');
  for (const id of [...Object.keys(A_NAMES), ...Object.keys(E_NAMES)]) {
    try { await captureExtra(id === 'A10' ? pc : mobile, id, snap); } catch (e) { errors.push(id + ': ' + e.message); console.log('  ✗', id, e.message); }
  }

  /* ---------- overview.html ---------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const secTitle = { S: 'S · 시연 흐름 (index.html)', A: 'A · 가입 · 투자성향 · 관리자 (extra.html)', E: 'E · ELS 설명 자료 (extra.html)' };
  const present = ITEMS.filter(it => fs.existsSync(path.join(OUT, it.file + '.png')));
  const sections = ['S', 'A', 'E'].map(sec => {
    const figs = present.filter(it => it.sec === sec).map(it =>
      `<figure class="${it.pc ? 'wide' : ''}" data-src="${it.file}.png" data-cap="${esc(it.id + ' · ' + it.name)}">` +
      `<img src="${it.file}.png" alt="${esc(it.id)}"><figcaption><b>${esc(it.id)}</b> ${esc(it.name)}</figcaption></figure>`).join('\n');
    return `<section><h2>${esc(secTitle[sec])}</h2><div class="grid">\n${figs}\n</div></section>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>내 배우자는 탕진잼 · 화면 한눈에 보기</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Pretendard',-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;background:#f4f6fa;color:#14275a;padding:32px 40px 48px}
  h1{font-size:28px;margin-bottom:6px}
  .lead{color:#8a8f99;font-size:14px;margin-bottom:24px}
  section{margin-bottom:36px}
  h2{font-size:18px;margin-bottom:14px;padding-left:12px;border-left:5px solid #ff5c93}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,200px);gap:22px 18px;align-items:start}
  figure{cursor:zoom-in}
  figure.wide{grid-column:span 3}
  figure img{display:block;width:100%;height:auto;border-radius:14px;box-shadow:0 6px 18px rgba(20,39,90,.18);background:#fff;transition:transform .15s}
  figure:hover img{transform:translateY(-3px)}
  figcaption{margin-top:8px;font-size:13px;text-align:center;line-height:1.35}
  figcaption b{display:inline-block;margin-right:4px;color:#ff5c93}
  #lb{position:fixed;inset:0;background:rgba(20,39,90,.82);display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;z-index:9;cursor:zoom-out;padding:20px}
  #lb.on{display:flex}
  #lb img{max-width:96vw;max-height:88vh;border-radius:12px;background:#fff}
  #lb div{color:#fff;font-size:15px;font-weight:600}
</style></head><body>
<h1>내 배우자는 탕진잼 · 화면 한눈에 보기</h1>
<p class="lead">썸네일을 클릭하면 크게 볼 수 있어요. (닫기: 클릭 또는 Esc)</p>
${sections}
<div id="lb"><img alt=""><div></div></div>
<script>
  const lb = document.getElementById('lb'), lbi = lb.querySelector('img'), lbc = lb.querySelector('div');
  document.querySelectorAll('figure').forEach(f => f.addEventListener('click', () => {
    lbi.src = f.dataset.src; lbc.textContent = f.dataset.cap; lb.classList.add('on');
  }));
  lb.addEventListener('click', () => lb.classList.remove('on'));
  addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('on'); });
</script></body></html>`;
  fs.writeFileSync(path.join(OUT, 'overview.html'), html, 'utf8');

  /* ---------- overview.png (PT용 한 장) ---------- */
  const ov = await browser.newContext({ viewport: { width: 1760, height: 1000 }, deviceScaleFactor: 2 });
  const op = await ov.newPage();
  await op.goto(pathToFileURL(path.join(OUT, 'overview.html')).href, { waitUntil: 'load' });
  await settle(op);
  await op.screenshot({ path: path.join(OUT, 'overview.png'), fullPage: true, animations: 'disabled' });
  await ov.close();
  await browser.close();

  /* ---------- 점검 ---------- */
  const missing = ITEMS.filter(it => !fs.existsSync(path.join(OUT, it.file + '.png')) || fs.statSync(path.join(OUT, it.file + '.png')).size === 0).map(it => it.file);
  const withPh = report.filter(r => r.placeholders.length || r.brokenImages.length || r.failedRequests.length);
  fs.writeFileSync(path.join(OUT, 'capture_report.json'), JSON.stringify({ missing, errors, imageProblems: withPh, all: report }, null, 2), 'utf8');

  console.log('\n===== 점검 결과 =====');
  console.log('캡처 대상:', ITEMS.length, '장 / 저장됨:', ITEMS.length - missing.length, '장');
  console.log('빠진 화면:', missing.length ? missing.join(', ') : '없음');
  console.log('실행 오류:', errors.length ? errors.join(' | ') : '없음');
  console.log('깨진/대체 이미지:', withPh.length ? '' : '없음');
  withPh.forEach(r => console.log('  -', r.file, '플레이스홀더:', r.placeholders.join(', ') || '-', '/ 요청 실패:', [...new Set(r.failedRequests)].join(', ') || '-'));
  const ce = report.filter(r => r.consoleErrors.length);
  console.log('콘솔 오류:', ce.length ? '' : '없음');
  ce.forEach(r => console.log('  -', r.file, r.consoleErrors.join(' / ')));
})().catch(e => { console.error(e); process.exit(1); });
