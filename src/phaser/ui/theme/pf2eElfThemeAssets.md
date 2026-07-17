# PF2e 엘프 UI 테마 자산

이 문서는 `PF2E_ELF_THEME`에서 사용하는 NinePatch 이미지의 생성 조건과 원본 프롬프트를
보존한다. 자산을 다시 생성할 때 기존 이미지를 참조 이미지로 사용하지 않고 아래 테마 설명과
프롬프트를 기준으로 새로 생성한다.

## 런타임 자산

| Variant       | 파일                                                   | 크기    | Columns                 | Rows                    | Internal |
| ------------- | ------------------------------------------------------ | ------- | ----------------------- | ----------------------- | -------- |
| `panel`       | `public/assets/ui/pf2e-elf-panel-ninepatch.png`        | 384×384 | `[104, undefined, 104]` | `[104, undefined, 104]` | repeat   |
| `control`     | `public/assets/ui/pf2e-elf-control-ninepatch.png`      | 448×128 | `[56, undefined, 56]`   | `[32, undefined, 32]`   | repeat   |
| `tab`         | `public/assets/ui/pf2e-elf-tab-ninepatch.png`          | 448×128 | `[56, undefined, 56]`   | `[32, undefined, 32]`   | repeat   |
| `scrollTrack` | `public/assets/ui/pf2e-elf-scroll-track-ninepatch.png` | 48×480  | `[14, undefined, 14]`   | `[92, undefined, 92]`   | repeat   |
| `scrollThumb` | `public/assets/ui/pf2e-elf-scroll-thumb-ninepatch.png` | 48×240  | `[20, undefined, 20]`   | `[56, undefined, 56]`   | scale    |
| `gridCell`    | `public/assets/ui/pf2e-elf-grid-cell-ninepatch.png`    | 512×160 | `[84, undefined, 84]`   | `[48, undefined, 48]`   | repeat   |
| `dialog`      | `public/assets/ui/pf2e-elf-dialog-ninepatch.png`       | 512×384 | `[96, undefined, 96]`   | `[96, undefined, 96]`   | repeat   |
| `button`      | `public/assets/ui/pf2e-elf-button-ninepatch.png`       | 512×144 | `[84, undefined, 84]`   | `[44, undefined, 44]`   | repeat   |

`badge`는 NinePatch가 아닌 128×128 고정 크기 자산
`public/assets/ui/pf2e-elf-badge.png`를 사용한다.

안정적인 자산 키와 런타임 경로는 `src/game/assets/manifest.ts`에서 관리한다. 최초 교체 전
자산은 `backup/ui/`에, 5번 영역 복구 직전 자산은
`backup/ui/before-center-repair-20260717/`에 보관한다. `backup/`은 런타임과 Git 추적에서
제외한다.

## NinePatch 사양

```ts
stretchMode: {
  edge: 'scale',
  internal: 'repeat',
}
```

- 고유 장식과 코너는 고정 영역 안에 배치한다.
- 각 변의 중앙은 고유 장식이 없는 직선 형태로 만들어 scale해도 끊김이 없도록 한다.
- 내부 셀은 X축과 Y축 모두 이음새 없이 반복할 수 있어야 한다.
- 내부 셀의 첫 행과 마지막 행, 첫 열과 마지막 열의 RGBA 값이 일치해야 한다.
- 이미지 바깥 네 모서리는 완전히 투명해야 하며 마젠타 크로마키가 남아서는 안 된다.

## 생성 및 후처리

- 생성 모드: Codex 내장 `imagegen`
- 입력 이미지: 없음
- 크로마키: `#ff00ff`
- 배경 제거:
  `$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`
- 후처리: Pillow로 crop, 크기 정규화, 투명 픽셀 RGB 정리
- 내부 셀: 정규화된 원본 imagegen 결과의 고해상도 질감을 유지한다.
- 반복 경계: 내부 셀의 마주 보는 첫 행과 마지막 행, 첫 열과 마지막 열을 동일하게 만들고
  내부 방향으로 smoothstep 혼합해 경계만 자연스럽게 연결한다.
- 새 자산의 외곽 프레임은 각각의 신규 imagegen 결과에서만 가져오며 기존 런타임 자산을
  합성하거나 참조하지 않는다.
- `scrollThumb`은 중앙 moonstone을 보존해야 하므로 내부 셀을 반복하지 않고 scale한다.

후처리 후 다음 항목을 검사한다.

1. PNG가 RGBA 형식인지 확인한다.
2. 출력 크기와 테마 슬라이스가 이 문서의 표와 일치하는지 확인한다.
3. 내부 셀의 X/Y 반복 경계 최대 채널 차이가 `0`인지 확인한다.
4. alpha가 있는 픽셀에 마젠타 잔여 색상이 없는지 확인한다.
5. 데스크톱과 세로 viewport에서 모든 variant와 badge를 실제 rexUI로 표시한다.

## Panel 프롬프트

```text
Use case: stylized-concept
Asset type: production NinePatch panel frame for a fantasy browser TCG UI
Primary request: create one completely new elf-themed square rectangular panel frame, front-facing, orthographic, perfectly symmetrical, designed from this text description only with no reference images. The frame must form a complete four-sided rectangle like a classic fantasy game panel.
Subject: an elegant dark-emerald panel with fixed ornate corner blocks, aged bronze and muted-gold trim, restrained pale moonstone details, and subtle elven leaf engravings confined to the four corners. The middle of every edge must be straight, uniform, thin, and free of unique ornaments so it can scale cleanly. The large central interior must be a flat dark forest-green material with extremely subtle low-contrast natural texture, no focal detail, and no directional lighting.
Composition/framing: one isolated square panel only, centered with generous even padding. Exact front view, no perspective, no rotation. Keep all decorative detail inside the outer 18 percent along each side. Preserve a wide uninterrupted central interior suitable for replacing with a seamless repeat tile during production post-processing.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, readable at game scale, clean production raster edges.
Color palette: deep forest green, dark emerald, aged bronze, muted gold, tiny pale blue-green moonstones.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the panel for removal, with no shadow, gradient, texture, reflection, floor, or lighting variation in the background.
Constraints: no text, no letters, no numbers, no logo, no watermark, no separate icons, no cast shadow, no contact shadow, no reflection. Do not use #ff00ff anywhere in the panel. No protrusions outside the rectangular silhouette. No ornament in the central repeat-safe interior. All four outer edges must remain visibly straight and rectangular.
```

## Control 프롬프트

```text
Use case: stylized-concept
Asset type: production NinePatch control frame for a fantasy browser TCG UI
Primary request: create one completely new elf-themed wide rectangular control frame, front-facing, orthographic, perfectly symmetrical, designed from this text description only with no reference images. It must be a complete four-sided rectangle matching the visual language of an elegant dark-emerald fantasy panel.
Subject: a low-profile dark-emerald control surface surrounded by aged bronze and muted-gold trim, with restrained pale moonstone accents and subtle elven leaf engravings confined to the four corner blocks. Keep the middle section of the top, bottom, left, and right edges straight, uniform, thin, and free of unique ornaments so the edge cells can scale cleanly. Keep the central interior flat, dark forest green, visually quiet, and safe for text.
Composition/framing: one isolated horizontal rectangle only, centered with generous even padding, approximately 3:1 width-to-height. Exact front view, no perspective, no rotation. All four sides must be visible and straight. Keep decorative details within the outer fixed corner/end regions. Preserve a large uninterrupted central interior suitable for replacing with a seamless repeat tile during production post-processing.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, readable at small control sizes, clean production raster edges.
Color palette: deep forest green, dark emerald, aged bronze, muted gold, tiny pale blue-green moonstones.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the control for removal, with no shadow, gradient, texture, reflection, floor, or lighting variation in the background.
Constraints: no text, no letters, no numbers, no logo, no watermark, no separate icons, no cast shadow, no contact shadow, no reflection. Do not use #ff00ff anywhere in the control. No protrusions outside the rectangular silhouette. No ornament in the central repeat-safe interior. Do not create a pill, capsule, arrow, banner, or pointed end; it must remain a four-corner rectangular frame.
```

## Tab 프롬프트

```text
Use case: stylized-concept
Asset type: production NinePatch tab frame for a fantasy browser TCG UI
Primary request: create one completely new elf-themed horizontal rectangular tab frame, front-facing, orthographic, perfectly symmetrical, designed from this text description only with no reference images. It must be a complete four-sided rectangle, visually related to an elegant dark-emerald fantasy panel but distinct enough to read as a selectable tab.
Subject: a compact dark-emerald tab surface surrounded by slightly brighter aged bronze and pale muted-gold trim, with small pale moonstone accents and delicate elven leaf engravings confined to the four corner blocks. Keep the middle section of every edge straight, uniform, thin, and free of unique ornaments so the edge cells can scale cleanly. Keep the central interior flat, dark green, high-contrast enough for short text, visually quiet, and free of focal detail.
Composition/framing: one isolated horizontal rectangle only, centered with generous even padding, approximately 3:1 width-to-height. Exact front view, no perspective, no rotation. All four sides must be visible and straight. Preserve a large uninterrupted central interior suitable for replacing with a seamless repeat tile during production post-processing.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, readable at small tab sizes, clean production raster edges.
Color palette: dark emerald, deep forest green, aged bronze, pale muted gold, small pale blue-green moonstones. Slightly brighter trim than a normal control but still restrained.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the tab for removal, with no shadow, gradient, texture, reflection, floor, or lighting variation in the background.
Constraints: no text, no letters, no numbers, no logo, no watermark, no separate icons, no cast shadow, no contact shadow, no reflection. Do not use #ff00ff anywhere in the tab. No protrusions outside the rectangular silhouette. No ornament in the central repeat-safe interior. Do not create a pill, capsule, arrow, banner, pointed end, or detached badge; it must remain a four-corner rectangular frame.
```

## Scroll track 프롬프트

```text
Use case: stylized-concept
Asset type: production vertical scrollbar rail for a fantasy browser TCG UI
Primary request: create one completely new elf-themed narrow vertical scrollbar track, front-facing and orthographic, designed from this text description only with no reference images.
Subject: a slender recessed dark-emerald rail with restrained aged-bronze outer trim, tiny muted-gold leaf engraving only near the top and bottom caps, and a very subtle forest-green interior groove. The long middle must remain straight, uniform, quiet, and repeat-safe. It must read clearly as a scrollbar track behind a movable thumb.
Composition/framing: one isolated vertical rounded-rectangle rail only, centered with generous padding, approximately 1:5 width-to-height. Exact front view, no perspective, no rotation. All sides visible. Keep all unique ornament inside the fixed top and bottom cap regions.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, clean production raster edges, readable when reduced to a narrow game UI rail.
Color palette: deep forest green, dark emerald, aged bronze, muted gold, very small pale blue-green moonstone accents.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the rail for removal, with no shadow, gradient, texture, reflection, floor, or lighting variation.
Constraints: no text, letters, numbers, logo, watermark, detached icon, cast shadow, contact shadow, reflection, arrow buttons, handle, or thumb. Do not use #ff00ff anywhere in the rail. No protrusions. The silhouette must stay a simple narrow rounded rectangle and the center must be suitable for NinePatch scaling.
```

## Scroll thumb 프롬프트

```text
Use case: stylized-concept
Asset type: production vertical scrollbar thumb for a fantasy browser TCG UI
Primary request: create one completely new elf-themed narrow vertical scrollbar handle, front-facing and orthographic, designed from this text description only with no reference images.
Subject: a compact movable dark-emerald thumb with brighter aged-bronze and muted-gold edging, a single restrained pale blue-green moonstone near its center, and delicate elven leaf engraving confined to the top and bottom cap areas. The middle must be straight and visually quiet so it can scale vertically.
Composition/framing: one isolated vertical rounded-rectangle handle only, centered with generous padding, approximately 1:2.2 width-to-height. Exact front view, no perspective, no rotation. Keep all ornament inside the fixed end-cap regions.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, clean raster edges, strong silhouette readable at small scrollbar size.
Color palette: dark emerald, forest green, aged bronze, muted gold, one pale blue-green moonstone.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the handle for removal, no shadow, gradient, texture, reflection, floor, or lighting variation.
Constraints: no text, letters, numbers, logo, watermark, detached icon, cast shadow, contact shadow, reflection, arrows, rail, or surrounding panel. Do not use #ff00ff in the handle. No protrusions. The silhouette must remain a simple vertical rounded rectangle suitable for NinePatch scaling.
```

## Grid cell 프롬프트

```text
Use case: stylized-concept
Asset type: production NinePatch grid-table cell frame for a fantasy browser TCG UI
Primary request: create one completely new elf-themed horizontal rectangular list/card-grid cell frame, front-facing and orthographic, designed from this text description only with no reference images.
Subject: a compact dark-emerald cell surface with thin aged-bronze and muted-gold edging, tiny pale blue-green moonstone pins, and subtle elven leaf engravings confined to four fixed corner blocks. The center must be quiet, dark, and readable behind a title and short detail line. The middle of every edge must be straight and uniform.
Composition/framing: one isolated horizontal rectangle only, centered with generous even padding, approximately 3:1 width-to-height. Exact front view, no perspective, no rotation. Keep unique details within the fixed corners and preserve a broad uninterrupted center for NinePatch use.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, production-ready raster edges, readable as a repeated grid/list cell.
Color palette: deep forest green, dark emerald, aged bronze, muted gold, restrained pale blue-green moonstones.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the cell for removal, no shadow, gradient, texture, reflection, floor, or lighting variation.
Constraints: no text, letters, numbers, logo, watermark, separate icons, cast shadow, contact shadow, reflection, arrows, tabs, or detached badge. Do not use #ff00ff in the cell. No protrusions. All four edges straight; central area free of focal ornament and suitable for repeat-safe NinePatch post-processing.
```

## Confirm dialog 프롬프트

```text
Use case: stylized-concept
Asset type: production NinePatch confirmation-dialog frame for a fantasy browser TCG UI
Primary request: create one completely new elf-themed modal confirmation dialog frame, front-facing and orthographic, designed from this text description only with no reference images.
Subject: a dignified dark-emerald dialog surface enclosed by layered aged-bronze and muted-gold trim, with restrained pale moonstone details and elegant elven leaf engravings confined to four fixed corner blocks. It should feel more ceremonial and focused than a normal panel while leaving a large quiet center for a title, message, and two actions. The middle of every edge must stay straight and uniform.
Composition/framing: one isolated 4:3 rectangular dialog frame only, centered with generous even padding. Exact front view, no perspective, no rotation. Keep ornament inside the fixed outer corner regions. Preserve a broad uninterrupted interior suitable for NinePatch scaling.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, production-ready raster edges, clear modal visual hierarchy.
Color palette: deep forest green, dark emerald, aged bronze, muted gold, pale blue-green moonstones, slight warm highlight around the inner frame.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the dialog for removal, no shadow, gradient, texture, reflection, floor, or lighting variation.
Constraints: no text, letters, numbers, logo, watermark, separate icons, buttons, cast shadow, contact shadow, reflection, detached ornament, or perspective. Do not use #ff00ff in the dialog. No protrusions outside the rectangular silhouette. Center free of focal ornament and suitable for repeat-safe NinePatch post-processing.
```

## Badge 프롬프트

```text
Use case: stylized-concept
Asset type: production fixed-size badge medallion for a fantasy browser TCG UI
Primary request: create one completely new elf-themed compact circular badge background, front-facing and orthographic, designed from this text description only with no reference images.
Subject: a small round dark-emerald medallion with a clean aged-bronze and muted-gold rim, four restrained leaf-tip motifs around the rim, and a quiet flat central disk intended to hold a one- or two-digit count. Use tiny pale blue-green moonstone accents sparingly around the edge, never in the center.
Composition/framing: one isolated circular badge only, perfectly centered with generous even padding, exact front view, no perspective, no rotation. Keep ornament at the outer rim and leave the central 55 percent clear.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, clean production raster edges, readable at approximately 48 to 64 pixels.
Color palette: deep emerald, forest green, aged bronze, muted gold, tiny pale blue-green accents.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the medallion for removal, no shadow, gradient, texture, reflection, floor, or lighting variation.
Constraints: no text, letters, numbers, logo, watermark, separate icons, cast shadow, contact shadow, reflection, banner, ribbon, or surrounding panel. Do not use #ff00ff in the medallion. Keep the circular silhouette clean and the center empty for runtime text.
```

## Button 프롬프트

```text
Use case: stylized-concept
Asset type: production NinePatch action-button frame for a fantasy browser TCG UI
Primary request: create one completely new elf-themed horizontal action button frame, front-facing and orthographic, designed from this text description only with no reference images.
Subject: a sturdy compact dark-emerald button surface with brighter aged-bronze and muted-gold double trim, small pale blue-green moonstone studs, and elegant elven leaf engraving confined to fixed left and right end blocks. The broad center must be quiet, high-contrast, and suitable for short action text. It must look more actionable than a passive label but remain refined.
Composition/framing: one isolated horizontal rounded rectangle only, centered with generous even padding, approximately 3:1 width-to-height. Exact front view, no perspective, no rotation. Keep unique decoration in the fixed end/corner regions. Straight uniform middle edges and broad uninterrupted center for NinePatch scaling.
Style/medium: crisp polished hand-painted fantasy TCG UI, refined elven craftsmanship, production-ready raster edges, readable at button scale.
Color palette: dark emerald, forest green, aged bronze, muted gold, restrained pale blue-green moonstones, subtle warm inner highlight.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background outside the button for removal, no shadow, gradient, texture, reflection, floor, or lighting variation.
Constraints: no text, letters, numbers, logo, watermark, separate icon, cast shadow, contact shadow, reflection, arrow, tab, banner, pointed end, or detached badge. Do not use #ff00ff in the button. No protrusions. Center free of focal ornament and suitable for repeat-safe NinePatch post-processing.
```
