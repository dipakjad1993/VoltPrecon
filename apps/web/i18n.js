/* VoltPrecon i18n — tiny zero-dep dictionary (6 langs, ~2KB). Full pages stay English for SEO; UI chrome translates. */
(function () {
  const D = {
    en: { pick: '1 · Pick your EV', where: '2 · Where + how you ride', go: 'ANALYZE MY EV →', searchPh: 'Type: Nexon / Ather / Model Y / NIU / VinFast…' },
    hi: { pick: '1 · अपनी EV चुनें', where: '2 · कहाँ + कैसे चलाते हैं', go: 'मेरी EV का विश्लेषण →', searchPh: 'लिखें: Nexon / Ather / Model Y…' },
    id: { pick: '1 · Pilih EV Anda', where: '2 · Lokasi + cara berkendara', go: 'ANALISIS EV SAYA →', searchPh: 'Ketik: Nexon / Ather / Model Y / VinFast…' },
    vi: { pick: '1 · Chọn xe điện', where: '2 · Nơi + cách bạn chạy', go: 'PHÂN TÍCH XE CỦA TÔI →', searchPh: 'Gõ: Nexon / Ather / Model Y / VinFast…' },
    pt: { pick: '1 · Escolha seu EV', where: '2 · Onde + como você roda', go: 'ANALISAR MEU EV →', searchPh: 'Digite: Nexon / Ather / Model Y…' },
    de: { pick: '1 · Wähle dein E-Fahrzeug', where: '2 · Wo + wie du fährst', go: 'EV ANALYSIEREN →', searchPh: 'Tippen: Nexon / Ather / Model Y…' },
  };
  function lang() {
    const u = new URLSearchParams(location.search).get('lang');
    return D[u] ? u : (localStorage.getItem('vp-lang') || 'en');
  }
  function apply(l) {
    const d = D[l] || D.en;
    document.documentElement.lang = l === 'hi' ? 'hi' : l;
    document.querySelectorAll('[data-i18n="pick"]').forEach((e) => (e.textContent = d.pick));
    document.querySelectorAll('[data-i18n="where"]').forEach((e) => (e.textContent = d.where));
    const go = document.getElementById('go'); if (go) go.textContent = d.go;
    const q = document.getElementById('q'); if (q) q.placeholder = d.searchPh;
    const sel = document.getElementById('lang'); if (sel) sel.value = l;
    try { localStorage.setItem('vp-lang', l); } catch {}
  }
  window.VP_I18N = { apply, lang, DICT: D };
})();
