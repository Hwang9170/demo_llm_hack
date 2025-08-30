// 현재 활성 페이지
let currentPage = 'home';

// 생성된 책 데이터 저장
let generatedBooks = [];
// 프로필 데이터 저장
let profileData = null;
// 생성 페이지 커스텀 모드 상태
let isCreateCustomMode = false;

// 프록시 서버(동일 출처) 사용: server.js가 /api/* 를 원격으로 프록시
let base = ""; // Ensure this points to the correct server base URL (e.g., "/api")

async function apiFetch(path, options = {}) {
  const url = `${base}${path}`;
  const { useCredentials = false, headers = {}, ...rest } = options;
  const res = await fetch(url, {
    credentials: useCredentials ? "include" : "omit",
    mode: "cors", // Ensure CORS is enabled
    headers: { "Content-Type": "application/json", ...headers },
    ...rest,
  });
  if (!res.ok) throw new Error(`API 오류: ${res.status}`);
  return res.json();
}


// 정적 자산 버전 (캐시 버스팅용)
const ASSET_VERSION = '20250829-2';

// 라우터: 페이지 파일 매핑
const pageToFile = {
  home: 'pages/home.html',
  create: 'pages/create.html',
  library: 'pages/library.html',
  reader: 'pages/reader.html',
  profile: 'pages/profile.html',
  settings: 'pages/settings.html',
};

// 페이지별 자산(CSS/JS) 매핑 및 로더
const pageAssets = {
  home:   { css: ['pages/home.css'],    js: ['pages/home.js'] },
  create: { css: ['pages/create.css'],  js: ['pages/create.js'] },
  library:{ css: ['pages/library.css'], js: ['pages/library.js'] },
  profile:{ css: ['pages/profile.css'], js: ['pages/profile.js'] },
  settings:{ css: [], js: [] },
  reader:{ css: [], js: [] },
};
const loadedAssets = new Set();

async function loadAssetsForPage(page){
  const assets = pageAssets[page] || {css:[],js:[]};
  // CSS
  for (const url of assets.css){
    if (loadedAssets.has(url)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${url}?v=${ASSET_VERSION}`;
    document.head.appendChild(link);
    loadedAssets.add(url);
  }
  // JS
  for (const url of assets.js){
    if (loadedAssets.has(url)) continue;
    await new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = `${url}?v=${ASSET_VERSION}`;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
    loadedAssets.add(url);
  }
}

// 초기화: 네비/라우터/저장된 데이터
document.addEventListener('DOMContentLoaded', function () {
  loadSavedBooks();
  loadSavedProfile?.();
  initNavRouter();
  const initial = location.hash.replace('#', '') || 'home';
  navigate(initial);
});

// 네비 + 해시 라우팅 초기화
function initNavRouter() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach((link) => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const targetPage = this.getAttribute('data-page');
      navigate(targetPage);
    });
  });

  window.addEventListener('hashchange', () => {
    const page = location.hash.replace('#', '') || 'home';
    navigate(page);
  });
}

// 페이지 로드 + 초기화
async function navigate(targetPage) {
  if (!pageToFile[targetPage]) targetPage = 'home';
  currentPage = targetPage;
  location.hash = `#${targetPage}`;

  // 네비 active 업데이트
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
  const targetNav = document.querySelector(`[data-page="${targetPage}"]`);
  if (targetNav && targetNav.parentElement) targetNav.parentElement.classList.add('active');

  // 컨텐츠 로드
  const app = document.getElementById('app');
  try {
    const res = await fetch(pageToFile[targetPage], { cache: 'no-cache' });
    const html = await res.text();
    app.innerHTML = html;
  } catch (e) {
    app.innerHTML = '<section class="page active"><div style="padding:40px">페이지를 불러오지 못했습니다.</div></section>';
  }

  // 로드된 페이지 활성화 클래스 보장
  const section = app.querySelector('.page');
  if (section) section.classList.add('active');

  // 페이지별 자산 로드
  await loadAssetsForPage(targetPage);

  // 페이지별 초기화
  initPage(targetPage);
}

function initPage(page) {
  switch (page) {
    case 'home':
      if (window.PageHome?.init) window.PageHome.init(); else initHome();
      break;
    case 'create':
      if (window.PageCreate?.init) window.PageCreate.init(); else initCreate();
      break;
    case 'library':
      if (window.PageLibrary?.init) window.PageLibrary.init(); else initLibrary();
      break;
    case 'reader':
      initializeReader();
      updateReaderContent();
      break;
    case 'profile':
      if (window.PageProfile?.init) window.PageProfile.init(); else initProfile();
      break;
    case 'settings':
    default:
      break;
  }
}

function initHome() {
  const naverBtn = document.getElementById('home-naver-btn');
  const startAlt = document.querySelector('.btn-start-alt');
  const explore = document.querySelector('.btn-explore');
  if (naverBtn) naverBtn.addEventListener('click', handleNaverLogin);
  if (startAlt) startAlt.addEventListener('click', () => navigate('create'));
  if (explore) explore.addEventListener('click', () => navigate('library'));
}

function initCreate() {
  const generateBtn = document.getElementById('generate-btn');
  if (generateBtn) generateBtn.addEventListener('click', generateBook);
  setupAutoSave();
  // 프로필 정보 기본값
  const childInput = document.getElementById('child-info');
  if (childInput && profileData?.name) childInput.value = profileData.name;
  initCreateOptions();
}

function initCreateOptions() {
  const themeCards = document.querySelectorAll('[data-theme-card]');
  const themeHidden = document.getElementById('book-theme');
  themeCards.forEach((card) => {
    card.addEventListener('click', () => {
      themeCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      if (themeHidden) themeHidden.value = card.dataset.value || '';
      if (!isCreateCustomMode) syncCreateHiddenFields();
    });
  });

  const chips = document.querySelectorAll('[data-keyword-chip]');
  const keywordsHidden = document.getElementById('book-keywords');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      const active = Array.from(document.querySelectorAll('[data-keyword-chip].selected')).map(
        (el) => el.dataset.value
      );
      if (keywordsHidden) keywordsHidden.value = JSON.stringify(active);
    });
  });

  // 추가: 위임 방식으로도 클릭 처리(이벤트 바인딩 실패 대비)
  const createPage = document.getElementById('create-page');
  if (createPage) {
    createPage.addEventListener('click', (e) => {
      const themeEl = e.target.closest('[data-theme-card]');
      if (themeEl) {
        document.querySelectorAll('[data-theme-card]').forEach(c=>c.classList.remove('selected'));
        themeEl.classList.add('selected');
        if (themeHidden) themeHidden.value = themeEl.dataset.value || '';
        if (!isCreateCustomMode) syncCreateHiddenFields();
        return;
      }
      const chipEl = e.target.closest('[data-keyword-chip]');
      if (chipEl) {
        chipEl.classList.toggle('selected');
        const active = Array.from(document.querySelectorAll('[data-keyword-chip].selected')).map(
          (el) => el.dataset.value
        );
        if (keywordsHidden) keywordsHidden.value = JSON.stringify(active);
        return;
      }
    });
  }

  // 프로필 선호 키워드 상위 2개 기본 선택
  if (profileData?.keywords?.length) {
    const defaults = profileData.keywords.slice(0, 2);
    defaults.forEach((kw) => {
      const el = document.querySelector(`[data-keyword-chip][data-value="${kw}"]`);
      if (el && !el.classList.contains('selected')) el.click();
    });
  }

  // 커스텀 모드 토글
  const toggleBtn = document.getElementById('custom-toggle-btn');
  const formContainer = document.querySelector('.form-container');
  const customTheme = document.getElementById('custom-theme');
  const customKeywords = document.getElementById('custom-keywords');
  const customSections = document.querySelectorAll('.custom-section');
  if (toggleBtn && formContainer) {
    toggleBtn.addEventListener('click', () => {
      isCreateCustomMode = !isCreateCustomMode;
      formContainer.classList.toggle('custom-mode', isCreateCustomMode);
      toggleBtn.textContent = isCreateCustomMode ? '프리셋으로 만들기' : '커스텀으로 만들기';

      // 프리셋 → 커스텀 전환 시 현재 선택을 입력칸에 채워 넣기
      if (isCreateCustomMode) {
        // hidden 속성 제거하여 확실히 표시
        customSections.forEach(s => s.hidden = false);
        if (customTheme) customTheme.value = themeHidden?.value || '';
        if (customKeywords) {
          try {
            const arr = JSON.parse(keywordsHidden?.value || '[]');
            customKeywords.value = arr.join(', ');
          } catch { customKeywords.value = ''; }
        }
      } else {
        // 커스텀 섹션 숨김
        customSections.forEach(s => s.hidden = true);
        // 커스텀 → 프리셋 복귀 시 입력값을 히든에 반영
        syncCreateHiddenFields();
      }
    });
  }

  // 커스텀 입력이 바뀌면 히든에 반영
  [customTheme, customKeywords].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', () => {
      if (isCreateCustomMode) syncCreateHiddenFields();
    });
  });

  // 최초 동기화
  syncCreateHiddenFields();
}

// 현재 모드에 맞게 히든 필드 동기화
function syncCreateHiddenFields() {
  const themeHidden = document.getElementById('book-theme');
  const keywordsHidden = document.getElementById('book-keywords');
  if (isCreateCustomMode) {
    const customTheme = document.getElementById('custom-theme')?.value?.trim() || '';
    const customKW = document.getElementById('custom-keywords')?.value || '';
    const kwArr = customKW.split(',').map(s=>s.trim()).filter(Boolean);
    if (themeHidden) themeHidden.value = customTheme;
    if (keywordsHidden) keywordsHidden.value = JSON.stringify(kwArr);
  } else {
    // 프리셋: 이미 각 이벤트에서 값을 관리함. 안전하게 재수집
    const selectedTheme = document.querySelector('[data-theme-card].selected')?.dataset?.value || themeHidden?.value || '';
    const active = Array.from(document.querySelectorAll('[data-keyword-chip].selected')).map(el=>el.dataset.value);
    if (themeHidden) themeHidden.value = selectedTheme;
    if (keywordsHidden) keywordsHidden.value = JSON.stringify(active);
  }
}

// 프로필 페이지 초기화 (학습용 이미지 업로드/미리보기)
function initProfile() {
  const addBtn = document.getElementById('add-learning-image');
  const input = document.getElementById('learning-file-input');
  const strip = document.getElementById('learning-image-strip');
  if (!addBtn || !input || !strip) {
    // 페이지가 완전히 로드되기 전에 호출될 수 있어 가드만 유지
  }

  addBtn.onclick = () => input.click();
  input.onchange = () => {
    const files = Array.from(input.files || []).slice(0, 4);
    const cells = Array.from(strip.querySelectorAll('.image-cell'));
    files.forEach((file, idx) => {
      const cell = cells[idx] || null;
      if (!cell) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        cell.classList.remove('placeholder');
        cell.innerHTML = `<img src="${e.target.result}" alt="학습 이미지">`;
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  };

  // 뷰 렌더
  renderProfileView();

  // 편집 모달
  const editBtn = document.getElementById('profile-edit-btn');
  const modal = document.getElementById('profile-edit-modal');
  const form = document.getElementById('profile-edit-form');
  const closeBtn = document.getElementById('profile-edit-cancel');
  if (editBtn && modal && form) {
    editBtn.onclick = () => {
      form.name.value = profileData?.name || '';
      form.desc.value = profileData?.desc || '';
      form.tags.value = (profileData?.tags || []).join(', ');
      modal.classList.add('show');
    };
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('show');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      profileData = {
        name: form.name.value.trim() || '우리 아이',
        desc: form.desc.value.trim(),
        tags: form.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
        keywords: profileData?.keywords || ['우정','교훈','우주','왕자']
      };
      saveProfile();
      renderProfileView();
      modal.classList.remove('show');
    });
  }
}

function renderProfileView() {
  const nameEl = document.getElementById('kid-name');
  const metaEl = document.getElementById('kid-meta');
  const tagsEl = document.getElementById('kid-tags');
  if (!nameEl || !metaEl || !tagsEl) return;
  const data = profileData || getDefaultProfile();
  nameEl.textContent = data.name || '우리 아이';
  metaEl.textContent = data.desc || '6살 장난꾸러기';
  tagsEl.innerHTML = '';
  (data.tags || []).forEach((t) => {
    const li = document.createElement('li');
    li.textContent = `#${t.replace(/^#/, '')}`;
    tagsEl.appendChild(li);
  });
}

// 책 생성 함수
// 책 생성 함수
async function generateBook() {
    if (typeof syncCreateHiddenFields === 'function') syncCreateHiddenFields();

    const childInfo  = document.getElementById('child-info')?.value?.trim();
    const bookTitle  = document.getElementById('book-title')?.value?.trim();
    const bookTheme  = document.getElementById('book-theme')?.value?.trim();
    const bookKeywords = document.getElementById('book-keywords')?.value;
    const pageCount  = document.getElementById('page-count')?.value;
    const ttsModel   = document.getElementById('tts-model')?.value;

    if (!childInfo || !bookTitle || !bookTheme || !pageCount || !ttsModel) {
        alert('모든 필드를 입력해주세요!');
        return;
    }

    showLoading();

    let keywordsArr = [];
    try { keywordsArr = JSON.parse(bookKeywords || '[]'); } catch { keywordsArr = []; }
    const outline = `주인공: ${childInfo}\n주제/테마: ${bookTheme}\n키워드: ${keywordsArr.join(', ')}\n페이지 수: ${pageCount}`;

    try {
        const data = await apiFetch("/api/story/make", {
            method: "POST",
            body: JSON.stringify({
                title: bookTitle,
                outline,
                age: "6-8세",
                style: (keywordsArr[0] || "따뜻한"),
                length: pageCount,
                moral: true
            })
        });

        const storyText = String(data.story || "").trim();
        const paragraphs = storyText.split(/\n\s*\n+/).filter(Boolean);

        // API 응답에서 이미지 경로 매핑
        const images = data.images || [];
        const content = paragraphs.map((p, index) => ({
            text: p,
            illustration: images[index]?.file_path || "📖✨" // 이미지 경로 또는 기본값
        }));

        displayGeneratedContent(content);

        const newBook = {
            id: Date.now(),
            title: bookTitle,
            childInfo,
            theme: bookTheme,
            keywords: keywordsArr,
            pageCount: parseInt(pageCount),
            ttsModel,
            content,
            createdAt: new Date().toLocaleDateString()
        };
        generatedBooks.push(newBook);
        saveBooks();

    } catch (err) {
        console.error("책 생성 실패:", err);

        // 백엔드 실패 시 폴백 (로컬 시뮬레이션)
        const content = generateBookContent(childInfo, bookTitle, bookTheme || (keywordsArr[0] || ""), pageCount);
        displayGeneratedContent(content);

        generatedBooks.push({
            id: Date.now(),
            title: bookTitle,
            childInfo,
            theme: bookTheme,
            keywords: keywordsArr,
            pageCount: parseInt(pageCount),
            ttsModel,
            content,
            createdAt: new Date().toLocaleDateString()
        });
        saveBooks();
    } finally {
        hideLoading();
    }
}

// 로딩 상태 표시
function showLoading() {
    const previewArea = document.getElementById('preview-area');
    const generateBtn = document.getElementById('generate-btn');
    if (!previewArea || !generateBtn) return;
    previewArea.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>AI가 ${document.getElementById('child-info').value}를 위한 특별한 동화를 만들고 있어요...</p>
        </div>
    `;
    previewArea.classList.add('loading');
    generateBtn.disabled = true;
    generateBtn.textContent = '생성 중...';
}

// 로딩 상태 숨기기
function hideLoading() {
    const previewArea = document.getElementById('preview-area');
    const generateBtn = document.getElementById('generate-btn');
    if (!previewArea || !generateBtn) return;
    previewArea.classList.remove('loading');
    generateBtn.disabled = false;
    generateBtn.textContent = '출력 생성';
}

// 책 내용 생성 (시뮬레이션)
function generateBookContent(childInfo, title, theme, pageCount) {
    const samplePages = [
        {
            text: `${childInfo}는 마법의 숲에서 특별한 모험을 시작했어요.`,
            illustration: '🌲✨'
        },
        {
            text: `${theme}에 대한 이야기가. 펼쳐지기 시작했답니다.`,
            illustration: '📖🎭'
        },
        {
            text: `용감한 ${childInfo}는 친구들과 함께 문제를 해결해나갔어요.`,
            illustration: '👫🦸'
        },
        {
            text: `모든 모험을 마치고 ${childInfo}는 소중한 것을 깨달았어요.`,
            illustration: '💝🌟'
        },
        {
            text: `그리고 ${childInfo}는 행복하게 살았답니다. 끝!`,
            illustration: '🏠😊'
        }
    ];

    return samplePages.slice(0, Math.min(pageCount, samplePages.length));
}

// 생성된 내용 표시
function displayGeneratedContent(content) {
    const previewArea = document.getElementById('preview-area');
    if (!previewArea) return;
    let html = '<div class="generated-content">';
    html += '<h3>생성된 동화책 미리보기</h3>';
    
    content.forEach((page, index) => {
        html += `
            <div class="preview-page">
                <div class="page-number">페이지 ${index + 1}</div>
                <div class="page-illustration">${page.illustration}</div>
                <div class="page-text">${page.text}</div>
            </div>
        `;
    });
    
    html += '<button class="save-book-btn" onclick="saveCurrentBook()">책 저장하기</button>';
    html += '</div>';
    
    previewArea.innerHTML = html;
}

// 현재 책 저장
function saveCurrentBook() {
    alert('책이 도서관에 저장되었습니다!');
    navigate('library');
}

// 책 도서관 업데이트
function initLibrary() {
  const recentTab = document.querySelector('.sort-tab[data-sort="recent"]');
  const alphaTab = document.querySelector('.sort-tab[data-sort="alpha"]');
  const tabs = [recentTab, alphaTab].filter(Boolean);

  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      updateBookLibrary(tab.dataset.sort);
    })
  );

  // 최초 진입 시 최근 생성순으로 표시
  updateBookLibrary('recent');

  // 카드 영역 이벤트 위임 (열기/메뉴/추가)
  const grid = document.getElementById('book-grid');
  if (!grid) return;
  grid.onclick = (e) => {
    const target = e.target;
    // 메뉴 버튼
    const menuBtn = target.closest('.card-menu-btn');
    if (menuBtn) {
      const menu = menuBtn.parentElement.querySelector('.card-menu');
      if (menu) menu.classList.toggle('show');
      return;
    }
    // 메뉴 항목/오버레이 닫기
    const overlay = target.closest('.card-menu');
    if (overlay) { overlay.classList.remove('show'); return; }
    
    // 메뉴 항목
    const editBtn = target.closest('.card-menu-edit');
    const delBtn = target.closest('.card-menu-delete');
    const cardEl = target.closest('.book-card');
    const bookId = cardEl?.dataset?.id ? Number(cardEl.dataset.id) : null;
    if (editBtn && bookId) {
      const book = generatedBooks.find((b) => b.id === bookId);
      const newTitle = prompt('제목을 수정하세요', book?.title || '');
      if (newTitle && book) {
        book.title = newTitle;
        saveBooks();
        updateBookLibrary(getActiveSort());
      }
      return;
    }
    if (delBtn && bookId) {
      if (confirm('해당 동화를 삭제할까요?')) {
        generatedBooks = generatedBooks.filter((b) => b.id !== bookId);
        saveBooks();
        updateBookLibrary(getActiveSort());
      }
      return;
    }
    // 추가 카드
    const addCard = target.closest('#add-story-card');
    if (addCard) { navigate('create'); return; }
    // 일반 카드 열기 (커버/정보 클릭)
    const openCard = target.closest('.book-card[data-id]');
    if (openCard) {
      const id = Number(openCard.dataset.id);
      if (id) openBook(id);
    }
  };
}

function getActiveSort() {
  const active = document.querySelector('.sort-tab.active');
  return active?.dataset?.sort || 'recent';
}

function updateBookLibrary(sortBy = 'recent') {
  const bookGrid = document.getElementById('book-grid');
  if (!bookGrid) return;

  let books = [...generatedBooks];
  if (sortBy === 'alpha') {
    books.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
  } else {
    books.sort((a, b) => (b.id || 0) - (a.id || 0));
  }

  let html = '';
  books.forEach((book) => {
    const tag1 = book.theme ? `#${book.theme}` : '#창의적인';
    const tag2 = book.childInfo ? `#${book.childInfo}` : '#우주탐험';
    html += `
      <div class="book-card book-item" data-id="${book.id}">
        <div class="book-cover-v2 cover-placeholder">
          <button class="card-menu-btn" type="button">⋯</button>
          <div class="card-menu">
            <div class="card-menu-panel">
              <button class="card-menu-edit" type="button">수정하기</button>
              <button class="card-menu-delete" type="button">삭제하기</button>
            </div>
          </div>
        </div>
        <div class="book-info">
          <div class="book-title">${book.title}</div>
          <div class="book-tags">${tag1} ${tag2}</div>
        </div>
      </div>
    `;
  });

  // 추가 카드
  html += `
    <div class="book-card book-item add-card" id="add-story-card">
      <div class="book-cover-v2">이야기 추가</div>
    </div>
  `;

  bookGrid.innerHTML = html;
}

// 책 열기
function openBook(bookId) {
    const book = generatedBooks.find(b => b.id === bookId);
    if (book) {
        currentBook = book;
        currentBookPage = 0;
        navigate('reader');
    }
}

// 책 읽기 기능 초기화
let currentBook = null;
let currentBookPage = 0;

function initializeReader() {
    const prevBtn = document.querySelector('.prev-page');
    const nextBtn = document.querySelector('.next-page');
    const listenBtn = document.querySelector('.btn-listen'); // 듣기 버튼 선택

    if (prevBtn) {
        prevBtn.addEventListener('click', function() {
            if (currentBook && currentBookPage > 0) {
                currentBookPage--;
                updateReaderContent();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            if (currentBook && currentBookPage < currentBook.content.length - 1) {
                currentBookPage++;
                updateReaderContent();
            }
        });
    }

    if (listenBtn) {
        listenBtn.addEventListener('click', function() {
            playTTSForCurrentPage(); // 동적으로 이벤트 바인딩
        });
    }
}

// 책 읽기 내용 업데이트
function updateReaderContent() {
    if (!currentBook) return;

    const leftPage = document.querySelector('.left-page .page-text');
    const rightPage = document.querySelector('.right-page .page-text');
    const leftImage = document.querySelector('.left-page .page-illustration'); // 이미지 영역
    const rightImage = document.querySelector('.right-page .page-illustration'); // 이미지 영역
    const pageIndicator = document.querySelector('.page-indicator');

    if (currentBookPage < currentBook.content.length) {
        const currentPageContent = currentBook.content[currentBookPage];
        leftPage.innerHTML = `<p>${currentPageContent.text}</p>`;
        leftImage.innerHTML = currentPageContent.illustration 
            ? `<img src="${currentPageContent.illustration}" alt="삽화">` 
            : '<p>이미지가 없습니다.</p>';

        // 다음 페이지가 있으면 오른쪽에 표시
        if (currentBookPage + 1 < currentBook.content.length) {
            const nextPageContent = currentBook.content[currentBookPage + 1];
            rightPage.innerHTML = `<p>${nextPageContent.text}</p>`;
            rightImage.innerHTML = nextPageContent.illustration 
                ? `<img src="${nextPageContent.illustration}" alt="삽화">` 
                : '<p>이미지가 없습니다.</p>';
        } else {
            rightPage.innerHTML = '<p>끝</p>';
            rightImage.innerHTML = '';
        }
    }

    if (pageIndicator) {
        pageIndicator.textContent = `${currentBookPage + 1} / ${currentBook.content.length}`;
    }
}

// 로컬 스토리지에 책 저장
function saveBooks() {
    localStorage.setItem('dreambooks', JSON.stringify(generatedBooks));
}

// 저장된 책 불러오기
function loadSavedBooks() {
    const saved = localStorage.getItem('dreambooks');
    if (saved) {
        generatedBooks = JSON.parse(saved);
    }
}

function getDefaultProfile() {
  return {
    name: '정도훈',
    desc: '6살 장난꾸러기',
    tags: ['용감한', '정의로운', '호기심이 많은'],
    keywords: ['우정','교훈','우주','왕자'],
  };
}

function loadSavedProfile() {
  try {
    const saved = localStorage.getItem('dreambook-profile');
    profileData = saved ? JSON.parse(saved) : getDefaultProfile();
  } catch {
    profileData = getDefaultProfile();
  }
}

function saveProfile() {
  localStorage.setItem('dreambook-profile', JSON.stringify(profileData));
}

// 키보드 단축키
document.addEventListener('keydown', function(e) {
    // ESC 키로 홈으로 돌아가기
    if (e.key === 'Escape') {
        navigate('home');
    }
    
    // 숫자 키로 페이지 전환
    const pageMap = {
        '1': 'home',
        '2': 'create',
        '3': 'library',
        '4': 'profile',
        '5': 'settings'
    };
    
    if (pageMap[e.key]) {
        navigate(pageMap[e.key]);
    }
});

// 폼 자동 저장 기능
function setupAutoSave() {
    const formInputs = document.querySelectorAll('#create-page input, #create-page select');
    
    formInputs.forEach(input => {
        input.addEventListener('input', function() {
            const formData = {};
            formInputs.forEach(inp => {
                formData[inp.id] = inp.value;
            });
            localStorage.setItem('dreambook-form', JSON.stringify(formData));
        });
    });

    // 페이지 로드 시 저장된 데이터 복원
    const savedData = localStorage.getItem('dreambook-form');
    if (savedData) {
        const formData = JSON.parse(savedData);
        Object.keys(formData).forEach(key => {
            const input = document.getElementById(key);
            if (input) {
                input.value = formData[key];
            }
        });
    }
}

// 페이지 로드 완료 후 추가 초기화
window.addEventListener('load', function () {
  // 부드러운 스크롤 효과
  document.documentElement.style.scrollBehavior = 'smooth';

  // 터치 제스처 지원 (모바일)
  let touchStartX = 0;
  let touchEndX = 0;

  document.addEventListener('touchstart', function (e) {
    touchStartX = e.changedTouches[0].screenX;
  });

  document.addEventListener('touchend', function (e) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  });

  function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
      if (currentPage === 'reader') {
        if (diff > 0 && currentBook && currentBookPage < currentBook.content.length - 1) {
          currentBookPage++;
          updateReaderContent();
        } else if (diff < 0 && currentBook && currentBookPage > 0) {
          currentBookPage--;
          updateReaderContent();
        }
      }
    }
  }
});

// CSS 동적 스타일 추가
const additionalStyles = `
    .loading-container {
        text-align: center;
        padding: 40px;
    }
    
    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #007AFF;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .generated-content {
        padding: 20px;
    }
    
    .generated-content h3 {
        color: #007AFF;
        margin-bottom: 20px;
        text-align: center;
    }
    
    .preview-page {
        background: white;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .page-number {
        font-size: 12px;
        color: #666;
        margin-bottom: 10px;
    }
    
    .preview-page .page-illustration {
        font-size: 24px;
        text-align: center;
        margin: 10px 0;
    }
    
    .preview-page .page-text {
        font-size: 16px;
        line-height: 1.5;
        color: #333;
    }
    
    .save-book-btn {
        background: #00C73C;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
        margin-top: 20px;
        width: 100%;
    }
    
    .save-book-btn:hover {
        background: #00b33c;
    }
    
    .book-cover {
        padding: 20px;
        text-align: center;
        height: 200px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 12px;
    }
    
    .book-cover h4 {
        font-size: 18px;
        margin-bottom: 10px;
    }
    
    .book-cover p {
        font-size: 14px;
        opacity: 0.9;
        margin-bottom: 15px;
    }
    
    .book-meta {
        font-size: 12px;
        opacity: 0.8;
    }
    
    .book-meta span {
        display: block;
        margin: 2px 0;
    }
`;

// 동적 스타일 추가
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// SPA 라우터 사용으로 불필요한 중복 로직 제거

// 네이버 로그인 핸들러
function handleNaverLogin() {
    window.location.href = `/api/login/naver`; 
}

// TTS 재생 함수
async function playTTS(storyId) {
  try {
    const response = await apiFetch(`/tts`, {
      method: "POST",
      body: JSON.stringify({ storyId }),
    });

    const audioPath = response.ttsAudioPath;
    if (!audioPath) {
      throw new Error("TTS 오디오 경로를 찾을 수 없습니다.");
    }

    // 오디오 재생
    const audio = new Audio(audioPath);
    audio.play().catch((error) => {
      console.error("오디오 재생 실패:", error);
      alert("오디오를 재생할 수 없습니다. 다시 시도해주세요.");
    });
  } catch (error) {
    console.error("TTS 재생 실패:", error);
    alert("TTS를 재생할 수 없습니다. 다시 시도해주세요.");
  }
}
