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

        // Purchase button → opens full purchase flow
        const buyBtn = el('button', { class: 'btn btn-primary btn-block mt-lg', text: 'Comprar Entrada', onClick: () => {
          if (!selectedTT) { SVC.toast.warning('Selecciona un tipo de entrada'); return; }
          SVC.modal.close();
          showPurchaseFlow(e, selectedTT);
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

  // ── Purchase Flow (full: method → payment → proof → submit) ──
  function showPurchaseFlow(event, ticketType) {
    const content = el('div');
    const price = parseFloat(ticketType.price) || 0;

    // Header
    content.appendChild(el('div', { style: { marginBottom: '20px' } }, [
      el('div', { class: 'text-sm text-muted', text: event.title }),
      el('div', { class: 'font-heading font-bold', text: ticketType.name, style: { fontSize: '1.1rem', marginTop: '4px' } }),
      el('div', { class: 'font-heading', text: price === 0 ? 'Gratis' : '$' + price.toFixed(2) + ' USD', style: { fontSize: '1.5rem', fontWeight: '800', color: 'var(--red-accent)', marginTop: '4px' } })
    ]));

    // Price in Bs
    if (price > 0 && typeof SVCCurrency !== 'undefined') {
      const priceBoxEl = el('div', { id: 'purchase-price-box' });
      content.appendChild(priceBoxEl);
      setTimeout(() => SVCCurrency.renderPriceBox(price, priceBoxEl), 100);
    }

    // Payment method selection
    let selectedMethod = '';
    const payMethods = event.payment_methods ? (typeof event.payment_methods === 'string' ? JSON.parse(event.payment_methods) : event.payment_methods) : { zelle: 'pagos@svcardiologia.com', transfer: 'Banco de Venezuela', mobile_payment: 'Pago Móvil', cash: 'Sede SVC' };

    const METHOD_LABELS = { zelle: 'Zelle', transfer: 'Transferencia', mobile_payment: 'Pago Móvil', cash: 'Efectivo' };
    const METHOD_ICONS = { zelle: '💚', transfer: '🏦', mobile_payment: '📱', cash: '💵' };

    if (price > 0) {
      content.appendChild(el('label', { class: 'form-label', text: 'Método de pago', style: { marginTop: '16px', display: 'block' } }));
      const methodGrid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' } });
      const detailsBox = el('div');

      Object.entries(payMethods).forEach(([key, details]) => {
        const card = el('div', {
          style: { background: 'var(--bg-secondary)', border: '1.5px solid var(--border-subtle)', borderRadius: '12px', padding: '14px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' },
          onClick: () => {
            methodGrid.querySelectorAll('div').forEach(c => { c.style.borderColor = 'var(--border-subtle)'; c.style.background = 'var(--bg-secondary)'; });
            card.style.borderColor = 'var(--red-primary)';
            card.style.background = 'rgba(209,16,57,0.08)';
            selectedMethod = key;
            // Show payment details
            detailsBox.replaceChildren(el('div', { style: { background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' } }, [
              el('div', { class: 'text-sm font-semibold', text: METHOD_LABELS[key] || key, style: { marginBottom: '8px' } }),
              el('div', { class: 'text-sm', text: details, style: { color: 'var(--text-secondary)', whiteSpace: 'pre-line' } })
            ]));
            haptic();
          }
        }, [
          el('div', { text: METHOD_ICONS[key] || '💳', style: { fontSize: '20px', marginBottom: '4px' } }),
          el('div', { text: METHOD_LABELS[key] || key, style: { fontSize: '13px', fontWeight: '600' } })
        ]);
        methodGrid.appendChild(card);
      });

      content.appendChild(methodGrid);
      content.appendChild(detailsBox);

      // Reference number
      const refInput = el('input', { class: 'form-input', type: 'text', placeholder: 'Número de referencia del pago' });
      content.appendChild(el('div', { class: 'form-group' }, [
        el('label', { class: 'form-label', text: 'Número de referencia *' }),
        refInput
      ]));

      // Proof upload
      const uploadId = 'purchase-proof-upload';
      content.appendChild(el('div', { class: 'form-group' }, [
        el('label', { class: 'form-label', text: 'Comprobante de pago *' }),
        el('div', { id: uploadId })
      ]));

      let proofUrl = '';
      const proofUploader = new SVCUploader({
        containerId: uploadId,
        type: 'comprobante_pago',
        contextId: 'purchase-' + event.id,
        accept: 'image/jpeg,image/png,application/pdf',
        maxSizeMB: 5,
        label: 'Comprobante de pago',
        onSuccess: (data) => { if (data.cdn_url) proofUrl = data.cdn_url; }
      });
      setTimeout(() => proofUploader.render(), 200);

      // Submit button
      const submitBtn = el('button', { class: 'btn btn-primary btn-block mt-md', text: 'Enviar Compra' });
      submitBtn.addEventListener('click', async () => {
        if (!selectedMethod) { SVC.toast.warning('Selecciona un método de pago'); return; }
        if (!refInput.value.trim()) { SVC.toast.warning('Ingresa el número de referencia'); return; }
        if (!proofUrl) { SVC.toast.warning('Sube el comprobante de pago'); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
        try {
          await SVC.api.post('ticket-purchases.php?action=submit', {
            event_id: event.id,
            ticket_type_id: ticketType.id,
            amount: price,
            currency: ticketType.currency || 'USD',
            method: selectedMethod,
            reference_number: refInput.value.trim(),
            proof_url: proofUrl
          });
          SVC.modal.close();
          SVC.toast.success('Compra enviada. Te notificaremos cuando sea aprobada.');
        } catch (err) { SVC.toast.error(err.message); }
        finally { submitBtn.disabled = false; submitBtn.textContent = 'Enviar Compra'; }
      });
      content.appendChild(submitBtn);

    } else {
      // Free ticket — direct purchase
      const getBtn = el('button', { class: 'btn btn-primary btn-block mt-md', text: 'Obtener Entrada Gratis' });
      getBtn.addEventListener('click', async () => {
        getBtn.disabled = true;
        try {
          await SVC.api.post('tickets.php?action=purchase', { event_id: event.id, ticket_type_id: ticketType.id });
          SVC.modal.close();
          SVC.toast.success('Entrada obtenida!');
          if (typeof SVCTickets !== 'undefined') SVCTickets.loadTickets();
        } catch (err) { SVC.toast.error(err.message); }
        finally { getBtn.disabled = false; }
      });
      content.appendChild(getBtn);
    }

    SVC.modal.openSheet({ title: 'Comprar Entrada', contentElement: content });
  }

  return { loadEvents, showEventDetail, loadHomeEvents, clearCountdowns, init };
})();
