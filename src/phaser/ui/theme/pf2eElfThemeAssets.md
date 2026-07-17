# PF2e 엘프 UI 테마 자산

이 문서는 `PF2E_ELF_THEME`에서 사용하는 NinePatch 이미지의 생성 조건과 원본 프롬프트를
보존한다. 자산을 다시 생성할 때 기존 이미지를 참조 이미지로 사용하지 않고 아래 테마 설명과
프롬프트를 기준으로 새로 생성한다.

## 런타임 자산

| Variant   | 파일                                              | 크기    | Columns                 | Rows                    |
| --------- | ------------------------------------------------- | ------- | ----------------------- | ----------------------- |
| `panel`   | `public/assets/ui/pf2e-elf-panel-ninepatch.png`   | 384×384 | `[104, undefined, 104]` | `[104, undefined, 104]` |
| `control` | `public/assets/ui/pf2e-elf-control-ninepatch.png` | 448×128 | `[56, undefined, 56]`   | `[32, undefined, 32]`   |
| `tab`     | `public/assets/ui/pf2e-elf-tab-ninepatch.png`     | 448×128 | `[56, undefined, 56]`   | `[32, undefined, 32]`   |

안정적인 자산 키와 런타임 경로는 `src/game/assets/manifest.ts`에서 관리한다. 교체 전 자산은
`backup/ui/`에 보관하며 이 디렉터리는 런타임과 Git 추적에서 제외한다.

## NinePatch 사양

```ts
stretchMode: {
  edge: 'scale',
  internal: 'repeat',
}
```

- 고유 장식과 코너는 고정 영역 안에 배치한다.
- 각 변의 중앙은 고유 장식이 없는 직선 형태로 만들어 한 번만 늘어나도록 한다.
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
- 내부 셀: 경계가 수학적으로 일치하는 저대비 에메랄드 텍스처로 교체

후처리 후 다음 항목을 검사한다.

1. PNG가 RGBA 형식인지 확인한다.
2. 출력 크기와 테마 슬라이스가 이 문서의 표와 일치하는지 확인한다.
3. 내부 셀의 X/Y 반복 경계 최대 채널 차이가 `0`인지 확인한다.
4. alpha가 있는 픽셀에 마젠타 잔여 색상이 없는지 확인한다.
5. 데스크톱과 세로 viewport에서 panel, control, tab을 실제 rexUI로 표시한다.

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
