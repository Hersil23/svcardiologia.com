/**
 * SVC App — Currency Utilities
 * DolarAPI integration for real-time USD/Bs rates
 * BCV shown by default, USDT (paralelo) togglable
 */
const SVCCurrency = (() => {
  let ratesData = null;
  let lastFetch = 0;
  const CACHE_MS = 30 * 60 * 1000; // 30 minutes

  async function getRates(force = false) {
    if (!force && ratesData && (Date.now() - lastFetch) < CACHE_MS) {
      return ratesData;
    }
    try {
      const res = await SVC.api.get('rates.php');
      if (res.success && res.data) {
        ratesData = res.data;
        lastFetch = Date.now();
        return ratesData;
      }
    } catch (e) {
      console.error('Currency fetch failed:', e);
    }
    return ratesData;
  }

  function getBcvRate() {
    return ratesData?.rates?.bcv?.promedio ?? null;
  }

  function getUsdtRate() {
    return ratesData?.rates?.paralelo?.promedio ?? null;
  }

  async function formatAmount(usd) {
    const data = await getRates();
    if (!data) return { usd, bs_bcv: null, bs_usdt: null };

    const bcvRate = data.rates?.bcv?.promedio ?? 36.50;
    const usdtRate = data.rates?.paralelo?.promedio ?? 38.00;

    return {
      usd,
      bs_bcv: (usd * bcvRate).toFixed(2),
      bs_usdt: (usd * usdtRate).toFixed(2),
      bcv_rate: bcvRate,
      usdt_rate: usdtRate,
      fecha: data.rates?.bcv?.fechaActualizacion,
    };
  }

  function fmtBs(value) {
    return Number(value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Render price box: BCV by default, toggle to show USDT
  async function renderPriceBox(usd, container) {
    const root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) return;

    const { el: h } = SVCUtils;

    root.replaceChildren(h('div', { class: 'currency-loading', text: 'Cargando tasas...' }));

    const amounts = await formatAmount(usd);
    root.replaceChildren();

    let showUsdt = false;

    function render() {
      root.replaceChildren();

      const bcvItem = h('div', { class: 'price-bs-item' }, [
        h('span', { class: 'price-bs-label', text: 'Tasa BCV' }),
        h('span', { class: 'price-bs-value', text: `Bs. ${fmtBs(amounts.bs_bcv)}` }),
        h('span', { class: 'price-bs-rate', text: `1 USD = Bs. ${amounts.bcv_rate}` })
      ]);

      const usdtItem = h('div', { class: 'price-bs-item usdt' }, [
        h('span', { class: 'price-bs-label', text: 'Tasa USDT' }),
        h('span', { class: 'price-bs-value', text: `Bs. ${fmtBs(amounts.bs_usdt)}` }),
        h('span', { class: 'price-bs-rate', text: `1 USD = Bs. ${amounts.usdt_rate}` })
      ]);

      const bsGrid = h('div', { class: 'price-bs' });
      bsGrid.appendChild(bcvItem);
      if (showUsdt) bsGrid.appendChild(usdtItem);

      const toggleText = showUsdt ? 'Ocultar tasa USDT' : 'Ver tasa USDT';
      const toggleBtn = h('button', { class: 'price-toggle-btn', text: toggleText, onClick: () => {
        showUsdt = !showUsdt;
        render();
      }});

      const box = h('div', { class: 'price-box' }, [
        h('div', { class: 'price-usd' }, [
          document.createTextNode(`$${usd}.00 `),
          h('span', { text: 'USD' })
        ]),
        h('div', { class: 'price-divider', text: 'equivale a' }),
        bsGrid,
        toggleBtn,
        h('div', { class: 'price-updated', text: `Tasas actualizadas: ${amounts.fecha || 'hoy'}` })
      ]);

      root.appendChild(box);
    }

    render();
  }

  function formatRateDate(dateStr) {
    if (!dateStr) return 'hoy';
    try {
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;
      return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return dateStr; }
  }

  // Dashboard widget: BCV and USDT side by side
  async function renderWidget(container) {
    const root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) return;

    const { el: h } = SVCUtils;
    const data = await getRates();

    if (!data || !data.rates) {
      root.replaceChildren(h('div', { class: 'text-muted text-sm text-center', text: 'Tasas no disponibles' }));
      return;
    }

    const bcv = data.rates.bcv;
    const par = data.rates.paralelo;
    const bcvRate = bcv?.promedio ?? 0;
    const usdtRate = par?.promedio ?? 0;
    const dateStr = formatRateDate(bcv?.fechaActualizacion);

    root.replaceChildren(
      h('div', { class: 'currency-widget' }, [
        h('div', { class: 'currency-widget-header' }, [
          h('span', { class: 'currency-widget-title', text: 'Dólar hoy' }),
          h('span', { class: 'currency-widget-updated', text: dateStr })
        ]),
        h('div', { class: 'currency-widget-rates' }, [
          h('div', { class: 'currency-widget-rate' }, [
            h('span', { class: 'currency-widget-label', text: 'BCV' }),
            h('span', { class: 'currency-widget-value', text: `Bs. ${fmtBs(bcvRate)}` })
          ]),
          h('div', { class: 'currency-widget-rate usdt' }, [
            h('span', { class: 'currency-widget-label', text: 'USDT' }),
            h('span', { class: 'currency-widget-value', text: `Bs. ${fmtBs(usdtRate)}` })
          ])
        ])
      ])
    );
  }

  return { getRates, getBcvRate, getUsdtRate, formatAmount, renderPriceBox, renderWidget };
})();
