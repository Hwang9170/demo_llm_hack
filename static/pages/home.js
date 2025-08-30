window.PageHome = {
  init() {
    const naverBtn = document.getElementById('home-naver-btn');
    const startAlt = document.querySelector('.btn-start-alt');
    const explore = document.querySelector('.btn-explore');
    if (naverBtn) naverBtn.addEventListener('click', handleNaverLogin);
    if (startAlt) startAlt.addEventListener('click', () => navigate('create'));
    if (explore) explore.addEventListener('click', () => navigate('library'));
  }
};

