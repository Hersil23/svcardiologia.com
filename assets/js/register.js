/**
 * SVC App — Registration Wizard
 * Multi-step membership application flow
 */
const SVCRegister = (() => {
  const { el, clearEl, haptic } = SVCUtils;

  let currentStep = 0;
  let formData = { membershipType: '', personal: {}, professional: {}, fileIds: [], fileUrls: {}, payment: {} };
  let uploaders = [];

  const STEPS = ['type', 'personal', 'professional', 'docs_payment', 'success'];
  const TOTAL_VISIBLE = 4; // steps visible to user (exclude success)

  const SPECIALTIES = [
    'Cardiología General', 'Cardiología Intervencionista', 'Electrofisiología Cardíaca',
    'Ecocardiografía', 'Cardiología Pediátrica', 'Insuficiencia Cardíaca',
    'Cardiología Nuclear', 'Rehabilitación Cardíaca', 'Cirugía Cardiovascular',
    'Anestesiología Cardiovascular', 'Hipertensión Arterial', 'Prevención Cardiovascular', 'Otra'
  ];

  const STATES = [
    'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar',
    'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón',
    'Guárico', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta',
    'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'La Guaira', 'Yaracuy', 'Zulia'
  ];

  const MEMBERSHIP_TYPES = {
    asociado: {
      icon: '\u{1FA7A}', title: 'Miembro Asociado', badge: 'Más común', badgeClass: 'popular',
      desc: 'Médico Cirujano con postgrado en Cardiología, Cirugía Cardiovascular o Anestesiología Cardiovascular (mínimo 3 años)'
    },
    correspondiente: {
      icon: '\u{1F52C}', title: 'Miembro Correspondiente',
      desc: 'Médico con postgrado en especialidad no cardiológica (mínimo 2 años) con interés en el área cardiológica'
    },
    profesional_afin: {
      icon: '\u{1F48A}', title: 'Profesional No Médico',
      desc: 'Técnico o Enfermera titulado con constancias de cargos y credenciales pertinentes'
    },
    titular: {
      icon: '\u{1F3C6}', title: 'Miembro Titular', badge: 'Solo para Asociados activos', badgeClass: 'info',
      desc: 'Exclusivo para Asociados activos con mínimo 2 años de membresía',
      note: 'Solicita el ascenso desde tu perfil', disabled: true
    }
  };

  const DOCS_BY_TYPE = {
    asociado: [
      { type: 'foto_carne', title: 'Foto tipo carné', desc: 'Fondo blanco, frente al frente, sin lentes', accept: 'image/jpeg,image/png,image/gif', maxMB: 2 },
      { type: 'cedula', title: 'Cédula de identidad', desc: 'Imagen clara y legible de ambas caras', accept: 'image/jpeg,image/png,image/gif,application/pdf', maxMB: 2 },
      { type: 'titulo_medico', title: 'Título de Médico Cirujano', desc: 'PDF, máximo 1 página', accept: 'application/pdf', maxMB: 4 },
      { type: 'titulo_especialidad', title: 'Título de Especialidad', desc: 'PDF, máximo 1 página', accept: 'application/pdf', maxMB: 4 },
      { type: 'cv', title: 'Currículum Vitae Completo', desc: 'PDF, máximo 2 páginas', accept: 'application/pdf', maxMB: 4 }
    ],
    correspondiente: [
      { type: 'foto_carne', title: 'Foto tipo carné', desc: 'Fondo blanco, frente al frente', accept: 'image/jpeg,image/png,image/gif', maxMB: 2 },
      { type: 'cv', title: 'Currículum Vitae', desc: 'PDF', accept: 'application/pdf', maxMB: 4 }
    ],
    profesional_afin: [
      { type: 'foto_carne', title: 'Foto tipo carné', desc: 'Fondo blanco, frente al frente', accept: 'image/jpeg,image/png,image/gif', maxMB: 2 },
      { type: 'titulo_universitario', title: 'Título Universitario', desc: 'PDF', accept: 'application/pdf', maxMB: 4 },
      { type: 'cv', title: 'Currículum Vitae con constancias', desc: 'PDF', accept: 'application/pdf', maxMB: 4 }
    ]
  };

  const PAYMENT_METHODS = [
    { id: 'zelle', icon: '\u{1F49A}', name: 'Zelle', sub: 'Recomendado' },
    { id: 'transfer', icon: '\u{1F3E6}', name: 'Transferencia', sub: 'Bancaria' },
    { id: 'mobile_payment', icon: '\u{1F4F1}', name: 'Pago Móvil', sub: '' },
    { id: 'cash', icon: '\u{1F4B5}', name: 'Efectivo', sub: 'En sede SVC' }
  ];

  const PAYMENT_DETAILS = {
    zelle: [['Email', 'pagos@svcardiologia.com'], ['Nombre', 'Sociedad Venezolana de Cardiología']],
    transfer: [['Banco', 'Banco de Venezuela'], ['Cuenta', '0102-0000-00-0000000000'], ['RIF', 'J-000000000-0'], ['A nombre de', 'Sociedad Venezolana de Cardiología']],
    mobile_payment: [['Banco', 'Banesco'], ['Teléfono', '0412-000-0000'], ['Cédula', 'J-000000000'], ['A nombre de', 'Sociedad Venezolana de Cardiología']],
    cash: [['Dirección', 'Sede SVC, Caracas'], ['Horario', 'Lunes a Viernes 8am-4pm']]
  };

  // ── Show Welcome Screen ──────────────────
  function showWelcome() {
    const screen = document.getElementById('welcome-screen');
    if (screen) screen.classList.remove('hidden');
  }

  function hideWelcome() {
    const screen = document.getElementById('welcome-screen');
    if (screen) screen.classList.add('hidden');
  }

  // ── Open Wizard ──────────────────────────
  function open() {
    hideWelcome();
    const wizard = document.getElementById('register-shell');
    if (!wizard) return;
    wizard.classList.add('active');
    currentStep = 0;
    formData = { membershipType: '', personal: {}, professional: {}, fileIds: [], payment: {} };
    uploaders = [];
    renderStep();
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(wizard, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' });
    }
  }

  function close() {
    const wizard = document.getElementById('register-shell');
    if (wizard) wizard.classList.remove('active');
    showWelcome();
  }

  // ── Navigation ───────────────────────────
  function goNext() {
    if (currentStep < STEPS.length - 1) {
      currentStep++;
      renderStep();
    }
  }

  function goBack() {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    } else {
      close();
    }
  }

  // ── Render Current Step ──────────────────
  function renderStep() {
    const headerTitle = document.querySelector('.reg-left-step-tag');
    const headerStep  = document.querySelector('.reg-progress-step');
    const progressBar = document.getElementById('reg-progress-fill');
    const body        = document.getElementById('reg-body');
    const footer      = document.getElementById('reg-footer');

    if (!body) return;

    const stepName = STEPS[currentStep];
    const stepNum = Math.min(currentStep + 1, TOTAL_VISIBLE);

    const titles = {
      type: 'Solicitar Membresía', personal: 'Datos Personales',
      professional: 'Datos Profesionales', docs_payment: 'Documentos y Pago',
      success: '¡Listo!'
    };

    if (headerTitle) headerTitle.textContent = titles[stepName] || '';
    if (headerStep) headerStep.textContent = stepName === 'success' ? '' : `${stepNum} de ${TOTAL_VISIBLE}`;
    if (progressBar) progressBar.style.width = stepName === 'success' ? '100%' : `${(stepNum / TOTAL_VISIBLE) * 100}%`;

    clearEl(body);
    clearEl(footer);

    const step = el('div', { class: 'reg-step active' });

    // Mobile step header (hidden on desktop via CSS)
    if (stepName !== 'success') {
      const mobileTitle = titles[stepName] || '';
      const backSvg = SVCUtils.svgIcon(['M19 12H5', 'M12 19l-7-7 7-7'], 18, 2.5, 'white');
      const backBtn = el('button', { class: 'reg-back-btn', onClick: goBack });
      backBtn.appendChild(backSvg);
      step.appendChild(el('div', { class: 'reg-step-header' }, [
        backBtn,
        el('span', { class: 'reg-step-title-mobile', text: mobileTitle })
      ]));
    }

    // Update desktop left panel
    updateLeftPanel(stepName, stepNum, totalVisible);

    switch (stepName) {
      case 'type':         buildStepType(step, footer); break;
      case 'personal':     buildStepPersonal(step, footer); break;
      case 'professional': buildStepProfessional(step, footer); break;
      case 'docs_payment': buildStepDocsPayment(step, footer); break;
      case 'success':      buildStepSuccess(step, footer); break;
    }

    body.appendChild(step);
    body.scrollTop = 0;

    if (typeof gsap !== 'undefined') {
      gsap.fromTo(step, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power3.out' });
    }
  }

  // ── Update desktop left panel ─────────────
  function updateLeftPanel(stepName, stepNum, total) {
    const LEFT_CONTENT = {
      type: { tag: 'Paso 1 de 4', title: 'Únete a la\ncomunidad\ncardiológica', desc: 'Elige tu tipo de membresía para comenzar.' },
      personal: { tag: 'Paso 2 de 4', title: 'Tus datos\npersonales', desc: 'Información básica para identificarte como miembro.' },
      professional: { tag: 'Paso 3 de 4', title: 'Tu perfil\nprofesional', desc: 'Tu experiencia y formación médica.' },
      docs_payment: { tag: 'Paso 4 de 4', title: 'Documentos\ny pago', desc: 'Sube tus credenciales y realiza el pago de admisión.' },
      success: { tag: 'Listo', title: '¡Solicitud\nenviada!', desc: 'Tu solicitud está siendo revisada.' }
    };
    const data = LEFT_CONTENT[stepName];
    if (!data) return;
    const tag = document.querySelector('.reg-left-step-tag');
    const title = document.querySelector('.reg-left-step-title');
    const desc = document.querySelector('.reg-left-step-desc');
    if (tag) tag.textContent = data.tag;
    if (title) {
      title.textContent = '';
      data.title.split('\n').forEach((line, i) => {
        if (i > 0) title.appendChild(document.createElement('br'));
        title.appendChild(document.createTextNode(line));
      });
    }
    if (desc) desc.textContent = data.desc;
  }

  // ── STEP 1: Membership Type ──────────────
  function buildStepType(step, footer) {
    step.appendChild(el('h2', { class: 'reg-step-title', text: '¿Qué tipo de membresía deseas?' }));
    step.appendChild(el('p', { class: 'reg-step-subtitle', text: 'Selecciona según tu perfil profesional' }));

    const cards = el('div', { class: 'reg-type-cards' });
    let selected = null;

    Object.entries(MEMBERSHIP_TYPES).forEach(([key, mt]) => {
      const card = el('div', { class: `reg-type-card${mt.disabled ? ' disabled' : ''}${formData.membershipType === key ? ' selected' : ''}` });
      if (formData.membershipType === key) selected = card;

      const header = el('div', { class: 'reg-type-card-header' }, [
        el('span', { class: 'reg-type-card-icon', text: mt.icon }),
        el('span', { class: 'reg-type-card-title', text: mt.title })
      ]);
      card.appendChild(header);

      if (mt.badge) {
        card.appendChild(el('span', { class: `reg-type-card-badge ${mt.badgeClass || ''}`, text: mt.badge }));
      }

      card.appendChild(el('p', { class: 'reg-type-card-desc', text: mt.desc }));
      if (mt.note) card.appendChild(el('p', { class: 'reg-type-card-note', text: mt.note }));

      if (!mt.disabled) {
        card.addEventListener('click', () => {
          haptic();
          cards.querySelectorAll('.reg-type-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          formData.membershipType = key;
          selected = card;
          continueBtn.disabled = false;
          continueBtn.classList.remove('btn-secondary');
          continueBtn.classList.add('btn-primary');
        });
      }

      cards.appendChild(card);
    });

    step.appendChild(cards);

    const continueBtn = el('button', {
      class: `btn btn-block ${formData.membershipType ? 'btn-primary' : 'btn-secondary'}`,
      text: 'Continuar →',
      onClick: () => { if (formData.membershipType) goNext(); }
    });
    continueBtn.disabled = !formData.membershipType;
    footer.appendChild(continueBtn);
  }

  // ── STEP 2: Personal Data ────────────────
  function buildStepPersonal(step, footer) {
    step.appendChild(el('h2', { class: 'reg-step-title', text: 'Datos Personales' }));

    const form = el('div', { class: 'reg-form' });
    const p = formData.personal;

    const fields = [
      { key: 'first_name', label: 'Nombres', required: true, value: p.first_name },
      { key: 'last_name', label: 'Apellidos', required: true, value: p.last_name },
      { key: 'cedula', label: 'Cédula de Identidad', required: true, value: p.cedula, type: 'cedula' },
      { key: 'birth_date', label: 'Fecha de Nacimiento', required: true, value: p.birth_date, type: 'date' },
      { key: 'gender', label: 'Género', value: p.gender, type: 'select', options: ['', 'Masculino', 'Femenino', 'Prefiero no indicar'] },
      { key: 'phone', label: 'Teléfono', required: true, value: p.phone, type: 'phone_compound', placeholder: '4141234567' },
      { key: 'email', label: 'Correo Electrónico', required: true, value: p.email, type: 'email' },
      { key: 'password', label: 'Contraseña', required: true, value: p.password, type: 'password' },
      { key: 'password_confirm', label: 'Confirmar Contraseña', required: true, value: p.password_confirm, type: 'password' },
    ];

    const inputs = {};

    fields.forEach(f => {
      const field = el('div', { class: 'reg-field' });
      const labelEl = el('label', { class: 'reg-field-label' });
      labelEl.textContent = f.label;
      if (f.required) labelEl.appendChild(el('span', { class: 'required', text: ' *' }));
      field.appendChild(labelEl);

      let input;

      if (f.type === 'cedula') {
        const row = el('div', { class: 'reg-cedula-row' });
        const prefix = el('select', { class: 'reg-field-select' });
        ['V', 'E', 'P'].forEach(v => prefix.appendChild(el('option', { text: v, value: v })));
        prefix.value = p.cedula_prefix || 'V';
        const num = el('input', { class: 'reg-field-input', type: 'text', placeholder: 'Número', value: f.value || '' });
        row.append(prefix, num);
        field.appendChild(row);
        inputs[f.key] = num;
        inputs.cedula_prefix = prefix;
      } else if (f.type === 'phone_compound') {
        const CODES = [
          { code: '+58', flag: '\u{1F1FB}\u{1F1EA}', name: 'VE' },
          { code: '+1',  flag: '\u{1F1FA}\u{1F1F8}', name: 'US' },
          { code: '+34', flag: '\u{1F1EA}\u{1F1F8}', name: 'ES' },
          { code: '+57', flag: '\u{1F1E8}\u{1F1F4}', name: 'CO' },
          { code: '+507',flag: '\u{1F1F5}\u{1F1E6}', name: 'PA' },
          { code: '+52', flag: '\u{1F1F2}\u{1F1FD}', name: 'MX' },
          { code: '+54', flag: '\u{1F1E6}\u{1F1F7}', name: 'AR' },
          { code: '+56', flag: '\u{1F1E8}\u{1F1F1}', name: 'CL' },
          { code: '+55', flag: '\u{1F1E7}\u{1F1F7}', name: 'BR' },
          { code: '+51', flag: '\u{1F1F5}\u{1F1EA}', name: 'PE' },
        ];
        const row = el('div', { class: 'reg-cedula-row' });
        const codeSelect = el('select', { class: 'reg-field-select', style: { fontSize: '14px' } });
        CODES.forEach(c => codeSelect.appendChild(el('option', { text: `${c.flag} ${c.code}`, value: c.code })));
        codeSelect.value = p.phone_code || '+58';
        const phoneNum = el('input', { class: 'reg-field-input', type: 'tel', placeholder: f.placeholder || '', value: f.value || '' });
        row.append(codeSelect, phoneNum);
        field.appendChild(row);
        inputs[f.key] = phoneNum;
        inputs.phone_code = codeSelect;
      } else if (f.type === 'select') {
        input = el('select', { class: 'reg-field-select' });
        (f.options || []).forEach(o => {
          const opt = el('option', { text: o || 'Seleccionar...', value: o });
          input.appendChild(opt);
        });
        if (f.value) input.value = f.value;
        field.appendChild(input);
        inputs[f.key] = input;
      } else {
        input = el('input', { class: 'reg-field-input', type: f.type || 'text', placeholder: f.placeholder || '', value: f.value || '' });
        field.appendChild(input);
        inputs[f.key] = input;

        if (f.type === 'password' && f.key === 'password') {
          const strengthBar = el('div', { class: 'reg-password-strength' });
          const bar = el('div', { class: 'reg-password-strength-bar', style: { width: '0%' } });
          strengthBar.appendChild(bar);
          const strengthText = el('div', { class: 'reg-password-strength-text' });
          field.append(strengthBar, strengthText);

          input.addEventListener('input', () => {
            const val = input.value;
            let score = 0;
            if (val.length >= 8) score++;
            if (/[A-Z]/.test(val)) score++;
            if (/[0-9]/.test(val)) score++;
            if (/[^A-Za-z0-9]/.test(val)) score++;
            const levels = [
              { w: '0%', c: '', t: '' },
              { w: '25%', c: 'var(--error)', t: 'Débil' },
              { w: '50%', c: 'var(--warning)', t: 'Regular' },
              { w: '75%', c: 'var(--info)', t: 'Fuerte' },
              { w: '100%', c: 'var(--success)', t: 'Muy fuerte' }
            ];
            const lv = levels[score];
            bar.style.width = lv.w;
            bar.style.background = lv.c;
            strengthText.textContent = lv.t;
            strengthText.style.color = lv.c;
          });
        }
      }

      const errorEl = el('div', { class: 'reg-field-error' });
      field.appendChild(errorEl);
      form.appendChild(field);
    });

    step.appendChild(form);

    footer.appendChild(el('button', {
      class: 'btn btn-primary btn-block',
      text: 'Continuar →',
      onClick: () => {
        // Collect and validate
        const d = {};
        d.first_name = inputs.first_name?.value?.trim();
        d.last_name = inputs.last_name?.value?.trim();
        d.cedula_prefix = inputs.cedula_prefix?.value || 'V';
        d.cedula = d.cedula_prefix + '-' + (inputs.cedula?.value?.trim() || '');
        d.birth_date = inputs.birth_date?.value;
        d.gender = inputs.gender?.value;
        d.phone_code = inputs.phone_code?.value || '+58';
        d.phone = d.phone_code + ' ' + (inputs.phone?.value?.trim() || '');
        d.email = inputs.email?.value?.trim()?.toLowerCase();
        d.password = inputs.password?.value;
        d.password_confirm = inputs.password_confirm?.value;

        if (!d.first_name || !d.last_name || !inputs.cedula?.value?.trim() || !d.phone || !d.email || !d.password) {
          SVC.toast.warning('Completa todos los campos obligatorios');
          return;
        }
        if (d.password.length < 8) { SVC.toast.warning('La contraseña debe tener mínimo 8 caracteres'); return; }
        if (d.password !== d.password_confirm) { SVC.toast.warning('Las contraseñas no coinciden'); return; }
        if (!d.email.includes('@')) { SVC.toast.warning('Correo electrónico inválido'); return; }

        formData.personal = d;
        goNext();
      }
    }));
  }

  // ── STEP 3: Professional Data ────────────
  function buildStepProfessional(step, footer) {
    step.appendChild(el('h2', { class: 'reg-step-title', text: 'Datos Profesionales' }));

    const form = el('div', { class: 'reg-form' });
    const prof = formData.professional;
    const inputs = {};
    const type = formData.membershipType;

    function addField(key, label, required, fieldType, options) {
      const field = el('div', { class: 'reg-field' });
      const lbl = el('label', { class: 'reg-field-label' });
      lbl.textContent = label;
      if (required) lbl.appendChild(el('span', { class: 'required', text: ' *' }));
      field.appendChild(lbl);

      let input;
      if (fieldType === 'select') {
        input = el('select', { class: 'reg-field-select' });
        input.appendChild(el('option', { text: 'Seleccionar...', value: '' }));
        (options || []).forEach(o => input.appendChild(el('option', { text: o, value: o })));
      } else {
        input = el('input', { class: 'reg-field-input', type: fieldType || 'text', value: prof[key] || '' });
      }
      if (prof[key]) input.value = prof[key];
      field.appendChild(input);
      form.appendChild(field);
      inputs[key] = input;
    }

    const currentYear = new Date().getFullYear();
    const yearRange = Array.from({ length: currentYear - 1969 }, (_, i) => String(currentYear - i));

    if (type === 'asociado') {
      addField('university', 'Universidad (título de Médico)', true);
      addField('grad_year', 'Año de graduación', true, 'select', yearRange);
      addField('postgrad_institution', 'Institución del postgrado', true);
      addField('specialty', 'Especialidad del postgrado', true, 'select', SPECIALTIES);
      addField('postgrad_duration', 'Duración del postgrado', true, 'select', ['3 años', '4 años', '5 años', 'Más de 5 años']);
      addField('postgrad_end_year', 'Año de finalización', true, 'select', yearRange);
      addField('mpps', 'Nro. MPPS', false);
      addField('colegio_medicos', 'Nro. Colegio de Médicos', false);
      addField('institution', 'Institución donde labora', false);
      addField('city', 'Ciudad', true);
      addField('state', 'Estado', true, 'select', STATES);
    } else if (type === 'correspondiente') {
      addField('university', 'Universidad (título de Médico)', true);
      addField('grad_year', 'Año de graduación', true, 'select', yearRange);
      addField('specialty', 'Especialidad no cardiológica', true);
      addField('postgrad_institution', 'Institución del postgrado', true);
      addField('postgrad_duration', 'Duración del postgrado', true, 'select', ['2 años', '3 años', 'Más de 3 años']);
      addField('cardio_interest', 'Área de interés cardiológico', true);
      addField('mpps', 'Nro. MPPS', false);
      addField('institution', 'Institución donde labora', false);
      addField('city', 'Ciudad', true);
      addField('state', 'Estado', true, 'select', STATES);
    } else {
      addField('university', 'Institución del título', true);
      addField('title_obtained', 'Título obtenido', true);
      addField('grad_year', 'Año de graduación', true, 'select', yearRange);
      addField('institution', 'Institución donde labora', true);
      addField('current_position', 'Cargo actual', true);
      addField('city', 'Ciudad', true);
      addField('state', 'Estado', true, 'select', STATES);
    }

    step.appendChild(form);

    footer.appendChild(el('button', {
      class: 'btn btn-primary btn-block',
      text: 'Continuar →',
      onClick: () => {
        const data = {};
        Object.entries(inputs).forEach(([k, inp]) => { data[k] = inp.value?.trim() || ''; });

        // Check required fields have values
        const requiredKeys = Object.keys(inputs).filter(k => {
          const lbl = inputs[k]?.closest?.('.reg-field')?.querySelector('.required');
          return !!lbl;
        });

        // Simple validation: city and state always required
        if (!data.city || !data.state) {
          SVC.toast.warning('Completa los campos obligatorios');
          return;
        }

        formData.professional = data;
        goNext();
      }
    }));
  }

  // ── STEP 4: Documents ────────────────────
  // ── STEP 4: Documents + Payment (merged) ──
  function buildStepDocsPayment(step, footer) {
    // --- DOCUMENTS SECTION ---
    step.appendChild(el('h2', { class: 'reg-step-title', text: 'Documentos requeridos' }));
    step.appendChild(el('p', { class: 'reg-step-subtitle', text: 'Sube tus credenciales para procesar la solicitud' }));

    const docs = DOCS_BY_TYPE[formData.membershipType] || [];
    const docList = el('div', { class: 'reg-doc-list' });
    const uploadedCount = { value: 0 };
    uploaders = [];
    const contextId = formData.personal.cedula || ('reg-' + Date.now());

    docs.forEach((doc, i) => {
      const item = el('div', { class: 'reg-doc-item' });
      item.appendChild(el('div', { class: 'reg-doc-item-header' }, [
        el('span', { class: 'reg-doc-item-title', text: doc.title }),
        el('span', { class: 'reg-doc-item-status pending', text: 'Pendiente', id: `doc-status-${i}` })
      ]));
      item.appendChild(el('p', { class: 'reg-doc-item-desc', text: doc.desc }));
      const uploadContainerId = `reg-upload-${i}`;
      item.appendChild(el('div', { id: uploadContainerId }));
      docList.appendChild(item);

      uploaders.push(new SVCUploader({
        containerId: uploadContainerId, type: doc.type, contextId,
        accept: doc.accept, maxSizeMB: doc.maxMB, label: doc.title,
        extraFields: { registration: '1' },
        onSuccess: (data) => {
          if (data.file_id) formData.fileIds.push(data.file_id);
          if (data.cdn_url) formData.fileUrls[doc.type] = data.cdn_url;
          uploadedCount.value++;
          const s = document.getElementById(`doc-status-${i}`);
          if (s) { s.textContent = '✓ Subido'; s.className = 'reg-doc-item-status done'; }
          counter.textContent = `${uploadedCount.value} de ${docs.length} documentos subidos`;
        }
      }));
    });

    step.appendChild(docList);
    const counter = el('div', { class: 'reg-doc-counter', text: `0 de ${docs.length} documentos subidos` });
    step.appendChild(counter);

    // --- PAYMENT SECTION ---
    step.appendChild(el('div', { style: { height: '1px', background: 'var(--border-subtle)', margin: '24px 0' } }));
    step.appendChild(el('h2', { class: 'reg-step-title', text: 'Pago de cuota de admisión' }));
    step.appendChild(el('p', { class: 'reg-step-subtitle', text: 'Realiza el pago y sube el comprobante' }));

    // Price box
    const priceBox = el('div', { id: 'reg-price-box' });
    step.appendChild(priceBox);
    if (typeof SVCCurrency !== 'undefined') {
      setTimeout(() => SVCCurrency.renderPriceBox(50, priceBox), 50);
    }

    // Payment methods
    const methodsGrid = el('div', { class: 'reg-payment-methods' });
    let selectedMethod = formData.payment.method || '';
    const detailsBox = el('div', { id: 'reg-payment-details' });

    PAYMENT_METHODS.forEach(pm => {
      const card = el('div', { class: `reg-payment-method${selectedMethod === pm.id ? ' selected' : ''}` });
      card.append(
        el('div', { class: 'reg-payment-method-icon', text: pm.icon }),
        el('div', { class: 'reg-payment-method-name', text: pm.name }),
        pm.sub ? el('div', { class: 'reg-payment-method-sub', text: pm.sub }) : null
      );
      card.addEventListener('click', () => {
        haptic();
        methodsGrid.querySelectorAll('.reg-payment-method').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedMethod = pm.id;
        showPaymentDetails(pm.id, detailsBox);
      });
      methodsGrid.appendChild(card);
    });

    step.appendChild(el('label', { class: 'reg-field-label', text: 'Método de pago', style: { marginBottom: '8px', marginTop: '20px', display: 'block' } }));
    step.appendChild(methodsGrid);
    step.appendChild(detailsBox);

    if (selectedMethod) showPaymentDetails(selectedMethod, detailsBox);

    // Reference fields
    const refForm = el('div', { class: 'reg-form', style: { marginTop: '16px' } });
    const refInput = el('input', { class: 'reg-field-input', type: 'text', placeholder: 'Número de referencia', value: formData.payment.reference || '' });
    const dateInput = el('input', { class: 'reg-field-input', type: 'date', value: formData.payment.date || '' });

    refForm.append(
      el('div', { class: 'reg-field' }, [el('label', { class: 'reg-field-label', text: 'Número de referencia *' }), refInput]),
      el('div', { class: 'reg-field' }, [el('label', { class: 'reg-field-label', text: 'Fecha del pago *' }), dateInput])
    );

    // Comprobante upload
    const uploadId = 'reg-upload-comprobante';
    refForm.appendChild(el('div', { class: 'reg-field' }, [
      el('label', { class: 'reg-field-label', text: 'Comprobante de pago *' }),
      el('div', { id: uploadId })
    ]));
    step.appendChild(refForm);

    let comprobanteUploaded = false;
    const compUploader = new SVCUploader({
      containerId: uploadId,
      type: 'comprobante_pago',
      contextId: formData.personal.cedula || 'reg-' + Date.now(),
      accept: 'image/jpeg,image/png,application/pdf',
      maxSizeMB: 5,
      label: 'Comprobante de pago',
      extraFields: { registration: '1' },
      onSuccess: (data) => {
        comprobanteUploaded = true;
        if (data.file_id) formData.fileIds.push(data.file_id);
      }
    });
    // Render all uploaders after DOM ready
    setTimeout(() => { uploaders.forEach(u => u.render()); compUploader.render(); }, 50);

    footer.appendChild(el('button', {
      class: 'btn btn-primary btn-block',
      text: 'Enviar Solicitud Completa',
      onClick: async (e) => {
        if (uploadedCount.value < docs.length) { SVC.toast.warning(`Sube todos los documentos (${uploadedCount.value}/${docs.length})`); return; }
        if (!selectedMethod) { SVC.toast.warning('Selecciona un método de pago'); return; }
        if (!refInput.value.trim()) { SVC.toast.warning('Ingresa el número de referencia'); return; }
        if (!comprobanteUploaded) { SVC.toast.warning('Sube el comprobante de pago'); return; }

        formData.payment = {
          method: selectedMethod,
          reference: refInput.value.trim(),
          date: dateInput.value,
          amount: 50,
          currency: 'USD'
        };

        const btn = e.target;
        btn.disabled = true;
        btn.textContent = 'Enviando...';

        try {
          await submitRegistration();
          goNext();
        } catch (err) {
          SVC.toast.error(err.message || 'Error al enviar solicitud');
          btn.disabled = false;
          btn.textContent = 'Enviar Solicitud Completa';
        }
      }
    }));
  }

  function showPaymentDetails(methodId, container) {
    clearEl(container);
    const details = PAYMENT_DETAILS[methodId];
    if (!details) return;

    const box = el('div', { class: 'reg-payment-details' });
    details.forEach(([label, value]) => {
      box.appendChild(el('div', { class: 'reg-payment-detail-row' }, [
        el('span', { class: 'reg-payment-detail-label', text: label }),
        el('span', { class: 'reg-payment-detail-value', text: value })
      ]));
    });
    container.appendChild(box);
  }

  // ── STEP 6: Success ──────────────────────
  function buildStepSuccess(step) {
    const success = el('div', { class: 'reg-success' });

    // Animated checkmark SVG
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'reg-success-icon');
    svg.setAttribute('viewBox', '0 0 80 80');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '40'); circle.setAttribute('cy', '40'); circle.setAttribute('r', '36');
    circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', '#22C55E');
    circle.setAttribute('stroke-width', '3'); circle.setAttribute('stroke-dasharray', '226');
    circle.setAttribute('stroke-dashoffset', '226');
    const check = document.createElementNS(ns, 'path');
    check.setAttribute('d', 'M24 40l10 10 22-22');
    check.setAttribute('fill', 'none'); check.setAttribute('stroke', '#22C55E');
    check.setAttribute('stroke-width', '3.5'); check.setAttribute('stroke-linecap', 'round');
    check.setAttribute('stroke-linejoin', 'round');
    check.setAttribute('stroke-dasharray', '60'); check.setAttribute('stroke-dashoffset', '60');
    svg.append(circle, check);
    success.appendChild(svg);

    success.append(
      el('h2', { class: 'reg-success-title', text: '¡Solicitud Enviada!' }),
      el('p', { class: 'reg-success-message', text: 'Tu solicitud de membresía ha sido recibida. La Comisión de Credenciales de la SVC revisará tu expediente y comprobante de pago. Recibirás una notificación cuando sea procesada.' }),
      el('div', { class: 'reg-success-info', text: '⏱ Tiempo estimado de respuesta: 5-10 días hábiles' }),
      el('button', { class: 'btn btn-primary btn-block', text: 'Volver al Inicio', onClick: () => {
        const wizard = document.getElementById('register-shell');
        if (wizard) wizard.classList.remove('active');
        showWelcome();
      }})
    );

    step.appendChild(success);

    // Animate checkmark with GSAP
    if (typeof gsap !== 'undefined') {
      gsap.to(circle, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.out', delay: 0.2 });
      gsap.to(check, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out', delay: 0.7 });
    }
  }

  // ── Submit to API ────────────────────────
  async function submitRegistration() {
    const payload = {
      membership_type: formData.membershipType,
      email: formData.personal.email,
      password: formData.personal.password,
      first_name: formData.personal.first_name,
      last_name: formData.personal.last_name,
      cedula: formData.personal.cedula,
      phone: formData.personal.phone,
      birth_date: formData.personal.birth_date,
      gender: formData.personal.gender,
      professional: formData.professional,
      payment: formData.payment,
      file_ids: formData.fileIds,
      file_urls: formData.fileUrls
    };

    const res = await fetch('/api/register.php?action=submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Error al registrar');
    return data;
  }

  return { open, close, goBack, showWelcome, hideWelcome };
})();
