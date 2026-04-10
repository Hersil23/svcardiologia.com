/**
 * SVC App — Admin Panel Module
 */
const SVCAdmin = (() => {
  const { el, clearEl, createSkeletons, createEmptyState, animateListIn, animateCardIn,
          formatCurrency, formatDate, downloadCSV, haptic, svgIcon, ICONS } = SVCUtils;
  let currentTab = 'dashboard';

  // ── Switch Sub-Tab ────────────────────────
  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.admin-subview').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));

    const view = document.getElementById(`admin-${tab}`);
    const tabEl = document.querySelector(`.sub-tab[data-tab="${tab}"]`);
    if (view) view.classList.add('active');
    if (tabEl) tabEl.classList.add('active');

    // Load data for the tab
    switch (tab) {
      case 'dashboard': loadDashboard(); break;
      case 'members': SVCMembers.loadMembers(); break;
      case 'payments': SVCPayments.loadPendingPayments(); break;
      case 'events': loadAdminEvents(); break;
      case 'reports': break; // static buttons
    }
  }

  // ── Dashboard ─────────────────────────────
  async function loadDashboard() {
    const container = document.getElementById('admin-dashboard-content');
    if (!container) return;
    clearEl(container).appendChild(createSkeletons(4, 100));

    try {
      const res = await SVC.api.get('reports.php?action=dashboard');
      const s = res.data;
      clearEl(container);

      // Metrics
      const grid = el('div', { class: 'admin-metrics' });
      grid.appendChild(metricCard('Miembros', s.members_total, `${s.members_active} activos`, 'red'));
      grid.appendChild(metricCard('Pagos Pend.', s.payments_pending, 'por aprobar', 'amber'));
      grid.appendChild(metricCard('Ingresos', formatCurrency(s.payments_total_year), 'este año', 'green'));
      grid.appendChild(metricCard('Tickets', s.tickets_sold, `${s.tickets_checked_in} check-ins`, 'blue'));
      container.appendChild(grid);

      // Pending registration requests
      loadPendingRequests(container);

      // Pending ticket purchases
      loadPendingTicketPurchases(container);

      // Revenue sparkline
      if (s.monthly_revenue?.length) {
        container.appendChild(el('h3', { class: 'section-title mb-sm', text: 'Ingresos Mensuales' }));
        container.appendChild(renderSparkline(s.monthly_revenue.map(r => parseFloat(r.total)), 'var(--success)'));
      }

      // New members sparkline
      if (s.monthly_members?.length) {
        container.appendChild(el('h3', { class: 'section-title mb-sm mt-lg', text: 'Nuevos Miembros' }));
        container.appendChild(renderSparkline(s.monthly_members.map(r => parseInt(r.total)), 'var(--red-accent)'));
      }

      // Quick Actions
      container.appendChild(el('h3', { class: 'section-title mb-sm mt-lg', text: 'Acciones Rápidas' }));
      const actions = el('div', { class: 'quick-actions' });
      actions.appendChild(quickAction('Nuevo Miembro', ICONS.plus, () => SVCMembers.showCreateForm()));
      actions.appendChild(quickAction('Aprobar Pagos', ICONS.check, () => switchTab('payments')));
      actions.appendChild(quickAction('Crear Evento', ICONS.calendar, () => showCreateEventForm()));
      actions.appendChild(quickAction('Escanear QR', ICONS.camera, () => SVC.router.navigate('scanner')));
      container.appendChild(actions);

      animateListIn('.metric-card');
    } catch (err) {
      clearEl(container).appendChild(createEmptyState('refresh', err.message, 'Reintentar', loadDashboard));
    }
  }

  function metricCard(label, value, sub, color) {
    return el('div', { class: `metric-card ${color}` }, [
      el('div', { class: 'metric-value', text: String(value), style: { color: `var(--${color === 'red' ? 'red-accent' : color === 'amber' ? 'warning' : color === 'green' ? 'success' : 'info'})` } }),
      el('div', { class: 'metric-label', text: label }),
      el('div', { class: 'metric-change text-muted', text: sub })
    ]);
  }

  function quickAction(label, iconPaths, fn) {
    return el('button', { class: 'quick-action-btn', onClick: () => { haptic(); fn(); } }, [
      svgIcon(iconPaths, 22, 2, 'var(--red-accent)'),
      el('span', { text: label })
    ]);
  }

  // ── SVG Sparkline ─────────────────────────
  function renderSparkline(data, color) {
    if (!data.length) return el('div');
    const wrap = el('div', { class: 'sparkline card', style: { height: '60px', padding: '12px' } });
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 200 40`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = '100%';
    svg.style.height = '100%';

    const max = Math.max(...data, 1);
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * 200;
      const y = 40 - (v / max) * 36;
      return `${x},${y}`;
    }).join(' ');

    // Area
    const area = document.createElementNS(ns, 'polygon');
    area.setAttribute('points', `0,40 ${points} 200,40`);
    area.setAttribute('fill', color);
    area.setAttribute('class', 'sparkline-area');
    svg.appendChild(area);

    // Line
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', points);
    line.setAttribute('stroke', color);
    line.setAttribute('class', 'sparkline-line');
    line.setAttribute('fill', 'none');
    svg.appendChild(line);

    wrap.appendChild(svg);
    return wrap;
  }

  // ── Admin Events ──────────────────────────
  async function loadAdminEvents() {
    const list = document.getElementById('admin-events-content');
    if (!list) return;
    clearEl(list).appendChild(createSkeletons(3));

    try {
      const res = await SVC.api.get('events.php?action=list&per_page=50');
      clearEl(list);

      if (!res.data.items.length) {
        list.appendChild(createEmptyState('calendar', 'No hay eventos', 'Crear evento', showCreateEventForm));
        return;
      }

      res.data.items.forEach(e => {
        const row = el('div', { class: 'admin-event-row', style: { cursor: 'pointer' }, onClick: () => showEditEventForm(e) }, [
          el('div', { class: 'admin-event-info' }, [
            el('div', { class: 'admin-event-title', text: e.title }),
            el('div', { class: 'admin-event-date', text: formatDate(e.starts_at) })
          ]),
          el('div', { class: 'admin-event-attendees', text: String(e.tickets_sold || 0) }),
          SVCUtils.statusBadge(e.is_published ? 'active' : 'pending')
        ]);
        list.appendChild(row);
      });
      animateListIn('.admin-event-row');
    } catch (err) {
      clearEl(list).appendChild(createEmptyState('refresh', err.message));
    }
  }

  // ── Create Event Form ─────────────────────
  function showCreateEventForm() {
    const fields = [
      { id: 'ef-title', label: 'Titulo *', type: 'text' },
      { id: 'ef-desc', label: 'Descripcion', type: 'text' },
      { id: 'ef-location', label: 'Lugar', type: 'text' },
      { id: 'ef-address', label: 'Direccion', type: 'text' },
      { id: 'ef-start', label: 'Fecha inicio *', type: 'datetime-local' },
      { id: 'ef-end', label: 'Fecha fin', type: 'datetime-local' },
      { id: 'ef-max', label: 'Max asistentes', type: 'number' },
    ];

    const content = el('div');
    const inputs = {};

    fields.forEach(f => {
      const group = el('div', { class: 'form-group' }, [
        el('label', { class: 'form-label', text: f.label }),
        el('input', { class: 'form-input', type: f.type, id: f.id })
      ]);
      inputs[f.id] = group.querySelector('input');
      content.appendChild(group);
    });

    // Price field
    const priceGroup = el('div', { class: 'form-group' }, [
      el('label', { class: 'form-label', text: 'Precio del ticket (USD, 0 = gratis)' }),
      el('input', { class: 'form-input', type: 'number', id: 'ef-price', value: '0', step: '0.01' })
    ]);
    inputs['ef-price'] = priceGroup.querySelector('input');
    content.appendChild(priceGroup);

    // Payment methods configuration
    const PAY_METHODS_OPTIONS = [
      { id: 'zelle', label: 'Zelle', placeholder: 'Email Zelle' },
      { id: 'transfer', label: 'Transferencia', placeholder: 'Banco / Cuenta / RIF' },
      { id: 'mobile_payment', label: 'Pago Móvil', placeholder: 'Banco / Teléfono / Cédula' },
      { id: 'cash', label: 'Efectivo', placeholder: 'Dirección / Horario' },
    ];
    content.appendChild(el('label', { class: 'form-label', text: 'Métodos de pago aceptados', style: { marginTop: '12px', display: 'block' } }));
    const payMethodInputs = {};
    PAY_METHODS_OPTIONS.forEach(pm => {
      const check = el('input', { type: 'checkbox', id: 'ef-pay-' + pm.id });
      const details = el('input', { class: 'form-input', type: 'text', placeholder: pm.placeholder, style: { marginTop: '4px', display: 'none' } });
      check.addEventListener('change', () => { details.style.display = check.checked ? '' : 'none'; });
      payMethodInputs[pm.id] = { check, details };
      content.appendChild(el('div', { class: 'form-group', style: { marginBottom: '8px' } }, [
        el('div', { class: 'flex items-center gap-sm' }, [check, el('label', { text: pm.label, class: 'text-sm' })]),
        details
      ]));
    });

    // Image upload
    const imageUploadId = 'ef-image-upload';
    content.appendChild(el('div', { class: 'form-group' }, [
      el('label', { class: 'form-label', text: 'Imagen del evento' }),
      el('div', { id: imageUploadId })
    ]));

    let coverImageUrl = '';
    const imageUploader = new SVCUploader({
      containerId: imageUploadId,
      type: 'evento_imagen',
      contextId: 'event-' + Date.now(),
      accept: 'image/jpeg,image/png,image/webp',
      maxSizeMB: 5,
      label: 'Imagen del evento',
      onSuccess: (data) => {
        if (data.cdn_url) coverImageUrl = data.cdn_url;
      }
    });
    setTimeout(() => imageUploader.render(), 200);

    // Publish toggle
    const publishCheck = el('input', { type: 'checkbox', id: 'ef-publish' });
    publishCheck.checked = true;
    content.appendChild(el('div', { class: 'form-group flex items-center gap-sm' }, [
      publishCheck, el('label', { text: 'Publicar inmediatamente', for: 'ef-publish', class: 'text-sm' })
    ]));

    const submitBtn = el('button', { class: 'btn btn-primary btn-block mt-md', text: 'Crear Evento', onClick: async () => {
      const title = inputs['ef-title'].value.trim();
      const startsAt = inputs['ef-start'].value;
      if (!title) { SVC.toast.warning('Título requerido'); return; }
      if (!startsAt) { SVC.toast.warning('Fecha de inicio requerida'); return; }

      submitBtn.disabled = true;
      const price = parseFloat(inputs['ef-price'].value) || 0;

      // Collect payment methods
      const payMethods = {};
      Object.entries(payMethodInputs).forEach(([key, { check, details }]) => {
        if (check.checked) payMethods[key] = details.value.trim() || key;
      });

      try {
        await SVC.api.post('events.php?action=create', {
          title, description: inputs['ef-desc'].value,
          location: inputs['ef-location'].value, address: inputs['ef-address'].value,
          cover_image_url: coverImageUrl || null,
          starts_at: startsAt, ends_at: inputs['ef-end'].value || null,
          max_attendees: inputs['ef-max'].value ? parseInt(inputs['ef-max'].value) : null,
          is_published: publishCheck.checked ? 1 : 0,
          payment_methods: Object.keys(payMethods).length ? payMethods : null,
          ticket_types: [{ name: 'General', price: price, currency: 'USD' }]
        });
        SVC.modal.close();
        SVC.toast.success('Evento creado');
        loadAdminEvents();
      } catch (err) { SVC.toast.error(err.message); }
      finally { submitBtn.disabled = false; }
    }});
    content.appendChild(submitBtn);

    SVC.modal.openSheet({ title: 'Nuevo Evento', contentElement: content });
  }

  // ── Edit Event Form ──────────────────────
  function showEditEventForm(event) {
    const content = el('div');

    const fields = [
      { id: 'ee-title', label: 'Título *', type: 'text', value: event.title },
      { id: 'ee-desc', label: 'Descripción', type: 'text', value: event.description || '' },
      { id: 'ee-location', label: 'Lugar', type: 'text', value: event.location || '' },
      { id: 'ee-address', label: 'Dirección', type: 'text', value: event.address || '' },
      { id: 'ee-start', label: 'Fecha inicio *', type: 'datetime-local', value: (event.starts_at || '').replace(' ', 'T').substring(0, 16) },
      { id: 'ee-end', label: 'Fecha fin', type: 'datetime-local', value: (event.ends_at || '').replace(' ', 'T').substring(0, 16) },
      { id: 'ee-max', label: 'Máx asistentes', type: 'number', value: event.max_attendees || '' },
    ];

    const inputs = {};
    fields.forEach(f => {
      const input = el('input', { class: 'form-input', type: f.type, id: f.id, value: f.value || '' });
      const group = el('div', { class: 'form-group' }, [
        el('label', { class: 'form-label', text: f.label }),
        input
      ]);
      inputs[f.id] = input;
      content.appendChild(group);
    });

    // Current image preview
    if (event.cover_image_url) {
      const preview = el('div', { class: 'form-group' }, [
        el('label', { class: 'form-label', text: 'Imagen actual' }),
        el('img', { src: event.cover_image_url, style: { width: '100%', maxHeight: '150px', objectFit: 'cover', borderRadius: '10px' } })
      ]);
      content.appendChild(preview);
    }

    // New image upload
    const imageUploadId = 'ee-image-upload';
    content.appendChild(el('div', { class: 'form-group' }, [
      el('label', { class: 'form-label', text: 'Cambiar imagen' }),
      el('div', { id: imageUploadId })
    ]));

    let newImageUrl = '';
    const imageUploader = new SVCUploader({
      containerId: imageUploadId,
      type: 'evento_imagen',
      contextId: 'event-' + event.id,
      accept: 'image/jpeg,image/png,image/webp',
      maxSizeMB: 5,
      label: 'Nueva imagen',
      onSuccess: (data) => { if (data.cdn_url) newImageUrl = data.cdn_url; }
    });
    setTimeout(() => imageUploader.render(), 200);

    // Publish toggle
    const publishCheck = el('input', { type: 'checkbox', id: 'ee-publish' });
    publishCheck.checked = !!event.is_published;
    content.appendChild(el('div', { class: 'form-group flex items-center gap-sm' }, [
      publishCheck, el('label', { text: 'Publicado', for: 'ee-publish', class: 'text-sm' })
    ]));

    // Buttons
    const btnRow = el('div', { style: { display: 'flex', gap: '10px', marginTop: '16px' } });

    btnRow.appendChild(el('button', {
      class: 'btn btn-sm',
      text: 'Eliminar',
      style: { background: 'var(--error-bg)', color: 'var(--error)' },
      onClick: async () => {
        if (!confirm('¿Eliminar este evento?')) return;
        try {
          await SVC.api.del(`events.php?action=delete&id=${event.id}`);
          SVC.modal.close();
          SVC.toast.success('Evento eliminado');
          loadAdminEvents();
        } catch (err) { SVC.toast.error(err.message); }
      }
    }));

    const saveBtn = el('button', { class: 'btn btn-primary', text: 'Guardar cambios', style: { flex: '1' } });
    saveBtn.addEventListener('click', async () => {
      const title = inputs['ee-title'].value.trim();
      if (!title) { SVC.toast.warning('Título requerido'); return; }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
      try {
        const updateData = {
          id: event.id,
          title,
          description: inputs['ee-desc'].value,
          location: inputs['ee-location'].value,
          address: inputs['ee-address'].value,
          starts_at: inputs['ee-start'].value,
          ends_at: inputs['ee-end'].value || null,
          max_attendees: inputs['ee-max'].value ? parseInt(inputs['ee-max'].value) : null,
          is_published: publishCheck.checked ? 1 : 0,
        };
        if (newImageUrl) updateData.cover_image_url = newImageUrl;

        await SVC.api.put('events.php?action=update', updateData);
        SVC.modal.close();
        SVC.toast.success('Evento actualizado');
        loadAdminEvents();
      } catch (err) { SVC.toast.error(err.message); }
      finally { saveBtn.disabled = false; saveBtn.textContent = 'Guardar cambios'; }
    });
    btnRow.appendChild(saveBtn);
    content.appendChild(btnRow);

    SVC.modal.openSheet({ title: 'Editar Evento', contentElement: content });
  }

  // ── Pending Ticket Purchases ──────────────
  async function loadPendingTicketPurchases(container) {
    try {
      const res = await SVC.api.get('ticket-purchases.php?action=pending');
      const purchases = res.data;
      if (!purchases || !purchases.length) return;

      container.appendChild(el('h3', { class: 'section-title mb-sm mt-lg', text: `Compras de Tickets Pendientes (${purchases.length})` }));

      purchases.forEach(p => {
        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        const card = el('div', { class: 'approval-card' }, [
          el('div', { class: 'approval-card-header' }, [
            el('div', { class: 'approval-user' }, [
              el('div', {}, [
                el('div', { class: 'text-sm font-semibold', text: name }),
                el('div', { class: 'text-xs text-muted', text: p.email }),
                el('div', { class: 'text-xs', text: p.event_title, style: { color: 'var(--red-accent)', fontWeight: '600', marginTop: '2px' } })
              ])
            ]),
            el('div', { style: { textAlign: 'right' } }, [
              el('div', { class: 'font-heading font-bold', text: '$' + parseFloat(p.amount).toFixed(2), style: { fontSize: '1.1rem' } }),
              el('div', { class: 'text-xs text-muted', text: p.ticket_type_name })
            ])
          ]),
          el('div', { class: 'text-xs text-muted', text: `${(p.method || '').replace(/_/g, ' ')} — Ref: ${p.reference_number || '—'} — ${formatDate(p.created_at)}`, style: { margin: '8px 0' } })
        ]);

        // Proof link
        if (p.proof_url) {
          card.appendChild(el('a', {
            class: 'btn btn-sm mb-sm',
            text: 'Ver comprobante',
            href: p.proof_url, target: '_blank', rel: 'noopener',
            style: { background: 'rgba(209,16,57,0.08)', color: 'var(--red-accent)', textDecoration: 'none', display: 'inline-flex', fontSize: '0.75rem' }
          }));
        }

        // Action buttons
        card.appendChild(el('div', { class: 'approval-actions' }, [
          p.phone ? el('a', {
            class: 'btn btn-sm',
            text: '💬 WhatsApp',
            style: { background: 'rgba(37,211,102,0.15)', color: '#25D366', textDecoration: 'none' },
            href: `https://wa.me/${(p.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hola Dr. ${p.first_name || ''}, le contactamos respecto a su compra para ${p.event_title}.`)}`,
            target: '_blank', rel: 'noopener'
          }) : null,
          el('button', {
            class: 'btn btn-sm',
            text: 'Rechazar',
            style: { background: 'var(--error-bg)', color: 'var(--error)' },
            onClick: async () => {
              const reason = prompt('Motivo del rechazo:');
              if (reason === null) return;
              try {
                await SVC.api.put('ticket-purchases.php?action=reject', { purchase_id: p.id, reason });
                SVC.toast.success('Compra rechazada');
                loadDashboard();
              } catch (err) { SVC.toast.error(err.message); }
            }
          }),
          el('button', {
            class: 'btn btn-primary btn-sm',
            text: 'Aprobar y generar ticket',
            onClick: async () => {
              try {
                const result = await SVC.api.put('ticket-purchases.php?action=approve', { purchase_id: p.id });
                SVC.toast.success(`Ticket generado: ${result.data?.ticket_uid || 'OK'}`);
                loadDashboard();
              } catch (err) { SVC.toast.error(err.message); }
            }
          })
        ].filter(Boolean)));

        container.appendChild(card);
      });
    } catch (err) {
      console.error('Pending ticket purchases:', err.message);
    }
  }

  // ── Reports / CSV ─────────────────────────
  async function exportMembersCSV() {
    haptic();
    try {
      // Open in new tab for server-side CSV generation
      const token = SVC.auth.getToken();
      window.open(`/api/reports.php?action=members_csv&token=${encodeURIComponent(token)}`, '_blank');
    } catch (err) { SVC.toast.error(err.message); }
  }

  async function exportPaymentsCSV() {
    haptic();
    try {
      const token = SVC.auth.getToken();
      window.open(`/api/reports.php?action=payments_csv&token=${encodeURIComponent(token)}`, '_blank');
    } catch (err) { SVC.toast.error(err.message); }
  }

  // ── Init ──────────────────────────────────
  function init() {
    // Sub-tab clicks
    document.querySelectorAll('.sub-tab[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Export buttons
    const exportMemBtn = document.getElementById('admin-export-members');
    const exportPayBtn = document.getElementById('admin-export-payments');
    if (exportMemBtn) exportMemBtn.addEventListener('click', exportMembersCSV);
    if (exportPayBtn) exportPayBtn.addEventListener('click', exportPaymentsCSV);
  }

  // ── Pending Registration Requests ─────────
  async function loadPendingRequests(container) {
    try {
      const res = await SVC.api.get('register.php?action=pending');
      const requests = res.data;
      if (!requests || !requests.length) return;

      container.appendChild(el('h3', { class: 'section-title mb-sm mt-lg', text: `Solicitudes Pendientes (${requests.length})` }));

      requests.forEach(m => {
        const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
        const initials = (m.first_name?.[0] || '') + (m.last_name?.[0] || '');
        const bioData = m.bio ? JSON.parse(m.bio) : {};
        const tipo = bioData.membership_type || 'asociado';

        const card = el('div', { class: 'approval-card' }, [
          el('div', { class: 'approval-card-header' }, [
            el('div', { class: 'approval-user' }, [
              el('div', { class: 'avatar', text: initials, style: { width: '36px', height: '36px', fontSize: '0.75rem' } }),
              el('div', {}, [
                el('div', { class: 'text-sm font-semibold', text: name }),
                el('div', { class: 'text-xs text-muted', text: m.email }),
                el('div', { class: 'text-xs', text: tipo.charAt(0).toUpperCase() + tipo.slice(1), style: { color: 'var(--red-accent)', fontWeight: '600', marginTop: '2px' } })
              ])
            ]),
            el('div', { class: 'text-xs text-muted', text: formatDate(m.registered_at || m.created_at) })
          ])
        ]);

        // Documents
        if (m.documents && m.documents.length) {
          const docsRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '10px 0' } });
          m.documents.forEach(doc => {
            docsRow.appendChild(el('a', {
              class: 'badge badge-success',
              text: '✓ ' + (doc.upload_type || '').replace(/_/g, ' '),
              href: doc.cdn_url, target: '_blank', rel: 'noopener',
              style: { textDecoration: 'none', cursor: 'pointer', fontSize: '0.65rem' }
            }));
          });
          card.appendChild(docsRow);
        }

        // Payment info
        if (m.payment) {
          card.appendChild(el('div', { class: 'text-xs text-muted', text: `Pago: $${m.payment.amount || '50'} ${m.payment.currency || 'USD'} — ${(m.payment.method || '').replace(/_/g, ' ')}${m.payment.reference_number ? ' — Ref: ' + m.payment.reference_number : ''}` }));
        }

        // Action buttons
        card.appendChild(el('div', { class: 'approval-actions', style: { marginTop: '12px' } }, [
          el('button', {
            class: 'btn btn-sm',
            text: '✗ Rechazar',
            style: { background: 'var(--error-bg)', color: 'var(--error)' },
            onClick: async () => {
              const reason = prompt('Motivo del rechazo:');
              if (reason === null) return;
              try {
                await SVC.api.put('register.php?action=reject', { member_id: m.id, reason });
                SVC.toast.success('Solicitud rechazada');
                loadDashboard();
              } catch (err) { SVC.toast.error(err.message); }
            }
          }),
          el('button', {
            class: 'btn btn-primary btn-sm',
            text: '✓ Aprobar',
            onClick: async () => {
              try {
                const result = await SVC.api.put('register.php?action=approve', { member_id: m.id });
                SVC.toast.success(`Aprobado — NRO: ${result.data?.nro_svc || 'asignado'}`);
                loadDashboard();
              } catch (err) { SVC.toast.error(err.message); }
            }
          })
        ]));

        container.appendChild(card);
      });

      animateListIn('.approval-card');
    } catch (err) {
      // Silently ignore if no pending requests endpoint
      console.error('Pending requests:', err.message);
    }
  }

  return { switchTab, loadDashboard, loadAdminEvents, showCreateEventForm, exportMembersCSV, exportPaymentsCSV, init };
})();
