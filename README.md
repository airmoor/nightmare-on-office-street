# Quick Sync? — Three.js Journey Halloween Challenge

Ночной опенспейс. Коллег одного за другим увольняют за «low performance»,
лампы над их столами гаснут, темнота сжимается вокруг маленького человека,
который просто хочет спокойно жить.

## Запуск

```bash
npm install
npm run dev
```

## Как устроен код (`src/main.js`)

| Блок | Что делает | Урок курса |
|---|---|---|
| `createLightPoolTexture` | рисует мягкое пятно света на canvas | Textures |
| `geometries` / `materials` | общие геометрии и материалы для всех столов | Geometries, Materials |
| `createDesk` | собирает стол: столешница, монитор, стул, человек, лампа, пятно света | Geometries, Objects |
| `office` + цикл `for` | раскладывает столы сеткой, один из них — героя | Transform objects |
| Lights | ambient + «луна» + **один** настоящий SpotLight над героем | Lights, Shadows |
| `fireColleague` / `updateColleagues` | лампа мигает 1.2 с, гаснет, человек исчезает | Animations |
| `showFiringLabel` / `updateFiringLabels` | надпись-причина над столом: появляется, поднимается, тает | Animations, Sprites |
| `story` / `updateStory` | таймер увольнений, каждый следующий интервал короче: `firstInterval * acceleration ^ firedCount` | Animations |
| `newsFeed` / `updateNews` | карточки новостей летят к голове героя, чем дальше — тем чаще и быстрее | Animations |
| `applications` / `drawJobScreen` | второй монитор: счётчик откликов и отказы, перерисовывается canvas | Textures |
| `createGhostGeometry` / `updateGhosts` | призрак из LatheGeometry с волнистым подолом, поднимается со стула и бродит по кругу | Geometries, Animations |
| `getCardUnderPointer` / `dismissCard` | клик по карточке: Raycaster находит спрайт, карточка лопается, рядом появляются две новые | Raycaster and Mouse Events |
| `experience` / `startShift` | фазы истории: intro → running → ending → done, стартовый экран | — |
| `updateTension` | туман сгущается, лампа героя коротит, камера дрожит, появляется «Close the laptop» | Animations |
| `closeLaptop` / `updateEnding` | экраны гаснут, призраки растворяются, рассвет, камера подлетает к герою | Animations, Lights |
| `game` / `updateGame` | две шкалы: Performance (держи монитор) и Stress (закрывай карточки), виньетка стресса | — |
| `addDismissScore` / `getMultiplier` | очки: +5/с за работу, +10 × комбо за карточку, +500 за спокойную концовку, рекорд в localStorage | — |
| `holdHint` / `updateHoldHint` | пульсирующая надпись HOLD TO WORK над монитором, пока игрок не начал работать | Sprites |
| `shift` / `endShift` | часы смены 22:00 → 06:00; в 06:00 шкалы замирают и появляется «Go home» | — |
| `getCardUnderPointer` | попадание по карточке считается в пикселях экрана с запасом 18 px, срабатывает сразу при нажатии | Raycaster |
| `startEnding` / `endings` | три концовки: calm (закрыл ноутбук), fired (Performance = 0), burnout (Stress = 100), счётчик найденных | — |
| `src/sound.js` | весь звук генерируется Web Audio API: гул, шипение, сердцебиение, пинги, финальный аккорд | — |
| `src/canvasText.js` | рисование текста на canvas → текстура (карточки, надписи, экран) | Textures |
| Debug (lil-gui) | крутилки тумана, света, темпа истории и новостей | Debug UI |

**Почему лампы коллег «фейковые».** Десятки PointLight сильно тормозят, особенно на телефоне.
Поэтому у коллег есть только светящаяся лампочка (`MeshBasicMaterial`) и пятно на полу
(`AdditiveBlending`), а настоящий свет с тенями стоит только над героем.

## План

- [x] **Неделя 1 (5–11 окт):** каркас, опенспейс, туман, лампы, увольнение по кнопке
- [x] **Неделя 2 (12–18 окт):** таймлайн с ускорением увольнений, всплывающее «Low performance»,
      летящие новости, счётчик откликов на втором мониторе
- [x] первый деплой на Vercel — https://nightmare-on-office-street.vercel.app/
- [x] **Неделя 3 (19–25 окт):** призраки уволенных коллег с коробками, клик по уведомлению (Raycaster)
- [ ] модели Kenney вместо коробок (по желанию)
- [x] **Неделя 4 (26 окт – 2 нов):** звук + экран «Start shift», мерцание, дрожание камеры,
      финал с рассветом, проверка на телефоне
- [ ] проверить на своём реальном телефоне (звук, тапы по карточкам)
- [ ] скриншот для поста, описание, credits
- [ ] пост в Discord **до 2 ноября 20:00**

## Идеи для следующего шага

- Заменить кнопку на таймер: `setTimeout`/`clock`, интервал между увольнениями уменьшается.
- Над погасшим столом показывать текст «Low performance» (Canvas-текстура на плоскости или 3D Text).
- Погасший стол → на его месте появляется призрак (сфера + цилиндр, полупрозрачный материал).

Ассеты и их лицензии — в [CREDITS.md](CREDITS.md).
