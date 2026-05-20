// ============================================================
//  태연ERP 홈페이지 크롤링 서비스
//  기능: 자바스크립트로 만든 홈페이지도 본문 추출 가능
//  용도: 크레탑 PDF 업로드 시 해당 업체 홈페이지 자동 수집
// ============================================================

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const 앱 = express();
앱.use(cors());
앱.use(express.json());

// 서버 포트 (Railway가 자동 설정, 로컬에서는 3000번)
const 포트 = process.env.PORT || 3000;

// API 비밀키 (Railway 환경변수에서 설정)
const 비밀키 = process.env.API_KEY || 'taeyeon-erp-2026';

// ── 비밀키 확인 ──
function 인증확인(req, res, next) {
  const 입력키 = req.headers['x-api-key'] || req.query.key;
  if (입력키 !== 비밀키) return res.status(401).json({ 오류: '비밀키가 틀렸습니다' });
  next();
}

// ── 브라우저 관리 (한 번만 실행해서 재사용) ──
let 브라우저 = null;
async function 브라우저가져오기() {
  if (!브라우저 || !브라우저.isConnected()) {
    브라우저 = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return 브라우저;
}

// ============================================================
//  기능 1: 단일 페이지 크롤링
//  사용법: POST /crawl  { "url": "http://www.회사홈페이지.co.kr" }
// ============================================================
앱.post('/crawl', 인증확인, async (req, res) => {
  const { url, wait = 3000 } = req.body;
  if (!url) return res.status(400).json({ 오류: 'url을 입력해주세요' });

  try {
    const b = await 브라우저가져오기();
    const 페이지 = await b.newPage();
    페이지.setDefaultTimeout(15000);

    // 페이지 접속 (자바스크립트 완전 로딩까지 대기)
    await 페이지.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await 페이지.waitForTimeout(wait);

    const 결과 = await 페이지.evaluate(() => {
      // 메타 태그 수집 (회사 설명, 키워드 등)
      const 메타태그 = {};
      document.querySelectorAll('meta').forEach(m => {
        const 키 = m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv');
        if (키) 메타태그[키] = m.getAttribute('content') || '';
      });

      // 본문 텍스트 추출 (스크립트, 스타일 태그 제거)
      const 복사본 = document.body.cloneNode(true);
      복사본.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
      const 본문 = 복사본.innerText.replace(/\n{3,}/g, '\n\n').trim();

      // 링크 수집 (메뉴 구조 파악용)
      const 링크목록 = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const 텍스트 = a.innerText.trim();
        const 주소 = a.href;
        if (텍스트 && 주소 && !주소.startsWith('javascript:')) {
          링크목록.push({ 텍스트: 텍스트.substring(0, 100), 주소 });
        }
      });

      // 이미지 수집 (제품 사진 등)
      const 이미지목록 = [];
      document.querySelectorAll('img[src]').forEach(img => {
        이미지목록.push({
          주소: img.src,
          설명: img.alt || '',
          가로: img.naturalWidth,
          세로: img.naturalHeight
        });
      });

      return {
        제목: document.title,
        메타태그,
        본문,
        링크목록: [...new Map(링크목록.map(l => [l.주소, l])).values()],
        이미지목록: 이미지목록.filter(i => i.가로 > 50 && i.세로 > 50),
        본문길이: 본문.length
      };
    });

    await 페이지.close();
    res.json({ 성공: true, url, ...결과 });

  } catch (err) {
    res.status(500).json({ 오류: err.message, url });
  }
});

// ============================================================
//  기능 2: 홈페이지 + 하위페이지 자동 크롤링 (태연ERP 핵심)
//  사용법: POST /crawl-deep  { "url": "http://www.회사.co.kr", "maxPages": 8 }
//  
//  자동으로 회사소개, 제품, 인사말, 연혁, 인증 페이지를 찾아서 수집합니다
// ============================================================
앱.post('/crawl-deep', 인증확인, async (req, res) => {
  const { url, maxPages = 8, wait = 3000 } = req.body;
  if (!url) return res.status(400).json({ 오류: 'url을 입력해주세요' });

  // 회사 홈페이지에서 우선적으로 찾을 메뉴 키워드
  const 우선키워드 = [
    '회사소개', '회사개요', 'company', 'about',
    '인사말', 'greeting', 'ceo', '대표',
    '연혁', 'history',
    '제품', 'product', '사업', 'business', '서비스',
    '기술', 'technology', 'r&d', '연구',
    '인증', 'certification', '특허', 'patent',
    '설비', 'facility', '공장', '생산',
    '거래처', 'client', 'partner', '납품', '실적',
    '오시는길', '찾아오시는', 'location', 'contact',
    '공지사항', 'notice', '보도', 'news', '소식',
    '채용', 'recruit', 'career', '인재'
  ];

  try {
    const b = await 브라우저가져오기();
    const 페이지 = await b.newPage();
    페이지.setDefaultTimeout(15000);

    // ── 1단계: 메인 페이지 크롤링 + 링크 수집 ──
    await 페이지.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await 페이지.waitForTimeout(wait);

    const 메인데이터 = await 페이지.evaluate(() => {
      const 복사본 = document.body.cloneNode(true);
      복사본.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());

      const 링크목록 = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const 텍스트 = a.innerText.trim();
        const 주소 = a.href;
        if (텍스트 && 주소 && !주소.startsWith('javascript:') && !주소.startsWith('mailto:')) {
          링크목록.push({ 텍스트: 텍스트.substring(0, 100), 주소 });
        }
      });

      return {
        제목: document.title,
        본문: 복사본.innerText.replace(/\n{3,}/g, '\n\n').trim(),
        링크목록: [...new Map(링크목록.map(l => [l.주소, l])).values()]
      };
    });

    // ── 2단계: 우선순위로 하위 페이지 선별 ──
    const 기본도메인 = new URL(url).hostname;
    const 우선링크 = 메인데이터.링크목록
      .filter(l => {
        try {
          const h = new URL(l.주소).hostname;
          return h === 기본도메인 || h === `www.${기본도메인}` || 기본도메인 === `www.${h}`;
        } catch { return false; }
      })
      .map(l => {
        const 소문자텍스트 = l.텍스트.toLowerCase();
        const 소문자주소 = l.주소.toLowerCase();
        let 점수 = 0;
        for (const 키워드 of 우선키워드) {
          if (소문자텍스트.includes(키워드) || 소문자주소.includes(키워드)) {
            점수 += 10;
          }
        }
        return { ...l, 점수 };
      })
      .filter(l => l.점수 > 0)
      .sort((a, b) => b.점수 - a.점수)
      .slice(0, maxPages - 1);

    // ── 3단계: 하위 페이지 순서대로 크롤링 ──
    const 하위페이지들 = [];
    for (const 링크 of 우선링크) {
      try {
        await 페이지.goto(링크.주소, { waitUntil: 'networkidle', timeout: 15000 });
        await 페이지.waitForTimeout(Math.min(wait, 2000));

        const 하위데이터 = await 페이지.evaluate(() => {
          const 복사본 = document.body.cloneNode(true);
          복사본.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
          return {
            제목: document.title,
            본문: 복사본.innerText.replace(/\n{3,}/g, '\n\n').trim()
          };
        });

        하위페이지들.push({
          주소: 링크.주소,
          메뉴이름: 링크.텍스트,
          제목: 하위데이터.제목,
          본문: 하위데이터.본문.substring(0, 5000),
          본문길이: 하위데이터.본문.length
        });
      } catch (err) {
        하위페이지들.push({
          주소: 링크.주소,
          메뉴이름: 링크.텍스트,
          오류: err.message
        });
      }
    }

    await 페이지.close();

    // ── 4단계: 정리된 결과 반환 ──
    res.json({
      성공: true,
      홈페이지주소: url,
      메인페이지: {
        제목: 메인데이터.제목,
        본문: 메인데이터.본문.substring(0, 5000),
        본문길이: 메인데이터.본문.length,
        전체링크수: 메인데이터.링크목록.length
      },
      하위페이지들,
      요약: {
        수집페이지수: 1 + 하위페이지들.filter(p => !p.오류).length,
        실패페이지수: 하위페이지들.filter(p => p.오류).length,
        전체글자수: 메인데이터.본문.length + 하위페이지들.reduce((합계, p) => 합계 + (p.본문길이 || 0), 0)
      }
    });

  } catch (err) {
    res.status(500).json({ 오류: err.message, url });
  }
});

// ── 서버 상태 확인 ──
앱.get('/health', (req, res) => {
  res.json({ 상태: '정상', 서비스: '태연ERP 크롤링 서비스', 버전: '1.0.0' });
});

// ── 서버 시작 ──
앱.listen(포트, () => {
  console.log(`\n태연ERP 크롤링 서비스 시작 — http://localhost:${포트}`);
  console.log(`  POST /crawl       — 단일 페이지 크롤링`);
  console.log(`  POST /crawl-deep  — 하위페이지 자동 탐색`);
  console.log(`  GET  /health      — 서버 상태 확인\n`);
});

// ── 서버 종료 시 브라우저 정리 ──
process.on('SIGINT', async () => {
  if (브라우저) await 브라우저.close();
  process.exit();
});
process.on('SIGTERM', async () => {
  if (브라우저) await 브라우저.close();
  process.exit();
});
