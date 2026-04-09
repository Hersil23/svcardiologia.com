/**
 * SVC App — Currency Utilities
 * DolarAPI integration for real-time USD/Bs rates
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
    return ratesData; // return stale cache if available
  }

  function getBcvRate() {
    return ratesData?.rates?.bcv?.promedio ?? null;
  }

  function getParaleloRate() {
    return ratesData?.rates?.paralelo?.promedio ?? null;
  }

  async function formatAmount(usd) {
    const data = await getRates();
    if (!data) return { usd, bs_bcv: null, bs_paralelo: null };

    const bcvRate = data.rates?.bcv?.promedio ?? 36.50;
    const parRate = data.rates?.paralelo?.promedio ?? 38.00;

    return {
      usd,
      bs_bcv: (usd * bcvRate).toFixed(2),
      bs_paralelo: (usd * parRate).toFixed(2),
      bcv_rate: bcvRate,
      par_rate: parRate,
      fecha: data.rates?.bcv?.fechaActualizacion,
    };
  }

  function fmtBs(value) {
    return Number(value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Render a price box showing USD + Bs equivalents
  async function renderPriceBox(usd, container) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    const { el: h } = SVCUtils;

    el.replaceChildren(h('div', { class: 'currency-loading', text: 'Cargando tasas...' }));

    const amounts = await formatAmount(usd);
    el.replaceChildren();

    const box = h('div', { class: 'price-box' }, [
      h('div', { class: 'price-usd' }, [
        document.createTextNode(`$${usd}.00 `),
        h('span', { text: 'USD' })
      ]),
      h('div', { class: 'price-divider', text: 'equivale a' }),
      h('div', { class: 'price-bs' }, [
        h('div', { class: 'price-bs-item' }, [
          h('span', { class: 'price-bs-label', text: 'Tasa BCV' }),
          h('span', { class: 'price-bs-value', text: `Bs. ${fmtBs(amounts.bs_bcv)}` }),
          h('span', { class: 'price-bs-rate', text: `1 USD = Bs. ${amounts.bcv_rate}` })
        ]),
        h('div', { class: 'price-bs-item paralelo' }, [
          h('span', { class: 'price-bs-label', text: 'Tasa Paralela' }),
          h('span', { class: 'price-bs-value', text: `Bs. ${fmtBs(amounts.bs_paralelo)}` }),
          h('span', { class: 'price-bs-rate', text: `1 USD = Bs. ${amounts.par_rate}` })
        ])
      ]),
      h('div', { class: 'price-updated', text: `Tasas actualizadas: ${amounts.fecha || 'hoy'}` })
    ]);

    el.appendChild(box);
  }

  // Render the home dashboard currency widget
  async function renderWidget(container) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    const { el: h } = SVCUtils;
    const data = await getRates();

    if (!data || !data.rates) {
      el.replaceChildren(h('div', { class: 'text-muted text-sm text-center', text: 'Tasas no disponibles' }));
      return;
    }

    const bcv = data.rates.bcv;
    const par = data.rates.paralelo;
    const bcvRate = bcv?.promedio ?? 0;
    const parRate = par?.promedio ?? 0;

    el.replaceChildren(
      h('div', { class: 'currency-widget' }, [
        h('div', { class: 'currency-widget-header' }, [
          h('span', { class: 'currency-widget-title', text: 'Dólar hoy' }),
          h('span', { class: 'currency-widget-updated', text: bcv?.fechaActualizacion || '' })
        ]),
        h('div', { class: 'currency-widget-rates' }, [
          h('div', { class: 'currency-widget-rate' }, [
            h('span', { class: 'currency-widget-label', text: 'BCV' }),
            h('span', { class: 'currency-widget-value', text: `Bs. ${fmtBs(bcvRate)}` })
          ]),
          h('div', { class: 'currency-widget-rate paralelo' }, [
            h('span', { class: 'currency-widget-label', text: 'Paralelo' }),
            h('span', { class: 'currency-widget-value', text: `Bs. ${fmtBs(parRate)}` })
          ])
        ])
      ])
    );
  }

  return { getRates, getBcvRate, getParaleloRate, formatAmount, renderPriceBox, renderWidget };
})();
