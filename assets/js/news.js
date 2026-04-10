/**
 * SVC App — News Module
 * Instagram-style feed with comments
 */
const SVCNews = (() => {
  const { el, clearEl, haptic } = SVCUtils;

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

  // ── Load news feed for Home ──────────────
  async function loadNewsFeed(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const res = await SVC.api.get('news.php?action=list&limit=5');
      const news = res.data;
      clearEl(container);

      if (!news || !news.length) {
        container.appendChild(el('div', { class: 'card', style: { minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [
          el('p', { class: 'text-muted text-sm', text: 'Sin anuncios recientes' })
        ]));
        return;
      }

      const feed = el('div', { class: 'news-feed' });
      news.forEach(n => feed.appendChild(renderNewsCard(n)));
      container.appendChild(feed);
    } catch (err) {
      console.error('News feed error:', err.message);
    }
  }

  // ── Render a news card ───────────────────
  function renderNewsCard(n) {
    const card = el('div', { class: 'news-card' });
    const authorName = `Dr. ${n.author_first_name || ''} ${n.author_last_name || ''}`.trim();
    const initials = (n.author_first_name?.[0] || '') + (n.author_last_name?.[0] || '');

    // Header (author + category)
    card.appendChild(el('div', { class: 'news-card-header' }, [
      el('div', { class: 'news-card-avatar', text: initials || 'SVC' }),
      el('div', { class: 'news-card-author' }, [
        el('div', { class: 'news-card-author-name', text: authorName || 'SVC' }),
        el('div', { class: 'news-card-author-sub', text: timeAgo(n.published_at || n.created_at) })
      ]),
      el('span', { class: `news-card-category news-cat-${n.category || 'anuncio'}`, text: CAT_LABELS[n.category] || 'Anuncio' })
    ]));

    // Image (Instagram-style square)
    if (n.image_url) {
      const imgWrap = el('div', { class: 'news-card-image' });
      const img = el('img', { alt: n.title });
      img.src = n.image_url;
      imgWrap.appendChild(img);
      card.appendChild(imgWrap);
    }

    // Body
    const body = el('div', { class: 'news-card-body' });
    if (n.is_pinned) {
      body.appendChild(el('div', { class: 'news-card-pinned', text: 'Fijado' }));
    }
    body.appendChild(el('div', { class: 'news-card-title', text: n.title }));
    body.appendChild(el('div', { class: 'news-card-text', text: n.body }));
    card.appendChild(body);

    // Actions bar (like + comment)
    const likeCount = n.like_count || 0;
    const commentCount = n.comment_count || 0;

    // Heart SVG (outline)
    const heartOutline = ['M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z'];
    const heartSvg = SVCUtils.svgIcon(heartOutline, 22, 2, 'currentColor');

    const likeBtn = el('button', { class: 'news-like-btn' });
    likeBtn.appendChild(heartSvg);
    likeBtn.appendChild(el('span', { class: 'news-like-count', text: likeCount > 0 ? String(likeCount) : '' }));
    likeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      haptic();
      try {
        const res = await SVC.api.post('news.php?action=like', { news_id: n.id });
        const countEl = likeBtn.querySelector('.news-like-count');
        if (res.data.liked) {
          likeBtn.classList.add('liked');
          heartSvg.setAttribute('fill', 'currentColor');
        } else {
          likeBtn.classList.remove('liked');
          heartSvg.setAttribute('fill', 'none');
        }
        if (countEl) countEl.textContent = res.data.count > 0 ? String(res.data.count) : '';
      } catch (err) { SVC.toast.error(err.message); }
    });

    const commentSvg = SVCUtils.svgIcon(['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'], 20, 2, 'currentColor');
    const commentBtn = el('button', { class: 'news-comment-action-btn', onClick: () => openNewsDetail(n.id) });
    commentBtn.appendChild(commentSvg);
    commentBtn.appendChild(el('span', { text: commentCount > 0 ? String(commentCount) : '' }));

    card.appendChild(el('div', { class: 'news-card-actions' }, [likeBtn, commentBtn]));

    // Comments link
    if (commentCount > 0) {
      card.appendChild(el('button', { class: 'news-card-comments-btn', text: `Ver ${commentCount} comentario${commentCount > 1 ? 's' : ''}`, onClick: () => openNewsDetail(n.id) }));
    }

    return card;
  }

  // ── Open news detail with comments ───────
  async function openNewsDetail(newsId) {
    haptic();
    try {
      const res = await SVC.api.get(`news.php?action=get&id=${newsId}`);
      const n = res.data;

      const content = el('div');

      // Image
      if (n.image_url) {
        content.appendChild(el('div', { style: { width: '100%', aspectRatio: '1/1', overflow: 'hidden', borderRadius: '12px', marginBottom: '16px' } }, [
          el('img', { src: n.image_url, alt: n.title, style: { width: '100%', height: '100%', objectFit: 'cover' } })
        ]));
      }

      // Body
      if (n.is_pinned) {
        content.appendChild(el('div', { class: 'news-card-pinned', text: 'Fijado' }));
      }
      content.appendChild(el('div', { class: 'news-card-title', text: n.title, style: { fontSize: '1.1rem', marginBottom: '8px' } }));
      content.appendChild(el('div', { class: 'news-card-text', text: n.body, style: { marginBottom: '16px' } }));

      const authorName = `Dr. ${n.author_first_name || ''} ${n.author_last_name || ''}`.trim();
      content.appendChild(el('div', { class: 'news-card-time', text: `${authorName} · ${timeAgo(n.published_at || n.created_at)}`, style: { marginBottom: '16px' } }));

      // Comments list
      content.appendChild(el('div', { style: { height: '1px', background: 'var(--border-subtle)', margin: '0 0 12px' } }));
      content.appendChild(el('div', { class: 'text-sm font-semibold', text: `Comentarios (${(n.comments || []).length})`, style: { marginBottom: '8px', color: 'var(--text-secondary)' } }));

      const commentsList = el('div', { class: 'news-comments-list' });
      (n.comments || []).forEach(c => {
        commentsList.appendChild(renderComment(c));
      });
      if (!n.comments?.length) {
        commentsList.appendChild(el('p', { class: 'text-muted text-sm text-center', text: 'Sé el primero en comentar', style: { padding: '12px 0' } }));
      }
      content.appendChild(commentsList);

      // Comment input
      const inputWrap = el('div', { class: 'news-comment-input-wrap' });
      const commentInput = el('input', { class: 'news-comment-input', type: 'text', placeholder: 'Escribe un comentario...', maxlength: '300' });

      const sendSvg = SVCUtils.svgIcon(['M22 2L11 13', 'M22 2L15 22L11 13L2 9L22 2'], 16, 2, 'white');
      const sendBtn = el('button', { class: 'news-comment-send' });
      sendBtn.appendChild(sendSvg);

      sendBtn.addEventListener('click', async () => {
        const text = commentInput.value.trim();
        if (!text) return;

        sendBtn.disabled = true;
        try {
          const res = await SVC.api.post('news.php?action=comment', { news_id: newsId, comment: text });
          if (res.data) {
            commentsList.appendChild(renderComment(res.data));
            commentInput.value = '';
            haptic();
            // Remove "Sé el primero" message
            const emptyMsg = commentsList.querySelector('.text-muted');
            if (emptyMsg) emptyMsg.remove();
          }
        } catch (err) { SVC.toast.error(err.message); }
        finally { sendBtn.disabled = false; }
      });

      // Enter to send
      commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendBtn.click();
      });

      inputWrap.append(commentInput, sendBtn);
      content.appendChild(inputWrap);

      SVC.modal.openSheet({ title: n.title, contentElement: content });
    } catch (err) { SVC.toast.error(err.message); }
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

  return { loadNewsFeed, openNewsDetail };
})();
