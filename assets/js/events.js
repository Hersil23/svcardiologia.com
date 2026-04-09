/**
 * SVC App — Events Module
 */
const SVCEvents = (() => {
  const { el, clearEl, createSkeletons, createEmptyState, animateListIn, formatDate, formatDateTime, formatCurrency, startCountdown, haptic } = SVCUtils;
  const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  let countdownIntervals = [];

  // ── Load Events List ──────────────────────
  async function loadEvents(upcoming = false) {
    const list = document.getElementById('events-list-content');
    if (!list) return;
    clearEl(list).appendChild(createSkeletons(3, 240));
    clearCountdowns();

    try {
      const endpoint = upcoming ? 'events.php?action=upcoming&limit=10' : 'events.php?action=list&upcoming=1&per_page=20';
      const res = await SVC.api.get(endpoint);
      clearEl(list);

      const items = upcoming ? res.data : res.data.items;
      if (!items || !items.length) {
        list.appendChild(createEmptyState('calendar', 'No hay eventos próximos'));
        return;
      }

      items.forEach(e => list.appendChild(renderEventCard(e)));
      animateListIn('.event-card');
    } catch (err) {
      clearEl(list).appendChild(createEmptyState('refresh', err.message, 'Reintentar', () => loadEvents(upcoming)));
    }
  }

  function renderEventCard(e) {
    const d = new Date(e.starts_at);
    const card = el('div', { class: 'event-card', onClick: () => showEventDetail(e.id) });

    // Image area
    const imgArea = el('div', { class: 'event-card-image' });
    if (e.cover_image_url) {
      const img = el('img', { alt: e.title });
      img.src = e.cover_image_url;
      imgArea.appendChild(img);
    }

    // Date badge
    const dateBadge = el('div', { class: 'event-card-date' }, [
      el('div', { class: 'event-card-date-day', text: String(d.getDate()) }),
      el('div', { class: 'event-card-date-month', text: MONTHS[d.getMonth()] || '' })
    ]);
    imgArea.appendChild(dateBadge);

    card.appendChild(imgArea);

    // Body
    const body = el('div', { class: 'event-card-body' }, [
      el('div', { class: 'event-card-title', text: e.title }),
      el('div', { class: 'event-card-location', text: e.location || 'Por confirmar' })
    ]);
    card.appendChild(body);

    // Footer
    const price = getMinPrice(e);
    const footer = el('div', { class: 'event-card-footer' });
    footer.appendChild(el('span', { class: `event-card-price${price === 0 ? ' free' : ''}`, text: price === 0 ? 'Gratis' : formatCurrency(price) }));

    if (new Date(e.starts_at) > new Date()) {
      const countdownEl = el('span', { class: 'event-card-countdown' });
      const interval = startCountdown(e.starts_at, countdownEl);
      countdownIntervals.push(interval);
      footer.appendChild(countdownEl);
    }

    card.appendChild(footer);
    return card;
  }

  function getMinPrice(e) {
    if (e.ticket_types?.length) return Math.min(...e.ticket_types.map(t => parseFloat(t.price) || 0));
    return 0;
  }

  function clearCountdowns() {
    countdownIntervals.forEach(i => clearInterval(i));
    countdownIntervals = [];
  }

  // ── Event Detail ──────────────────────────
  async function showEventDetail(id) {
    haptic();
    try {
      const res = await SVC.api.get(`events.php?action=get&id=${id}`);
      const e = res.data;

      const content = el('div', {});

      // Info rows
      const info = el('div', { class: 'event-detail-info' }, [
        infoRow('calendar', formatDateTime(e.starts_at) + (e.ends_at ? ` — ${formatDateTime(e.ends_at)}` : '')),
        infoRow('location', e.location || 'Por confirmar'),
        e.address ? infoRow('map', e.address) : null,
        e.attendees != null ? infoRow('users', `${e.attendees} asistentes`) : null
      ].filter(Boolean));
      content.appendChild(info);

      if (e.description) {
        content.appendChild(el('p', { class: 'event-description', text: e.description }));
      }

      // Ticket types
      if (e.ticket_types?.length) {
        content.appendChild(el('h3', { class: 'section-title mb-md', text: 'Tickets disponibles' }));
        let selectedTT = null;
        const ttContainer = el('div');

        e.ticket_types.forEach(tt => {
          const avail = tt.quantity_available ? `${tt.quantity_available - tt.quantity_sold} disponibles` : 'Disponible';
          const ttCard = el('div', { class: 'ticket-type-card', onClick: () => {
            ttContainer.querySelectorAll('.ticket-type-card').forEach(c => c.classList.remove('selected'));
            ttCard.classList.add('selected');
            selectedTT = tt;
          }}, [
            el('div', {}, [
              el('div', { class: 'ticket-type-name', text: tt.name }),
              tt.description ? el('div', { class: 'ticket-type-desc', text: tt.description }) : null
            ]),
            el('div', { style: { textAlign: 'right' } }, [
              el('div', { class: 'ticket-type-price', text: parseFloat(tt.price) === 0 ? 'Gratis' : formatCurrency(tt.price) }),
              el('div', { class: 'ticket-type-avail', text: avail })
            ])
          ]);
          ttContainer.appendChild(ttCard);
        });
        content.appendChild(ttContainer);

        const buyBtn = el('button', { class: 'btn btn-primary btn-block mt-lg', text: 'Obtener Ticket', onClick: async () => {
          if (!selectedTT) { SVC.toast.warning('Selecciona un tipo de ticket'); return; }
          buyBtn.disabled = true;
          buyBtn.textContent = 'Procesando...';
          try {
            await SVC.api.post('tickets.php?action=purchase', { event_id: e.id, ticket_type_id: selectedTT.id });
            SVC.modal.close();
            SVC.toast.success('Ticket obtenido!');
            if (typeof SVCTickets !== 'undefined') SVCTickets.loadTickets();
          } catch (err) { SVC.toast.error(err.message); }
          finally { buyBtn.disabled = false; buyBtn.textContent = 'Obtener Ticket'; }
        }});
        content.appendChild(buyBtn);
      }

      SVC.modal.openSheet({ title: e.title, contentElement: content });
    } catch (err) { SVC.toast.error(err.message); }
  }

  function infoRow(icon, text) {
    return el('div', { class: 'event-info-row' }, [
      SVCUtils.svgIcon(SVCUtils.ICONS[icon] || SVCUtils.ICONS.calendar, 18, 2, 'var(--red-accent)'),
      el('span', { text })
    ]);
  }

  // ── Home: Upcoming Events ─────────────────
  async function loadHomeEvents() {
    const container = document.getElementById('home-events-content');
    if (!container) return;
    clearEl(container).appendChild(createSkeletons(1, 120));
    try {
      const res = await SVC.api.get('events.php?action=upcoming&limit=3');
      clearEl(container);
      if (!res.data.length) {
        container.appendChild(el('div', { class: 'card-glass', style: { minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [
          el('p', { class: 'text-muted text-sm', text: 'No hay eventos próximos' })
        ]));
        return;
      }
      res.data.forEach(e => container.appendChild(renderEventCard(e)));
    } catch { /* silent */ }
  }

  function init() {
    // Nothing to init at module level - views call loadEvents() on navigate
  }

  return { loadEvents, showEventDetail, loadHomeEvents, clearCountdowns, init };
})();
