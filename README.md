# 데이트 플래너

연인·친구와의 데이트 계획을 한 번에 잡아주는 웹사이트예요.

## 기능

- **위치**
  - **내 위치 사용**: 브라우저 위치 권한으로 현재 위치를 기준으로 검색
  - **지역 찍기**: 지도에서 원하는 곳을 클릭하면 그 주변으로 일정 구성
- **검색 반경**: 500m ~ 5km 중 선택 (선택 사항)
- **데이트 시간대**: 시작·종료 시간을 정하면 그 구간에 맞춰 일정을 채움
- **일정 구성**: 식당 → 놀거리(박물관, 갤러리 등) → 카페 순으로 시간대에 맞춰 추천

## 사용 방법

1. `index.html`을 브라우저에서 열기
2. 위치 선택: "내 위치 사용"이면 **내 위치로 이동** 버튼을 누르거나, "지역 찍기"면 지도에서 원하는 곳 클릭
3. (선택) 검색 반경과 데이트 시간대 설정
4. **일정 만들기** 버튼 클릭
5. 나온 계획표를 보고 데이트 코스로 활용

## 기술

- HTML, CSS, JavaScript
- **지도**: 네이버 지도 API 또는 Leaflet + OpenStreetMap
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) (주변 장소 검색, API 키 불필요)

## 네이버 지도 사용하기

네이버 지도처럼 쓰려면 [네이버 클라우드 플랫폼](https://www.ncloud.com/product/applicationService/maps)에서 **Maps (Dynamic Map)** 서비스를 신청한 뒤 **클라이언트 ID**를 발급받으세요.

1. `index.html`을 연다.
2. 상단의 `window.NAVER_MAP_CLIENT_ID = '';` 에서 `''` 안에 발급받은 **클라이언트 ID**를 넣는다.
   - 예: `window.NAVER_MAP_CLIENT_ID = 'abc123xyz';`
3. 페이지를 새로고침하면 네이버 지도가 로드된다.

클라이언트 ID를 비워 두면 **Leaflet + OpenStreetMap** 지도가 사용된다.

## 참고

- 장소 데이터는 OpenStreetMap 기반이라 등록된 곳만 나옵니다. 반경을 넓히거나 다른 지역을 선택해 보세요.
- HTTPS 또는 `localhost`에서 실행해야 위치 권한이 동작합니다.
