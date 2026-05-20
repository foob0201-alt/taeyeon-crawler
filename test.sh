#!/bin/bash
# ============================================================
#  태연ERP 크롤링 서비스 테스트
#  사용법: bash test.sh 서버주소 비밀키
#  예시:   bash test.sh https://내주소.up.railway.app taeyeon2026
# ============================================================

서버주소="${1:-http://localhost:3000}"
비밀키="${2:-taeyeon-erp-2026}"

echo "═══════════════════════════════════════"
echo "  태연ERP 크롤링 서비스 테스트"
echo "  서버: $서버주소"
echo "═══════════════════════════════════════"

# 1. 서버 상태 확인
echo ""
echo "[1/3] 서버 상태 확인 중..."
curl -s "$서버주소/health" | python3 -m json.tool
echo ""

# 2. 단일 페이지 테스트 (정적 사이트)
echo "[2/3] 단일 페이지 크롤링 테스트 (smsafety.co.kr)..."
curl -s -X POST "$서버주소/crawl" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $비밀키" \
  -d '{"url": "http://smsafety.co.kr"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('성공') or d.get('success'):
    제목 = d.get('제목', d.get('title', ''))
    본문길이 = d.get('본문길이', d.get('textLength', 0))
    링크수 = len(d.get('링크목록', d.get('links', [])))
    이미지수 = len(d.get('이미지목록', d.get('images', [])))
    본문 = d.get('본문', d.get('bodyText', ''))
    print(f'  ✅ 성공')
    print(f'  📄 제목: {제목}')
    print(f'  📝 본문: {본문길이}글자')
    print(f'  🔗 링크: {링크수}개')
    print(f'  🖼  이미지: {이미지수}개')
    print(f'  📋 미리보기: {본문[:200]}...')
else:
    print(f'  ❌ 실패: {d.get(\"오류\", d.get(\"error\", \"알 수 없는 오류\"))}')
"
echo ""

# 3. 자동 크롤링 테스트 (자바스크립트 사이트)
echo "[3/3] 홈페이지 자동 크롤링 테스트 (zdhitech.co.kr)..."
curl -s -X POST "$서버주소/crawl-deep" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $비밀키" \
  -d '{"url": "http://www.zdhitech.co.kr", "maxPages": 5}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('성공') or d.get('success'):
    메인 = d.get('메인페이지', d.get('mainPage', {}))
    요약 = d.get('요약', d.get('summary', {}))
    하위 = d.get('하위페이지들', d.get('subPages', []))
    print(f'  ✅ 성공')
    print(f'  📄 메인: {메인.get(\"제목\", 메인.get(\"title\", \"\"))} ({메인.get(\"본문길이\", 메인.get(\"textLength\", 0))}글자)')
    print(f'  📑 수집 페이지: {요약.get(\"수집페이지수\", 요약.get(\"totalPages\", 0))}개')
    print(f'  📊 전체 글자수: {요약.get(\"전체글자수\", 요약.get(\"totalText\", 0))}자')
    for sp in 하위:
        이름 = sp.get('메뉴이름', sp.get('menuText', ''))
        길이 = sp.get('본문길이', sp.get('textLength', 0))
        오류 = sp.get('오류', sp.get('error', ''))
        상태 = '✅' if not 오류 else '❌'
        print(f'     {상태} {이름} → {길이}글자')
else:
    print(f'  ❌ 실패: {d.get(\"오류\", d.get(\"error\", \"알 수 없는 오류\"))}')
"

echo ""
echo "═══════════════════════════════════════"
echo "  테스트 완료"
echo "═══════════════════════════════════════"
