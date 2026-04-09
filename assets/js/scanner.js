/**
 * SVC App — QR Scanner Module
 */
const SVCScanner = (() => {
  const { el, clearEl, statusBadge, formatDateTime, haptic, svgIcon, ICONS } = SVCUtils;
  let html5QrCode = null;
  let isScanning = false;

  // ── Start Scanner ─────────────────────────
  async function startScanner() {
    const viewport = document.getElementById('scanner-reader');
    if (!viewport || isScanning) return;

    if (typeof Html5Qrcode === 'undefined') {
      SVC.toast.error('Libreria de scanner no disponible');
      return;
    }

    try {
      html5QrCode = new Html5Qrcode('scanner-reader');
      isScanning = true;
      updateScannerUI(true);

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        onScanSuccess,
        () => {} // ignore failures
      );
    } catch (err) {
      isScanning = false;
      updateScannerUI(false);
      SVC.toast.error('No se pudo acceder a la camara');
    }
  }

  // ── Stop Scanner ──────────────────────────
  async function stopScanner() {
    if (html5QrCode && isScanning) {
      try { await html5QrCode.stop(); } catch { /* ignore */ }
      isScanning = false;
      updateScannerUI(false);
    }
  }

  // ── On Scan Success ───────────────────────
  async function onScanSuccess(decodedText) {
    if (!decodedText) return;
    haptic(30);

    // Pause scanning while processing
    try { await html5QrCode.pause(true); } catch { /* ignore */ }

    try {
      const res = await SVC.api.get(`tickets.php?action=validate&token=${encodeURIComponent(decodedText)}`);
      renderScanResult(res.data);
    } catch (err) {
      renderScanResult({ scan_result: 'invalid', message: err.message });
    }
  }

  // ── Render Scan Result ────────────────────
  function renderScanResult(data) {
    const overlay = document.getElementById('scan-result-overlay');
    if (!overlay) return;
    clearEl(overlay);

    const result = data.scan_result;
    const ticket = data.ticket;

    // Icon
    const iconWrap = el('div', { class: `scan-result-icon ${result}` });
    if (result === 'valid') {
      iconWrap.appendChild(svgIcon(ICONS.check, 40, 3, 'var(--success)'));
    } else if (result === 'already_used') {
      iconWrap.appendChild(svgIcon(['M12 9v2', 'M12 15h.01'], 40, 3, 'var(--warning)'));
    } else {
      iconWrap.appendChild(svgIcon(ICONS.x, 40, 3, 'var(--error)'));
    }
    overlay.appendChild(iconWrap);

    // Title
    const titles = { valid: 'Ticket Valido', already_used: 'Ya Usado', invalid: 'Invalido' };
    overlay.appendChild(el('div', { class: 'scan-result-title', text: titles[result] || 'Error' }));
    overlay.appendChild(el('p', { class: 'text-muted text-sm', text: data.message }));

    // Ticket info card
    if (ticket) {
      const card = el('div', { class: 'scan-result-card' }, [
        el('div', { class: 'font-heading font-bold', text: `${ticket.first_name || ''} ${ticket.last_name || ''}` }),
        el('div', { class: 'text-sm text-muted mt-xs', text: ticket.membership_number || '' }),
        el('div', { class: 'divider' }),
        el('div', { class: 'text-sm', text: ticket.event_title }),
        el('div', { class: 'text-xs text-muted mt-xs', text: `${ticket.ticket_type_name} — ${ticket.uid}` }),
        ticket.cedula ? el('div', { class: 'text-xs text-muted mt-xs', text: `Cedula: ${ticket.cedula}` }) : null,
        el('div', { class: 'mt-sm' }, [statusBadge(ticket.status)])
      ].filter(Boolean));
      overlay.appendChild(card);
    }

    // Actions
    const actions = el('div', { class: 'scan-result-actions' });

    if (result === 'valid' && ticket) {
      actions.appendChild(el('button', { class: 'btn btn-primary', text: 'Registrar Entrada', onClick: async () => {
        try {
          await SVC.api.put('tickets.php?action=checkin', { id: ticket.id });
          haptic(50);
          SVC.toast.success('Entrada registrada');
          closeScanResult();
          addToScanLog(ticket, 'valid');
        } catch (err) { SVC.toast.error(err.message); }
      }}));
    }

    actions.appendChild(el('button', { class: 'btn btn-secondary', text: 'Escanear Otro', onClick: closeScanResult }));
    overlay.appendChild(actions);

    overlay.classList.add('active');

    // Add to log for non-valid scans
    if (result !== 'valid' && ticket) addToScanLog(ticket, result);
  }

  function closeScanResult() {
    document.getElementById('scan-result-overlay')?.classList.remove('active');
    try { html5QrCode?.resume(); } catch { /* ignore */ }
  }

  // ── Manual Entry ──────────────────────────
  function showManualEntry() {
    const input = el('input', { class: 'form-input', type: 'text', placeholder: 'Ingresa el codigo del ticket' });
    const submitBtn = el('button', { class: 'btn btn-primary btn-block mt-md', text: 'Validar', onClick: async () => {
      const token = input.value.trim();
      if (!token) { SVC.toast.warning('Ingresa un codigo'); return; }
      submitBtn.disabled = true;
      try {
        const res = await SVC.api.get(`tickets.php?action=validate&token=${encodeURIComponent(token)}`);
        SVC.modal.close();
        renderScanResult(res.data);
      } catch (err) { SVC.toast.error(err.message); }
      finally { submitBtn.disabled = false; }
    }});

    SVC.modal.openCenter({
      title: 'Entrada Manual',
      contentElement: el('div', {}, [
        el('p', { class: 'text-sm text-muted mb-md', text: 'Ingresa el token QR del ticket manualmente' }),
        input, submitBtn
      ])
    });
  }

  // ── Scan Log ──────────────────────────────
  const scanLog = [];

  function addToScanLog(ticket, result) {
    scanLog.unshift({
      name: `${ticket.first_name || ''} ${ticket.last_name || ''}`,
      result,
      time: new Date().toISOString()
    });
    renderScanLog();
  }

  function renderScanLog() {
    const container = document.getElementById('scan-log-content');
    if (!container) return;
    clearEl(container);

    if (!scanLog.length) {
      container.appendChild(el('p', { class: 'text-muted text-sm text-center', text: 'Sin escaneos hoy' }));
      return;
    }

    scanLog.slice(0, 20).forEach(s => {
      container.appendChild(el('div', { class: 'scan-log-item' }, [
        el('div', { class: `scan-log-dot ${s.result}` }),
        el('div', { class: 'scan-log-info' }, [
          el('div', { class: 'scan-log-name', text: s.name }),
          el('div', { class: 'scan-log-time', text: SVCUtils.formatTime(s.time) })
        ]),
        statusBadge(s.result)
      ]));
    });
  }

  // ── UI Helpers ────────────────────────────
  function updateScannerUI(scanning) {
    const startBtn = document.getElementById('scanner-start-btn');
    const stopBtn = document.getElementById('scanner-stop-btn');
    const scanLine = document.getElementById('scanner-line');

    if (startBtn) startBtn.style.display = scanning ? 'none' : '';
    if (stopBtn) stopBtn.style.display = scanning ? '' : 'none';
    if (scanLine) scanLine.style.display = scanning ? '' : 'none';
  }

  function init() {
    const startBtn = document.getElementById('scanner-start-btn');
    const stopBtn = document.getElementById('scanner-stop-btn');
    const manualBtn = document.getElementById('scanner-manual-btn');

    if (startBtn) startBtn.addEventListener('click', startScanner);
    if (stopBtn) stopBtn.addEventListener('click', stopScanner);
    if (manualBtn) manualBtn.addEventListener('click', showManualEntry);
  }

  return { startScanner, stopScanner, showManualEntry, init };
})();
