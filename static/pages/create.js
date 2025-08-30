// Create page module: self-contained setup for preset/custom selection
window.PageCreate = (function(){
  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function syncHiddenFields(state){
    const themeHidden = qs('#book-theme');
    const keywordsHidden = qs('#book-keywords');
    if (!themeHidden || !keywordsHidden) return;

    if (state.isCustom){
      const customTheme = qs('#custom-theme')?.value?.trim() || '';
      const customKW = qs('#custom-keywords')?.value || '';
      const kwArr = customKW.split(',').map(s=>s.trim()).filter(Boolean);
      themeHidden.value = customTheme;
      keywordsHidden.value = JSON.stringify(kwArr);
    } else {
      const selectedTheme = qs('[data-theme-card].selected')?.dataset?.value || themeHidden.value || '';
      const active = qsa('[data-keyword-chip].selected').map(el=>el.dataset.value);
      themeHidden.value = selectedTheme;
      keywordsHidden.value = JSON.stringify(active);
    }
  }

  function initPresetSelection(state){
    // direct listeners
    qsa('[data-theme-card]').forEach((card)=>{
      if (card.dataset.bound) return;
      card.dataset.bound = '1';
      card.addEventListener('click', ()=>{
        qsa('[data-theme-card]').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
        const themeHidden = qs('#book-theme');
        if (themeHidden) themeHidden.value = card.dataset.value || '';
        if (!state.isCustom) syncHiddenFields(state);
      });
    });

    qsa('[data-keyword-chip]').forEach((chip)=>{
      if (chip.dataset.bound) return;
      chip.dataset.bound = '1';
      chip.addEventListener('click', ()=>{
        chip.classList.toggle('selected');
        const keywordsHidden = qs('#book-keywords');
        const active = qsa('[data-keyword-chip].selected').map(el=>el.dataset.value);
        if (keywordsHidden) keywordsHidden.value = JSON.stringify(active);
      });
    });

    // delegated fallback (in case nodes are re-rendered)
    const root = qs('#create-page');
    if (root && !root.dataset.delegated){
      root.dataset.delegated = '1';
      root.addEventListener('click', (e)=>{
        const themeEl = e.target.closest('[data-theme-card]');
        if (themeEl){
          qsa('[data-theme-card]').forEach(c=>c.classList.remove('selected'));
          themeEl.classList.add('selected');
          const themeHidden = qs('#book-theme');
          if (themeHidden) themeHidden.value = themeEl.dataset.value || '';
          if (!state.isCustom) syncHiddenFields(state);
          return;
        }
        const chipEl = e.target.closest('[data-keyword-chip]');
        if (chipEl){
          chipEl.classList.toggle('selected');
          const keywordsHidden = qs('#book-keywords');
          const active = qsa('[data-keyword-chip].selected').map(el=>el.dataset.value);
          if (keywordsHidden) keywordsHidden.value = JSON.stringify(active);
        }
      });
    }

    // preselect based on global profile if available
    try {
      // when profileData exists globally (from script.js)
      // eslint-disable-next-line no-undef
      if (window.profileData?.keywords?.length){
        const defaults = window.profileData.keywords.slice(0,2);
        defaults.forEach((kw)=>{
          const el = qs(`[data-keyword-chip][data-value="${kw}"]`);
          if (el && !el.classList.contains('selected')) el.click();
        });
      }
    } catch(_) {}
  }

  function initCustomToggle(state){
    const btn = qs('#custom-toggle-btn');
    const container = qs('.form-container');
    const customSections = qsa('.custom-section');
    const themeHidden = qs('#book-theme');
    const keywordsHidden = qs('#book-keywords');
    const customTheme = qs('#custom-theme');
    const customKeywords = qs('#custom-keywords');
    if (!btn || !container) return;

    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', ()=>{
      state.isCustom = !state.isCustom;
      container.classList.toggle('custom-mode', state.isCustom);
      btn.textContent = state.isCustom ? '프리셋으로 만들기' : '커스텀으로 만들기';

      if (state.isCustom){
        customSections.forEach(s=>s.hidden=false);
        if (customTheme) customTheme.value = themeHidden?.value || '';
        if (customKeywords){
          try {
            const arr = JSON.parse(keywordsHidden?.value || '[]');
            customKeywords.value = arr.join(', ');
          } catch { customKeywords.value = ''; }
        }
      } else {
        customSections.forEach(s=>s.hidden=true);
      }
      syncHiddenFields(state);
    });

    // reflect custom inputs to hidden
    ;[customTheme, customKeywords].forEach((el)=>{
      if (!el || el.dataset.bound) return;
      el.dataset.bound='1';
      el.addEventListener('input', ()=>{ if (state.isCustom) syncHiddenFields(state); });
    });
  }

  async function generateBook() {
    const childInfo = document.getElementById('child-info')?.value?.trim();
    const bookTitle = document.getElementById('book-title')?.value?.trim();
    const bookTheme = document.getElementById('book-theme')?.value?.trim();
    const bookKeywords = document.getElementById('book-keywords')?.value;
    const pageCount = document.getElementById('page-count')?.value;
    const ttsModel = document.getElementById('tts-model')?.value;

    if (!childInfo || !bookTitle || !bookTheme || !pageCount || !ttsModel) {
      alert('모든 필드를 입력해주세요!');
      return;
    }

    const outline = `주인공: ${childInfo}\n주제/테마: ${bookTheme}\n키워드: ${bookKeywords}\n페이지 수: ${pageCount}`;
    const previewArea = document.getElementById('preview-area');
    previewArea.innerHTML = '<p>AI가 동화를 생성 중입니다...</p>';

    try {
      const response = await fetch('/storybook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bookTitle,
          outline,
          age: '6-8세',
          style: '따뜻한',
          length: pageCount,
          moral: true,
        }),
      });

      if (!response.ok) throw new Error('동화 생성 실패');

      const data = await response.json();
      const story = data.story || '생성된 동화가 없습니다.';
      previewArea.innerHTML = `<p>${story.replace(/\n/g, '<br>')}</p>`;
    } catch (error) {
      console.error(error);
      previewArea.innerHTML = '<p>동화 생성 중 오류가 발생했습니다.</p>';
    }
  }

  function bindGenerate(){
    const btn = qs('#generate-btn');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound='1';
    btn.addEventListener('click', ()=>{
      if (typeof window.generateBook === 'function') {
        window.generateBook();
      }
    });
  }

  function init(){
    const page = qs('#create-page');
    if (!page || page.dataset.inited) return;
    page.dataset.inited = '1';

    const state = { isCustom: false };
    initPresetSelection(state);
    initCustomToggle(state);
    syncHiddenFields(state);
    bindGenerate();
  }

  return { init };
})();
