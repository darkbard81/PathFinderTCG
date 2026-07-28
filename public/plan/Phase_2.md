# Phase 2 구현 결과 — 로그인 세션과 계정별 세이브 슬롯

## 1. 완료 상태

**상태:** `COMPLETE — 2026-07-27`

Phase 2의 Fastify API, SQLite 영속화, 로컬 계정, 고정 7일 세션, 계정별 1~3번 세이브 슬롯,
저장 덱 갱신, 슬롯 초기화와 통합 테스트를 구현했다. Phaser 로그인·슬롯 화면은 계획대로
Phase 7 범위에 남겨 두었다.

> 현재 개발 실행은 이후 통합된 Vite 서버가 화면과 Fastify API를 모두 3010에서 처리한다.
> 아래 서버 실행 항목은 Phase 2 완료 당시의 독립 API 구조를 기록한다.

## 2. 구현 범위

| 영역             | 구현 결과                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 서버 실행        | 개발 `127.0.0.1:3011`, `HOST`·`PORT` 주입, `tsx` 실행 script와 Vite `/api` proxy를 추가했다.                                              |
| 계정             | trim·소문자 정규화, 사용자명 패턴, 비밀번호 12~128자, 중복 사용자명 거부를 구현했다.                                                      |
| 비밀번호 저장    | 사용자별 16바이트 salt와 `scrypt(N=32768, r=8, p=1, maxmem=67108864)` 64바이트 hash만 SQLite에 저장한다.                                  |
| 세션             | 32바이트 난수 토큰을 쿠키에 한 번 전달하고 DB에는 SHA-256 digest만 저장한다. 만료는 생성 시점부터 고정 7일이다.                           |
| 쿠키             | `ptcg_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`이며 production에서 `Secure`를 강제한다.                                              |
| 요청 보호        | 모든 API 쓰기 요청의 정확한 `Origin`을 검증하고 가입·로그인을 IP+정규화 사용자명 조합당 10분에 10회로 함께 제한한다.                      |
| SQLite           | `users`, `sessions`, `save_slots`와 migration version 1을 만들고 `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`을 적용했다.   |
| 세이브 슬롯      | 목록은 DB 행 유무와 관계없이 항상 1~3번 세 항목을 반환한다. 생성·전체 로드·덱 갱신·초기화를 인증 계정과 슬롯 복합 키로 격리했다.          |
| 데이터 검증      | 슬롯 생성·로드·갱신마다 Phase 1 JSON Schema와 의미 validator를 모두 적용하고 DB 열의 slot/schema/timestamp와 JSON 본문의 일치도 확인한다. |
| 로컬 데이터 보호 | `data/`를 Git ignore에 추가했으며 테스트는 매 테스트 전용 임시 SQLite 경로를 사용한다.                                                    |

## 3. API 계약

| Method   | Route                                   | 성공 응답                          | 주요 실패                                              |
| -------- | --------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `POST`   | `/api/auth/register`                    | `201 { user }`                     | `400`, `409 USERNAME_TAKEN`, `429`                     |
| `POST`   | `/api/auth/login`                       | `200 { user }`와 세션 쿠키         | `401 INVALID_CREDENTIALS`, `429`                       |
| `POST`   | `/api/auth/logout`                      | `204`                              | `403 ORIGIN_FORBIDDEN`                                 |
| `GET`    | `/api/auth/session`                     | `200 { user }`                     | `401 UNAUTHENTICATED`                                  |
| `GET`    | `/api/save-slots`                       | `200 { saveSlots }` — 항상 세 항목 | `401 UNAUTHENTICATED`                                  |
| `POST`   | `/api/save-slots/:slotId`               | `201 { saveSlot }`                 | `400`, `401`, `409 SAVE_SLOT_ALREADY_EXISTS`           |
| `GET`    | `/api/save-slots/:slotId`               | `200 { saveSlot }`                 | `400`, `401`, `404 SAVE_SLOT_NOT_FOUND`                |
| `PUT`    | `/api/save-slots/:slotId/decks/:deckId` | `200 { saveSlot }`                 | `400`, `401`, `404 DECK_NOT_FOUND`, `422 INVALID_DECK` |
| `DELETE` | `/api/save-slots/:slotId`               | `204`                              | `400`, `401`, `404 SAVE_SLOT_NOT_FOUND`                |

오류 응답은 `{ error: { code, message, details? } }`로 통일했다. URL에는 계정 ID를 노출하지
않으며 모든 슬롯 SQL은 인증된 `user_id`와 `slot_id`를 함께 조건으로 사용한다. 따라서 다른
계정은 같은 슬롯 번호를 요청해도 자기 행만 조회하며, 상대 계정의 슬롯 존재 여부도 알 수 없다.

## 4. SQLite와 영속화

### 테이블

| 테이블       | 영속 데이터                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------- |
| `users`      | UUID 계정 ID, 정규화 사용자명, 16바이트 salt, 64바이트 scrypt hash, 생성 시각                |
| `sessions`   | 32바이트 SHA-256 token digest, 계정 외래 키, 생성·만료 시각                                  |
| `save_slots` | `(user_id, slot_id)` 복합 기본 키, game schema version, `SaveSlotState` JSON, 생성·수정 시각 |

외래 키는 계정 삭제 시 세션과 슬롯을 cascade 삭제하도록 선언했다. `SaveSlotState.schemaVersion`,
DB `schema_version`, `lastModifiedAt`, DB `updated_at`이 서로 다르면 손상 또는 미지원 데이터로
판정해 안전하게 로드를 거부한다. 서버 재시작 통합 테스트는 같은 DB 파일과 기존 쿠키로 세션과
수정된 덱 이름이 복원되는 것을 확인한다.

## 5. 의존성 결정

게이트 A의 승인 범위 안에서 다음 정확한 버전을 잠갔다.

| 구분    | 패키지                  | 버전     |
| ------- | ----------------------- | -------- |
| runtime | `fastify`               | `5.10.0` |
| runtime | `@fastify/cookie`       | `10.0.1` |
| runtime | `@fastify/rate-limit`   | `10.3.0` |
| runtime | `better-sqlite3`        | `12.9.0` |
| dev     | `tsx`                   | `4.23.1` |
| dev     | `@types/better-sqlite3` | `7.6.13` |

`better-sqlite3 12.11.1`은 승인된 첫 설치에서 현재 Node `20.19.5`용 prebuild가 없어 로컬
소스 빌드로 넘어갔고, 이 환경에는 `make`가 없어 실패했다. 다른 설치 방식이나 시스템 패키지를
추가하지 않았다. 공식 release 기록상
[`12.10.0`](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.10.0)부터 Node 20
prebuild가 제거되었고
[`12.9.1`](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.9.1)은 사용 비권장
release이므로, 같은 12.x 승인 범위와 npm 설치 경로 안에서 공식 안내가 지정한
[`12.9.0`](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.9.0)을 선택했다.
런타임 import와 in-memory SQLite probe도 통과했다.

남은 설치 경고는 `better-sqlite3 12.9.0`의 전이 설치 도구인
`prebuild-install@7.1.3` deprecation이다. 현재 `npm audit` 취약점은 없으며, 프로젝트의
Node 지원 기준을 22 이상으로 올리는 별도 승인 시점에 최신 12.x 이상으로 재검토할 수 있다.

## 6. 사용자 결정사항과 후속 고려사항

### 이번 Phase에서 추가 결정이 필요하지 않은 항목

- 게이트 A는 `APPROVED — 2026-07-27` 상태이며 서버·인증·세션·포트·SQLite 구현은 승인
  범위 안에 있다.
- API 응답 wrapper, DB migration version 1, production `ALLOWED_ORIGINS` 명시 요구는 승인된
  보안·확장 경계의 구체화이며 코어 게임 규칙을 바꾸지 않는다.

### 후속 Phase에서 반드시 연결할 항목

1. **Phase 3 starter 콘텐츠**
   - Phase 1 테스트 fixture를 런타임 데이터로 사용하지 않았다.
   - 현재 기본 `ServerGameContent`는 빈 컬렉션·빈 덱인 Schema-valid 슬롯을 만든다.
   - Phase 3은 승인된 아군 16종과 starter 30장을 `ServerGameContent` 주입 경계에 연결해야
     하며, 그때 실제 새 게임이 리더 1장과 유닛 29장을 소유하도록 바꾼다.
2. **Phase 7 삭제 확인 UI**
   - Phase 2의 `DELETE`는 인증·Origin·계정 소유권을 검증하고 슬롯을 초기화한다.
   - 실제 rexUI 확인 Dialog는 Phase 7에서 구현하며, 사용자가 확인한 뒤에만 `DELETE`를
     호출해야 한다.
3. **production 배포 설정**
   - production은 `HOST`, `PORT`, `ALLOWED_ORIGINS`를 명시하지 않으면 시작을 거부한다.
   - HTTPS production에서만 `Secure` 쿠키가 전송되므로 reverse proxy도 HTTPS를 유지해야
     한다.

## 7. 주요 변경 파일

| 파일                                                           | 역할                                              |
| -------------------------------------------------------------- | ------------------------------------------------- |
| [`src/server/app.ts`](../../src/server/app.ts)                 | Fastify 구성, 보안 hook, 인증·슬롯 route          |
| [`src/server/auth.ts`](../../src/server/auth.ts)               | 계정 검증, scrypt, 세션 생성·인증·로그아웃        |
| [`src/server/database.ts`](../../src/server/database.ts)       | SQLite 연결, migration, 계정·세션·슬롯 repository |
| [`src/server/saveSlots.ts`](../../src/server/saveSlots.ts)     | Schema·의미 검증과 슬롯·덱 서비스                 |
| [`src/server/gameContent.ts`](../../src/server/gameContent.ts) | Phase 3 콘텐츠 주입 경계와 Phase 2 빈 초기 상태   |
| [`src/server/config.ts`](../../src/server/config.ts)           | 개발·production 실행 설정                         |
| [`src/server/start.ts`](../../src/server/start.ts)             | API 프로세스 진입점                               |
| [`src/server/app.test.ts`](../../src/server/app.test.ts)       | 임시 SQLite 기반 Phase 2 통합 테스트              |
| [`src/server/README.md`](../../src/server/README.md)           | 실행 환경, API와 보안 경계 문서                   |
| [`vite.config.ts`](../../vite.config.ts)                       | Vite `/api` proxy                                 |
| [`package.json`](../../package.json)                           | 승인된 의존성과 API 실행 script                   |

## 8. 완료 기준 감사

| 명시 요구사항          | 권위 있는 검증 근거                                                      |
| ---------------------- | ------------------------------------------------------------------------ |
| 가입                   | 정규화된 계정 생성 통합 테스트                                           |
| 중복 사용자명 거부     | 대소문자·공백이 다른 같은 사용자명 `409` 테스트                          |
| 로그인 성공·실패       | 올바른 자격 증명 `200`과 잘못된 비밀번호 `401` 테스트                    |
| 로그아웃               | 세션 삭제 후 같은 쿠키 `401` 테스트                                      |
| 만료 세션              | 고정 7일 경계에서 세션 삭제·`401` 테스트                                 |
| 인증 없는 접근 거부    | 슬롯 목록 `401` 테스트                                                   |
| 타 계정 슬롯 접근 거부 | 계정 A 슬롯을 계정 B가 읽으면 `404`, B 목록은 빈 세 슬롯인 테스트        |
| 세 슬롯 격리           | A의 1~3번 생성 후 2번만 삭제해 1·3번이 유지되는 테스트                   |
| 슬롯 초기화            | `DELETE` `204`, 이후 목록 `EMPTY` 테스트                                 |
| 저장 덱 검증           | 합법 덱 이름 변경 저장과 미소유 인스턴스 `422` 테스트                    |
| 저장 데이터 복원       | 서버 close·rebuild 뒤 세션과 수정 덱 복원 테스트                         |
| 비밀 원문 비저장       | DB BLOB 길이·SHA-256 digest와 DB 파일 내 비밀번호·토큰 원문 부재 테스트  |
| Origin과 요청 제한     | missing/foreign Origin `403`, 공유 10회 제한 뒤 가입→로그인 `429` 테스트 |
| SQLite 실행 설정       | WAL·foreign keys·busy timeout·migration pragma 테스트                    |
| 실제 DB 파일 미커밋    | 임시 DB 사용, `data/` ignore, worktree 생성물 검색                       |

## 9. 검증 결과

| 검증                                      | 결과                           |
| ----------------------------------------- | ------------------------------ |
| Phase 2 targeted 테스트                   | `PASS` — 4 files, 12 tests     |
| `npm run typecheck`                       | `PASS`                         |
| `npm run lint`                            | `PASS`                         |
| `npm run format:check`                    | `PASS`                         |
| `npm test`                                | `PASS` — 16 files, 65 tests    |
| `npm run build`                           | `PASS` — Vite production build |
| `npm audit --audit-level=high`            | `PASS` — 0 vulnerabilities     |
| `git diff --check`                        | `PASS`                         |
| 비밀번호·세션 토큰 원문 DB 잔존 검사      | `PASS`                         |
| 서버 재시작 후 세션·슬롯 데이터 복원      | `PASS`                         |
| `data/`, `dist/`, 테스트 임시 생성물 감사 | `PASS` — 추적 대상 생성물 없음 |

이번 Phase에는 Phaser/rexUI 화면 변경이 없으므로 가로·세로 브라우저 시각 검증 대상이 아니다.
로그인·슬롯·삭제 확인 화면의 실제 가로·세로 검증은 Phase 7 완료 기준에 포함된다.
