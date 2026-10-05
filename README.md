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
- [ ] **Неделя 4 (26 окт – 2 нов):** звук + экран «Click to start», мерцание, дрожание камеры,
      финал, проверка на телефоне, пост в Discord **до 2 ноября 20:00**

## Идеи для следующего шага

- Заменить кнопку на таймер: `setTimeout`/`clock`, интервал между увольнениями уменьшается.
- Над погасшим столом показывать текст «Low performance» (Canvas-текстура на плоскости или 3D Text).
- Погасший стол → на его месте появляется призрак (сфера + цилиндр, полупрозрачный материал).

Ассеты и их лицензии — в [CREDITS.md](CREDITS.md).
