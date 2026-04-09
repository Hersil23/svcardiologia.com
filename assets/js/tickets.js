/**
 * SVC App — Tickets Module
 */
const SVCTickets = (() => {
  const { el, clearEl, createSkeletons, createEmptyState, animateListIn, formatDate, formatDateTime, statusBadge, haptic } = SVCUtils;

  // ── Load User's Tickets ───────────────────
  async function loadTickets() {
    const list = document.getElementById('tickets-list-content');
    if (!list) return;
    clearEl(list).appendChild(createSkeletons(3, 160));

    try {
      const res = await SVC.api.get('tickets.php?action=my');
      clearEl(list);

      if (!res.data.length) {
        list.appendChild(createEmptyState('ticket', 'Aun no tienes tickets', 'Ver eventos', () => SVC.router.navigate('events')));
        return;
      }

      res.data.forEach(t => list.appendChild(renderTicketCard(t)));
      animateListIn('.ticket-card');

      // Generate QR codes after cards are in DOM
      requestAnimationFrame(() => {
        res.data.forEach(t => generateMiniQR(`ticket-qr-${t.id}`, t.qr_token));
      });
    } catch (err) {
      clearEl(list).appendChild(createEmptyState('refresh', err.message, 'Reintentar', loadTickets));
    }
  }

  function renderTicketCard(t) {
    const isUsed = t.status === 'used';
    const card = el('div', { class: `ticket-card${isUsed ? ' used' : ''}`, onClick: () => showTicketDetail(t.id) });

    // Header
    card.appendChild(el('div', { class: 'ticket-card-header' }, [
      el('div', { class: 'ticket-card-event', text: t.event_title }),
      el('div', { class: 'ticket-card-uid', text: t.uid })
    ]));

    // Tear
    const tear = el('div', { class: 'ticket-card-tear' });
    tear.appendChild(el('div', { class: 'ticket-card-tear-line' }));
    card.appendChild(tear);

    // Body
    card.appendChild(el('div', { class: 'ticket-card-body' }, [
      el('div', { class: 'ticket-card-qr', id: `ticket-qr-${t.id}` }),
      el('div', { class: 'ticket-card-info' }, [
        el('div', { class: 'ticket-card-type', text: t.ticket_type_name }),
        el('div', { class: 'ticket-card-date', text: formatDate(t.event_date) }),
        el('div', { class: 'ticket-card-status' }, [statusBadge(t.status)])
      ])
    ]));

    return card;
  }

  // ── Ticket Detail ─────────────────────────
  async function showTicketDetail(id) {
    haptic();
    try {
      const res = await SVC.api.get(`tickets.php?action=get&id=${id}`);
      const t = res.data;

      const content = el('div', { class: 'ticket-detail' });

      // Header
      content.appendChild(el('div', { class: 'ticket-detail-header' }, [
        el('div', { class: 'ticket-detail-event', text: t.event_title }),
        el('div', { class: 'ticket-detail-uid', text: t.uid })
      ]));

      // QR
      const qrBox = el('div', { class: 'ticket-detail-qr', id: 'ticket-detail-qr' });
      content.appendChild(qrBox);

      // Name
      content.appendChild(el('div', { class: 'ticket-detail-name', text: `${t.first_name || ''} ${t.last_name || ''}` }));
      content.appendChild(statusBadge(t.status));

      // Info grid
      content.appendChild(el('div', { class: 'ticket-detail-info' }, [
        fieldItem('Tipo', t.ticket_type_name),
        fieldItem('Precio', SVCUtils.formatCurrency(t.ticket_price)),
        fieldItem('Fecha', formatDateTime(t.event_date)),
        fieldItem('Lugar', t.event_location || '—'),
        t.cedula ? fieldItem('Cedula', t.cedula) : null,
        t.checked_in_at ? fieldItem('Check-in', formatDateTime(t.checked_in_at)) : null,
      ].filter(Boolean)));

      // Actions
      const actions = el('div', { class: 'ticket-detail-actions' });

      if (navigator.share) {
        actions.appendChild(el('button', { class: 'btn btn-secondary btn-sm', text: 'Compartir', onClick: () => {
          navigator.share({ title: `Ticket: ${t.event_title}`, text: `Mi ticket ${t.uid} para ${t.event_title}` }).catch(() => {});
        }}));
      }

      actions.appendChild(el('button', { class: 'btn btn-primary btn-sm', text: 'Cerrar', onClick: () => SVC.modal.close() }));
      content.appendChild(actions);

      SVC.modal.openSheet({ title: 'Mi Ticket', contentElement: content });

      // Generate QR after DOM insert
      requestAnimationFrame(() => generateQR('ticket-detail-qr', t.qr_token));
    } catch (err) { SVC.toast.error(err.message); }
  }

  function fieldItem(label, value) {
    return el('div', {}, [
      el('div', { class: 'ticket-detail-field-label', text: label }),
      el('div', { class: 'ticket-detail-field-value', text: value || '—' })
    ]);
  }

  // ── QR Generation ─────────────────────────
  function generateQR(containerId, token) {
    const container = document.getElementById(containerId);
    if (!container || !token || typeof QRCode === 'undefined') return;
    clearEl(container);
    try {
      new QRCode(container, {
        text: token,
        width: 180,
        height: 180,
        colorDark: '#0A0A0F',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch { /* QRCode lib not loaded */ }
  }

  function generateMiniQR(containerId, token) {
    const container = document.getElementById(containerId);
    if (!container || !token || typeof QRCode === 'undefined') return;
    clearEl(container);
    try {
      new QRCode(container, {
        text: token,
        width: 64,
        height: 64,
        colorDark: '#0A0A0F',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch { /* QRCode lib not loaded */ }
  }

  function init() {}

  return { loadTickets, showTicketDetail, generateQR, init };
})();
