// Cliente del backend (Google Apps Script). Envía JSON como text/plain para evitar el preflight CORS.
(function () {
  'use strict';
  var LS_KEY = 'vf_api_url';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { } }

  function validUrl(u) { return /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(String(u || '').trim()); }

  // Prioridad: config.js → ?api= en el link (QR) → guardada en este navegador.
  function resolveUrl() {
    var cfg = (window.VF_CONFIG && window.VF_CONFIG.API_URL || '').trim();
    if (validUrl(cfg)) return cfg;
    var q = null;
    try { q = new URLSearchParams(location.search).get('api'); } catch (e) { }
    if (validUrl(q)) { lsSet(LS_KEY, q); return q; }
    var saved = lsGet(LS_KEY);
    return validUrl(saved) ? saved : '';
  }

  var url = resolveUrl();
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function call(action, data, opts) {
    opts = opts || {};
    if (!url) { var e0 = new Error('Falta configurar el servidor del examen.'); e0.code = 'no_api'; throw e0; }
    var retries = opts.retries == null ? 3 : opts.retries;
    var body = JSON.stringify(Object.assign({ action: action }, data || {}));
    var lastErr;
    for (var attempt = 0; attempt <= retries; attempt++) {
      try {
        var res = await fetch(url, { method: 'POST', body: body, redirect: 'follow' });
        var text = await res.text();
        var json;
        try { json = JSON.parse(text); } catch (pe) { throw new Error('Respuesta inesperada del servidor.'); }
        if (!json.ok) {
          var e = new Error(json.error || 'Error desconocido.');
          e.code = json.code; e.user = true;
          if (json.code !== 'busy') throw e;  // los errores de negocio no se reintentan
          lastErr = e;
        } else {
          return json;
        }
      } catch (err) {
        if (err.user && err.code !== 'busy') throw err;
        lastErr = err;
      }
      if (attempt < retries) await sleep(700 * Math.pow(2, attempt) + Math.random() * 600);
    }
    var fe = new Error(lastErr && lastErr.user ? lastErr.message : 'No hay conexión con el servidor. Revisá tu conexión e intentá de nuevo.');
    fe.code = lastErr && lastErr.code || 'network';
    throw fe;
  }

  window.VF = {
    call: call,
    getUrl: function () { return url; },
    setUrl: function (u) { u = String(u || '').trim(); url = validUrl(u) ? u : ''; lsSet(LS_KEY, url); return url; },
    fromConfig: function () { return validUrl(window.VF_CONFIG && window.VF_CONFIG.API_URL); },
    validUrl: validUrl,
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
  };
})();
