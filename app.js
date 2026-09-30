(function () {
  'use strict';

  const OVERPASS_URLS = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];
  const OSRM_URL = 'https://router.project-osrm.org';
  const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
  const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
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
  /* 예상 비용: 슬롯·세부 유형별 인당 추정 (실메뉴가 아님, 2026년 물가 기준) */
  var ESTIMATED_COST_BY_TIER = {
    cheap: { restaurant: 16000, cafe: 9000, activity: 15000, park: 0 },
    normal: { restaurant: 35000, cafe: 15000, activity: 28000, park: 0 },
    expensive: { restaurant: 80000, cafe: 24000, activity: 50000, park: 0 },
  };
  /* typeKey별 배수: 같은 슬롯이라도 분식·술·테마파크 등을 다르게 */
  var ESTIMATED_COST_TYPE_MULT = {
    restaurant: 1,
    fast_food: 0.8,
    bar: 1.35,
    cafe: 1,
    ice_cream: 0.6,
    museum: 0.7,
    gallery: 0.55,
    mall: 0.5,
    theme_park: 1.8,
    attraction: 1,
    park: 0,
  };
  /* OSM cuisine 키워드 → 추가 배수 (추정) */
  var ESTIMATED_COST_CUISINE_MULT = [
    { re: /fine[_ ]?dining|omakase|sushi|steak|french|italian|wine/i, mult: 1.35 },
    { re: /bbq|korean_bbq|yakiniku|hotpot|seafood/i, mult: 1.2 },
    { re: /burger|pizza|noodles|ramen|dumpling|chicken|kebab/i, mult: 0.85 },
    { re: /bakery|dessert|tea|coffee/i, mult: 0.9 },
  ];
  var PLACE_CACHE_STORAGE_KEY = 'auvia-place-cache-v1';
  var PLACE_CACHE_TTL_MS = 20 * 60 * 1000;
  var PLACE_CACHE_STALE_MS = 6 * 60 * 60 * 1000;

  const LANG_STORAGE = 'date-planner-lang';
  let currentLang = localStorage.getItem(LANG_STORAGE) || 'ko';

  const PREF_STORAGE_PREFIX = 'date-planner-prefs-';
  const PLANS_STORAGE_PREFIX = 'date-planner-plans-';
  const LOCATION_CONSENT_KEY = 'auvia-location-consent';
  let currentUser = null;       // { id, email } 또는 null (Supabase 로그인 시)
  let currentUserName = null;   // 화면에 표시할 이름(이메일 또는 닉네임)
  var supabaseClient = null;    // Supabase 클라이언트 (한 번만 생성)
  var supabaseTablesReady = null; // null=미확인, true/false
  var naverSearchCache = {};
  var locationConsentPendingCb = null;

  const TRANSLATIONS = {
    ko: {
      brand: '데이트 플래너',
      searchPlaceholder: '장소·주소 검색',
      searchBtn: '검색',
      errSearchNoResult: '검색한 장소를 찾지 못했어요. 이름이나 주소를 조금 더 구체적으로 입력해 주세요.',
      login: '로그인',
      logout: '로그아웃',
      signup: '회원가입',
      heroTag: '데이트 루틴 고민 끝',
      heroTitleBefore: '일정 ',
      heroTitleHighlight: '뚝딱',
      heroTitleAfter: ' 만들어줄게',
      heroDesc: '위치·시간만 알려주면 맛집·카페·놀거리까지 쭉 채워드릴게요.',
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
      timePresetLunch: '점심',
      timePresetDinner: '저녁',
      timePresetDay: '하루',
      timePresetHint: '누르면 아래 시작·종료 시각만 바뀌어요. 직접 고쳐도 되고, 일정은 일정 만들기로 만듭니다.',
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
      loadingSubSearch: '취향에 맞는 스팟을 고르고 있어요',
      loadingSubBuild: '코스 순서를 맞추고 있어요',
      loadingSubQuality: '가게 품질을 확인하고 있어요',
      loadingSubFinish: '거의 다 됐어요',
      loadingTextRetry: '다른 서버로 다시 찾는 중...',
      loadingTextBuild: '코스 구성 중...',
      loadingTextQuality: '리뷰·존재 여부 확인 중...',
      loadingTextFinish: '일정 마무리 중...',
      planCardTitle: '방금 만든 계획',
      labelPlanName: '계획 이름',
      planNamePlaceholder: '예: 주말 한강 데이트',
      planNameHint: '비워 두면 「방금 만든 계획」으로 저장돼요',
      editPlanNamePrompt: '계획 이름을 입력하세요',
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
      errPlacesSearchFailed: '주변 장소를 불러오지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.',
      errGenerate: '일정을 만드는 중 오류가 났어요. 잠시 후 다시 시도해 주세요.',
      errPlanEmpty: '조건을 맞출 장소를 찾지 못해 일정을 만들지 못했어요.',
      reasonTimeTooShort: '선택한 시간대가 짧아서 일부 코스를 빼야 해요. 시간을 늘리거나 코스 스타일을 B(빠르게)로 바꿔 보세요.',
      reasonTimeTooShortA: 'A(여유) 스타일은 체류 시간이 길어서, 지금 시간대에는 일부 코스를 빼야 해요. 시간대를 늘리거나 B(빠르게)로 바꿔 보세요.',
      reasonBudgetLow: '인당 예산이 낮아서 일부 코스를 제외했어요. 예산을 올리거나 가격대를 낮춰 보세요.',
      reasonMissingTypes: '반경 안에 원하는 유형(식당·카페·놀거리·공원)이 부족해요. 반경을 넓히거나 코스 순서를 바꿔 보세요.',
      reasonMissingTypeItem: '%s 유형 장소가 반경 안에 거의 없어요.',
      reasonCongestionStrict: '선택한 인기도에 맞는 장소가 적어 다른 인기도 장소로 채웠어요. 인기도를 「대중적」으로 바꾸면 더 잘 맞아요.',
      reasonSubstituted: '원하신 유형 대신 다른 유형으로 대체한 일정이 있어요.',
      reasonPartialPlan: '요청하신 코스 중 일부만 채울 수 있었어요.',
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
      labelMbtiPJ: '코스 스타일 (선택)',
      labelMbtiIE: '장소 분위기 (I/E)',
      mbtiPJNone: '선택',
      mbtiIENone: '선택',
      mbtiP: 'A 여유 있는 코스',
      mbtiJ: 'B 빠르게 움직이는 코스',
      mbtiI: 'I 조용한',
      mbtiE: 'E 시끌벅적',
      mbtiHint: 'A=여유 있는 코스, B=빠르게 움직이는 코스',
      mbtiBadgeP: '여유 있는 코스',
      mbtiBadgeJ: '빠르게 움직이는 코스',
      btnQuickCourse: '상세 설정',
      showAdvanced: '상세 설정',
      btnRegenerate: '다시 짜기',
      placePin: '고정',
      placeUnpin: '고정 해제',
      placeUndo: '되돌리기',
      recentRegionsLabel: '최근 지역',
      recentPickedHere: '찍은 곳',
      regenKeptPins: '고정한 장소는 두고 나머지를 다시 골랐어요.',
      errRegenNoCenter: '다시 짤 위치 정보가 없어요. 상세 설정에서 한 번 만들어 주세요.',
      errPinsNeedPools: '이 계획표에는 후보 목록이 없어 고정한 채로 나머지만 바꿀 수 없어요. 고정을 끄고 다시 짜 주세요.',
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
      presetFavorite: '즐겨찾기',
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
      errNoLocationPick: '지도 찍기를 선택했어요. 아래 지도에서 위치를 클릭한 뒤 다시 일정 만들기를 눌러 주세요.',
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
      cardShareTitleDefault: '오늘 우리의 데이트 기록',
      cardShareTitleHint: '눌러서 제목을 수정할 수 있어요 · 최대 18자',
      cardShareHint: '이미지를 저장해 카톡·인스타에 보내거나, 텍스트를 복사해 붙여넣기 하세요.',
      btnCopyCardText: '텍스트 복사',
      cardShareClose: '닫기',
      cardCopied: '카드 텍스트가 복사됐어요! 카톡에 붙여넣기 하세요.',
      budgetExceeded: '예산이 부족해 일부 코스를 제외했어요.',
      budgetDisclaimer: '예상 비용은 장소 유형·가격대·OSM 태그로 추정한 값이라 실제 메뉴가와 다를 수 있어요. 여유 있게 준비해 주세요.',
      placeEstCost: '예상 약 %s원',
      placeDataDisclaimer: '장소 정보는 OpenStreetMap 기준이라 폐업·이전된 곳이 있을 수 있어요. 방문 전 아래에서 지도로 한 번 확인해 주세요.',
      placeVerifyMap: '지도',
      placeReserveLink: '예약',
      placeMenuLink: '메뉴',
      placeReplaceBtn: '다른 곳으로',
      placeSlotLabel: '이 칸 종류',
      btnDownloadCardImage: '이미지 저장',
      cardImageSaved: '카드 이미지를 저장했어요. QR을 찍으면 계획표를 볼 수 있어요.',
      btnCopySharePlanLink: '링크 복사',
      sharePlanLinkCopied: '계획표 링크가 복사됐어요. 보내면 상대도 같은 일정을 볼 수 있어요.',
      sharePlanLoaded: '공유된 계획표를 불러왔어요.',
      sharePlanLoadFailed: '공유 링크를 열지 못했어요. 링크가 잘못됐거나 너무 길 수 있어요.',
      btnDownloadIcs: '캘린더 추가',
      icsDownloaded: '캘린더 파일(.ics)을 저장했어요. 파일을 열어 일정을 추가하세요.',
      cardShareHint: '이미지를 저장하면 QR이 포함돼요. 찍거나 링크를 열면 계획표가 보여요.',
      btnToggleDetails: '지도·날씨·상세 설정',
      btnMobileDockResult: '내 계획표',
      placeHighlightLabel: '인생샷·분위기·데이트 추천',
      errNoOtherPlace: '주변에 같은 유형의 다른 장소가 없어요.',
      legalTerms: '이용약관',
      legalPrivacy: '개인정보처리방침',
      footerOsmNote: '지도·장소: OpenStreetMap',
      signupAgreeLegal: '이용약관 및 개인정보처리방침에 동의합니다.',
      signupNeedLegal: '약관과 개인정보처리방침에 동의해 주세요.',
      locationConsentTitle: '위치 정보 이용 안내',
      locationConsentDesc: '“내 위치”로 일정을 만들려면 대략적인 현재 위치가 필요합니다. 위치는 주변 장소 검색·지도·날씨 표시에만 쓰이며, 동의 후에도 브라우저에서 위치 권한을 허용해야 합니다. 거부하면 지도에서 지역을 찍어 이용할 수 있어요.',
      locationConsentAllow: '동의하고 계속',
      locationConsentDeny: '지도에서 찍기',
      travelMinutes: '이전 장소에서 이동 약 %s분',
      travelOverrunNotice: '이동 시간 때문에 일부 체류 시간을 줄였어요.',
      weatherIndoorBias: '날씨 때문에 실내 위주로 골랐어요.',
      reasonClosedHours: '선택한 시간대에 영업 중이지 않은 곳은 제외했어요.',
      reasonHoursRelaxed: '일부 장소는 영업시간이 비어 있거나 시간대와 안 맞을 수 있어요. 방문 전 확인해 주세요.',
      whyTitle: '이 코스를 이렇게 짰어요',
      whyIndoor: '날씨 때문에 실내 위주로 골랐어요',
      whyTravel: '이동 시간을 일정에 반영했어요 (총 약 %s분)',
      whyCongestion: '선택하신 인기도에 맞춰 골랐어요',
      whyBudget: '예산 안에서 코스를 맞췄어요',
      whyDiversity: '비슷한 장소가 겹치지 않게 분산했어요',
      whyHours: '영업 가능한 시간대의 장소만 넣었어요',
      whyHoursRelaxed: '조건을 맞추려 영업시간 필터를 일부 완화했어요',
      summaryStops: '총 %s곳',
      summaryTravel: '이동 약 %s분',
      summaryCost: '예상 %s원',
      tipVerify: '방문 전 지도·영업시간을 한 번 더 확인해 주세요',
      placeWhyOpen: '영업시간 맞는 곳',
      placeWhyNear: '이전 장소와 가까움',
      placeWhyMatch: '취향·가격대 맞춤',
      whyRoute: '이동 동선을 짧게 맞춰 순서를 다듬었어요',
      whyOutdoor: '맑은 날씨에 맞춰 야외 장소를 섞었어요',
      whyFallback: '조건을 살짝 완화해 대체 코스를 만들었어요',
      whyStreetSpread: '같은 길·같은 구역에 몰리지 않게 흩었어요',
      errPlanEmptyHint: '반경을 넓히거나, 시간·인기도·코스 순서를 바꿔 다시 시도해 보세요.',
      errNoPlacesHint: '다른 지역을 찍거나 반경을 키워 주세요. 지도 데이터가 부족한 구역일 수 있어요.',
      errPlacesStaleCache: '최신 검색이 어려워 잠시 전 저장해 둔 주변 장소로 코스를 짰어요.',
      errGenerateHint: '잠시 후 다시 시도하거나, 네트워크 상태를 확인해 주세요.',
      toastDismiss: '닫기',
      summaryBudgetFit: '예산 대비 약 %s%',
    },
    en: {
      brand: 'Date Planner',
      searchPlaceholder: 'Search place or address',
      searchBtn: 'Search',
      errSearchNoResult: 'Could not find that place. Try a more specific name or address.',
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
      timePresetLunch: 'Lunch',
      timePresetDinner: 'Dinner',
      timePresetDay: 'Full day',
      timePresetHint: 'These only fill the start and end times below. You can edit them, and the plan is created when you tap Create plan.',
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
      loadingSubSearch: 'Picking spots that match your taste',
      loadingSubBuild: 'Arranging your course order',
      loadingSubQuality: 'Checking place quality',
      loadingSubFinish: 'Almost done',
      loadingTextRetry: 'Trying another server...',
      loadingTextBuild: 'Building your course...',
      loadingTextQuality: 'Checking reviews & availability...',
      loadingTextFinish: 'Finishing your plan...',
      planCardTitle: 'Latest plan',
      labelPlanName: 'Plan name',
      planNamePlaceholder: 'e.g. Weekend riverside date',
      planNameHint: 'Leave blank to save as "Latest plan"',
      editPlanNamePrompt: 'Enter a plan name',
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
      errPlacesSearchFailed: 'Could not load nearby places. Check your network and try again.',
      errGenerate: 'Something went wrong. Please try again later.',
      errPlanEmpty: 'Could not build a plan that matches your settings.',
      reasonTimeTooShort: 'Your time window is short, so some stops were dropped. Extend the time or switch to B (fast-paced).',
      reasonTimeTooShortA: 'Style A (relaxed) needs longer stays, so some stops were dropped. Extend the time or switch to B (fast-paced).',
      reasonBudgetLow: 'Budget is low, so some stops were excluded. Raise the budget or lower the price tier.',
      reasonMissingTypes: 'Not enough restaurants/cafes/activities/parks in the radius. Widen the radius or change course order.',
      reasonMissingTypeItem: 'Few "%s" places found in the radius.',
      reasonCongestionStrict: 'Few places match your popularity filter, so others were used. Try "Popular" for more options.',
      reasonSubstituted: 'Some requested place types were substituted with others.',
      reasonPartialPlan: 'Only part of the requested course could be filled.',
      loadingTextRetry: 'Trying another server...',
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
      labelMbtiPJ: 'Course style (Select)',
      labelMbtiIE: 'Vibe (I/E)',
      mbtiPJNone: 'Select',
      mbtiIENone: 'Select',
      mbtiP: 'A Relaxed course',
      mbtiJ: 'B Fast-paced course',
      mbtiI: 'I Quiet spots',
      mbtiE: 'E Lively spots',
      mbtiHint: 'A=relaxed course, B=fast-paced course',
      mbtiBadgeP: 'Relaxed course',
      mbtiBadgeJ: 'Fast-paced course',
      btnQuickCourse: 'Detailed settings',
      showAdvanced: 'Detailed settings',
      btnRegenerate: 'Rebuild',
      placePin: 'Pin',
      placeUnpin: 'Unpin',
      placeUndo: 'Undo',
      recentRegionsLabel: 'Recent areas',
      recentPickedHere: 'Pinned spot',
      regenKeptPins: 'Pinned stops stayed. The rest were picked again.',
      errRegenNoCenter: 'No location is saved for this plan. Create one from detailed settings first.',
      errPinsNeedPools: 'This plan has no spare places, so pinned stops can’t be kept while rebuilding. Unpin them and rebuild.',
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
      presetFavorite: 'Favorite',
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
      errNoLocationPick: 'You chose "Pick on map". Click a location on the map below, then tap Create plan.',
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
      cardShareTitleDefault: 'Our date record',
      cardShareTitleHint: 'Tap the title to edit · 18 characters max',
      cardShareHint: 'Save the image for KakaoTalk/Instagram, or copy the text.',
      btnCopyCardText: 'Copy text',
      cardShareClose: 'Close',
      cardCopied: 'Card text copied! Paste into KakaoTalk.',
      budgetExceeded: 'Some items excluded to fit your budget.',
      budgetDisclaimer: 'Costs are estimates from place type, price tier, and OSM tags—not real menu prices. Bring a buffer.',
      placeEstCost: 'Est. about ₩%s',
      placeDataDisclaimer: 'Place data is from OpenStreetMap; some places may be closed or moved. Please verify on the map before visiting.',
      placeVerifyMap: 'Map',
      placeReserveLink: 'Reserve',
      placeMenuLink: 'Menu',
      placeReplaceBtn: 'Pick another',
      placeSlotLabel: 'Stop type',
      btnDownloadCardImage: 'Save image',
      cardImageSaved: 'Card image saved. Scan the QR to open the plan.',
      btnCopySharePlanLink: 'Copy link',
      sharePlanLinkCopied: 'Plan link copied. Anyone with the link can view the itinerary.',
      sharePlanLoaded: 'Shared plan loaded.',
      sharePlanLoadFailed: 'Could not open the shared link. It may be invalid or too long.',
      btnDownloadIcs: 'Add to calendar',
      icsDownloaded: 'Calendar file (.ics) saved. Open it to add events.',
      cardShareHint: 'Saved images include a QR code. Scan it or open the link to view the plan.',
      btnToggleDetails: 'Map, weather & details',
      btnMobileDockResult: 'My plans',
      placeHighlightLabel: 'Recommended for life shot, mood, date',
      errNoOtherPlace: 'No other place of this type nearby.',
      legalTerms: 'Terms of Service',
      legalPrivacy: 'Privacy Policy',
      footerOsmNote: 'Maps & places: OpenStreetMap',
      signupAgreeLegal: 'I agree to the Terms of Service and Privacy Policy.',
      signupNeedLegal: 'Please agree to the Terms and Privacy Policy.',
      locationConsentTitle: 'Location use',
      locationConsentDesc: '“My location” needs your approximate position to search nearby places, show the map, and weather. After agreeing here, your browser will also ask for permission. You can deny and pick a spot on the map instead.',
      locationConsentAllow: 'Agree and continue',
      locationConsentDeny: 'Pick on map',
      travelMinutes: 'About %s min from previous stop',
      travelOverrunNotice: 'Stay times were shortened to fit travel time.',
      weatherIndoorBias: 'We preferred indoor spots for the weather.',
      reasonClosedHours: 'Places likely closed during your time window were skipped.',
      reasonHoursRelaxed: 'Some stops may lack hours or not match your window—please verify before you go.',
      whyTitle: 'Why this course',
      whyIndoor: 'We preferred indoor spots for the weather',
      whyTravel: 'Travel time is built into the schedule (about %s min total)',
      whyCongestion: 'Matched your popularity preference',
      whyBudget: 'Fitted the course within your budget',
      whyDiversity: 'Spread stops so similar places don’t cluster',
      whyHours: 'Only places likely open in your time window',
      whyHoursRelaxed: 'Opening-hours filters were relaxed to fill the course',
      summaryStops: '%s stops',
      summaryTravel: '~%s min travel',
      summaryCost: 'Est. ₩%s',
      tipVerify: 'Please double-check maps and hours before you go',
      placeWhyOpen: 'Fits opening hours',
      placeWhyNear: 'Close to previous stop',
      placeWhyMatch: 'Matches your prefs',
      whyRoute: 'Stops were ordered to keep travel short',
      whyOutdoor: 'Mixed in outdoor spots for the fair weather',
      whyFallback: 'Built an alternate course with relaxed filters',
      whyStreetSpread: 'Spread stops so they aren’t clustered on one street',
      errPlanEmptyHint: 'Try a wider radius, or change time / popularity / course order.',
      errNoPlacesHint: 'Pick another area or widen the radius—map data may be sparse here.',
      errPlacesStaleCache: 'Live search failed, so we used recently cached nearby places.',
      errGenerateHint: 'Please try again in a moment, or check your network.',
      toastDismiss: 'Dismiss',
      summaryBudgetFit: '~%s% of budget',
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
    set('timePresetLunch', t('timePresetLunch'));
    set('timePresetDinner', t('timePresetDinner'));
    set('timePresetDay', t('timePresetDay'));
    if ($('timePresetHint')) $('timePresetHint').textContent = t('timePresetHint');
    if (typeof syncTimePresetHighlight === 'function') syncTimePresetHighlight();
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
    set('footerTermsLink', t('legalTerms'));
    set('footerPrivacyLink', t('legalPrivacy'));
    set('footerOsmNote', t('footerOsmNote'));
    set('locationConsentTitle', t('locationConsentTitle'));
    set('locationConsentDesc', t('locationConsentDesc'));
    set('btnLocationConsentAllow', t('locationConsentAllow'));
    set('btnLocationConsentDeny', t('locationConsentDeny'));
    set('locationConsentPrivacyLink', t('legalPrivacy'));
    if ($('signupAgreeLegalText')) {
      $('signupAgreeLegalText').innerHTML =
        '<a href="./legal/terms.html" target="_blank" rel="noopener">' + escapeHtml(t('legalTerms')) + '</a>' +
        (currentLang === 'en' ? ' and ' : ' 및 ') +
        '<a href="./legal/privacy.html" target="_blank" rel="noopener">' + escapeHtml(t('legalPrivacy')) + '</a>' +
        (currentLang === 'en' ? ' — I agree.' : '에 동의합니다.');
    }
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
    set('btnRegenerateText', t('btnRegenerate'));
    renderRecentRegions();
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
    if ($('labelPlanName')) $('labelPlanName').textContent = t('labelPlanName');
    if ($('planNameInput')) $('planNameInput').placeholder = t('planNamePlaceholder');
    if ($('planNameHint')) $('planNameHint').textContent = t('planNameHint');
    if ($('btnSaveCoursePresetText')) $('btnSaveCoursePresetText').textContent = t('btnSaveCoursePreset');
    if ($('btnCardShareText')) $('btnCardShareText').textContent = t('btnCardShare');
    if (cardShareHint) cardShareHint.textContent = t('cardShareHint');
    if ($('cardShareTitleHint')) $('cardShareTitleHint').textContent = t('cardShareTitleHint');
    if ($('btnCopyCardTextLabel')) $('btnCopyCardTextLabel').textContent = t('btnCopyCardText');
    if ($('btnDownloadCardImageLabel')) $('btnDownloadCardImageLabel').textContent = t('btnDownloadCardImage');
    if ($('btnCopySharePlanLinkLabel')) $('btnCopySharePlanLinkLabel').textContent = t('btnCopySharePlanLink');
    if ($('btnDownloadIcsText')) $('btnDownloadIcsText').textContent = t('btnDownloadIcs');
    if (btnCloseCardShare) btnCloseCardShare.textContent = t('cardShareClose');
    if ($('btnToggleDetailsText')) $('btnToggleDetailsText').textContent = t('btnToggleDetails');
    if ($('btnMobileDockCourseText')) $('btnMobileDockCourseText').textContent = t('btnQuickCourse') || '상세 설정';
    if ($('btnMobileDockResultText')) $('btnMobileDockResultText').textContent = t('btnMobileDockResult');
    if ($('mobilePlansTitle')) $('mobilePlansTitle').textContent = t('cardPlansTitle');
    if ($('btnCloseMobilePlans')) $('btnCloseMobilePlans').textContent = t('cardShareClose');
    if ($('mobilePlansEmptyText')) $('mobilePlansEmptyText').textContent = t('plansEmptyText');
    if ($('mobilePlansEmptyHint')) $('mobilePlansEmptyHint').textContent = t('plansEmptyHint');
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
    if ($('signupAgreeLegal')) $('signupAgreeLegal').checked = false;
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
      var agree = $('signupAgreeLegal');
      if (agree && !agree.checked) {
        if (signupModalError) signupModalError.textContent = t('signupNeedLegal');
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
      loadSavedPlansLocal();
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
      if (currentUser) syncUserDataFromCloud();
    }).catch(function () {
      updateAuthUI();
    });
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      setUserFromSession(session);
      updateAuthUI();
      if (session && session.user) syncUserDataFromCloud();
    });
  }

  function hasLocationConsent() {
    try { return localStorage.getItem(LOCATION_CONSENT_KEY) === '1'; } catch (e) { return false; }
  }

  function setLocationConsent(ok) {
    try {
      if (ok) localStorage.setItem(LOCATION_CONSENT_KEY, '1');
      else localStorage.removeItem(LOCATION_CONSENT_KEY);
    } catch (e) { }
  }

  function hideLocationConsentBanner() {
    var banner = $('locationConsentBanner');
    if (banner) banner.hidden = true;
    locationConsentPendingCb = null;
  }

  function requestLocationConsentThen(cb) {
    if (hasLocationConsent()) {
      cb();
      return;
    }
    locationConsentPendingCb = cb;
    var banner = $('locationConsentBanner');
    if (banner) banner.hidden = false;
  }

  function bindLocationConsentHandlers() {
    var allowBtn = $('btnLocationConsentAllow');
    var denyBtn = $('btnLocationConsentDeny');
    if (allowBtn) {
      allowBtn.addEventListener('click', function () {
        setLocationConsent(true);
        var cb = locationConsentPendingCb;
        hideLocationConsentBanner();
        if (typeof cb === 'function') cb();
      });
    }
    if (denyBtn) {
      denyBtn.addEventListener('click', function () {
        hideLocationConsentBanner();
        var pick = document.querySelector('input[name="quickRegion"][value="pick"]');
        if (pick) pick.checked = true;
        if (mapHint) mapHint.textContent = t('mapHintPick');
        if (advancedSection) {
          advancedSection.hidden = false;
          setAdvancedDetailsOpen(true);
          advancedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }

  function ensureSupabaseTables() {
    if (!supabaseClient || !currentUser) return Promise.resolve(false);
    if (supabaseTablesReady != null) return Promise.resolve(supabaseTablesReady);
    return supabaseClient.from('user_presets').select('id').limit(1).then(function (res) {
      supabaseTablesReady = !res.error;
      return supabaseTablesReady;
    }).catch(function () {
      supabaseTablesReady = false;
      return false;
    });
  }

  function getPlansStorageKey() {
    if (!currentUser || !currentUser.id) return null;
    return PLANS_STORAGE_PREFIX + currentUser.id;
  }

  function persistSavedPlansLocal() {
    var key = getPlansStorageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(savedPlans));
    } catch (e) { }
  }

  function loadSavedPlansLocal() {
    var key = getPlansStorageKey();
    if (!key) return;
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return;
      var list = JSON.parse(raw);
      if (Array.isArray(list)) {
        savedPlans = list;
        renderSavedPlansList();
      }
    } catch (e) { }
  }

  function renderSavedPlansList() {
    if (!plansList || !plansEmpty) return;
    plansList.innerHTML = '';
    if (!savedPlans.length) {
      plansList.hidden = true;
      plansEmpty.hidden = false;
      renderMobilePlansPanel();
      return;
    }
    plansEmpty.hidden = true;
    plansList.hidden = false;
    savedPlans.forEach(function (item) {
      plansList.appendChild(createPlanCardElement(item));
    });
    renderMobilePlansPanel();
  }

  function upsertPresetCloud(name, kind, payload) {
    return ensureSupabaseTables().then(function (ok) {
      if (!ok || !supabaseClient || !currentUser) return;
      return supabaseClient.from('user_presets').upsert({
        user_id: currentUser.id,
        name: name || 'default',
        kind: kind || 'default',
        payload: payload || {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,name,kind' });
    }).catch(function () {});
  }

  function upsertPlanCloud(item) {
    return ensureSupabaseTables().then(function (ok) {
      if (!ok || !supabaseClient || !currentUser || !item) return;
      return supabaseClient.from('saved_plans').upsert({
        user_id: currentUser.id,
        client_id: String(item.id),
        title: item.title || '',
        payload: item
      }, { onConflict: 'user_id,client_id' });
    }).catch(function () {});
  }

  function deletePlanCloud(clientId) {
    return ensureSupabaseTables().then(function (ok) {
      if (!ok || !supabaseClient || !currentUser) return;
      return supabaseClient.from('saved_plans').delete().eq('user_id', currentUser.id).eq('client_id', String(clientId));
    }).catch(function () {});
  }

  function syncUserDataFromCloud() {
    if (!currentUser || !supabaseClient) {
      loadSavedPlansLocal();
      return;
    }
    loadSavedPlansLocal();
    ensureSupabaseTables().then(function (ok) {
      if (!ok) return;
      return Promise.all([
        supabaseClient.from('user_presets').select('name,kind,payload,updated_at').eq('user_id', currentUser.id),
        supabaseClient.from('saved_plans').select('client_id,title,payload,created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false })
      ]).then(function (results) {
        var presetsRes = results[0];
        var plansRes = results[1];
        if (presetsRes && !presetsRes.error && presetsRes.data) {
          presetsRes.data.forEach(function (row) {
            try {
              if (row.kind === 'default') {
                var key = getCurrentUserPrefsKey();
                if (key) localStorage.setItem(key, JSON.stringify(row.payload || {}));
              } else if (row.kind === 'custom' && row.name) {
                addCustomPresetName(row.name);
                var ckey = getCurrentUserPrefsKey() + '-custom-' + presetNameToSlug(row.name);
                localStorage.setItem(ckey, JSON.stringify(row.payload || {}));
              }
            } catch (e) { }
          });
          loadUserCoursePreset();
          if (typeof renderSavedPresetList === 'function') {
            try { renderSavedPresetList(); } catch (e2) { }
          }
        }
        if (plansRes && !plansRes.error && plansRes.data && plansRes.data.length) {
          var merged = plansRes.data.map(function (row) {
            var p = row.payload || {};
            if (!p.id) p.id = row.client_id || Date.now();
            if (row.title) p.title = row.title;
            return p;
          });
          var byId = {};
          savedPlans.forEach(function (p) { byId[String(p.id)] = p; });
          merged.forEach(function (p) { byId[String(p.id)] = p; });
          savedPlans = Object.keys(byId).map(function (k) { return byId[k]; });
          persistSavedPlansLocal();
          renderSavedPlansList();
        }
      });
    }).catch(function () {});
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
      if (data.quickRegion === 'pick' && data.searchCenterLat != null && data.searchCenterLng != null) {
        searchCenter = { lat: Number(data.searchCenterLat), lng: Number(data.searchCenterLng) };
        if (mapHint) mapHint.textContent = t('mapHintPick');
        fetchFourDayForecast(searchCenter.lat, searchCenter.lng);
        if (mapAdapter) {
          if (mapAdapter.setView) mapAdapter.setView(searchCenter.lat, searchCenter.lng, 15);
          if (mapAdapter.addPickMarker) mapAdapter.addPickMarker(searchCenter.lat, searchCenter.lng, t('pickHerePlan'));
          refreshMainMapAfterShow();
          setTimeout(function () {
            if (!searchCenter || !mapAdapter || !mapAdapter.addPickMarker) return;
            mapAdapter.setView(searchCenter.lat, searchCenter.lng, 15);
            mapAdapter.addPickMarker(searchCenter.lat, searchCenter.lng, t('pickHerePlan'));
          }, 400);
        }
      } else if (data.quickRegion === 'my') {
        if (mapAdapter && mapAdapter.removePickMarker) mapAdapter.removePickMarker();
        if (mapHint) mapHint.textContent = t('mapHintDefault');
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
    if (typeof syncTimePresetHighlight === 'function') syncTimePresetHighlight();
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
      var base = getCurrentUserPrefsKey();
      if (base && key === base) {
        upsertPresetCloud('default', 'default', data);
      } else if (base && key.indexOf(base + '-custom-') === 0) {
        var slug = key.replace(base + '-custom-', '');
        var names = getCustomPresetNames();
        var name = names.find(function (n) { return presetNameToSlug(n) === slug; }) || slug;
        upsertPresetCloud(name, 'custom', data);
      }
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
          var center = customPresetPickedCenter || (typeof searchCenter !== 'undefined' && searchCenter && typeof searchCenter.lat === 'number' && (typeof searchCenter.lng === 'number' || typeof searchCenter.lon === 'number') ? searchCenter : null);
          if (center) {
            data.searchCenterLat = center.lat;
            data.searchCenterLng = center.lng != null ? center.lng : center.lon;
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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abc',
        maxZoom: 19,
      }).addTo(m);
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
    var base = getCurrentUserPrefsKey();
    if (base) renameFavoritePresetKey(base + '-custom-' + presetNameToSlug(oldName), base + '-custom-' + presetNameToSlug(newName));
  }

  function getFavoritePresetStorageKey() {
    var base = getCurrentUserPrefsKey();
    return base ? base + '-favorites' : null;
  }

  function getFavoritePresetKeys() {
    var key = getFavoritePresetStorageKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function isFavoritePreset(presetKey) {
    return getFavoritePresetKeys().indexOf(presetKey) !== -1;
  }

  function toggleFavoritePreset(presetKey) {
    var key = getFavoritePresetStorageKey();
    if (!key || !presetKey) return;
    var list = getFavoritePresetKeys();
    var i = list.indexOf(presetKey);
    if (i === -1) list.unshift(presetKey);
    else list.splice(i, 1);
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { }
  }

  function renameFavoritePresetKey(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey) return;
    var store = getFavoritePresetStorageKey();
    if (!store || !isFavoritePreset(oldKey)) return;
    var list = getFavoritePresetKeys().filter(function (k) { return k !== oldKey && k !== newKey; });
    list.unshift(newKey);
    try { localStorage.setItem(store, JSON.stringify(list)); } catch (e) { }
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
      var favStore = getFavoritePresetStorageKey();
      if (favStore) {
        var favs = getFavoritePresetKeys().filter(function (k) { return k !== key; });
        localStorage.setItem(favStore, JSON.stringify(favs));
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
    var rows = [];
    if (list.hasDefault) rows.push({ key: baseKey, name: t('presetDefault'), isDefault: true });
    list.customNames.forEach(function (name) {
      rows.push({ key: baseKey + '-custom-' + presetNameToSlug(name), name: name, isDefault: false });
    });
    rows.sort(function (a, b) {
      var af = isFavoritePreset(a.key) ? 1 : 0;
      var bf = isFavoritePreset(b.key) ? 1 : 0;
      return bf - af;
    });
    rows.forEach(function (row) {
      var li = document.createElement('li');
      li.className = 'saved-preset-item' + (isFavoritePreset(row.key) ? ' is-favorite' : '');
      li.setAttribute('data-preset-key', row.key);
      if (!row.isDefault) li.setAttribute('data-preset-name', row.name);
      var label = document.createElement('span');
      label.className = 'saved-preset-label';
      label.textContent = row.name;
      li.appendChild(label);
      var actions = document.createElement('span');
      actions.className = 'saved-preset-actions';
      var favBtn = document.createElement('button');
      favBtn.type = 'button';
      favBtn.className = 'saved-preset-fav btn btn-ghost btn-sm' + (isFavoritePreset(row.key) ? ' is-on' : '');
      favBtn.textContent = t('presetFavorite');
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'saved-preset-edit btn btn-ghost btn-sm';
      editBtn.textContent = t('presetEdit');
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'saved-preset-delete btn btn-ghost btn-sm';
      delBtn.textContent = t('presetDelete');
      actions.appendChild(favBtn);
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
      baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abc',
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
      rememberRegion(lat, lng, t('recentPickedHere'));
      fetchFourDayForecast(lat, lng);
    });

    btnMyLocation.addEventListener('click', goToMyLocation);
    btnGenerate.addEventListener('click', generatePlan);
    btnReset.addEventListener('click', resetResult);
    if (btnQuickCourse) btnQuickCourse.addEventListener('click', openDetailedSettings);
    bindTimePresetChips();
    document.querySelectorAll('input[name="quickCourseOrderMode"]').forEach(function (radio) {
      radio.addEventListener('change', updateCourseOrderSelectsVisibility);
    });
    updateCourseOrderSelectsVisibility();
    var courseOrder4El = $('courseOrder4');
    if (courseOrder4El) courseOrder4El.addEventListener('change', syncCourseOrder3SkipOption);
    if ($('btnRegenerate')) $('btnRegenerate').addEventListener('click', regenerateSameCourse);
    if (btnOptimizeRoute) btnOptimizeRoute.addEventListener('click', runOptimizeRoute);
    if ($('btnDownloadIcs')) $('btnDownloadIcs').addEventListener('click', downloadPlanIcs);
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
              lastRenderedPlan.mbtiIE || '',
              {
                whyItems: lastRenderedPlan.whyItems || null,
                travelTotal: lastRenderedPlan.travelTotal
              }
            );
          }
        }
      });
    });
  }

  function switchTab(tab) {
    // 함께 짜기 탭 UI는 제거됨 — 코스 탭만 유지
    if (panelCourse) panelCourse.hidden = false;
    if (tabCourse) { tabCourse.classList.add('active'); tabCourse.setAttribute('aria-selected', 'true'); }
    if (panelShare) panelShare.hidden = true;
    if (tabShare) {
      tabShare.classList.remove('active');
      tabShare.setAttribute('aria-selected', 'false');
      tabShare.hidden = true;
    }
  }

  function bindNonMapHandlers() {
    btnMyLocation.addEventListener('click', goToMyLocation);
    btnGenerate.addEventListener('click', generatePlan);
    btnReset.addEventListener('click', resetResult);
    if (btnQuickCourse) btnQuickCourse.addEventListener('click', openDetailedSettings);
    bindTimePresetChips();
    document.querySelectorAll('input[name="quickCourseOrderMode"]').forEach(function (radio) {
      radio.addEventListener('change', updateCourseOrderSelectsVisibility);
    });
    updateCourseOrderSelectsVisibility();
    if ($('courseOrder4')) $('courseOrder4').addEventListener('change', syncCourseOrder3SkipOption);
    if ($('btnRegenerate')) $('btnRegenerate').addEventListener('click', regenerateSameCourse);
    if (btnOptimizeRoute) btnOptimizeRoute.addEventListener('click', runOptimizeRoute);
    if ($('btnDownloadIcs')) $('btnDownloadIcs').addEventListener('click', downloadPlanIcs);
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
              lastRenderedPlan.mbtiIE || '',
              {
                whyItems: lastRenderedPlan.whyItems || null,
                travelTotal: lastRenderedPlan.travelTotal
              }
            );
          }
        }
      });
    });
  }

  function searchPlaceQuery(q, onDone) {
    var query = String(q || '').trim();
    if (!query) {
      if (onDone) onDone(null);
      return;
    }
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) + '&format=json&limit=1')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data[0]) {
          showError(t('errSearchNoResult'));
          if (onDone) onDone(null);
          return;
        }
        var lat = parseFloat(data[0].lat);
        var lon = parseFloat(data[0].lon);
        if (isNaN(lat) || isNaN(lon)) {
          showError(t('errSearchNoResult'));
          if (onDone) onDone(null);
          return;
        }
        searchCenter = { lat: lat, lng: lon };
        var pickRadio = document.querySelector('input[name="quickRegion"][value="pick"]');
        if (pickRadio) pickRadio.checked = true;
        if (mapHint) mapHint.textContent = t('mapHintPick');
        if (mapAdapter) {
          if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
          mapAdapter.setView(lat, lon, 15);
          mapAdapter.addPickMarker(lat, lon, data[0].display_name || query);
        }
        rememberRegion(lat, lon, query);
        fetchFourDayForecast(lat, lon);
        if (onDone) onDone(searchCenter);
      })
      .catch(function () {
        showError(t('errSearchNoResult'));
        if (onDone) onDone(null);
      });
  }

  function runSearch() {
    var q = searchInput && searchInput.value.trim();
    if (!q) return;
    var wasSectionHidden = advancedSection && advancedSection.hidden;
    if (wasSectionHidden) {
      advancedSection.hidden = false;
      advancedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      refreshMainMapAfterShow();
      setTimeout(runSearch, 180);
      return;
    }
    searchPlaceQuery(q);
  }

  function goToMyLocation() {
    requestLocationConsentThen(function () {
      goToMyLocationAfterConsent();
    });
  }

  function goToMyLocationAfterConsent() {
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
    if (c === 45 || c === 48) return 'fog';
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
      var th = fourDayForecast[selectedForecastDayIndex].theme;
      if (weatherTheme === 'dust' && (th === 'fine' || th === 'cloudy')) return 'dust';
      return th;
    }
    return weatherTheme;
  }

  function isQuickRegionPick() {
    return (document.querySelector('input[name="quickRegion"]:checked') || {}).value === 'pick';
  }

  function showError(msg) {
    // 복사 완료 등 성공 피드백에도 쓰이므로 기본은 info, 실패 힌트는 error 톤
    var text = String(msg || '');
    var kind = (/실패|못했어요|Could not|failed|error|확인한 뒤|try again|네트워크/i.test(text)) ? 'error' : 'info';
    showToast(text, kind);
  }

  function showToast(msg, kind) {
    if (!msg) return;
    var el = $('appToast');
    if (!el) {
      alert(msg);
      return;
    }
    el.textContent = String(msg);
    el.className = 'app-toast is-visible' + (kind === 'ok' ? ' is-ok' : (kind === 'info' ? ' is-info' : ' is-error'));
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    if (showToast._timer) clearTimeout(showToast._timer);
    var hold = Math.min(9000, 2800 + String(msg).length * 35);
    showToast._timer = setTimeout(function () {
      el.classList.remove('is-visible');
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    }, hold);
  }

  var placeSearchCache = {};
  // PLACE_CACHE_TTL_MS / PLACE_CACHE_STALE_MS defined above

  function placeCacheKey(center, radiusMeters) {
    var lng = center.lng != null ? center.lng : center.lon;
    return Number(center.lat).toFixed(3) + ',' + Number(lng).toFixed(3) + ',' + Math.round(radiusMeters);
  }

  function readSessionPlaceCache() {
    try {
      var raw = sessionStorage.getItem(PLACE_CACHE_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeSessionPlaceCache(map) {
    try {
      var keys = Object.keys(map);
      if (keys.length > 24) {
        keys.sort(function (a, b) { return (map[a].at || 0) - (map[b].at || 0); });
        keys.slice(0, keys.length - 24).forEach(function (k) { delete map[k]; });
      }
      sessionStorage.setItem(PLACE_CACHE_STORAGE_KEY, JSON.stringify(map));
    } catch (e) { /* quota */ }
  }

  function getCachedPlaceElements(cacheKey, allowStale) {
    function usable(entry, staleOk) {
      if (!entry || !entry.elements || !entry.elements.length) return null;
      var age = Date.now() - (entry.at || 0);
      if (age < PLACE_CACHE_TTL_MS) return { elements: entry.elements, stale: false };
      if (staleOk && age < PLACE_CACHE_STALE_MS) return { elements: entry.elements, stale: true };
      return null;
    }
    var fromMem = usable(placeSearchCache[cacheKey], allowStale);
    if (fromMem) return fromMem;
    var disk = readSessionPlaceCache();
    var fromDisk = usable(disk[cacheKey], allowStale);
    if (fromDisk) {
      placeSearchCache[cacheKey] = disk[cacheKey];
      return fromDisk;
    }
    return null;
  }

  function putCachedPlaceElements(cacheKey, elements) {
    if (!elements || !elements.length) return;
    var entry = { at: Date.now(), elements: elements };
    placeSearchCache[cacheKey] = entry;
    var disk = readSessionPlaceCache();
    disk[cacheKey] = entry;
    writeSessionPlaceCache(disk);
  }

  function setLoadingText(key) {
    var el = $('loadingText');
    if (el) el.textContent = t(key || 'loadingText');
  }

  var loadingProgressValue = 0;
  var loadingProgressTimer = null;
  var LOADING_RING_LEN = 2 * Math.PI * 52; // ~326.73

  function applyLoadingProgressUI(pct) {
    var clamped = Math.max(0, Math.min(100, Math.round(pct)));
    loadingProgressValue = clamped;
    var pctEl = $('loadingPercent');
    if (pctEl) pctEl.textContent = String(clamped);
    var ring = $('loadingRingProgress');
    if (ring) {
      var offset = LOADING_RING_LEN * (1 - clamped / 100);
      ring.style.strokeDasharray = String(LOADING_RING_LEN);
      ring.style.strokeDashoffset = String(offset);
    }
    var bar = $('loadingBarFill');
    if (bar) bar.style.width = clamped + '%';
    if (loading) loading.setAttribute('aria-valuenow', String(clamped));
  }

  function setLoadingProgress(pct, textKey, subKey) {
    applyLoadingProgressUI(pct);
    if (textKey) setLoadingText(textKey);
    var sub = $('loadingSub');
    if (sub) sub.textContent = subKey ? t(subKey) : '';
  }

  function startLoadingProgressDrift(from, to, durationMs) {
    if (loadingProgressTimer) {
      clearInterval(loadingProgressTimer);
      loadingProgressTimer = null;
    }
    var start = Date.now();
    var begin = from != null ? from : loadingProgressValue;
    loadingProgressTimer = setInterval(function () {
      var tRatio = Math.min(1, (Date.now() - start) / (durationMs || 4000));
      var eased = 1 - Math.pow(1 - tRatio, 3);
      var val = begin + (to - begin) * eased;
      applyLoadingProgressUI(val);
      if (tRatio >= 1) {
        clearInterval(loadingProgressTimer);
        loadingProgressTimer = null;
      }
    }, 40);
  }

  function showLoadingOverlay() {
    if (!loading) return;
    loading.classList.add('is-visible');
    loading.setAttribute('aria-hidden', 'false');
    loading.setAttribute('aria-valuemin', '0');
    loading.setAttribute('aria-valuemax', '100');
    setLoadingProgress(2, 'loadingText', 'loadingSubSearch');
    startLoadingProgressDrift(2, 48, 5500);
  }

  function hideLoadingOverlay() {
    if (loadingProgressTimer) {
      clearInterval(loadingProgressTimer);
      loadingProgressTimer = null;
    }
    applyLoadingProgressUI(100);
    setTimeout(function () {
      if (!loading) return;
      loading.classList.remove('is-visible');
      loading.setAttribute('aria-hidden', 'true');
      applyLoadingProgressUI(0);
      setLoadingText('loadingText');
      var sub = $('loadingSub');
      if (sub) sub.textContent = '';
    }, 280);
  }

  async function overpassQuery(center, radiusMeters) {
    var cacheKey = placeCacheKey(center, radiusMeters);
    var fresh = getCachedPlaceElements(cacheKey, false);
    if (fresh) return fresh.elements;

    var lat = center.lat;
    var lng = center.lng != null ? center.lng : center.lon;
    var r = Math.min(Math.max(radiusMeters, 100), 8000);
    // nwr + tags만 요청해 응답을 가볍게. 결과 상한으로 서버 부담 감소.
    var query = [
      '[out:json][timeout:12];',
      '(',
      'nwr["amenity"~"restaurant|cafe|fast_food|bar|ice_cream"](around:' + r + ',' + lat + ',' + lng + ');',
      'nwr["tourism"~"museum|gallery|theme_park|attraction"](around:' + r + ',' + lat + ',' + lng + ');',
      'nwr["shop"~"mall|department_store"](around:' + r + ',' + lat + ',' + lng + ');',
      'nwr["leisure"~"park|garden"](around:' + r + ',' + lat + ',' + lng + ');',
      ');',
      'out center tags 180;',
    ].join('');
    var body = 'data=' + encodeURIComponent(query);
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var settled = false;
    var lastError = null;

    function fetchOne(url) {
      return fetch(url, {
        method: 'POST',
        body: body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller ? controller.signal : undefined,
      }).then(function (res) {
        if (!res.ok) throw new Error('장소 검색 실패 (' + res.status + ')');
        return res.json();
      }).then(function (json) {
        if (settled) return null;
        var els = json.elements || [];
        // 빈 응답은 성공으로 확정하지 않음 (다른 미러가 채울 수 있음)
        if (!els.length) return null;
        settled = true;
        if (controller) controller.abort();
        return els;
      });
    }

    // 여러 서버에 동시에 요청하고, 먼저 성공한 결과 사용
    var promises = OVERPASS_URLS.map(function (url, idx) {
      return new Promise(function (resolve) {
        var delay = idx === 0 ? 0 : 350 * idx;
        setTimeout(function () {
          if (settled) {
            resolve(null);
            return;
          }
          if (idx > 0) setLoadingProgress(Math.min(50, 12 + idx * 10), 'loadingTextRetry', 'loadingSubSearch');
          fetchOne(url).then(resolve).catch(function (e) {
            if (!settled) lastError = e;
            resolve(null);
          });
        }, delay);
      });
    });

    var results = await Promise.all(promises);
    for (var i = 0; i < results.length; i++) {
      if (results[i] && results[i].length) {
        putCachedPlaceElements(cacheKey, results[i]);
        setLoadingText('loadingText');
        return results[i];
      }
    }
    // 네트워크 실패 시 만료된 캐시라도 사용
    var stale = getCachedPlaceElements(cacheKey, true);
    if (stale && stale.elements && stale.elements.length) {
      setLoadingText('loadingText');
      overpassQuery._usedStaleCache = true;
      return stale.elements;
    }
    // 같은 중심·비슷한 반경의 캐시만 사용
    var disk = readSessionPlaceCache();
    var nearKey = null;
    var nearAt = 0;
    var latKey = Number(lat).toFixed(3);
    var lngKey = Number(lng).toFixed(3);
    Object.keys(disk).forEach(function (k) {
      var parts = k.split(',');
      if (parts.length < 3) return;
      if (parts[0] !== latKey || parts[1] !== lngKey) return;
      var cachedR = parseInt(parts[2], 10);
      if (isNaN(cachedR)) return;
      if (Math.abs(cachedR - radiusMeters) > Math.max(500, radiusMeters * 0.5)) return;
      if (disk[k] && disk[k].elements && disk[k].elements.length && disk[k].at > nearAt) {
        nearKey = k;
        nearAt = disk[k].at;
      }
    });
    if (nearKey && disk[nearKey].elements && disk[nearKey].elements.length && (Date.now() - nearAt) < PLACE_CACHE_STALE_MS) {
      var filteredNear = filterOsmElementsByRadius(disk[nearKey].elements, center, radiusMeters);
      if (filteredNear && filteredNear.length) {
        setLoadingText('loadingText');
        overpassQuery._usedStaleCache = true;
        return filteredNear;
      }
    }
    setLoadingText('loadingText');
    throw lastError || new Error(t('errPlacesSearchFailed'));
  }

  function filterOsmElementsByRadius(elements, center, radiusMeters) {
    if (!elements || !elements.length || !center) return elements || [];
    var lat = center.lat;
    var lon = center.lng != null ? center.lng : center.lon;
    var maxM = (radiusMeters || 1500) * 1.12;
    return elements.filter(function (el) {
      var elat = el.lat != null ? el.lat : (el.center && el.center.lat);
      var elon = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (elat == null || elon == null) return false;
      return haversineKm({ lat: lat, lon: lon }, { lat: elat, lon: elon }) * 1000 <= maxM;
    });
  }

  function isBadPlaceName(name) {
    if (name == null) return true;
    var n = String(name).trim();
    if (n.length < 2) return true;
    var lower = n.toLowerCase();
    if (
      lower === '이름 없음' ||
      lower === 'unnamed' ||
      lower === 'unknown' ||
      lower === 'null' ||
      lower === 'undefined' ||
      lower === 'n/a' ||
      lower === '-' ||
      lower === '—' ||
      lower === 'restaurant' ||
      lower === 'cafe' ||
      lower === 'café' ||
      lower === 'park' ||
      lower === 'bar' ||
      lower === 'shop' ||
      lower === 'store' ||
      lower === 'building' ||
      lower === 'place' ||
      lower === '식당' ||
      lower === '카페' ||
      lower === '공원' ||
      lower === '음식점' ||
      lower === '매장' ||
      lower === '상호없음'
    ) {
      return true;
    }
    // 숫자·기호만 / 노드 id 형태
    if (/^[\d\s\-_.·#]+$/.test(n)) return true;
    if (/^(node|way|relation)[\s_-]*\d+$/i.test(n)) return true;
    // 너무 일반적인 접두만 있는 이름
    if (/^(restaurant|cafe|café|park|bar)\s*\d*$/i.test(n)) return true;
    if (/^(식당|카페|공원|음식점)\s*\d*$/.test(n)) return true;
    // 한글/영문 글자가 거의 없으면 제외
    var letters = n.replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
    if (letters.length < 2) return true;
    return false;
  }

  function isOsmPlaceClosed(tags) {
    if (!tags || typeof tags !== 'object') return false;
    if (tags['disused:amenity'] || tags['abandoned:amenity'] || tags['disused:shop'] || tags['abandoned:shop']) return true;
    if (tags['disused:tourism'] || tags['abandoned:tourism'] || tags['disused:leisure'] || tags['abandoned:leisure']) return true;
    var yesish = function (v) {
      var s = String(v || '').toLowerCase();
      return s === 'yes' || s === '1' || s === 'true' || s === 'abandoned' || s === 'disused';
    };
    if (yesish(tags.abandoned) || yesish(tags.disused) || yesish(tags.demolished) || yesish(tags.razed) || yesish(tags.closed)) return true;
    var life = String(tags.lifecycle || '').toLowerCase();
    if (life === 'abandoned' || life === 'disused' || life === 'demolished' || life === 'ruins' || life === 'construction') return true;
    if (tags.construction) return true;
    if (String(tags.shop || '').toLowerCase() === 'vacant') return true;
    if (String(tags.amenity || '').toLowerCase() === 'vacant') return true;
    if (String(tags.building || '').toLowerCase() === 'ruins') return true;
    var oh = String(tags.opening_hours || '').trim().toLowerCase();
    if (oh === 'closed' || oh === 'off' || oh === 'permanently closed' || oh.indexOf('permanently closed') !== -1) return true;
    if (String(tags.access || '').toLowerCase() === 'no' && (tags.amenity || tags.shop || tags.tourism)) return true;
    var nm = String(tags.name || tags['name:ko'] || '').toLowerCase();
    if (/폐업|휴업|철거|폐쇄|closed|permanently closed|out of business/.test(nm)) return true;
    // check_date가 매우 오래되고 상태 태그가 의심스러우면 제외에 가깝게 처리 (명시적 폐업은 위에서)
    return false;
  }

  function isOsmDataStale(tags) {
    if (!tags) return false;
    var raw = tags.check_date || tags['check_date:opening_hours'] || tags.survey_date;
    if (!raw) return false;
    var m = String(raw).match(/(\d{4})/);
    if (!m) return false;
    var year = parseInt(m[1], 10);
    var nowY = new Date().getFullYear();
    return year > 1990 && year < (nowY - 4);
  }

  function isWeakPlaceCandidate(place) {
    if (!place) return true;
    if (isBadPlaceName(place.name)) return true;
    if (isOsmPlaceClosed(place.tags)) return true;
    if (isOsmLowRated(place.tags)) return true;
    if (!(place.lat != null && place.lon != null)) return true;
    return false;
  }

  function streetKeyOf(place) {
    var tags = (place && place.tags) || {};
    var street = tags['addr:street'] || tags['addr:road'] || tags['addr:full'] || '';
    if (!street && place.addr) {
      var parts = String(place.addr).split(/\s+/);
      street = parts.length >= 2 ? parts.slice(0, 2).join(' ') : parts[0];
    }
    return street ? normalizePlaceNameForMatch(street).slice(0, 18) : '';
  }

  function gridKeyOf(place) {
    if (!place || place.lat == null || place.lon == null) return '';
    // ~140m 격자
    return Math.round(Number(place.lat) * 750) + 'x' + Math.round(Number(place.lon) * 750);
  }

  function namesTooSimilar(a, b) {
    var na = normalizePlaceNameForMatch(a);
    var nb = normalizePlaceNameForMatch(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length >= 4 && nb.length >= 4 && (na.indexOf(nb) === 0 || nb.indexOf(na) === 0)) return true;
    if (namePrefixKey(a) && namePrefixKey(a) === namePrefixKey(b) && Math.abs(na.length - nb.length) <= 2) return true;
    return false;
  }

  function isOsmLowRated(tags) {
    if (!tags) return false;
    var raw = tags.stars != null ? tags.stars : (tags.rating != null ? tags.rating : tags['rating:stars']);
    if (raw == null || raw === '') return false;
    var stars = parseFloat(String(raw).replace(',', '.'), 10);
    // OSM에 평점이 있고 3점 미만이면 제외
    if (!isNaN(stars) && stars > 0 && stars < 3) return true;
    return false;
  }

  function normalizePlaceNameForMatch(s) {
    return String(s || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function naverResultMatchesPlace(result, placeName) {
    if (!result || !result.items || !result.items.length) return false;
    var target = normalizePlaceNameForMatch(placeName);
    if (!target) return false;
    for (var i = 0; i < result.items.length; i++) {
      var title = normalizePlaceNameForMatch(result.items[i].title);
      if (!title) continue;
      if (title.indexOf(target) !== -1 || target.indexOf(title) !== -1) return true;
      // 앞 글자 일부가 겹치면 매칭으로 인정
      var short = target.slice(0, Math.min(4, target.length));
      if (short.length >= 2 && title.indexOf(short) !== -1) return true;
    }
    return false;
  }

  function naverResultLooksVeryBad(result) {
    if (!result || !result.items || !result.items.length) return false;
    var badWords = ['최악', '비추', '절대가지마', '위생불량', '불친절', '폐업', '문닫', '별로임', '맛없', '실망', '환불'];
    var badHits = 0;
    var checked = 0;
    for (var i = 0; i < result.items.length && i < 5; i++) {
      var text = ((result.items[i].title || '') + ' ' + (result.items[i].description || '')).replace(/<[^>]+>/g, '');
      checked++;
      for (var j = 0; j < badWords.length; j++) {
        if (text.indexOf(badWords[j]) !== -1) {
          badHits++;
          break;
        }
      }
    }
    // 검색 스니펫에 강한 부정 표현이 다수면 제외
    return checked > 0 && badHits >= Math.ceil(checked * 0.6);
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

  function parseOsmFeeToWon(tags) {
    if (!tags) return null;
    var fee = tags.fee != null ? String(tags.fee).toLowerCase().trim() : '';
    if (fee === 'no' || fee === 'free' || fee === '0') return 0;
    var charge = tags.charge || tags['fee:amount'] || tags['payment:amount'] || tags['ticket:price'];
    if (charge == null || charge === '') return fee === 'yes' ? null : null;
    var raw = String(charge).replace(/,/g, '');
    var m = raw.match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    var n = parseFloat(m[1], 10);
    if (isNaN(n)) return null;
    if (/₩|원|krw/i.test(raw) || n >= 500) return Math.round(n);
    if (/\$|usd/i.test(raw)) return Math.round(n * 1350);
    if (/€|eur/i.test(raw)) return Math.round(n * 1450);
    // OSM에 작은 숫자만 있으면 티어 추정으로 넘김
    if (n > 0 && n < 20) return null;
    return Math.round(n);
  }

  var PRICE_TIER_CHEAP_WORDS = ['분식', '김밥', '국밥', '버거', '라면', '떡볶이', '포장마차', 'burger', 'ramen', 'gimbap', 'kimbap', 'tteokbokki'];
  var PRICE_TIER_EXPENSIVE_WORDS = ['스시', '오마카세', '스테이크', '파인다이닝', '한우', '와인', 'sushi', 'omakase', 'steak', 'wagyu', 'fine dining'];

  function priceTierFromNameAndCuisine(place) {
    var tags = (place && place.tags) || {};
    var text = [
      place && place.name,
      tags.name,
      tags['name:ko'],
      tags['name:en'],
      tags.cuisine,
      tags['cuisine:ko']
    ].join(' ').toLowerCase();
    if (!text.trim()) return null;
    var cheap = false;
    var expensive = false;
    for (var i = 0; i < PRICE_TIER_CHEAP_WORDS.length; i++) {
      if (text.indexOf(PRICE_TIER_CHEAP_WORDS[i]) !== -1) { cheap = true; break; }
    }
    for (var j = 0; j < PRICE_TIER_EXPENSIVE_WORDS.length; j++) {
      if (text.indexOf(PRICE_TIER_EXPENSIVE_WORDS[j].toLowerCase()) !== -1) { expensive = true; break; }
    }
    if (cheap && expensive) return 'normal';
    if (cheap) return 'cheap';
    if (expensive) return 'expensive';
    return null;
  }

  function inferPlacePriceTier(place) {
    if (!place) return 'normal';
    if (place.priceTier) return place.priceTier;
    var tags = place.tags || {};
    var fromTag = parseOsmPriceTag(tags.price) || parseOsmPriceTag(tags['price:class']);
    if (fromTag) return fromTag;
    if (tags.fee != null && String(tags.fee).toLowerCase() === 'free') return 'cheap';
    if (place.typeKey === 'fast_food' || place.typeKey === 'ice_cream') return 'cheap';
    if (place.typeKey === 'theme_park' || place.typeKey === 'bar') return 'expensive';
    var fromName = priceTierFromNameAndCuisine(place);
    if (fromName) return fromName;
    return 'normal';
  }

  function estimatePlaceCostWon(place, userTier) {
    var tier = userTier || getPriceTier();
    var slot = getPoolIndexAndSlotType((place && place.typeKey) || 'restaurant').slotTypeKey;
    var baseTable = ESTIMATED_COST_BY_TIER[tier] || ESTIMATED_COST_BY_TIER.normal;
    var base = baseTable[slot] != null ? baseTable[slot] : 15000;
    var mult = ESTIMATED_COST_TYPE_MULT[(place && place.typeKey) || ''];
    if (mult == null) mult = 1;
    var cost = Math.round(base * mult);

    var tags = (place && place.tags) || {};
    var cuisine = String(tags.cuisine || tags['cuisine:ko'] || '');
    if (cuisine) {
      for (var ci = 0; ci < ESTIMATED_COST_CUISINE_MULT.length; ci++) {
        if (ESTIMATED_COST_CUISINE_MULT[ci].re.test(cuisine)) {
          cost = Math.round(cost * ESTIMATED_COST_CUISINE_MULT[ci].mult);
          break;
        }
      }
    }

    var osmFee = parseOsmFeeToWon(place && place.tags);
    if (osmFee != null) {
      // 입장료가 명시된 놀거리/공원은 OSM 값을 우선, 식음은 티어 추정 유지
      if (slot === 'activity' || slot === 'park') cost = osmFee;
    }

    var placeTier = inferPlacePriceTier(place);
    if (placeTier && placeTier !== tier) {
      if (placeTier === 'cheap') cost = Math.round(cost * 0.72);
      else if (placeTier === 'expensive') cost = Math.round(cost * 1.32);
    }

    // 고급 신호: stars/Michelin-ish / outdoor_seating만으로는 소폭
    var stars = parseFloat(String(tags.stars || tags.rating || '').replace(',', '.'), 10);
    if (!isNaN(stars) && stars >= 4.5) cost = Math.round(cost * 1.08);

    if (slot === 'park' && osmFee == null) cost = 0;
    // 티어별 하한·상한으로 비현실적 값 방지
    var caps = {
      cheap: { restaurant: [12000, 28000], cafe: [6000, 14000], activity: [0, 40000], park: [0, 8000] },
      normal: { restaurant: [18000, 65000], cafe: [9000, 24000], activity: [0, 70000], park: [0, 10000] },
      expensive: { restaurant: [40000, 140000], cafe: [12000, 40000], activity: [0, 120000], park: [0, 20000] }
    };
    var cap = (caps[tier] || caps.normal)[slot];
    if (cap) cost = Math.max(cap[0], Math.min(cap[1], cost));
    return Math.max(0, cost);
  }

  function sumPlanEstimatedCost(plan, userTier) {
    if (!plan || !plan.length) return 0;
    var tier = userTier || getPriceTier();
    var sum = 0;
    for (var i = 0; i < plan.length; i++) {
      var c = plan[i].estimatedCostWon;
      if (c == null) c = estimatePlaceCostWon(plan[i], tier);
      plan[i].estimatedCostWon = c;
      sum += c;
    }
    return sum;
  }

  function parseElements(elements) {
    var places = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var tags = el.tags || {};
      if (isOsmPlaceClosed(tags)) continue;
      if (isOsmLowRated(tags)) continue;
      var lat = el.lat != null ? el.lat : (el.center && el.center.lat);
      var lon = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (lat == null || lon == null) continue;
      // 이름이 전혀 없는 장소(이름 태그 없음)는 일정 후보에서 제외
      if (!(tags.name || tags['name:ko'] || tags['name:en'])) continue;
      var name = tags.name || (currentLang === 'en' ? tags['name:en'] : tags['name:ko']) || '';
      if (isBadPlaceName(name)) continue;
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
        if (tags.shop === 'mall' || tags.shop === 'department_store') {
          type = t('type_mall');
          typeKey = 'mall';
        } else {
          type = tags.shop;
          typeKey = 'place';
        }
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

  function getCategoryScoreDivisor(typeKey) {
    if (!typeKey) return 1;
    if (typeKey === 'park') return 0.5;
    if (typeKey === 'museum' || typeKey === 'gallery') return 0.75;
    if (typeKey === 'attraction' || typeKey === 'theme_park') return 0.85;
    if (typeKey === 'cafe' || typeKey === 'ice_cream') return 0.9;
    return 1;
  }

  function hashJitter(place) {
    var key = (place.name || '') + (place.lat || 0).toFixed(4) + (place.lon || 0).toFixed(4);
    var n = 0;
    for (var i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0;
    return n % 16;
  }

  function scoreCongestionOsm(place) {
    var tags = (place && place.tags) || {};
    var score = 28 + hashJitter(place || {});
    var tourism = String(tags.tourism || '').toLowerCase();
    if (tourism === 'attraction' || tourism === 'theme_park' || tourism === 'zoo' || tourism === 'aquarium') score += 25;
    if (tourism === 'museum' || tourism === 'gallery') score += 12;
    if (String(tags.shop || '').toLowerCase() === 'mall' || (place && place.typeKey === 'mall')) score += 20;
    if (tags.wikipedia || tags.wikidata) score += 15;
    if (tags.brand || tags['brand:wikidata']) score += 10;
    var cap = parseInt(tags.capacity, 10);
    if (!isNaN(cap) && cap > 0) score += Math.min(20, Math.floor(Math.log10(cap + 1) * 10));
    return Math.max(0, Math.min(100, score));
  }

  function levelFromCongestionScore(score) {
    if (score < 38) return { level: 'relaxed', labelKey: 'congestionRelaxed' };
    if (score < 68) return { level: 'normal', labelKey: 'congestionNormal' };
    return { level: 'busy', labelKey: 'congestionBusy' };
  }

  function getCongestion(place) {
    if (place && place._congestionScore != null) return levelFromCongestionScore(place._congestionScore);
    return levelFromCongestionScore(scoreCongestionOsm(place || {}));
  }

  function isNaverSearchConfigured() {
    return true;
  }

  function fetchNaverLocalSearch(query, sort) {
    if (!query || !String(query).trim()) return Promise.resolve(null);
    var cacheKey = String(query).trim().toLowerCase() + '|' + (sort === 'comment' ? 'comment' : 'random');
    if (Object.prototype.hasOwnProperty.call(naverSearchCache, cacheKey)) {
      return Promise.resolve(naverSearchCache[cacheKey]);
    }
    var url =
      NAVER_SEARCH_LOCAL_URL +
      '?query=' +
      encodeURIComponent(String(query).trim()) +
      '&sort=' +
      (sort === 'comment' ? 'comment' : 'random');
    return fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.errorCode) {
          naverSearchCache[cacheKey] = null;
          return null;
        }
        var total = (data.total != null) ? parseInt(data.total, 10) : 0;
        var items = (data.items && Array.isArray(data.items)) ? data.items : [];
        var result = { total: isNaN(total) ? 0 : total, items: items };
        naverSearchCache[cacheKey] = result;
        return result;
      })
      .catch(function () {
        naverSearchCache[cacheKey] = null;
        return null;
      });
  }

  function mapWithConcurrency(items, limit, worker) {
    var out = new Array(items.length);
    var i = 0;
    function next() {
      if (i >= items.length) return Promise.resolve();
      var idx = i++;
      return Promise.resolve(worker(items[idx], idx)).then(function (v) {
        out[idx] = v;
        return next();
      });
    }
    var starters = [];
    for (var c = 0; c < Math.min(limit, items.length); c++) starters.push(next());
    return Promise.all(starters).then(function () { return out; });
  }

  function enrichPlacesCongestionWithNaver(places, maxCount) {
    if (!places || !places.length || !isNaverSearchConfigured()) return Promise.resolve(places);
    var limit = maxCount != null ? maxCount : 12;
    var targets = places.slice(0, limit);
    return mapWithConcurrency(targets, 3, function (p) {
      return fetchNaverLocalSearch(p.name, 'comment').then(function (nr) {
        var base = scoreCongestionOsm(p);
        if (nr && nr.total != null) {
          var boost = Math.min(40, Math.log10(nr.total + 1) * 20);
          var div = getCategoryScoreDivisor(p.typeKey) || 1;
          p._congestionScore = Math.max(0, Math.min(100, base + boost / div));
          p._naverTotal = nr.total;
        } else {
          p._congestionScore = base;
        }
        return p;
      });
    }).then(function () { return places; });
  }

  var DAY_ALIASES = {
    mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 0,
    mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0
  };

  function parseDayToken(tok) {
    tok = String(tok || '').toLowerCase().replace(/\./g, '');
    return DAY_ALIASES[tok];
  }

  function expandDayRange(a, b) {
    var out = [];
    if (a == null || b == null) return out;
    var cur = a;
    for (var n = 0; n < 7; n++) {
      out.push(cur);
      if (cur === b) break;
      cur = (cur + 1) % 7;
    }
    return out;
  }

  function parseTimeToMin(hhmm) {
    var m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var mi = parseInt(m[2], 10);
    if (h > 24 || mi > 59) return null;
    return Math.min(24 * 60, h * 60 + mi);
  }

  function parseOpeningHours(ohRaw) {
    var oh = String(ohRaw || '').trim();
    if (!oh) return { unknown: true };
    var lower = oh.toLowerCase();
    if (lower === '24/7') return { alwaysOpen: true };
    if (lower === 'closed' || lower === 'off' || lower === 'permanently closed') return { closed: true };
    var rules = [];
    var parts = oh.split(';');
    for (var pi = 0; pi < parts.length; pi++) {
      var part = parts[pi].trim();
      if (!part) continue;
      if (/^ph\b/i.test(part)) continue;
      if (/^(closed|off)$/i.test(part)) {
        rules.push({ days: null, closed: true });
        continue;
      }
      var rm = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?(?:,[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)\s+(.+)$/);
      if (!rm) continue;
      var dayPart = rm[1];
      var timePart = rm[2].trim();
      var days = [];
      dayPart.split(',').forEach(function (seg) {
        var ab = seg.split('-');
        var d0 = parseDayToken(ab[0]);
        var d1 = ab[1] ? parseDayToken(ab[1]) : d0;
        days = days.concat(expandDayRange(d0, d1));
      });
      if (/^(closed|off)$/i.test(timePart)) {
        rules.push({ days: days, closed: true });
        continue;
      }
      var tm = timePart.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (!tm) continue;
      var openMin = parseTimeToMin(tm[1]);
      var closeMin = parseTimeToMin(tm[2]);
      if (openMin == null || closeMin == null) continue;
      rules.push({ days: days, openMin: openMin, closeMin: closeMin });
    }
    if (!rules.length) return { unknown: true };
    return { rules: rules };
  }

  function isOpenAtParsed(parsed, dayOfWeek, minuteOfDay) {
    if (!parsed || parsed.unknown) return null;
    if (parsed.alwaysOpen) return true;
    if (parsed.closed) return false;
    var matched = false;
    var open = false;
    for (var i = 0; i < parsed.rules.length; i++) {
      var r = parsed.rules[i];
      if (r.days && r.days.indexOf(dayOfWeek) === -1) continue;
      matched = true;
      if (r.closed) { open = false; continue; }
      if (r.closeMin <= r.openMin) {
        if (minuteOfDay >= r.openMin || minuteOfDay < r.closeMin) open = true;
      } else if (minuteOfDay >= r.openMin && minuteOfDay < r.closeMin) {
        open = true;
      }
    }
    if (!matched) return null;
    return open;
  }

  function getPlanDateForHours() {
    if (fourDayForecast && fourDayForecast[selectedForecastDayIndex] && fourDayForecast[selectedForecastDayIndex].date) {
      var d = fourDayForecast[selectedForecastDayIndex].date;
      if (typeof d === 'string') return new Date(d + 'T12:00:00');
      if (d instanceof Date) return d;
    }
    return new Date();
  }

  function isOpenDuringSlot(tags, startMin, endMin) {
    if (!tags || !tags.opening_hours) return true;
    var parsed = parseOpeningHours(tags.opening_hours);
    if (parsed.unknown || parsed.alwaysOpen) return true;
    if (parsed.closed) return false;
    var date = getPlanDateForHours();
    var dow = date.getDay();
    var checkPoints = [startMin, Math.floor((startMin + endMin) / 2)];
    if (endMin - startMin > 15) checkPoints.push(Math.max(startMin, endMin - 10));
    for (var i = 0; i < checkPoints.length; i++) {
      if (isOpenAtParsed(parsed, dow, checkPoints[i] % (24 * 60)) === false) return false;
    }
    return true;
  }

  var INDOOR_TYPE_KEYS = ['museum', 'gallery', 'mall', 'cafe', 'ice_cream', 'restaurant', 'fast_food', 'bar'];
  var OUTDOOR_TYPE_KEYS = ['park', 'theme_park', 'attraction'];

  function preferIndoorForTheme(theme) {
    return theme === 'rain' || theme === 'dust' || theme === 'fog';
  }

  function sortPoolByWeather(pool, theme) {
    if (!pool || !pool.length || !preferIndoorForTheme(theme)) return pool.slice();
    return pool.slice().sort(function (a, b) {
      var ai = INDOOR_TYPE_KEYS.indexOf(a.typeKey) !== -1 ? 1 : 0;
      var bi = INDOOR_TYPE_KEYS.indexOf(b.typeKey) !== -1 ? 1 : 0;
      var ao = OUTDOOR_TYPE_KEYS.indexOf(a.typeKey) !== -1 ? 1 : 0;
      var bo = OUTDOOR_TYPE_KEYS.indexOf(b.typeKey) !== -1 ? 1 : 0;
      return (bi - ai) || (ao - bo);
    });
  }

  function haversineKm(a, b) {
    var R = 6371;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLon = (b.lon - a.lon) * Math.PI / 180;
    var lat1 = a.lat * Math.PI / 180;
    var lat2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function estimateTravelMinutes(from, to, profile) {
    var km = haversineKm(from, to);
    var speed = profile === 'driving' ? 25 : 4.5;
    return Math.max(3, Math.ceil((km / speed) * 60));
  }

  function applyTravelTimesToPlan(plan, dayStartMin, dayEndMin) {
    if (!plan || plan.length === 0) return Promise.resolve({ plan: plan, overrun: false });
    var profile = getTransportProfile();
    var stays = plan.map(function (p) {
      var raw = timeToMinutes(p.timeEnd) - timeToMinutes(p.timeStart);
      if (isNaN(raw) || raw < 0) raw = 15;
      // overrun으로 이미 줄인 체류는 다시 15분으로 부풀리지 않음
      if (p && p._overrunShortened) return Math.max(0, raw);
      return Math.max(15, raw);
    });
    var coords = plan.map(function (p) { return { lat: p.lat, lon: p.lon }; });

    function rebuild(travelMins) {
      var tCur = dayStartMin;
      var overrun = false;
      for (var i = 0; i < plan.length; i++) {
        if (i > 0) {
          var move = travelMins[i] != null ? travelMins[i] : 8;
          plan[i].travelFromPrevMin = move;
          tCur += move;
        } else {
          plan[i].travelFromPrevMin = 0;
        }
        var stay = stays[i];
        var endT = tCur + stay;
        if (dayEndMin != null && endT > dayEndMin) {
          overrun = true;
          var rem = dayEndMin - tCur;
          if (rem <= 0) {
            stay = 0;
            endT = tCur;
          } else {
            stay = rem;
            endT = tCur + stay;
          }
          plan[i]._overrunShortened = true;
        }
        plan[i].timeStart = minutesToTime(tCur);
        plan[i].timeEnd = minutesToTime(endT);
        tCur = endT;
      }
      return { plan: plan, overrun: overrun };
    }

    if (plan.length < 2) return Promise.resolve(rebuild([]));

    return osrmTable(coords, profile).then(function (data) {
      var travelMins = [0];
      for (var i = 1; i < plan.length; i++) {
        var sec = data && data.durations && data.durations[i - 1] ? data.durations[i - 1][i] : null;
        if (sec != null && !isNaN(sec) && sec >= 0) travelMins[i] = Math.max(2, Math.ceil(sec / 60));
        else travelMins[i] = estimateTravelMinutes(coords[i - 1], coords[i], profile);
      }
      return rebuild(travelMins);
    }).catch(function () {
      var travelMins = [0];
      for (var j = 1; j < plan.length; j++) {
        travelMins[j] = estimateTravelMinutes(coords[j - 1], coords[j], profile);
      }
      return rebuild(travelMins);
    });
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

  function pickQualityReplacement(pool, allPlaces, slotType, used, tier, effectiveCongestion) {
    var base = (pool && pool.length) ? pool : (allPlaces || []);
    var sorted = sortPoolByPriceTier(base, slotType, tier).filter(function (p) {
      return p && !used.has(p.name) && !isBadPlaceName(p.name) && !isOsmPlaceClosed(p.tags) && !isOsmLowRated(p.tags);
    });
    var preferred = sorted.filter(function (p) {
      return congestionMatchesPreference(getCongestion(p).level, effectiveCongestion);
    });
    return (preferred.length ? preferred : sorted).slice(0, 10);
  }

  async function ensurePlanPlaceQuality(plan, pools, allPlaces, tier, effectiveCongestion) {
    if (!plan || !plan.length) return plan;
    var used = new Set(plan.map(function (p) { return p.name; }));
    var typeToPoolIndex = { restaurant: 0, cafe: 1, activity: 2, park: 3 };
    var out = plan.slice();

    for (var i = 0; i < out.length; i++) {
      var item = out[i];
      if (!item || isBadPlaceName(item.name) || isOsmPlaceClosed(item.tags) || isOsmLowRated(item.tags)) {
        item._needsReplace = true;
      } else if (item.typeKey === 'park') {
        item._needsReplace = false;
      } else if (isNaverSearchConfigured()) {
        var naver = await fetchNaverLocalSearch(item.name, 'comment');
        // API 실패(null)면 제외하지 않음. 성공했는데 매칭 없거나 리뷰가 매우 나쁘면 교체
        if (naver != null && (!naverResultMatchesPlace(naver, item.name) || naverResultLooksVeryBad(naver))) {
          item._needsReplace = true;
        }
      }
    }

    for (var j = 0; j < out.length; j++) {
      if (!out[j] || !out[j]._needsReplace) {
        if (out[j]) {
          delete out[j]._needsReplace;
        }
        continue;
      }
      var slotType = getPoolIndexAndSlotType(out[j].typeKey || 'restaurant').slotTypeKey;
      var poolIdx = typeToPoolIndex[slotType] != null ? typeToPoolIndex[slotType] : 0;
      var candidates = pickQualityReplacement(pools[poolIdx], allPlaces, slotType, used, tier, effectiveCongestion);
      var replaced = null;
      for (var c = 0; c < candidates.length; c++) {
        var cand = candidates[c];
        if (cand.typeKey === 'park') {
          replaced = cand;
          break;
        }
        if (!isNaverSearchConfigured()) {
          replaced = cand;
          break;
        }
        var nr = await fetchNaverLocalSearch(cand.name, 'comment');
        if (nr == null) {
          // 검색 API 오류면 일단 후보 허용
          replaced = cand;
          break;
        }
        if (naverResultMatchesPlace(nr, cand.name) && !naverResultLooksVeryBad(nr)) {
          replaced = cand;
          break;
        }
      }
      if (replaced) {
        used.delete(out[j].name);
        used.add(replaced.name);
        out[j] = {
          name: replaced.name,
          type: replaced.type,
          typeKey: replaced.typeKey || 'place',
          lat: replaced.lat,
          lon: replaced.lon,
          addr: replaced.addr,
          tags: replaced.tags,
          timeStart: out[j].timeStart,
          timeEnd: out[j].timeEnd,
          congestion: getCongestion(replaced),
        };
      } else {
        // 대체할 곳이 없으면 일정에서 제거 (나쁜 장소는 절대 유지하지 않음)
        used.delete(out[j].name);
        out[j] = null;
      }
    }
    return out.filter(function (p) { return !!p; });
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
    if (timeStr == null || timeStr === '') return 0;
    var parts = String(timeStr).split(':').map(Number);
    var h = parts[0];
    var m = parts[1];
    if (isNaN(h)) h = 0;
    if (isNaN(m)) m = 0;
    return h * 60 + m;
  }

  function minutesToTime(min) {
    if (min == null || isNaN(min)) min = 0;
    min = Math.max(0, Math.round(Number(min)));
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
    requestLocationConsentThen(function () {
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
    });
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

    // 바로 앞 칸과 같은 종류가 연속되지 않게 바꿈. 식당 다음이 항상 카페로 고정되지 않음
    for (var di = 1; di < currentOrder.length; di++) {
      if (currentOrder[di] !== currentOrder[di - 1]) continue;
      var options = slotTypesAvoiding(currentOrder[di - 1], di, null);
      var pickT = options[0];
      for (var oi = 0; oi < options.length; oi++) {
        if (currentOrder.indexOf(options[oi]) === -1) {
          pickT = options[oi];
          break;
        }
      }
      currentOrder[di] = pickT;
      var removedIdx = removed.indexOf(pickT);
      if (removedIdx !== -1) removed.splice(removedIdx, 1);
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

    // 3단계: 총 시간을 넘기면(여유 P 포함) 스케일 조정
    if (need > totalMin && currentOrder.length > 0) {
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

  function countPlacesBySlot(allPlaces) {
    var counts = { restaurant: 0, cafe: 0, activity: 0, park: 0 };
    for (var i = 0; i < allPlaces.length; i++) {
      var slot = getPoolIndexAndSlotType(allPlaces[i].typeKey || 'restaurant').slotTypeKey;
      if (counts[slot] != null) counts[slot]++;
    }
    return counts;
  }

  function buildPlanIssueReasons(opts) {
    var reasons = [];
    var slotLabels = {
      restaurant: t('courseTypeRestaurant'),
      cafe: t('courseTypeCafe'),
      activity: t('courseTypeActivity'),
      park: t('courseTypePark'),
    };
    if (opts.removed && opts.removed.length) {
      reasons.push(opts.mbtiPJ === 'P' ? t('reasonTimeTooShortA') : t('reasonTimeTooShort'));
    }
    if (opts.budgetExcluded) {
      reasons.push(t('reasonBudgetLow'));
    }
    if (opts.missingTypes && opts.missingTypes.length) {
      reasons.push(t('reasonMissingTypes'));
      for (var i = 0; i < opts.missingTypes.length; i++) {
        var label = slotLabels[opts.missingTypes[i]] || opts.missingTypes[i];
        reasons.push('- ' + t('reasonMissingTypeItem').replace('%s', label));
      }
    }
    if (opts.congestionFallback) {
      reasons.push(t('reasonCongestionStrict'));
    }
    if (opts.substituted && opts.substituted.length) {
      reasons.push(t('reasonSubstituted'));
    }
    if (opts.partialPlan) {
      reasons.push(t('reasonPartialPlan'));
    }
    return reasons;
  }

  function showPlanIssues(reasons) {
    // 치명적이지 않은 안내는 결과 화면 요약에 이미 보이므로 alert는 생략
    if (!reasons || !reasons.length) return;
  }

  function haversineMeters(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 99999;
    return haversineKm(
      { lat: a.lat, lon: a.lon != null ? a.lon : a.lng },
      { lat: b.lat, lon: b.lon != null ? b.lon : b.lng }
    ) * 1000;
  }

  function namePrefixKey(name) {
    return String(name || '').replace(/\s+/g, '').slice(0, 4).toLowerCase();
  }

  function scorePlaceCandidate(place, ctx) {
    if (!place) return -1e9;
    if (isWeakPlaceCandidate(place)) return -1e9;
    var score = 0;
    var cong = (place._congestionScore != null) ? place._congestionScore : scoreCongestionOsm(place);
    score += cong * 0.55;

    var tier = ctx.tier || 'normal';
    var placeTier = inferPlacePriceTier(place);
    if (placeTier === tier) score += 18;
    else if (placeTier === 'normal' || tier === 'normal') score += 6;
    else score -= 8;

    var theme = ctx.theme;
    if (preferIndoorForTheme(theme)) {
      if (INDOOR_TYPE_KEYS.indexOf(place.typeKey) !== -1) score += 26;
      if (OUTDOOR_TYPE_KEYS.indexOf(place.typeKey) !== -1) score -= 36;
    } else if (theme === 'fine') {
      if (place.typeKey === 'park' || place.typeKey === 'attraction') score += 12;
      if (place.typeKey === 'mall') score -= 4;
    }

    if (place.tags && place.tags.opening_hours) score += 14;
    else score -= 6;
    if (place.tags && (place.tags.wikipedia || place.tags.wikidata)) score += 6;
    if (place.addr && String(place.addr).length > 4) score += 5;
    if (isOsmDataStale(place.tags)) score -= 16;

    var prev = ctx.prev;
    if (prev) {
      var meters = haversineMeters(prev, place);
      var profile = ctx.transportProfile || 'walk';
      var travelEst = estimateTravelMinutes(
        { lat: prev.lat, lon: prev.lon != null ? prev.lon : prev.lng },
        { lat: place.lat, lon: place.lon },
        profile
      );
      if (meters < 70) score -= 45;
      else if (meters < 320) score += 18;
      else if (meters < 900) score += 12;
      else if (meters < 1600) score += 4;
      else if (meters > 3200) score -= 22;

      if (travelEst <= 8) score += 10;
      else if (travelEst <= 15) score += 5;
      else if (travelEst >= 28) score -= 14;

      var prevSlot = getPoolIndexAndSlotType(prev.typeKey || 'restaurant').slotTypeKey;
      var curSlot = getPoolIndexAndSlotType(place.typeKey || 'restaurant').slotTypeKey;
      if (prevSlot === curSlot) score -= 18;

      if (namesTooSimilar(prev.name, place.name)) score -= 28;
    }

    if (ctx.usedPrefixes && ctx.usedPrefixes[namePrefixKey(place.name)]) score -= 16;
    if (ctx.usedNames) {
      for (var ui = 0; ui < ctx.usedNames.length; ui++) {
        if (namesTooSimilar(ctx.usedNames[ui], place.name)) { score -= 22; break; }
      }
    }

    var sk = streetKeyOf(place);
    if (sk && ctx.usedStreets && ctx.usedStreets[sk]) score -= 24;
    var gk = gridKeyOf(place);
    if (gk && ctx.usedGrids && ctx.usedGrids[gk]) score -= 20;
    // 인접 격자 몰림
    if (gk && ctx.usedGrids) {
      var parts = gk.split('x');
      var gx = parseInt(parts[0], 10);
      var gy = parseInt(parts[1], 10);
      if (!isNaN(gx) && !isNaN(gy)) {
        for (var dx = -1; dx <= 1; dx++) {
          for (var dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            if (ctx.usedGrids[(gx + dx) + 'x' + (gy + dy)]) score -= 8;
          }
        }
      }
    }

    if (ctx.usedSlots) {
      var slot = getPoolIndexAndSlotType(place.typeKey || 'restaurant').slotTypeKey;
      if (ctx.usedSlots[slot] >= 1) score -= 10;
    }

    // 시작점 기준으로 너무 바깥쪽만 몰리지 않게
    if (ctx.center) {
      var fromCenter = haversineMeters(ctx.center, { lat: place.lat, lon: place.lon });
      if (fromCenter < (ctx.radiusMeters || 1500) * 0.85) score += 4;
      else if (fromCenter > (ctx.radiusMeters || 1500) * 1.05) score -= 8;
    }

    return score;
  }

  function rankCandidates(list, ctx) {
    return list.slice().sort(function (a, b) {
      return scorePlaceCandidate(b, ctx) - scorePlaceCandidate(a, ctx);
    });
  }

  var recentCourseNames = [];

  function rememberPlanNames(plan) {
    if (!plan || !plan.length) return;
    for (var i = 0; i < plan.length; i++) {
      var key = normalizePlaceNameForMatch(plan[i] && plan[i].name);
      if (!key) continue;
      var idx = recentCourseNames.indexOf(key);
      if (idx !== -1) recentCourseNames.splice(idx, 1);
      recentCourseNames.unshift(key);
    }
    if (recentCourseNames.length > 30) recentCourseNames.length = 30;
  }

  function preferFreshCandidates(list) {
    if (!list || list.length < 2 || !recentCourseNames.length) return list || [];
    var fresh = list.filter(function (place) {
      return recentCourseNames.indexOf(normalizePlaceNameForMatch(place && place.name)) === -1;
    });
    if (fresh.length) return fresh;
    return list.slice().sort(function (a, b) {
      var ia = recentCourseNames.indexOf(normalizePlaceNameForMatch(a && a.name));
      var ib = recentCourseNames.indexOf(normalizePlaceNameForMatch(b && b.name));
      if (ia < 0) ia = 999;
      if (ib < 0) ib = 999;
      return ib - ia;
    });
  }

  function buildPlanWhyItems(opts) {
    var items = [];
    if (opts.usedFallback) items.push(t('whyFallback'));
    if (opts.weatherIndoorBias) items.push(t('whyIndoor'));
    else if (opts.weatherOutdoorBias) items.push(t('whyOutdoor'));
    if (opts.totalTravelMin != null && opts.totalTravelMin > 0) {
      items.push(t('whyTravel').replace('%s', String(opts.totalTravelMin)));
    }
    if (opts.routeOptimized) items.push(t('whyRoute'));
    if (opts.congestionPref && opts.congestionPref !== 'normal') items.push(t('whyCongestion'));
    if (opts.budgetUsed) items.push(t('whyBudget'));
    if (opts.diversified) items.push(t('whyDiversity'));
    if (opts.streetSpread) items.push(t('whyStreetSpread'));
    if (opts.hoursRelaxed) items.push(t('whyHoursRelaxed'));
    else if (opts.hoursFiltered) items.push(t('whyHours'));
    items.push(t('tipVerify'));
    return items;
  }

  function buildEmergencyFallbackPlan(ctx) {
    var allPlaces = (ctx.allPlaces || []).filter(function (p) { return !isWeakPlaceCandidate(p); });
    if (!allPlaces.length) return { plan: [], substituted: [], usedFallback: true };
    var order = (ctx.finalOrder && ctx.finalOrder.length) ? ctx.finalOrder.slice() : ['restaurant', 'cafe', 'activity'];
    var durations = ctx.slotDurations || order.map(function () { return 70; });
    var plan = [];
    var used = {};
    var usedPrefixes = {};
    var usedStreets = {};
    var usedGrids = {};
    var usedSlots = {};
    var usedNames = [];
    var substituted = [];
    var tMin = ctx.start || 12 * 60;
    var endLimit = ctx.end != null ? ctx.end : tMin + 360;
    var typeToPoolIndex = { restaurant: 0, cafe: 1, activity: 2, park: 3 };
    var pools = ctx.pools || [];

    for (var i = 0; i < order.length; i++) {
      var slotType = order[i];
      var prevType = plan.length ? placeSlotType(plan[plan.length - 1]) : null;
      var typeTryOrder = slotTypesAvoiding(prevType, i, slotType !== prevType ? slotType : null);
      var scoreCtx = {
        tier: ctx.tier || 'normal',
        theme: ctx.theme,
        prev: plan.length ? plan[plan.length - 1] : null,
        center: ctx.center,
        radiusMeters: ctx.radiusMeters || 1500,
        usedPrefixes: usedPrefixes,
        usedStreets: usedStreets,
        usedGrids: usedGrids,
        usedSlots: usedSlots,
        usedNames: usedNames,
        transportProfile: ctx.transportProfile || 'walk'
      };
      var available = [];
      for (var ti = 0; ti < typeTryOrder.length && !available.length; ti++) {
        var tryIdx = typeToPoolIndex[typeTryOrder[ti]];
        var tryPool = (pools[tryIdx] && pools[tryIdx].length) ? pools[tryIdx] : [];
        if (!tryPool.length) continue;
        available = rankCandidates(tryPool.filter(function (p) {
          return !used[p.name] && !isWeakPlaceCandidate(p);
        }), scoreCtx);
      }
      if (!available.length) {
        available = excludePreviousCategory(rankCandidates(allPlaces.filter(function (p) {
          return !used[p.name] && !isWeakPlaceCandidate(p);
        }), scoreCtx), prevType);
      }
      available = preferFreshCandidates(available);
      var pick = available[0];
      if (!pick) continue;
      used[pick.name] = true;
      usedPrefixes[namePrefixKey(pick.name)] = true;
      usedNames.push(pick.name);
      var sk = streetKeyOf(pick);
      var gk = gridKeyOf(pick);
      if (sk) usedStreets[sk] = true;
      if (gk) usedGrids[gk] = true;
      var gotSlot = getPoolIndexAndSlotType(pick.typeKey || 'restaurant').slotTypeKey;
      usedSlots[gotSlot] = (usedSlots[gotSlot] || 0) + 1;
      if (gotSlot !== slotType) substituted.push({ wanted: slotType, got: gotSlot });
      var remaining = endLimit - tMin;
      if (remaining < 20) break;
      var dur = Math.min(durations[i] || 70, remaining);
      var endT = tMin + dur;
      plan.push({
        name: pick.name,
        type: pick.type,
        typeKey: pick.typeKey || 'place',
        lat: pick.lat,
        lon: pick.lon,
        addr: pick.addr,
        tags: pick.tags,
        timeStart: minutesToTime(tMin),
        timeEnd: minutesToTime(endT),
        congestion: getCongestion(pick),
        estimatedCostWon: estimatePlaceCostWon(pick, ctx.tier || 'normal'),
        pickWhy: [t('whyFallback')].slice(0, 1)
      });
      tMin = endT;
    }
    return { plan: plan, substituted: substituted, usedFallback: true };
  }

  var SLOT_TYPE_CYCLE = ['activity', 'park', 'cafe', 'restaurant'];

  function placeSlotType(place) {
    return getPoolIndexAndSlotType((place && place.typeKey) || 'restaurant').slotTypeKey;
  }

  function slotTypesAvoiding(prevType, index, preferred) {
    var types = SLOT_TYPE_CYCLE.filter(function (typeName) { return typeName !== prevType; });
    var rot = Math.abs(index || 0) % types.length;
    types = types.slice(rot).concat(types.slice(0, rot));
    if (preferred && preferred !== prevType) {
      types = [preferred].concat(types.filter(function (typeName) { return typeName !== preferred; }));
    }
    return types;
  }

  function excludePreviousCategory(list, prevType) {
    if (!list || !list.length) return [];
    if (!prevType) return list;
    return list.filter(function (place) { return placeSlotType(place) !== prevType; });
  }

  function totalTravelMinutes(plan) {
    if (!plan || !plan.length) return 0;
    var sum = 0;
    for (var i = 0; i < plan.length; i++) {
      if (plan[i].travelFromPrevMin) sum += plan[i].travelFromPrevMin;
    }
    return sum;
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

  function getPlanNameInputValue() {
    var el = $('planNameInput');
    if (!el) return '';
    return String(el.value || '').trim();
  }

  function getPlanDisplayTitle(title) {
    var name = title != null ? String(title).trim() : '';
    return name || t('planCardTitle');
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

  function setAdvancedDetailsOpen(open) {
    var body = $('advancedSectionBody');
    var btn = $('btnToggleDetails');
    if (body) {
      if (window.matchMedia && window.matchMedia('(min-width: 601px)').matches) {
        body.hidden = false;
      } else {
        body.hidden = !open;
      }
    }
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) refreshMainMapAfterShow();
  }

  function bindMobileChromeHandlers() {
    var dockCourse = $('btnMobileDockCourse');
    var dockResult = $('btnMobileDockResult');
    var toggleDetails = $('btnToggleDetails');
    if (dockCourse) {
      dockCourse.addEventListener('click', function () {
        openDetailedSettings();
      });
    }
    if (dockResult) {
      dockResult.addEventListener('click', function () {
        goToMyPlansPanel();
      });
    }
    if (toggleDetails) {
      toggleDetails.addEventListener('click', function () {
        var body = $('advancedSectionBody');
        var open = body ? body.hidden : false;
        setAdvancedDetailsOpen(open);
      });
    }
    var closePlans = $('btnCloseMobilePlans');
    if (closePlans) closePlans.addEventListener('click', closeMobilePlansPanel);
    var plansPanel = $('mobilePlansPanel');
    if (plansPanel) {
      plansPanel.addEventListener('click', function (e) {
        if (e.target === plansPanel) closeMobilePlansPanel();
      });
    }
  }

  function createPlanCardElement(item) {
    var card = document.createElement('div');
    card.className = 'plan-card';
    card.setAttribute('data-plan-id', item.id);
    card.innerHTML =
      '<div class="plan-card-info">' +
        '<span class="plan-card-title">' + escapeHtml(getPlanDisplayTitle(item.title)) + '</span>' +
        '<span class="plan-card-time">' + escapeHtml((item.start || '') + ' ~ ' + (item.end || '')) + '</span>' +
      '</div>' +
      '<div class="plan-card-actions">' +
        '<button type="button" class="btn btn-edit" data-action="edit" title="' + escapeHtml(t('btnEdit')) + '">' + escapeHtml(t('btnEdit')) + '</button>' +
        '<button type="button" class="btn btn-delete" data-action="delete" title="' + escapeHtml(t('btnDelete')) + '">' + escapeHtml(t('btnDelete')) + '</button>' +
      '</div>';
    card.querySelector('.plan-card-info').addEventListener('click', function () {
      showSavedPlan(item.id);
      closeMobilePlansPanel();
    });
    card.querySelector('[data-action="edit"]').addEventListener('click', function (e) {
      e.stopPropagation();
      editSavedPlanName(item.id);
      renderMobilePlansPanel();
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', function (e) {
      e.stopPropagation();
      deleteSavedPlan(item.id);
      renderMobilePlansPanel();
    });
    return card;
  }

  function renderMobilePlansPanel() {
    var list = $('mobilePlansList');
    var empty = $('mobilePlansEmpty');
    if (!list || !empty) return;
    list.innerHTML = '';
    if (!savedPlans.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    savedPlans.forEach(function (item) {
      list.appendChild(createPlanCardElement(item));
    });
  }

  function openMobilePlansPanel() {
    var panel = $('mobilePlansPanel');
    if (!panel) return;
    renderMobilePlansPanel();
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-plans-open');
  }

  function closeMobilePlansPanel() {
    var panel = $('mobilePlansPanel');
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-plans-open');
  }

  function goToMyPlansPanel() {
    // 모바일: 전용 계획표 UI / 데스크톱: 상세 설정의 계획표로 이동
    if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) {
      openMobilePlansPanel();
      return;
    }
    if (advancedSection) {
      advancedSection.hidden = false;
      setAdvancedDetailsOpen(true);
    }
    var plansCard = document.querySelector('.plans-card') || $('plansArea') || $('cardPlansTitle');
    setTimeout(function () {
      if (plansCard) {
        plansCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      refreshMainMapAfterShow();
    }, 80);
  }

  function updateMobileDockForResult(hasResult) {
    var dockResult = $('btnMobileDockResult');
    // 내 계획표는 항상 노출
    if (dockResult) dockResult.hidden = false;
  }

  function syncTimePresetHighlight() {
    var group = $('timePresetGroup');
    if (!group || !startTime || !endTime) return;
    var key = (startTime.value || '') + '-' + (endTime.value || '');
    var match = { '12:00-15:00': 'lunch', '17:00-21:00': 'dinner', '11:00-20:00': 'day' }[key] || '';
    group.querySelectorAll('[data-time-preset]').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-time-preset') === match);
    });
  }

  function bindTimePresetChips() {
    var group = $('timePresetGroup');
    if (!group || group.getAttribute('data-bound') === '1') return;
    group.setAttribute('data-bound', '1');
    var ranges = { lunch: ['12:00', '15:00'], dinner: ['17:00', '21:00'], day: ['11:00', '20:00'] };
    group.querySelectorAll('[data-time-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var range = ranges[btn.getAttribute('data-time-preset')];
        if (!range || !startTime || !endTime) return;
        startTime.value = range[0];
        endTime.value = range[1];
        syncTimePresetHighlight();
      });
    });
    if (startTime) {
      startTime.addEventListener('input', syncTimePresetHighlight);
      startTime.addEventListener('change', syncTimePresetHighlight);
    }
    if (endTime) {
      endTime.addEventListener('input', syncTimePresetHighlight);
      endTime.addEventListener('change', syncTimePresetHighlight);
    }
    syncTimePresetHighlight();
  }

  function openDetailedSettings() {
    if (advancedSection) {
      advancedSection.hidden = false;
      setAdvancedDetailsOpen(true);
      refreshMainMapAfterShow();
      setTimeout(function () {
        advancedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        refreshMainMapAfterShow();
      }, 80);
    }
    if (mapHint) mapHint.textContent = isQuickRegionPick() ? t('mapHintPick') : t('mapHintDefault');
  }

  function runQuickCourse() {
    // 하위 호환: 더 이상 CTA에서 쓰지 않음. 상세 설정 연 뒤 일정 만들기로 생성.
    openDetailedSettings();
  }

  function generatePlan() {
    var pendingQuery = searchInput && searchInput.value.trim();
    if (pendingQuery) {
      if (advancedSection && advancedSection.hidden) {
        advancedSection.hidden = false;
        setAdvancedDetailsOpen(true);
        refreshMainMapAfterShow();
      }
      searchPlaceQuery(pendingQuery, function (center) {
        if (!center) return;
        doGeneratePlan(center);
      });
      return;
    }
    if (isQuickRegionPick()) {
      var center = getSearchCenter();
      if (!center) {
        showError(t('errNoLocation'));
        return;
      }
      doGeneratePlan(center);
      return;
    }
    // 이미 위치가 있으면 다시 묻지 않고 바로 생성
    var existing = getSearchCenter();
    if (existing) {
      doGeneratePlan(existing);
      return;
    }
    requestLocationConsentThen(function () {
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
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  var planGenerating = false;

  function doGeneratePlan(center) {
    if (!center || !startTime || !endTime || !radiusSelect) return;
    if (planGenerating) return;
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
    planGenerating = true;
    if (loading) {
      showLoadingOverlay();
    }
    if (resultSection) resultSection.hidden = true;

    (async function () {
      try {
        setLoadingProgress(8, 'loadingText', 'loadingSubSearch');
        startLoadingProgressDrift(8, 52, 6000);
        overpassQuery._usedStaleCache = false;
        var elements = await overpassQuery(center, radiusMeters);
        var usedStalePlaceCache = !!overpassQuery._usedStaleCache;
        if (loadingProgressTimer) { clearInterval(loadingProgressTimer); loadingProgressTimer = null; }
        setLoadingProgress(58, 'loadingTextBuild', 'loadingSubBuild');
        var allPlaces = parseElements(elements);
        if (allPlaces.length === 0) {
          hideLoadingOverlay();
          showError(t('errNoPlaces') + '\n' + t('errNoPlacesHint'));
          return;
        }
        var restaurants = allPlaces.filter(function (p) { return ['restaurant', 'fast_food', 'bar'].indexOf(p.typeKey) !== -1; });
        var cafes = allPlaces.filter(function (p) { return p.typeKey === 'cafe' || p.typeKey === 'ice_cream'; });
        var activities = allPlaces.filter(function (p) { return ['museum', 'gallery', 'theme_park', 'attraction', 'mall'].indexOf(p.typeKey) !== -1; });
        var parks = allPlaces.filter(function (p) { return p.typeKey === 'park'; });
        var typeCounts = countPlacesBySlot(allPlaces);
        var typeOrder = getQuickCourseOrder();
        var requestedOrderBeforeBudget = (function () {
          var mode = (document.querySelector('input[name="quickCourseOrderMode"]:checked') || {}).value || 'random';
          if (mode === 'custom') {
            var s1 = $('courseOrder1'); var s2 = $('courseOrder2'); var s3 = $('courseOrder3'); var s4 = $('courseOrder4');
            if (s1 && s2 && s3 && s4) {
              return [s1.value, s2.value, s3.value, s4.value].filter(function (v) { return v && v !== 'skip'; });
            }
          }
          return DEFAULT_COURSE_ORDER.slice();
        })();
        var budget = getBudgetWon();
        var fullOrder = ['restaurant', 'cafe', 'activity', 'park'];
        var budgetExcluded = budget != null && budget > 0 && typeOrder.length < Math.min(fullOrder.length, requestedOrderBeforeBudget.length || fullOrder.length);
        var missingTypes = [];
        for (var mi = 0; mi < typeOrder.length; mi++) {
          if ((typeCounts[typeOrder[mi]] || 0) < 1) missingTypes.push(typeOrder[mi]);
        }
        var pools = [
          restaurants.length ? restaurants : [],
          cafes.length ? cafes : [],
          activities.length ? activities : [],
          parks.length ? parks : [],
        ];
        var mbtiPJ = getMbtiPJ();
        var mbtiIE = getMbtiIE();
        var effectiveCongestion = (mbtiIE === 'I') ? 'relaxed' : ((mbtiIE === 'E') ? 'busy' : getCongestionPreference());
        var weatherThemeForPlan = getWeatherThemeForPlan();
        var weatherIndoorBias = preferIndoorForTheme(weatherThemeForPlan);
        var hoursSkipped = false;
        var totalMin = end - start;
        var tierForSlots = getPriceTier();
        var slotResult = computeSlotsAndDurations(typeOrder, totalMin, { generous: mbtiPJ === 'P', priceTier: tierForSlots });
        var finalOrder = slotResult.order;
        var slotDurations = slotResult.durations;
        var removed = slotResult.removed;

        // 예상 인당 비용: 실제 고른 장소 유형·OSM 태그 기준으로 합산
        var tier = getPriceTier();
        var estimatedCostWon = 0;
        var plan = [];
        var used = new Set();
        var substituted = [];
        var congestionFallback = false;
        var typeToPoolIndex = { restaurant: 0, cafe: 1, activity: 2, park: 3 };
        var slotTypeLabelKeys = { restaurant: 'courseTypeRestaurant', cafe: 'courseTypeCafe', activity: 'courseTypeActivity', park: 'courseTypePark' };
        var tMin = start;

        // 슬롯별 후보 상위권에 OSM+네이버 인기도 신호 보강 (최대 12곳)
        var shortlistForCongestion = [];
        for (var si = 0; si < finalOrder.length; si++) {
          var sType = finalOrder[si];
          var sIdx = typeToPoolIndex[sType] !== undefined ? typeToPoolIndex[sType] : 0;
          var sPool = pools[sIdx] && pools[sIdx].length ? pools[sIdx] : allPlaces;
          var sSorted = sortPoolByWeather(sortPoolByPriceTier(sPool, sType, tier), weatherThemeForPlan);
          shortlistForCongestion = shortlistForCongestion.concat(sSorted.slice(0, 8));
        }
        var seenNames = {};
        shortlistForCongestion = shortlistForCongestion.filter(function (p) {
          if (!p || !p.name || seenNames[p.name]) return false;
          seenNames[p.name] = true;
          return true;
        });
        await enrichPlacesCongestionWithNaver(shortlistForCongestion, 12);

        var usedPrefixes = {};
        var usedStreets = {};
        var usedGrids = {};
        var usedSlots = {};
        var usedNames = [];
        var usedFallbackPlan = false;
        var routeOptimized = false;
        var transportProfile = getTransportProfile();
        for (var i = 0; i < finalOrder.length; i++) {
          var slotType = finalOrder[i];
          var dur = slotDurations[i] || 90;
          if (finalOrder[i] === 'restaurant') {
            var baseMaxPre = (mbtiPJ === 'P') ? 120 : 90;
            var hardMaxPre = (tier === 'expensive' && mbtiPJ === 'P') ? 150 : baseMaxPre;
            if (dur > hardMaxPre) dur = hardMaxPre;
          }
          var slotEnd = tMin + dur;
          var scoreCtx = {
            tier: tier,
            theme: weatherThemeForPlan,
            prev: plan.length ? plan[plan.length - 1] : null,
            center: { lat: center.lat, lon: center.lng != null ? center.lng : center.lon },
            radiusMeters: radiusMeters,
            usedPrefixes: usedPrefixes,
            usedStreets: usedStreets,
            usedGrids: usedGrids,
            usedSlots: usedSlots,
            usedNames: usedNames,
            transportProfile: transportProfile
          };
          function filterAvailable(list, useCongestion, requireHours) {
            return list.filter(function (p) {
              if (used.has(p.name) || isWeakPlaceCandidate(p)) return false;
              if (requireHours !== false && !isOpenDuringSlot(p.tags, tMin, slotEnd)) return false;
              if (useCongestion && !congestionMatchesPreference(getCongestion(p).level, effectiveCongestion)) return false;
              return true;
            });
          }
          var prevType = plan.length ? placeSlotType(plan[plan.length - 1]) : null;
          var typeTryOrder = slotTypesAvoiding(prevType, i, slotType !== prevType ? slotType : null);
          var available = [];
          for (var ti = 0; ti < typeTryOrder.length && !available.length; ti++) {
            var tryIdx = typeToPoolIndex[typeTryOrder[ti]];
            var tryPool = pools[tryIdx] && pools[tryIdx].length ? pools[tryIdx] : [];
            if (!tryPool.length) continue;
            var trySorted = sortPoolByWeather(sortPoolByPriceTier(tryPool, typeTryOrder[ti], tier), weatherThemeForPlan);
            var tryList = rankCandidates(filterAvailable(trySorted, true, true), scoreCtx);
            if (!tryList.length) {
              congestionFallback = true;
              tryList = rankCandidates(filterAvailable(trySorted, false, true), scoreCtx);
            }
            available = tryList;
          }
          if (!available.length) {
            usedFallbackPlan = true;
            hoursSkipped = true;
            available = excludePreviousCategory(rankCandidates(filterAvailable(allPlaces, false, false), scoreCtx), prevType);
          }
          if (!available.length) continue;
          available = preferFreshCandidates(available);
          // 같은 길·격자 몰림이면 2순위 후보 선호
          if (available.length > 1) {
            var spread = available.filter(function (p) {
              var sk = streetKeyOf(p);
              var gk = gridKeyOf(p);
              if (sk && usedStreets[sk]) return false;
              if (gk && usedGrids[gk]) return false;
              return true;
            });
            if (spread.length) available = spread;
          }
          var pick = available[0] || null;
          if (!pick) continue;
          used.add(pick.name);
          usedPrefixes[namePrefixKey(pick.name)] = true;
          usedNames.push(pick.name);
          var skPick = streetKeyOf(pick);
          var gkPick = gridKeyOf(pick);
          if (skPick) usedStreets[skPick] = true;
          if (gkPick) usedGrids[gkPick] = true;
          var pickSlotType = getPoolIndexAndSlotType(pick.typeKey || 'restaurant').slotTypeKey;
          usedSlots[pickSlotType] = (usedSlots[pickSlotType] || 0) + 1;
          if (pickSlotType !== slotType) {
            substituted.push({ wanted: slotType, got: pickSlotType });
          }
          if (finalOrder[i] === 'restaurant' || (pick.typeKey || 'place') === 'restaurant') {
            var baseMax = (mbtiPJ === 'P') ? 120 : 90;
            var hardMax = (tier === 'expensive' && mbtiPJ === 'P') ? 150 : baseMax;
            if (dur > hardMax) dur = hardMax;
          }
          var endT = tMin + dur;
          var congestion = getCongestion(pick);
          var placeCost = estimatePlaceCostWon(pick, tier);
          var whyBits = [];
          if (pick.tags && pick.tags.opening_hours) whyBits.push(t('placeWhyOpen'));
          if (plan.length && haversineMeters(plan[plan.length - 1], pick) < 900) whyBits.push(t('placeWhyNear'));
          if (inferPlacePriceTier(pick) === tier || congestionMatchesPreference(congestion.level, effectiveCongestion)) {
            whyBits.push(t('placeWhyMatch'));
          }
          plan.push({
            name: pick.name,
            type: pick.type,
            typeKey: pick.typeKey || 'place',
            lat: pick.lat,
            lon: pick.lon,
            addr: pick.addr,
            tags: pick.tags,
            timeStart: minutesToTime(tMin),
            timeEnd: minutesToTime(endT),
            congestion: congestion,
            estimatedCostWon: placeCost,
            pickWhy: whyBits.slice(0, 2)
          });
          tMin = endT;
        }

        if (!plan.length || plan.length < Math.max(1, Math.ceil(finalOrder.length / 2))) {
          var emergency = buildEmergencyFallbackPlan({
            allPlaces: allPlaces,
            pools: pools,
            start: start,
            end: end,
            tier: tier,
            center: { lat: center.lat, lon: center.lng != null ? center.lng : center.lon },
            radiusMeters: radiusMeters,
            theme: weatherThemeForPlan,
            finalOrder: finalOrder.length ? finalOrder : ['restaurant', 'cafe', 'activity'],
            slotDurations: slotDurations,
            transportProfile: transportProfile
          });
          if (emergency.plan && emergency.plan.length && emergency.plan.length > plan.length) {
            plan = emergency.plan;
            substituted = substituted.concat(emergency.substituted || []);
            usedFallbackPlan = true;
          } else if (emergency.plan && emergency.plan.length && !plan.length) {
            plan = emergency.plan;
            substituted = substituted.concat(emergency.substituted || []);
            usedFallbackPlan = true;
          }
        }

        estimatedCostWon = sumPlanEstimatedCost(plan, tier);

        setLoadingProgress(72, 'loadingTextBuild', 'loadingSubBuild');

        if (!plan.length) {
          var failReasons = buildPlanIssueReasons({
            removed: removed,
            budgetExcluded: budgetExcluded,
            missingTypes: missingTypes.length ? missingTypes : typeOrder,
            congestionFallback: congestionFallback,
            substituted: substituted,
            partialPlan: true,
            mbtiPJ: mbtiPJ,
          });
          showError(t('errPlanEmpty') + '\n' + t('errPlanEmptyHint') + (failReasons.length ? '\n\n' + failReasons.join('\n') : ''));
          return;
        }

        if (isNaverSearchConfigured()) {
          setLoadingProgress(78, 'loadingTextQuality', 'loadingSubQuality');
          startLoadingProgressDrift(78, 92, 3500);
          plan = await ensurePlanPlaceQuality(plan, pools, allPlaces, tier, effectiveCongestion);
          if (!plan.length) {
            var emergency2 = buildEmergencyFallbackPlan({
              allPlaces: allPlaces,
              pools: pools,
              start: start,
              end: end,
              tier: tier,
              center: { lat: center.lat, lon: center.lng != null ? center.lng : center.lon },
              radiusMeters: radiusMeters,
              theme: weatherThemeForPlan,
              finalOrder: finalOrder,
              slotDurations: slotDurations,
              transportProfile: transportProfile
            });
            if (emergency2.plan && emergency2.plan.length) {
              plan = emergency2.plan;
              usedFallbackPlan = true;
            } else {
              showError(t('errPlanEmpty') + '\n' + t('errPlanEmptyHint') + '\n\n' + t('reasonMissingTypes'));
              return;
            }
          }
          plan = await enrichPlanWithNaverCongestion(plan);
        }

        var travelResult = await applyTravelTimesToPlan(plan, start, end);
        plan = travelResult.plan;

        // 도보·3곳 이상이면 동선 한 번 더 다듬기 (무료 OSRM)
        var transportVal = (document.querySelector('input[name="transport"]:checked') || {}).value || 'walk';
        if (plan.length >= 3 && transportVal !== 'transit') {
          try {
            var optimized = await optimizeRouteOrder(plan);
            var travel2 = await applyTravelTimesToPlan(optimized, start, end);
            plan = travel2.plan;
            travelResult = travel2;
            routeOptimized = true;
          } catch (optErr) { /* keep previous */ }
        }

        estimatedCostWon = sumPlanEstimatedCost(plan, tier);
        var travelTotal = totalTravelMinutes(plan);

        if (loadingProgressTimer) { clearInterval(loadingProgressTimer); loadingProgressTimer = null; }
        setLoadingProgress(96, 'loadingTextFinish', 'loadingSubFinish');
        var timeNotice = buildTimeShortageMessage(removed);
        if (budgetExcluded) timeNotice = (timeNotice ? timeNotice + ' ' : '') + t('budgetExceeded');
        if (travelResult.overrun) timeNotice = (timeNotice ? timeNotice + ' ' : '') + t('travelOverrunNotice');
        if (weatherIndoorBias) timeNotice = (timeNotice ? timeNotice + ' ' : '') + t('weatherIndoorBias');
        if (hoursSkipped) timeNotice = (timeNotice ? timeNotice + ' ' : '') + t('reasonHoursRelaxed');
        if (usedFallbackPlan) timeNotice = (timeNotice ? timeNotice + ' ' : '') + t('whyFallback');
        if (usedStalePlaceCache) timeNotice = (timeNotice ? timeNotice + ' ' : '') + t('errPlacesStaleCache');
        if (substituted && substituted.length > 0) {
          var subLines = substituted.map(function (s) {
            var wantLabel = t(slotTypeLabelKeys[s.wanted] || '');
            var gotLabel = t(slotTypeLabelKeys[s.got] || '');
            return (t('substitutionItem').replace('%s', wantLabel)).replace('%s', gotLabel);
          });
          var subMsg = t('substitutionNotice') + ' (' + subLines.join(', ') + ')';
          timeNotice = (timeNotice ? timeNotice + ' ' : '') + subMsg;
        }

        var issueReasons = buildPlanIssueReasons({
          removed: removed,
          budgetExcluded: budgetExcluded,
          missingTypes: missingTypes,
          congestionFallback: congestionFallback,
          substituted: substituted,
          partialPlan: plan.length < finalOrder.length || (typeOrder.length > finalOrder.length),
          mbtiPJ: mbtiPJ,
        });
        if (issueReasons.length) {
          timeNotice = (timeNotice ? timeNotice + '\n' : '') + issueReasons.join(' ');
        }

        var streetKeysSeen = {};
        for (var ssi = 0; ssi < plan.length; ssi++) {
          var ssk = streetKeyOf(plan[ssi]);
          if (ssk) streetKeysSeen[ssk] = true;
        }
        var streetSpread = Object.keys(streetKeysSeen).length >= Math.min(2, plan.length);
        var whyItems = buildPlanWhyItems({
          weatherIndoorBias: weatherIndoorBias,
          weatherOutdoorBias: !weatherIndoorBias && weatherThemeForPlan === 'fine',
          totalTravelMin: travelTotal,
          congestionPref: effectiveCongestion,
          budgetUsed: budget != null && budget > 0,
          diversified: plan.length >= 2,
          hoursRelaxed: hoursSkipped,
          hoursFiltered: !hoursSkipped,
          usedFallback: usedFallbackPlan,
          routeOptimized: routeOptimized,
          streetSpread: streetSpread
        });

        renderPlan(plan, center, radiusMeters, startTime.value, endTime.value, timeNotice, estimatedCostWon, budget, pools, mbtiPJ, mbtiIE, {
          whyItems: whyItems,
          travelTotal: travelTotal
        });
        updateMobileDockForResult(true);
        if (resultSection) {
          resultSection.hidden = false;
          resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        addPlanToPlansArea(plan, center, radiusMeters, startTime.value, endTime.value, timeNotice, estimatedCostWon, budget, mbtiPJ, mbtiIE);
        scheduleCardShareReminder(startTime.value, endTime.value);
      } catch (e) {
        console.error(e);
        var msg = (e && e.message && String(e.message).indexOf('장소') !== -1)
          ? (t('errPlacesSearchFailed') + '\n' + t('errGenerateHint'))
          : (t('errGenerate') + '\n' + t('errGenerateHint'));
        showError(msg);
      } finally {
        planGenerating = false;
        hideLoadingOverlay();
      }
    })();
  }

  var replacePlanSeq = 0;
  var RECENT_REGIONS_KEY = 'auvia-recent-regions';

  function snapshotPlace(item) {
    if (!item) return null;
    return {
      name: item.name,
      type: item.type,
      typeKey: item.typeKey,
      lat: item.lat,
      lon: item.lon,
      addr: item.addr,
      tags: item.tags,
      timeStart: item.timeStart,
      timeEnd: item.timeEnd,
      congestion: item.congestion,
      estimatedCostWon: item.estimatedCostWon,
      pickWhy: item.pickWhy ? item.pickWhy.slice() : null,
      travelFromPrevMin: item.travelFromPrevMin,
      pinned: !!item.pinned,
      highlight: !!item.highlight,
      requestedSlot: item.requestedSlot || null
    };
  }

  function rememberRegion(lat, lng, label) {
    lat = Number(lat);
    lng = Number(lng);
    if (isNaN(lat) || isNaN(lng)) return;
    var text = String(label || '').replace(/\s+/g, ' ').trim();
    if (text.length > 18) text = text.slice(0, 17) + '…';
    if (!text) text = lat.toFixed(2) + ', ' + lng.toFixed(2);
    var list = [];
    try { list = JSON.parse(localStorage.getItem(RECENT_REGIONS_KEY) || '[]') || []; } catch (e) { list = []; }
    list = list.filter(function (r) {
      return Math.abs(Number(r.lat) - lat) > 0.004 || Math.abs(Number(r.lng) - lng) > 0.004;
    });
    list.unshift({ lat: lat, lng: lng, label: text });
    list = list.slice(0, 3);
    try { localStorage.setItem(RECENT_REGIONS_KEY, JSON.stringify(list)); } catch (e2) {}
    renderRecentRegions();
  }

  function renderRecentRegions() {
    var wrap = $('recentRegions');
    if (!wrap) return;
    var list = [];
    try { list = JSON.parse(localStorage.getItem(RECENT_REGIONS_KEY) || '[]') || []; } catch (e) { list = []; }
    if (!list.length) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = '<span class="recent-regions-label">' + escapeHtml(t('recentRegionsLabel')) + '</span>' +
      list.map(function (r, i) {
        return '<button type="button" class="recent-region-chip" data-recent-index="' + i + '">' + escapeHtml(r.label || '') + '</button>';
      }).join('');
    wrap.querySelectorAll('.recent-region-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-recent-index'), 10);
        var r = list[i];
        if (!r) return;
        var pick = document.querySelector('input[name="quickRegion"][value="pick"]');
        if (pick) pick.checked = true;
        searchCenter = { lat: Number(r.lat), lng: Number(r.lng) };
        if (mapAdapter) {
          mapAdapter.setView(searchCenter.lat, searchCenter.lng, 15);
          mapAdapter.addPickMarker(searchCenter.lat, searchCenter.lng, r.label || t('recentPickedHere'));
        }
        if (mapHint) mapHint.textContent = t('mapHintPick');
        fetchFourDayForecast(searchCenter.lat, searchCenter.lng);
        openDetailedSettings();
      });
    });
  }

  function syncCurrentSavedPlan() {
    if (!lastRenderedPlan || lastRenderedPlan.id == null) return;
    var item = savedPlans.find(function (p) { return p.id === lastRenderedPlan.id; });
    if (!item) return;
    item.plan = lastRenderedPlan.plan.map(function (p) {
      var copy = snapshotPlace(p) || {};
      return copy;
    });
    item.estimatedCostWon = lastRenderedPlan.estimatedCostWon;
    item.timeNotice = lastRenderedPlan.timeNotice;
    persistSavedPlansLocal();
    upsertPlanCloud(item);
  }

  function finishEditedPlan(plan, extraNotice) {
    var lr = lastRenderedPlan;
    var tier = getPriceTier();
    var dayStart = timeToMinutes((lr && lr.start) || '12:00');
    var dayEnd = timeToMinutes((lr && lr.end) || '18:00');
    var seq = ++replacePlanSeq;
    lastRenderedPlan.plan = plan;
    lastRenderedPlan.estimatedCostWon = sumPlanEstimatedCost(plan, tier);
    applyTravelTimesToPlan(plan, dayStart, dayEnd).then(function (result) {
      if (seq !== replacePlanSeq) return;
      var nextPlan = result.plan;
      var notice = (lr && lr.timeNotice) || '';
      if (extraNotice) notice = (notice ? notice + ' ' : '') + extraNotice;
      if (result.overrun) notice = (notice ? notice + ' ' : '') + t('travelOverrunNotice');
      lastRenderedPlan.plan = nextPlan;
      lastRenderedPlan.timeNotice = notice;
      lastRenderedPlan.estimatedCostWon = sumPlanEstimatedCost(nextPlan, tier);
      lastRenderedPlan.travelTotal = totalTravelMinutes(nextPlan);
      renderPlan(nextPlan, lr.center, lr.radiusMeters, lr.start, lr.end, notice, lastRenderedPlan.estimatedCostWon, lr.budgetWon, lr.pools, lr.mbtiPJ || '', lr.mbtiIE || '', {
        whyItems: lastRenderedPlan.whyItems || null,
        travelTotal: lastRenderedPlan.travelTotal
      });
      syncCurrentSavedPlan();
    }).catch(function () {
      if (seq !== replacePlanSeq) return;
      renderPlan(plan, lr.center, lr.radiusMeters, lr.start, lr.end, lr.timeNotice, lastRenderedPlan.estimatedCostWon, lr.budgetWon, lr.pools, lr.mbtiPJ || '', lr.mbtiIE || '', {
        whyItems: lastRenderedPlan.whyItems || null,
        travelTotal: totalTravelMinutes(plan)
      });
    });
  }

  function buildReplacementAt(plan, index) {
    var lr = lastRenderedPlan;
    var item = plan[index];
    if (!lr || !item || !lr.pools) return null;
    var typeKey = item.typeKey || 'restaurant';
    var slot = getPoolIndexAndSlotType(typeKey);
    var used = new Set(plan.map(function (p, i) { return i === index ? '' : p.name; }));
    var mbtiIE = lr.mbtiIE || '';
    var effectiveCongestion = (mbtiIE === 'I') ? 'relaxed' : ((mbtiIE === 'E') ? 'busy' : getCongestionPreference());
    var prevType = index > 0 ? placeSlotType(plan[index - 1]) : null;
    var nextType = index + 1 < plan.length ? placeSlotType(plan[index + 1]) : null;
    var forcedSlot = item.requestedSlot || null;
    var ownType = forcedSlot || slot.slotTypeKey;
    var typeOrder = forcedSlot
      ? [forcedSlot]
      : slotTypesAvoiding(prevType, index, ownType !== prevType ? ownType : null);
    if (!forcedSlot && nextType && nextType !== prevType) {
      var later = typeOrder.filter(function (typeName) { return typeName === nextType; });
      typeOrder = typeOrder.filter(function (typeName) { return typeName !== nextType; }).concat(later);
    }
    var poolIndexByType = { restaurant: 0, cafe: 1, activity: 2, park: 3 };
    var available = [];
    for (var ti = 0; ti < typeOrder.length && !available.length; ti++) {
      var pool = lr.pools[poolIndexByType[typeOrder[ti]]] || [];
      var filtered = pool.filter(function (p) {
        return p && p.name !== item.name && !used.has(p.name) && !isWeakPlaceCandidate(p) && (forcedSlot || !prevType || placeSlotType(p) !== prevType);
      });
      var matched = filtered.filter(function (p) {
        return congestionMatchesPreference(getCongestion(p).level, effectiveCongestion);
      });
      available = matched.length ? matched : filtered;
    }
    if (!available.length) return null;
    var tier = getPriceTier();
    var prev = index > 0 ? plan[index - 1] : null;
    var usedPrefixes = {};
    var usedStreets = {};
    var usedGrids = {};
    var usedNames = [];
    plan.forEach(function (p, i) {
      if (i === index) return;
      usedPrefixes[namePrefixKey(p.name)] = true;
      usedNames.push(p.name);
      var sk = streetKeyOf(p);
      var gk = gridKeyOf(p);
      if (sk) usedStreets[sk] = true;
      if (gk) usedGrids[gk] = true;
    });
    var sorted = rankCandidates(sortPoolByPriceTier(available, placeSlotType(available[0]) || slot.slotTypeKey, tier), {
      tier: tier,
      theme: null,
      prev: prev,
      center: lr.center ? { lat: lr.center.lat, lon: lr.center.lng != null ? lr.center.lng : lr.center.lon } : null,
      radiusMeters: lr.radiusMeters || 1500,
      usedPrefixes: usedPrefixes,
      usedStreets: usedStreets,
      usedGrids: usedGrids,
      usedNames: usedNames,
      transportProfile: getTransportProfile()
    });
    sorted = preferFreshCandidates(sorted);
    var pick = sorted[0];
    if (!pick) return null;
    var congestion = getCongestion(pick);
    var whyBits = [];
    if (pick.tags && pick.tags.opening_hours) whyBits.push(t('placeWhyOpen'));
    if (prev && haversineMeters(prev, pick) < 900) whyBits.push(t('placeWhyNear'));
    if (inferPlacePriceTier(pick) === tier || congestionMatchesPreference(congestion.level, effectiveCongestion)) whyBits.push(t('placeWhyMatch'));
    return {
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
      estimatedCostWon: estimatePlaceCostWon(pick, tier),
      pickWhy: whyBits.slice(0, 2),
      undoPlace: snapshotPlace(item),
      pinned: !!item.pinned,
      requestedSlot: item.requestedSlot || placeSlotType(pick)
    };
  }

  function replacePlanItem(index) {
    var lr = lastRenderedPlan;
    if (!lr || !lr.plan || !lr.pools || index < 0 || index >= lr.plan.length) return;
    var plan = lr.plan.slice();
    var next = buildReplacementAt(plan, index);
    if (!next) {
      showError(t('errNoOtherPlace'));
      return;
    }
    next.pinned = !!plan[index].pinned;
    plan[index] = next;
    finishEditedPlan(plan);
  }

  function undoPlanItem(index) {
    var lr = lastRenderedPlan;
    if (!lr || !lr.plan || !lr.plan[index] || !lr.plan[index].undoPlace) return;
    var plan = lr.plan.slice();
    plan[index] = lr.plan[index].undoPlace;
    finishEditedPlan(plan);
  }

  function togglePinPlanItem(index) {
    var lr = lastRenderedPlan;
    if (!lr || !lr.plan || !lr.plan[index]) return;
    lr.plan[index].pinned = !lr.plan[index].pinned;
    renderPlan(lr.plan, lr.center, lr.radiusMeters, lr.start, lr.end, lr.timeNotice, lr.estimatedCostWon, lr.budgetWon, lr.pools, lr.mbtiPJ || '', lr.mbtiIE || '', {
      whyItems: lr.whyItems || null,
      travelTotal: lr.travelTotal
    });
    syncCurrentSavedPlan();
  }

  function setPlanItemSlot(index, slotType) {
    var lr = lastRenderedPlan;
    if (!lr || !lr.plan || !lr.plan[index]) return;
    if (['restaurant', 'cafe', 'activity', 'park'].indexOf(slotType) === -1) return;
    lr.plan[index].requestedSlot = slotType;
    renderPlan(lr.plan, lr.center, lr.radiusMeters, lr.start, lr.end, lr.timeNotice, lr.estimatedCostWon, lr.budgetWon, lr.pools, lr.mbtiPJ || '', lr.mbtiIE || '', {
      whyItems: lr.whyItems || null,
      travelTotal: lr.travelTotal
    });
    syncCurrentSavedPlan();
  }

  function regenerateSameCourse() {
    var lr = lastRenderedPlan;
    if (!lr || !lr.plan || !lr.plan.length) return;
    if (lr.pools) {
      var plan = lr.plan.slice();
      var changed = 0;
      for (var i = 0; i < plan.length; i++) {
        if (plan[i] && plan[i].pinned && !(plan[i].requestedSlot && plan[i].requestedSlot !== placeSlotType(plan[i]))) continue;
        var next = buildReplacementAt(plan, i);
        if (!next) continue;
        plan[i] = next;
        changed += 1;
      }
      if (!changed) {
        showError(t('errNoOtherPlace'));
        return;
      }
      finishEditedPlan(plan, null);
      return;
    }
    var c = lr.center;
    if (!c || c.lat == null) {
      showError(t('errRegenNoCenter'));
      return;
    }
    doGeneratePlan({ lat: Number(c.lat), lng: c.lng != null ? Number(c.lng) : Number(c.lon) });
  }

  function renderPlan(plan, center, radiusMeters, start, end, timeNotice, estimatedCostWon, budgetWon, pools, mbtiPJ, mbtiIE, opts) {
    opts = opts || {};
    var prevWhy = lastRenderedPlan && lastRenderedPlan.whyItems;
    var prevTravel = lastRenderedPlan && lastRenderedPlan.travelTotal;
    var prevId = lastRenderedPlan && lastRenderedPlan.id;
    var prevTitle = lastRenderedPlan && lastRenderedPlan.title;
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
      whyItems: ('whyItems' in opts) ? opts.whyItems : (prevWhy || null),
      travelTotal: opts.travelTotal != null ? opts.travelTotal : (prevTravel != null ? prevTravel : totalTravelMinutes(plan)),
    };
    if (prevId != null) lastRenderedPlan.id = prevId;
    if (prevTitle) lastRenderedPlan.title = prevTitle;
    rememberPlanNames(plan);
    var isPick = isQuickRegionPick();
    var suffixKey = isPick && currentLang === 'en' ? 'resultMetaSuffixPick' : 'resultMetaSuffix';
    resultMeta.textContent = (isPick ? t('resultMetaPick') : t('resultMetaMy')) + (radiusMeters / 1000) + t(suffixKey) + start + ' ~ ' + end;
    var mbtiBadgeEl = $('resultMbtiBadge');
    if (mbtiBadgeEl) {
      if (mbtiPJ === 'P') {
        mbtiBadgeEl.textContent = t('mbtiBadgeP') || '여유 있는 코스';
        mbtiBadgeEl.hidden = false;
      } else if (mbtiPJ === 'J') {
        mbtiBadgeEl.textContent = t('mbtiBadgeJ') || '빠르게 움직이는 코스';
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

    var summaryEl = $('resultSummary');
    if (summaryEl) {
      var chips = [];
      chips.push('<span class="result-summary-chip">' + escapeHtml(t('summaryStops').replace('%s', String(plan.length))) + '</span>');
      var travelTot = lastRenderedPlan.travelTotal || 0;
      if (travelTot > 0) {
        chips.push('<span class="result-summary-chip">' + escapeHtml(t('summaryTravel').replace('%s', String(travelTot))) + '</span>');
      }
      if (estimatedCostWon != null && estimatedCostWon > 0) {
        chips.push('<span class="result-summary-chip">' + escapeHtml(t('summaryCost').replace('%s', formatWon(estimatedCostWon))) + '</span>');
      }
      if (budgetWon != null && budgetWon > 0 && estimatedCostWon != null && estimatedCostWon > 0) {
        var pct = Math.round((estimatedCostWon / budgetWon) * 100);
        chips.push('<span class="result-summary-chip result-summary-chip--budget">' + escapeHtml(t('summaryBudgetFit').replace('%s', String(pct))) + '</span>');
      }
      summaryEl.innerHTML = chips.join('');
      summaryEl.hidden = plan.length === 0;
    }

    var whyEl = $('resultWhy');
    if (whyEl) {
      var whyItems = lastRenderedPlan.whyItems || [];
      if (whyItems.length && plan.length) {
        whyEl.innerHTML = '<li class="result-why-title">' + escapeHtml(t('whyTitle')) + '</li>' +
          whyItems.map(function (w) { return '<li>' + escapeHtml(w) + '</li>'; }).join('');
        whyEl.hidden = false;
      } else {
        whyEl.innerHTML = '';
        whyEl.hidden = true;
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
      var links = buildPlaceDeepLinks(p);
      var verifyLink = '<a href="' + escapeHtml(links.map) + '" target="_blank" rel="noopener noreferrer" class="place-verify-link">' + escapeHtml(t('placeVerifyMap')) + '</a>';
      var reserveLink = '<a href="' + escapeHtml(links.reserve) + '" target="_blank" rel="noopener noreferrer" class="place-reserve-link">' + escapeHtml(t('placeReserveLink')) + '</a>';
      var menuLink = '<a href="' + escapeHtml(links.menu) + '" target="_blank" rel="noopener noreferrer" class="place-menu-link">' + escapeHtml(t('placeMenuLink')) + '</a>';
      var slotKey = p.requestedSlot || placeSlotType(p);
      var slotSelect = pools ? '<select class="place-slot-select" data-index="' + idx + '" aria-label="' + escapeHtml(t('placeSlotLabel')) + '">' +
        ['restaurant', 'cafe', 'activity', 'park'].map(function (key) {
          var labelKey = key === 'restaurant' ? 'courseTypeRestaurant' : key === 'cafe' ? 'courseTypeCafe' : key === 'activity' ? 'courseTypeActivity' : 'courseTypePark';
          return '<option value="' + key + '"' + (key === slotKey ? ' selected' : '') + '>' + escapeHtml(t(labelKey)) + '</option>';
        }).join('') + '</select>' : '';
      var pinBtn = pools ? '<button type="button" class="place-pin-btn' + (p.pinned ? ' is-on' : '') + '" data-index="' + idx + '">' + escapeHtml(p.pinned ? t('placeUnpin') : t('placePin')) + '</button>' : '';
      var undoBtn = p.undoPlace ? '<button type="button" class="place-undo-btn" data-index="' + idx + '">' + escapeHtml(t('placeUndo')) + '</button>' : '';
      var replaceBtn = pools ? '<button type="button" class="place-replace-btn" data-index="' + idx + '">' + escapeHtml(t('placeReplaceBtn')) + '</button>' : '';
      var travelHtml = (idx > 0 && p.travelFromPrevMin != null)
        ? '<div class="place-travel">' + escapeHtml(t('travelMinutes').replace('%s', String(p.travelFromPrevMin))) + '</div>'
        : '';
      var costHtml = (p.estimatedCostWon != null && p.estimatedCostWon > 0)
        ? '<div class="place-est-cost">' + escapeHtml(t('placeEstCost').replace('%s', formatWon(p.estimatedCostWon))) + '</div>'
        : '';
      var whyHtml = (p.pickWhy && p.pickWhy.length)
        ? '<div class="place-why">' + p.pickWhy.map(function (w) {
            return '<span class="place-why-chip">' + escapeHtml(w) + '</span>';
          }).join('') + '</div>'
        : '';
      return '<li class="' + (p.pinned ? 'is-pinned' : '') + '">' + highlightStar + '<span class="place-name">' + escapeHtml(p.name) + congestionHtml + '</span>' + travelHtml + '<div class="place-time">' + p.timeStart + ' ~ ' + p.timeEnd + '</div><div class="place-type-row"><span class="place-type">' + escapeHtml(p.type) + '</span>' + slotSelect + '</div>' + costHtml + whyHtml + (p.addr ? '<div class="place-addr">' + escapeHtml(p.addr) + '</div>' : '') + '<div class="place-actions">' + verifyLink + reserveLink + menuLink + pinBtn + replaceBtn + undoBtn + '</div></li>';
    }).join('');
    itinerary.querySelectorAll('.place-replace-btn').forEach(function (btn) {
      var idx = parseInt(btn.getAttribute('data-index'), 10);
      if (!isNaN(idx)) btn.addEventListener('click', function () { replacePlanItem(idx); });
    });
    itinerary.querySelectorAll('.place-undo-btn').forEach(function (btn) {
      var idx = parseInt(btn.getAttribute('data-index'), 10);
      if (!isNaN(idx)) btn.addEventListener('click', function () { undoPlanItem(idx); });
    });
    itinerary.querySelectorAll('.place-pin-btn').forEach(function (btn) {
      var idx = parseInt(btn.getAttribute('data-index'), 10);
      if (!isNaN(idx)) btn.addEventListener('click', function () { togglePinPlanItem(idx); });
    });
    itinerary.querySelectorAll('.place-slot-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var idx = parseInt(sel.getAttribute('data-index'), 10);
        if (!isNaN(idx)) setPlanItemSlot(idx, sel.value);
      });
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

  function buildPlaceDeepLinks(place) {
    var name = (place && place.name) || '';
    var addr = (place && place.addr) || '';
    var q = (name + (addr ? ' ' + addr : '')).trim() || name;
    var enc = encodeURIComponent(q);
    var lat = place && place.lat != null ? Number(place.lat) : null;
    var lon = place && place.lon != null ? Number(place.lon) : null;
    if (currentLang === 'en') {
      var gq = (lat != null && lon != null && !isNaN(lat) && !isNaN(lon))
        ? ('https://www.google.com/maps?q=' + lat + ',' + lon)
        : ('https://www.google.com/maps/search/?api=1&query=' + enc);
      return { map: gq, reserve: gq, menu: gq };
    }
    var placeSearch = 'https://map.naver.com/v5/search/' + enc;
    return {
      map: placeSearch,
      reserve: placeSearch,
      menu: placeSearch
    };
  }

  function reportClientError(err, extra) {
    try {
      var payload = {
        message: (err && err.message) ? String(err.message) : String(err || 'unknown'),
        stack: (err && err.stack) ? String(err.stack) : '',
        url: location.href,
        lang: currentLang,
        extra: extra || null
      };
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/.netlify/functions/client-error', JSON.stringify(payload));
      } else {
        fetch('/.netlify/functions/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) { }
  }

  function initClientMonitoring() {
    window.addEventListener('error', function (ev) {
      reportClientError(ev.error || ev.message);
    });
    window.addEventListener('unhandledrejection', function (ev) {
      reportClientError(ev.reason || 'unhandledrejection');
    });
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
    showLoadingOverlay();
    setLoadingProgress(30, 'loadingTextFinish', 'loadingSubFinish');
    startLoadingProgressDrift(30, 90, 2500);
    var dayStart = timeToMinutes(lastRenderedPlan.start || '12:00');
    var dayEnd = timeToMinutes(lastRenderedPlan.end || '18:00');
    optimizeRouteOrder(lastRenderedPlan.plan).then(function (ordered) {
      return applyTravelTimesToPlan(ordered, dayStart, dayEnd);
    }).then(function (result) {
      hideLoadingOverlay();
      var ordered = result.plan;
      var notice = lastRenderedPlan.timeNotice || '';
      if (result.overrun) {
        notice = (notice ? notice + ' ' : '') + t('travelOverrunNotice');
      }
      lastRenderedPlan.plan = ordered;
      lastRenderedPlan.timeNotice = notice;
      lastRenderedPlan.travelTotal = totalTravelMinutes(ordered);
      renderPlan(ordered, lastRenderedPlan.center, lastRenderedPlan.radiusMeters, lastRenderedPlan.start, lastRenderedPlan.end, notice, lastRenderedPlan.estimatedCostWon != null ? lastRenderedPlan.estimatedCostWon : null, lastRenderedPlan.budgetWon != null ? lastRenderedPlan.budgetWon : null, lastRenderedPlan.pools || undefined, lastRenderedPlan.mbtiPJ || '', lastRenderedPlan.mbtiIE || '', {
        whyItems: lastRenderedPlan.whyItems || null,
        travelTotal: lastRenderedPlan.travelTotal
      });
    }).catch(function () {
      hideLoadingOverlay();
    });
  }

  function resetResult() {
    resultSection.hidden = true;
    updateMobileDockForResult(false);
    if (mapAdapter && mapAdapter.clearPlaceMarkers) mapAdapter.clearPlaceMarkers();
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

  var lastCardShareTitle = '';

  function getCardShareTitle() {
    var fallback = t('cardShareTitleDefault') || '오늘 우리의 데이트 기록';
    var raw = (cardShareModalTitle && typeof cardShareModalTitle.value === 'string')
      ? cardShareModalTitle.value
      : lastCardShareTitle;
    var text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (text.length > 18) text = text.slice(0, 18);
    return text || fallback;
  }

  function slimPlanForShare(lr) {
    if (!lr || !lr.plan) return null;
    return {
      v: 1,
      title: lr.title || '',
      start: lr.start || '',
      end: lr.end || '',
      date: getPlanDateForHours().toISOString().slice(0, 10),
      center: lr.center ? {
        lat: lr.center.lat,
        lng: lr.center.lng != null ? lr.center.lng : lr.center.lon
      } : null,
      radiusMeters: lr.radiusMeters || null,
      plan: lr.plan.map(function (p) {
        return {
          n: p.name,
          t: p.type,
          tk: p.typeKey,
          lat: p.lat,
          lon: p.lon,
          a: p.addr || '',
          ts: p.timeStart,
          te: p.timeEnd,
          c: p.estimatedCostWon != null ? p.estimatedCostWon : null
        };
      })
    };
  }

  function encodePlanSharePayload(payload) {
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    } catch (e) {
      return '';
    }
  }

  function decodePlanSharePayload(enc) {
    try {
      var b64 = String(enc || '').replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function buildPlanShareUrl(lr) {
    var payload = slimPlanForShare(lr || lastRenderedPlan);
    if (!payload) return '';
    var enc = encodePlanSharePayload(payload);
    if (!enc) return '';
    var base = location.origin + location.pathname + (location.search || '');
    return base + '#p=' + enc;
  }

  function expandSharedPlan(payload) {
    if (!payload || !payload.plan || !payload.plan.length) return null;
    var plan = payload.plan.map(function (p) {
      return {
        name: p.n || p.name || '',
        type: p.t || p.type || '',
        typeKey: p.tk || p.typeKey || 'place',
        lat: p.lat,
        lon: p.lon,
        addr: p.a || p.addr || '',
        timeStart: p.ts || p.timeStart || '',
        timeEnd: p.te || p.timeEnd || '',
        estimatedCostWon: p.c != null ? p.c : null,
        tags: {}
      };
    });
    return {
      plan: plan,
      title: payload.title || '',
      start: payload.start || (plan[0] && plan[0].timeStart) || '12:00',
      end: payload.end || (plan[plan.length - 1] && plan[plan.length - 1].timeEnd) || '18:00',
      center: payload.center ? {
        lat: payload.center.lat,
        lng: payload.center.lng != null ? payload.center.lng : payload.center.lon
      } : null,
      radiusMeters: payload.radiusMeters || 1500,
      date: payload.date || null
    };
  }

  function loadSharedPlanFromHash() {
    var hash = location.hash || '';
    var m = hash.match(/^#p=(.+)$/);
    if (!m) return false;
    var payload = decodePlanSharePayload(m[1]);
    var expanded = expandSharedPlan(payload);
    if (!expanded) {
      showError(t('sharePlanLoadFailed'));
      return false;
    }
    var center = expanded.center || { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
    var cost = 0;
    expanded.plan.forEach(function (p) {
      if (p.estimatedCostWon != null) cost += p.estimatedCostWon;
    });
    if (advancedSection) {
      advancedSection.hidden = false;
      setAdvancedDetailsOpen(false);
    }
    renderPlan(
      expanded.plan,
      center,
      expanded.radiusMeters,
      expanded.start,
      expanded.end,
      null,
      cost || null,
      null,
      null,
      '',
      ''
    );
    if (lastRenderedPlan) lastRenderedPlan.title = expanded.title || t('planCardTitle');
    var nameInput = $('planNameInput');
    if (nameInput) nameInput.value = expanded.title || '';
    updateMobileDockForResult(true);
    if (resultSection) {
      resultSection.hidden = false;
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    addPlanToPlansArea(
      expanded.plan,
      center,
      expanded.radiusMeters,
      expanded.start,
      expanded.end,
      null,
      cost || null,
      null,
      '',
      ''
    );
    showError(t('sharePlanLoaded'));
    return true;
  }

  function copyPlanShareLink() {
    var url = buildPlanShareUrl(lastRenderedPlan);
    if (!url) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showError(t('sharePlanLinkCopied'));
      }).catch(function () { fallbackCopy(url, 'sharePlanLinkCopied'); });
    } else {
      fallbackCopy(url, 'sharePlanLinkCopied');
    }
  }

  function icsEscape(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  function icsDateStamp(d) {
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + 'Z';
  }

  function icsLocalDateTime(dateObj, hhmm) {
    var parts = String(hhmm || '12:00').split(':');
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    var d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), h, m, 0);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) + 'T' +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      '00';
  }

  function downloadPlanIcs() {
    if (!lastRenderedPlan || !lastRenderedPlan.plan || !lastRenderedPlan.plan.length) return;
    var day = getPlanDateForHours();
    var stamp = icsDateStamp(new Date());
    var title = getPlanDisplayTitle(lastRenderedPlan.title);
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Auvia//Date Planner//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];
    lastRenderedPlan.plan.forEach(function (p, i) {
      var uid = 'auvia-' + Date.now() + '-' + i + '@auvia.netlify.app';
      var desc = (p.type || '') + (p.addr ? ('\n' + p.addr) : '');
      var geo = (p.lat != null && p.lon != null) ? ('GEO:' + p.lat + ';' + p.lon) : null;
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + uid);
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART:' + icsLocalDateTime(day, p.timeStart));
      lines.push('DTEND:' + icsLocalDateTime(day, p.timeEnd));
      lines.push('SUMMARY:' + icsEscape(p.name || ('Stop ' + (i + 1))));
      if (desc) lines.push('DESCRIPTION:' + icsEscape(desc));
      if (p.addr) lines.push('LOCATION:' + icsEscape(p.addr));
      if (geo) lines.push(geo);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (title || 'auvia-plan').replace(/[\\/:*?"<>|]/g, '_') + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    showError(t('icsDownloaded'));
  }

  function loadQrImage(dataUrlOrHttp) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = dataUrlOrHttp;
    });
  }

  function openCardShareModal() {
    if (!lastRenderedPlan || !lastRenderedPlan.plan || lastRenderedPlan.plan.length === 0) return;
    var title = lastCardShareTitle || t('cardShareTitleDefault') || '오늘 우리의 데이트 기록';
    if (title.length > 18) title = title.slice(0, 18);
    if (cardShareModalTitle) {
      cardShareModalTitle.value = title;
      cardShareModalTitle.maxLength = 18;
      cardShareModalTitle.oninput = function () {
        if (cardShareModalTitle.value.length > 18) {
          cardShareModalTitle.value = cardShareModalTitle.value.slice(0, 18);
        }
        lastCardShareTitle = cardShareModalTitle.value;
      };
    }
    if (cardShareList) {
      var head = '';
      if (lastRenderedPlan.estimatedCostWon != null && lastRenderedPlan.estimatedCostWon > 0) {
        head = '<div class="card-share-meta">' + escapeHtml(t('summaryCost').replace('%s', formatWon(lastRenderedPlan.estimatedCostWon))) +
          (lastRenderedPlan.travelTotal ? ' · ' + escapeHtml(t('summaryTravel').replace('%s', String(lastRenderedPlan.travelTotal))) : '') +
          '</div>';
      }
      cardShareList.innerHTML = head + lastRenderedPlan.plan.map(function (p, i) {
        var travel = (i > 0 && p.travelFromPrevMin != null)
          ? '<span class="card-share-travel">' + escapeHtml(t('travelMinutes').replace('%s', String(p.travelFromPrevMin))) + '</span>'
          : '';
        return '<div class="card-share-item">' +
          travel +
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
    if ($('btnDownloadCardImage')) $('btnDownloadCardImage').onclick = downloadCardShareImage;
    if ($('btnCopySharePlanLink')) $('btnCopySharePlanLink').onclick = copyPlanShareLink;
    if (cardShareBackdrop) cardShareBackdrop.onclick = closeCardShareModal;
    if (btnCloseCardShare) btnCloseCardShare.onclick = closeCardShareModal;
  }

  function downloadCardShareImage() {
    if (!lastRenderedPlan || !lastRenderedPlan.plan || !lastRenderedPlan.plan.length) return;
    var plan = lastRenderedPlan.plan;
    var title = getCardShareTitle();
    var shareUrl = buildPlanShareUrl(lastRenderedPlan);
    var W = 1080;
    var H = 1480;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    function paintBase() {
      var bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#0b0b10');
      bg.addColorStop(0.45, '#14121c');
      bg.addColorStop(1, '#1a1424');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      var glow = ctx.createRadialGradient(W * 0.8, 80, 20, W * 0.75, 120, 420);
      glow.addColorStop(0, 'rgba(167,139,250,0.28)');
      glow.addColorStop(1, 'rgba(167,139,250,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      var glow2 = ctx.createRadialGradient(120, H - 80, 10, 160, H - 40, 380);
      glow2.addColorStop(0, 'rgba(251,113,133,0.18)');
      glow2.addColorStop(1, 'rgba(251,113,133,0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(250,250,250,0.92)';
      ctx.font = '700 42px Outfit, system-ui, sans-serif';
      ctx.fillText('Auvia', 72, 96);
      ctx.strokeStyle = 'rgba(212,175,55,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(72, 118);
      ctx.lineTo(210, 118);
      ctx.stroke();
      ctx.fillStyle = '#fafafa';
      ctx.font = '700 54px Outfit, system-ui, sans-serif';
      wrapCanvasText(ctx, title, 72, 200, W - 144, 66);
      var meta = (lastRenderedPlan.start || '') + ' – ' + (lastRenderedPlan.end || '');
      var travelTot = lastRenderedPlan.travelTotal || totalTravelMinutes(plan);
      if (travelTot > 0) {
        meta += currentLang === 'en'
          ? ('  ·  ~' + travelTot + ' min travel')
          : ('  ·  이동 약 ' + travelTot + '분');
      }
      ctx.fillStyle = 'rgba(228,228,231,0.7)';
      ctx.font = '500 28px Outfit, system-ui, sans-serif';
      ctx.fillText(meta, 72, 320);
      if (lastRenderedPlan.estimatedCostWon != null && lastRenderedPlan.estimatedCostWon > 0) {
        var costLine = currentLang === 'en'
          ? ('Est. ₩' + formatWon(lastRenderedPlan.estimatedCostWon) + ' / person')
          : ('예상 인당 약 ' + formatWon(lastRenderedPlan.estimatedCostWon) + '원');
        ctx.fillStyle = 'rgba(103,232,249,0.9)';
        ctx.font = '600 26px Outfit, system-ui, sans-serif';
        ctx.fillText(costLine, 72, 358);
      }
      var y = 410;
      plan.slice(0, 5).forEach(function (p, i) {
        ctx.fillStyle = 'rgba(167,139,250,0.95)';
        ctx.beginPath();
        ctx.arc(88, y + 12, 8, 0, Math.PI * 2);
        ctx.fill();
        if (i < Math.min(plan.length, 5) - 1) {
          ctx.strokeStyle = 'rgba(167,139,250,0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(88, y + 22);
          ctx.lineTo(88, y + 118);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(103,232,249,0.95)';
        ctx.font = '600 26px Outfit, system-ui, sans-serif';
        ctx.fillText((p.timeStart || '') + '  ·  ' + (p.timeEnd || ''), 120, y + 8);
        ctx.fillStyle = '#fafafa';
        ctx.font = '600 36px Outfit, system-ui, sans-serif';
        var name = String(p.name || '');
        if (name.length > 22) name = name.slice(0, 21) + '…';
        ctx.fillText(name, 120, y + 52);
        ctx.fillStyle = 'rgba(161,161,170,0.95)';
        ctx.font = '500 24px Outfit, system-ui, sans-serif';
        var typeLine = String(p.type || '');
        if (i > 0 && p.travelFromPrevMin != null) {
          typeLine += currentLang === 'en'
            ? (' · ' + p.travelFromPrevMin + ' min move')
            : (' · 이동 ' + p.travelFromPrevMin + '분');
        }
        if (p.estimatedCostWon != null && p.estimatedCostWon > 0) {
          typeLine += currentLang === 'en'
            ? (' · ₩' + formatWon(p.estimatedCostWon))
            : (' · 약 ' + formatWon(p.estimatedCostWon) + '원');
        }
        ctx.fillText(typeLine, 120, y + 88);
        y += 130;
      });
    }

    function finishDownload() {
      canvas.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'auvia-date-card.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        showError(t('cardImageSaved'));
      }, 'image/png');
    }

    paintBase();
    if (!shareUrl) {
      ctx.fillStyle = 'rgba(250,250,250,0.45)';
      ctx.font = '500 24px Outfit, system-ui, sans-serif';
      ctx.fillText('auvia.netlify.app', 72, H - 64);
      finishDownload();
      return;
    }

    var qrApi = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&color=0b0b10&bgcolor=fafafa&data=' + encodeURIComponent(shareUrl);
    loadQrImage(qrApi).then(function (img) {
      var qSize = 200;
      var qx = W - 72 - qSize;
      var qy = H - 72 - qSize - 36;
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      roundRect(ctx, qx - 14, qy - 14, qSize + 28, qSize + 28, 18);
      ctx.fill();
      ctx.drawImage(img, qx, qy, qSize, qSize);
      ctx.fillStyle = 'rgba(250,250,250,0.7)';
      ctx.font = '500 22px Outfit, system-ui, sans-serif';
      ctx.fillText(currentLang === 'en' ? 'Scan to open plan' : 'QR을 찍으면 계획표가 열려요', 72, H - 72);
      ctx.fillStyle = 'rgba(250,250,250,0.4)';
      ctx.font = '500 20px Outfit, system-ui, sans-serif';
      ctx.fillText('auvia.netlify.app', 72, H - 40);
      finishDownload();
    }).catch(function () {
      ctx.fillStyle = 'rgba(250,250,250,0.7)';
      ctx.font = '500 22px Outfit, system-ui, sans-serif';
      ctx.fillText(shareUrl.slice(0, 42) + '…', 72, H - 72);
      ctx.fillStyle = 'rgba(250,250,250,0.4)';
      ctx.font = '500 20px Outfit, system-ui, sans-serif';
      ctx.fillText('auvia.netlify.app', 72, H - 40);
      finishDownload();
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = String(text || '').split(/\s+/);
    var line = '';
    var yy = y;
    for (var n = 0; n < words.length; n++) {
      var test = line ? (line + ' ' + words[n]) : words[n];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = words[n];
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function closeCardShareModal() {
    if (cardShareModal) {
      cardShareModal.classList.remove('is-visible');
      cardShareModal.setAttribute('aria-hidden', 'true');
    }
  }

  function buildCardShareText() {
    if (!lastRenderedPlan || !lastRenderedPlan.plan || lastRenderedPlan.plan.length === 0) return '';
    var title = getCardShareTitle();
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
    var nameInput = $('planNameInput');
    if (nameInput) nameInput.value = item.title || '';
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
    persistSavedPlansLocal();
    deletePlanCloud(id);
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
    renderMobilePlansPanel();
  }

  function editSavedPlanName(id) {
    var item = savedPlans.find(function (p) { return p.id === id; });
    if (!item) return;
    var current = getPlanDisplayTitle(item.title);
    var next = window.prompt(t('editPlanNamePrompt'), current);
    if (next == null) return;
    next = String(next).trim();
    item.title = next || t('planCardTitle');
    persistSavedPlansLocal();
    upsertPlanCloud(item);
    var card = plansList && plansList.querySelector('[data-plan-id="' + id + '"]');
    if (card) {
      var titleEl = card.querySelector('.plan-card-title');
      if (titleEl) titleEl.textContent = getPlanDisplayTitle(item.title);
    }
    var nameInput = $('planNameInput');
    if (nameInput) nameInput.value = item.title || '';
    showSavedPlan(id);
    renderMobilePlansPanel();
  }

  function addPlanToPlansArea(plan, center, radiusMeters, start, end, timeNotice, estimatedCostWon, budgetWon, mbtiPJ, mbtiIE) {
    if (!plansList || !plansEmpty) return;
    var id = Date.now();
    var title = getPlanNameInputValue() || t('planCardTitle');
    var item = {
      id: id,
      title: title,
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
    };
    savedPlans.unshift(item);
    persistSavedPlansLocal();
    upsertPlanCloud(item);
    if (lastRenderedPlan) {
      lastRenderedPlan.id = id;
      lastRenderedPlan.title = title;
    }
    plansEmpty.hidden = true;
    plansList.hidden = false;
    var card = document.createElement('div');
    card.className = 'plan-card';
    card.setAttribute('data-plan-id', id);
    card.innerHTML =
      '<div class="plan-card-info">' +
        '<span class="plan-card-title">' + escapeHtml(getPlanDisplayTitle(title)) + '</span>' +
        '<span class="plan-card-time">' + escapeHtml(start + ' ~ ' + end) + '</span>' +
      '</div>' +
      '<div class="plan-card-actions">' +
        '<button type="button" class="btn btn-edit" data-action="edit" title="' + escapeHtml(t('btnEdit')) + '">' + escapeHtml(t('btnEdit')) + '</button>' +
        '<button type="button" class="btn btn-delete" data-action="delete" title="' + escapeHtml(t('btnDelete')) + '">' + escapeHtml(t('btnDelete')) + '</button>' +
      '</div>';
    card.querySelector('.plan-card-info').addEventListener('click', function () { showSavedPlan(id); });
    card.querySelector('[data-action="edit"]').addEventListener('click', function (e) { e.stopPropagation(); editSavedPlanName(id); });
    card.querySelector('[data-action="delete"]').addEventListener('click', function (e) { e.stopPropagation(); deleteSavedPlan(id); });
    plansList.insertBefore(card, plansList.firstChild);
    renderMobilePlansPanel();
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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abc',
        maxZoom: 19,
      }).addTo(m);
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
      }).catch(function () {
        if (shareLinkHint) { shareLinkHint.textContent = url; shareLinkHint.style.color = 'var(--text-muted)'; }
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
        if (data.quickRegion === 'pick' && (data.searchCenterLat == null || data.searchCenterLng == null)) {
          if (savePresetCustomError) savePresetCustomError.textContent = t('customPresetPickCoordsNone');
          return;
        }
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
    setTimeout(function () { loadSharedPlanFromHash(); }, 200);
  };
  applyLanguage();
  bindLocationConsentHandlers();
  bindMobileChromeHandlers();
  initClientMonitoring();
  initSupabaseAuth();
  bindSavePresetModalHandlers();
  setTimeout(function () {
    if (!window.naver || !window.naver.maps) loadSharedPlanFromHash();
  }, 900);
  if (btnLoadPresetToggle) {
    btnLoadPresetToggle.addEventListener('click', toggleLoadPresetList);
  }
  if (savedPresetList) {
    savedPresetList.addEventListener('click', function (e) {
      var item = e.target.closest('.saved-preset-item');
      if (!item || item.classList.contains('saved-preset-empty')) return;
      var key = item.getAttribute('data-preset-key');
      if (!key) return;
      if (e.target.closest('.saved-preset-fav')) {
        toggleFavoritePreset(key);
        renderSavedPresetList();
        return;
      }
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
