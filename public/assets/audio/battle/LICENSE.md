# Battle SFX provenance

이 디렉터리의 전투 SFX 12종은 PathfinderTCG용으로 2026-07-28에 로컬에서 직접 합성한
프로젝트 자산이다. 외부 녹음, 샘플 팩, 음악 또는 제3자 저작물을 사용하지 않았다.

| 항목        | 기록                                              |
| ----------- | ------------------------------------------------- |
| 제작자      | PathfinderTCG project                             |
| 출처 URL    | 해당 없음 — FFmpeg `sine` source로 로컬 자체 제작 |
| 라이선스    | 제3자 라이선스 없음 — 프로젝트 자체 제작 자산     |
| 제작·취득일 | 2026-07-28                                        |
| 생성 도구   | FFmpeg 7.1.1                                      |
| 표본 형식   | 44.1 kHz mono                                     |
| 배포 형식   | OGG/Vorbis와 MP3 fallback                         |

각 파일은 92–1180 Hz 범위의 단일 합성 톤에 짧은 fade-in/fade-out과 음량 조정을 적용했다.
`attack`, `impact`, `damage`, `destroy`, `heal`, `draw`, `move`, `place`, `discard`, `stat`,
`status-add`, `status-remove`는 서로 다른 주파수와 길이를 사용한다. 런타임은
`sfx.battle.*` 안정 키로 두 형식을 함께 로드하며 원본 외부 자산은 존재하지 않는다.
