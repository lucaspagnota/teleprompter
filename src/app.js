// Telas do app: biblioteca de peças, importação, editor, teleprompter e configurações.
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const VERSAO = '1.0.0';

  // ---------- dados guardados no computador ----------

  const PADRAO = {
    fonte: 72,
    linha: 1.25,
    paragrafo: 0.5,
    margem: 6,
    margemV: 5,
    familia: 'Arial, Helvetica, sans-serif',
    vertical: 'centro',
    corFala: '#ffffff',
    corObs: '#ffd84d',
    corSom: '#4dff88',
    nomes: true,
    encher: true,
    numero: true,
    espelhar: false,
  };

  const ler = (chave, padrao) => {
    try { const v = JSON.parse(localStorage.getItem(chave)); return v == null ? padrao : v; }
    catch (e) { return padrao; }
  };
  const gravar = (chave, valor) => {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch (e) { aviso('Não consegui salvar: ' + e.message); return false; }
  };

  let config = { ...PADRAO, ...ler('tp.config', {}) };
  let pecas = ler('tp.pecas', []);
  const salvarPecas = () => gravar('tp.pecas', pecas);
  const salvarConfig = () => gravar('tp.config', config);
  const novaId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- utilidades ----------

  let avisoTimer;
  function aviso(msg) {
    const el = $('#aviso');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function aplicarCores() {
    const r = document.documentElement.style;
    r.setProperty('--cor-fala', config.corFala);
    r.setProperty('--cor-obs', config.corObs);
    r.setProperty('--cor-som', config.corSom);
  }

  function span(seg) {
    const s = document.createElement('span');
    s.className = 't-' + seg.tipo + (seg.b ? ' t-b' : '');
    s.textContent = seg.t;
    return s;
  }

  /** Prévia rolando (importação e editor). */
  function desenharPrevia(el, texto) {
    el.textContent = '';
    el.style.fontFamily = config.familia;
    const paragrafos = Paginar.lerTexto(texto);
    for (const p0 of paragrafos) {
      const p = config.nomes ? Paginar.destacarNome(p0) : p0;
      const el2 = document.createElement('p');
      for (const r of p.runs) el2.appendChild(span(r));
      el.appendChild(el2);
    }
    if (!paragrafos.length) el.innerHTML = '<p style="opacity:.5">(sem texto)</p>';
  }

  const telas = ['biblioteca', 'importar', 'editor', 'leitor'];
  let telaAtual = 'biblioteca';
  function mostrar(nome) {
    telaAtual = nome;
    for (const t of telas) $('#tela-' + t).hidden = t !== nome;
    if (nome === 'leitor') $('#aviso').hidden = true;
  }

  // ---------- biblioteca ----------

  function fazerNeve() {
    const neve = $('.neve');
    for (let i = 0; i < 34; i++) {
      const s = document.createElement('span');
      s.textContent = i % 3 ? '•' : '❄';
      s.style.left = Math.random() * 100 + '%';
      s.style.fontSize = (i % 3 ? 6 + Math.random() * 8 : 12 + Math.random() * 12) + 'px';
      s.style.animationDuration = 9 + Math.random() * 14 + 's';
      s.style.animationDelay = -Math.random() * 20 + 's';
      s.style.opacity = 0.3 + Math.random() * 0.6;
      neve.appendChild(s);
    }
  }

  function dataCurta(ms) {
    return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function desenharBiblioteca() {
    const lista = $('#lista-pecas');
    lista.textContent = '';
    $('#vazio').hidden = pecas.length > 0;
    const ordenadas = pecas.slice().sort((a, b) => (b.aberta || b.atualizada) - (a.aberta || a.atualizada));
    for (const peca of ordenadas) {
      const c = document.createElement('article');
      c.className = 'cartao';
      const paragrafos = Paginar.lerTexto(peca.texto).length;
      c.innerHTML = `
        <h2></h2>
        <div class="info">${paragrafos} parágrafos · atualizada em ${dataCurta(peca.atualizada)}</div>
        <div class="botoes">
          <button class="btn ouro" data-a="ler">▶ Teleprompter</button>
          <button class="btn" data-a="editar">Editar</button>
          <button class="btn perigo" data-a="exportar" title="Salvar uma cópia em arquivo .txt">Exportar</button>
          <button class="btn perigo" data-a="excluir">Excluir</button>
        </div>`;
      c.querySelector('h2').textContent = peca.titulo || 'Sem nome';
      c.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'ler') abrirLeitor(peca.id);
        if (a.dataset.a === 'editar') abrirEditor(peca.id);
        if (a.dataset.a === 'exportar') exportar(peca);
        if (a.dataset.a === 'excluir' && confirm(`Excluir "${peca.titulo}"? Isso não pode ser desfeito.`)) {
          pecas = pecas.filter(p => p.id !== peca.id);
          salvarPecas();
          desenharBiblioteca();
        }
      });
      lista.appendChild(c);
    }
  }

  function exportar(peca) {
    const blob = new Blob(['﻿' + peca.texto], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (peca.titulo || 'peca').replace(/[\\/:*?"<>|]/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function criarPeca(titulo, texto) {
    const agora = Date.now();
    const peca = { id: novaId(), titulo, texto, criada: agora, atualizada: agora, posicao: 0 };
    pecas.push(peca);
    salvarPecas();
    return peca;
  }

  // ---------- importação ----------

  const nomeSemExtensao = (n) => n.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  let importacao = null;

  async function abrirArquivo(arquivo) {
    if (!arquivo) return;
    const ehPdf = /\.pdf$/i.test(arquivo.name) || arquivo.type === 'application/pdf';
    if (!ehPdf) {
      if (/\.txt$/i.test(arquivo.name) || arquivo.type.startsWith('text/')) {
        const texto = (await arquivo.text()).replace(/^﻿/, '');
        const peca = criarPeca(nomeSemExtensao(arquivo.name), texto);
        abrirEditor(peca.id);
        aviso('Texto importado.');
      } else aviso('Esse arquivo não é PDF nem TXT.');
      return;
    }
    mostrar('importar');
    $('#imp-carregando').hidden = false;
    $('#imp-pronto').hidden = true;
    $('#imp-salvar').disabled = true;
    $('#imp-progresso').textContent = 'Lendo o PDF…';
    try {
      const dados = new Uint8Array(await arquivo.arrayBuffer());
      const paginas = await Importar.lerPdf(dados, (n, total) => {
        $('#imp-progresso').textContent = `Lendo a página ${n} de ${total}…`;
      });
      const estilos = Importar.estilosDe(paginas);
      if (!estilos.length) throw new Error('Não encontrei texto neste PDF. Se ele for escaneado (foto), não dá para ler o texto.');
      importacao = { paginas, estilos };
      $('#imp-titulo').value = nomeSemExtensao(arquivo.name);
      desenharEstilos();
      atualizarPreviaImportacao();
      $('#imp-carregando').hidden = true;
      $('#imp-pronto').hidden = false;
      $('#imp-salvar').disabled = false;
    } catch (e) {
      console.error(e);
      mostrar('biblioteca');
      aviso('Não consegui ler o PDF: ' + (e.message || e));
    }
  }

  const NOMES_TIPO = { fala: 'Fala', obs: 'Observação', som: 'Sonoplastia', ignorar: 'Ignorar' };
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  function desenharEstilos() {
    const box = $('#imp-estilos');
    box.textContent = '';
    for (const e of importacao.estilos) {
      if (e.letras < 3) continue; // sobra de pontuação: fica com a sugestão
      const linha = document.createElement('div');
      linha.className = 'estilo';
      const amostra = document.createElement('div');
      amostra.className = 'amostra';
      amostra.textContent = 'A';
      amostra.style.color = rgb(e.cor);
      amostra.style.background = e.fundo ? rgb(e.fundo) : '#fff';
      if (e.i) amostra.style.fontStyle = 'italic';
      const meio = document.createElement('div');
      meio.innerHTML = '<div class="nome"></div><div class="ex"></div>';
      meio.querySelector('.nome').textContent = e.chave[0].toUpperCase() + e.chave.slice(1) + ` · ${e.letras} letras`;
      const ex = meio.querySelector('.ex');
      ex.textContent = '“' + e.exemplo + '…”';
      if (e.i) ex.classList.add('ex-i');
      const sel = document.createElement('select');
      for (const [v, n] of Object.entries(NOMES_TIPO)) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = n;
        sel.appendChild(o);
      }
      sel.value = e.tipo;
      sel.addEventListener('change', () => { e.tipo = sel.value; atualizarPreviaImportacao(); });
      linha.append(amostra, meio, sel);
      box.appendChild(linha);
    }
  }

  function textoImportado() {
    const tipos = {};
    for (const e of importacao.estilos) tipos[e.chave] = e.tipo;
    return Importar.montarTexto(importacao.paginas, tipos, { parenteses: $('#imp-parenteses').checked });
  }

  function atualizarPreviaImportacao() {
    if (!importacao) return;
    importacao.texto = textoImportado();
    desenharPrevia($('#imp-previa'), importacao.texto);
  }

  // ---------- editor ----------

  let editando = null;
  let editorSujo = false;

  function abrirEditor(id) {
    const peca = pecas.find(p => p.id === id);
    if (!peca) return;
    editando = peca;
    $('#ed-titulo').value = peca.titulo;
    $('#ed-texto').value = peca.texto;
    editorSujo = false;
    $('#ed-status').textContent = '';
    desenharPrevia($('#ed-previa'), peca.texto);
    mostrar('editor');
    $('#ed-texto').focus();
    $('#ed-texto').setSelectionRange(0, 0);
    $('#ed-texto').scrollTop = 0;
  }

  function salvarEditor() {
    if (!editando) return;
    editando.titulo = $('#ed-titulo').value.trim() || 'Sem nome';
    editando.texto = $('#ed-texto').value;
    editando.atualizada = Date.now();
    if (salvarPecas()) {
      editorSujo = false;
      $('#ed-status').textContent = 'Salvo ✓';
    }
  }

  let previaTimer;
  function editorMudou() {
    editorSujo = true;
    $('#ed-status').textContent = 'Alterações não salvas';
    clearTimeout(previaTimer);
    previaTimer = setTimeout(() => desenharPrevia($('#ed-previa'), $('#ed-texto').value), 250);
  }

  function inserir(ta, texto) {
    ta.focus();
    // execCommand mantém o Ctrl+Z funcionando.
    if (!document.execCommand('insertText', false, texto)) ta.setRangeText(texto, ta.selectionStart, ta.selectionEnd, 'end');
  }

  function marcar(tipo) {
    const ta = $('#ed-texto');
    let ini = ta.selectionStart, fim = ta.selectionEnd;
    const v = ta.value;
    if (ini === fim) {
      // Sem seleção: pega o parágrafo inteiro onde está o cursor.
      const antes = v.lastIndexOf('\n\n', ini - 1);
      ini = antes < 0 ? 0 : antes + 2;
      const depois = v.indexOf('\n\n', fim);
      fim = depois < 0 ? v.length : depois;
    }
    // Não engole quebras de linha nas pontas.
    while (ini < fim && /\s/.test(v[ini])) ini++;
    while (fim > ini && /\s/.test(v[fim - 1])) fim--;
    if (ini === fim) return;
    ta.setSelectionRange(ini, fim);
    const limpo = v.slice(ini, fim).replace(/\[\/?(obs|som)\]/gi, '');
    let novo;
    if (tipo === 'limpar') novo = limpo.replace(/\*\*/g, '');
    else if (tipo === 'b') novo = '**' + v.slice(ini, fim).replace(/\*\*/g, '') + '**';
    else novo = '[' + tipo + ']' + limpo + '[/' + tipo + ']';
    inserir(ta, novo);
    ta.setSelectionRange(ini, ini + novo.length);
    editorMudou();
  }

  function sairDoEditor() {
    if (editorSujo) salvarEditor();
    editando = null;
    desenharBiblioteca();
    mostrar('biblioteca');
  }

  // ---------- teleprompter ----------

  const leitor = { peca: null, paragrafos: [], paginas: [], pagina: 0, larguraMax: 0, origem: 'biblioteca' };
  const canvasMedida = document.createElement('canvas').getContext('2d');

  function medidor(fonte, familia) {
    const cache = new Map();
    return (texto, b) => {
      const k = (b ? '1' : '0') + texto;
      let w = cache.get(k);
      if (w === undefined) {
        canvasMedida.font = `${b ? 'bold' : 'normal'} ${fonte}px ${familia}`;
        w = canvasMedida.measureText(texto).width;
        cache.set(k, w);
      }
      return w;
    };
  }

  function abrirLeitor(id, origem = 'biblioteca') {
    const peca = pecas.find(p => p.id === id);
    if (!peca) return;
    leitor.peca = peca;
    leitor.origem = origem;
    leitor.paragrafos = Paginar.lerTexto(peca.texto);
    peca.aberta = Date.now();
    salvarPecas();
    $('#lt-titulo').textContent = peca.titulo;
    mostrar('leitor');
    paginarLeitor(peca.posicao || 0);
    mostrarBarra();
  }

  function paginarLeitor(inicioDesejado) {
    if (!leitor.peca) return;
    const area = $('#leitor-area');
    const W = area.clientWidth || window.innerWidth;
    const H = area.clientHeight || window.innerHeight;
    const mh = Math.round(W * config.margem / 100);
    const mv = Math.round(H * config.margemV / 100);
    const fonte = config.fonte;
    const linha = Math.round(fonte * config.linha);
    const largura = Math.max(fonte * 3, W - 2 * mh);
    const altura = Math.max(linha, H - 2 * mv);
    const r = Paginar.paginar(leitor.paragrafos, {
      largura,
      altura,
      linha,
      espacoParagrafo: Math.round(linha * config.paragrafo),
      medir: medidor(fonte, config.familia),
      destacarNomes: config.nomes,
      encher: config.encher,
    });
    leitor.paginas = r.paginas;
    leitor.larguraMax = Math.min(largura, Math.ceil(r.larguraMax) + 2);
    leitor.linha = linha;
    leitor.mv = mv;
    // Volta para a página que contém o parágrafo onde estava.
    let j = leitor.paginas.findIndex(p => p.inicio >= inicioDesejado);
    if (j < 0) j = leitor.paginas.length - 1;
    else if (j > 0 && leitor.paginas[j].inicio > inicioDesejado) j--;
    leitor.pagina = j;
    $('#lt-total').textContent = '/ ' + leitor.paginas.length;
    $('#lt-ir').max = leitor.paginas.length;
    $('#lt-tamanho').textContent = fonte + ' px';
    desenharPagina();
  }

  function desenharPagina() {
    const pg = leitor.paginas[leitor.pagina];
    const bloco = $('#leitor-bloco');
    const area = $('#leitor-area');
    const tela = $('#tela-leitor');
    bloco.textContent = '';
    bloco.style.fontFamily = config.familia;
    bloco.style.fontSize = config.fonte + 'px';
    bloco.style.width = leitor.larguraMax + 'px';
    area.classList.toggle('topo-v', config.vertical === 'topo');
    area.style.paddingTop = config.vertical === 'topo' ? leitor.mv + 'px' : '0';
    tela.classList.toggle('espelho', !!config.espelhar);
    for (const item of pg.itens) {
      const d = document.createElement('div');
      if (item.espaco) d.style.height = item.espaco + 'px';
      else {
        d.className = 'l';
        d.style.height = d.style.lineHeight = leitor.linha + 'px';
        for (const s of item.linha.segs) d.appendChild(span(s));
      }
      bloco.appendChild(d);
    }
    const n = leitor.pagina + 1;
    $('#leitor-pagina').textContent = config.numero ? `${n} / ${leitor.paginas.length}` : '';
    $('#lt-ir').value = n;
    if (leitor.peca.posicao !== pg.inicio) {
      leitor.peca.posicao = pg.inicio;
      salvarPecas();
    }
  }

  function irPara(n) {
    if (!leitor.paginas.length) return;
    const novo = Math.max(0, Math.min(leitor.paginas.length - 1, n));
    if (novo === leitor.pagina) return;
    leitor.pagina = novo;
    desenharPagina();
  }
  const proxima = () => irPara(leitor.pagina + 1);
  const anterior = () => irPara(leitor.pagina - 1);

  function mudarFonte(delta) {
    const atual = leitor.paginas[leitor.pagina];
    config.fonte = Math.max(24, Math.min(200, config.fonte + delta));
    salvarConfig();
    paginarLeitor(atual ? atual.inicio : 0);
    mostrarBarra();
  }

  function telaCheia() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => aviso('Não foi possível entrar em tela cheia.'));
  }

  function sairDoLeitor() {
    if (document.fullscreenElement) document.exitFullscreen();
    const volta = leitor.origem;
    leitor.peca = null;
    if (volta === 'editor' && editando) mostrar('editor');
    else { desenharBiblioteca(); mostrar('biblioteca'); }
  }

  let barraTimer;
  function mostrarBarra() {
    const t = $('#tela-leitor');
    t.classList.add('mostrar-cursor');
    clearTimeout(barraTimer);
    barraTimer = setTimeout(() => {
      if (!$('#leitor-barra').matches(':hover') && document.activeElement !== $('#lt-ir')) t.classList.remove('mostrar-cursor');
    }, 2500);
  }

  // Teclas de pedal: a maioria manda Page Down/Up, setas ou espaço.
  const AVANCA = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'MediaTrackNext', 'MediaPlayPause']);
  const VOLTA = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'MediaTrackPrevious']);

  function teclaLeitor(e) {
    if (e.target === $('#lt-ir')) return;
    if (config_aberto()) return;
    if (AVANCA.has(e.key)) { e.preventDefault(); proxima(); }
    else if (VOLTA.has(e.key)) { e.preventDefault(); anterior(); }
    else if (e.key === 'Home') irPara(0);
    else if (e.key === 'End') irPara(leitor.paginas.length - 1);
    else if (e.key === '+' || e.key === '=') mudarFonte(4);
    else if (e.key === '-' || e.key === '_') mudarFonte(-4);
    else if (e.key === 'f' || e.key === 'F' || e.key === 'F11') { e.preventDefault(); telaCheia(); }
    else if (e.key === 'Escape' && !document.fullscreenElement) sairDoLeitor();
  }

  // ---------- configurações ----------

  const config_aberto = () => $('#config').open;
  const CAMPOS = [
    ['#cf-fonte', 'fonte', Number, v => v + ' px'],
    ['#cf-linha', 'linha', Number, v => v.toFixed(2)],
    ['#cf-paragrafo', 'paragrafo', Number, v => v ? (v * 100).toFixed(0) + '%' : 'nenhum'],
    ['#cf-margem', 'margem', Number, v => v + '%'],
    ['#cf-margemv', 'margemV', Number, v => v + '%'],
    ['#cf-familia', 'familia', String],
    ['#cf-vertical', 'vertical', String],
    ['#cf-cor-fala', 'corFala', String],
    ['#cf-cor-obs', 'corObs', String],
    ['#cf-cor-som', 'corSom', String],
  ];
  const CHECKS = [['#cf-encher', 'encher'], ['#cf-nomes', 'nomes'], ['#cf-numero', 'numero'], ['#cf-espelhar', 'espelhar']];

  function preencherConfig() {
    for (const [sel, chave, , fmt] of CAMPOS) {
      $(sel).value = config[chave];
      if (fmt) $(sel + '-o').textContent = fmt(config[chave]);
    }
    for (const [sel, chave] of CHECKS) $(sel).checked = !!config[chave];
  }

  function configMudou() {
    aplicarCores();
    salvarConfig();
    if (telaAtual === 'leitor') {
      const atual = leitor.paginas[leitor.pagina];
      paginarLeitor(atual ? atual.inicio : 0);
    }
    if (telaAtual === 'editor') desenharPrevia($('#ed-previa'), $('#ed-texto').value);
    if (telaAtual === 'importar') atualizarPreviaImportacao();
  }

  function ligarConfig() {
    for (const [sel, chave, tipo, fmt] of CAMPOS) {
      $(sel).addEventListener('input', () => {
        config[chave] = tipo($(sel).value);
        if (fmt) $(sel + '-o').textContent = fmt(config[chave]);
        configMudou();
      });
    }
    for (const [sel, chave] of CHECKS) {
      $(sel).addEventListener('change', () => { config[chave] = $(sel).checked; configMudou(); });
    }
    $('#cf-padrao').addEventListener('click', () => {
      config = { ...PADRAO };
      preencherConfig();
      configMudou();
    });
  }

  function abrirConfig() {
    preencherConfig();
    $('#config').showModal();
  }

  // ---------- ligações ----------

  function iniciar() {
    $('#versao').textContent = 'versão ' + VERSAO;
    aplicarCores();
    fazerNeve();
    ligarConfig();
    desenharBiblioteca();

    $('#btn-importar').addEventListener('click', () => $('#arquivo').click());
    $('#arquivo').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      abrirArquivo(f);
    });
    $('#btn-nova').addEventListener('click', () => {
      const peca = criarPeca('Nova peça', 'PERSONAGEM: Escreva aqui a fala.\n\n[obs]Observação para quem está no palco.[/obs]\n\n[som]Sonoplastia: sino de Natal.[/som]');
      abrirEditor(peca.id);
      $('#ed-titulo').select();
    });
    $('#btn-config-bib').addEventListener('click', abrirConfig);

    document.querySelectorAll('[data-voltar]').forEach(b => b.addEventListener('click', () => {
      if (telaAtual === 'editor') return sairDoEditor();
      importacao = null;
      mostrar('biblioteca');
    }));

    // Importação
    $('#imp-parenteses').addEventListener('change', atualizarPreviaImportacao);
    $('#imp-salvar').addEventListener('click', () => {
      if (!importacao) return;
      const peca = criarPeca($('#imp-titulo').value.trim() || 'Sem nome', importacao.texto || textoImportado());
      importacao = null;
      desenharBiblioteca();
      abrirEditor(peca.id);
      aviso('Peça salva! Confira o texto e clique em ▶ Teleprompter.');
    });

    // Editor
    $('#ed-texto').addEventListener('input', editorMudou);
    $('#ed-titulo').addEventListener('input', () => { editorSujo = true; $('#ed-status').textContent = 'Alterações não salvas'; });
    $('#ed-salvar').addEventListener('click', salvarEditor);
    $('#ed-ler').addEventListener('click', () => { salvarEditor(); abrirLeitor(editando.id, 'editor'); });
    document.querySelectorAll('[data-marca]').forEach(b => b.addEventListener('click', () => marcar(b.dataset.marca)));

    // Teleprompter
    $('#lt-sair').addEventListener('click', sairDoLeitor);
    $('#lt-mais').addEventListener('click', () => mudarFonte(4));
    $('#lt-menos').addEventListener('click', () => mudarFonte(-4));
    $('#lt-prox').addEventListener('click', proxima);
    $('#lt-ant').addEventListener('click', anterior);
    $('#lt-tela-cheia').addEventListener('click', telaCheia);
    $('#lt-config').addEventListener('click', abrirConfig);
    $('#lt-ir').addEventListener('change', (e) => { irPara(Number(e.target.value) - 1); e.target.blur(); });
    $('#lt-ir').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    $('#leitor-barra').addEventListener('click', (e) => e.stopPropagation());
    $('#leitor-area').addEventListener('click', (e) => {
      if (e.clientX < window.innerWidth / 3) anterior(); else proxima();
    });
    $('#tela-leitor').addEventListener('mousemove', mostrarBarra);
    let rodaEm = 0;
    $('#tela-leitor').addEventListener('wheel', (e) => {
      const agora = Date.now();
      if (agora - rodaEm < 350 || Math.abs(e.deltaY) < 4) return;
      rodaEm = agora;
      if (e.deltaY > 0) proxima(); else anterior();
    }, { passive: true });

    let redimTimer;
    window.addEventListener('resize', () => {
      if (telaAtual !== 'leitor') return;
      clearTimeout(redimTimer);
      redimTimer = setTimeout(() => {
        const atual = leitor.paginas[leitor.pagina];
        paginarLeitor(atual ? atual.inicio : 0);
      }, 120);
    });
    document.addEventListener('fullscreenchange', () => {
      $('#lt-tela-cheia').textContent = document.fullscreenElement ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
    });

    document.addEventListener('keydown', (e) => {
      if (telaAtual === 'leitor') return teclaLeitor(e);
      if (telaAtual === 'editor' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        salvarEditor();
      }
    });

    // Arrastar e soltar o PDF em qualquer tela de organização.
    let arrastando = 0;
    window.addEventListener('dragenter', (e) => {
      if (telaAtual === 'leitor' || !e.dataTransfer.types.includes('Files')) return;
      arrastando++;
      document.body.classList.add('soltar');
    });
    window.addEventListener('dragleave', () => {
      if (--arrastando <= 0) { arrastando = 0; document.body.classList.remove('soltar'); }
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      arrastando = 0;
      document.body.classList.remove('soltar');
      if (telaAtual === 'leitor') return;
      if (telaAtual === 'editor' && editorSujo) salvarEditor();
      abrirArquivo(e.dataTransfer.files[0]);
    });

    window.addEventListener('beforeunload', () => { if (editorSujo) salvarEditor(); });
  }

  iniciar();
})();
