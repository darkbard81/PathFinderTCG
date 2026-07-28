# Local account, save, and Stage run API

`src/server/`는 Phaser 객체와 분리된 Fastify·SQLite 경계다. 브라우저는 Vite의 `/api` proxy를
통해 접근하고, 세이브 본문은 `src/game/data/`의 JSON Schema와 의미 validator를 모두
통과해야 DB에 저장되거나 DB에서 복원된다.

## 개발 실행

두 터미널에서 각각 실행한다.

```bash
npm run dev:api
npm run dev
```

- Vite: `http://127.0.0.1:3010`
- API: `http://127.0.0.1:3011`
- 개발 DB: `data/pathfinder-tcg.sqlite`

`data/`는 로컬 상태이므로 Git에서 제외한다.

## 환경 변수

| 변수              | 개발 기본값                                                                                           | 설명                              |
| ----------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| `HOST`            | `127.0.0.1`                                                                                           | API bind 주소                     |
| `PORT`            | `3011`                                                                                                | API 포트                          |
| `DATABASE_PATH`   | `data/pathfinder-tcg.sqlite`                                                                          | SQLite 파일                       |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:3010,http://localhost:3010,http://mcp.krdp.ddns.net:3010,https://mcp.krdp.ddns.net` | 쓰기 요청에 허용할 정확한 Origins |
| `NODE_ENV`        | development                                                                                           | production이면 Secure 쿠키 활성화 |

production에서는 `HOST`, `PORT`, `ALLOWED_ORIGINS`를 모두 명시해야 한다.

## API 응답 경계

| Method   | Route                                                | 성공 응답                                |
| -------- | ---------------------------------------------------- | ---------------------------------------- |
| `POST`   | `/api/auth/register`                                 | `201 { user }`                           |
| `POST`   | `/api/auth/login`                                    | `200 { user }`와 `ptcg_session` 쿠키     |
| `POST`   | `/api/auth/logout`                                   | `204`                                    |
| `GET`    | `/api/auth/session`                                  | `200 { user }`                           |
| `GET`    | `/api/save-slots`                                    | `200 { saveSlots }` — 항상 1~3번 세 항목 |
| `POST`   | `/api/save-slots/:slotId`                            | `201 { saveSlot }`                       |
| `GET`    | `/api/save-slots/:slotId`                            | `200 { saveSlot }`                       |
| `PUT`    | `/api/save-slots/:slotId/decks/:deckId`              | `200 { saveSlot }`                       |
| `POST`   | `/api/save-slots/:slotId/stage-runs`                 | `201/200 { stageRun }`                   |
| `POST`   | `/api/save-slots/:slotId/stage-runs/:runId/complete` | `200 { stageRun, saveSlot }`             |
| `DELETE` | `/api/save-slots/:slotId`                            | `204`                                    |

오류는 `{ error: { code, message, details? } }` 형식을 사용한다. 모든
`POST`·`PUT`·`PATCH`·`DELETE` 요청은 정확히 허용된 `Origin`이 필요하다.

## 보안과 데이터 수명

- 사용자명은 trim·소문자 정규화 후 `^[a-z0-9_-]{3,24}$`를 검증한다.
- 비밀번호는 16바이트 salt와 승인된 scrypt 설정으로 64바이트 hash만 저장한다.
- 세션 쿠키 원문은 32바이트 난수이며 DB에는 SHA-256 digest만 저장한다.
- 세션은 생성 시점부터 고정 7일 뒤 만료되며 요청으로 연장되지 않는다.
- 슬롯 쿼리는 URL에 계정 ID를 받지 않고 인증된 계정 ID와 슬롯 1~3을 항상 함께 사용한다.
- SQLite는 `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`으로 연다.

Phase 3 런타임 초기 상태는 승인된 32종 카드 풀을 사용한다. 새 슬롯에는 호출마다 새 ID를 가진
아군 카드 인스턴스 30장과 합법적인 starter 덱 하나를 같은 `ServerGameContent` 주입 경계에서
생성한다. Phase 1 테스트 fixture는 런타임 데이터로 사용하지 않는다.

Phase 8의 새 슬롯은 `stage-01`이 해금된 상태로 생성되며 기존 Phase 3 슬롯도 처음 읽을 때
같은 상태로 마이그레이션된다. Stage 시작은 합법적인 선택 덱을 다시 검증한 뒤 실행 ID와 uint32
시드를 저장한다. 같은 슬롯·Stage의 `PENDING` 실행은 재시작 뒤에도 재사용한다.

완료 요청은 실행 ID 단위로 멱등하다. `WIN`은 Stage 보상표에서 정확히 한 카드 인스턴스를
추첨하고, `LOSS`와 `DRAW`는 보상을 만들지 않는다. 실행 완료, 완료 영수증, 컬렉션과 진행도
갱신은 하나의 SQLite 트랜잭션으로 저장한다.
