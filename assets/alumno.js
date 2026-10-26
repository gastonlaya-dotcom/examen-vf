// App del alumno: registro → responder una por una → verificar → corregir (máx. N) → enviar.
(function () {
  'use strict';
  var esc = VF.esc;
  var $app = document.getElementById('app');
  var $who = document.getElementById('who');
  var KEY = 'vf_examen_v1';

  var S = load();          // estado del examen en este dispositivo
  var info = null;         // datos públicos del examen (título, cursos…)
  var flash = '';          // mensaje para mostrar en el registro
  var busy = false;
  var confirmSend = false;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function reset() { S = null; try { localStorage.removeItem(KEY); } catch (e) { } }

  function total() { return S ? S.preguntas.length : (info ? info.totalPreguntas : 50); }
  function answered(map) { var c = 0; for (var k in map) if (map[k] === 'V' || map[k] === 'F') c++; return c; }
  function norm(map) {
    var o = {}; Object.keys(map || {}).sort(function (a, b) { return a - b; }).forEach(function (k) {
      if (map[k] === 'V' || map[k] === 'F') o[k] = map[k];
    }); return JSON.stringify(o);
  }
  function onlyVF(map) { var o = {}; for (var k in map) if (map[k] === 'V' || map[k] === 'F') o[k] = map[k]; return o; }
  function remaining() { return Math.max(0, S.maxCorrecciones - Math.max(0, S.verificaciones - 1)); }

  function setWho() {
    $who.textContent = S && S.alumno ? (S.alumno.apellido + ', ' + S.alumno.nombre + ' · ' + S.alumno.curso) : '';
  }

  function btnBusy(btn, label) {
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + esc(label);
  }

  // ───────── Arranque ─────────
  async function boot() {
    if (!VF.getUrl()) {
      $app.innerHTML = '<section class="card"><p class="eyebrow">Sin conexión al examen</p><h1>Este link no está completo</h1>' +
        '<p class="lead">Escaneá el código QR que muestra tu docente para entrar al examen.</p></section>';
      return;
    }
    if (S && S.examId) { render(); }
    try {
      info = await VF.call('info', {});
      document.title = info.titulo;
    } catch (e) {
      if (!S) {
        $app.innerHTML = '<section class="card"><h1>No pudimos cargar el examen</h1><p class="err">' + esc(e.message) +
          '</p><button class="btn primary" id="retry">Reintentar</button></section>';
        document.getElementById('retry').onclick = function () { location.reload(); };
        return;
      }
    }
    if (!S) render();
  }

  // ───────── Render ─────────
  function render() {
    setWho();
    confirmSend = confirmSend && S && S.stage === 'resultados';
    var stage = S ? S.stage : 'registro';
    if (stage === 'respondiendo') return viewQuestion(false);
    if (stage === 'fin') return viewEnd();
    if (stage === 'resultados') return viewResults();
    if (stage === 'corrigiendo') return viewQuestion(true);
    if (stage === 'enviado') return viewSent();
    return viewRegister();
  }

  function viewRegister() {
    var t = info ? info.titulo : 'Examen Verdadero o Falso';
    var n = info ? info.totalPreguntas : 50;
    var maxC = info ? info.maxCorrecciones : 3;
    var cursoField = info && info.cursos && info.cursos.length
      ? '<select id="curso" name="curso" required><option value="">Elegí tu curso</option>' +
        info.cursos.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>'
      : '<input id="curso" name="curso" autocomplete="off" required placeholder="Ej.: Comisión A">';
    var closed = info && !info.abierto;
    $app.innerHTML =
      '<section class="card">' +
        '<p class="eyebrow">Examen · ' + n + ' preguntas</p>' +
        '<h1>' + esc(t) + '</h1>' +
        '<p class="lead">Respondé cada afirmación con Verdadero o Falso. Podés dejar preguntas sin responder. ' +
        'Al final verificás tu puntaje y tenés hasta ' + maxC + ' oportunidades para corregir antes de enviar.</p>' +
        '<div class="rules"><div><b>+1</b><span>Correcta</span></div><div><b>−1</b><span>Incorrecta</span></div><div><b>0</b><span>Sin responder</span></div></div>' +
      '</section>' +
      '<section class="card">' +
        '<h2>Tus datos</h2>' +
        (closed ? '<p class="note">El examen está cerrado para nuevos ingresos. Si ya empezaste en este dispositivo, ingresá tus datos para continuar.</p>' : '') +
        (flash ? '<p class="err">' + esc(flash) + '</p>' : '') +
        '<form id="f" class="form" novalidate>' +
          '<div class="row2">' +
            '<div class="field"><label for="nombre">Nombre</label><input id="nombre" name="nombre" autocomplete="given-name" required></div>' +
            '<div class="field"><label for="apellido">Apellido</label><input id="apellido" name="apellido" autocomplete="family-name" required></div>' +
          '</div>' +
          '<div class="field"><label for="curso">Curso</label>' + cursoField + '</div>' +
          '<div class="field"><label for="dni">DNI o número de registro</label><input id="dni" name="dni" inputmode="numeric" autocomplete="off" required>' +
            '<span class="hint">Sin puntos. Es tu identificación: con el mismo dato no se puede rendir dos veces.</span></div>' +
          '<p id="ferr" class="err" hidden></p>' +
          '<button class="btn primary big" type="submit" id="go">Comenzar el examen</button>' +
        '</form>' +
      '</section>';
    flash = '';
    var f = document.getElementById('f');
    f.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (busy) return;
      var d = { nombre: f.nombre.value.trim(), apellido: f.apellido.value.trim(), curso: f.curso.value.trim(), dni: f.dni.value.trim() };
      var $e = document.getElementById('ferr');
      if (!d.nombre || !d.apellido || !d.curso || !d.dni) { $e.textContent = 'Completá los cuatro campos.'; $e.hidden = false; return; }
      busy = true; btnBusy(document.getElementById('go'), 'Ingresando…');
      try {
        var r = await VF.call('register', d);
        adopt(r);
        render();
        window.scrollTo(0, 0);
      } catch (e) {
        $e.textContent = e.message; $e.hidden = false;
        var b = document.getElementById('go'); b.disabled = false; b.textContent = 'Comenzar el examen';
      } finally { busy = false; }
    });
  }

  // Incorpora la respuesta del servidor (registro o reingreso) al estado local.
  function adopt(r) {
    var prev = S && S.examId === r.examId ? S : null;
    S = {
      examId: r.examId, token: r.token, titulo: r.titulo, alumno: r.alumno, preguntas: r.preguntas,
      verificaciones: r.verificaciones, maxCorrecciones: r.maxCorrecciones,
      respuestas: Object.assign({}, r.respuestas), snapshot: Object.assign({}, r.respuestas),
      resultado: r.resultado || null, enviado: r.enviado || '', idx: 0, stage: 'respondiendo'
    };
    if (r.estado === 'enviado') S.stage = 'enviado';
    else if (r.verificaciones > 0) S.stage = 'resultados';
    if (prev && S.stage !== 'enviado') {   // conservar avance local no verificado
      S.respuestas = Object.assign({}, prev.respuestas);
      S.idx = prev.idx || 0;
      if (r.verificaciones === 0 && (prev.stage === 'respondiendo' || prev.stage === 'fin')) S.stage = prev.stage;
      if (r.verificaciones > 0 && prev.stage === 'corrigiendo') S.stage = 'corrigiendo';
      if (r.verificaciones > 0 && prev.stage !== 'corrigiendo') S.respuestas = Object.assign({}, r.respuestas);
    }
    save();
  }

  // Si el docente habilitó el reingreso, se vuelve a vincular el dispositivo y se reintenta.
  async function withSession(fn) {
    try { return await fn(); } catch (e) {
      if (e.code === 'not_found') {
        reset(); flash = 'Tu examen fue reiniciado por el docente. Registrate de nuevo.'; render();
        throw e;
      }
      if (e.code === 'in_use') {
        var r = await VF.call('register', { nombre: S.alumno.nombre, apellido: S.alumno.apellido, curso: S.alumno.curso, dni: S.alumno.dni, token: S.token });
        var keep = S.respuestas, st = S.stage, idx = S.idx;
        adopt(r);
        if (S.stage === 'enviado') { render(); throw e; }
        S.respuestas = keep; S.stage = st; S.idx = idx; save();
        return await fn();
      }
      throw e;
    }
  }

  function viewQuestion(correcting) {
    var N = total();
    if (S.idx < 0) S.idx = 0;
    if (S.idx > N - 1) S.idx = N - 1;
    var q = S.preguntas[S.idx];
    var a = S.respuestas.hasOwnProperty(q.n) ? S.respuestas[q.n] : null;
    var done = answered(S.respuestas);
    var chosen = a !== null && a !== undefined;
    var last = S.idx === N - 1;

    var head, foot;
    if (!correcting) {
      head = '<div class="q-meta"><span>Pregunta <b>' + (S.idx + 1) + '</b> de ' + N + '</span><span>Respondidas: <b>' + done + '</b></span></div>' +
        '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + N + '" aria-valuenow="' + (S.idx + 1) + '"><i style="width:' + ((S.idx + 1) / N * 100) + '%"></i></div>';
      foot = '<div class="nav">' +
        '<button class="btn ghost" id="prev" ' + (S.idx === 0 ? 'disabled' : '') + '>Anterior</button>' +
        '<button class="btn primary" id="next" ' + (chosen ? '' : 'disabled') + '>' + (last ? 'Terminar' : 'Siguiente') + '</button>' +
        '</div>' + (chosen ? '' : '<p class="small muted" style="text-align:center">Elegí una opción (o dejala sin responder) para pasar a la siguiente.</p>');
    } else {
      var used = Math.max(0, S.verificaciones - 1);
      var changed = norm(S.respuestas) !== norm(S.snapshot);
      head = '<section class="card">' +
        '<div class="q-meta"><span>Corrección <b>' + (used + 1) + '</b> de ' + S.maxCorrecciones + '</span><span>Respondidas: <b>' + done + '</b> de ' + N + '</span></div>' +
        '<p class="small muted">Tocá un número para ir a esa pregunta. No se indica cuáles están bien o mal.</p>' +
        '<div class="grid50">' + S.preguntas.map(function (p, i) {
          var v = S.respuestas[p.n];
          var has = v === 'V' || v === 'F';
          var ch = (S.snapshot[p.n] || '') !== (has ? v : '');
          return '<button class="chip' + (has ? ' has' : ' blank') + (i === S.idx ? ' cur' : '') + (ch ? ' changed' : '') +
            '" data-i="' + i + '" aria-label="Pregunta ' + (i + 1) + (has ? ', respondida ' + v : ', sin responder') + '">' +
            (i + 1) + '<small>' + (has ? v : '–') + '</small></button>';
        }).join('') + '</div>' +
        '<div class="legend"><span><i style="background:var(--mark)"></i>Respondida</span><span><i></i>Sin responder</span><span><i style="box-shadow:inset 0 -3px 0 var(--accent)"></i>Cambiada en esta corrección</span></div>' +
        '</section>';
      foot = '<div class="nav">' +
        '<button class="btn ghost" id="prev" ' + (S.idx === 0 ? 'disabled' : '') + '>Anterior</button>' +
        '<button class="btn ghost" id="next" ' + (last ? 'disabled' : '') + '>Siguiente</button>' +
        '</div>' +
        '<div class="dock">' +
          (changed
            ? '<button class="btn primary big" id="verify">Verificar resultados</button>' +
              '<p class="small muted" style="text-align:center">Al verificar usás 1 de tus correcciones (te quedan ' + remaining() + ').</p>' +
              '<button class="btn ghost sm" id="discard">Descartar cambios y volver</button>'
            : '<button class="btn primary big" id="back">Volver a resultados (sin cambios)</button>') +
        '</div>';
    }

    $app.innerHTML = head +
      '<article class="card q-card"><p class="q-num">PREGUNTA ' + (S.idx + 1) + '</p><p class="q-text">' + esc(q.texto) + '</p></article>' +
      '<div class="choices" role="group" aria-label="Respuesta">' +
        '<button class="choice" data-v="V" aria-pressed="' + (a === 'V') + '"><span class="L">V</span><span class="w">Verdadero</span></button>' +
        '<button class="choice" data-v="F" aria-pressed="' + (a === 'F') + '"><span class="L">F</span><span class="w">Falso</span></button>' +
      '</div>' +
      '<button class="skip" data-v="" aria-pressed="' + (a === '') + '">' + (correcting ? 'Borrar respuesta (sin responder)' : 'Dejar sin responder') + '</button>' +
      foot;

    $app.querySelectorAll('[data-v]').forEach(function (b) {
      b.onclick = function () { choose(b.getAttribute('data-v')); };
    });
    $app.querySelectorAll('.chip').forEach(function (b) {
      b.onclick = function () { S.idx = +b.getAttribute('data-i'); save(); render(); };
    });
    var $prev = document.getElementById('prev'), $next = document.getElementById('next');
    if ($prev) $prev.onclick = function () { S.idx--; save(); render(); };
    if ($next) $next.onclick = function () {
      if (!correcting && last) { S.stage = 'fin'; save(); render(); window.scrollTo(0, 0); return; }
      S.idx++; save(); render();
    };
    var $v = document.getElementById('verify'); if ($v) $v.onclick = function () { verify($v); };
    var $b = document.getElementById('back'); if ($b) $b.onclick = function () { S.stage = 'resultados'; save(); render(); window.scrollTo(0, 0); };
    var $d = document.getElementById('discard'); if ($d) $d.onclick = function () {
      S.respuestas = Object.assign({}, S.snapshot); S.stage = 'resultados'; save(); render(); window.scrollTo(0, 0);
    };
  }

  function choose(v) {
    var q = S.preguntas[S.idx];
    S.respuestas[q.n] = v;   // 'V', 'F' o '' (sin responder a propósito)
    save();
    render();
  }

  document.addEventListener('keydown', function (e) {
    if (!S || (S.stage !== 'respondiendo' && S.stage !== 'corrigiendo')) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var k = e.key.toUpperCase();
    if (k === 'V' || k === 'F') { choose(k); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { var n = document.getElementById('next'); if (n && !n.disabled) n.click(); }
    else if (e.key === 'ArrowLeft') { var p = document.getElementById('prev'); if (p && !p.disabled) p.click(); }
  });

  function viewEnd() {
    var N = total(), done = answered(S.respuestas);
    $app.innerHTML =
      '<section class="card">' +
        '<p class="eyebrow">Llegaste al final</p>' +
        '<h1>Respondiste ' + done + ' de ' + N + '</h1>' +
        '<p class="lead">' + (N - done ? 'Dejaste ' + (N - done) + ' sin responder. ' : '') +
        'Cuando verifiques vas a ver cuántas tenés bien, mal y sin responder, y tu puntaje.</p>' +
        '<p id="err" class="err" hidden></p>' +
        '<div class="actions">' +
          '<button class="btn ghost" id="review">Revisar antes de verificar</button>' +
          '<button class="btn primary" id="verify">Verificar resultados</button>' +
        '</div>' +
      '</section>';
    document.getElementById('review').onclick = function () { S.stage = 'respondiendo'; S.idx = 0; save(); render(); };
    var $v = document.getElementById('verify'); $v.onclick = function () { verify($v); };
  }

  async function verify(btn) {
    if (busy) return;
    busy = true; btnBusy(btn, 'Verificando…');
    try {
      var r = await withSession(function () {
        return VF.call('verify', { examId: S.examId, token: S.token, respuestas: onlyVF(S.respuestas) });
      });
      S.verificaciones = r.verificaciones;
      S.resultado = r.resultado;
      S.snapshot = onlyVF(S.respuestas);
      S.stage = 'resultados';
      save(); render(); window.scrollTo(0, 0);
    } catch (e) {
      if (e.code === 'no_corrections') { S.respuestas = Object.assign({}, S.snapshot); S.verificaciones = 1 + S.maxCorrecciones; S.stage = 'resultados'; save(); render(); alertBox(e.message); }
      else if (e.code === 'sent') { S.stage = 'enviado'; save(); render(); }
      else if (S) { render(); alertBox(e.message); }
    } finally { busy = false; }
  }

  function alertBox(msg) {
    var p = document.createElement('p'); p.className = 'err'; p.textContent = msg;
    $app.insertBefore(p, $app.firstChild); window.scrollTo(0, 0);
  }

  function tiles(r) {
    return '<div class="tiles">' +
      '<div class="tile ok"><span class="k">Correctas</span><span class="v">' + r.correctas + '</span><span class="s">+1 cada una</span></div>' +
      '<div class="tile bad"><span class="k">Incorrectas</span><span class="v">' + r.incorrectas + '</span><span class="s">−1 cada una</span></div>' +
      '<div class="tile"><span class="k">Sin responder</span><span class="v">' + r.sin_responder + '</span><span class="s">0 puntos</span></div>' +
      '<div class="tile"><span class="k">Total de preguntas</span><span class="v">' + (r.total || total()) + '</span><span class="s">&nbsp;</span></div>' +
      '<div class="tile total"><span class="k">Puntaje final</span><span class="v">' + r.puntaje + '</span><span class="s">' + r.correctas + ' − ' + r.incorrectas + ' = ' + r.puntaje + ' de ' + (r.total || total()) + ' posibles</span></div>' +
      '</div>';
  }

  function viewResults() {
    var r = S.resultado || { correctas: 0, incorrectas: 0, sin_responder: total(), puntaje: 0 };
    var left = remaining(), used = S.maxCorrecciones - left;
    var pips = '';
    for (var i = 0; i < S.maxCorrecciones; i++) pips += '<span class="pip ' + (i < used ? 'used' : 'free') + '" aria-hidden="true"></span>';
    $app.innerHTML =
      '<section class="card">' +
        '<p class="eyebrow">Resultado ' + (S.verificaciones > 1 ? '· después de ' + (S.verificaciones - 1) + ' corrección' + (S.verificaciones > 2 ? 'es' : '') : '') + '</p>' +
        '<h1>Tu resultado</h1>' +
        tiles(r) +
        '<div class="pips">' + pips + '<span class="small">' + (left
          ? 'Te ' + (left === 1 ? 'queda 1 corrección' : 'quedan ' + left + ' correcciones') + ' de ' + S.maxCorrecciones + '.'
          : 'Ya no te quedan correcciones. Solo podés enviar.') + '</span></div>' +
        '<p id="err" class="err" hidden></p>' +
        (confirmSend
          ? '<div class="confirm"><strong>¿Enviar el examen con puntaje ' + r.puntaje + '?</strong>' +
            '<span class="small">Una vez enviado no vas a poder cambiar ninguna respuesta.</span>' +
            '<div class="actions"><button class="btn ghost" id="cancel">Cancelar</button><button class="btn primary" id="send2">Sí, enviar resultados</button></div></div>'
          : '<div class="actions">' +
              '<button class="btn" id="fix" ' + (left ? '' : 'disabled') + '>Corregir respuestas</button>' +
              '<button class="btn primary" id="send">Enviar resultados</button>' +
            '</div>') +
      '</section>';
    var $fix = document.getElementById('fix');
    if ($fix) $fix.onclick = function () { S.stage = 'corrigiendo'; S.idx = 0; S.respuestas = Object.assign({}, S.snapshot); save(); render(); window.scrollTo(0, 0); };
    var $s = document.getElementById('send'); if ($s) $s.onclick = function () { confirmSend = true; render(); };
    var $c = document.getElementById('cancel'); if ($c) $c.onclick = function () { confirmSend = false; render(); };
    var $s2 = document.getElementById('send2'); if ($s2) $s2.onclick = function () { submit($s2); };
  }

  async function submit(btn) {
    if (busy) return;
    busy = true; btnBusy(btn, 'Enviando…');
    try {
      var r = await withSession(function () {
        return VF.call('submit', { examId: S.examId, token: S.token, respuestas: onlyVF(S.snapshot) });
      });
      S.resultado = r.resultado; S.enviado = r.enviado; S.stage = 'enviado'; confirmSend = false;
      save(); render(); window.scrollTo(0, 0);
    } catch (e) {
      confirmSend = false;
      if (S) { render(); alertBox(e.message); }
    } finally { busy = false; }
  }

  function viewSent() {
    var r = S.resultado || {};
    $app.innerHTML =
      '<section class="card">' +
        '<p class="eyebrow">Examen enviado' + (S.enviado ? ' · ' + esc(S.enviado) : '') + '</p>' +
        '<h1>Listo, ' + esc(S.alumno.nombre) + '. Tu examen quedó registrado.</h1>' +
        tiles(r) +
        '<p class="small muted">' + esc(S.alumno.apellido + ', ' + S.alumno.nombre) + ' · ' + esc(S.alumno.curso) + ' · DNI/registro ' + esc(S.alumno.dni) + '</p>' +
      '</section>' +
      '<button class="btn ghost sm" id="other" style="justify-self:center">Usar este dispositivo para otro alumno</button>';
    document.getElementById('other').onclick = function () { reset(); render(); window.scrollTo(0, 0); };
  }

  boot();
})();
