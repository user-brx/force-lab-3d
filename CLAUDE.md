# CLAUDE.md - Regras do projeto (Laboratório de Forças 3D)

Simulador 3D interativo de física (React + three.js + TypeScript, PWA). Estas são as
regras que valem para QUALQUER alteração neste projeto. Siga todas.

## 1. Física sempre REAL - nunca invente nada

- Toda fórmula vem de equação de livro-texto / fonte real; toda constante tem fonte
  (CODATA, NASA Planetary Fact Sheet, ISA, dados balísticos, artigos científicos).
- É proibido "chutar" números para o efeito ficar bonito. Se precisar de um valor,
  use o real e cite a fonte no comentário.
- Ao adicionar um efeito novo, derive da física (ex.: penetração = Poncelet; cratera =
  Collins, Melosh & Marcus 2005; explosão = escala cubo-raiz de Glasstone & Dolan;
  arrasto = ½ρCdAv² com Cd dependente de Mach).
- Simplificações são permitidas, mas devem ser HONESTAS (efeito real omitido, não
  inventado) e documentadas. Nunca apresente uma simplificação como se fosse exata.

## 2. Sempre bilíngue: Português E Inglês

- Todo texto visível ao usuário usa o helper `L(pt, en)` (de `src/physics/i18n`).
  Nunca deixe uma string só em um idioma.
- A documentação (`public/docs/`) existe em PT (`/docs`) e EN (`/docs/en`). Qualquer
  página/cenário novo precisa das duas versões, e o app abre a certa conforme o idioma.

## 3. Nada de travessão (-)

- Não use o travessão/em-dash `-` (nem `-`) em código, comentários, strings ou docs.
  Use hífen `-` ou vírgula. (O usuário considera o `-` "cara de IA".)
- Símbolos de física (×, ², ρ, √, ≈, −, ·, →) são bem-vindos onde fizerem sentido.

## 4. Testes para os casos

- Física nova SEMPRE ganha teste (Vitest). Os testes provam o comportamento contra a
  solução analítica (`src/physics/__tests__/physics.test.ts`) e contra valores reais de
  referência (`src/physics/__tests__/audit.test.ts`).
- Rode `npm test` (= `npx vitest run`). Tudo tem que passar (0 falhas) antes de concluir.
- Ao mudar a forma do estado de um cenário, atualize os testes afetados.

## 5. Build limpo

- Rode `npm run build` (= `tsc -b && vite build`). Sem erros de TypeScript.
  `noUnusedLocals`/`noUnusedParameters` estão ligados: remova imports/variáveis não usados.

## 6. Verificação visual

- Se a mudança é visível no app, verifique com o preview (servidor de dev) e tire prints.
  Não peça para o usuário conferir à mão; mostre a prova.

## 7. Fluxo de trabalho

- Antes de concluir: `npm run build` limpo + `npm test` (todos passando) + sem travessões.
- Commits: mensagem clara em português, descrevendo o "porquê". Não commitar sem o usuário
  pedir/autorizar; quando autorizar, vá até o push.
- `.claude/` está no `.gitignore` (config local do preview).

## Comandos

```bash
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção (tsc + vite + service worker PWA)
npm test         # testes de física (Vitest)
npm run icons    # regenera os ícones PNG do PWA a partir do icon.svg
```

## Arquitetura (resumo)

- `src/physics/` - núcleo puro (sem render). Constantes reais, math, i18n, ambientes
  (planetas + superfícies) e um arquivo por cenário em `scenarios/`.
- Cada cenário implementa `init`, `step(dt)` e `view()` (snapshot puro: poses, forças,
  medidas/HUD, energias, partículas, ondas de choque, câmera, timeScale).
- `src/scene/` - render (react-three-fiber): Engine (passo fixo 1/240 s), Experience
  (luzes/câmera/pós), Bodies (modelos), Arrows, Labels, Particles, ShockWaves, models.tsx.
- `src/ui/` - painel e HUD (Controls.tsx, Hud.tsx). `src/state/store.ts` (Zustand).
- `public/docs/` - guia do professor (HTML PT) e `public/docs/en/` (EN). Tudo em `public/`
  é publicado junto com o app (acessível por URL).

### Como adicionar um cenário

1. Criar `src/physics/scenarios/<id>.ts` (física real + `view()` bilíngue).
2. Registrar em `src/physics/index.ts` (`SCENARIOS` + `SCENARIO_ORDER`).
3. Modelo 3D em `models.tsx` + render em `Bodies.tsx`; câmera em `Experience.tsx`
   (`CAM_OFFSET`).
4. Controles em `Controls.tsx` (ActionBar / seletores no SidePanel).
5. Testes em `audit.test.ts`/`physics.test.ts`.
6. Documentação em `public/docs/<id>.html` e `public/docs/en/<id>.html` + links nos índices.
