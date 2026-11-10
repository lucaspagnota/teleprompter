// PDF do roteiro -> texto marcado do teleprompter.
//
// O pdf.js dá o texto e a posição de cada pedaço, mas não a cor. Para descobrir a cor,
// cada página é desenhada num canvas e lemos os pixels debaixo de cada pedaço de texto.
// Assim funciona com texto colorido e também com marca-texto (fundo colorido).
//
// Cada combinação de cor + itálico vira um "estilo". Quem importa escolhe o que cada
// estilo é: fala, observação, sonoplastia ou ignorar.

(function (raiz) {
  'use strict';

  const ESCALA = 1;

  // ---------- cores ----------

  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: h * 60, s, l };
  }

  /** Nome da cor (agrupa as variações do anti-aliasing). */
  function nomeDaCor([r, g, b]) {
    const { h, s, l } = hsl(r, g, b);
    if (s < 0.25 || l < 0.12) return l < 0.4 ? 'preto' : l < 0.8 ? 'cinza' : 'branco';
    if (h < 15 || h >= 345) return 'vermelho';
    if (h < 42) return 'laranja';
    if (h < 70) return 'amarelo';
    if (h < 165) return 'verde';
    if (h < 200) return 'ciano';
    if (h < 260) return 'azul';
    if (h < 300) return 'roxo';
    return 'rosa';
  }

  const media = (px) => {
    if (!px.length) return null;
    const s = [0, 0, 0];
    for (const p of px) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return s.map(v => Math.round(v / px.length));
  };

  /** Cor do texto (e do marca-texto, se houver) dentro de um retângulo do canvas. */
  function corNaCaixa(img, x0, y0, x1, y1) {
    const W = img.width, H = img.height, d = img.data;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return null;
    const passo = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
    const todos = [];
    for (let y = y0; y < y1; y += passo) {
      for (let x = x0; x < x1; x += passo) {
        const k = (y * W + x) * 4;
        const r = d[k], g = d[k + 1], b = d[k + 2];
        todos.push([r, g, b, 255 - Math.min(r, g, b), 0.299 * r + 0.587 * g + 0.114 * b]);
      }
    }
    const tinta = todos.filter(p => p[3] > 40);
    if (tinta.length < 2) return null;
    // Mais da metade da caixa pintada: é marca-texto. Texto = o mais escuro, fundo = o mais claro.
    if (tinta.length / todos.length > 0.55) {
      const ord = tinta.slice().sort((a, b) => a[4] - b[4]);
      const texto = media(ord.slice(0, Math.max(1, Math.floor(ord.length * 0.12))));
      const fundo = media(ord.slice(Math.floor(ord.length * 0.5)));
      return { texto, fundo };
    }
    const maxTinta = Math.max(...tinta.map(p => p[3]));
    return { texto: media(tinta.filter(p => p[3] >= maxTinta * 0.7)), fundo: null };
  }

  // ---------- leitura do PDF ----------

  function fonteDe(pagina, nome) {
    try {
      const f = pagina.commonObjs.get(nome);
      const n = (f && (f.name || f.loadedName)) || '';
      return {
        b: !!(f && f.bold) || /bold|black|heavy|semibold|demi/i.test(n),
        i: !!(f && f.italic) || /italic|oblique/i.test(n),
      };
    } catch (e) {
      return { b: false, i: false };
    }
  }

  /**
   * Lê o PDF e devolve as linhas de cada página: { y, h, x, pedacos: [{ t, cor, fundo, b, i }] }.
   * `progresso(feito, total)` é chamado a cada página.
   */
  async function lerPdf(dados, progresso) {
    const pdfjs = raiz.pdfjsLib;
    const doc = await pdfjs.getDocument({ data: dados }).promise;
    const paginas = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const vp = pagina.getViewport({ scale: ESCALA });
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const conteudo = await pagina.getTextContent();

      const itens = [];
      for (const it of conteudo.items) {
        if (typeof it.str !== 'string' || !it.str.length) continue;
        const tx = pdfjs.Util.transform(vp.transform, it.transform);
        const h = Math.hypot(tx[2], tx[3]) || 10;
        const w = it.width * ESCALA;
        const x = tx[4], y = tx[5];
        const vazio = !it.str.trim();
        const cor = vazio ? null : corNaCaixa(img, x, y - h * 0.85, x + w, y + h * 0.1);
        const f = fonteDe(pagina, it.fontName);
        itens.push({ t: it.str, x, y, w, h, cor: cor && cor.texto, fundo: cor && cor.fundo, b: f.b, i: f.i, vazio });
      }

      // Agrupa em linhas pela altura da linha de base.
      itens.sort((a, b) => a.y - b.y || a.x - b.x);
      const linhas = [];
      for (const it of itens) {
        const l = linhas.find(l => Math.abs(l.y - it.y) < Math.min(l.h, it.h) * 0.45);
        if (l) l.itens.push(it);
        else linhas.push({ y: it.y, h: it.h, itens: [it] });
      }
      for (const l of linhas) {
        l.itens.sort((a, b) => a.x - b.x);
        l.x = l.itens[0].x;
        l.fim = Math.max(...l.itens.filter(it => !it.vazio).map(it => it.x + it.w), l.x);
        l.pedacos = [];
        let fim = null;
        for (const it of l.itens) {
          let t = it.t;
          const ant = l.pedacos[l.pedacos.length - 1];
          if (ant && fim !== null && it.x - fim > it.h * 0.18 && !/\s$/.test(ant.t) && !/^\s/.test(t)) t = ' ' + t;
          fim = it.x + it.w;
          l.pedacos.push({ t, cor: it.cor, fundo: it.fundo, b: it.b, i: it.i, vazio: it.vazio });
        }
        delete l.itens;
      }
      linhas.sort((a, b) => a.y - b.y);
      paginas.push(linhas.filter(l => l.pedacos.some(p => p.t.trim())));
      pagina.cleanup();
      if (progresso) progresso(n, doc.numPages);
    }
    doc.destroy();
    return paginas;
  }

  // ---------- estilos ----------

  // Com marca-texto vale só a cor do marca-texto (a letra por cima quase sempre é escura).
  const chaveDo = (p) =>
    p.fundo ? 'marca-texto ' + nomeDaCor(p.fundo) : nomeDaCor(p.cor) + (p.i ? ' itálico' : '');

  /** Sugestão para cada estilo. */
  function sugerir(estilo, maisComum) {
    if (estilo.chave === maisComum) return 'fala';
    const cor = estilo.fundo ? nomeDaCor(estilo.fundo) : nomeDaCor(estilo.cor);
    if (cor === 'verde' || cor === 'ciano') return 'som';
    if (!estilo.fundo && (cor === 'preto' || cor === 'cinza') && !estilo.i) return 'fala';
    return 'obs';
  }

  /** Lista os estilos encontrados, do mais usado para o menos usado, com um exemplo de texto. */
  function estilosDe(paginas) {
    const mapa = new Map();
    for (const linhas of paginas) for (const l of linhas) for (const p of l.pedacos) {
      if (p.vazio || !p.cor) continue;
      const chave = chaveDo(p);
      p.chave = chave;
      let e = mapa.get(chave);
      if (!e) { e = { chave, cor: p.cor, fundo: p.fundo, i: p.i, letras: 0, exemplo: '' }; mapa.set(chave, e); }
      e.letras += p.t.trim().length;
      if (e.exemplo.length < 60) e.exemplo = (e.exemplo + ' ' + p.t.trim()).trim().slice(0, 80);
    }
    const lista = [...mapa.values()].sort((a, b) => b.letras - a.letras);
    const maisComum = lista[0] && lista[0].chave;
    for (const e of lista) e.tipo = sugerir(e, maisComum);
    return lista;
  }

  // ---------- montagem do texto ----------

  const NUM_PAGINA = /^\s*(p[aá]g(ina)?\.?\s*)?\d{1,4}(\s*(de|\/)\s*\d{1,4})?\s*$/i;
  // "MARIA:", "LUMINUS (VOZ DO ESPELHO):", "ELFOS (Falando em conjunto):"
  const NOME = /^\s*[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ0-9 .'’\-]{1,30}(\([^()]{1,40}\))?\s*:/;

  /** Cabeçalho ou rodapé que se repete na maioria das páginas. */
  function repetidas(paginas) {
    const conta = new Map();
    for (const linhas of paginas) {
      const vistas = new Set();
      // Só as duas primeiras e as duas últimas linhas da página podem ser cabeçalho ou rodapé.
      const pontas = linhas.length <= 4 ? linhas : linhas.slice(0, 2).concat(linhas.slice(-2));
      for (const l of pontas) {
        const t = l.pedacos.map(p => p.t).join('').replace(/\d+/g, '#').trim().toLowerCase();
        if (t && !vistas.has(t)) { vistas.add(t); conta.set(t, (conta.get(t) || 0) + 1); }
      }
    }
    const fora = new Set();
    if (paginas.length >= 3) for (const [t, n] of conta) if (n >= 3 && n >= paginas.length * 0.4) fora.add(t);
    return fora;
  }

  const mediana = (v) => {
    if (!v.length) return 0;
    const o = v.slice().sort((a, b) => a - b);
    return o[Math.floor(o.length / 2)];
  };
  const tiposDe = (runs) => [...new Set(runs.filter(r => r.t.trim()).map(r => r.tipo))];
  const TERMINA_FRASE = /[.!?…:)»"”]\s*$/;

  /**
   * Monta o texto marcado.
   * tipos: { [chave]: 'fala' | 'obs' | 'som' | 'ignorar' }
   * opcoes: { parenteses: true } transforma "(...)" dentro da fala em observação.
   *
   * Um parágrafo novo começa quando: há um espaço maior entre as linhas, o tamanho da letra muda,
   * a linha começa com NOME:, o tipo (fala/obs/som) muda, ou a linha de cima terminou a frase
   * antes do fim da margem (última linha de um parágrafo justificado).
   * Na virada de página do PDF, o parágrafo continua se a frase não tinha terminado.
   */
  function montarTexto(paginas, tipos, opcoes = {}) {
    const fora = repetidas(paginas);

    // Medidas do documento inteiro (uma página com poucas linhas engana).
    const razoes = [];
    const fins = [];
    const inicios = [];
    for (const linhas of paginas) {
      for (let k = 0; k < linhas.length; k++) {
        fins.push(linhas[k].fim);
        inicios.push(linhas[k].x);
        if (k) {
          const dy = linhas[k].y - linhas[k - 1].y;
          if (dy > 0 && dy < linhas[k - 1].h * 3) razoes.push(dy / linhas[k - 1].h);
        }
      }
    }
    const razao = mediana(razoes) || 1.2;
    const ordFins = fins.slice().sort((a, b) => a - b);
    const direita = ordFins[Math.floor(ordFins.length * 0.9)] || 0;
    const esquerda = mediana(inicios);
    const larguraTexto = Math.max(1, direita - esquerda);

    const paragrafos = [];
    let atual = null;
    let ultimoTipo = null;
    let anterior = null;

    paginas.forEach((linhas, pg) => {
      linhas.forEach((l, k) => {
        const textoLinha = l.pedacos.map(p => p.t).join('');
        const norm = textoLinha.replace(/\d+/g, '#').trim().toLowerCase();
        const naPonta = k < 2 || k >= linhas.length - 2;
        if (NUM_PAGINA.test(textoLinha) || (naPonta && fora.has(norm))) return;

        // Trechos da linha já com o tipo escolhido.
        const runs = [];
        let tipo = null;
        for (const p of l.pedacos) {
          if (!p.vazio && p.chave) tipo = tipos[p.chave] || 'fala';
          const tp = tipo || ultimoTipo || 'fala';
          if (tp === 'ignorar') continue;
          const ant = runs[runs.length - 1];
          const b = !!p.b && !p.vazio;
          if (ant && ant.tipo === tp && (ant.b === b || p.vazio)) ant.t += p.t;
          else runs.push({ t: p.t, tipo: tp, b });
        }
        if (!runs.some(r => r.t.trim())) return;

        let novo = !atual || !anterior;
        if (!novo) {
          const terminou = TERMINA_FRASE.test(anterior.texto);
          if (anterior.pg === pg) {
            const dy = l.y - anterior.y;
            const salto = dy <= 0 || dy > razao * Math.max(l.h, anterior.h) * 1.4;
            const mudouLetra = Math.abs(l.h - anterior.h) > 0.2 * Math.min(l.h, anterior.h);
            const curta = anterior.fim < direita - larguraTexto * 0.2;
            novo = salto || mudouLetra || (terminou && curta);
          } else {
            // Virada de página do PDF: continua se a frase não terminou
            // (a não ser que a linha de cima seja curtinha, como um título ou "PASSOS").
            novo = terminou || anterior.fim < esquerda + larguraTexto * 0.5;
          }
          // Parágrafo de um tipo só seguido de linha inteira de outro tipo (ex.: sonoplastia
          // entre as falas) começa parágrafo novo. Fala com rubrica no meio, não: a rubrica
          // pode terminar no fim da linha e a fala continuar na linha de baixo.
          const tiposAtual = tiposDe(atual.runs);
          const tipoAnt = tiposAtual.length === 1 ? tiposAtual[0] : null;
          const tipoNovo = tiposDe(runs).length === 1 ? tiposDe(runs)[0] : null;
          const mudouTipo = tipoAnt && tipoNovo && tipoAnt !== tipoNovo;
          novo = novo || NOME.test(textoLinha) || mudouTipo;
        }

        if (novo) {
          atual = { runs: [] };
          paragrafos.push(atual);
        } else {
          // Continua o parágrafo: junta a palavra cortada com hífen, senão põe espaço.
          const fim = atual.runs[atual.runs.length - 1];
          if (/[A-Za-zÀ-ÿ]-$/.test(fim.t) && /^[a-zà-ÿ]/.test(runs[0].t.trim())) fim.t = fim.t.slice(0, -1);
          else fim.t = fim.t.replace(/\s*$/, ' ');
          runs[0].t = runs[0].t.replace(/^\s+/, '');
        }
        for (const r of runs) {
          const fim = atual.runs[atual.runs.length - 1];
          if (fim && fim.tipo === r.tipo && fim.b === r.b) fim.t += r.t;
          else atual.runs.push({ ...r });
        }
        ultimoTipo = runs[runs.length - 1].tipo;
        anterior = { pg, y: l.y, h: l.h, fim: l.fim, texto: textoLinha };
      });
    });

    return paragrafos.map(p => paraTexto(opcoes.parenteses === false ? p.runs : parenteses(p.runs))).join('\n\n');
  }

  /** "(sai pela esquerda)" dentro de uma fala vira observação. */
  function parenteses(runs) {
    const out = [];
    for (const r of runs) {
      if (r.tipo !== 'fala') { out.push(r); continue; }
      const partes = r.t.split(/(\([^()]*\))/);
      for (const t of partes) if (t) out.push({ t, tipo: /^\(.*\)$/.test(t) ? 'obs' : 'fala', b: r.b });
    }
    // Parêntese que ficou fora da rubrica no PDF: "(" normal + "Com cara de...)" em itálico.
    for (let i = 0; i < out.length; i++) {
      const r = out[i], prox = out[i + 1], ant = out[i - 1];
      if (r.tipo === 'fala' && prox && prox.tipo === 'obs' && /\(\s*$/.test(r.t) && !/^\s*\(/.test(prox.t)) {
        r.t = r.t.replace(/\(\s*$/, '');
        prox.t = '(' + prox.t.replace(/^\s+/, '');
      }
      if (r.tipo === 'fala' && ant && ant.tipo === 'obs' && /^\s*\)/.test(r.t) && !/\)\s*$/.test(ant.t)) {
        r.t = r.t.replace(/^\s*\)/, '');
        ant.t = ant.t.replace(/\s+$/, '') + ')';
      }
    }
    return out.filter(r => r.t);
  }

  /**
   * Trechos -> texto com [obs], [som] e **negrito**.
   * Trechos seguidos do mesmo tipo ficam dentro de uma marca só: [obs]Entra **Luminus**, vestido...[/obs]
   * Dois ou mais asteriscos do PDF viram \* para não serem lidos como negrito.
   */
  function paraTexto(runs) {
    let s = '';
    let tipo = 'fala';
    let b = false;
    let pendente = '';
    for (const r of runs) {
      const t = r.t.replace(/\s+/g, ' ').replace(/\*{2,}/g, m => m.replace(/\*/g, '\\*'));
      if (!t.trim()) { if (t) pendente = ' '; continue; }
      const espaco = pendente || (/^\s/.test(t) ? ' ' : '');
      if (r.tipo !== tipo) {
        if (b) { s += '**'; b = false; }
        if (tipo !== 'fala') s += '[/' + tipo + ']';
        s += espaco;
        if (r.tipo !== 'fala') s += '[' + r.tipo + ']';
        tipo = r.tipo;
        if (r.b) { s += '**'; b = true; }
      } else if (r.b !== b) {
        s += b ? '**' + espaco : espaco + '**';
        b = r.b;
      } else s += espaco;
      s += t.trim();
      pendente = /\s$/.test(t) ? ' ' : '';
    }
    if (b) s += '**';
    if (tipo !== 'fala') s += '[/' + tipo + ']';
    return s.trim();
  }

  raiz.Importar = { lerPdf, estilosDe, montarTexto, nomeDaCor, corNaCaixa, paraTexto };
})(window);
