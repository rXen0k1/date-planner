(function () {
  'use strict';

  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  const OSRM_URL = 'https://router.project-osrm.org';
  const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
  const AIR_QUALITY_URL = 'https://air-quality.api.open-meteo.com/v1/air-quality';
  /* 혼잡도 외부 API: 네이버 사용 중. 구글 Places API로 바꿀 때는 enrichPlanWithNaverCongestion 대신 enrichPlanWithGoogleCongestion 호출하면 됨 */
  const NAVER_SEARCH_LOCAL_URL = '/.netlify/functions/naver-search';
  const DEFAULT_LAT = 37.5665;
  const DEFAULT_LNG = 126.978;
  const WASHINGTON_DC_LAT = 38.9072;
  const WASHINGTON_DC_LNG = -77.0369;
  const DEFAULT_ZOOM = 14;
  var weatherTheme = null;
  var fourDayForecast = null;
  var selectedForecastDayIndex = 0;
  var lastForecastLat = DEFAULT_LAT;
  var lastForecastLng = DEFAULT_LNG;
  /* 예상 비용: 실제 맛집/카페 단가에 맞춰 여유 있게 책정 (너무 적게 나오지 않도록) */
  var ESTIMATED_COST_BY_TIER = {
    cheap: { restaurant: 14000, cafe: 7000, activity: 12000, park: 0 },
    normal: { restaurant: 30000, cafe: 13000, activity: 18000, park: 0 },
    expensive: { restaurant: 55000, cafe: 22000, activity: 35000, park: 0 },
  };

  const LANG_STORAGE = 'date-planner-lang';
  let currentLang = localStorage.getItem(LANG_STORAGE) || 'ko';

  const PREF_STORAGE_PREFIX = 'date-planner-prefs-';
  let currentUser = null;       // { id, email } 또는 null (Supabase 로그인 시)
  let currentUserName = null;   // 화면에 표시할 이름(이메일 또는 닉네임)
  var supabaseClient = null;    // Supabase 클라이언트 (한 번만 생성)

  const TRANSLATIONS = {
    ko: {
      brand: '데이트 플래너',
      searchPlaceholder: '장소·주소 검색',
      searchBtn: '검색',
      login: '로그인',
      logout: '로그아웃',
      signup: '회원가입',
      heroTag: '데이트 루틴 고민 끝',
      heroTitleBefore: '일정 ',
      heroTitleHighlight: '뚝딱',
      heroTitleAfter: ' 만들어줄게',
      heroDesc: '위치·시간만 알려주면 맛집·카페·놀거리까지 쭉 채워줌',
      btnGenerate: '일정 만들기',
      cardPlansTitle: '내 계획표',
      plansEmptyText: '아직 만든 계획 없음',
      plansEmptyHint: '필터 설정하고 일정 만들기 눌러봐',
      cardSettingsTitle: '설정',
      labelLocation: '위치',
      chipMyLocation: '내 위치',
      chipPickMap: '지도 찍기',
      locationHintDefault: "내 위치 쓰려면 아래에서 위치 잡아줘",
      labelRadius: '반경 (선택)',
      labelTimeRange: '시간대 (선택)',
      btnMyLocation: '📍 내 위치로 이동',
      mapHintDefault: "내 위치를 사용합니다. '내 위치로 이동'을 눌러 주세요.",
      mapHintPick: '지도에서 원하는 지역을 클릭하면 그 주변으로 일정을 짜요.',
      resultBadge: '오늘의 플랜',
      resultTitle: '데이트 루트',
      resultMetaMy: '내 위치 기준 반경 ',
      resultMetaPick: '선택한 지역 기준 반경 ',
      resultMetaSuffix: 'km, ',
      resultMetaSuffixPick: 'km, ',
      btnReset: '다시 만들기',
      loadingText: '주변 장소 찾는 중...',
      planCardTitle: '방금 만든 계획',
      btnEdit: '수정',
      btnDelete: '삭제',
      confirmDelete: '이 일정을 삭제할까요?',
      currentLocation: '현재 위치',
      pickHerePlan: '여기 주변으로 일정 만들기',
      errNoGeolocation: '이 브라우저에서는 위치 기능을 지원하지 않아요.',
      errLocationFailed: '위치를 가져올 수 없어요. 지도에서 지역을 클릭해 주세요.',
      errLocationPermissionDenied: '위치 권한이 차단된 상태라서 허용 창이 안 뜹니다. 주소창 왼쪽 자물쇠(또는 사이트 아이콘) 클릭 → 사이트 설정 → 위치 → "먼저 묻기" 또는 "허용"으로 바꾼 뒤, 이 페이지를 새로고침하고 다시 "일정 만들기"를 눌러 주세요. 그러면 "위치 공유 허용할까요?" 창이 다시 뜹니다.',
      errLocationInsecure: '위치 허용 창은 localhost에서만 뜹니다. 터미널에서 이 폴더로 이동한 뒤 "npx serve ." 를 입력하고, 브라우저에서 http://localhost:3000 을 열어보세요. 또는 지역에서 "지도 찍기"를 선택해 주세요.',
      errNoLocation: '위치를 정해 주세요. "내 위치로 이동"을 누르거나, 지도에서 지역을 클릭해 주세요.',
      errTimeRange: '종료 시간이 시작 시간보다 뒤여야 해요.',
      errNoPlaces: '주변에 등록된 장소가 없어요. 반경을 넓히거나 다른 지역을 선택해 보세요.',
      errGenerate: '일정을 만드는 중 오류가 났어요. 잠시 후 다시 시도해 주세요.',
      locationConfirming: '위치 확인 중...',
      locationConfirmed: '위치 확인됨',
      promptUserName: '사용자 이름을 입력해 주세요.',
      loginModalTitle: '로그인',
      loginModalDesc: '이메일과 비밀번호를 입력하세요.',
      loginEmailPlaceholder: '이메일',
      loginPasswordPlaceholder: '비밀번호',
      loginModalSubmit: '로그인',
      loginToSignupLink: '계정이 없어요? 회원가입',
      signupModalTitle: '회원가입',
      signupModalDesc: '이메일과 비밀번호를 입력하고 가입하세요.',
      signupEmailPlaceholder: '이메일',
      signupPasswordPlaceholder: '비밀번호 (6자 이상)',
      signupNamePlaceholder: '닉네임 (선택)',
      signupSubmit: '가입하기',
      signupToLoginLink: '이미 계정이 있어요? 로그인',
      errAuth: '로그인에 실패했어요. 이메일과 비밀번호를 확인해 주세요.',
      errSignup: '회원가입에 실패했어요. 비밀번호는 6자 이상이어야 해요.',
      errSupabaseNotConfigured: '로그인을 쓰려면 Supabase URL과 Anon Key를 설정해 주세요.',
      signupSuccess: '가입 완료! 이메일 확인 링크를 보냈어요. 메일함을 확인해 주세요.',
      defaultUserName: '사용자',
      mapLoadError: '지도를 불러올 수 없어요. 네이버 지도 API 키를 설정하거나 네트워크를 확인해 주세요.',
      mapLoadFailed: '지도 로드 실패',
      type_restaurant: '식당',
      type_cafe: '카페',
      type_fast_food: '패스트푸드',
      type_bar: '바',
      type_ice_cream: '아이스크림',
      type_museum: '박물관',
      type_gallery: '갤러리',
      type_theme_park: '테마파크',
      type_attraction: '관광명소',
      type_mall: '쇼핑몰',
      type_park: '공원',
      type_place: '장소',
      nameUnknown: '이름 없음',
      labelCourseOrder: '코스 순서 (선택)',
      courseOrderDefault: '선택',
      courseOrderRandom: '랜덤',
      courseOrderCustom: '직접 순서',
      courseOrder1st: '1순위',
      courseOrder2nd: '2순위',
      courseOrder3rd: '3순위',
      courseOrder4th: '4순위',
      courseTypeRestaurant: '식당',
      courseTypeCafe: '카페',
      courseTypeActivity: '놀거리',
      courseTypePark: '공원',
      courseOrderSkip: '선택 안함',
      labelQuickRegion: '지역 (선택)',
      labelCongestionPreference: '인기도 (선택)',
      congestionPreferenceHint: '숨은명소=숨은명소·대중적만, 대중적=전부, 핫플=대중적·핫플만 추천해요',
      labelMbtiPJ: '코스 스타일 (P/J) (선택)',
      labelMbtiIE: '장소 분위기 (I/E)',
      mbtiPJNone: '선택',
      mbtiIENone: '선택',
      mbtiP: 'P 넉넉한 코스',
      mbtiJ: 'J 1분 단위',
      mbtiI: 'I 조용한',
      mbtiE: 'E 시끌벅적',
      mbtiHint: 'P=여유 있는 코스, J=시간 정확히 움직이는 스타일',
      mbtiBadgeP: '넉넉한 코스',
      mbtiBadgeJ: '1분 단위 코스',
      btnQuickCourse: '오늘 코스 뚝딱',
      showAdvanced: '상세 설정으로 만들기',
      labelTransport: '이동 수단 (선택)',
      transportWalk: '도보',
      transportCar: '자차',
      transportTransit: '대중교통',
      labelHasCar: '자차 보유',
      hasCarHint: '끄면 도보·대중교통만 사용해요',
      btnOptimizeRoute: '동선 최적화',
      congestionRelaxed: '💎 숨은명소',
      congestionNormal: '✨ 대중적',
      congestionBusy: '🔥 핫플',
      btnSaveCoursePreset: '내 코스 취향 저장하기',
      loginToSavePreset: '로그인하면 코스 스타일과 순서를 저장해 둘 수 있어요.',
      presetSaved: '지금 설정이 로그인한 계정의 기본 코스로 저장됐어요.',
      savePresetModalTitle: '저장하기',
      saveCurrentSetting: '현재 설정 저장하기',
      saveCustomSetting: '커스텀 설정 저장하기',
      customPresetDesc: '저장할 이름과 원하는 설정을 입력하세요. (선택)',
      customPresetNamePlaceholder: '저장 이름 (예: 데이트 A)',
      customPresetSaveBtn: '저장',
      customPresetLabelRegion: '지역 (선택)',
      customPresetRegionMy: '내 위치',
      customPresetRegionPick: '지도 찍기',
      customPresetLabelPriceTier: '가격대 (선택)',
      customPresetLabelCourseStyle: '코스 스타일 (선택)',
      customPresetLabelCongestion: '인기도 (선택)',
      customPresetLabelCourseOrder: '코스 순서 (선택)',
      customPresetLabelTransport: '이동 수단 (선택)',
      customPresetHasCarLabel: '자차 있음',
      customPresetLabelRadius: '반경 (선택)',
      customPresetLabelTimeRange: '시간대 (선택)',
      customPresetPickCoordsSaved: '저장될 위치: 위도 %.2f, 경도 %.2f',
      customPresetPickCoordsNone: '지도에서 위치를 먼저 찍어 주세요.',
      customPresetMapModalTitle: '위치 선택',
      customPresetMapSearchPlaceholder: '주소 또는 장소 검색',
      btnCustomPresetMapSearch: '검색',
      customPresetMapHint: '지도를 클릭하거나 검색해서 위치에 핀을 찍고 확인을 누르세요.',
      btnCustomPresetMapConfirm: '확인',
      btnCustomPresetMapCancel: '취소',
      btnOpenCustomPresetMapText: '지도에서 위치 선택',
      savePresetBack: '뒤로',
      savePresetClose: '취소',
      presetSavedCustom: '커스텀 설정으로 저장됐어요.',
      errCustomPresetName: '저장 이름을 입력해 주세요.',
      loadPresetToggle: '저장한 설정 불러오기',
      presetDefault: '기본',
      noSavedPresets: '저장된 설정이 없어요.',
      presetLoaded: '설정을 불러왔어요.',
      presetEdit: '수정',
      presetDelete: '삭제',
      presetDeleted: '설정을 삭제했어요.',
      presetUpdated: '설정을 수정했어요.',
      confirmDeletePreset: '이 설정을 삭제할까요?',
      saveCurrentSelectTitle: '저장할 항목을 선택하세요 (선택)',
      optionRegion: '지역 (선택)',
      optionPriceTier: '가격대 (선택)',
      optionCourseStyle: '코스 스타일 (선택)',
      optionCongestion: '인기도 (선택)',
      optionCourseOrder: '코스 순서 (선택)',
      optionTransport: '이동 수단 (선택)',
      optionRadius: '반경 (선택)',
      optionTimeRange: '시간대 (선택)',
      saveCurrentConfirm: '저장',
      shareTitle: '함께 짜기',
      shareDesc: '가고 싶은 곳을 찍고 링크로 공유하면 상대방도 장소를 추가하거나 투표할 수 있어요',
      btnCopyShareLink: '링크 복사해서 공유하기',
      shareLinkCopied: '링크가 복사되었어요! 상대방에게 보내보세요.',
      shareListTitle: '장소 목록',
      sharePlaceEmpty: '아직 추가된 장소가 없어요. 지도에서 클릭해 보세요.',
      tabCourse: '코스 뚝딱',
      tabShare: '함께 짜기',
      radiusCustomLabel: '직접 입력 (km)',
      radiusCustomPlaceholder: '예: 2.5',
      radiusCustomHint: '0.1 ~ 50 km 사이로 입력해 주세요',
      radiusOptionCustom: '사용자 설정',
      errRadiusCustom: '사용자 설정을 선택했으면 거리(km)를 입력해 주세요. (0.1 ~ 50)',
      errNoLocationPick: '지도 찍기를 선택했어요. 아래 지도에서 위치를 클릭한 뒤 다시 오늘 코스 뚝딱을 눌러 주세요.',
      timeShortageExcluded: '시간이 부족해',
      timeShortageExcludedSuffix: '일정을 제외했어요.',
      substitutionNotice: '반경 안에 원하시는 장소 유형이 없어 다른 유형으로 대체했어요.',
      substitutionItem: '%s → %s',
      timeShortageHint: '시간이 부족할 경우 일정이 줄어들 수 있어요.',
      weatherRecommendRain: '비/눈 예정 → 실내 몰 데이트 추천',
      weatherRecommendDust: '미세먼지 나쁨 → 영화관·실내 전시 추천',
      weatherRecommendFine: '맑음 · 공원 산책 추천',
      weatherRecommendCloudy: '흐림 · 실내·야외 모두 괜찮아요',
      weatherRecommendFog: '안개 · 실내 데이트 추천',
      weatherSeoulBased: '서울 기준',
      weatherWashingtonBased: 'Washington, D.C.',
      weatherCardTitle: '날씨',
      weatherSelectDayPrompt: '일정 계획 날을 선택하세요.',
      weatherLocationBased: '선택한 장소 기준',
      weatherLoading: '날씨 불러오는 중…',
      dayToday: '오늘',
      dayTomorrow: '내일',
      daySun: '일', dayMon: '월', dayTue: '화', dayWed: '수', dayThu: '목', dayFri: '금', daySat: '토',
      wmoClear: '맑음',
      wmoPartlyCloudy: '구름 조금',
      wmoCloudy: '흐림',
      wmoFog: '안개',
      wmoDrizzle: '이슬비',
      wmoRain: '비',
      wmoSnow: '눈',
      wmoShowers: '소나기',
      wmoThunder: '천둥번개',
      tempUnit: '°C',
      labelPriceTier: '가격대 (선택)',
      priceTierCheap: '저렴',
      priceTierNormal: '보통',
      priceTierExpensive: '비쌈',
      priceTierHint: '저렴/보통/비쌈 선택 시 같은 유형·가격대 장소를 우선 추천해요.',
      labelBudget: '인당 예산 (원)',
      budgetPlaceholder: '예: 50000 (비우면 무시)',
      budgetHint: '입력한 금액에 맞춰 식당·카페·놀거리 예상 비용으로 코스를 짜요',
      btnKakaoShare: '카톡 공유',
      kakaoCopied: '복사됐어요! 카톡에 붙여넣기 하세요.',
      btnCardShare: '카드로 공유',
      cardShareTitle: '오늘 우리의 %s 데이트 기록',
      cardShareHint: '아래 버튼으로 텍스트를 복사한 뒤 카톡에 붙여넣기 하거나, 이 화면을 캡처해서 공유해 보세요.',
      btnCopyCardText: '텍스트 복사',
      cardShareClose: '닫기',
      cardCopied: '카드 텍스트가 복사됐어요! 카톡에 붙여넣기 하세요.',
      budgetExceeded: '예산이 부족해 일부 코스를 제외했어요.',
      budgetDisclaimer: '예상 비용은 실제와 다를 수 있어요. 여유 있게 준비해 주세요.',
      placeDataDisclaimer: '장소 정보는 OpenStreetMap 기준이라 폐업·이전된 곳이 있을 수 있어요. 방문 전 아래에서 지도로 한 번 확인해 주세요.',
      placeVerifyMap: '지도에서 확인',
      placeReplaceBtn: '다른 곳으로',
      placeHighlightLabel: '인생샷·분위기·데이트 추천',
      errNoOtherPlace: '주변에 같은 유형의 다른 장소가 없어요.',
    },
    en: {
      brand: 'Date Planner',
      searchPlaceholder: 'Search place or address',
      searchBtn: 'Search',
      login: 'Log in',
      logout: 'Log out',
      signup: 'Sign up',
      heroTag: 'No more date planning stress',
      heroTitleBefore: 'Get your ',
      heroTitleHighlight: 'plan',
      heroTitleAfter: ' in a snap',
      heroDesc: 'Tell us where and when—we\'ll fill in restaurants, cafes, and things to do.',
      btnGenerate: 'Create plan',
      cardPlansTitle: 'My plans',
      plansEmptyText: 'No plans yet',
      plansEmptyHint: 'Set filters and click Create plan',
      cardSettingsTitle: 'Settings',
      labelLocation: 'Location',
      chipMyLocation: 'My location',
      chipPickMap: 'Pick on map',
      locationHintDefault: 'Set your location below to use my location.',
      labelRadius: 'Radius (Select)',
      labelTimeRange: 'Time range (Select)',
      btnMyLocation: '📍 Go to my location',
      mapHintDefault: 'Using my location. Click "Go to my location" below.',
      mapHintPick: 'Click on the map to plan around that area.',
      resultBadge: "Today's plan",
      resultTitle: 'Date route',
      resultMetaMy: 'Within ',
      resultMetaPick: 'Within ',
      resultMetaSuffix: ' km, ',
      resultMetaSuffixPick: ' km of selected area, ',
      btnReset: 'Create again',
      loadingText: 'Finding places nearby...',
      planCardTitle: 'Latest plan',
      btnEdit: 'Edit',
      btnDelete: 'Delete',
      confirmDelete: 'Delete this plan?',
      currentLocation: 'Current location',
      pickHerePlan: 'Plan around here',
      errNoGeolocation: 'This browser doesn\'t support location.',
      errLocationFailed: 'Could not get location. Please click on the map to choose an area.',
      errLocationPermissionDenied: 'Location is blocked, so the prompt won\'t show. Click the lock/site icon in the address bar → Site settings → Location → set to "Ask" or "Allow", then refresh this page and click the button again. The "Allow location?" prompt will appear.',
      errLocationInsecure: 'The location prompt only appears on localhost. Run "npx serve ." in this folder and open http://localhost:3000 in your browser. Or choose "Pick on map" for region.',
      errNoLocation: 'Please set location: click "Go to my location" or click on the map.',
      errTimeRange: 'End time must be after start time.',
      errNoPlaces: 'No places found nearby. Try a larger radius or another area.',
      errGenerate: 'Something went wrong. Please try again later.',
      locationConfirming: 'Getting location...',
      locationConfirmed: 'Location set',
      promptUserName: 'Enter your name.',
      loginModalTitle: 'Log in',
      loginModalDesc: 'Enter your email and password.',
      loginEmailPlaceholder: 'Email',
      loginPasswordPlaceholder: 'Password',
      loginModalSubmit: 'Log in',
      loginToSignupLink: "Don't have an account? Sign up",
      signupModalTitle: 'Sign up',
      signupModalDesc: 'Enter your email and password to create an account.',
      signupEmailPlaceholder: 'Email',
      signupPasswordPlaceholder: 'Password (min 6 characters)',
      signupNamePlaceholder: 'Display name (optional)',
      signupSubmit: 'Sign up',
      signupToLoginLink: 'Already have an account? Log in',
      errAuth: 'Login failed. Check your email and password.',
      errSignup: 'Sign up failed. Password must be at least 6 characters.',
      errSupabaseNotConfigured: 'Set SUPABASE_URL and SUPABASE_ANON_KEY to use login.',
      signupSuccess: 'Signed up! Check your email for the confirmation link.',
      defaultUserName: 'User',
      mapLoadError: 'Could not load map. Check your network or Naver Map API key.',
      mapLoadFailed: 'Map load failed',
      type_restaurant: 'Restaurant',
      type_cafe: 'Cafe',
      type_fast_food: 'Fast food',
      type_bar: 'Bar',
      type_ice_cream: 'Ice cream',
      type_museum: 'Museum',
      type_gallery: 'Gallery',
      type_theme_park: 'Theme park',
      type_attraction: 'Attraction',
      type_mall: 'Mall',
      type_park: 'Park',
      type_place: 'Place',
      nameUnknown: 'Unnamed',
      labelCourseOrder: 'Course order (Select)',
      courseOrderDefault: 'Select',
      courseOrderRandom: 'Random',
      courseOrderCustom: 'Custom order',
      courseOrder1st: '1st',
      courseOrder2nd: '2nd',
      courseOrder3rd: '3rd',
      courseOrder4th: '4th',
      courseTypeRestaurant: 'Restaurant',
      courseTypeCafe: 'Cafe',
      courseTypeActivity: 'Activity',
      courseTypePark: 'Park',
      courseOrderSkip: 'Skip',
      labelQuickRegion: 'Region (Select)',
      labelCongestionPreference: 'Popularity (Select)',
      congestionPreferenceHint: 'Hidden gem & popular only, Normal=all, Hot=popular & hot only',
      labelMbtiPJ: 'Course style (P/J) (Select)',
      labelMbtiIE: 'Vibe (I/E)',
      mbtiPJNone: 'Select',
      mbtiIENone: 'Select',
      mbtiP: 'P Relaxed course',
      mbtiJ: 'J Minute precision',
      mbtiI: 'I Quiet spots',
      mbtiE: 'E Lively spots',
      mbtiHint: 'P=roomy course, J=precise times',
      mbtiBadgeP: 'Relaxed course',
      mbtiBadgeJ: 'Minute-by-minute',
      btnQuickCourse: 'Get course',
      showAdvanced: 'Advanced settings',
      labelTransport: 'Transport (Select)',
      transportWalk: 'Walk',
      transportCar: 'Car',
      transportTransit: 'Transit',
      labelHasCar: 'I have a car',
      hasCarHint: 'Off = walk/transit only',
      btnOptimizeRoute: 'Optimize route',
      congestionRelaxed: '💎 Hidden gem',
      congestionNormal: '✨ Popular',
      congestionBusy: '🔥 Hot spot',
      btnSaveCoursePreset: 'Save my course style',
      loginToSavePreset: 'Log in to save your course style and order.',
      presetSaved: 'Current settings saved as your default course.',
      savePresetModalTitle: 'Save',
      saveCurrentSetting: 'Save current settings',
      saveCustomSetting: 'Save custom settings',
      customPresetDesc: 'Enter a name and the settings you want to save. (optional)',
      customPresetNamePlaceholder: 'Preset name (e.g. Date A)',
      customPresetSaveBtn: 'Save',
      customPresetLabelRegion: 'Region (Select)',
      customPresetRegionMy: 'My location',
      customPresetRegionPick: 'Pick on map',
      customPresetLabelPriceTier: 'Price range (Select)',
      customPresetLabelCourseStyle: 'Course style (Select)',
      customPresetLabelCongestion: 'Popularity (Select)',
      customPresetLabelCourseOrder: 'Course order (Select)',
      customPresetLabelTransport: 'Transport (Select)',
      customPresetHasCarLabel: 'I have a car',
      customPresetLabelRadius: 'Radius (Select)',
      customPresetLabelTimeRange: 'Time range (Select)',
      customPresetPickCoordsSaved: 'Location to save: lat %.2f, lng %.2f',
      customPresetPickCoordsNone: 'Pick a location on the map first.',
      customPresetMapModalTitle: 'Choose location',
      customPresetMapSearchPlaceholder: 'Search address or place',
      btnCustomPresetMapSearch: 'Search',
      customPresetMapHint: 'Click on the map or search to place a pin, then click Confirm.',
      btnCustomPresetMapConfirm: 'Confirm',
      btnCustomPresetMapCancel: 'Cancel',
      btnOpenCustomPresetMapText: 'Choose on map',
      savePresetBack: 'Back',
      savePresetClose: 'Cancel',
      presetSavedCustom: 'Saved as custom preset.',
      errCustomPresetName: 'Please enter a name.',
      loadPresetToggle: 'Load saved settings',
      presetDefault: 'Default',
      noSavedPresets: 'No saved settings.',
      presetLoaded: 'Settings loaded.',
      presetEdit: 'Edit',
      presetDelete: 'Delete',
      presetDeleted: 'Preset deleted.',
      presetUpdated: 'Preset updated.',
      confirmDeletePreset: 'Delete this preset?',
      saveCurrentSelectTitle: 'Choose items to save (optional)',
      optionRegion: 'Region (Select)',
      optionPriceTier: 'Price range (Select)',
      optionCourseStyle: 'Course style (Select)',
      optionCongestion: 'Popularity (Select)',
      optionCourseOrder: 'Course order (Select)',
      optionTransport: 'Transport (Select)',
      optionRadius: 'Radius (Select)',
      optionTimeRange: 'Time range (Select)',
      saveCurrentConfirm: 'Save',
      shareTitle: 'Plan together',
      shareDesc: 'Pin places and share the link so your partner can add or vote.',
      btnCopyShareLink: 'Copy link to share',
      shareLinkCopied: 'Link copied! Send it to your partner.',
      shareListTitle: 'Places',
      sharePlaceEmpty: 'No places yet. Click on the map to add.',
      tabCourse: 'Course',
      tabShare: 'Together',
      radiusCustomLabel: 'Custom distance (km)',
      radiusCustomPlaceholder: 'e.g. 2.5',
      radiusCustomHint: 'Enter between 0.1 and 50 km',
      radiusOptionCustom: 'Custom',
      errRadiusCustom: 'Please enter a distance in km (0.1–50) when using Custom.',
      errNoLocationPick: 'You chose "Pick on map". Click a location on the map below, then click the button again.',
      timeShortageExcluded: 'Not enough time—excluded',
      timeShortageExcludedSuffix: 'from the schedule.',
      substitutionNotice: 'No places of the requested type within radius; substituted with another type.',
      substitutionItem: '%s → %s',
      timeShortageHint: 'Schedule may be shortened if time is limited.',
      weatherRecommendRain: 'Rain/snow → Indoor mall date recommended',
      weatherRecommendDust: 'Poor air quality → Cinema / indoor exhibition recommended',
      weatherRecommendFine: 'Clear · Park walk recommended',
      weatherRecommendCloudy: 'Cloudy · Indoor or outdoor both fine',
      weatherRecommendFog: 'Fog · Indoor date recommended',
      weatherSeoulBased: 'Seoul',
      weatherWashingtonBased: 'Washington, D.C.',
      weatherCardTitle: 'Weather',
      weatherSelectDayPrompt: 'Select a date for your plan.',
      weatherLocationBased: 'Selected location',
      weatherLoading: 'Loading weather…',
      dayToday: 'Today',
      dayTomorrow: 'Tomorrow',
      daySun: 'Sun', dayMon: 'Mon', dayTue: 'Tue', dayWed: 'Wed', dayThu: 'Thu', dayFri: 'Fri', daySat: 'Sat',
      wmoClear: 'Clear',
      wmoPartlyCloudy: 'Partly cloudy',
      wmoCloudy: 'Cloudy',
      wmoFog: 'Fog',
      wmoDrizzle: 'Drizzle',
      wmoRain: 'Rain',
      wmoSnow: 'Snow',
      wmoShowers: 'Showers',
      wmoThunder: 'Thunderstorm',
      tempUnit: '°C',
      labelPriceTier: 'Price range (Select)',
      priceTierCheap: 'Budget',
      priceTierNormal: 'Moderate',
      priceTierExpensive: 'Upscale',
      priceTierHint: 'We prefer place types and price range that match your selection.',
      labelBudget: 'Budget per person (₩)',
      budgetPlaceholder: 'e.g. 50000 (leave blank to ignore)',
      budgetHint: 'We\'ll plan course to fit estimated cost within your budget.',
      btnKakaoShare: 'Copy for KakaoTalk',
      kakaoCopied: 'Copied! Paste into KakaoTalk.',
      btnCardShare: 'Share as card',
      cardShareTitle: "Today's %s date record",
      cardShareHint: 'Copy the text below to paste in KakaoTalk, or take a screenshot of this card to share.',
      btnCopyCardText: 'Copy text',
      cardShareClose: 'Close',
      cardCopied: 'Card text copied! Paste into KakaoTalk.',
      budgetExceeded: 'Some items excluded to fit your budget.',
      budgetDisclaimer: 'Estimates may vary. Please bring enough cash.',
      placeDataDisclaimer: 'Place data is from OpenStreetMap; some places may be closed or moved. Please verify on the map before visiting.',
      placeVerifyMap: 'Verify on map',
      placeReplaceBtn: 'Pick another',
      placeHighlightLabel: 'Recommended for life shot, mood, date',
      errNoOtherPlace: 'No other place of this type nearby.',
    },
  };

  function t(key) {
    return TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key] != null
      ? TRANSLATIONS[currentLang][key]
      : (TRANSLATIONS.ko[key] || key);
  }

  function applyLanguage() {
    document.documentElement.lang = currentLang === 'ko' ? 'ko' : 'en';
    document.title = currentLang === 'ko' ? 'Auvia (오비아) | 5초 만에 짜는 완벽한 데이트 코스' : 'Auvia | Date Planner';
    var set = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text; };
    var setHtml = function (id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; };
    if (searchInput) searchInput.placeholder = t('searchPlaceholder');
    if ($('btnSearch')) $('btnSearch').textContent = t('searchBtn');
    set('btnLogin', t('login'));
    if (btnSignUp) btnSignUp.textContent = t('signup');
    set('heroTag', t('heroTag'));
    set('heroTitleBefore', t('heroTitleBefore'));
    set('heroTitleHighlight', t('heroTitleHighlight'));
    set('heroTitleAfter', t('heroTitleAfter'));
    set('heroDesc', t('heroDesc'));
    set('btnGenerateText', t('btnGenerate'));
    set('cardPlansTitle', t('cardPlansTitle'));
    set('plansEmptyText', t('plansEmptyText'));
    setHtml('plansEmptyHint', t('plansEmptyHint').replace(t('btnGenerate'), '<strong>' + t('btnGenerate') + '</strong>'));
    set('cardSettingsTitle', t('cardSettingsTitle'));
    set('labelLocation', t('labelLocation'));
    set('chipMyLocation', t('chipMyLocation'));
    set('chipPickMap', t('chipPickMap'));
    set('labelRadius', t('labelRadius'));
    var radiusOptCustom = document.getElementById('radiusOptionCustom');
    if (radiusOptCustom) radiusOptCustom.textContent = t('radiusOptionCustom');
    set('labelRadiusCustom', t('radiusCustomLabel'));
    if ($('radiusCustom')) $('radiusCustom').placeholder = t('radiusCustomPlaceholder');
    if ($('radiusCustomHint')) $('radiusCustomHint').textContent = t('radiusCustomHint');
    set('labelTimeRange', t('labelTimeRange'));
    if ($('timeShortageHint')) $('timeShortageHint').textContent = t('timeShortageHint');
    set('btnMyLocation', t('btnMyLocation'));
    if (mapHint) mapHint.textContent = t('mapHintDefault');
    set('resultBadge', t('resultBadge'));
    set('resultTitle', t('resultTitle'));
    set('btnReset', t('btnReset'));
    set('loadingText', t('loadingText'));
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
    });
    if (currentUser && btnLogin) btnLogin.textContent = t('logout');
    set('loginModalTitle', t('loginModalTitle'));
    set('loginModalDesc', t('loginModalDesc'));
    if (loginModalEmail) loginModalEmail.placeholder = t('loginEmailPlaceholder');
    if (loginModalPassword) loginModalPassword.placeholder = t('loginPasswordPlaceholder');
    set('loginModalSubmit', t('loginModalSubmit'));
    if (loginModalToSignup) loginModalToSignup.textContent = t('loginToSignupLink');
    set('signupModalTitle', t('signupModalTitle'));
    set('signupModalDesc', t('signupModalDesc'));
    if (signupModalEmail) signupModalEmail.placeholder = t('signupEmailPlaceholder');
    if (signupModalPassword) signupModalPassword.placeholder = t('signupPasswordPlaceholder');
    if (signupModalName) signupModalName.placeholder = t('signupNamePlaceholder');
    set('signupModalSubmit', t('signupSubmit'));
    if (signupModalToLogin) signupModalToLogin.textContent = t('signupToLoginLink');
    if ($('savePresetModalTitle')) $('savePresetModalTitle').textContent = t('savePresetModalTitle');
    if (btnSaveCurrentPreset) btnSaveCurrentPreset.textContent = t('saveCurrentSetting');
    if (btnSaveCustomPreset) btnSaveCustomPreset.textContent = t('saveCustomSetting');
    if ($('customPresetDesc')) $('customPresetDesc').textContent = t('customPresetDesc');
    if (savePresetCustomName) savePresetCustomName.placeholder = t('customPresetNamePlaceholder');
    if ($('customPresetLabelRegion')) $('customPresetLabelRegion').textContent = t('customPresetLabelRegion');
    if ($('customPresetRegionMy')) $('customPresetRegionMy').textContent = t('customPresetRegionMy');
    if ($('customPresetRegionPick')) $('customPresetRegionPick').textContent = t('customPresetRegionPick');
    if ($('customPresetLabelPriceTier')) $('customPresetLabelPriceTier').textContent = t('customPresetLabelPriceTier');
    if ($('customPresetLabelCourseStyle')) $('customPresetLabelCourseStyle').textContent = t('customPresetLabelCourseStyle');
    if ($('customPresetLabelCongestion')) $('customPresetLabelCongestion').textContent = t('customPresetLabelCongestion');
    if ($('customPresetLabelCourseOrder')) $('customPresetLabelCourseOrder').textContent = t('customPresetLabelCourseOrder');
    if ($('customPresetLabelTransport')) $('customPresetLabelTransport').textContent = t('customPresetLabelTransport');
    if ($('customPresetHasCarLabel')) $('customPresetHasCarLabel').textContent = t('customPresetHasCarLabel');
    if ($('customPresetLabelRadius')) $('customPresetLabelRadius').textContent = t('customPresetLabelRadius');
    if ($('customPresetLabelTimeRange')) $('customPresetLabelTimeRange').textContent = t('customPresetLabelTimeRange');
    if ($('btnOpenCustomPresetMapText')) $('btnOpenCustomPresetMapText').textContent = t('btnOpenCustomPresetMapText');
    if (btnSaveCustomPresetSubmit) btnSaveCustomPresetSubmit.textContent = t('customPresetSaveBtn');
    if (btnSavePresetBack) btnSavePresetBack.textContent = t('savePresetBack');
    if (btnSavePresetClose) btnSavePresetClose.textContent = t('savePresetClose');
    if ($('saveCurrentSelectTitle')) $('saveCurrentSelectTitle').textContent = t('saveCurrentSelectTitle');
    if (btnSaveCurrentConfirm) btnSaveCurrentConfirm.textContent = t('saveCurrentConfirm');
    if (btnSaveCurrentBack) btnSaveCurrentBack.textContent = t('savePresetBack');
    if ($('btnLoadPresetToggleText')) $('btnLoadPresetToggleText').textContent = t('loadPresetToggle');
    if (mapAdapter && typeof mapAdapter.updateMapLanguage === 'function') mapAdapter.updateMapLanguage(currentLang);
    set('labelQuickRegion', t('labelQuickRegion'));
    set('quickRegionMy', t('chipMyLocation'));
    set('quickRegionPick', t('chipPickMap'));
    set('labelCongestionPreference', t('labelCongestionPreference'));
    if ($('congestionRelaxedLabel')) $('congestionRelaxedLabel').textContent = t('congestionRelaxed');
    if ($('congestionNormalLabel')) $('congestionNormalLabel').textContent = t('congestionNormal');
    if ($('congestionBusyLabel')) $('congestionBusyLabel').textContent = t('congestionBusy');
    if ($('congestionPreferenceHint')) $('congestionPreferenceHint').textContent = t('congestionPreferenceHint');
    set('labelMbtiPJ', t('labelMbtiPJ'));
    set('labelMbtiIE', t('labelMbtiIE'));
    if ($('mbtiPJNone')) $('mbtiPJNone').textContent = t('mbtiPJNone');
    if ($('mbtiIENone')) $('mbtiIENone').textContent = t('mbtiIENone');
    if ($('mbtiP')) $('mbtiP').textContent = t('mbtiP');
    if ($('mbtiJ')) $('mbtiJ').textContent = t('mbtiJ');
    if ($('mbtiI')) $('mbtiI').textContent = t('mbtiI');
    if ($('mbtiE')) $('mbtiE').textContent = t('mbtiE');
    if ($('mbtiHint')) $('mbtiHint').textContent = t('mbtiHint');
    set('labelCourseOrder', t('labelCourseOrder'));
    set('courseOrderRandomText', t('courseOrderRandom'));
    set('courseOrderCustomText', t('courseOrderCustom'));
    set('labelCourseOrder1', t('courseOrder1st'));
    set('labelCourseOrder2', t('courseOrder2nd'));
    set('labelCourseOrder3', t('courseOrder3rd'));
    set('labelCourseOrder4', t('courseOrder4th'));
    var typeLabels = { restaurant: t('courseTypeRestaurant'), cafe: t('courseTypeCafe'), activity: t('courseTypeActivity'), park: t('courseTypePark'), skip: t('courseOrderSkip') };
    [1, 2, 3, 4].forEach(function (n) {
      var sel = $('courseOrder' + n);
      if (sel && sel.options) for (var i = 0; i < sel.options.length; i++) { var o = sel.options[i]; if (typeLabels[o.value]) o.textContent = typeLabels[o.value]; }
    });
    set('btnQuickCourseText', t('btnQuickCourse'));
    set('labelTransport', t('labelTransport'));
    set('transportWalk', t('transportWalk'));
    set('transportCar', t('transportCar'));
    set('transportTransit', t('transportTransit'));
    set('labelHasCar', t('labelHasCar'));
    if ($('hasCarHint')) $('hasCarHint').textContent = t('hasCarHint');
    set('btnOptimizeRouteText', t('btnOptimizeRoute'));
    set('shareTitleHighlight', t('shareTitle'));
    set('shareDesc', t('shareDesc'));
    set('btnCopyShareLinkText', t('btnCopyShareLink'));
    set('shareListTitle', t('shareListTitle'));
    if ($('sharePlaceEmptyText')) $('sharePlaceEmptyText').textContent = t('sharePlaceEmpty');
    if ($('tabCourse')) $('tabCourse').textContent = t('tabCourse');
    if ($('tabShare')) $('tabShare').textContent = t('tabShare');
    if ($('labelPriceTier')) $('labelPriceTier').textContent = t('labelPriceTier');
    if ($('priceTierCheap')) $('priceTierCheap').textContent = t('priceTierCheap');
    if ($('priceTierNormal')) $('priceTierNormal').textContent = t('priceTierNormal');
    if ($('priceTierExpensive')) $('priceTierExpensive').textContent = t('priceTierExpensive');
    if ($('priceTierHint')) $('priceTierHint').textContent = t('priceTierHint');
    if ($('labelBudget')) $('labelBudget').textContent = t('labelBudget');
    if ($('budgetInput')) $('budgetInput').placeholder = t('budgetPlaceholder');
    if ($('budgetHint')) $('budgetHint').textContent = t('budgetHint');
    if ($('btnKakaoShareText')) $('btnKakaoShareText').textContent = t('btnKakaoShare');
    if ($('btnSaveCoursePresetText')) $('btnSaveCoursePresetText').textContent = t('btnSaveCoursePreset');
    if ($('btnCardShareText')) $('btnCardShareText').textContent = t('btnCardShare');
    if (cardShareHint) cardShareHint.textContent = t('cardShareHint');
    if ($('btnCopyCardTextLabel')) $('btnCopyCardTextLabel').textContent = t('btnCopyCardText');
    if (btnCloseCardShare) btnCloseCardShare.textContent = t('cardShareClose');
    set('weatherCardTitle', t('weatherCardTitle'));
    if ($('weatherCardPrompt')) $('weatherCardPrompt').textContent = t('weatherSelectDayPrompt');
    (function () {
      var dc = getDefaultWeatherCenter();
      var isDefault = Math.abs(lastForecastLat - dc.lat) < 0.01 && Math.abs(lastForecastLng - dc.lng) < 0.01;
      if ($('weatherCardSub')) $('weatherCardSub').textContent = isDefault ? (currentLang === 'en' ? t('weatherWashingtonBased') : t('weatherSeoulBased')) : t('weatherLocationBased');
    })();
    updateWeatherRecommendDisplay();
    if (fourDayForecast && fourDayForecast.length) renderFourDayWeatherCard(lastForecastLat, lastForecastLng);
    fetchWeather();
    var newDefault = getDefaultWeatherCenter();
    var wasShowingDefault = (Math.abs(lastForecastLat - DEFAULT_LAT) < 0.01 && Math.abs(lastForecastLng - DEFAULT_LNG) < 0.01) ||
      (Math.abs(lastForecastLat - WASHINGTON_DC_LAT) < 0.01 && Math.abs(lastForecastLng - WASHINGTON_DC_LNG) < 0.01);
    if (wasShowingDefault) fetchFourDayForecast(newDefault.lat, newDefault.lng);
  }

  function closeLoginModal() {
    if (!loginModal) return;
    loginModal.classList.remove('is-visible');
    loginModal.setAttribute('aria-hidden', 'true');
    if (loginModalError) loginModalError.textContent = '';
  }

  function closeSignupModal() {
    if (!signupModal) return;
    signupModal.classList.remove('is-visible');
    signupModal.setAttribute('aria-hidden', 'true');
    if (signupModalError) signupModalError.textContent = '';
  }

  function showLoginModal() {
    if (!loginModal || !loginModalEmail || !loginModalPassword) return;
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      showError(t('errSupabaseNotConfigured'));
      return;
    }
    loginModalEmail.value = '';
    loginModalPassword.value = '';
    if (loginModalError) loginModalError.textContent = '';
    loginModalEmail.placeholder = t('loginEmailPlaceholder');
    loginModalPassword.placeholder = t('loginPasswordPlaceholder');
    loginModal.setAttribute('aria-hidden', 'false');
    loginModal.classList.add('is-visible');
    loginModalEmail.focus();

    function submit() {
      var email = (loginModalEmail.value || '').trim();
      var password = (loginModalPassword.value || '');
      if (!email || !password) {
        if (loginModalError) loginModalError.textContent = t('errAuth');
        return;
      }
      if (!supabaseClient) {
        if (loginModalError) loginModalError.textContent = t('errSupabaseNotConfigured');
        return;
      }
      supabaseClient.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) {
            if (loginModalError) loginModalError.textContent = res.error.message || t('errAuth');
            return;
          }
          closeLoginModal();
        })
        .catch(function () {
          if (loginModalError) loginModalError.textContent = t('errAuth');
        });
    }

    if (loginModalSubmit) loginModalSubmit.onclick = submit;
    if (loginModalBackdrop) loginModalBackdrop.onclick = closeLoginModal;
    if (loginModalToSignup) {
      loginModalToSignup.onclick = function () {
        closeLoginModal();
        showSignupModal();
      };
    }
    loginModalEmail.onkeydown = loginModalPassword.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') closeLoginModal();
    };
  }

  function showSignupModal() {
    if (!signupModal || !signupModalEmail || !signupModalPassword) return;
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      showError(t('errSupabaseNotConfigured'));
      return;
    }
    signupModalEmail.value = '';
    signupModalPassword.value = '';
    if (signupModalName) signupModalName.value = '';
    if (signupModalError) signupModalError.textContent = '';
    signupModalEmail.placeholder = t('signupEmailPlaceholder');
    signupModalPassword.placeholder = t('signupPasswordPlaceholder');
    if (signupModalName) signupModalName.placeholder = t('signupNamePlaceholder');
    signupModal.setAttribute('aria-hidden', 'false');
    signupModal.classList.add('is-visible');
    signupModalEmail.focus();

    function submit() {
      var email = (signupModalEmail.value || '').trim();
      var password = (signupModalPassword.value || '');
      var name = signupModalName ? (signupModalName.value || '').trim() : '';
      if (!email || !password) {
        if (signupModalError) signupModalError.textContent = t('errSignup');
        return;
      }
      if (password.length < 6) {
        if (signupModalError) signupModalError.textContent = t('errSignup');
        return;
      }
      if (!supabaseClient) {
        if (signupModalError) signupModalError.textContent = t('errSupabaseNotConfigured');
        return;
      }
      supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: name ? { data: { name: name } } : {}
      })
        .then(function (res) {
          if (res.error) {
            if (signupModalError) signupModalError.textContent = res.error.message || t('errSignup');
            return;
          }
          closeSignupModal();
          showError(t('signupSuccess'));
        })
        .catch(function () {
          if (signupModalError) signupModalError.textContent = t('errSignup');
        });
    }

    if (signupModalSubmit) signupModalSubmit.onclick = submit;
    if (signupModalBackdrop) signupModalBackdrop.onclick = closeSignupModal;
    if (signupModalToLogin) {
      signupModalToLogin.onclick = function () {
        closeSignupModal();
        showLoginModal();
      };
    }
    var onKey = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') closeSignupModal();
    };
    if (signupModalEmail) signupModalEmail.onkeydown = onKey;
    if (signupModalPassword) signupModalPassword.onkeydown = onKey;
    if (signupModalName) signupModalName.onkeydown = onKey;
  }

  function updateAuthUI() {
    var loggedIn = !!currentUser;
    if (topbarRight) topbarRight.classList.toggle('logged-in', loggedIn);
    if (userName) {
      userName.textContent = currentUserName || '';
      userName.hidden = !loggedIn;
    }
    if (btnLogin) btnLogin.textContent = loggedIn ? t('logout') : t('login');
    if (btnSignUp) {
      btnSignUp.hidden = loggedIn;
      btnSignUp.setAttribute('aria-hidden', loggedIn ? 'true' : 'false');
    }
    if (btnSaveCoursePreset) btnSaveCoursePreset.hidden = !loggedIn;
    if (loadPresetWrap) loadPresetWrap.hidden = !loggedIn;
    if (loggedIn) {
      loadUserCoursePreset();
      if (savedPresetList) savedPresetList.hidden = true;
      if (btnLoadPresetToggle) btnLoadPresetToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function setUserFromSession(session) {
    if (session && session.user) {
      currentUser = { id: session.user.id, email: session.user.email };
      currentUserName = (session.user.user_metadata && session.user.user_metadata.name) || session.user.email || '';
    } else {
      currentUser = null;
      currentUserName = null;
    }
  }

  function initSupabaseAuth() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) {
      currentUser = null;
      currentUserName = null;
      updateAuthUI();
      return;
    }
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
    supabaseClient.auth.getSession().then(function (res) {
      setUserFromSession(res.data.session);
      updateAuthUI();
    });
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      setUserFromSession(session);
      updateAuthUI();
    });
  }

  function getCurrentUserPrefsKey() {
    if (!currentUser || !currentUser.id) return null;
    return PREF_STORAGE_PREFIX + currentUser.id;
  }

  var PRESET_OPTION_KEYS = {
    region: ['quickRegion', 'searchCenterLat', 'searchCenterLng'],
    priceTier: ['priceTier'],
    courseStyle: ['mbtiPJ'],
    congestion: ['congestionPreference'],
    courseOrder: ['quickCourseOrderMode', 'courseOrder1', 'courseOrder2', 'courseOrder3', 'courseOrder4'],
    transport: ['transport', 'hasCar'],
    radius: ['radius', 'radiusCustom'],
    timeRange: ['startTime', 'endTime']
  };

  var PRESET_OPTION_IDS = ['region', 'priceTier', 'courseStyle', 'congestion', 'courseOrder', 'transport', 'radius', 'timeRange'];

  function filterPresetDataByOptions(data, selectedIds) {
    if (!data || !selectedIds || !selectedIds.length) return {};
    var keys = [];
    selectedIds.forEach(function (id) {
      var list = PRESET_OPTION_KEYS[id];
      if (list) keys = keys.concat(list);
    });
    var out = {};
    keys.forEach(function (k) {
      if (data[k] !== undefined) out[k] = data[k];
    });
    return out;
  }

  function getCoursePresetData() {
    var data = {};
    var quickRegionEl = document.querySelector('input[name="quickRegion"]:checked');
    if (quickRegionEl) {
      data.quickRegion = quickRegionEl.value || 'my';
      if (data.quickRegion === 'pick' && searchCenter) {
        data.searchCenterLat = searchCenter.lat;
        data.searchCenterLng = searchCenter.lng;
      }
    }
    var priceTierEl = document.querySelector('input[name="priceTier"]:checked');
    if (priceTierEl && priceTierEl.value) data.priceTier = priceTierEl.value;
    var mbtiRadio = document.querySelector('input[name="mbtiPJ"]:checked');
    if (mbtiRadio) data.mbtiPJ = mbtiRadio.value || '';
    var congestionEl = document.querySelector('input[name="congestionPreference"]:checked');
    if (congestionEl) data.congestionPreference = congestionEl.value || 'normal';
    var modeRadio = document.querySelector('input[name="quickCourseOrderMode"]:checked');
    if (modeRadio) {
      data.quickCourseOrderMode = modeRadio.value || 'random';
      var s1 = $('courseOrder1'); var s2 = $('courseOrder2'); var s3 = $('courseOrder3'); var s4 = $('courseOrder4');
      if (s1) data.courseOrder1 = s1.value;
      if (s2) data.courseOrder2 = s2.value;
      if (s3) data.courseOrder3 = s3.value;
      if (s4) data.courseOrder4 = s4.value;
    }
    var transportEl = document.querySelector('input[name="transport"]:checked');
    if (transportEl) data.transport = transportEl.value || 'walk';
    var hasCarEl = $('hasCar');
    if (hasCarEl) data.hasCar = hasCarEl.checked;
    var radiusEl = $('radius');
    if (radiusEl) {
      data.radius = radiusEl.value;
      if (data.radius === 'custom') {
        var rc = $('radiusCustom');
        if (rc && rc.value) data.radiusCustom = rc.value;
      }
    }
    var startEl = $('startTime');
    var endEl = $('endTime');
    if (startEl && startEl.value) data.startTime = startEl.value;
    if (endEl && endEl.value) data.endTime = endEl.value;
    return data;
  }

  function applyCoursePresetData(data) {
    if (!data || typeof data !== 'object') return;
    if (data.quickRegion !== undefined) {
      var qr = document.querySelector('input[name="quickRegion"][value="' + (data.quickRegion || 'my') + '"]');
      if (qr) qr.checked = true;
      if (data.searchCenterLat != null && data.searchCenterLng != null && typeof searchCenter !== 'undefined') {
        searchCenter = { lat: Number(data.searchCenterLat), lng: Number(data.searchCenterLng) };
        if (mapAdapter && typeof mapAdapter.setView === 'function') mapAdapter.setView(searchCenter.lat, searchCenter.lng, 15);
      }
    }
    if (data.priceTier !== undefined) {
      var pt = document.querySelector('input[name="priceTier"][value="' + (data.priceTier || 'normal') + '"]');
      if (pt) pt.checked = true;
    }
    if (data.mbtiPJ !== undefined) {
      var v = data.mbtiPJ || '';
      var sel = document.querySelector('input[name="mbtiPJ"][value="' + v + '"]') || document.querySelector('input[name="mbtiPJ"][value=""]');
      if (sel) sel.checked = true;
    }
    if (data.congestionPreference !== undefined) {
      var cp = document.querySelector('input[name="congestionPreference"][value="' + (data.congestionPreference || 'normal') + '"]');
      if (cp) cp.checked = true;
    }
    if (data.quickCourseOrderMode !== undefined) {
      var mv = data.quickCourseOrderMode || 'random';
      if (mv === 'default') mv = 'random';
      var msel = document.querySelector('input[name="quickCourseOrderMode"][value="' + mv + '"]') || document.querySelector('input[name="quickCourseOrderMode"][value="random"]');
      if (msel) msel.checked = true;
    }
    if (data.courseOrder1 !== undefined && $('courseOrder1')) $('courseOrder1').value = data.courseOrder1;
    if (data.courseOrder2 !== undefined && $('courseOrder2')) $('courseOrder2').value = data.courseOrder2;
    if (data.courseOrder3 !== undefined && $('courseOrder3')) $('courseOrder3').value = data.courseOrder3;
    if (data.courseOrder4 !== undefined && $('courseOrder4')) $('courseOrder4').value = data.courseOrder4;
    updateCourseOrderSelectsVisibility();
    if (data.transport !== undefined) {
      var tr = document.querySelector('input[name="transport"][value="' + (data.transport || 'walk') + '"]');
      if (tr) tr.checked = true;
    }
    if (data.hasCar !== undefined && $('hasCar')) $('hasCar').checked = !!data.hasCar;
    if (typeof syncTransportCarState === 'function') syncTransportCarState();
    if (data.radius !== undefined && $('radius')) {
      $('radius').value = data.radius;
      if (typeof updateRadiusCustomVisibility === 'function') updateRadiusCustomVisibility();
      if (data.radius === 'custom' && data.radiusCustom !== undefined && $('radiusCustom')) $('radiusCustom').value = data.radiusCustom;
    }
    if (data.startTime !== undefined && $('startTime')) $('startTime').value = data.startTime;
    if (data.endTime !== undefined && $('endTime')) $('endTime').value = data.endTime;
  }

  function saveCoursePresetToKey(key, selectedOptionIds, dataFromModal) {
    if (!key) return false;
    var data = dataFromModal;
    if (data === undefined) {
      data = getCoursePresetData();
      if (selectedOptionIds && selectedOptionIds.length) {
        data = filterPresetDataByOptions(data, selectedOptionIds);
      }
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  var CUSTOM_PRESET_INCLUDE_IDS = ['customPresetIncludeRegion', 'customPresetIncludePriceTier', 'customPresetIncludeCourseStyle', 'customPresetIncludeCongestion', 'customPresetIncludeCourseOrder', 'customPresetIncludeTransport', 'customPresetIncludeRadius', 'customPresetIncludeTimeRange'];

  function getCustomPresetInclude(optionKey) {
    var map = { region: 'customPresetIncludeRegion', priceTier: 'customPresetIncludePriceTier', courseStyle: 'customPresetIncludeCourseStyle', congestion: 'customPresetIncludeCongestion', courseOrder: 'customPresetIncludeCourseOrder', transport: 'customPresetIncludeTransport', radius: 'customPresetIncludeRadius', timeRange: 'customPresetIncludeTimeRange' };
    var id = map[optionKey];
    var el = id ? $(id) : null;
    return el ? el.checked : false;
  }

  function setCustomPresetFieldEnabled(fieldEl, enabled) {
    if (!fieldEl) return;
    var content = fieldEl.querySelector('.custom-preset-field-content');
    if (!content) return;
    fieldEl.classList.toggle('custom-preset-field-off', !enabled);
    var inputs = content.querySelectorAll('input, select, button');
    inputs.forEach(function (el) {
      el.disabled = !enabled;
    });
  }

  function updateAllCustomPresetFieldToggles() {
    document.querySelectorAll('.custom-preset-field[data-preset-key]').forEach(function (field) {
    var key = field.getAttribute('data-preset-key');
    var includeId = key === 'region' ? 'customPresetIncludeRegion' : key === 'priceTier' ? 'customPresetIncludePriceTier' : key === 'courseStyle' ? 'customPresetIncludeCourseStyle' : key === 'congestion' ? 'customPresetIncludeCongestion' : key === 'courseOrder' ? 'customPresetIncludeCourseOrder' : key === 'transport' ? 'customPresetIncludeTransport' : key === 'radius' ? 'customPresetIncludeRadius' : key === 'timeRange' ? 'customPresetIncludeTimeRange' : null;
    var cb = includeId ? $(includeId) : null;
    setCustomPresetFieldEnabled(field, cb ? cb.checked : true);
    });
  }

  function getCustomPresetDataFromModal() {
    var data = {};
    if (getCustomPresetInclude('region')) {
      var regionEl = document.querySelector('input[name="customPresetRegion"]:checked');
      if (regionEl) {
        data.quickRegion = regionEl.value || 'my';
        if (data.quickRegion === 'pick') {
          var center = customPresetPickedCenter || (typeof searchCenter !== 'undefined' && searchCenter && typeof searchCenter.lat === 'number' && typeof searchCenter.lng === 'number' ? searchCenter : null);
          if (center) {
            data.searchCenterLat = center.lat;
            data.searchCenterLng = center.lng;
          }
        }
      }
    }
    if (getCustomPresetInclude('priceTier')) {
      var pt = $('customPresetPriceTier');
      if (pt && pt.value) data.priceTier = pt.value;
    }
    if (getCustomPresetInclude('courseStyle')) {
      var mbti = $('customPresetMbtiPJ');
      if (mbti) data.mbtiPJ = mbti.value || '';
    }
    if (getCustomPresetInclude('congestion')) {
      var cong = $('customPresetCongestion');
      if (cong) data.congestionPreference = cong.value || 'normal';
    }
    if (getCustomPresetInclude('courseOrder')) {
      var mode = $('customPresetOrderMode');
      if (mode) {
        data.quickCourseOrderMode = mode.value || 'random';
        var o1 = $('customPresetOrder1'); var o2 = $('customPresetOrder2'); var o3 = $('customPresetOrder3'); var o4 = $('customPresetOrder4');
        if (o1) data.courseOrder1 = o1.value;
        if (o2) data.courseOrder2 = o2.value;
        if (o3) data.courseOrder3 = o3.value;
        if (o4) data.courseOrder4 = o4.value;
      }
    }
    if (getCustomPresetInclude('transport')) {
      var tr = $('customPresetTransport');
      if (tr) data.transport = tr.value || 'walk';
      var hasCar = $('customPresetHasCar');
      if (hasCar) data.hasCar = hasCar.checked;
    }
    if (getCustomPresetInclude('radius')) {
      var rad = $('customPresetRadius');
      if (rad) {
        data.radius = rad.value;
        if (data.radius === 'custom') {
          var rc = $('customPresetRadiusCustom');
          if (rc && rc.value) data.radiusCustom = rc.value;
        }
      }
    }
    if (getCustomPresetInclude('timeRange')) {
      var st = $('customPresetStartTime'); var et = $('customPresetEndTime');
      if (st && st.value) data.startTime = st.value;
      if (et && et.value) data.endTime = et.value;
    }
    return data;
  }

  function fillCustomPresetModalFromCurrentForm() {
    var quickRegionEl = document.querySelector('input[name="quickRegion"]:checked');
    if (quickRegionEl) {
      var r = document.querySelector('input[name="customPresetRegion"][value="' + (quickRegionEl.value || 'my') + '"]');
      if (r) r.checked = true;
    }
    var priceTierEl = document.querySelector('input[name="priceTier"]:checked');
    if (priceTierEl && $('customPresetPriceTier')) $('customPresetPriceTier').value = priceTierEl.value || '';
    var mbtiEl = document.querySelector('input[name="mbtiPJ"]:checked');
    if (mbtiEl && $('customPresetMbtiPJ')) $('customPresetMbtiPJ').value = mbtiEl.value || '';
    var congEl = document.querySelector('input[name="congestionPreference"]:checked');
    if (congEl && $('customPresetCongestion')) $('customPresetCongestion').value = congEl.value || 'normal';
    var modeEl = document.querySelector('input[name="quickCourseOrderMode"]:checked');
    if (modeEl && $('customPresetOrderMode')) {
      $('customPresetOrderMode').value = modeEl.value || 'random';
      updateCustomPresetOrderVisibility();
      if ($('courseOrder1') && $('customPresetOrder1')) $('customPresetOrder1').value = $('courseOrder1').value;
      if ($('courseOrder2') && $('customPresetOrder2')) $('customPresetOrder2').value = $('courseOrder2').value;
      if ($('courseOrder3') && $('customPresetOrder3')) $('customPresetOrder3').value = $('courseOrder3').value;
      if ($('courseOrder4') && $('customPresetOrder4')) $('customPresetOrder4').value = $('courseOrder4').value;
    }
    var transportEl = document.querySelector('input[name="transport"]:checked');
    if (transportEl && $('customPresetTransport')) $('customPresetTransport').value = transportEl.value || 'walk';
    if ($('hasCar') && $('customPresetHasCar')) $('customPresetHasCar').checked = $('hasCar').checked;
    if ($('radius') && $('customPresetRadius')) $('customPresetRadius').value = $('radius').value;
    if ($('radius') && $('radius').value === 'custom' && $('radiusCustom') && $('customPresetRadiusCustom')) {
      $('customPresetRadiusCustom').value = $('radiusCustom').value;
      $('customPresetRadiusCustom').style.display = '';
    } else if ($('customPresetRadiusCustom')) $('customPresetRadiusCustom').style.display = 'none';
    if ($('startTime') && $('customPresetStartTime')) $('customPresetStartTime').value = $('startTime').value;
    if ($('endTime') && $('customPresetEndTime')) $('customPresetEndTime').value = $('endTime').value;
  }

  function fillCustomPresetModalFromData(data) {
    if (!data || typeof data !== 'object') return;
    if (data.quickRegion !== undefined) {
      var r = document.querySelector('input[name="customPresetRegion"][value="' + (data.quickRegion || 'my') + '"]');
      if (r) r.checked = true;
      if (data.searchCenterLat != null && data.searchCenterLng != null) {
        customPresetPickedCenter = { lat: Number(data.searchCenterLat), lng: Number(data.searchCenterLng) };
      }
    }
    if (data.priceTier !== undefined && $('customPresetPriceTier')) $('customPresetPriceTier').value = data.priceTier || '';
    if (data.mbtiPJ !== undefined && $('customPresetMbtiPJ')) $('customPresetMbtiPJ').value = data.mbtiPJ || '';
    if (data.congestionPreference !== undefined && $('customPresetCongestion')) $('customPresetCongestion').value = data.congestionPreference || 'normal';
    if (data.quickCourseOrderMode !== undefined && $('customPresetOrderMode')) {
      var orderMode = data.quickCourseOrderMode || 'random';
      if (orderMode === 'default') orderMode = 'random';
      $('customPresetOrderMode').value = orderMode;
      updateCustomPresetOrderVisibility();
      if (data.courseOrder1 !== undefined && $('customPresetOrder1')) $('customPresetOrder1').value = data.courseOrder1;
      if (data.courseOrder2 !== undefined && $('customPresetOrder2')) $('customPresetOrder2').value = data.courseOrder2;
      if (data.courseOrder3 !== undefined && $('customPresetOrder3')) $('customPresetOrder3').value = data.courseOrder3;
      if (data.courseOrder4 !== undefined && $('customPresetOrder4')) $('customPresetOrder4').value = data.courseOrder4;
    }
    if (data.transport !== undefined && $('customPresetTransport')) $('customPresetTransport').value = data.transport || 'walk';
    if (data.hasCar !== undefined && $('customPresetHasCar')) $('customPresetHasCar').checked = !!data.hasCar;
    if (data.radius !== undefined && $('customPresetRadius')) {
      $('customPresetRadius').value = data.radius;
      updateCustomPresetRadiusVisibility();
      if (data.radius === 'custom' && data.radiusCustom !== undefined && $('customPresetRadiusCustom')) {
        $('customPresetRadiusCustom').value = data.radiusCustom;
        $('customPresetRadiusCustom').style.display = '';
      }
    }
    if (data.startTime !== undefined && $('customPresetStartTime')) $('customPresetStartTime').value = data.startTime;
    if (data.endTime !== undefined && $('customPresetEndTime')) $('customPresetEndTime').value = data.endTime;
    var includeMap = [
      { key: 'region', has: 'quickRegion' in data || 'searchCenterLat' in data },
      { key: 'priceTier', has: 'priceTier' in data },
      { key: 'courseStyle', has: 'mbtiPJ' in data },
      { key: 'congestion', has: 'congestionPreference' in data },
      { key: 'courseOrder', has: 'quickCourseOrderMode' in data },
      { key: 'transport', has: 'transport' in data },
      { key: 'radius', has: 'radius' in data },
      { key: 'timeRange', has: 'startTime' in data || 'endTime' in data }
    ];
    var includeIds = { region: 'customPresetIncludeRegion', priceTier: 'customPresetIncludePriceTier', courseStyle: 'customPresetIncludeCourseStyle', congestion: 'customPresetIncludeCongestion', courseOrder: 'customPresetIncludeCourseOrder', transport: 'customPresetIncludeTransport', radius: 'customPresetIncludeRadius', timeRange: 'customPresetIncludeTimeRange' };
    includeMap.forEach(function (_) {
      var el = $(includeIds[_.key]);
      if (el) el.checked = _.has;
    });
    updateAllCustomPresetFieldToggles();
    updateCustomPresetPickCoordsDisplay();
  }

  function updateCustomPresetOrderVisibility() {
    var mode = $('customPresetOrderMode');
    var wrap = $('customPresetOrderWrap');
    if (wrap) wrap.hidden = !(mode && mode.value === 'custom');
  }

  function updateCustomPresetRadiusVisibility() {
    var rad = $('customPresetRadius');
    var customInput = $('customPresetRadiusCustom');
    if (customInput) customInput.style.display = (rad && rad.value === 'custom') ? '' : 'none';
  }

  var customPresetPickedCenter = null;
  var customPresetMap = null;
  var customPresetMapMarker = null;

  function updateCustomPresetPickCoordsDisplay() {
    var pickEl = document.querySelector('input[name="customPresetRegion"][value="pick"]');
    var hintEl = $('customPresetPickCoords');
    var btnMap = $('btnOpenCustomPresetMap');
    if (!hintEl) return;
    var isPick = pickEl && pickEl.checked;
    if (!isPick) {
      hintEl.hidden = true;
      if (btnMap) btnMap.hidden = true;
      return;
    }
    hintEl.hidden = false;
    if (btnMap) btnMap.hidden = false;
    var center = customPresetPickedCenter || (typeof searchCenter !== 'undefined' && searchCenter ? searchCenter : null);
    if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
      hintEl.textContent = (t('customPresetPickCoordsSaved').replace('%.2f', center.lat.toFixed(2))).replace('%.2f', center.lng.toFixed(2));
      hintEl.classList.remove('custom-preset-pick-none');
    } else {
      hintEl.textContent = t('customPresetPickCoordsNone');
      hintEl.classList.add('custom-preset-pick-none');
    }
  }

  function initCustomPresetMap() {
    var container = $('customPresetMapContainer');
    if (!container || !window.L) return;
    if (customPresetMap) {
      try { customPresetMap.remove(); } catch (e) { }
      customPresetMap = null;
      customPresetMapMarker = null;
    }
    var center = customPresetPickedCenter || (typeof searchCenter !== 'undefined' && searchCenter ? searchCenter : { lat: DEFAULT_LAT, lng: DEFAULT_LNG });
    var lat = typeof center.lat === 'number' ? center.lat : DEFAULT_LAT;
    var lng = typeof center.lng === 'number' ? center.lng : DEFAULT_LNG;
    var m = L.map('customPresetMapContainer', { zoomControl: false }).setView([lat, lng], 14);
    if (window.MAPTILER_API_KEY && L.maptiler && typeof L.maptiler.maptilerLayer === 'function') {
      L.maptiler.maptilerLayer({ apiKey: window.MAPTILER_API_KEY, language: (currentLang === 'en' ? 'en' : 'ko') }).addTo(m);
    } else {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; OSM', subdomains: 'abcd', maxZoom: 19 }).addTo(m);
    }
    L.control.zoom({ position: 'topright' }).addTo(m);
    customPresetMap = m;
    var icon = L.divIcon({ className: 'custom-preset-pin', html: '📍', iconSize: [32, 32], iconAnchor: [16, 32] });
    customPresetMapMarker = L.marker([lat, lng], { icon: icon, draggable: true }).addTo(m);
    m.on('click', function (e) {
      customPresetMapMarker.setLatLng(e.latlng);
    });
    customPresetMapMarker.on('dragend', function () {
      var pos = customPresetMapMarker.getLatLng();
      if (customPresetMap) customPresetMap.setView([pos.lat, pos.lng], customPresetMap.getZoom());
    });
    setTimeout(function () {
      if (customPresetMap && typeof customPresetMap.invalidateSize === 'function') customPresetMap.invalidateSize();
    }, 150);
  }

  function openCustomPresetMapModal() {
    var modal = $('customPresetMapModal');
    if (!modal) return;
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
    if ($('customPresetMapModalTitle')) $('customPresetMapModalTitle').textContent = t('customPresetMapModalTitle');
    if ($('customPresetMapSearchInput')) { $('customPresetMapSearchInput').placeholder = t('customPresetMapSearchPlaceholder'); $('customPresetMapSearchInput').value = ''; }
    if ($('btnCustomPresetMapSearch')) $('btnCustomPresetMapSearch').textContent = t('btnCustomPresetMapSearch');
    if ($('customPresetMapHint')) $('customPresetMapHint').textContent = t('customPresetMapHint');
    if ($('btnCustomPresetMapConfirm')) $('btnCustomPresetMapConfirm').textContent = t('btnCustomPresetMapConfirm');
    if ($('btnCustomPresetMapCancel')) $('btnCustomPresetMapCancel').textContent = t('btnCustomPresetMapCancel');
    setTimeout(initCustomPresetMap, 100);
  }

  function closeCustomPresetMapModal() {
    var modal = $('customPresetMapModal');
    if (!modal) return;
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
    if (customPresetMap) {
      try { customPresetMap.remove(); } catch (e) { }
      customPresetMap = null;
      customPresetMapMarker = null;
    }
  }

  function searchCustomPresetMap() {
    var input = $('customPresetMapSearchInput');
    var q = input ? (input.value || '').trim() : '';
    if (!q) return;
    var url = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=1';
    fetch(url, { headers: { 'Accept-Language': currentLang === 'ko' ? 'ko' : 'en', 'User-Agent': 'DatePlanner/1.0' } })
      .then(function (res) { return res.json(); })
      .then(function (results) {
        if (!results || results.length === 0 || !customPresetMap || !customPresetMapMarker) return;
        var r = results[0];
        var lat = parseFloat(r.lat);
        var lon = parseFloat(r.lon);
        if (isNaN(lat) || isNaN(lon)) return;
        customPresetMap.setView([lat, lon], 16);
        customPresetMapMarker.setLatLng([lat, lon]);
      })
      .catch(function () { });
  }

  function confirmCustomPresetMapPosition() {
    if (customPresetMapMarker) {
      var pos = customPresetMapMarker.getLatLng();
      customPresetPickedCenter = { lat: pos.lat, lng: pos.lng };
    }
    closeCustomPresetMapModal();
    updateCustomPresetPickCoordsDisplay();
  }

  function closeSavePresetModal() {
    if (!savePresetModal) return;
    savePresetModal.classList.remove('is-visible', 'save-preset-custom-open');
    savePresetModal.setAttribute('aria-hidden', 'true');
    if (savePresetChoiceWrap) savePresetChoiceWrap.hidden = false;
    if (saveCurrentOptionsWrap) saveCurrentOptionsWrap.hidden = true;
    if (savePresetCustomWrap) savePresetCustomWrap.hidden = true;
    if (savePresetCustomName) savePresetCustomName.value = '';
    if (savePresetCustomError) savePresetCustomError.textContent = '';
  }

  var PRESET_OPTION_LABEL_KEYS = {
    region: 'optionRegion',
    priceTier: 'optionPriceTier',
    courseStyle: 'optionCourseStyle',
    congestion: 'optionCongestion',
    courseOrder: 'optionCourseOrder',
    transport: 'optionTransport',
    radius: 'optionRadius',
    timeRange: 'optionTimeRange'
  };

  function getOptionIdsFromPresetData(data) {
    if (!data || typeof data !== 'object') return [];
    var ids = [];
    PRESET_OPTION_IDS.forEach(function (id) {
      var keys = PRESET_OPTION_KEYS[id];
      if (keys && keys.some(function (k) { return data[k] !== undefined; })) ids.push(id);
    });
    return ids;
  }

  function renderSaveCurrentOptions(preCheckedData) {
    if (!saveCurrentOptionsList) return;
    saveCurrentOptionsList.innerHTML = '';
    var checkedIds = preCheckedData ? getOptionIdsFromPresetData(preCheckedData) : null;
    PRESET_OPTION_IDS.forEach(function (id) {
      var labelKey = PRESET_OPTION_LABEL_KEYS[id];
      var label = labelKey ? t(labelKey) : id;
      var labelEl = document.createElement('label');
      labelEl.className = 'save-preset-option-item';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checkedIds ? checkedIds.indexOf(id) !== -1 : true;
      cb.setAttribute('data-option-id', id);
      labelEl.appendChild(cb);
      labelEl.appendChild(document.createTextNode(' ' + label));
      saveCurrentOptionsList.appendChild(labelEl);
    });
  }

  var overwritePresetKey = null;
  var editingPresetKey = null;
  var editingPresetOldName = null;

  function showSavePresetChoiceModal() {
    if (!currentUser) {
      showError(t('loginToSavePreset'));
      return;
    }
    if (!savePresetModal || !savePresetChoiceWrap || !savePresetCustomWrap) return;
    overwritePresetKey = null;
    editingPresetKey = null;
    editingPresetOldName = null;
    savePresetChoiceWrap.hidden = false;
    if (saveCurrentOptionsWrap) saveCurrentOptionsWrap.hidden = true;
    savePresetCustomWrap.hidden = true;
    if (savePresetCustomName) savePresetCustomName.value = '';
    if (savePresetCustomError) savePresetCustomError.textContent = '';
    savePresetModal.setAttribute('aria-hidden', 'false');
    savePresetModal.classList.add('is-visible');
  }

  function saveUserCoursePreset() {
    if (!currentUser) {
      showError(t('loginToSavePreset'));
      return;
    }
    showSavePresetChoiceModal();
  }

  function loadUserCoursePreset() {
    var key = getCurrentUserPrefsKey();
    if (!key) return;
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') applyCoursePresetData(data);
    } catch (e) { }
  }

  function getCustomPresetListKey() {
    var base = getCurrentUserPrefsKey();
    return base ? base + '-custom-list' : null;
  }

  function getCustomPresetNames() {
    var key = getCustomPresetListKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function addCustomPresetName(name) {
    var key = getCustomPresetListKey();
    if (!key || !name) return;
    var list = getCustomPresetNames();
    if (list.indexOf(name) === -1) {
      list.push(name);
      try {
        localStorage.setItem(key, JSON.stringify(list));
      } catch (e) { }
    }
  }

  function removeCustomPresetName(name) {
    var key = getCustomPresetListKey();
    if (!key || !name) return;
    var list = getCustomPresetNames().filter(function (n) { return n !== name; });
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) { }
  }

  function updateCustomPresetName(oldName, newName) {
    var key = getCustomPresetListKey();
    if (!key || !oldName || !newName || oldName === newName) return;
    var list = getCustomPresetNames();
    var i = list.indexOf(oldName);
    if (i === -1) return;
    list[i] = newName;
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) { }
  }

  function deletePreset(key) {
    if (!key) return;
    try {
      localStorage.removeItem(key);
      var baseKey = getCurrentUserPrefsKey();
      if (baseKey && key !== baseKey && key.indexOf(baseKey + '-custom-') === 0) {
        var list = getCustomPresetNames();
        var slug = key.replace(baseKey + '-custom-', '');
        var name = list.find(function (n) { return presetNameToSlug(n) === slug; });
        if (name) removeCustomPresetName(name);
      }
    } catch (e) { }
  }

  function presetNameToSlug(name) {
    return (name || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9가-힣_-]/g, '').slice(0, 30) || 'custom';
  }

  function loadCoursePresetFromKey(key) {
    if (!key) return;
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        applyCoursePresetData(data);
        showError(t('presetLoaded'));
      }
    } catch (e) { }
  }

  function getSavedPresetList() {
    var baseKey = getCurrentUserPrefsKey();
    if (!baseKey) return { hasDefault: false, customNames: [] };
    var hasDefault = false;
    try {
      hasDefault = !!localStorage.getItem(baseKey);
    } catch (e) { }
    return { hasDefault: hasDefault, customNames: getCustomPresetNames() };
  }

  function openEditDefaultPreset(key) {
    var data = null;
    try {
      var raw = localStorage.getItem(key);
      if (raw) data = JSON.parse(raw);
    } catch (e) { }
    if (!savePresetModal || !saveCurrentOptionsWrap || !savePresetChoiceWrap) return;
    overwritePresetKey = key;
    savePresetChoiceWrap.hidden = true;
    if (savePresetCustomWrap) savePresetCustomWrap.hidden = true;
    saveCurrentOptionsWrap.hidden = false;
    renderSaveCurrentOptions(data);
    if ($('saveCurrentSelectTitle')) $('saveCurrentSelectTitle').textContent = t('saveCurrentSelectTitle');
    if (btnSaveCurrentConfirm) btnSaveCurrentConfirm.textContent = t('saveCurrentConfirm');
    savePresetModal.setAttribute('aria-hidden', 'false');
    savePresetModal.classList.add('is-visible');
  }

  function openEditCustomPreset(key, name) {
    var data = null;
    try {
      var raw = localStorage.getItem(key);
      if (raw) data = JSON.parse(raw);
    } catch (e) { }
    if (!savePresetModal || !savePresetCustomWrap || !savePresetChoiceWrap) return;
    editingPresetKey = key;
    editingPresetOldName = name;
    savePresetChoiceWrap.hidden = true;
    if (saveCurrentOptionsWrap) saveCurrentOptionsWrap.hidden = true;
    savePresetCustomWrap.hidden = false;
    if (savePresetModal) savePresetModal.classList.add('save-preset-custom-open');
    if (savePresetCustomName) savePresetCustomName.value = name;
    if (savePresetCustomError) savePresetCustomError.textContent = '';
    fillCustomPresetModalFromData(data);
    updateCustomPresetOrderVisibility();
    updateCustomPresetRadiusVisibility();
    updateCustomPresetPickCoordsDisplay();
    updateAllCustomPresetFieldToggles();
    savePresetModal.setAttribute('aria-hidden', 'false');
    savePresetModal.classList.add('is-visible');
  }

  function renderSavedPresetList() {
    if (!savedPresetList) return;
    savedPresetList.innerHTML = '';
    var list = getSavedPresetList();
    if (!list.hasDefault && list.customNames.length === 0) {
      var li = document.createElement('li');
      li.className = 'saved-preset-item saved-preset-empty';
      li.textContent = t('noSavedPresets');
      savedPresetList.appendChild(li);
      return;
    }
    var baseKey = getCurrentUserPrefsKey();
    if (list.hasDefault) {
      var defaultLi = document.createElement('li');
      defaultLi.className = 'saved-preset-item';
      defaultLi.setAttribute('data-preset-key', baseKey);
      var defaultLabel = document.createElement('span');
      defaultLabel.className = 'saved-preset-label';
      defaultLabel.textContent = t('presetDefault');
      defaultLi.appendChild(defaultLabel);
      var defaultActions = document.createElement('span');
      defaultActions.className = 'saved-preset-actions';
      var defaultEdit = document.createElement('button');
      defaultEdit.type = 'button';
      defaultEdit.className = 'saved-preset-edit btn btn-ghost btn-sm';
      defaultEdit.textContent = t('presetEdit');
      var defaultDel = document.createElement('button');
      defaultDel.type = 'button';
      defaultDel.className = 'saved-preset-delete btn btn-ghost btn-sm';
      defaultDel.textContent = t('presetDelete');
      defaultActions.appendChild(defaultEdit);
      defaultActions.appendChild(defaultDel);
      defaultLi.appendChild(defaultActions);
      savedPresetList.appendChild(defaultLi);
    }
    list.customNames.forEach(function (name) {
      var slug = presetNameToSlug(name);
      var customKey = baseKey + '-custom-' + slug;
      var li = document.createElement('li');
      li.className = 'saved-preset-item';
      li.setAttribute('data-preset-key', customKey);
      li.setAttribute('data-preset-name', name);
      var label = document.createElement('span');
      label.className = 'saved-preset-label';
      label.textContent = name;
      li.appendChild(label);
      var actions = document.createElement('span');
      actions.className = 'saved-preset-actions';
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'saved-preset-edit btn btn-ghost btn-sm';
      editBtn.textContent = t('presetEdit');
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'saved-preset-delete btn btn-ghost btn-sm';
      delBtn.textContent = t('presetDelete');
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      li.appendChild(actions);
      savedPresetList.appendChild(li);
    });
  }

  function toggleLoadPresetList() {
    if (!savedPresetList || !btnLoadPresetToggle) return;
    var expanded = btnLoadPresetToggle.getAttribute('aria-expanded') === 'true';
    btnLoadPresetToggle.setAttribute('aria-expanded', !expanded);
    savedPresetList.hidden = expanded;
    var wrap = savedPresetList.parentElement;
    if (wrap && wrap.classList.contains('saved-preset-list-wrap')) wrap.hidden = expanded;
    if (!expanded) renderSavedPresetList();
  }

  let map = null;
  let userMarker = null;
  let pickMarker = null;
  let placeMarkersLayer = null;
  let searchCenter = null;
  let mapAdapter = null;
  var lastRenderedPlan = null;
  var savedPlans = [];
  var cardShareTimerId = null;

  const $ = (id) => document.getElementById(id);
  const radiusSelect = $('radius');
  const startTime = $('startTime');
  const endTime = $('endTime');
  const btnMyLocation = $('btnMyLocation');
  const btnGenerate = $('btnGenerate');
  const btnReset = $('btnReset');
  const mapHint = $('mapHint');
  const resultSection = $('resultSection');
  const resultMeta = $('resultMeta');
  const itinerary = $('itinerary');
  const loading = $('loading');
  const searchInput = $('searchInput');
  const userName = $('userName');
  const btnLogin = $('btnLogin');
  const plansEmpty = $('plansEmpty');
  const plansList = $('plansList');
  const topbarRight = document.querySelector('.topbar-right');
  const loginModal = $('loginModal');
  const loginModalBackdrop = $('loginModalBackdrop');
  const loginModalEmail = $('loginModalEmail');
  const loginModalPassword = $('loginModalPassword');
  const loginModalError = $('loginModalError');
  const loginModalSubmit = $('loginModalSubmit');
  const loginModalToSignup = $('loginModalToSignup');
  const signupModal = $('signupModal');
  const signupModalBackdrop = $('signupModalBackdrop');
  const signupModalEmail = $('signupModalEmail');
  const signupModalPassword = $('signupModalPassword');
  const signupModalName = $('signupModalName');
  const signupModalError = $('signupModalError');
  const signupModalSubmit = $('signupModalSubmit');
  const signupModalToLogin = $('signupModalToLogin');
  const btnSignUp = $('btnSignUp');
  const savePresetModal = $('savePresetModal');
  const savePresetModalBackdrop = $('savePresetModalBackdrop');
  const savePresetChoiceWrap = $('savePresetChoiceWrap');
  const saveCurrentOptionsWrap = $('saveCurrentOptionsWrap');
  const saveCurrentOptionsList = $('saveCurrentOptionsList');
  const btnSaveCurrentConfirm = $('btnSaveCurrentConfirm');
  const btnSaveCurrentBack = $('btnSaveCurrentBack');
  const savePresetCustomWrap = $('savePresetCustomWrap');
  const savePresetCustomName = $('savePresetCustomName');
  const savePresetCustomError = $('savePresetCustomError');
  const btnSaveCurrentPreset = $('btnSaveCurrentPreset');
  const btnSaveCustomPreset = $('btnSaveCustomPreset');
  const btnSaveCustomPresetSubmit = $('btnSaveCustomPresetSubmit');
  const btnSavePresetBack = $('btnSavePresetBack');
  const btnSavePresetClose = $('btnSavePresetClose');
  const loadPresetWrap = $('loadPresetWrap');
  const btnLoadPresetToggle = $('btnLoadPresetToggle');
  const savedPresetList = $('savedPresetList');
  const cardShareModal = $('cardShareModal');
  const cardShareBackdrop = $('cardShareBackdrop');
  const cardShareCard = $('cardShareCard');
  const cardShareList = $('cardShareList');
  const cardShareModalTitle = $('cardShareModalTitle');
  const cardShareHint = $('cardShareHint');
  const btnCopyCardText = $('btnCopyCardText');
  const btnCloseCardShare = $('btnCloseCardShare');
  const btnSaveCoursePreset = $('btnSaveCoursePreset');
  if (btnSaveCoursePreset) btnSaveCoursePreset.hidden = true;

  const panelCourse = $('panelCourse');
  const panelShare = $('panelShare');
  const tabCourse = $('tabCourse');
  const tabShare = $('tabShare');
  const advancedSection = $('advancedSection');
  const btnQuickCourse = $('btnQuickCourse');
  const btnShowAdvanced = $('btnShowAdvanced');
  const btnOptimizeRoute = $('btnOptimizeRoute');
  const hasCarCheckbox = $('hasCar');
  const sharePlaceList = $('sharePlaceList');
  const sharePlaceEmpty = $('sharePlaceEmpty');
  const sharePlaceUl = $('sharePlaceUl');
  const btnCopyShareLink = $('btnCopyShareLink');
  const shareLinkHint = $('shareLinkHint');
  const radiusCustomWrap = $('radiusCustomWrap');
  const radiusCustomInput = $('radiusCustom');

  function getRadiusMeters() {
    if (!radiusSelect) return null;
    if (radiusSelect.value !== 'custom') {
      var n = Number(radiusSelect.value);
      return isNaN(n) ? 1000 : Math.max(100, Math.min(50000, n));
    }
    if (!radiusCustomInput || !radiusCustomInput.value.trim()) return null;
    var km = parseFloat(radiusCustomInput.value.replace(',', '.'), 10);
    if (isNaN(km) || km < 0.1 || km > 50) return null;
    return Math.round(km * 1000);
  }

  function updateRadiusCustomVisibility() {
    if (radiusCustomWrap) radiusCustomWrap.hidden = radiusSelect.value !== 'custom';
  }

  function syncTransportCarState() {
    var carRadio = document.querySelector('input[name="transport"][value="car"]');
    if (!carRadio || !hasCarCheckbox) return;
    if (hasCarCheckbox.checked) {
      carRadio.disabled = false;
    } else {
      carRadio.disabled = true;
      if (carRadio.checked) {
        var walkRadio = document.querySelector('input[name="transport"][value="walk"]');
        if (walkRadio) walkRadio.checked = true;
      }
    }
  }

  let shareMap = null;
  let shareMapAdapter = null;
  let shareMarkersLayer = null;
  let sharedPlaces = [];
  let sharePlaceIdCounter = 0;

  function createNaverAdapter() {
    const n = window.naver.maps;
    const mapEl = document.getElementById('map');
    if (!mapEl) return null;
    map = new n.Map('map', {
      center: new n.LatLng(DEFAULT_LAT, DEFAULT_LNG),
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      zoomControlOptions: { position: n.Position.TOP_RIGHT },
    });
    userMarker = null;
    pickMarker = null;
    placeMarkersLayer = [];

    return {
      setView: function (lat, lng, zoom) {
        map.setCenter(new n.LatLng(lat, lng));
        map.setZoom(zoom || 15);
      },
      addUserMarker: function (lat, lng, title) {
        if (userMarker) userMarker.setMap(null);
        userMarker = new n.Marker({
          position: new n.LatLng(lat, lng),
          map: map,
          title: title || t('currentLocation'),
        });
      },
      addPickMarker: function (lat, lng, title) {
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new n.Marker({
          position: new n.LatLng(lat, lng),
          map: map,
          title: title || t('pickHerePlan'),
        });
      },
      removePickMarker: function () {
        if (pickMarker) {
          pickMarker.setMap(null);
          pickMarker = null;
        }
      },
      clearPlaceMarkers: function () {
        if (placeMarkersLayer) {
          placeMarkersLayer.forEach(function (m) { m.setMap(null); });
          placeMarkersLayer = [];
        }
      },
      addPlaceMarkers: function (plan) {
        if (!window.naver || !window.naver.maps) return;
        var n = window.naver.maps;
        if (placeMarkersLayer) placeMarkersLayer.forEach(function (m) { m.setMap(null); });
        placeMarkersLayer = [];
        for (var i = 0; i < plan.length; i++) {
          var p = plan[i];
          var m = new n.Marker({
            position: new n.LatLng(p.lat, p.lon),
            map: map,
            title: (i + 1) + '. ' + p.name + ' (' + p.type + ')',
          });
          placeMarkersLayer.push(m);
        }
      },
      onMapClick: function (cb) {
        n.Event.addListener(map, 'click', function (e) {
          var coord = e.coord;
          cb(coord.lat(), coord.lng());
        });
      },
    };
  }

  function simpleIcon(kind) {
    var isUser = kind === 'user';
    var bg = isUser ? '#22d3ee' : '#a78bfa';
    var size = isUser ? 14 : 16;
    return L.divIcon({
      className: 'leaflet-simple-marker',
      html: '<span style="background:' + bg + ';width:100%;height:100%;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:block;"></span>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function placeIcon(index, typeKey) {
    var colors = { restaurant: '#f97316', cafe: '#a78bfa', museum: '#0ea5e9', gallery: '#0ea5e9', theme_park: '#22c55e', attraction: '#22c55e', mall: '#ec4899', park: '#22c55e', fast_food: '#f97316', bar: '#f97316', ice_cream: '#a78bfa' };
    var bg = colors[typeKey] || '#64748b';
    var num = index + 1;
    var size = 28;
    return L.divIcon({
      className: 'leaflet-place-marker',
      html: '<span class="place-marker-num" style="background:' + bg + ';">' + num + '</span>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function getMapTilerLanguage(lang) {
    var ML = window.maptilersdk && window.maptilersdk.Language;
    if (!ML && window.L) {
      ML = window.L.MaptilerLanguage || (window.L.maptiler && window.L.maptiler.MaptilerLanguage);
    }
    if (!ML && window.leafletmaptilersdk) {
      ML = window.leafletmaptilersdk.MaptilerLanguage || window.leafletmaptilersdk.Language;
    }
    if (ML && ML.KOREAN && ML.ENGLISH) {
      return lang === 'ko' ? ML.KOREAN : ML.ENGLISH;
    }
    return lang === 'ko' ? 'ko' : 'en';
  }

  function applyMapLanguageToLayer(baseLayer, lang) {
    if (!baseLayer) return;
    var langVal = getMapTilerLanguage(lang);
    if (typeof baseLayer.setLanguage === 'function') {
      baseLayer.setLanguage(langVal);
    }
    var mtMap = typeof baseLayer.getMaptilerMap === 'function' ? baseLayer.getMaptilerMap() : null;
    if (mtMap && typeof mtMap.setLanguage === 'function') {
      mtMap.setLanguage(langVal);
    }
  }

  function createLeafletAdapter() {
    map = L.map('map', {
      zoomControl: false,
    }).setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);

    var baseLayer = null;
    var useMapTiler = window.MAPTILER_API_KEY && window.L && L.maptiler && typeof L.maptiler.maptilerLayer === 'function';
    var mapLang = getMapTilerLanguage(currentLang);

    if (useMapTiler) {
      baseLayer = L.maptiler.maptilerLayer({
        apiKey: window.MAPTILER_API_KEY,
        language: mapLang,
      }).addTo(map);
      baseLayer.on('ready', function () {
        applyMapLanguageToLayer(baseLayer, currentLang);
      });
      applyMapLanguageToLayer(baseLayer, currentLang);
    } else {
      baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        minZoom: 2,
      }).addTo(map);
    }

    L.control.zoom({ position: 'topright' }).addTo(map);
    userMarker = null;
    pickMarker = null;
    placeMarkersLayer = null;

    function updateMapLanguage(lang) {
      if (!useMapTiler || !baseLayer || !map) return;
      applyMapLanguageToLayer(baseLayer, lang);
    }

    return {
      setView: function (lat, lng, zoom) {
        map.setView([lat, lng], zoom || 15);
      },
      addUserMarker: function (lat, lng, title) {
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker([lat, lng], { icon: simpleIcon('user') }).addTo(map);
        userMarker.bindPopup(title || t('currentLocation'));
      },
      addPickMarker: function (lat, lng, title) {
        if (pickMarker) map.removeLayer(pickMarker);
        pickMarker = L.marker([lat, lng], { icon: simpleIcon('pick') }).addTo(map);
        pickMarker.bindPopup(title || t('pickHerePlan'));
      },
      removePickMarker: function () {
        if (pickMarker) {
          map.removeLayer(pickMarker);
          pickMarker = null;
        }
      },
      clearPlaceMarkers: function () {
        if (placeMarkersLayer) {
          placeMarkersLayer.clearLayers();
        }
      },
      addPlaceMarkers: function (plan) {
        if (!window.L || !map) return;
        if (placeMarkersLayer) placeMarkersLayer.clearLayers();
        else {
          placeMarkersLayer = L.layerGroup().addTo(map);
        }
        for (var i = 0; i < plan.length; i++) {
          var p = plan[i];
          var m = L.marker([p.lat, p.lon], { icon: placeIcon(i, p.typeKey || p.type) }).addTo(placeMarkersLayer);
          m.bindPopup('<strong>' + (i + 1) + '. ' + escapeHtml(p.name) + '</strong><br><span class="place-type-tag">' + escapeHtml(p.type) + '</span>' + (p.timeStart ? '<br>' + p.timeStart + ' ~ ' + p.timeEnd : ''));
        }
      },
      onMapClick: function (cb) {
        map.on('click', function (e) {
          cb(e.latlng.lat, e.latlng.lng);
        });
      },
      updateMapLanguage: updateMapLanguage,
    };
  }

  function refreshMainMapAfterShow() {
    if (!mapAdapter) return;
    setTimeout(function () {
      if (map && typeof map.invalidateSize === 'function') {
        map.invalidateSize();
      }
      if (searchCenter && mapAdapter.setView) {
        mapAdapter.setView(searchCenter.lat, searchCenter.lng, 15);
      }
      window.dispatchEvent(new Event('resize'));
    }, 350);
  }

  function initMap() {
    initSupabaseAuth();
    if (window.naver && window.naver.maps) {
      mapAdapter = createNaverAdapter();
    }
    if (!mapAdapter && window.L) {
      mapAdapter = createLeafletAdapter();
    }
    if (!mapAdapter) {
      var mapEl = document.getElementById('map');
      if (mapEl) mapEl.innerHTML = '<p style="padding:2rem;text-align:center;color:#a1a1aa;">' + t('mapLoadError') + '</p>';
      if (mapHint) mapHint.textContent = t('mapLoadFailed');
      bindNonMapHandlers();
      searchCenter = { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
      return;
    }

    if (!searchCenter) {
      searchCenter = { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
    }
    if (mapHint) mapHint.textContent = t('mapHintDefault');

    mapAdapter.onMapClick(function (lat, lng) {
      if (!isQuickRegionPick()) return;
      mapAdapter.addPickMarker(lat, lng, t('pickHerePlan'));
      searchCenter = { lat: lat, lng: lng };
      fetchFourDayForecast(lat, lng);
    });

    btnMyLocation.addEventListener('click', goToMyLocation);
    btnGenerate.addEventListener('click', generatePlan);
    btnReset.addEventListener('click', resetResult);
    if (btnQuickCourse) btnQuickCourse.addEventListener('click', runQuickCourse);
    document.querySelectorAll('input[name="quickCourseOrderMode"]').forEach(function (radio) {
      radio.addEventListener('change', updateCourseOrderSelectsVisibility);
    });
    updateCourseOrderSelectsVisibility();
    var courseOrder4El = $('courseOrder4');
    if (courseOrder4El) courseOrder4El.addEventListener('change', syncCourseOrder3SkipOption);
    if (btnOptimizeRoute) btnOptimizeRoute.addEventListener('click', runOptimizeRoute);
    if ($('btnKakaoShare')) $('btnKakaoShare').addEventListener('click', copyKakaoPlan);
    if ($('btnCardShare')) $('btnCardShare').addEventListener('click', openCardShareModal);
    if (tabCourse) tabCourse.addEventListener('click', function () { switchTab('course'); });
    if (tabShare) tabShare.addEventListener('click', function () { switchTab('share'); });
    if (btnCopyShareLink) btnCopyShareLink.addEventListener('click', copyShareLink);
    if (radiusSelect) {
      radiusSelect.addEventListener('change', updateRadiusCustomVisibility);
      updateRadiusCustomVisibility();
    }
    if (hasCarCheckbox) {
      hasCarCheckbox.addEventListener('change', syncTransportCarState);
      syncTransportCarState();
    }

    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          runSearch();
        }
      });
    }
    var btnSearch = $('btnSearch');
    if (btnSearch) btnSearch.addEventListener('click', runSearch);
    if (btnSaveCoursePreset) btnSaveCoursePreset.addEventListener('click', saveUserCoursePreset);
    if (btnLogin) {
      btnLogin.addEventListener('click', function () {
        if (currentUser && supabaseClient) {
          supabaseClient.auth.signOut();
        } else {
          showLoginModal();
        }
      });
    }
    if (btnSignUp) btnSignUp.addEventListener('click', showSignupModal);
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.getAttribute('data-lang');
        if (lang && lang !== currentLang) {
          currentLang = lang;
          localStorage.setItem(LANG_STORAGE, lang);
          applyLanguage();
          if (mapHint) mapHint.textContent = isQuickRegionPick() ? t('mapHintPick') : t('mapHintDefault');
          if (lastRenderedPlan) {
            renderPlan(
              lastRenderedPlan.plan,
              lastRenderedPlan.center,
              lastRenderedPlan.radiusMeters,
              lastRenderedPlan.start,
              lastRenderedPlan.end,
              lastRenderedPlan.timeNotice,
              lastRenderedPlan.estimatedCostWon != null ? lastRenderedPlan.estimatedCostWon : null,
              lastRenderedPlan.budgetWon != null ? lastRenderedPlan.budgetWon : null,
              lastRenderedPlan.pools || undefined,
              lastRenderedPlan.mbtiPJ || '',
              lastRenderedPlan.mbtiIE || ''
            );
          }
        }
      });
    });
  }

  function switchTab(tab) {
    if (tab === 'course') {
      if (panelCourse) panelCourse.hidden = false;
      if (panelShare) panelShare.hidden = true;
      if (tabCourse) { tabCourse.classList.add('active'); tabCourse.setAttribute('aria-selected', 'true'); }
      if (tabShare) { tabShare.classList.remove('active'); tabShare.setAttribute('aria-selected', 'false'); }
    } else {
      if (panelCourse) panelCourse.hidden = true;
      if (panelShare) panelShare.hidden = false;
      if (tabCourse) { tabCourse.classList.remove('active'); tabCourse.setAttribute('aria-selected', 'false'); }
      if (tabShare) { tabShare.classList.add('active'); tabShare.setAttribute('aria-selected', 'true'); }
      initShareMapOnce();
    }
  }

  function bindNonMapHandlers() {
    btnMyLocation.addEventListener('click', goToMyLocation);
    btnGenerate.addEventListener('click', generatePlan);
    btnReset.addEventListener('click', resetResult);
    if (btnQuickCourse) btnQuickCourse.addEventListener('click', runQuickCourse);
    document.querySelectorAll('input[name="quickCourseOrderMode"]').forEach(function (radio) {
      radio.addEventListener('change', updateCourseOrderSelectsVisibility);
    });
    updateCourseOrderSelectsVisibility();
    if ($('courseOrder4')) $('courseOrder4').addEventListener('change', syncCourseOrder3SkipOption);
    if (btnOptimizeRoute) btnOptimizeRoute.addEventListener('click', runOptimizeRoute);
    if ($('btnKakaoShare')) $('btnKakaoShare').addEventListener('click', copyKakaoPlan);
    if ($('btnCardShare')) $('btnCardShare').addEventListener('click', openCardShareModal);
    if (tabCourse) tabCourse.addEventListener('click', function () { switchTab('course'); });
    if (tabShare) tabShare.addEventListener('click', function () { switchTab('share'); });
    if (btnCopyShareLink) btnCopyShareLink.addEventListener('click', copyShareLink);
    if (radiusSelect) {
      radiusSelect.addEventListener('change', updateRadiusCustomVisibility);
      updateRadiusCustomVisibility();
    }
    if (hasCarCheckbox) {
      hasCarCheckbox.addEventListener('change', syncTransportCarState);
      syncTransportCarState();
    }
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
      });
    }
    if ($('btnSearch')) $('btnSearch').addEventListener('click', runSearch);
    if (btnSaveCoursePreset) btnSaveCoursePreset.addEventListener('click', saveUserCoursePreset);
    if (btnLogin) {
      btnLogin.addEventListener('click', function () {
        if (currentUser && supabaseClient) {
          supabaseClient.auth.signOut();
        } else {
          showLoginModal();
        }
      });
    }
    if (btnSignUp) btnSignUp.addEventListener('click', showSignupModal);
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.getAttribute('data-lang');
        if (lang && lang !== currentLang) {
          currentLang = lang;
          localStorage.setItem(LANG_STORAGE, lang);
          applyLanguage();
          if (mapHint) mapHint.textContent = isQuickRegionPick() ? t('mapHintPick') : t('mapHintDefault');
          if (lastRenderedPlan) {
            renderPlan(
              lastRenderedPlan.plan,
              lastRenderedPlan.center,
              lastRenderedPlan.radiusMeters,
              lastRenderedPlan.start,
              lastRenderedPlan.end,
              lastRenderedPlan.timeNotice,
              lastRenderedPlan.estimatedCostWon != null ? lastRenderedPlan.estimatedCostWon : null,
              lastRenderedPlan.budgetWon != null ? lastRenderedPlan.budgetWon : null,
              lastRenderedPlan.pools || undefined,
              lastRenderedPlan.mbtiPJ || '',
              lastRenderedPlan.mbtiIE || ''
            );
          }
        }
      });
    });
  }

  function runSearch() {
    var q = searchInput && searchInput.value.trim();
    if (!q || !mapAdapter) return;
    var wasSectionHidden = advancedSection && advancedSection.hidden;
    if (wasSectionHidden) {
      advancedSection.hidden = false;
      advancedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      refreshMainMapAfterShow();
      setTimeout(runSearch, 180);
      return;
    }
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=1')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data[0]) return;
        var lat = parseFloat(data[0].lat);
        var lon = parseFloat(data[0].lon);
        searchCenter = { lat: lat, lng: lon };
        var pickRadio = document.querySelector('input[name="quickRegion"][value="pick"]');
        if (pickRadio) pickRadio.checked = true;
        if (mapHint) mapHint.textContent = t('mapHintPick');
        if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
        mapAdapter.setView(lat, lon, 15);
        mapAdapter.addPickMarker(lat, lon, data[0].display_name || q);
        fetchFourDayForecast(lat, lon);
      })
      .catch(function () {});
  }

  function goToMyLocation() {
    if (!navigator.geolocation) {
      showError(t('errNoGeolocation'));
      return;
    }
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      showError(t('errLocationInsecure'));
      return;
    }
    if (mapHint) mapHint.textContent = t('locationConfirming');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var latitude = pos.coords.latitude;
        var longitude = pos.coords.longitude;
        searchCenter = { lat: latitude, lng: longitude };
        if (mapAdapter) {
          mapAdapter.setView(latitude, longitude, 15);
          mapAdapter.addUserMarker(latitude, longitude, t('currentLocation'));
          mapAdapter.removePickMarker();
        }
        var myRadio = document.querySelector('input[name="quickRegion"][value="my"]');
        if (myRadio) myRadio.checked = true;
        if (mapHint) mapHint.textContent = t('locationConfirmed') + ' (' + latitude.toFixed(4) + ', ' + longitude.toFixed(4) + ')';
        fetchFourDayForecast(latitude, longitude);
      },
      function (err) {
        var msg = (err && err.code === 1) ? t('errLocationPermissionDenied') : t('errLocationFailed');
        if (mapHint) mapHint.textContent = msg;
        showError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function getSearchCenter() {
    return searchCenter || null;
  }

  function getDefaultWeatherCenter() {
    if (currentLang === 'en') {
      return { lat: WASHINGTON_DC_LAT, lng: WASHINGTON_DC_LNG };
    }
    return { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
  }

  function fetchWeather() {
    var center = getDefaultWeatherCenter();
    var lat = center.lat;
    var lng = center.lng;
    var weatherPromise = fetch(WEATHER_URL + '?latitude=' + lat + '&longitude=' + lng + '&current=weather_code,precipitation').then(function (r) { return r.json(); });
    var aqPromise = fetch(AIR_QUALITY_URL + '?latitude=' + lat + '&longitude=' + lng + '&current=pm10,pm2_5').then(function (r) { return r.json(); }).catch(function () { return {}; });
    Promise.all([weatherPromise, aqPromise]).then(function (results) {
      var w = results[0];
      var aq = results[1];
      var code = (w.current && w.current.weather_code) ? w.current.weather_code : 0;
      var rainCodes = [61, 63, 65, 66, 67, 80, 81, 82];
      var snowCodes = [71, 73, 75, 77, 85, 86];
      var isRain = rainCodes.indexOf(code) !== -1 || snowCodes.indexOf(code) !== -1;
      var pm10 = (aq.current && aq.current.pm10 != null) ? aq.current.pm10 : 0;
      var pm25 = (aq.current && aq.current.pm2_5 != null) ? aq.current.pm2_5 : 0;
      if (isRain) weatherTheme = 'rain';
      else if (pm10 > 80 || pm25 > 55) weatherTheme = 'dust';
      else weatherTheme = 'fine';
      updateWeatherRecommendDisplay();
    }).catch(function () {
      weatherTheme = 'fine';
      updateWeatherRecommendDisplay();
    });
  }

  function updateWeatherRecommendDisplay() {
    var el = document.getElementById('weatherRecommend');
    var icon = document.getElementById('weatherRecommendIcon');
    var text = document.getElementById('weatherRecommendText');
    if (!el || !text) return;
    var defaultLabel = currentLang === 'en' ? t('weatherWashingtonBased') : t('weatherSeoulBased');
    var suffix = ' (' + defaultLabel + ')';
    if (weatherTheme === 'rain') {
      el.hidden = false;
      if (icon) icon.textContent = '🌧️ ';
      text.textContent = t('weatherRecommendRain') + suffix;
    } else if (weatherTheme === 'dust') {
      el.hidden = false;
      if (icon) icon.textContent = '😷 ';
      text.textContent = t('weatherRecommendDust') + suffix;
    } else if (weatherTheme === 'fine') {
      el.hidden = false;
      if (icon) icon.textContent = '☀️ ';
      text.textContent = t('weatherRecommendFine') + suffix;
    } else {
      el.hidden = true;
    }
  }

  function weatherCodeToTheme(code) {
    var c = code != null ? code : 0;
    if (c >= 51 && c <= 67) return 'rain';
    if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return 'rain';
    if (c >= 80 && c <= 82) return 'rain';
    if (c >= 95 && c <= 99) return 'rain';
    return 'fine';
  }

  function getWeatherRecommendKey(code) {
    var c = code != null ? code : 0;
    if (c >= 51 && c <= 67) return 'weatherRecommendRain';
    if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return 'weatherRecommendRain';
    if (c >= 80 && c <= 82) return 'weatherRecommendRain';
    if (c >= 95 && c <= 99) return 'weatherRecommendRain';
    if (c === 45 || c === 48) return 'weatherRecommendFog';
    if (c === 3) return 'weatherRecommendCloudy';
    return 'weatherRecommendFine';
  }

  function weatherCodeToDescription(code) {
    var c = code != null ? code : 0;
    if (c === 0) return { icon: '☀️', labelKey: 'wmoClear' };
    if (c === 1) return { icon: '🌤️', labelKey: 'wmoPartlyCloudy' };
    if (c === 2 || c === 3) return { icon: '☁️', labelKey: c === 2 ? 'wmoPartlyCloudy' : 'wmoCloudy' };
    if (c === 45 || c === 48) return { icon: '🌫️', labelKey: 'wmoFog' };
    if (c >= 51 && c <= 57) return { icon: '🌧️', labelKey: 'wmoDrizzle' };
    if (c >= 61 && c <= 67) return { icon: '🌧️', labelKey: 'wmoRain' };
    if (c >= 71 && c <= 77) return { icon: '❄️', labelKey: 'wmoSnow' };
    if (c >= 80 && c <= 82) return { icon: '🌦️', labelKey: 'wmoShowers' };
    if (c >= 85 && c <= 86) return { icon: '🌨️', labelKey: 'wmoSnow' };
    if (c >= 95 && c <= 99) return { icon: '⛈️', labelKey: 'wmoThunder' };
    return { icon: '☀️', labelKey: 'wmoClear' };
  }

  function fetchFourDayForecast(lat, lng) {
    lastForecastLat = lat;
    lastForecastLng = lng;
    fourDayForecast = null;
    renderFourDayWeatherCard(lat, lng);
    var tz = (Math.abs(lat - WASHINGTON_DC_LAT) < 0.5 && Math.abs(lng - WASHINGTON_DC_LNG) < 0.5) ? 'America%2FNew_York' : 'Asia%2FSeoul';
    var url = WEATHER_URL + '?latitude=' + lat + '&longitude=' + lng + '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=' + tz + '&forecast_days=4';
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var daily = data.daily;
      if (!daily || !daily.time || daily.time.length === 0) return;
      fourDayForecast = [];
      for (var i = 0; i < Math.min(4, daily.time.length); i++) {
        var code = (daily.weather_code && daily.weather_code[i] != null) ? daily.weather_code[i] : 0;
        var desc = weatherCodeToDescription(code);
        var tempMax = (daily.temperature_2m_max && daily.temperature_2m_max[i] != null) ? daily.temperature_2m_max[i] : null;
        var tempMin = (daily.temperature_2m_min && daily.temperature_2m_min[i] != null) ? daily.temperature_2m_min[i] : null;
        fourDayForecast.push({
          date: daily.time[i],
          weather_code: code,
          theme: weatherCodeToTheme(code),
          icon: desc.icon,
          labelKey: desc.labelKey,
          tempMax: tempMax,
          tempMin: tempMin,
        });
      }
      selectedForecastDayIndex = 0;
      renderFourDayWeatherCard(lat, lng);
    }).catch(function () {
      fourDayForecast = null;
      renderFourDayWeatherCard(lat, lng);
    });
  }

  function formatForecastDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T12:00:00');
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var week = [t('daySun'), t('dayMon'), t('dayTue'), t('dayWed'), t('dayThu'), t('dayFri'), t('daySat')][d.getDay()];
    return month + '/' + day + ' (' + week + ')';
  }

  function renderFourDayWeatherCard(lat, lng) {
    var wrap = document.getElementById('weatherCardWrap');
    var title = document.getElementById('weatherCardTitle');
    var sub = document.getElementById('weatherCardSub');
    var daysWrap = document.getElementById('weatherCardDays');
    var summary = document.getElementById('weatherCardSummary');
    if (!wrap || !daysWrap) return;
    var defaultCenter = getDefaultWeatherCenter();
    var isDefaultLocation = Math.abs(lat - defaultCenter.lat) < 0.01 && Math.abs(lng - defaultCenter.lng) < 0.01;
    if (title) title.textContent = t('weatherCardTitle');
    if (sub) sub.textContent = isDefaultLocation ? (currentLang === 'en' ? t('weatherWashingtonBased') : t('weatherSeoulBased')) : t('weatherLocationBased');
    if (!fourDayForecast || fourDayForecast.length === 0) {
      daysWrap.innerHTML = '<p class="weather-card-loading">' + t('weatherLoading') + '</p>';
      if (summary) summary.textContent = '';
      return;
    }
    daysWrap.innerHTML = fourDayForecast.map(function (day, i) {
      var label = i === 0 ? t('dayToday') : (i === 1 ? t('dayTomorrow') : formatForecastDate(day.date));
      var sel = i === selectedForecastDayIndex ? ' is-selected' : '';
      var icon = day.icon || (day.theme === 'rain' ? '🌧️' : '☀️');
      var cond = day.labelKey ? t(day.labelKey) : (day.theme === 'rain' ? t('wmoRain') : t('wmoClear'));
      var tempStr = '';
      if (day.tempMax != null && day.tempMin != null) {
        tempStr = Math.round(day.tempMin) + '~' + Math.round(day.tempMax) + t('tempUnit');
      } else if (day.tempMax != null) {
        tempStr = Math.round(day.tempMax) + t('tempUnit');
      }
      return '<button type="button" class="weather-day-btn' + sel + '" data-index="' + i + '">' +
        '<span class="weather-day-icon">' + icon + '</span>' +
        '<span class="weather-day-info">' +
          '<span class="weather-day-label">' + escapeHtml(label) + '</span>' +
          '<span class="weather-day-cond">' + escapeHtml(cond) + '</span>' +
          (tempStr ? '<span class="weather-day-temp">' + escapeHtml(tempStr) + '</span>' : '') +
        '</span>' +
        '</button>';
    }).join('');
    daysWrap.querySelectorAll('.weather-day-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedForecastDayIndex = parseInt(btn.getAttribute('data-index'), 10);
        if (!isNaN(selectedForecastDayIndex)) renderFourDayWeatherCard(lat, lng);
      });
    });
    var selected = fourDayForecast[selectedForecastDayIndex];
    if (summary && selected) {
      var cond = selected.labelKey ? t(selected.labelKey) : (selected.theme === 'rain' ? t('wmoRain') : t('wmoClear'));
      var tempStr = '';
      if (selected.tempMax != null && selected.tempMin != null) {
        tempStr = Math.round(selected.tempMin) + '~' + Math.round(selected.tempMax) + t('tempUnit');
      } else if (selected.tempMax != null) {
        tempStr = Math.round(selected.tempMax) + t('tempUnit');
      }
      var recommendKey = getWeatherRecommendKey(selected.weather_code);
      summary.textContent = cond + (tempStr ? ' ' + tempStr : '') + ' · ' + t(recommendKey);
    }
  }

  function getWeatherThemeForPlan() {
    if (fourDayForecast && fourDayForecast[selectedForecastDayIndex]) {
      return fourDayForecast[selectedForecastDayIndex].theme;
    }
    return weatherTheme;
  }

  function isQuickRegionPick() {
    return (document.querySelector('input[name="quickRegion"]:checked') || {}).value === 'pick';
  }

  function showError(msg) {
    alert(msg);
  }

  async function overpassQuery(center, radiusMeters) {
    var lat = center.lat;
    var lng = center.lng;
    var r = radiusMeters;
    var query = [
      '[out:json][timeout:25];',
      '(',
      'node["amenity"~"restaurant|cafe|fast_food|bar|ice_cream"](around:' + r + ',' + lat + ',' + lng + ');',
      'node["tourism"~"museum|gallery|theme_park|attraction"](around:' + r + ',' + lat + ',' + lng + ');',
      'node["shop"~"mall|department_store"](around:' + r + ',' + lat + ',' + lng + ');',
      'node["leisure"~"park|garden"](around:' + r + ',' + lat + ',' + lng + ');',
      'way["amenity"~"restaurant|cafe|fast_food"](around:' + r + ',' + lat + ',' + lng + ');',
      'way["leisure"~"park|garden"](around:' + r + ',' + lat + ',' + lng + ');',
      ');',
      'out center body;',
    ].join('\n');
    var res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error('장소 검색 실패');
    var json = await res.json();
    return json.elements || [];
  }

  function isOsmPlaceClosed(tags) {
    if (!tags || typeof tags !== 'object') return false;
    if (tags['disused:amenity'] || tags['abandoned:amenity']) return true;
    var ab = String(tags.abandoned || '').toLowerCase();
    var dem = String(tags.demolished || '').toLowerCase();
    var raz = String(tags.razed || '').toLowerCase();
    if (ab === 'yes' || ab === '1') return true;
    if (dem === 'yes' || dem === '1') return true;
    if (raz === 'yes' || raz === '1') return true;
    var life = String(tags.lifecycle || '').toLowerCase();
    if (life === 'abandoned' || life === 'disused' || life === 'demolished') return true;
    return false;
  }

  function parseOsmPriceTag(value) {
    if (value == null || value === '') return null;
    var v = String(value).toLowerCase().trim();
    if (v === 'cheap' || v === 'low' || v === 'free' || v === '€' || v === '$' || v === '1') return 'cheap';
    if (v === 'expensive' || v === 'high' || v === '€€€' || v === '€€€€' || v === '$$$$' || v === '4' || v === '3') return 'expensive';
    if (v === 'moderate' || v === '€€' || v === '$$' || v === '2') return 'normal';
    var num = parseFloat(v.replace(/[^\d.]/g, ''), 10);
    if (!isNaN(num)) {
      if (num <= 1) return 'cheap';
      if (num >= 3) return 'expensive';
      return 'normal';
    }
    return null;
  }

  function parseElements(elements) {
    var places = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var tags = el.tags || {};
      if (isOsmPlaceClosed(tags)) continue;
      var lat = el.lat != null ? el.lat : (el.center && el.center.lat);
      var lon = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (lat == null || lon == null) continue;
      // 이름이 전혀 없는 장소(이름 태그 없음)는 일정 후보에서 제외
      if (!(tags.name || tags['name:ko'] || tags['name:en'])) continue;
      var name = tags.name || (currentLang === 'en' ? tags['name:en'] : tags['name:ko']) || t('nameUnknown');
      var type = t('type_place');
      var typeKey = 'place';
      if (tags.amenity) {
        var am = tags.amenity;
        if (am === 'restaurant') { type = t('type_restaurant'); typeKey = 'restaurant'; }
        else if (am === 'cafe') { type = t('type_cafe'); typeKey = 'cafe'; }
        else if (am === 'fast_food') { type = t('type_fast_food'); typeKey = 'fast_food'; }
        else if (am === 'bar') { type = t('type_bar'); typeKey = 'bar'; }
        else if (am === 'ice_cream') { type = t('type_ice_cream'); typeKey = 'ice_cream'; }
        else { type = am; typeKey = 'place'; }
      } else if (tags.tourism) {
        var t2 = tags.tourism;
        if (t2 === 'museum') { type = t('type_museum'); typeKey = 'museum'; }
        else if (t2 === 'gallery') { type = t('type_gallery'); typeKey = 'gallery'; }
        else if (t2 === 'theme_park') { type = t('type_theme_park'); typeKey = 'theme_park'; }
        else if (t2 === 'attraction') { type = t('type_attraction'); typeKey = 'attraction'; }
        else { type = t2; typeKey = 'place'; }
      } else if (tags.shop) {
        type = tags.shop === 'mall' ? t('type_mall') : tags.shop;
        typeKey = tags.shop === 'mall' ? 'mall' : 'place';
      } else if (tags.leisure) {
        var lev = tags.leisure;
        if (lev === 'park' || lev === 'garden') { type = t('type_park'); typeKey = 'park'; }
        else { type = lev; typeKey = 'place'; }
      }
      var addr = [tags['addr:street'], tags['addr:housenumber'], tags['addr:full']].filter(Boolean).join(' ') || tags.address || '';
      var priceTier = parseOsmPriceTag(tags.price) || (tags.fee != null && String(tags.fee).toLowerCase() === 'free' ? 'cheap' : null);
      places.push({ name: name, type: type, typeKey: typeKey, lat: lat, lon: lon, addr: addr, tags: tags, priceTier: priceTier });
    }
    return places;
  }

  function getCongestion(place) {
    var key = (place.name || '') + (place.lat || 0).toFixed(4) + (place.lon || 0).toFixed(4);
    var n = 0;
    for (var i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0;
    var r = (n % 100) / 100;
    if (r < 0.4) return { level: 'relaxed', labelKey: 'congestionRelaxed' };
    if (r < 0.75) return { level: 'normal', labelKey: 'congestionNormal' };
    return { level: 'busy', labelKey: 'congestionBusy' };
  }

  function isNaverSearchConfigured() {
    // Netlify 함수가 설정되어 있다고 가정
    return true;
  }

  function fetchNaverLocalSearch(query, sort) {
    if (!query || !String(query).trim()) return Promise.resolve(null);
    var url =
      NAVER_SEARCH_LOCAL_URL +
      '?query=' +
      encodeURIComponent(String(query).trim()) +
      '&sort=' +
      (sort === 'comment' ? 'comment' : 'random');
    return fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.errorCode) return null;
        var total = (data.total != null) ? parseInt(data.total, 10) : 0;
        var items = (data.items && Array.isArray(data.items)) ? data.items : [];
        return { total: isNaN(total) ? 0 : total, items: items };
      })
      .catch(function () { return null; });
  }

  function getCategoryScoreDivisor(typeKey) {
    if (!typeKey) return 1;
    if (typeKey === 'park') return 0.5;
    if (typeKey === 'museum' || typeKey === 'gallery') return 0.75;
    if (typeKey === 'attraction' || typeKey === 'theme_park') return 0.85;
    return 1;
  }

  function enrichPlanWithNaverCongestion(plan) {
    if (!plan || plan.length === 0 || !isNaverSearchConfigured()) return Promise.resolve(plan);
    var queries = plan.map(function (p) { return (p.name || '').trim() || null; });
    return Promise.all(queries.map(function (q) { return fetchNaverLocalSearch(q || '', 'comment'); }))
      .then(function (results) {
        var totals = results.map(function (r) { return r && r.total != null ? r.total : 0; });
        var adjustedScores = plan.map(function (p, i) {
          var div = getCategoryScoreDivisor(p.typeKey);
          return div > 0 ? totals[i] / div : totals[i];
        });
        var indices = adjustedScores.map(function (_, i) { return i; });
        indices.sort(function (a, b) { return adjustedScores[b] - adjustedScores[a]; });
        var levelByIndex = {};
        for (var i = 0; i < indices.length; i++) {
          if (indices.length === 1) levelByIndex[indices[i]] = 'normal';
          else if (i === 0) levelByIndex[indices[i]] = 'busy';
          else if (i === indices.length - 1) levelByIndex[indices[i]] = 'relaxed';
          else levelByIndex[indices[i]] = 'normal';
        }
        var labelByLevel = { relaxed: 'congestionRelaxed', normal: 'congestionNormal', busy: 'congestionBusy' };
        var highlightKeywords = ['인생샷', '분위기', '데이트'];
        for (var j = 0; j < plan.length; j++) {
          var level = levelByIndex[j] || 'normal';
          plan[j].congestion = { level: level, labelKey: labelByLevel[level] };
          plan[j].highlight = false;
          var items = results[j] && results[j].items;
          if (items && Array.isArray(items)) {
            for (var k = 0; k < items.length; k++) {
              var title = (items[k].title || '').replace(/<[^>]+>/g, '').trim();
              var desc = (items[k].description || '').replace(/<[^>]+>/g, '').trim();
              var text = title + ' ' + desc;
              var found = highlightKeywords.some(function (kw) { return text.indexOf(kw) !== -1; });
              if (found) { plan[j].highlight = true; break; }
            }
          }
        }
        return plan;
      })
      .catch(function () { return plan; });
  }

  function getCongestionPreference() {
    var r = document.querySelector('input[name="congestionPreference"]:checked');
    var v = r ? r.value : 'normal';
    return (v === 'relaxed' || v === 'busy') ? v : 'normal';
  }

  function getMbtiPJ() {
    var r = document.querySelector('input[name="mbtiPJ"]:checked');
    var v = r ? r.value : '';
    return (v === 'P' || v === 'J') ? v : '';
  }

  function getMbtiIE() {
    var r = document.querySelector('input[name="mbtiIE"]:checked');
    var v = r ? r.value : '';
    return (v === 'I' || v === 'E') ? v : '';
  }

  function congestionMatchesPreference(placeLevel, preference) {
    if (preference === 'relaxed') return placeLevel === 'relaxed' || placeLevel === 'normal';
    if (preference === 'busy') return placeLevel === 'normal' || placeLevel === 'busy';
    return true;
  }

  function timeToMinutes(timeStr) {
    var parts = timeStr.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }

  function minutesToTime(min) {
    var h = Math.floor(min / 60) % 24;
    var m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function formatWon(amount) {
    if (amount == null) return '';
    var n = Math.round(amount);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function getQuickCourseCenter(cb) {
    var regionVal = (document.querySelector('input[name="quickRegion"]:checked') || {}).value || 'my';
    if (regionVal === 'pick') {
      if (searchCenter) {
        cb({ lat: searchCenter.lat, lng: searchCenter.lng, name: t('pickHerePlan') });
        return;
      }
      if (mapHint) mapHint.textContent = t('mapHintPick');
      showError(t('errNoLocationPick'));
      return;
    }
    if (!navigator.geolocation) {
      showError(t('errNoGeolocation'));
      return;
    }
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      showError(t('errLocationInsecure'));
      return;
    }
    if (mapHint) mapHint.textContent = t('locationConfirming');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var c = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: t('currentLocation') };
        if (mapHint) mapHint.textContent = t('locationConfirmed');
        cb(c);
      },
      function (err) {
        var msg = (err && err.code === 1) ? t('errLocationPermissionDenied') : t('errLocationFailed');
        if (mapHint) mapHint.textContent = msg;
        showError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  var DEFAULT_COURSE_ORDER = ['restaurant', 'cafe', 'activity', 'park'];

  // 코스 타입별 기본/넉넉한 시간 및 절대 상한선(분)
  // base: 기본 모드(선택 안함/J)
  // p: P(넉넉한 코스) 선택 시 목표 시간
  // max: 남는 시간이 있을 때 늘릴 수 있는 절대 상한선
  var SLOT_CONFIG = {
    restaurant: { base: 90, p: 120, max: 150 },   // 1h30, 2h, 최대 2h30 (단, 최대치는 비쌈 가격대일 때만 사용)
    cafe: { base: 90, p: 120, max: 150 },         // 1h30, 2h, 최대 2h30
    activity: { base: 120, p: 180, max: 210 },    // 2h, 3h, 최대 3h30
    park: { base: 60, p: 90, max: 90 },           // 1h, 1h30, 최대 1h30
  };
  var REMOVAL_ORDER = ['park', 'cafe', 'activity'];

  function computeSlotsAndDurations(order, totalMin, options) {
    var generous = options && options.generous;
    var priceTier = options && options.priceTier;
    var currentOrder = order.slice();
    var removed = [];
    var config = SLOT_CONFIG;

    // 1단계: 시간 부족할 때 우선순위(공원 < 카페 < 놀거리 <= 식당)대로 타입을 제거
    while (currentOrder.length > 1) {
      var need = 0;
      for (var i = 0; i < currentOrder.length; i++) {
        var c = config[currentOrder[i]] || { base: 60, p: 90, max: 120 };
        var baseDur = generous ? c.p : c.base;
        need += baseDur;
      }
      if (need <= totalMin) break;
      var toRemoveIdx = -1;
      for (var r = 0; r < REMOVAL_ORDER.length; r++) {
        var idx = currentOrder.indexOf(REMOVAL_ORDER[r]);
        if (idx !== -1) { toRemoveIdx = idx; break; }
      }
      if (toRemoveIdx === -1) break;
      removed.push(currentOrder[toRemoveIdx]);
      currentOrder.splice(toRemoveIdx, 1);
    }

    // 2단계: 기본(P 여부에 따른) 목표 시간 배분
    var durations = [];
    var need = 0;
    for (var j = 0; j < currentOrder.length; j++) {
      var typeKey = currentOrder[j];
      var c = config[typeKey] || { base: 60, p: 90, max: 120 };
      var d = generous ? c.p : c.base;
      // 식당은 기본 1h30, P 선택 시 2h, 그 이상은 별도 단계에서만 확장
      durations.push(d);
      need += d;
    }

    // 3단계: 기본 모드(선택 안함/J)에서만 전체 시간에 맞게 스케일 조정
    if (need > totalMin && currentOrder.length > 0 && !generous) {
      var scale = totalMin / need;
      for (var jj = 0; jj < durations.length; jj++) {
        durations[jj] = Math.max(15, Math.floor(durations[jj] * scale));
      }
      var remainder = totalMin - durations.reduce(function (a, b) { return a + b; }, 0);
      if (remainder > 0 && durations.length) durations[0] += remainder;
      need = totalMin;
    }

    // 4단계: 남는 시간 있으면 각 타입의 절대 상한선(max)까지 조금씩 늘려줌
    var extra = totalMin - need;
    for (var k = 0; extra > 0 && k < currentOrder.length; k++) {
      var typeKey = currentOrder[k];
      var c = config[typeKey] || { base: 60, p: 90, max: 120 };
      var max = c.max;
      // 식당 시간 상한: 기본=1h30, P=2h, 비쌈일 때만 2h30 허용
      if (typeKey === 'restaurant') {
        if (priceTier === 'expensive') {
          max = c.max;        // 150분
        } else if (generous) {
          max = c.p;          // 120분
        } else {
          max = c.base;       // 90분
        }
      }
      var add = Math.min(extra, max - durations[k]);
      if (add > 0) { durations[k] += add; extra -= add; }
    }
    return { order: currentOrder, durations: durations, removed: removed };
  }

  function buildTimeShortageMessage(removed) {
    if (!removed || removed.length === 0) return null;
    var names = [];
    if (removed.indexOf('park') !== -1) names.push(t('courseTypePark'));
    if (removed.indexOf('cafe') !== -1) names.push(t('courseTypeCafe'));
    if (removed.indexOf('activity') !== -1) names.push(t('courseTypeActivity'));
    if (names.length === 0) return null;
    return t('timeShortageExcluded') + ' ' + names.join(', ') + ' ' + t('timeShortageExcludedSuffix');
  }

  function getQuickCourseOrder() {
    var mode = (document.querySelector('input[name="quickCourseOrderMode"]:checked') || {}).value || 'random';
    if (mode === 'default') mode = 'random';
    var baseOrder = DEFAULT_COURSE_ORDER.slice();
    if (mode === 'random') {
      baseOrder = shuffle(DEFAULT_COURSE_ORDER.slice());
    } else {
      var s1 = $('courseOrder1');
      var s2 = $('courseOrder2');
      var s3 = $('courseOrder3');
      var s4 = $('courseOrder4');
      if (s1 && s2 && s3 && s4) {
        var order = [s1.value, s2.value, s3.value, s4.value].filter(function (v) { return v && v !== 'skip'; });
        baseOrder = order.length ? order : DEFAULT_COURSE_ORDER.slice();
      }
    }
    var budget = getBudgetWon();
    if (budget != null && budget > 0) {
      baseOrder = applyBudgetToOrder(baseOrder, budget);
    }
    return baseOrder.length ? baseOrder : DEFAULT_COURSE_ORDER.slice();
  }

  function getPriceTier() {
    var r = document.querySelector('input[name="priceTier"]:checked');
    var v = r ? r.value : 'normal';
    return (v === 'cheap' || v === 'expensive') ? v : 'normal';
  }

  function getEstimatedCosts() {
    var tier = getPriceTier();
    return ESTIMATED_COST_BY_TIER[tier] || ESTIMATED_COST_BY_TIER.normal;
  }

  function getBudgetWon() {
    var el = $('budgetInput');
    if (!el || !el.value.trim()) return null;
    var n = parseInt(el.value.replace(/\s|,/g, ''), 10);
    return isNaN(n) || n < 0 ? null : n;
  }

  function applyBudgetToOrder(order, budgetWon) {
    var costs = getEstimatedCosts();
    var sum = 0;
    var result = [];
    for (var i = 0; i < order.length; i++) {
      var cost = costs[order[i]] != null ? costs[order[i]] : 0;
      if (sum + cost <= budgetWon) {
        result.push(order[i]);
        sum += cost;
      }
    }
    return result.length ? result : [order[0]];
  }

  function getPoolIndexAndSlotType(typeKey) {
    if (!typeKey) return { poolIndex: 0, slotTypeKey: 'restaurant' };
    if (['restaurant', 'fast_food', 'bar'].indexOf(typeKey) !== -1) return { poolIndex: 0, slotTypeKey: 'restaurant' };
    if (typeKey === 'cafe' || typeKey === 'ice_cream') return { poolIndex: 1, slotTypeKey: 'cafe' };
    if (['museum', 'gallery', 'theme_park', 'attraction', 'mall'].indexOf(typeKey) !== -1) return { poolIndex: 2, slotTypeKey: 'activity' };
    if (typeKey === 'park') return { poolIndex: 3, slotTypeKey: 'park' };
    return { poolIndex: 0, slotTypeKey: 'restaurant' };
  }

  function sortPoolByPriceTier(pool, slotTypeKey, tier) {
    if (!pool || pool.length === 0) return pool.slice();
    function byPriceMatch(a, b) {
      var am = (a.priceTier === tier) ? 2 : (a.priceTier == null ? 1 : 0);
      var bm = (b.priceTier === tier) ? 2 : (b.priceTier == null ? 1 : 0);
      return bm - am;
    }
    var order;
    if (slotTypeKey === 'restaurant') {
      if (tier === 'cheap') order = ['fast_food', 'restaurant', 'bar'];
      else if (tier === 'expensive') order = ['restaurant', 'bar', 'fast_food'];
      else order = ['restaurant', 'fast_food', 'bar'];
    } else if (slotTypeKey === 'cafe') {
      if (tier === 'cheap') order = ['ice_cream', 'cafe'];
      else if (tier === 'expensive') order = ['cafe', 'ice_cream'];
      else order = ['cafe', 'ice_cream'];
    } else {
      var rest = pool.slice().sort(byPriceMatch);
      return shuffle(rest);
    }
    var sorted = [];
    for (var o = 0; o < order.length; o++) {
      var group = pool.filter(function (p) { return p.typeKey === order[o]; });
      group.sort(byPriceMatch);
      if (group.length) sorted = sorted.concat(shuffle(group));
    }
    var rest = pool.filter(function (p) { return order.indexOf(p.typeKey) === -1; });
    rest.sort(byPriceMatch);
    if (rest.length) sorted = sorted.concat(shuffle(rest));
    return sorted.length ? sorted : pool.slice();
  }

  function updateCourseOrderSelectsVisibility() {
    var wrap = $('courseOrderSelectsWrap');
    var mode = (document.querySelector('input[name="quickCourseOrderMode"]:checked') || {}).value;
    var isCustom = mode === 'custom';
    if (wrap) wrap.hidden = !isCustom;
    [1, 2, 3, 4].forEach(function (n) {
      var sel = $('courseOrder' + n);
      if (sel) sel.disabled = !isCustom;
    });
    if (isCustom) syncCourseOrder3SkipOption();
  }

  function syncCourseOrder3SkipOption() {
    var s3 = $('courseOrder3');
    var s4 = $('courseOrder4');
    if (!s3 || !s4) return;
    var skipOption = null;
    for (var i = 0; i < s3.options.length; i++) {
      if (s3.options[i].value === 'skip') { skipOption = s3.options[i]; break; }
    }
    if (!skipOption) return;
    if (s4.value !== 'skip') {
      skipOption.disabled = true;
      if (s3.value === 'skip') s3.value = 'activity';
    } else {
      skipOption.disabled = false;
    }
  }

  function runQuickCourse() {
    if (advancedSection) {
      advancedSection.hidden = false;
      advancedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      refreshMainMapAfterShow();
      var center = searchCenter || getDefaultWeatherCenter();
      fetchFourDayForecast(center.lat, center.lng);
    }
    if (mapHint) mapHint.textContent = isQuickRegionPick() ? t('mapHintPick') : t('mapHintDefault');
  }

  function generatePlan() {
    if (isQuickRegionPick()) {
      var center = getSearchCenter();
      if (!center) {
        showError(t('errNoLocation'));
        return;
      }
      doGeneratePlan(center);
      return;
    }
    if (!navigator.geolocation) {
      showError(t('errNoGeolocation'));
      return;
    }
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      showError(t('errLocationInsecure'));
      return;
    }
    if (mapHint) mapHint.textContent = t('locationConfirming');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        searchCenter = center;
        if (mapAdapter) {
          mapAdapter.setView(center.lat, center.lng, 15);
          mapAdapter.addUserMarker(center.lat, center.lng, t('currentLocation'));
          mapAdapter.removePickMarker();
        }
        if (mapHint) mapHint.textContent = t('locationConfirmed') + ' (' + center.lat.toFixed(4) + ', ' + center.lng.toFixed(4) + ')';
        doGeneratePlan(center);
      },
      function (err) {
        var msg = (err && err.code === 1) ? t('errLocationPermissionDenied') : t('errLocationFailed');
        if (mapHint) mapHint.textContent = msg;
        showError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function doGeneratePlan(center) {
    if (!center || !startTime || !endTime || !radiusSelect) return;
    var start = timeToMinutes(startTime.value);
    var end = timeToMinutes(endTime.value);
    if (end <= start) {
      showError(t('errTimeRange'));
      return;
    }
    var radiusMeters = getRadiusMeters();
    if (radiusMeters == null) {
      showError(t('errRadiusCustom'));
      return;
    }
    if (loading) {
      loading.classList.add('is-visible');
      loading.setAttribute('aria-hidden', 'false');
    }
    if (resultSection) resultSection.hidden = true;

    (async function () {
      try {
        var elements = await overpassQuery(center, radiusMeters);
        var allPlaces = parseElements(elements);
        if (allPlaces.length === 0) {
          if (loading) { loading.classList.remove('is-visible'); loading.setAttribute('aria-hidden', 'true'); }
          showError(t('errNoPlaces'));
          return;
        }
        var restaurants = allPlaces.filter(function (p) { return ['restaurant', 'fast_food', 'bar'].indexOf(p.typeKey) !== -1; });
        var cafes = allPlaces.filter(function (p) { return p.typeKey === 'cafe' || p.typeKey === 'ice_cream'; });
        var activities = allPlaces.filter(function (p) { return ['museum', 'gallery', 'theme_park', 'attraction', 'mall'].indexOf(p.typeKey) !== -1; });
        var parks = allPlaces.filter(function (p) { return p.typeKey === 'park'; });
        var typeOrder = getQuickCourseOrder();
        var budget = getBudgetWon();
        var fullOrder = ['restaurant', 'cafe', 'activity', 'park'];
        var budgetExcluded = budget != null && budget > 0 && typeOrder.length < fullOrder.length;
        var pools = [
          restaurants.length ? restaurants : allPlaces,
          cafes.length ? cafes : allPlaces,
          activities.length ? activities : allPlaces,
          parks.length ? parks : allPlaces,
        ];
        var mbtiPJ = getMbtiPJ();
        var mbtiIE = getMbtiIE();
        var effectiveCongestion = (mbtiIE === 'I') ? 'relaxed' : ((mbtiIE === 'E') ? 'busy' : getCongestionPreference());
        var totalMin = end - start;
        var tierForSlots = getPriceTier();
        var slotResult = computeSlotsAndDurations(typeOrder, totalMin, { generous: mbtiPJ === 'P', priceTier: tierForSlots });
        var finalOrder = slotResult.order;
        var slotDurations = slotResult.durations;
        var removed = slotResult.removed;

        // 예상 인당 비용 계산 (선택 예산과 무관하게 항상 계산)
        var tierCosts = getEstimatedCosts();
        var estimatedCostWon = 0;
        for (var eo = 0; eo < finalOrder.length; eo++) {
          var key = finalOrder[eo];
          if (tierCosts[key] != null) {
            estimatedCostWon += tierCosts[key];
          }
        }
        var plan = [];
        var used = new Set();
        var substituted = [];
        var typeToPoolIndex = { restaurant: 0, cafe: 1, activity: 2, park: 3 };
        var slotTypeLabelKeys = { restaurant: 'courseTypeRestaurant', cafe: 'courseTypeCafe', activity: 'courseTypeActivity', park: 'courseTypePark' };
        var t = start;
        var tier = getPriceTier();
        for (var i = 0; i < finalOrder.length; i++) {
          var slotType = finalOrder[i];
          var poolIdx = typeToPoolIndex[slotType] !== undefined ? typeToPoolIndex[slotType] : 0;
          var pool = pools[poolIdx] || allPlaces;
          var sortedPool = sortPoolByPriceTier(pool, slotType, tier);
          var available = sortedPool.filter(function (p) {
            return !used.has(p.name) && congestionMatchesPreference(getCongestion(p).level, effectiveCongestion);
          });
          if (available.length === 0) available = sortedPool.filter(function (p) { return !used.has(p.name); });
          if (available.length === 0) available = shuffle(allPlaces).filter(function (p) { return !used.has(p.name); });
          if (plan.length > 0 && available.length > 1) {
            var prevSlotType = getPoolIndexAndSlotType(plan[plan.length - 1].typeKey).slotTypeKey;
            var otherType = available.filter(function (p) {
              return getPoolIndexAndSlotType(p.typeKey || 'restaurant').slotTypeKey !== prevSlotType;
            });
            if (otherType.length) available = otherType;
          }
          var pick = available[0] || shuffle(allPlaces).find(function (p) { return !used.has(p.name); });
          if (!pick) break;
          used.add(pick.name);
          var pickSlotType = getPoolIndexAndSlotType(pick.typeKey || 'restaurant').slotTypeKey;
          if (pickSlotType !== slotType) {
            substituted.push({ wanted: slotType, got: pickSlotType });
          }
          var dur = slotDurations[i] || 90;
          // 식당 시간은 하드 캡: 기본 90분, P=120분, 비쌈+P일 때만 최대 150분
          if (finalOrder[i] === 'restaurant' || (pick.typeKey || 'place') === 'restaurant') {
            var baseMax = (mbtiPJ === 'P') ? 120 : 90;
            var hardMax = (tier === 'expensive' && mbtiPJ === 'P') ? 150 : baseMax;
            if (dur > hardMax) dur = hardMax;
          }
          var endT = t + dur;
          var congestion = getCongestion(pick);
          plan.push({
            name: pick.name,
            type: pick.type,
            typeKey: pick.typeKey || 'place',
            lat: pick.lat,
            lon: pick.lon,
            addr: pick.addr,
            tags: pick.tags,
            timeStart: minutesToTime(t),
            timeEnd: minutesToTime(endT),
            congestion: congestion,
          });
          t = endT;
        }
        if (isNaverSearchConfigured()) {
          plan = await enrichPlanWithNaverCongestion(plan);
        }
        var timeNotice = buildTimeShortageMessage(removed);
        if (budgetExcluded) timeNotice = (timeNotice ? timeNotice + ' ' : '') + t('budgetExceeded');
        if (substituted && substituted.length > 0) {
          var subLines = substituted.map(function (s) {
            var wantLabel = t(slotTypeLabelKeys[s.wanted] || '');
            var gotLabel = t(slotTypeLabelKeys[s.got] || '');
            return (t('substitutionItem').replace('%s', wantLabel)).replace('%s', gotLabel);
          });
          var subMsg = t('substitutionNotice') + ' (' + subLines.join(', ') + ')';
          timeNotice = (timeNotice ? timeNotice + ' ' : '') + subMsg;
        }
        renderPlan(plan, center, radiusMeters, startTime.value, endTime.value, timeNotice, estimatedCostWon, budget, pools, mbtiPJ, mbtiIE);
        if (resultSection) {
          resultSection.hidden = false;
          resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        addPlanToPlansArea(plan, center, radiusMeters, startTime.value, endTime.value, timeNotice, estimatedCostWon, budget, mbtiPJ, mbtiIE);
        scheduleCardShareReminder(startTime.value, endTime.value);
      } catch (e) {
        console.error(e);
        showError(t('errGenerate'));
      } finally {
        if (loading) { loading.classList.remove('is-visible'); loading.setAttribute('aria-hidden', 'true'); }
      }
    })();
  }

  function replacePlanItem(index) {
    var lr = lastRenderedPlan;
    if (!lr || !lr.plan || !lr.pools || index < 0 || index >= lr.plan.length) return;
    var plan = lr.plan.slice();
    var item = plan[index];
    var typeKey = item.typeKey || 'restaurant';
    var _a = getPoolIndexAndSlotType(typeKey);
    var poolIndex = _a.poolIndex;
    var slotTypeKey = _a.slotTypeKey;
    var pool = lr.pools[poolIndex];
    if (!pool || pool.length === 0) {
      showError(t('errNoOtherPlace'));
      return;
    }
    var used = new Set(plan.map(function (p) { return p.name; }));
    var mbtiIE = (lr.mbtiIE != null) ? lr.mbtiIE : '';
    var effectiveCongestion = (mbtiIE === 'I') ? 'relaxed' : ((mbtiIE === 'E') ? 'busy' : getCongestionPreference());
    var available = pool.filter(function (p) {
      return !used.has(p.name) && congestionMatchesPreference(getCongestion(p).level, effectiveCongestion);
    });
    if (available.length === 0) available = pool.filter(function (p) { return !used.has(p.name); });
    if (available.length === 0) {
      showError(t('errNoOtherPlace'));
      return;
    }
    var tier = getPriceTier();
    var sorted = sortPoolByPriceTier(available, slotTypeKey, tier);
    var pick = sorted[Math.floor(Math.random() * sorted.length)] || sorted[0];
    var congestion = getCongestion(pick);
    plan[index] = {
      name: pick.name,
      type: pick.type,
      typeKey: pick.typeKey || 'place',
      lat: pick.lat,
      lon: pick.lon,
      addr: pick.addr,
      tags: pick.tags,
      timeStart: item.timeStart,
      timeEnd: item.timeEnd,
      congestion: congestion,
    };
    lastRenderedPlan.plan = plan;
    renderPlan(plan, lr.center, lr.radiusMeters, lr.start, lr.end, lr.timeNotice, lr.estimatedCostWon, lr.budgetWon, lr.pools, lr.mbtiPJ || '', lr.mbtiIE || '');
  }

  function renderPlan(plan, center, radiusMeters, start, end, timeNotice, estimatedCostWon, budgetWon, pools, mbtiPJ, mbtiIE) {
    lastRenderedPlan = {
      plan: plan,
      center: center,
      radiusMeters: radiusMeters,
      start: start,
      end: end,
      timeNotice: timeNotice,
      estimatedCostWon: estimatedCostWon != null ? estimatedCostWon : null,
      budgetWon: budgetWon != null ? budgetWon : null,
      pools: pools || null,
      mbtiPJ: mbtiPJ || '',
      mbtiIE: mbtiIE || '',
    };
    var isPick = isQuickRegionPick();
    var suffixKey = isPick && currentLang === 'en' ? 'resultMetaSuffixPick' : 'resultMetaSuffix';
    resultMeta.textContent = (isPick ? t('resultMetaPick') : t('resultMetaMy')) + (radiusMeters / 1000) + t(suffixKey) + start + ' ~ ' + end;
    var mbtiBadgeEl = $('resultMbtiBadge');
    if (mbtiBadgeEl) {
      if (mbtiPJ === 'P') {
        mbtiBadgeEl.textContent = t('mbtiBadgeP') || 'P 넉넉한 코스';
        mbtiBadgeEl.hidden = false;
      } else if (mbtiPJ === 'J') {
        mbtiBadgeEl.textContent = t('mbtiBadgeJ') || 'J 1분 단위 코스';
        mbtiBadgeEl.hidden = false;
      } else {
        mbtiBadgeEl.textContent = '';
        mbtiBadgeEl.hidden = true;
      }
    }
    var timeNoticeEl = $('resultTimeNotice');
    if (timeNoticeEl) {
      if (timeNotice) {
        timeNoticeEl.textContent = timeNotice;
        timeNoticeEl.hidden = false;
      } else {
        timeNoticeEl.textContent = '';
        timeNoticeEl.hidden = true;
      }
    }
    var resultBudgetEl = $('resultBudget');
    if (resultBudgetEl) {
      if (estimatedCostWon != null && estimatedCostWon > 0) {
        var prefix, overText, underText, equalText, currencySuffix;
        if (currentLang === 'en') {
          prefix = 'Estimated cost per person: about ';
          overText = ' (over your entered budget)';
          underText = ' (within your entered budget)';
          equalText = ' (around your entered budget)';
          currencySuffix = '₩';
        } else {
          prefix = '예상 인당 비용: 약 ';
          overText = ' (입력한 예산보다 높아요)';
          underText = ' (입력한 예산 안이에요)';
          equalText = ' (입력한 예산과 비슷해요)';
          currencySuffix = '원';
        }
        var text = prefix + formatWon(estimatedCostWon) + currencySuffix;
        if (budgetWon != null && budgetWon > 0) {
          if (estimatedCostWon > budgetWon * 1.05) text += overText;
          else if (estimatedCostWon < budgetWon * 0.95) text += underText;
          else text += equalText;
        }
        resultBudgetEl.textContent = text;
        resultBudgetEl.hidden = false;
        var disclaimerEl = $('resultBudgetDisclaimer');
        if (disclaimerEl) {
          disclaimerEl.textContent = t('budgetDisclaimer');
          disclaimerEl.hidden = false;
        }
      } else {
        resultBudgetEl.textContent = '';
        resultBudgetEl.hidden = true;
        var disclaimerEl = $('resultBudgetDisclaimer');
        if (disclaimerEl) disclaimerEl.hidden = true;
      }
    }
    var placeDisclaimerEl = $('resultPlaceDisclaimer');
    if (placeDisclaimerEl) {
      placeDisclaimerEl.textContent = t('placeDataDisclaimer');
      placeDisclaimerEl.hidden = plan.length === 0;
    }
    itinerary.innerHTML = plan.map(function (p, idx) {
      var highlightStar = p.highlight ? '<span class="place-highlight" aria-label="' + escapeHtml(t('placeHighlightLabel') || '인생샷·분위기·데이트 추천') + '">⭐</span> ' : '';
      var congestionHtml = p.congestion ? '<span class="congestion ' + p.congestion.level + '">' + escapeHtml(t(p.congestion.labelKey)) + '</span>' : '';
      var searchQuery = (p.name || '') + (p.addr ? ' ' + p.addr : '');
      var lat = p.lat != null ? Number(p.lat) : null;
      var lon = p.lon != null ? Number(p.lon) : null;
      var mapUrl;
      if (currentLang === 'ko') {
        mapUrl = 'https://map.naver.com/v5/search/' + encodeURIComponent(searchQuery.trim() || p.name || '');
      } else {
        if (lat != null && lon != null && !isNaN(lat) && !isNaN(lon)) {
          mapUrl = 'https://www.google.com/maps?q=' + lat + ',' + lon;
        } else {
          mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(searchQuery || p.name);
        }
      }
      var verifyLink = '<a href="' + escapeHtml(mapUrl) + '" target="_blank" rel="noopener noreferrer" class="place-verify-link">' + escapeHtml(t('placeVerifyMap')) + '</a>';
      var replaceBtn = pools ? '<button type="button" class="place-replace-btn" data-index="' + idx + '">' + escapeHtml(t('placeReplaceBtn')) + '</button>' : '';
      return '<li>' + highlightStar + '<span class="place-name">' + escapeHtml(p.name) + congestionHtml + '</span><div class="place-time">' + p.timeStart + ' ~ ' + p.timeEnd + '</div><div class="place-type">' + escapeHtml(p.type) + '</div>' + (p.addr ? '<div class="place-addr">' + escapeHtml(p.addr) + '</div>' : '') + '<div class="place-actions">' + verifyLink + replaceBtn + '</div></li>';
    }).join('');
    itinerary.querySelectorAll('.place-replace-btn').forEach(function (btn) {
      var idx = parseInt(btn.getAttribute('data-index'), 10);
      if (!isNaN(idx)) btn.addEventListener('click', function () { replacePlanItem(idx); });
    });
    if (mapAdapter && mapAdapter.addPlaceMarkers) {
      mapAdapter.clearPlaceMarkers();
      mapAdapter.addPlaceMarkers(plan);
    }
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function getTransportProfile() {
    var transport = (document.querySelector('input[name="transport"]:checked') || {}).value || 'walk';
    var hasCar = hasCarCheckbox ? hasCarCheckbox.checked : true;
    if (transport === 'car' && !hasCar) return 'walk';
    if (transport === 'car') return 'driving';
    if (transport === 'transit') return 'walk';
    return 'walk';
  }

  function osrmTable(coords, profile) {
    var flat = coords.map(function (c) { return c.lon + ',' + c.lat; }).join(';');
    var url = OSRM_URL + '/table/v1/' + profile + '/' + flat;
    return fetch(url).then(function (res) { return res.json(); });
  }

  function optimizeRouteOrder(plan) {
    if (!plan || plan.length < 2) return plan;
    var profile = getTransportProfile();
    var coords = plan.map(function (p) { return { lat: p.lat, lon: p.lon }; });
    return osrmTable(coords, profile).then(function (data) {
      if (!data.durations || !data.durations.length) return plan;
      var d = data.durations;
      var n = plan.length;
      var order = [0];
      var remaining = [];
      for (var i = 1; i < n; i++) remaining.push(i);
      while (remaining.length > 0) {
        var last = order[order.length - 1];
        var best = null;
        var bestVal = Infinity;
        for (var j = 0; j < remaining.length; j++) {
          var to = remaining[j];
          var val = (d[last] && d[last][to] != null) ? d[last][to] : 999999;
          if (val < bestVal) { bestVal = val; best = to; }
        }
        if (best == null) break;
        order.push(best);
        remaining = remaining.filter(function (x) { return x !== best; });
      }
      return order.map(function (i) { return plan[i]; });
    }).catch(function () { return plan; });
  }

  function runOptimizeRoute() {
    if (!lastRenderedPlan || !lastRenderedPlan.plan || lastRenderedPlan.plan.length < 2) return;
    if (loading) { loading.classList.add('is-visible'); loading.setAttribute('aria-hidden', 'false'); }
    optimizeRouteOrder(lastRenderedPlan.plan).then(function (ordered) {
      if (loading) { loading.classList.remove('is-visible'); loading.setAttribute('aria-hidden', 'true'); }
      lastRenderedPlan.plan = ordered;
      renderPlan(ordered, lastRenderedPlan.center, lastRenderedPlan.radiusMeters, lastRenderedPlan.start, lastRenderedPlan.end, lastRenderedPlan.timeNotice, lastRenderedPlan.estimatedCostWon != null ? lastRenderedPlan.estimatedCostWon : null, lastRenderedPlan.budgetWon != null ? lastRenderedPlan.budgetWon : null, lastRenderedPlan.pools || undefined, lastRenderedPlan.mbtiPJ || '', lastRenderedPlan.mbtiIE || '');
    });
  }

  function resetResult() {
    resultSection.hidden = true;
    if (mapAdapter && mapAdapter.clearPlaceMarkers) mapAdapter.clearPlaceMarkers();
  }

  function buildKakaoShareText() {
    if (!lastRenderedPlan || !lastRenderedPlan.plan || lastRenderedPlan.plan.length === 0) return '';
    var lines = lastRenderedPlan.plan.map(function (p) {
      return p.timeStart + ' ' + p.name + (p.typeKey === 'restaurant' ? '(예약 추천)' : '');
    });
    return lines.join(' ➔ ');
  }

  function copyKakaoPlan() {
    var text = buildKakaoShareText();
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showError(t('kakaoCopied'));
      }).catch(function () { fallbackCopy(text, 'kakaoCopied'); });
    } else {
      fallbackCopy(text, 'kakaoCopied');
    }
  }

  function fallbackCopy(text, messageKey) {
    messageKey = messageKey || 'kakaoCopied';
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showError(t(messageKey));
    } catch (e) {}
    document.body.removeChild(ta);
  }

  var lastCardShareAdjective = '';

  function openCardShareModal() {
    if (!lastRenderedPlan || !lastRenderedPlan.plan || lastRenderedPlan.plan.length === 0) return;
    var adjs = currentLang === 'ko' ? ['로맨틱한', '맛있는', '특별한', '즐거운', '달콤한'] : ['romantic', 'tasty', 'special', 'fun', 'sweet'];
    var adj = adjs[Math.floor(Math.random() * adjs.length)];
    lastCardShareAdjective = adj;
    var title = (t('cardShareTitle') || '오늘 우리의 %s 데이트 기록').replace('%s', adj);
    if (cardShareModalTitle) cardShareModalTitle.textContent = title;
    if (cardShareList) {
      cardShareList.innerHTML = lastRenderedPlan.plan.map(function (p, i) {
        return '<div class="card-share-item">' +
          '<span class="card-share-time">' + escapeHtml(p.timeStart + ' ~ ' + p.timeEnd) + '</span>' +
          '<span class="card-share-name">' + escapeHtml(p.name) + '</span>' +
          '</div>';
      }).join('');
    }
    if (cardShareModal) {
      cardShareModal.setAttribute('aria-hidden', 'false');
      cardShareModal.classList.add('is-visible');
    }
    if (btnCopyCardText) btnCopyCardText.onclick = copyCardShareText;
    if (cardShareBackdrop) cardShareBackdrop.onclick = closeCardShareModal;
    if (btnCloseCardShare) btnCloseCardShare.onclick = closeCardShareModal;
  }

  function closeCardShareModal() {
    if (cardShareModal) {
      cardShareModal.classList.remove('is-visible');
      cardShareModal.setAttribute('aria-hidden', 'true');
    }
  }

  function buildCardShareText() {
    if (!lastRenderedPlan || !lastRenderedPlan.plan || lastRenderedPlan.plan.length === 0) return '';
    var adj = lastCardShareAdjective || (currentLang === 'ko' ? '특별한' : 'special');
    var title = (t('cardShareTitle') || '오늘 우리의 %s 데이트 기록').replace('%s', adj);
    var lines = lastRenderedPlan.plan.map(function (p) {
      return p.timeStart + ' ~ ' + p.timeEnd + '  ' + p.name;
    });
    return '💕 ' + title + '\n\n' + lines.join('\n');
  }

  function copyCardShareText() {
    var text = buildCardShareText();
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showError(t('cardCopied'));
      }).catch(function () { fallbackCopy(text, 'cardCopied'); });
    } else {
      fallbackCopy(text, 'cardCopied');
    }
  }

  function clearCardShareReminder() {
    if (cardShareTimerId != null) {
      clearTimeout(cardShareTimerId);
      cardShareTimerId = null;
    }
  }

  function scheduleCardShareReminder(start, end) {
    clearCardShareReminder();
    if (!end) return;
    var now = new Date();
    var parts = String(end).split(':');
    if (parts.length < 2) return;
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return;
    var target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0,
      0
    );
    var diff = target.getTime() - now.getTime();
    if (diff <= 0) return;
    if (diff > 12 * 60 * 60 * 1000) return;
    cardShareTimerId = setTimeout(function () {
      try {
        openCardShareModal();
      } catch (e) {
        console.error(e);
      }
      cardShareTimerId = null;
    }, diff);
  }

  function showSavedPlan(id) {
    var item = savedPlans.find(function (p) { return p.id === id; });
    if (!item || !resultSection) return;
    renderPlan(
      item.plan,
      item.center,
      item.radiusMeters,
      item.start,
      item.end,
      item.timeNotice || null,
      item.estimatedCostWon != null ? item.estimatedCostWon : null,
      item.budgetWon != null ? item.budgetWon : null,
      undefined,
      item.mbtiPJ != null ? item.mbtiPJ : (item.mbti || ''),
      item.mbtiIE != null ? item.mbtiIE : ''
    );
    lastRenderedPlan.id = item.id;
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function deleteSavedPlan(id) {
    if (!confirm(t('confirmDelete'))) return;
    var idx = savedPlans.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return;
    savedPlans.splice(idx, 1);
    var card = plansList && plansList.querySelector('[data-plan-id="' + id + '"]');
    if (card) card.remove();
    if (lastRenderedPlan && lastRenderedPlan.id === id) {
      resetResult();
      lastRenderedPlan = null;
    }
    if (plansList && savedPlans.length === 0) {
      plansList.hidden = true;
      plansList.innerHTML = '';
      if (plansEmpty) plansEmpty.hidden = false;
    }
  }

  function addPlanToPlansArea(plan, center, radiusMeters, start, end, timeNotice, estimatedCostWon, budgetWon, mbtiPJ, mbtiIE) {
    if (!plansList || !plansEmpty) return;
    var id = Date.now();
    savedPlans.unshift({
      id: id,
      plan: plan,
      center: center,
      radiusMeters: radiusMeters,
      start: start,
      end: end,
      timeNotice: timeNotice || null,
      estimatedCostWon: estimatedCostWon != null ? estimatedCostWon : null,
      budgetWon: budgetWon != null ? budgetWon : null,
      mbtiPJ: mbtiPJ || '',
      mbtiIE: mbtiIE || '',
    });
    if (lastRenderedPlan) lastRenderedPlan.id = id;
    plansEmpty.hidden = true;
    plansList.hidden = false;
    var card = document.createElement('div');
    card.className = 'plan-card';
    card.setAttribute('data-plan-id', id);
    card.innerHTML =
      '<div class="plan-card-info">' +
        '<span class="plan-card-title">' + escapeHtml(t('planCardTitle')) + '</span>' +
        '<span class="plan-card-time">' + escapeHtml(start + ' ~ ' + end) + '</span>' +
      '</div>' +
      '<div class="plan-card-actions">' +
        '<button type="button" class="btn btn-edit" data-action="edit" title="' + escapeHtml(t('btnEdit')) + '">' + escapeHtml(t('btnEdit')) + '</button>' +
        '<button type="button" class="btn btn-delete" data-action="delete" title="' + escapeHtml(t('btnDelete')) + '">' + escapeHtml(t('btnDelete')) + '</button>' +
      '</div>';
    card.querySelector('.plan-card-info').addEventListener('click', function () { showSavedPlan(id); });
    card.querySelector('[data-action="edit"]').addEventListener('click', function (e) { e.stopPropagation(); showSavedPlan(id); });
    card.querySelector('[data-action="delete"]').addEventListener('click', function (e) { e.stopPropagation(); deleteSavedPlan(id); });
    plansList.insertBefore(card, plansList.firstChild);
  }

  function initShareMapOnce() {
    if (shareMapAdapter) return;
    var mapEl = document.getElementById('shareMap');
    if (!mapEl || !window.L) return;
    var m = L.map('shareMap', { zoomControl: false }).setView([DEFAULT_LAT, DEFAULT_LNG], 14);
    var useMapTiler = window.MAPTILER_API_KEY && L.maptiler && typeof L.maptiler.maptilerLayer === 'function';
    if (useMapTiler) {
      L.maptiler.maptilerLayer({ apiKey: window.MAPTILER_API_KEY, language: getMapTilerLanguage(currentLang) }).addTo(m);
    } else {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; OSM', subdomains: 'abcd', maxZoom: 19 }).addTo(m);
    }
    L.control.zoom({ position: 'topright' }).addTo(m);
    shareMap = m;
    shareMarkersLayer = L.layerGroup().addTo(m);
    shareMapAdapter = {
      setView: function (lat, lng, zoom) { m.setView([lat, lng], zoom || 14); },
      addMarker: function (place) {
        var icon = L.divIcon({
          className: 'leaflet-share-marker',
          html: '<span class="share-marker-pin">' + (place.votes > 0 ? '❤️' : '📍') + '</span>',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        var marker = L.marker([place.lat, place.lng], { icon: icon }).addTo(shareMarkersLayer);
        marker.bindPopup('<strong>' + escapeHtml(place.name) + '</strong><br>👍 ' + place.votes);
        marker._shareId = place.id;
        return marker;
      },
      clearMarkers: function () { shareMarkersLayer.clearLayers(); },
      refreshMarkers: function () {
        shareMapAdapter.clearMarkers();
        sharedPlaces.forEach(function (p) { shareMapAdapter.addMarker(p); });
      },
    };
    m.on('click', function (e) {
      sharePlaceIdCounter++;
      var place = { id: 'p' + sharePlaceIdCounter, lat: e.latlng.lat, lng: e.latlng.lng, name: '장소 ' + (sharedPlaces.length + 1), votes: 0, voted: false };
      sharedPlaces.push(place);
      shareMapAdapter.addMarker(place);
      renderSharePlaceList();
      updateShareHash();
    });
    applyShareStateFromHash();
    shareMapAdapter.refreshMarkers();
    renderSharePlaceList();
    setTimeout(function () {
      if (shareMap && typeof shareMap.invalidateSize === 'function') shareMap.invalidateSize();
    }, 150);
  }

  function renderSharePlaceList() {
    if (!sharePlaceUl || !sharePlaceEmpty) return;
    if (sharedPlaces.length === 0) {
      sharePlaceEmpty.hidden = false;
      sharePlaceUl.hidden = true;
      sharePlaceUl.innerHTML = '';
      return;
    }
    sharePlaceEmpty.hidden = true;
    sharePlaceUl.hidden = false;
    sharePlaceUl.innerHTML = sharedPlaces.map(function (p) {
      return '<li class="share-place-li" data-id="' + escapeHtml(p.id) + '">' +
        '<div class="share-place-info"><span class="share-place-name">' + escapeHtml(p.name) + '</span><div class="share-place-meta">' + p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) + '</div></div>' +
        '<button type="button" class="share-place-vote' + (p.voted ? ' voted' : '') + '" data-id="' + escapeHtml(p.id) + '" aria-label="투표">❤️ <span class="vote-count">' + p.votes + '</span></button>' +
        '<button type="button" class="share-place-remove" data-id="' + escapeHtml(p.id) + '" aria-label="삭제">×</button></li>';
    }).join('');
    sharePlaceUl.querySelectorAll('.share-place-vote').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var p = sharedPlaces.find(function (x) { return x.id === id; });
        if (p) { p.voted = !p.voted; p.votes += p.voted ? 1 : -1; renderSharePlaceList(); if (shareMapAdapter) shareMapAdapter.refreshMarkers(); updateShareHash(); }
      });
    });
    sharePlaceUl.querySelectorAll('.share-place-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        sharedPlaces = sharedPlaces.filter(function (x) { return x.id !== id; });
        renderSharePlaceList();
        if (shareMapAdapter) shareMapAdapter.refreshMarkers();
        updateShareHash();
      });
    });
  }

  function serializeShareState() {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(sharedPlaces)))); } catch (e) { return ''; }
  }

  function parseShareState(b64) {
    try {
      var json = decodeURIComponent(escape(atob(b64)));
      var arr = JSON.parse(json);
      if (Array.isArray(arr)) return arr;
    } catch (e) {}
    return [];
  }

  function updateShareHash() {
    var s = serializeShareState();
    if (s) location.replace('#' + 'share=' + s);
  }

  function applyShareStateFromHash() {
    var hash = location.hash || '';
    var match = hash.match(/^#share=(.+)$/);
    if (match) {
      var arr = parseShareState(match[1]);
      if (arr.length) {
        sharedPlaces = arr;
        sharePlaceIdCounter = Math.max(0, ...arr.map(function (p) { var n = parseInt((p.id || '').replace(/\D/g, ''), 10); return isNaN(n) ? 0 : n; }));
      }
    }
  }

  function copyShareLink() {
    if (sharedPlaces.length) updateShareHash();
    var url = location.origin + location.pathname + (location.search || '') + '#share=' + serializeShareState();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        if (shareLinkHint) { shareLinkHint.textContent = t('shareLinkCopied'); shareLinkHint.style.color = 'var(--violet)'; setTimeout(function () { shareLinkHint.textContent = ''; shareLinkHint.style.color = ''; }, 3000); }
      });
    } else {
      if (shareLinkHint) { shareLinkHint.textContent = url; shareLinkHint.style.color = 'var(--text-muted)'; }
    }
  }

  function bindSavePresetModalHandlers() {
    if (btnSaveCurrentPreset) {
      btnSaveCurrentPreset.addEventListener('click', function () {
        if (savePresetChoiceWrap) savePresetChoiceWrap.hidden = true;
        if (saveCurrentOptionsWrap) {
          saveCurrentOptionsWrap.hidden = false;
          renderSaveCurrentOptions();
        }
        if ($('saveCurrentSelectTitle')) $('saveCurrentSelectTitle').textContent = t('saveCurrentSelectTitle');
        if (btnSaveCurrentConfirm) btnSaveCurrentConfirm.textContent = t('saveCurrentConfirm');
      });
    }
    if (btnSaveCurrentConfirm) {
      btnSaveCurrentConfirm.addEventListener('click', function () {
        var selected = [];
        if (saveCurrentOptionsList) {
          saveCurrentOptionsList.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) {
            var id = cb.getAttribute('data-option-id');
            if (id) selected.push(id);
          });
        }
        var key = overwritePresetKey || getCurrentUserPrefsKey();
        if (key && saveCoursePresetToKey(key, selected.length ? selected : null)) {
          showError(overwritePresetKey ? t('presetUpdated') : t('presetSaved'));
          overwritePresetKey = null;
          closeSavePresetModal();
        }
      });
    }
    if (btnSaveCurrentBack) {
      btnSaveCurrentBack.addEventListener('click', function () {
        if (saveCurrentOptionsWrap) saveCurrentOptionsWrap.hidden = true;
        if (savePresetChoiceWrap) savePresetChoiceWrap.hidden = false;
      });
    }
    if (btnSaveCustomPreset) {
      btnSaveCustomPreset.addEventListener('click', function () {
        editingPresetKey = null;
        editingPresetOldName = null;
        if (savePresetChoiceWrap) savePresetChoiceWrap.hidden = true;
        if (savePresetCustomWrap) {
          savePresetCustomWrap.hidden = false;
          if (savePresetModal) savePresetModal.classList.add('save-preset-custom-open');
          fillCustomPresetModalFromCurrentForm();
          updateCustomPresetOrderVisibility();
          updateCustomPresetRadiusVisibility();
          updateCustomPresetPickCoordsDisplay();
          updateAllCustomPresetFieldToggles();
          if (savePresetCustomName) { savePresetCustomName.value = ''; savePresetCustomName.focus(); }
          if (savePresetCustomError) savePresetCustomError.textContent = '';
        }
      });
    }
    CUSTOM_PRESET_INCLUDE_IDS.forEach(function (id) {
      var cb = $(id);
      if (cb) cb.addEventListener('change', updateAllCustomPresetFieldToggles);
    });
    if ($('customPresetOrderMode')) $('customPresetOrderMode').addEventListener('change', updateCustomPresetOrderVisibility);
    if ($('customPresetRadius')) $('customPresetRadius').addEventListener('change', updateCustomPresetRadiusVisibility);
    document.querySelectorAll('input[name="customPresetRegion"]').forEach(function (radio) {
      radio.addEventListener('change', updateCustomPresetPickCoordsDisplay);
    });
    if ($('btnOpenCustomPresetMap')) $('btnOpenCustomPresetMap').addEventListener('click', openCustomPresetMapModal);
    if ($('btnCustomPresetMapSearch')) $('btnCustomPresetMapSearch').addEventListener('click', searchCustomPresetMap);
    if ($('customPresetMapSearchInput')) $('customPresetMapSearchInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); searchCustomPresetMap(); } });
    if ($('btnCustomPresetMapConfirm')) $('btnCustomPresetMapConfirm').addEventListener('click', confirmCustomPresetMapPosition);
    if ($('btnCustomPresetMapCancel')) $('btnCustomPresetMapCancel').addEventListener('click', closeCustomPresetMapModal);
    if ($('customPresetMapModalBackdrop')) $('customPresetMapModalBackdrop').addEventListener('click', closeCustomPresetMapModal);
    if (btnSaveCustomPresetSubmit) {
      btnSaveCustomPresetSubmit.addEventListener('click', function () {
        var name = savePresetCustomName ? (savePresetCustomName.value || '').trim() : '';
        if (!name) {
          if (savePresetCustomError) savePresetCustomError.textContent = t('errCustomPresetName');
          return;
        }
        var baseKey = getCurrentUserPrefsKey();
        if (!baseKey) return;
        var customKey = editingPresetKey || (baseKey + '-custom-' + name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9가-힣_-]/g, '').slice(0, 30) || 'custom');
        var data = getCustomPresetDataFromModal();
        if (saveCoursePresetToKey(customKey, null, data)) {
          if (editingPresetKey) {
            if (editingPresetOldName && name !== editingPresetOldName) updateCustomPresetName(editingPresetOldName, name);
            showError(t('presetUpdated'));
            editingPresetKey = null;
            editingPresetOldName = null;
          } else {
            addCustomPresetName(name);
            showError(t('presetSavedCustom'));
          }
          closeSavePresetModal();
        }
      });
    }
    if (btnSavePresetBack) {
      btnSavePresetBack.addEventListener('click', function () {
        overwritePresetKey = null;
        editingPresetKey = null;
        editingPresetOldName = null;
        if (savePresetModal) savePresetModal.classList.remove('save-preset-custom-open');
        if (savePresetChoiceWrap) savePresetChoiceWrap.hidden = false;
        if (savePresetCustomWrap) savePresetCustomWrap.hidden = true;
        if (savePresetCustomError) savePresetCustomError.textContent = '';
      });
    }
    if (btnSavePresetClose) btnSavePresetClose.addEventListener('click', closeSavePresetModal);
    if (savePresetModalBackdrop) savePresetModalBackdrop.addEventListener('click', closeSavePresetModal);
  }

  window.onNaverMapReady = function () {
    if (window._mapFallbackTimer) {
      clearTimeout(window._mapFallbackTimer);
      window._mapFallbackTimer = null;
    }
    applyLanguage();
    initMap();
    applyShareStateFromHash();
    if (location.hash && location.hash.indexOf('share=') !== -1) switchTab('share');
  };
  applyLanguage();
  initSupabaseAuth();
  bindSavePresetModalHandlers();
  if (btnLoadPresetToggle) {
    btnLoadPresetToggle.addEventListener('click', toggleLoadPresetList);
  }
  if (savedPresetList) {
    savedPresetList.addEventListener('click', function (e) {
      var item = e.target.closest('.saved-preset-item');
      if (!item || item.classList.contains('saved-preset-empty')) return;
      var key = item.getAttribute('data-preset-key');
      if (!key) return;
      if (e.target.closest('.saved-preset-delete')) {
        if (confirm(t('confirmDeletePreset'))) {
          deletePreset(key);
          renderSavedPresetList();
          showError(t('presetDeleted'));
        }
        return;
      }
      if (e.target.closest('.saved-preset-edit')) {
        var baseKey = getCurrentUserPrefsKey();
        if (key === baseKey) openEditDefaultPreset(key);
        else openEditCustomPreset(key, item.getAttribute('data-preset-name') || '');
        return;
      }
      loadCoursePresetFromKey(key);
    });
  }
  fetchWeather();
  if (location.hash && location.hash.indexOf('share=') !== -1) applyShareStateFromHash();
})();
