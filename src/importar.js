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

  const ESCALA = 1.5;

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

  const chaveDo = (p) =>
    (p.fundo ? 'marca-texto ' + nomeDaCor(p.fundo) + ' · ' : '') + nomeDaCor(p.cor) + (p.i ? ' itálico' : '');

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
  const NOME = /^\s*[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ0-9 .'’\-]{1,30}:/;

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

  /**
   * Monta o texto marcado.
   * tipos: { [chave]: 'fala' | 'obs' | 'som' | 'ignorar' }
   * opcoes: { parenteses: true } transforma "(...)" dentro da fala em observação.
   */
  function montarTexto(paginas, tipos, opcoes = {}) {
    const fora = repetidas(paginas);
    const paragrafos = [];
    let atual = null;
    let ultimoTipo = null;

    for (const linhas of paginas) {
      const distancias = [];
      for (let k = 1; k < linhas.length; k++) distancias.push(linhas[k].y - linhas[k - 1].y);
      distancias.sort((a, b) => a - b);
      const normal = distancias.length ? distancias[Math.floor(distancias.length / 2)] : 0;

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
          const t = p.t;
          const tp = tipo || ultimoTipo || 'fala';
          if (tp === 'ignorar') continue;
          const ant = runs[runs.length - 1];
          const b = !!p.b && !p.vazio;
          if (ant && ant.tipo === tp && (ant.b === b || p.vazio)) ant.t += t;
          else runs.push({ t, tipo: tp, b });
        }
        if (!runs.some(r => r.t.trim())) return;

        const anterior = linhas[k - 1];
        const salto = anterior && normal ? l.y - anterior.y > normal * 1.45 : true;
        const comecaNome = NOME.test(textoLinha);
        const mudouTipo = atual && runs[0].tipo !== atual.runs[atual.runs.length - 1].tipo;
        if (!atual || salto || comecaNome || mudouTipo) {
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
      });
      // Página nova sempre começa parágrafo novo.
      atual = null;
    }

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
    return out;
  }

  /** Trechos -> texto com [obs], [som] e **negrito**. */
  function paraTexto(runs) {
    let s = '';
    for (const r of runs) {
      let t = r.t.replace(/\s+/g, ' ').replace(/\*\*/g, '*');
      if (!t) continue;
      const ini = t.match(/^\s*/)[0], fimEsp = t.match(/\s*$/)[0];
      let meio = t.trim();
      if (!meio) { s += ' '; continue; }
      if (r.b) meio = '**' + meio + '**';
      if (r.tipo === 'obs' || r.tipo === 'som') meio = '[' + r.tipo + ']' + meio + '[/' + r.tipo + ']';
      s += ini + meio + fimEsp;
    }
    return s.replace(/ {2,}/g, ' ').trim();
  }

  raiz.Importar = { lerPdf, estilosDe, montarTexto, nomeDaCor, corNaCaixa, paraTexto };
})(window);
