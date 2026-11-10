# Teleprompter

Teleprompter para o teatro da escola. Importa o roteiro em PDF e mostra em páginas de letra grande,
fundo preto e letra branca, com as observações em marca-texto amarelo e a sonoplastia em marca-texto verde.
Serve para qualquer peça: cada roteiro importado fica guardado na biblioteca do app.

## Usar

Rode `npm install` e `npm run dist` uma vez: o app fica em `dist/Teleprompter.exe`. Abra com dois cliques.
Não precisa instalar nada.

1. **Importar PDF** (ou arraste o PDF para a janela).
2. O app lê as cores do PDF e mostra cada estilo de texto encontrado (preto, vermelho, itálico, marca-texto amarelo…).
   Escolha o que cada um é: **Fala**, **Observação**, **Sonoplastia** ou **Ignorar**. A prévia muda na hora.
3. **Salvar peça**. Abre o editor para conferir o texto.
4. **▶ Teleprompter**.

PDF escaneado (foto do papel) não tem texto para ler: nesse caso use **Nova peça** e cole o texto.

## No teleprompter

| Ação | Tecla / mouse |
| --- | --- |
| Próxima página | → ↓ Page Down, Espaço, Enter, roda do mouse, clique nos 2/3 da direita |
| Página anterior | ← ↑ Page Up, Backspace, clique no 1/3 da esquerda |
| Primeira / última | Home / End |
| Letra maior / menor | + / − |
| Tela cheia | F ou F11 (ou o botão) |
| Sair | Esc |

Pedais de virar página (Bluetooth ou USB) funcionam porque mandam essas mesmas teclas.
Mexendo o mouse aparece a barra com tamanho da letra, ir para a página, configurações e tela cheia.

As páginas são montadas para caber na tela: muda a letra ou o tamanho da janela e o app refaz as páginas
sem perder o lugar. Cada página é usada até o fim, para caber o máximo de texto; a fala continua na
página seguinte, mas nunca fica uma linha sozinha. Prefere não cortar falas? Desligue **Encher a página**
nas configurações: aí a fala que cabe numa página vai inteira para a próxima.

Em **⚙ Configurações**: tamanho da letra, espaço entre linhas e parágrafos, margens, fonte, texto no centro
ou em cima, observação e sonoplastia em marca-texto ou em letra colorida, cores, nome do personagem em negrito, número da página e **espelhar** (para vidro de teleprompter).

## Como escrever no editor

```
**MARIA:** Feliz Natal! [obs](abraça José)[/obs]

[som]Sinos tocando ao fundo.[/som]

[obs]Luz apaga devagar.[/obs]
```

- linha em branco separa parágrafos
- `[obs]...[/obs]` observação (amarelo) · `[som]...[/som]` sonoplastia (verde) · `**...**` negrito
- `NOME:` no começo da fala fica em negrito sozinho
- os botões **Observação**, **Sonoplastia**, **N** e **Limpar** marcam o trecho selecionado
  (sem seleção, marcam o parágrafo inteiro)

**Exportar** salva a peça num `.txt`; para trazer de volta, use **Importar PDF** e escolha o `.txt`.

## Desenvolver

Precisa do Node.js 22 ou mais novo.

```
npm install
npm start        # abre o app
npm test         # testes da paginação
npm run dist     # gera dist/Teleprompter.exe
```

```
main.js          janela do Electron
src/index.html   telas
src/app.js       biblioteca, importação, editor, teleprompter e configurações
src/importar.js  PDF -> texto (lê a cor de cada pedaço desenhando a página num canvas)
src/paginar.js   texto -> páginas que cabem na tela
src/vendor/      pdf.js
```

O `src/index.html` também abre direto no navegador (Chrome ou Edge), sem o Electron.
