// Texto da peça -> páginas do teleprompter.
//
// Formato do texto (o mesmo do editor):
//   - linha em branco separa parágrafos; quebra de linha simples é mantida
//   - [obs]...[/obs]  observação / rubrica (amarelo)
//   - [som]...[/som]  sonoplastia (verde)
//   - [cena]...[/cena] começo de cena (vermelho, sempre em página nova)
//   - **...**         negrito  (\* é um asterisco de verdade)
// Uma marca sem fechamento vale até o fim do parágrafo.
// Parágrafo que é só "CENA 1", "Cena 2 - A floresta", "ATO II"... vira cena sozinho.
//
// A paginação é feita em pixels: cada linha mede fonte x espaçamento. Com "encher",
// cada página vai até o fim (a fala continua na seguinte); sem ele, uma fala só é
// dividida entre páginas quando não cabe inteira nem numa página vazia.

(function (raiz) {
  'use strict';

  const MAIUSC = 'A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ';
  const NOME_COM_DOIS_PONTOS = new RegExp('^(\\s*[' + MAIUSC + '][' + MAIUSC + '0-9 .\'’\\-]{0,30}:)');
  const SO_NOME = new RegExp('^\\s*[' + MAIUSC + '][' + MAIUSC + '0-9 .\'’\\-]{0,30}:?\\s*$');
  const CENA = /^\s*(cena|ato|quadro)\s+([0-9]{1,3}|[ivxlc]{1,6}|[úu]nic[ao])\b[^\n]{0,60}$/i;

  /** "CENA 1", "Cena 2 - A floresta", "ATO II"... */
  const ehCena = (texto) => CENA.test(String(texto).replace(/\*\*|\[\/?(obs|som|cena)\]/gi, ''));

  /** Lê o texto marcado e devolve parágrafos com trechos { t, tipo, b }. */
  function lerTexto(texto) {
    const blocos = String(texto || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
    const paragrafos = [];
    for (const bloco of blocos) {
      if (!bloco.trim()) continue;
      const runs = [];
      let tipo = 'fala';
      let b = false;
      let ultimo = 0;
      const re = /\\\*|\[(\/?)(obs|som|cena)\]|\*\*/gi;
      let m;
      const empurrar = (t) => {
        if (!t) return;
        const ant = runs[runs.length - 1];
        if (ant && ant.tipo === tipo && ant.b === b) ant.t += t;
        else runs.push({ t, tipo, b });
      };
      while ((m = re.exec(bloco))) {
        empurrar(bloco.slice(ultimo, m.index));
        ultimo = re.lastIndex;
        if (m[0] === '\\*') empurrar('*');
        else if (m[0] === '**') b = !b;
        else if (m[1]) tipo = 'fala';
        else tipo = m[2].toLowerCase();
      }
      empurrar(bloco.slice(ultimo));
      // Espaços e quebras nas pontas do parágrafo não contam.
      if (runs.length) {
        runs[0].t = runs[0].t.replace(/^\s+/, '');
        runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, '');
      }
      const limpos = runs.filter(r => r.t);
      if (!limpos.length) continue;
      const cena = limpos.some(r => r.tipo === 'cena') || ehCena(limpos.map(r => r.t).join(''));
      if (cena) for (const r of limpos) { r.tipo = 'cena'; r.b = true; }
      paragrafos.push(cena ? { runs: limpos, cena } : { runs: limpos });
    }
    return paragrafos;
  }

  /** Tipo principal do parágrafo (o que tem mais letras). */
  function tipoDe(p) {
    const conta = {};
    for (const r of p.runs) conta[r.tipo] = (conta[r.tipo] || 0) + r.t.replace(/\s/g, '').length;
    return Object.keys(conta).sort((a, b) => conta[b] - conta[a])[0] || 'fala';
  }

  /** "JOÃO:" no começo da fala fica em negrito. */
  function destacarNome(p) {
    const r0 = p.runs[0];
    if (!r0 || r0.tipo !== 'fala' || r0.b) return p;
    const m = r0.t.match(NOME_COM_DOIS_PONTOS);
    if (m && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]{2}/.test(m[1])) {
      const resto = r0.t.slice(m[1].length);
      const runs = [{ t: m[1], tipo: 'fala', b: true }];
      if (resto) runs.push({ ...r0, t: resto });
      return { runs: runs.concat(p.runs.slice(1)) };
    }
    if (p.runs.length === 1 && SO_NOME.test(r0.t) && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]{2}/.test(r0.t)) {
      return { runs: [{ ...r0, b: true }] };
    }
    return p;
  }

  /** Parágrafo que é só o nome do personagem (não deve ficar sozinho no fim da página). */
  function ehSoNome(p) {
    const texto = p.runs.map(r => r.t).join('');
    return texto.length <= 32 && SO_NOME.test(texto) && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]{2}/.test(texto);
  }

  /**
   * Quebra um parágrafo em linhas que cabem em `largura`.
   * `medir(texto, negrito)` devolve a largura em pixels.
   * Cada linha é { segs: [{ t, tipo, b }], w }.
   */
  function quebrar(p, largura, medir) {
    const linhas = [];
    let segs = [];
    let w = 0;
    let espaco = false;
    const fechar = () => { linhas.push({ segs, w }); segs = []; w = 0; espaco = false; };
    const por = (t, run, tw) => {
      const ant = segs[segs.length - 1];
      if (ant && ant.tipo === run.tipo && ant.b === run.b) ant.t += t;
      else segs.push({ t, tipo: run.tipo, b: run.b });
      w += tw;
    };
    for (const run of p.runs) {
      for (const parte of run.t.split(/(\n|[ \t]+)/)) {
        if (!parte) continue;
        if (parte === '\n') { fechar(); continue; }
        if (/^[ \t]+$/.test(parte)) { espaco = segs.length > 0; continue; }
        let palavra = parte;
        let pw = medir(palavra, run.b);
        const ew = espaco ? medir(' ', run.b) : 0;
        if (segs.length && w + ew + pw > largura) fechar();
        else if (espaco) por(' ', run, ew);
        espaco = false;
        // Palavra maior que a linha inteira: corta em pedaços.
        while (pw > largura && palavra.length > 1) {
          let n = palavra.length - 1;
          while (n > 1 && medir(palavra.slice(0, n), run.b) > largura - w) n--;
          por(palavra.slice(0, n), run, medir(palavra.slice(0, n), run.b));
          fechar();
          palavra = palavra.slice(n);
          pw = medir(palavra, run.b);
        }
        por(palavra, run, pw);
      }
    }
    if (segs.length || !linhas.length) fechar();
    return linhas;
  }

  /**
   * Monta as páginas.
   * opcoes: { largura, altura, linha (px por linha), espacoParagrafo (px), medir, destacarNomes, encher }
   * encher: true usa a página até o fim, continuando a fala na seguinte;
   *         false leva a fala inteira para a próxima página quando ela cabe numa página vazia.
   * Devolve { paginas: [{ inicio, itens: [{ linha } | { espaco: px }] }], larguraMax }.
   * `inicio` é o índice do primeiro parágrafo da página (para não perder o lugar ao mudar a fonte).
   */
  function paginar(paragrafos, opcoes) {
    const { largura, altura, linha, espacoParagrafo, medir } = opcoes;
    const porPagina = Math.max(1, Math.floor((altura + 0.5) / linha));
    const paginas = [];
    let larguraMax = 0;
    let atual = null;
    let usado = 0;

    const nova = (inicio) => {
      atual = { inicio, itens: [], grupos: [] };
      paginas.push(atual);
      usado = 0;
    };

    paragrafos.forEach((original, i) => {
      const p = opcoes.destacarNomes === false ? original : destacarNome(original);
      const linhas = quebrar(p, largura, medir);
      for (const l of linhas) larguraMax = Math.max(larguraMax, l.w);
      const alturaP = linhas.length * linha;

      // Cena nova sempre começa numa página nova.
      if (!atual || (original.cena && atual.itens.length)) nova(i);
      let espaco = atual.itens.length ? espacoParagrafo : 0;

      if (atual.itens.length && usado + espaco + alturaP > altura + 0.5) {
        const cabeVazia = alturaP <= altura + 0.5;
        const sobra = Math.floor((altura + 0.5 - usado - espaco) / linha);
        // Encher a página: a fala continua na próxima, mas nunca deixa uma linha sozinha
        // no fim da página nem no começo da seguinte.
        const dividir = opcoes.encher
          ? sobra >= 2 && (linhas.length - sobra >= 2 || !cabeVazia)
          : !cabeVazia && sobra >= 2;
        if (!dividir) {
          // Nome do personagem sozinho no fim da página vai junto para a próxima.
          const ult = atual.grupos[atual.grupos.length - 1];
          let leva = null;
          if (ult && atual.grupos.length > 1 && ult.soNome) {
            atual.itens.splice(ult.desde);
            atual.grupos.pop();
            if (atual.itens.length && atual.itens[atual.itens.length - 1].espaco) atual.itens.pop();
            leva = ult;
          }
          nova(leva ? leva.indice : i);
          if (leva) {
            leva.desde = 0;
            atual.grupos.push(leva);
            for (const l of leva.linhas) atual.itens.push({ linha: l });
            usado = leva.linhas.length * linha;
          }
          espaco = atual.itens.length ? espacoParagrafo : 0;
        }
      }

      if (espaco) { atual.itens.push({ espaco }); usado += espaco; }
      atual.grupos.push({ indice: i, desde: atual.itens.length, linhas, soNome: ehSoNome(p) });
      for (const l of linhas) {
        if (usado + linha > altura + 0.5 && atual.itens.length) nova(i);
        atual.itens.push({ linha: l });
        usado += linha;
      }
    });

    if (!paginas.length) paginas.push({ inicio: 0, itens: [], grupos: [] });
    for (const pg of paginas) delete pg.grupos;
    return { paginas, larguraMax, porPagina };
  }

  const api = { lerTexto, tipoDe, destacarNome, quebrar, paginar, ehCena };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Paginar = api;
})(typeof window !== 'undefined' ? window : globalThis);
