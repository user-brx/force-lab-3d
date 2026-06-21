# Laboratório de Forças 3D

Simulador 3D interativo das leis de Newton - **ação e reação, F = m·a, conservação de
momento, gravidade e energia** - com física derivada de equações reais e renderização
realista. Roda no navegador e é instalável como app (PWA) no Android e no iOS.

> Princípio do projeto: tornar visível **de onde vem cada força**. Toda força tem dois
> lados (3ª lei). Nada de física inventada - cada cenário é derivado de equações de
> livro-texto com constantes reais e validado por testes contra a solução analítica.

## Rodar

```bash
npm install
npm run dev      # servidor de desenvolvimento (http://localhost:5173)
npm run build    # build de produção + service worker (PWA)
npm run preview  # serve o build
npx vitest run   # roda os testes de física
```

## Instalar como app (PWA)

Abra no Chrome/Edge (Android/desktop) → menu → **Instalar app**. No iOS (Safari) →
**Compartilhar → Adicionar à Tela de Início**. Funciona offline após a primeira visita.

## Arquitetura

```
src/
  physics/                núcleo de física - TypeScript puro, sem dependência de render
    constants.ts          constantes reais (g, G, massa/raio da Terra, atmosfera…)
    math.ts               vetores 3D e utilidades
    format.ts             formatação pt-BR (inclui notação científica)
    environments.ts       planetas (gravidade/ar/massa) + superfícies (atrito) + merge
    types.ts              contrato Scenario<S> + tipos de View/Forças/HUD
    scenarios/            um arquivo por cenário (pessoa, carro, foguete, revólver, patinadores)
    __tests__/            testes que provam a física (Vitest)
  state/store.ts          estado da UI (Zustand)
  scene/                  renderização (react-three-fiber)
    Engine.tsx            passo fixo de integração + publica o snapshot por frame
    Experience.tsx        luzes, céu/estrelas, chão, câmera, pós-processamento
    Bodies.tsx            posiciona os modelos a partir da física
    Arrows.tsx            vetores de força (setas 3D com rótulo)
    Particles.tsx         gases, fumaça e poeira (pool reaproveitado)
    ShockWaves.tsx        anéis de choque no chão e domos de pressão no ar
    models.tsx            modelos 3D procedurais (boneco com pernas/braços animados)
  ui/                     painel de controle e HUD
```

O núcleo de física é **desacoplado** do 3D: cada cenário implementa `init`, `step(dt)` e
`view()` (um snapshot puro com poses, vetores de força, medidas, eventos de choque e
texto). O `Engine` avança a física com passo fixo (1/240 s) e o resto da cena só lê o
snapshot.

## Planetas e superfícies

O ambiente é separado em dois eixos, combinados em tempo de execução por
`makeEnvironment(planeta, superfície)`:

- **Planeta** (slider arrastável) define gravidade, densidade do ar, altura de escala da
  atmosfera, a massa do astro (que recebe a reação) e a cor do céu. Valores reais para
  Vácuo, Lua, Marte, Vênus, Terra e Júpiter.
- **Superfície** define o atrito (asfalto, gelo, areia) - só aparece quando há gravidade.

Assim o mesmo cenário responde fisicamente a cada mundo: o peso, o atrito, o arrasto, a
TWR do foguete e a aceleração do astro mudam todos com o planeta escolhido.

## Controles

Cenário (topo) · planeta (slider) · superfície · sliders do cenário · ←/→ (gimbal do
foguete) · Disparar/Segurar (revólver) · Empurrar (patinadores). Barra inferior: pausar,
câmera lenta, vetores, efeitos, **girar** (auto-órbita) e reiniciar. Arraste para orbitar
a câmera; role/pince para zoom.

## Física: auditoria e equações reais

Princípio do projeto: **nunca inventar**. Cada cenário é derivado de equações de
livro-texto com constantes reais e validado por **136 testes** (`npx vitest run`) contra a
solução analítica. Esta seção documenta exatamente qual física cada cenário usa.

### Constantes reais

`g₀ = 9,80665 m/s²` · `G = 6,674×10⁻¹¹ N·m²/kg²` · densidade do ar ao nível do mar
`1,225 kg/m³` · altura de escala da atmosfera `8500 m` · velocidade do som `340 m/s`.

Cada planeta usa valores reais de gravidade, atmosfera, massa, **raio** e **velocidade do som**:

| Planeta | g (m/s²) | ρ ar (kg/m³) | alt. escala (m) | massa (kg) | raio (m) | som (m/s) |
|---|---|---|---|---|---|---|
| Vácuo   | 0     | 0     | -      | -          | -         | -   |
| Lua     | 1,62  | 0     | -      | 7,342×10²² | 1,737×10⁶ | -   |
| Marte   | 3,71  | 0,020 | 11 100 | 6,417×10²³ | 3,390×10⁶ | 240 |
| Vênus   | 8,87  | 65    | 15 900 | 4,867×10²⁴ | 6,052×10⁶ | 410 |
| Terra   | 9,807 | 1,225 | 8 500  | 5,972×10²⁴ | 6,371×10⁶ | 340 |
| Júpiter | 24,79 | 0,16  | 27 000 | 1,898×10²⁷ | 6,991×10⁷ | 850 |

Superfícies (atrito estático/cinético): asfalto `0,9 / 0,7` · gelo `0,1 / 0,03` ·
areia `0,6 / 0,45`. Gravidade na altitude: `g(h) = g₀·(R/(R+h))²` com o **raio do próprio
astro**. Densidade do ar na altitude: `ρ(h) = ρ₀·e^(−h/H)` (modelo isotérmico).

### Equação de cada cenário

- **Pessoa** - atrito estático/cinético `μ·N` (N = m·g); 2ª lei `a = F/m`. A 3ª lei manda a
  MESMA força de propulsão para o astro: `a_astro = F/M_astro` (~10⁻²² a 10⁻²⁴ m/s²,
  conforme o planeta). Inclui uma resistência ao movimento para a propulsão não cair a zero.
- **Carro** - o motor gira a roda; a tração é limitada pelo atrito `μ·N` (no gelo patina e
  cai para `μₖ·N`). Arrasto aerodinâmico `½·ρ·Cd·A·v²` (Cd 0,3; A 2,2 m²) + resistência de
  rolamento.
- **Avião** (hélice/jato) - sustentação `L = ½·ρ·v²·S·CL` e polar de arrasto
  `CD = CD₀ + k·CL²`. Empuxo ∝ densidade do ar (jato ~constante; hélice maior em baixa
  velocidade). Decola quando `L ≥ peso`; ângulo de subida pelo excesso de empuxo
  (`sin γ = (T−D)/W`). **Sem ar não há empuxo nem sustentação → não voa** (contraste com o
  foguete).
- **Foguete** - empuxo por fluxo de massa `ṁ = T/(Isp·g₀)` (Isp 280 s); gravidade
  inverso-do-quadrado com o raio do astro; arrasto atmosférico exponencial; TWR = T/(m·g);
  torque do gimbal com momento de inércia de barra `I = m·L²/12`. Validado contra
  **Tsiolkovsky** `Δv = Isp·g₀·ln(m₀/m_f)`. No vácuo a rotação segue a 1ª lei (só o gimbal a
  altera; o amortecimento é aerodinâmico e existe só na atmosfera).
- **Revólver** - conservação de momento `mB·vB = mG·v_recuo` (soma = 0 no disparo). A energia
  cinética **não** se conserva (vem da pólvora); a bala leve fica com quase toda ela. O cano
  acima do centro de massa gera torque (recuo girando a arma). A bala em voo tem arrasto
  `½·ρ·v²·Cd·A` (Cd 0,3; bala 9 mm) e queda parabólica; acima da velocidade do som **local**
  emite ondas de choque. O botão Matrix (bullet time) segue a bala em câmera lenta.
- **Patinadores** - a força é idêntica nos dois (3ª lei), mas `a = F/m` faz o leve sair mais
  rápido. Momento total **zero** no sistema isolado (vácuo); com atrito (força externa) o
  total deixa de ser zero - mostrado honestamente.

### Validação automatizada (`src/physics/__tests__`)

**136 testes** (`npx vitest run`) provam, entre outros: a aceleração do astro = F/M (3ª lei),
atrito estático vs cinético, conservação de momento (patinadores e revólver), tração limitada
por atrito, equação de Tsiolkovsky, TWR ≤ 1 não decola, decolagem mais fácil na Lua, avião
não voa no vácuo, gravidade em altitude com o raio do astro, e um *smoke test* que roda
**todos os cenários × todos os planetas** sem gerar NaN/Infinito. Os 64 testes de auditoria
(`audit.test.ts`) comparam cada fórmula e cenário com valores reais de referência (NASA,
CODATA, dados balísticos militares, ISA).

> 📄 **[Relatório de Auditoria de Realismo Físico](public/docs/relatorio_auditoria_fisica.md)** -
> análise detalhada de cada arquivo, cada fórmula e cada cenário contra dados reais, com
> tabelas comparativas e veredicto por módulo.

## Documentação para professores

Há um **Guia do Professor** em HTML (um por cenário, com conceito, fórmulas, valores reais,
exemplo resolvido e referências de livros) na pasta [`public/docs/`](public/docs/index.html).
Como fica em `public/`, ele é publicado junto com o app: na versão online está acessível em
**`/docs`** (e há um link **📖 Docs** no topo do simulador). Tudo em `public/` é copiado para o
build; por isso a documentação que deve abrir pela URL mora aqui, e não numa pasta `doc/` solta
na raiz (que só existiria no código-fonte).

### Simplificações conhecidas (honestas - efeitos reais omitidos, não invenções)

- **Avião sem arrasto transônico** (o "muro do som"): cruza Mach 1 fácil demais. O cone de
  Mach exibido é real, mas falta o aumento de arrasto perto de Mach 1.
- **Integração numérica** Euler semi-implícito com passo ≤ 1/240 s (semi-fixo): aproximação
  inerente a qualquer simulação; os testes batem com a solução analítica em ~1-3%.
- **3ª lei:** mostramos a aceleração do astro (`F/M`), mas não o deslocamos de fato (massa
  gigantesca → invisível).

## Otimizações Visuais e UI

- O simulador utiliza reflexos dinâmicos **HDRI** via `Environment` para todos os cenários. A cor do céu se adapta à altitude e ao mundo escolhido. (Ex: o céu escurece rapidamente à medida que o foguete sobe).
- Materiais `meshStandardMaterial` de baixo custo garantem visual "AAA" sem perda de performance ou FPS em dispositivos móveis.
- A barra de opções da esquerda possui rolagem automática (`overflow-y: auto`), não escondendo os botões inferiores caso a tela seja pequena.

## Stack

Vite · React 18/19 · TypeScript · three.js · @react-three/fiber + drei +
postprocessing · Zustand · vite-plugin-pwa · Vitest.
