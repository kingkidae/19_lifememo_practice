# 인생메모 (Life Memo)

> 당신의 인생을 하나의 노트에 정리해드려요.

일정 · 할 일 · 일기 · 독서 · 여행 · 요리를 한 권의 노트에 기록하는 웹 다이어리입니다.
HTML, CSS, JavaScript(바닐라)만으로 만들었고, 빌드 과정이 없습니다.

## 실행

```bash
# 프로젝트 폴더에서 아무 정적 서버나 실행
python -m http.server 5500
# → http://localhost:5500
```

`index.html`을 더블클릭해 `file://`로 열어도 동작하지만, 위치 권한과 일부 API는 `http://` 환경에서 더 안정적입니다.

## 과제 조건 대응

| 조건 | 구현 |
|---|---|
| HTML·CSS·JS 사용 | 프레임워크 없이 바닐라 JS. 지도 라이브러리 Leaflet만 `vendor/`에 포함 |
| 1페이지: 로컬스토리지 CRUD | `index.html` — 6개 챕터 모두 생성·조회·수정·삭제 (`js/core.js`의 `LM.store`) |
| 2페이지: API로 데이터를 받아 UI 구현 | `discover.html` — 날씨·미세먼지, 장르별 도서 추천, 세계 여행 지도 |
| (추가) 판매 페이지 | `book.html` — 1년의 기록을 종이책으로 만드는 기록책 주문 |
| SEO 최적화 | 아래 체크리스트 참고 |

## 기능

### 1페이지 · 나의 노트 (`index.html`)
1. **일정 관리**: 월간 달력, 분류(개인·업무·약속·기념일·여행), 장소 검색과 현재 위치, 일정 날짜의 날씨 예보(16일 이내)
2. **할 일 목록**: 우선순위·마감일(D-day, 지난 마감 표시), 완료 토글, 두 번 눌러 바로 수정, 필터, 진행률
3. **일기장**: 날씨 6종 선택과 '지금 날씨 불러오기', 장소, 글씨체 6종, 글자 크기 14–32px, 줄 노트 미리보기
4. **독서 기록장**: 별점, 한줄평, 읽은 날짜, 장르, 읽고 싶은 책, 통계, 장르별 추천 페이지로 연결
5. **여행 버킷리스트**: 나라(239개국 자동완성), 우선순위, 계획 시기, 메모, 다녀왔는지 여부, 달성률
6. **요리 노트**: 재료·용량·단위(개, 큰술, g 등)를 고르면 칼로리·탄수화물·단백질·지방·나트륨이 바로 계산됨. 1인분/전체 전환, 1일 기준치 대비 %, 조리 순서 정렬

그 밖에: 탭 해시 라우팅(`#cuisine` 등), JSON 백업 내보내기·가져오기, 다른 탭과 실시간 동기화

### 2페이지 · 발견 (`discover.html`)
1. **오늘의 날씨**: 현재 날씨, 체감온도, 습도·바람·자외선·일출·일몰, PM10·PM2.5 등급(환경부 기준), 24시간·7일 예보, 노트에 적은 다가오는 일정의 날씨
2. **장르별 도서 추천**: 16개 장르, 평점순, 한국어판 필터, 책 소개 상세, '서재에 담기'로 1페이지 독서 기록장에 추가
3. **세계 여행 지도**: 나라를 눌러 방문 표시(배율 5 미만), 확대 후 지도를 눌러 도시 단위 기록(배율 5 이상), 나라·도시 검색, 위키백과 나라 소개, 대륙별 진행률. 1페이지 버킷리스트와 데이터를 공유

### 3페이지 · 기록책 (`book.html`)
> 1년간 작성한 기록을 기념하고 소장하세요.

1. **에디션 3종**: 소프트커버 Daily(29,000원·80쪽), 하드커버 Classic(45,000원·120쪽), 린넨 하드커버+케이스 Heritage(79,000원·200쪽)
2. **기록책 만들기**: 연도와 챕터를 고르면 노트에 쌓인 그 해의 기록으로 예상 페이지 수(4의 배수, 최소 24쪽)를 계산. 기본 쪽수를 넘으면 1쪽당 150원
3. **표지 꾸미기**: 표지 색 5종, 책 제목·지은이, 금박·은박·박 없음을 고르면 표지 미리보기가 바로 바뀜
4. **주문**: 수량(최대 10권), 배송비(5만 원 이상 무료)까지 계산하고 주문서를 `lifememo.orders`에 저장. 나의 주문 목록에서 취소 가능
   - 결제 없이 주문 접수만 저장되는 미리보기 서비스입니다.

메인 페이지에는 노트 아래에 기록책 홍보 배너를, 모든 페이지 메뉴에 '기록책'을 추가했습니다.

## 사용한 공개 API (모두 API 키 불필요)

| 용도 | API |
|---|---|
| 날씨·예보 | Open-Meteo Forecast |
| 미세먼지 | Open-Meteo Air Quality |
| 지명 검색 | Open-Meteo Geocoding → (결과 없으면) OpenStreetMap Nominatim |
| 좌표 → 지명 | BigDataCloud Reverse Geocoding (client) |
| 도서 | Open Library Search / Works / Covers |
| 나라 소개 | 한국어 위키백과 REST API |
| 국기 | flagcdn.com |
| 지도 타일 | Esri World Light Gray Canvas |

## 내려받아 포함한 자료
- `vendor/leaflet/`: Leaflet 1.9.4 (BSD-2)
- `js/data/world.js`, `js/data/countries.js`: Natural Earth 1:50m 국가 경계(퍼블릭 도메인)를 간소화하고 한국어 국가명을 넣어 가공
- `js/data/ingredients.js`: 재료 약 100종의 100g당 영양 정보(식약처 식품영양성분 DB, USDA 자료 참고 근사치)
- `assets/img/`: 파비콘, 앱 아이콘, OG 이미지(직접 제작)

## SEO 체크리스트
- 페이지별 고유 `title`, `meta description`, `canonical`
- Open Graph / Twitter Card와 1200×630 OG 이미지
- JSON-LD 구조화 데이터: `WebSite`, `WebApplication`, `FAQPage`(index), `WebPage`, `BreadcrumbList`(discover)
- 시맨틱 마크업(`header` `nav` `main` `section` `article` `footer`), 페이지당 `h1` 하나, 제목 계층 유지
- `lang="ko"`, viewport, theme-color, `manifest.webmanifest`, 파비콘 세트
- `robots.txt`, `sitemap.xml`
- 검색엔진이 읽을 수 있도록 소개·FAQ·데이터 출처를 정적 HTML로 작성(JS로 그리는 데이터와 분리)
- 성능: 스크립트 `defer`, API 도메인 `preconnect`, 이미지 `loading="lazy"`와 크기 지정, 도서 목록은 화면에 가까워질 때 불러오기
- 접근성: 건너뛰기 링크, ARIA 탭(키보드 ←/→), 라벨, `aria-live`, 포커스 표시, `prefers-reduced-motion`

> **배포 전 할 일**: `https://lifememo.example.com`을 실제 도메인으로 모두 바꿔 주세요.
> 해당 파일: `index.html`, `discover.html`, `book.html`, `robots.txt`, `sitemap.xml`

## 폴더 구조
```
index.html            나의 노트 (로컬스토리지 CRUD)
discover.html         발견 (API)
book.html             기록책 (판매)
css/  base.css · note.css · discover.css · book.css
js/   core.js         저장소(CRUD)·API·UI 공통 모듈
      note/           agenda · todo · journal · library · voyage · cuisine · main
      discover/       weather · books · map
      book/           book (기록책 집계·가격·주문)
      data/           countries · world · ingredients
vendor/leaflet/       지도 라이브러리
assets/img/           아이콘·OG 이미지
robots.txt · sitemap.xml · manifest.webmanifest
```

## 로컬스토리지 키
`lifememo.schedules` · `todos` · `diaries` · `books` · `trips` · `recipes` · `visitedCountries` · `visitedCities` · `orders` · `pref.*`
