/**
 * SVC App — Payments Module
 */
const SVCPayments = (() => {
  const { el, clearEl, createSkeletons, createEmptyState, animateListIn, formatDate, formatCurrency, statusBadge, haptic } = SVCUtils;

  // ── Load Member's Payments ────────────────
  async function loadPayments() {
    const list = document.getElementById('payments-list-content');
    if (!list) return;
    clearEl(list).appendChild(createSkeletons(4));

    try {
      const res = await SVC.api.get('payments.php?action=my');
      clearEl(list);

      if (!res.data.length) {
        list.appendChild(createEmptyState('money', 'No tienes pagos registrados', 'Registrar pago', showPaymentForm));
        return;
      }

      const timeline = el('div', { class: 'payment-timeline' });
      res.data.forEach(p => timeline.appendChild(renderPaymentItem(p)));
      list.appendChild(timeline);
      animateListIn('.payment-item');
    } catch (err) {
      clearEl(list).appendChild(createEmptyState('refresh', err.message, 'Reintentar', loadPayments));
    }
  }

  function renderPaymentItem(p) {
    const item = el('div', { class: `payment-item status-${p.status}` }, [
      el('div', { class: 'payment-header' }, [
        el('div', {}, [
          el('div', { class: 'payment-type', text: p.type_name }),
          statusBadge(p.status)
        ]),
        el('div', { class: 'payment-amount', text: formatCurrency(p.amount, p.currency) })
      ]),
      el('div', { class: 'payment-meta' }, [
        el('span', { text: formatDate(p.created_at) }),
        el('span', { text: p.method.replace('_', ' ') }),
        p.reference_number ? el('span', { text: `Ref: ${p.reference_number}` }) : null
      ].filter(Boolean))
    ]);
    return item;
  }

  // ── Payment Form ──────────────────────────
  async function showPaymentForm() {
    haptic();
    let paymentTypes = [];
    try {
      const res = await SVC.api.get('payments.php?action=types');
      paymentTypes = res.data;
    } catch { SVC.toast.error('Error cargando tipos de pago'); return; }

    let selectedType = null;
    let selectedMethod = '';

    const typeContainer = el('div', { class: 'mb-md' });
    paymentTypes.forEach(pt => {
      const card = el('div', { class: 'ticket-type-card', onClick: () => {
        typeContainer.querySelectorAll('.ticket-type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedType = pt;
        amountInput.value = pt.amount;
      }}, [
        el('div', {}, [
          el('div', { class: 'ticket-type-name', text: pt.name }),
          pt.description ? el('div', { class: 'ticket-type-desc', text: pt.description }) : null
        ]),
        el('div', { class: 'ticket-type-price', text: formatCurrency(pt.amount) })
      ]);
      typeContainer.appendChild(card);
    });

    const methods = [
      { value: 'transfer', label: 'Transferencia' },
      { value: 'mobile_payment', label: 'Pago Movil' },
      { value: 'zelle', label: 'Zelle' },
      { value: 'cash', label: 'Efectivo' }
    ];

    const methodGrid = el('div', { class: 'payment-method-grid' });
    methods.forEach(m => {
      const opt = el('div', { class: 'method-option', text: m.label, onClick: () => {
        methodGrid.querySelectorAll('.method-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedMethod = m.value;
      }});
      methodGrid.appendChild(opt);
    });

    const amountInput = el('input', { class: 'form-input', type: 'number', step: '0.01', placeholder: '0.00' });
    const refInput = el('input', { class: 'form-input', type: 'text', placeholder: 'Numero de referencia' });
    const notesInput = el('input', { class: 'form-input', type: 'text', placeholder: 'Notas (opcional)' });

    const submitBtn = el('button', { class: 'btn btn-primary btn-block mt-md', text: 'Registrar Pago', onClick: async () => {
      if (!selectedType) { SVC.toast.warning('Selecciona un tipo de pago'); return; }
      if (!selectedMethod) { SVC.toast.warning('Selecciona un metodo'); return; }
      const amount = parseFloat(amountInput.value);
      if (!amount || amount <= 0) { SVC.toast.warning('Monto invalido'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
      try {
        await SVC.api.post('payments.php?action=create', {
          payment_type_id: selectedType.id, amount, method: selectedMethod,
          reference_number: refInput.value, notes: notesInput.value
        });
        SVC.modal.close();
        SVC.toast.success('Pago registrado. Pendiente de aprobacion.');
        loadPayments();
      } catch (err) { SVC.toast.error(err.message); }
      finally { submitBtn.disabled = false; submitBtn.textContent = 'Registrar Pago'; }
    }});

    const content = el('div', {}, [
      el('label', { class: 'form-label', text: 'Tipo de pago' }), typeContainer,
      el('label', { class: 'form-label', text: 'Metodo de pago' }), methodGrid,
      el('div', { class: 'form-group' }, [el('label', { class: 'form-label', text: 'Monto (USD)' }), amountInput]),
      el('div', { class: 'form-group' }, [el('label', { class: 'form-label', text: 'Referencia' }), refInput]),
      el('div', { class: 'form-group' }, [el('label', { class: 'form-label', text: 'Notas' }), notesInput]),
      submitBtn
    ]);

    SVC.modal.openSheet({ title: 'Registrar Pago', contentElement: content });
  }

  // ── Admin: Pending Approvals ──────────────
  async function loadPendingPayments() {
    const list = document.getElementById('admin-payments-content');
    if (!list) return;
    clearEl(list).appendChild(createSkeletons(3));

    try {
      const res = await SVC.api.get('payments.php?action=pending');
      clearEl(list);

      if (!res.data.length) {
        list.appendChild(createEmptyState('check', 'No hay pagos pendientes'));
        return;
      }

      res.data.forEach(p => list.appendChild(renderApprovalCard(p)));
      animateListIn('.approval-card');
    } catch (err) {
      clearEl(list).appendChild(createEmptyState('refresh', err.message, 'Reintentar', loadPendingPayments));
    }
  }

  function renderApprovalCard(p) {
    const card = el('div', { class: 'approval-card' }, [
      el('div', { class: 'approval-card-header' }, [
        el('div', { class: 'approval-user' }, [
          el('div', { class: 'avatar', text: (p.first_name?.[0] || '') + (p.last_name?.[0] || ''), style: { width: '32px', height: '32px', fontSize: '0.7rem' } }),
          el('div', {}, [
            el('div', { class: 'text-sm font-semibold', text: `${p.first_name || ''} ${p.last_name || ''}` }),
            el('div', { class: 'text-xs text-muted', text: p.membership_number || p.email })
          ])
        ]),
        el('div', { class: 'approval-amount', text: formatCurrency(p.amount, p.currency) })
      ]),
      el('div', { class: 'approval-meta', text: `${p.type_name} — ${p.method.replace('_', ' ')} — ${formatDate(p.created_at)}${p.reference_number ? ' — Ref: ' + p.reference_number : ''}` }),
      el('div', { class: 'approval-actions' }, [
        el('button', { class: 'btn btn-sm', text: 'Rechazar', style: { background: 'var(--error-bg)', color: 'var(--error)' }, onClick: () => rejectPayment(p.id) }),
        el('button', { class: 'btn btn-primary btn-sm', text: 'Aprobar', onClick: () => approvePayment(p.id) })
      ])
    ]);
    return card;
  }

  async function approvePayment(id) {
    haptic(20);
    try {
      await SVC.api.put('payments.php?action=approve', { id });
      SVC.toast.success('Pago aprobado');
      loadPendingPayments();
    } catch (err) { SVC.toast.error(err.message); }
  }

  async function rejectPayment(id) {
    haptic(20);
    try {
      await SVC.api.put('payments.php?action=reject', { id, reason: 'Rechazado por administrador' });
      SVC.toast.success('Pago rechazado');
      loadPendingPayments();
    } catch (err) { SVC.toast.error(err.message); }
  }

  function init() {
    const payBtn = document.getElementById('payments-add-btn');
    if (payBtn) payBtn.addEventListener('click', showPaymentForm);
  }

  return { loadPayments, showPaymentForm, loadPendingPayments, approvePayment, rejectPayment, init };
})();
