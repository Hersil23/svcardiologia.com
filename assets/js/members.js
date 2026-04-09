/**
 * SVC App — Members Module
 */
const SVCMembers = (() => {
  const { el, clearEl, createSkeletons, createEmptyState, animateListIn, debounce, statusBadge, formatDate, haptic } = SVCUtils;
  let currentPage = 1;
  let currentSearch = '';
  let currentStatus = '';

  // ── Load & Render List ────────────────────
  async function loadMembers(page = 1, search = '', status = '') {
    currentPage = page;
    currentSearch = search;
    currentStatus = status;
    const list = document.getElementById('members-list-content');
    if (!list) return;
    clearEl(list).appendChild(createSkeletons(5));

    try {
      const params = new URLSearchParams({ page, per_page: 20 });
      if (search) params.set('search', search);
      if (status) params.set('status', status);

      const res = await SVC.api.get(`members.php?action=list&${params}`);
      clearEl(list);

      if (!res.data.items.length) {
        list.appendChild(createEmptyState('user', 'No se encontraron miembros'));
        return;
      }

      res.data.items.forEach(m => list.appendChild(renderMemberCard(m)));
      animateListIn('#members-list-content .member-card');

      // Pagination
      renderPagination(document.getElementById('members-pagination'), res.data);
    } catch (err) {
      clearEl(list).appendChild(createEmptyState('refresh', err.message, 'Reintentar', () => loadMembers(page, search, status)));
    }
  }

  function renderMemberCard(m) {
    const initials = (m.first_name?.[0] || '') + (m.last_name?.[0] || '');
    const card = el('div', { class: 'member-card', onClick: () => showMemberDetail(m.id) }, [
      el('div', { class: 'member-avatar', text: initials }),
      el('div', { class: 'member-info' }, [
        el('div', { class: 'member-name', text: `${m.first_name} ${m.last_name}` }),
        el('div', { class: 'member-specialty', text: m.specialty || m.email }),
        m.membership_number ? el('div', { class: 'member-nro', text: m.membership_number }) : null
      ]),
      el('div', { class: 'member-status' }, [statusBadge(m.membership_status)])
    ]);
    return card;
  }

  // ── Member Detail ─────────────────────────
  async function showMemberDetail(id) {
    haptic();
    try {
      const res = await SVC.api.get(`members.php?action=get&id=${id}`);
      const m = res.data;
      const initials = (m.first_name?.[0] || '') + (m.last_name?.[0] || '');

      const content = el('div', {}, [
        el('div', { class: 'member-detail-header' }, [
          el('div', { class: 'member-detail-avatar', text: initials }),
          el('div', { class: 'member-detail-name', text: `${m.first_name} ${m.last_name}` }),
          m.specialty ? el('div', { class: 'member-detail-spec', text: m.specialty }) : null,
          m.membership_number ? el('div', { class: 'member-detail-nro', text: m.membership_number }) : null,
          el('div', { class: 'mt-sm' }, [statusBadge(m.membership_status)])
        ]),
        el('div', { class: 'card mt-md' }, [
          detailRow('Correo', m.email),
          detailRow('Cédula', m.cedula || '—'),
          detailRow('Teléfono', m.phone || '—'),
          detailRow('Institución', m.institution || '—'),
          detailRow('Ciudad', [m.city, m.state].filter(Boolean).join(', ') || '—'),
          detailRow('Membresía vence', formatDate(m.membership_expires_at)),
        ])
      ]);

      SVC.modal.openSheet({ title: 'Detalle del Miembro', contentElement: content });
    } catch (err) {
      SVC.toast.error(err.message);
    }
  }

  function detailRow(label, value) {
    return el('div', { class: 'detail-row' }, [
      el('span', { class: 'detail-label', text: label }),
      el('span', { class: 'detail-value', text: value || '—' })
    ]);
  }

  // ── Create Member ─────────────────────────
  function showCreateForm() {
    const fields = [
      { id: 'mf-email', label: 'Correo *', type: 'email', full: true },
      { id: 'mf-pass', label: 'Contrasena *', type: 'password', full: true },
      { id: 'mf-first', label: 'Nombre *', type: 'text' },
      { id: 'mf-last', label: 'Apellido *', type: 'text' },
      { id: 'mf-cedula', label: 'Cédula', type: 'text' },
      { id: 'mf-phone', label: 'Teléfono', type: 'tel' },
      { id: 'mf-spec', label: 'Especialidad', type: 'text', full: true },
      { id: 'mf-inst', label: 'Institución', type: 'text', full: true },
      { id: 'mf-city', label: 'Ciudad', type: 'text' },
      { id: 'mf-state', label: 'Estado', type: 'text' },
    ];

    const grid = el('div', { class: 'member-form-grid' });
    const inputEls = {};

    fields.forEach(f => {
      const group = el('div', { class: `form-group${f.full ? ' full' : ''}` }, [
        el('label', { class: 'form-label', text: f.label, for: f.id }),
        el('input', { class: 'form-input', type: f.type, id: f.id, placeholder: f.label.replace(' *', '') })
      ]);
      inputEls[f.id] = group.querySelector('input');
      grid.appendChild(group);
    });

    const submitBtn = el('button', { class: 'btn btn-primary btn-block mt-md', text: 'Crear Miembro', onClick: async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando...';
      try {
        await SVC.api.post('members.php?action=create', {
          email: inputEls['mf-email'].value, password: inputEls['mf-pass'].value,
          first_name: inputEls['mf-first'].value, last_name: inputEls['mf-last'].value,
          cedula: inputEls['mf-cedula'].value, phone: inputEls['mf-phone'].value,
          specialty: inputEls['mf-spec'].value, institution: inputEls['mf-inst'].value,
          city: inputEls['mf-city'].value, state: inputEls['mf-state'].value
        });
        SVC.modal.close();
        SVC.toast.success('Miembro creado exitosamente');
        loadMembers();
      } catch (err) {
        SVC.toast.error(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Miembro';
      }
    }});

    const content = el('div', {}, [grid, submitBtn]);
    SVC.modal.openSheet({ title: 'Nuevo Miembro', contentElement: content });
  }

  // ── Pagination ────────────────────────────
  function renderPagination(container, data) {
    if (!container) return;
    clearEl(container);
    if (data.pages <= 1) return;

    const wrap = el('div', { class: 'flex flex-center gap-sm mt-md' });
    if (data.page > 1) {
      wrap.appendChild(el('button', { class: 'btn btn-ghost btn-sm', text: 'Anterior', onClick: () => loadMembers(data.page - 1, currentSearch, currentStatus) }));
    }
    wrap.appendChild(el('span', { class: 'text-sm text-muted', text: `${data.page} / ${data.pages}` }));
    if (data.page < data.pages) {
      wrap.appendChild(el('button', { class: 'btn btn-ghost btn-sm', text: 'Siguiente', onClick: () => loadMembers(data.page + 1, currentSearch, currentStatus) }));
    }
    container.appendChild(wrap);
  }

  // ── Init ──────────────────────────────────
  function init() {
    const searchInput = document.getElementById('members-search');
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        loadMembers(1, e.target.value, currentStatus);
      }, 350));
    }

    const fab = document.getElementById('members-fab');
    if (fab) fab.addEventListener('click', showCreateForm);
  }

  return { loadMembers, showMemberDetail, showCreateForm, init };
})();
