/**
 * SVC App — News Module
 * Carousel feed with overlay detail + comments
 */
const SVCNews = (() => {
  const { el, clearEl, haptic } = SVCUtils;
  let autoRotateTimer = null;
  let currentSlide = 0;
  let newsData = [];

  function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} d`;
    return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
  }

  const CAT_LABELS = { anuncio: 'Anuncio', comunicado: 'Comunicado', convocatoria: 'Convocatoria', reconocimiento: 'Reconocimiento' };

  // ── Load carousel for Home ───────────────
  async function loadNewsFeed(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const res = await SVC.api.get('news.php?action=list&limit=10');
      newsData = res.data || [];
      clearEl(container);

      if (!newsData.length) {
        container.appendChild(el('div', { class: 'card', style: { minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [
          el('p', { class: 'text-muted text-sm', text: 'Sin anuncios recientes' })
        ]));
        return;
      }

      // Build carousel
      const carousel = el('div', { class: 'news-carousel' });
      const track = el('div', { class: 'news-carousel-track' });

      newsData.forEach((n, i) => {
        const slide = buildSlide(n, i);
        track.appendChild(slide);
      });

      carousel.appendChild(track);

      // Navigation arrows (desktop)
      if (newsData.length > 1) {
        const prevBtn = el('button', { class: 'news-carousel-arrow news-carousel-prev', onClick: () => { stopAutoRotate(); goToSlide(currentSlide - 1); } });
        prevBtn.appendChild(SVCUtils.svgIcon(['M15 18l-6-6 6-6'], 20, 2.5, 'white'));
        const nextBtn = el('button', { class: 'news-carousel-arrow news-carousel-next', onClick: () => { stopAutoRotate(); goToSlide(currentSlide + 1); } });
        nextBtn.appendChild(SVCUtils.svgIcon(['M9 18l6-6-6-6'], 20, 2.5, 'white'));
        carousel.append(prevBtn, nextBtn);

        // Dots
        const dots = el('div', { class: 'news-carousel-dots' });
        newsData.forEach((_, i) => {
          const dot = el('div', { class: `news-carousel-dot${i === 0 ? ' active' : ''}`, onClick: () => { stopAutoRotate(); goToSlide(i); } });
          dots.appendChild(dot);
        });
        carousel.appendChild(dots);
      }

      container.appendChild(carousel);

      // Touch/swipe support
      let touchStartX = 0;
      track.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; stopAutoRotate(); }, { passive: true });
      track.addEventListener('touchend', (e) => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) goToSlide(currentSlide + (diff > 0 ? 1 : -1));
      });

      // Start auto-rotate
      if (newsData.length > 1) startAutoRotate();

    } catch (err) {
      console.error('News feed error:', err.message);
    }
  }

  function buildSlide(n, index) {
    const slide = el('div', { class: 'news-slide', 'data-index': String(index) });

    // Click to open overlay
    const clickArea = el('div', { class: 'news-slide-content', onClick: () => openOverlay(n) });

    if (n.image_url) {
      const imgWrap = el('div', { class: 'news-slide-image' });
      const img = el('img', { alt: n.title });
      img.src = n.image_url;
      imgWrap.appendChild(img);
      clickArea.appendChild(imgWrap);
    }

    // Overlay info on the image
    const info = el('div', { class: 'news-slide-info' });
    if (n.is_pinned) info.appendChild(el('span', { class: 'news-slide-pinned', text: 'Fijado' }));
    info.appendChild(el('div', { class: 'news-slide-title', text: n.title }));

    const authorName = `Dr. ${n.author_first_name || ''} ${n.author_last_name || ''}`.trim();
    info.appendChild(el('div', { class: 'news-slide-meta', text: `${authorName} · ${timeAgo(n.published_at || n.created_at)}` }));

    const stats = el('div', { class: 'news-slide-stats' });
    stats.appendChild(el('span', { text: `${n.like_count || 0} me gusta` }));
    stats.appendChild(el('span', { text: `${n.comment_count || 0} comentarios` }));
    info.appendChild(stats);

    clickArea.appendChild(info);
    slide.appendChild(clickArea);

    return slide;
  }

  // ── Carousel Navigation ──────────────────
  function goToSlide(index) {
    const total = newsData.length;
    if (total <= 1) return;
    currentSlide = ((index % total) + total) % total;
    const track = document.querySelector('.news-carousel-track');
    if (track) track.style.transform = `translateX(-${currentSlide * 100}%)`;
    // Update dots
    document.querySelectorAll('.news-carousel-dot').forEach((d, i) => d.classList.toggle('active', i === currentSlide));
  }

  function startAutoRotate() {
    stopAutoRotate();
    autoRotateTimer = setInterval(() => goToSlide(currentSlide + 1), 5000);
  }

  function stopAutoRotate() {
    if (autoRotateTimer) { clearInterval(autoRotateTimer); autoRotateTimer = null; }
  }

  // ── Overlay (superposición) ──────────────
  function openOverlay(n) {
    haptic();
    stopAutoRotate();

    // Remove existing overlay
    const existing = document.getElementById('news-overlay');
    if (existing) existing.remove();

    const overlay = el('div', { class: 'news-overlay', id: 'news-overlay' });

    const card = el('div', { class: 'news-overlay-card' });

    // Close button
    const closeBtn = el('button', { class: 'news-overlay-close', onClick: () => { overlay.remove(); startAutoRotate(); } });
    closeBtn.appendChild(SVCUtils.svgIcon(['M18 6L6 18', 'M6 6l12 12'], 20, 2.5, 'white'));
    card.appendChild(closeBtn);

    // Header
    const authorName = `Dr. ${n.author_first_name || ''} ${n.author_last_name || ''}`.trim();
    const initials = (n.author_first_name?.[0] || '') + (n.author_last_name?.[0] || '');
    card.appendChild(el('div', { class: 'news-card-header' }, [
      el('div', { class: 'news-card-avatar', text: initials || 'SVC' }),
      el('div', { class: 'news-card-author' }, [
        el('div', { class: 'news-card-author-name', text: authorName || 'SVC' }),
        el('div', { class: 'news-card-author-sub', text: timeAgo(n.published_at || n.created_at) })
      ]),
      el('span', { class: `news-card-category news-cat-${n.category || 'anuncio'}`, text: CAT_LABELS[n.category] || 'Anuncio' })
    ]));

    // Image
    if (n.image_url) {
      card.appendChild(el('div', { class: 'news-card-image' }, [
        el('img', { src: n.image_url, alt: n.title })
      ]));
    }

    // Actions (like + comment icon)
    const heartSvg = SVCUtils.svgIcon(['M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z'], 22, 2, 'currentColor');
    const likeBtn = el('button', { class: 'news-like-btn' });
    likeBtn.appendChild(heartSvg);
    const likeCountEl = el('span', { class: 'news-like-count', text: (n.like_count || 0) > 0 ? String(n.like_count) : '' });
    likeBtn.appendChild(likeCountEl);
    likeBtn.addEventListener('click', async () => {
      haptic();
      try {
        const r = await SVC.api.post('news.php?action=like', { news_id: n.id });
        if (r.data.liked) { likeBtn.classList.add('liked'); heartSvg.setAttribute('fill', 'currentColor'); }
        else { likeBtn.classList.remove('liked'); heartSvg.setAttribute('fill', 'none'); }
        likeCountEl.textContent = r.data.count > 0 ? String(r.data.count) : '';
      } catch (err) { SVC.toast.error(err.message); }
    });

    card.appendChild(el('div', { class: 'news-card-actions' }, [likeBtn]));

    // Body
    card.appendChild(el('div', { class: 'news-card-body' }, [
      el('div', { class: 'news-card-title', text: n.title }),
      el('div', { class: 'news-card-text', text: n.body })
    ]));

    // Comments section
    const commentsWrap = el('div', { class: 'news-overlay-comments' });
    const commentsList = el('div', { class: 'news-comments-list' });
    commentsWrap.appendChild(commentsList);

    // Load comments
    loadComments(n.id, commentsList);

    // Comment input
    const commentInput = el('input', { class: 'news-comment-input', type: 'text', placeholder: 'Escribe un comentario...', maxlength: '300' });
    const sendSvg = SVCUtils.svgIcon(['M22 2L11 13', 'M22 2L15 22L11 13L2 9L22 2'], 16, 2, 'white');
    const sendBtn = el('button', { class: 'news-comment-send' });
    sendBtn.appendChild(sendSvg);

    sendBtn.addEventListener('click', async () => {
      const text = commentInput.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      try {
        const r = await SVC.api.post('news.php?action=comment', { news_id: n.id, comment: text });
        if (r.data) {
          commentsList.querySelector('.text-muted')?.remove();
          commentsList.appendChild(renderComment(r.data));
          commentInput.value = '';
          haptic();
          commentsList.scrollTop = commentsList.scrollHeight;
        }
      } catch (err) { SVC.toast.error(err.message); }
      finally { sendBtn.disabled = false; }
    });

    commentInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendBtn.click(); });
    commentsWrap.appendChild(el('div', { class: 'news-comment-input-wrap' }, [commentInput, sendBtn]));

    card.appendChild(commentsWrap);
    overlay.appendChild(card);

    // Click backdrop to close
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); startAutoRotate(); } });

    document.body.appendChild(overlay);

    // Animate in
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(card, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out' });
    }
  }

  async function loadComments(newsId, commentsList) {
    try {
      const res = await SVC.api.get(`news.php?action=get&id=${newsId}`);
      const comments = res.data?.comments || [];
      clearEl(commentsList);
      if (!comments.length) {
        commentsList.appendChild(el('p', { class: 'text-muted text-sm text-center', text: 'Sé el primero en comentar', style: { padding: '10px 0' } }));
      } else {
        comments.forEach(c => commentsList.appendChild(renderComment(c)));
      }
    } catch { /* silent */ }
  }

  function renderComment(c) {
    const name = `Dr. ${c.first_name || ''} ${c.last_name || ''}`.trim();
    const initials = (c.first_name?.[0] || '') + (c.last_name?.[0] || '');
    return el('div', { class: 'news-comment' }, [
      el('div', { class: 'news-comment-avatar', text: initials || '?' }),
      el('div', { class: 'news-comment-body' }, [
        el('div', { class: 'news-comment-author' }, [
          document.createTextNode(name),
          c.specialty ? el('span', { text: c.specialty }) : null
        ].filter(Boolean)),
        el('div', { class: 'news-comment-text', text: c.comment }),
        el('div', { class: 'news-comment-time', text: timeAgo(c.created_at) })
      ])
    ]);
  }

  return { loadNewsFeed, openOverlay };
})();
