// Panel docente: resultados (repositorio de exámenes), carga de preguntas por Excel, QR y configuración.
(function () {
  'use strict';
  var esc = VF.esc;
  var $app = document.getElementById('app');
  var $layer = document.getElementById('layer');
  var PW_KEY = 'vf_admin_pw';

  var pw = ssGet(PW_KEY) || '';
  var cfg = null, totalPreguntas = 0;
  var tab = (location.hash || '').replace('#', '') || 'resultados';
  var exams = [], filtro = { curso: '', q: '', estado: '' };
  var preview = null;         // preguntas leídas del Excel, pendientes de publicar
  var autoTimer = null;

  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { } }
  function call(action, data) { return VF.call(action, Object.assign({ password: pw }, data || {})); }
  function studentUrl() {
    var base = location.href.replace(/[#?].*$/, '').replace(/admin\.html$/, '');
    if (!/\/$/.test(base)) base = base.replace(/[^/]*$/, '');
    return VF.fromConfig() ? base : base + '?api=' + encodeURIComponent(VF.getUrl());
  }
  function busyBtn(b, t) { if (b) { b.disabled = true; b.dataset.label = b.textContent; b.innerHTML = '<span class="spin"></span>' + esc(t); } }
  function freeBtn(b) { if (b) { b.disabled = false; b.textContent = b.dataset.label || b.textContent; } }
  function msg(el, text, kind) { if (!el) return; el.className = kind || 'err'; el.textContent = text; el.hidden = !text; }

  // ───────── Login ─────────
  function viewLogin(error) {
    document.getElementById('tabs-wrap').hidden = true;
    document.getElementById('logout').hidden = true;
    var needUrl = !VF.fromConfig();
    $app.innerHTML =
      '<section class="card" style="max-width:520px;width:100%;justify-self:center">' +
        '<p class="eyebrow">Panel docente</p><h1>Ingresar</h1>' +
        (error ? '<p class="err">' + esc(error) + '</p>' : '') +
        '<form id="f" class="form" novalidate>' +
          (needUrl ? '<div class="field"><label for="api">URL de la aplicación web (Apps Script)</label>' +
            '<input id="api" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(VF.getUrl()) + '">' +
            '<span class="hint">Se guarda en este navegador. Si la cargás en config.js del repositorio no hace falta.</span></div>' : '') +
          '<div class="field"><label for="pw">Contraseña</label><input id="pw" type="password" autocomplete="current-password"></div>' +
          '<button class="btn primary big" id="go">Entrar</button>' +
        '</form>' +
      '</section>';
    var f = document.getElementById('f');
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (needUrl) {
        var u = f.api.value.trim();
        if (!VF.validUrl(u)) return viewLogin('La URL debe empezar con https://script.google.com/ y terminar en /exec.');
        VF.setUrl(u);
      }
      pw = f.pw.value;
      var b = document.getElementById('go'); busyBtn(b, 'Entrando…');
      try { await login(); } catch (err) { pw = ''; ssSet(PW_KEY, ''); viewLogin(err.message); }
    });
  }

  async function login() {
    var r = await call('adminLogin');
    ssSet(PW_KEY, pw);
    cfg = r.config; totalPreguntas = r.totalPreguntas;
    document.getElementById('exam-title').textContent = cfg.titulo;
    document.getElementById('tabs-wrap').hidden = false;
    document.getElementById('logout').hidden = false;
    go(tab);
  }

  document.getElementById('logout').onclick = function () { pw = ''; ssSet(PW_KEY, ''); stopAuto(); viewLogin(); };
  document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { go(t.dataset.tab); }; });

  function go(t) {
    tab = ['resultados', 'preguntas', 'acceso', 'config'].indexOf(t) >= 0 ? t : 'resultados';
    try { history.replaceState(null, '', '#' + tab); } catch (e) { }
    document.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    stopAuto();
    if (tab === 'resultados') viewResults();
    if (tab === 'preguntas') viewQuestions();
    if (tab === 'acceso') viewAccess();
    if (tab === 'config') viewConfig();
  }
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

  // ───────── Resultados ─────────
  function viewResults() {
    $app.innerHTML =
      '<div class="stats" id="stats"></div>' +
      '<div class="toolbar">' +
        '<div class="field"><input id="q" placeholder="Buscar por apellido, nombre o DNI" value="' + esc(filtro.q) + '"></div>' +
        '<div class="field" style="flex:0 1 200px"><select id="fc"><option value="">Todos los cursos</option></select></div>' +
        '<div class="field" style="flex:0 1 170px"><select id="fe"><option value="">Todos los estados</option><option value="enviado">Enviados</option><option value="en_curso">En curso</option></select></div>' +
        '<button class="btn sm" id="refresh">Actualizar</button>' +
        '<button class="btn sm primary" id="export">Exportar a Excel</button>' +
      '</div>' +
      '<p id="rmsg" hidden></p>' +
      '<div class="tablewrap"><table><thead><tr>' +
        '<th>Alumno</th><th>Curso</th><th>DNI / registro</th><th>Estado</th><th class="n">Resp.</th><th class="n">Correc.</th>' +
        '<th class="n">✓</th><th class="n">✗</th><th class="n">—</th><th class="n">Puntaje</th><th>Enviado</th>' +
      '</tr></thead><tbody id="rows"><tr><td colspan="11" class="muted">Cargando…</td></tr></tbody></table></div>' +
      '<div class="actions" style="justify-content:flex-end"><button class="btn sm danger" id="archive">Archivar resultados y empezar de cero</button></div>' +
      '<div id="archive-confirm"></div>' +
      '<p class="small muted">Se actualiza solo cada 20 segundos. Tocá una fila para ver el examen completo. Todos los exámenes también quedan en la hoja <b>Examenes</b> y <b>Detalle</b> de tu Google Sheet.</p>';
    document.getElementById('q').oninput = function (e) { filtro.q = e.target.value; drawRows(); };
    document.getElementById('fc').onchange = function (e) { filtro.curso = e.target.value; drawRows(); };
    document.getElementById('fe').value = filtro.estado;
    document.getElementById('fe').onchange = function (e) { filtro.estado = e.target.value; drawRows(); };
    document.getElementById('refresh').onclick = function () { loadExams(true); };
    document.getElementById('export').onclick = exportExcel;
    document.getElementById('archive').onclick = confirmArchive;
    loadExams(true);
    autoTimer = setInterval(function () { if (!document.hidden && !$layer.firstChild) loadExams(false); }, 20000);
  }

  async function loadExams(showErr) {
    var b = document.getElementById('refresh');
    if (showErr) busyBtn(b, 'Actualizando');
    try {
      var r = await call('adminListExams');
      exams = r.examenes; totalPreguntas = r.totalPreguntas;
      if (tab !== 'resultados') return;
      drawStats(); fillCursos(); drawRows();
      msg(document.getElementById('rmsg'), '');
    } catch (e) {
      if (e.code === 'auth') return viewLogin(e.message);
      if (showErr) msg(document.getElementById('rmsg'), e.message);
    } finally { if (showErr) freeBtn(document.getElementById('refresh')); }
  }

  function drawStats() {
    var env = exams.filter(function (x) { return x.estado === 'enviado'; });
    var prom = env.length ? env.reduce(function (s, x) { return s + (+x.puntaje || 0); }, 0) / env.length : null;
    document.getElementById('stats').innerHTML =
      stat('Registrados', exams.length) + stat('En curso', exams.length - env.length) +
      stat('Enviados', env.length) + stat('Puntaje promedio', prom === null ? '—' : prom.toFixed(1).replace('.', ',') + ' / ' + totalPreguntas);
  }
  function stat(k, v) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }

  function fillCursos() {
    var sel = document.getElementById('fc'); if (!sel) return;
    var cursos = {}; exams.forEach(function (x) { if (x.curso) cursos[x.curso] = 1; });
    sel.innerHTML = '<option value="">Todos los cursos</option>' + Object.keys(cursos).sort().map(function (c) {
      return '<option' + (c === filtro.curso ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function filtered() {
    var q = filtro.q.trim().toLowerCase();
    return exams.filter(function (x) {
      if (filtro.curso && x.curso !== filtro.curso) return false;
      if (filtro.estado && x.estado !== filtro.estado) return false;
      if (q && (x.apellido + ' ' + x.nombre + ' ' + x.dni).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre, 'es'); });
  }

  function drawRows() {
    var tb = document.getElementById('rows'); if (!tb) return;
    var list = filtered();
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="11" class="muted">' + (exams.length ? 'Ningún examen coincide con el filtro.' : 'Todavía no se registró ningún alumno. Mostrá el QR desde la pestaña “QR y acceso”.') + '</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (x) {
      var env = x.estado === 'enviado';
      return '<tr class="click" data-id="' + esc(x.id) + '" tabindex="0">' +
        '<td><strong>' + esc(x.apellido) + '</strong>, ' + esc(x.nombre) + '</td>' +
        '<td>' + esc(x.curso) + '</td><td class="mono">' + esc(x.dni) + '</td>' +
        '<td>' + (env ? '<span class="pill ok">Enviado</span>' : (x.verificaciones ? '<span class="pill warn">Verificó, sin enviar</span>' : '<span class="pill neutral">Respondiendo</span>')) + '</td>' +
        '<td class="n">' + (x.verificaciones ? x.respondidas + '/' + x.total : '—') + '</td>' +
        '<td class="n">' + x.correccionesUsadas + '</td>' +
        '<td class="n">' + (env ? x.correctas : '') + '</td><td class="n">' + (env ? x.incorrectas : '') + '</td><td class="n">' + (env ? x.sin_responder : '') + '</td>' +
        '<td class="n"><strong>' + (env ? x.puntaje : '') + '</strong></td>' +
        '<td class="small">' + esc(x.enviado || '') + '</td></tr>';
    }).join('');
    tb.querySelectorAll('tr.click').forEach(function (tr) {
      tr.onclick = function () { openExam(tr.dataset.id); };
      tr.onkeydown = function (e) { if (e.key === 'Enter') openExam(tr.dataset.id); };
    });
  }

  async function openExam(id) {
    $layer.innerHTML = '<div class="overlay"><div class="modal"><p class="muted">Cargando examen…</p></div></div>';
    try {
      var r = await call('adminGetExam', { id: id });
      drawExam(r);
    } catch (e) {
      $layer.innerHTML = '<div class="overlay"><div class="modal"><p class="err">' + esc(e.message) + '</p><button class="btn" id="x">Cerrar</button></div></div>';
      document.getElementById('x').onclick = closeLayer;
    }
  }

  function drawExam(r) {
    var x = r.examen, env = x.estado === 'enviado';
    var sc = env ? x : (x.parcial || {});
    $layer.innerHTML =
      '<div class="overlay" id="ov"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt">' +
        '<div class="modal-head"><div><p class="eyebrow">' + (env ? 'Enviado ' + esc(x.enviado) : 'En curso · registrado ' + esc(x.creado)) + '</p>' +
          '<h2 id="mt">' + esc(x.apellido) + ', ' + esc(x.nombre) + '</h2>' +
          '<p class="muted small">' + esc(x.curso) + ' · DNI/registro <span class="mono">' + esc(x.dni) + '</span> · Correcciones usadas: ' + x.correccionesUsadas + '</p></div>' +
          '<button class="btn ghost sm" id="x">Cerrar</button></div>' +
        (env ? '' : '<p class="note">Este examen todavía no fue enviado. ' + (x.verificaciones ? 'Lo que ves son las respuestas de su última verificación.' : 'El alumno todavía no verificó: las respuestas se guardan al verificar.') + '</p>') +
        '<div class="stats">' + stat('Correctas', sc.correctas === '' ? '—' : sc.correctas) + stat('Incorrectas', sc.incorrectas === '' ? '—' : sc.incorrectas) +
          stat('Sin responder', sc.sin_responder === '' ? '—' : sc.sin_responder) + stat(env ? 'Puntaje final' : 'Puntaje parcial', sc.puntaje === '' ? '—' : sc.puntaje) + '</div>' +
        '<div class="tablewrap"><table><thead><tr><th class="n">#</th><th>Pregunta</th><th>Correcta</th><th>Elegida</th><th>Resultado</th><th class="n">Pts</th></tr></thead><tbody>' +
        r.detalle.map(function (d) {
          var pill = d.resultado === 'Correcta' ? 'ok' : (d.resultado === 'Incorrecta' ? 'bad' : 'neutral');
          return '<tr><td class="n">' + d.n + '</td><td>' + esc(d.pregunta) + '</td><td><span class="vf">' + esc(d.correcta) + '</span></td>' +
            '<td>' + (d.elegida ? '<span class="vf mark">' + esc(d.elegida) + '</span>' : '<span class="muted">—</span>') + '</td>' +
            '<td><span class="pill ' + pill + '">' + esc(d.resultado) + '</span></td><td class="n">' + (d.puntos > 0 ? '+' : '') + d.puntos + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p id="emsg" hidden></p>' +
        '<div class="actions">' +
          (!env && x.vinculado ? '<button class="btn sm" id="unlock">Habilitar reingreso desde otro dispositivo</button>' : '') +
          '<button class="btn sm danger" id="del">Eliminar este examen</button>' +
        '</div><div id="delc"></div>' +
      '</div></div>';
    document.getElementById('x').onclick = closeLayer;
    document.getElementById('ov').onclick = function (e) { if (e.target.id === 'ov') closeLayer(); };
    var u = document.getElementById('unlock');
    if (u) u.onclick = async function () {
      busyBtn(u, 'Habilitando…');
      try { await call('adminUnlock', { id: x.id }); msg(document.getElementById('emsg'), 'Listo. El alumno puede volver a ingresar con su DNI desde cualquier dispositivo y conserva sus respuestas y correcciones usadas.', 'okmsg'); u.remove(); loadExams(false); }
      catch (e) { freeBtn(u); msg(document.getElementById('emsg'), e.message); }
    };
    document.getElementById('del').onclick = function () {
      document.getElementById('delc').innerHTML = '<div class="confirm"><strong>¿Eliminar el examen de ' + esc(x.apellido + ', ' + x.nombre) + '?</strong>' +
        '<span class="small">Se borran sus respuestas y su puntaje. El alumno podrá registrarse y rendir de nuevo.</span>' +
        '<div class="actions"><button class="btn sm ghost" id="dno">Cancelar</button><button class="btn sm danger solid" id="dyes">Sí, eliminar</button></div></div>';
      document.getElementById('dno').onclick = function () { document.getElementById('delc').innerHTML = ''; };
      document.getElementById('dyes').onclick = async function () {
        var b = document.getElementById('dyes'); busyBtn(b, 'Eliminando…');
        try { await call('adminDeleteExam', { id: x.id }); closeLayer(); loadExams(true); }
        catch (e) { freeBtn(b); msg(document.getElementById('emsg'), e.message); }
      };
    };
  }

  function closeLayer() { $layer.innerHTML = ''; }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $layer.firstChild) closeLayer(); });

  function confirmArchive() {
    var box = document.getElementById('archive-confirm');
    box.innerHTML = '<div class="confirm"><strong>¿Archivar todos los resultados?</strong>' +
      '<span class="small">Se copian las hojas Examenes y Detalle a pestañas con la fecha de hoy dentro de tu Google Sheet y se vacía el listado para un examen nuevo. No se pierde nada.</span>' +
      '<div class="actions"><button class="btn sm ghost" id="ano">Cancelar</button><button class="btn sm danger solid" id="ayes">Sí, archivar</button></div></div>';
    document.getElementById('ano').onclick = function () { box.innerHTML = ''; };
    document.getElementById('ayes').onclick = async function () {
      var b = document.getElementById('ayes'); busyBtn(b, 'Archivando…');
      try {
        var r = await call('adminArchive'); box.innerHTML = '';
        msg(document.getElementById('rmsg'), r.archivo ? 'Archivado en las pestañas “Examenes ' + r.archivo + '” y “Detalle ' + r.archivo + '”.' : 'No había resultados para archivar.', 'okmsg');
        loadExams(false);
      } catch (e) { freeBtn(b); msg(document.getElementById('rmsg'), e.message); }
    };
  }

  async function exportExcel() {
    var b = document.getElementById('export'); busyBtn(b, 'Generando…');
    try {
      var r = await call('adminExport');
      var wb = XLSX.utils.book_new();
      var resumen = r.examenes.map(function (x) {
        return { Apellido: x.apellido, Nombre: x.nombre, Curso: x.curso, 'DNI/Registro': x.dni, Estado: x.estado === 'enviado' ? 'Enviado' : 'En curso',
          'Correcciones usadas': x.correccionesUsadas, Correctas: num(x.correctas), Incorrectas: num(x.incorrectas), 'Sin responder': num(x.sin_responder),
          Puntaje: num(x.puntaje), Registrado: x.creado, Enviado: x.enviado };
      }).sort(function (a, b) { return (a.Apellido + a.Nombre).localeCompare(b.Apellido + b.Nombre, 'es'); });
      var detalle = r.detalle.map(function (d) {
        return { Apellido: d.apellido, Nombre: d.nombre, Curso: d.curso, 'DNI/Registro': d.dni, N: num(d.n), Pregunta: d.pregunta,
          'Respuesta correcta': d.respuesta_correcta, 'Respuesta elegida': d.respuesta_elegida || '', Resultado: d.resultado, Puntos: num(d.puntos), Enviado: d.enviado };
      });
      var ws1 = XLSX.utils.json_to_sheet(resumen.length ? resumen : [{ Apellido: 'Sin exámenes' }]);
      ws1['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 9 }, { wch: 19 }, { wch: 19 }];
      var ws2 = XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Apellido: 'Sin exámenes enviados' }]);
      ws2['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 5 }, { wch: 70 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 7 }, { wch: 19 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');
      XLSX.utils.book_append_sheet(wb, ws2, 'Detalle');
      var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
      XLSX.writeFile(wb, 'resultados_examen_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.xlsx');
    } catch (e) { msg(document.getElementById('rmsg'), e.message); }
    finally { freeBtn(b); }
  }
  function num(v) { return v === '' || v == null || isNaN(+v) ? '' : +v; }

  // ───────── Preguntas ─────────
  async function viewQuestions() {
    $app.innerHTML =
      '<section class="card">' +
        '<div class="modal-head"><div><h2>Cargar preguntas desde Excel</h2>' +
        '<p class="muted small">Una pregunta por fila con dos columnas: <b>Pregunta</b> y <b>Respuesta</b> (V o F). Se aceptan también Verdadero/Falso.</p></div>' +
        '<button class="btn sm ghost" id="tpl">Descargar plantilla</button></div>' +
        '<label class="drop" id="drop" for="file"><strong>Arrastrá el archivo .xlsx acá</strong><span class="muted small">o tocá para elegirlo</span>' +
          '<input type="file" id="file" accept=".xlsx,.xls,.csv" hidden></label>' +
        '<p id="pmsg" hidden></p>' +
        '<div id="prev"></div>' +
      '</section>' +
      '<section class="card"><div class="modal-head"><h2>Preguntas publicadas</h2><span class="pill neutral" id="pcount"></span></div>' +
      '<div id="current"><p class="muted">Cargando…</p></div></section>';
    var drop = document.getElementById('drop'), file = document.getElementById('file');
    file.onchange = function () { if (file.files[0]) readFile(file.files[0]); file.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) readFile(f); });
    document.getElementById('tpl').onclick = downloadTemplate;
    if (preview) drawPreview();
    try {
      var r = await call('adminGetQuestions');
      totalPreguntas = r.preguntas.length;
      var pc = document.getElementById('pcount'); if (!pc) return;
      pc.textContent = r.preguntas.length + ' preguntas';
      document.getElementById('current').innerHTML = r.preguntas.length ? qTable(r.preguntas) : '<p class="muted">Todavía no hay preguntas publicadas.</p>';
    } catch (e) {
      if (e.code === 'auth') return viewLogin(e.message);
      var c = document.getElementById('current'); if (c) c.innerHTML = '<p class="err">' + esc(e.message) + '</p>';
    }
  }

  function qTable(list, errs) {
    return '<div class="tablewrap" style="max-height:520px;overflow:auto"><table><thead><tr><th class="n">#</th><th>Pregunta</th><th>Respuesta</th></tr></thead><tbody>' +
      list.map(function (q, i) {
        var bad = !q.respuesta;
        return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(q.texto) + '</td><td>' +
          (bad ? '<span class="pill bad">Falta V/F' + (q.raw ? ': “' + esc(q.raw) + '”' : '') + '</span>' : '<span class="vf">' + q.respuesta + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function normAns(v) {
    if (v === true) return 'V'; if (v === false) return 'F';
    var s = String(v == null ? '' : v).trim().toUpperCase();
    if (['V', 'VERDADERO', 'VERDADERA', 'TRUE', 'SI', 'SÍ', '1'].indexOf(s) >= 0) return 'V';
    if (['F', 'FALSO', 'FALSA', 'FALSE', 'NO', '0'].indexOf(s) >= 0) return 'F';
    return '';
  }

  function readFile(f) {
    var pm = document.getElementById('pmsg');
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames.indexOf('Preguntas') >= 0 ? 'Preguntas' : wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
        var hi = -1, qi = -1, ai = -1;
        for (var r = 0; r < Math.min(rows.length, 10) && hi < 0; r++) {
          rows[r].forEach(function (c, i) {
            var s = String(c).trim().toLowerCase();
            if (qi < 0 && /pregunta|afirmaci|enunciado/.test(s)) qi = i;
            if (ai < 0 && /respuesta|correct|v\s*\/\s*f|valor/.test(s)) ai = i;
          });
          if (qi >= 0 && ai >= 0) hi = r; else { qi = -1; ai = -1; }
        }
        if (hi < 0) {      // sin encabezados: A = pregunta, B = respuesta (o A = N, B = pregunta, C = respuesta)
          var first = rows[0] || [];
          if (first.length >= 3 && !isNaN(parseFloat(first[0]))) { qi = 1; ai = 2; } else { qi = 0; ai = 1; }
        }
        var list = [];
        rows.slice(hi + 1).forEach(function (row) {
          var t = String(row[qi] == null ? '' : row[qi]).trim();
          if (!t) return;
          list.push({ texto: t, respuesta: normAns(row[ai]), raw: String(row[ai] == null ? '' : row[ai]).trim() });
        });
        if (!list.length) throw new Error('No encontré preguntas en el archivo. Revisá que tenga las columnas Pregunta y Respuesta.');
        preview = { nombre: f.name, list: list };
        msg(pm, '');
        drawPreview();
      } catch (err) { preview = null; drawPreview(); msg(pm, err.message || 'No se pudo leer el archivo.'); }
    };
    reader.readAsArrayBuffer(f);
  }

  function drawPreview(warnExams) {
    var box = document.getElementById('prev'); if (!box) return;
    if (!preview) { box.innerHTML = ''; return; }
    var bad = preview.list.filter(function (q) { return !q.respuesta; }).length;
    var n = preview.list.length;
    var v = preview.list.filter(function (q) { return q.respuesta === 'V'; }).length;
    box.innerHTML =
      '<div class="modal-head"><div><h3>' + esc(preview.nombre) + '</h3><p class="small muted">' + n + ' preguntas · ' + v + ' verdaderas · ' + (n - v - bad) + ' falsas</p></div></div>' +
      (n !== 50 ? '<p class="note">El archivo tiene ' + n + ' preguntas (el examen está pensado para 50). Podés publicarlo igual.</p>' : '') +
      (bad ? '<p class="err">' + bad + ' pregunta' + (bad > 1 ? 's no tienen' : ' no tiene') + ' una respuesta válida. Corregí el Excel y volvé a subirlo.</p>' : '') +
      (warnExams ? '<div class="confirm"><strong>Ya hay alumnos registrados con las preguntas actuales.</strong><span class="small">Si reemplazás las preguntas, los exámenes en curso quedan con un enunciado distinto. Lo recomendable es archivar los resultados primero (pestaña Resultados).</span>' +
        '<div class="actions"><button class="btn sm ghost" id="pcancel">Cancelar</button><button class="btn sm danger solid" id="pforce">Reemplazar igual</button></div></div>' : '') +
      qTable(preview.list) +
      '<div class="actions"><button class="btn ghost" id="pdrop">Descartar</button><button class="btn primary" id="ppub" ' + (bad ? 'disabled' : '') + '>Publicar ' + n + ' preguntas</button></div>';
    document.getElementById('pdrop').onclick = function () { preview = null; drawPreview(); };
    document.getElementById('ppub').onclick = function () { publish(false); };
    var pf = document.getElementById('pforce'); if (pf) pf.onclick = function () { publish(true); };
    var pc = document.getElementById('pcancel'); if (pc) pc.onclick = function () { drawPreview(false); };
  }

  async function publish(force) {
    var b = document.getElementById(force ? 'pforce' : 'ppub'); busyBtn(b, 'Publicando…');
    try {
      var r = await call('adminSetQuestions', { force: force, preguntas: preview.list.map(function (q) { return { texto: q.texto, respuesta: q.respuesta }; }) });
      preview = null;
      await viewQuestions();
      msg(document.getElementById('pmsg'), 'Publicadas ' + r.total + ' preguntas. Los alumnos que entren a partir de ahora las van a ver.', 'okmsg');
    } catch (e) {
      if (e.code === 'has_exams') return drawPreview(true);
      freeBtn(b); msg(document.getElementById('pmsg'), e.message);
    }
  }

  async function downloadTemplate() {
    var rows = [['N', 'Pregunta', 'Respuesta']];
    try {
      var r = await call('adminGetQuestions');
      r.preguntas.forEach(function (q) { rows.push([q.n, q.texto, q.respuesta]); });
    } catch (e) { }
    if (rows.length === 1) rows.push([1, 'Escribí acá la afirmación.', 'V'], [2, 'Otra afirmación falsa.', 'F']);
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 100 }, { wch: 11 }];
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Preguntas');
    XLSX.writeFile(wb, 'preguntas_examen_vf.xlsx');
  }

  // ───────── QR y acceso ─────────
  function viewAccess() {
    var url = studentUrl();
    var open = cfg.abierto === 'SI';
    $app.innerHTML =
      '<section class="card"><div class="qr-box">' +
        '<div class="qr" id="qr"></div>' +
        '<div style="display:grid;gap:14px;min-width:0">' +
          '<div><p class="eyebrow">Link para los alumnos</p><h2>' + esc(cfg.titulo) + '</h2></div>' +
          '<div class="linkbox"><input id="url" readonly value="' + esc(url) + '"><button class="btn sm" id="copy">Copiar</button></div>' +
          '<label class="switch"><input type="checkbox" id="open" ' + (open ? 'checked' : '') + '><span id="openl">' + (open ? 'Abierto: se aceptan nuevos alumnos' : 'Cerrado: no se aceptan nuevos alumnos') + '</span></label>' +
          '<p id="amsg" hidden></p>' +
          '<div class="actions"><button class="btn primary" id="proj">Proyectar QR en pantalla completa</button><a class="btn ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Probar como alumno</a></div>' +
          '<p class="small muted">Los alumnos que ya empezaron pueden terminar y enviar aunque cierres el ingreso.</p>' +
        '</div></div></section>';
    makeQR(document.getElementById('qr'), url, 260);
    document.getElementById('copy').onclick = function () {
      var inp = document.getElementById('url');
      var done = function () { msg(document.getElementById('amsg'), 'Link copiado.', 'okmsg'); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { inp.select(); });
      else inp.select();
    };
    document.getElementById('open').onchange = async function (e) {
      var val = e.target.checked;
      try {
        var r = await call('adminSetConfig', { config: { abierto: val ? 'SI' : 'NO' } });
        cfg = r.config;
        document.getElementById('openl').textContent = cfg.abierto === 'SI' ? 'Abierto: se aceptan nuevos alumnos' : 'Cerrado: no se aceptan nuevos alumnos';
      } catch (err) { e.target.checked = !val; msg(document.getElementById('amsg'), err.message); }
    };
    document.getElementById('proj').onclick = function () { project(url); };
  }

  function makeQR(el, text, size) {
    el.innerHTML = '';
    if (!window.QRCode) { el.textContent = 'No se pudo cargar el generador de QR.'; return; }
    new QRCode(el, { text: text, width: size, height: size, colorDark: '#15202B', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  }

  function project(url) {
    var size = Math.min(window.innerWidth, window.innerHeight) * 0.62;
    $layer.innerHTML = '<div class="project" id="pj"><h2>' + esc(cfg.titulo) + '</h2><div class="qr" id="pqr"></div>' +
      '<p class="url">' + esc(url) + '</p><button class="btn ghost sm" id="pclose" style="color:#15202B;border-color:#D6DDE4;background:#fff">Cerrar (Esc)</button></div>';
    makeQR(document.getElementById('pqr'), url, Math.round(size));
    var pj = document.getElementById('pj');
    try { if (pj.requestFullscreen) pj.requestFullscreen().catch(function () { }); } catch (e) { }
    document.getElementById('pclose').onclick = function () {
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
      closeLayer();
    };
  }

  // ───────── Configuración ─────────
  function viewConfig() {
    $app.innerHTML =
      '<section class="card" style="max-width:720px">' +
        '<h2>Configuración del examen</h2>' +
        '<form id="cf" class="form" novalidate>' +
          '<div class="field"><label for="titulo">Título que ven los alumnos</label><input id="titulo" value="' + esc(cfg.titulo) + '"></div>' +
          '<div class="field"><label for="cursos">Cursos (separados por coma)</label><input id="cursos" value="' + esc(cfg.cursos) + '" placeholder="Ej.: Comisión A, Comisión B">' +
            '<span class="hint">Si lo completás, el alumno elige su curso de una lista. Si lo dejás vacío, lo escribe.</span></div>' +
          '<div class="row2">' +
            '<div class="field"><label for="maxc">Correcciones permitidas</label><input id="maxc" type="number" min="0" max="20" value="' + cfg.max_correcciones + '"></div>' +
            '<div class="field"><label for="mez">Orden de las preguntas</label><select id="mez"><option value="NO">Igual para todos</option><option value="SI">Aleatorio por alumno</option></select></div>' +
          '</div>' +
          '<div class="field"><label for="npw">Nueva contraseña del panel</label><input id="npw" type="password" autocomplete="new-password" placeholder="Dejalo vacío para no cambiarla"></div>' +
          '<p id="cmsg" hidden></p>' +
          '<button class="btn primary" id="save">Guardar cambios</button>' +
        '</form>' +
        (VF.fromConfig() ? '' : '<p class="small muted">Servidor: <span class="mono" style="overflow-wrap:anywhere">' + esc(VF.getUrl()) + '</span></p>') +
      '</section>';
    document.getElementById('mez').value = cfg.mezclar;
    document.getElementById('cf').addEventListener('submit', async function (e) {
      e.preventDefault();
      var b = document.getElementById('save'); busyBtn(b, 'Guardando…');
      var npw = document.getElementById('npw').value;
      try {
        var r = await call('adminSetConfig', { config: {
          titulo: document.getElementById('titulo').value, cursos: document.getElementById('cursos').value,
          max_correcciones: document.getElementById('maxc').value, mezclar: document.getElementById('mez').value,
          nueva_password: npw || undefined } });
        cfg = r.config;
        if (npw) { pw = npw; ssSet(PW_KEY, pw); }
        document.getElementById('exam-title').textContent = cfg.titulo;
        freeBtn(b); document.getElementById('npw').value = '';
        msg(document.getElementById('cmsg'), 'Cambios guardados.', 'okmsg');
      } catch (err) { freeBtn(b); msg(document.getElementById('cmsg'), err.message); }
    });
  }

  // ───────── Inicio ─────────
  if (pw && VF.getUrl()) login().catch(function (e) { pw = ''; ssSet(PW_KEY, ''); viewLogin(e.message); });
  else viewLogin();
})();
