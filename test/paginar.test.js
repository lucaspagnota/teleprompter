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
