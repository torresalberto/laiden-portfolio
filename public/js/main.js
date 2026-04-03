(function() {
  const slides = document.querySelectorAll('.slide');
  const totalSlides = slides.length;
  let currentSlide = 0;
  let autoAdvance;
  const AUTO_ADVANCE_DELAY = 5000;

  function showSlide(index) {
    slides.forEach(slide => slide.classList.remove('active'));
    slides[index].classList.add('active');
    currentSlide = index;
  }

  function nextSlide() {
    const next = (currentSlide + 1) % totalSlides;
    showSlide(next);
  }

  function prevSlide() {
    const prev = (currentSlide - 1 + totalSlides) % totalSlides;
    showSlide(prev);
  }

  function startAutoAdvance() {
    stopAutoAdvance();
    autoAdvance = setInterval(nextSlide, AUTO_ADVANCE_DELAY);
  }

  function stopAutoAdvance() {
    if (autoAdvance) {
      clearInterval(autoAdvance);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      nextSlide();
      startAutoAdvance();
    } else if (e.key === 'ArrowLeft') {
      prevSlide();
      startAutoAdvance();
    } else if (e.key === 'Escape') {
      stopAutoAdvance();
    }
  });

  document.addEventListener('click', (e) => {
    const rect = document.body.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    
    if (clickX > width * 0.6) {
      nextSlide();
    } else if (clickX < width * 0.4) {
      prevSlide();
    }
    startAutoAdvance();
  });

  document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    window.touchStartX = touch.clientX;
  });

  document.addEventListener('touchend', (e) => {
    if (!window.touchStartX) return;
    
    const touch = e.changedTouches[0];
    const diff = window.touchStartX - touch.clientX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
      startAutoAdvance();
    }
    
    window.touchStartX = null;
  });

  showSlide(0);
  startAutoAdvance();
})();