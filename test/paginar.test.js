const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/paginar.js');

// Medida falsa: cada letra mede 10 px (negrito também).
const medir = (t) => t.length * 10;

test('lê marcas de observação, sonoplastia e negrito', () => {
  const [p] = P.lerTexto('**ANA:** Oi [obs](rindo)[/obs] tudo bem? [som]sino');
  assert.deepStrictEqual(p.runs, [
    { t: 'ANA:', tipo: 'fala', b: true },
    { t: ' Oi ', tipo: 'fala', b: false },
    { t: '(rindo)', tipo: 'obs', b: false },
    { t: ' tudo bem? ', tipo: 'fala', b: false },
    { t: 'sino', tipo: 'som', b: false },
  ]);
});

test('linha em branco separa parágrafos', () => {
  assert.strictEqual(P.lerTexto('a\n\n\nb\n  \nc').length, 3);
});

test('nome do personagem fica em negrito', () => {
  const p = P.destacarNome(P.lerTexto('JOÃO: Feliz Natal!')[0]);
  assert.deepStrictEqual(p.runs[0], { t: 'JOÃO:', tipo: 'fala', b: true });
});

test('quebra o parágrafo sem passar da largura', () => {
  const linhas = P.quebrar(P.lerTexto('um dois tres quatro cinco seis')[0], 100, medir);
  for (const l of linhas) assert.ok(l.w <= 100, JSON.stringify(l));
  assert.strictEqual(linhas.map(l => l.segs.map(s => s.t).join('')).join(' '), 'um dois tres quatro cinco seis');
});

test('parágrafo que cabe numa página não é cortado ao meio', () => {
  const texto = ['aaaa bbbb cccc', 'dddd eeee ffff gggg hhhh'].join('\n\n');
  // 2 palavras por linha, 3 linhas por página.
  const r = P.paginar(P.lerTexto(texto), { largura: 90, altura: 30, linha: 10, espacoParagrafo: 0, medir });
  assert.strictEqual(r.paginas.length, 2);
  assert.strictEqual(r.paginas[0].itens.length, 2);
  assert.strictEqual(r.paginas[1].inicio, 1);
  for (const pg of r.paginas) assert.ok(pg.itens.length <= 3);
});

test('nome sozinho no fim da página vai para a próxima', () => {
  const texto = 'aaaa bbbb\n\nJOSÉ:\n\ncccc dddd eeee ffff';
  const r = P.paginar(P.lerTexto(texto), { largura: 90, altura: 30, linha: 10, espacoParagrafo: 0, medir });
  const textos = r.paginas.map(pg => pg.itens.filter(i => i.linha).map(i => i.linha.segs.map(s => s.t).join('')));
  assert.deepStrictEqual(textos[0], ['aaaa bbbb']);
  assert.strictEqual(textos[1][0], 'JOSÉ:');
});

test('encher a página continua a fala na seguinte, sem linha sozinha', () => {
  // Parágrafo 1: 2 linhas. Parágrafo 2: 4 linhas. Página de 4 linhas.
  const texto = 'aaaa bbbb cccc\n\ndddd eeee ffff gggg hhhh iiii jjjj';
  const opc = { largura: 90, altura: 40, linha: 10, espacoParagrafo: 0, medir };
  const cheia = P.paginar(P.lerTexto(texto), { ...opc, encher: true });
  assert.strictEqual(cheia.paginas.length, 2);
  assert.strictEqual(cheia.paginas[0].itens.length, 4);
  const inteira = P.paginar(P.lerTexto(texto), { ...opc, encher: false });
  assert.strictEqual(inteira.paginas[0].itens.length, 2);
  // Só 1 linha caberia no fim: não divide.
  const r = P.paginar(P.lerTexto('aaaa bbbb cccc dddd eeee ffff\n\ngggg hhhh iiii'), { ...opc, encher: true });
  assert.strictEqual(r.paginas[0].itens.length, 3);
});

test('\\* é um asterisco de verdade, não negrito', () => {
  const [p] = P.lerTexto('SAIDA TRIUNFAL\\*\\*\\* **fim**');
  assert.deepStrictEqual(p.runs, [
    { t: 'SAIDA TRIUNFAL*** ', tipo: 'fala', b: false },
    { t: 'fim', tipo: 'fala', b: true },
  ]);
});

test('CENA 1 vira cena e começa página nova', () => {
  const ps = P.lerTexto('aaaa\n\n[obs]**CENA 2**[/obs]\n\nbbbb\n\nCena 3 - A floresta\n\nA cena 4 foi ótima, disse ele.');
  assert.deepStrictEqual(ps.map(p => !!p.cena), [false, true, false, true, false]);
  assert.strictEqual(ps[1].runs[0].tipo, 'cena');
  const r = P.paginar(ps, { largura: 400, altura: 200, linha: 10, espacoParagrafo: 5, medir, encher: true });
  assert.strictEqual(r.paginas.length, 3);
  assert.deepStrictEqual(r.paginas.map(p => p.inicio), [0, 1, 3]);
});
