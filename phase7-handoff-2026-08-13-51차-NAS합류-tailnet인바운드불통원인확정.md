# Phase 7 — 51차 핸드오프

**일자** 2026-08-13
**주제** NAS tailnet 합류 · hosts 자가복구 적용 · **tailnet 인바운드 불통 원인 확정** · 50차 검증표 정정
**커밋** 없음 (repo 무변경) — 이 문서 커밋이 유일
**배포** 없음 / **DB 무접근** / **마이그레이션 0건** / **pm2 ↺ 37 유지**
**repo 밖 변경** Tailscale 정책 파일 1건(additive) · NAS 3건(패키지·스크립트·스케줄러)

---

## 0. 세션 시작 프로토콜 (다음 세션은 여기서 시작)

```bash
pm2 ls                                                    # online, ↺ 37
curl -so /dev/null -w "%{http_code}\n" localhost:3000     # 200
ss -tlnp | grep ':3001' || echo '3001 없음'
cd ~/apps/mysado-shop      && git log --oneline -1         # 5332fd9 (+ 이 문서 커밋 시 그 해시)
cd ~/apps/mysado-shop-prod && git log --oneline -1         # 5332fd9
```

50차 §0의 DB 확인 쿼리(`api_client` 1행 / `product` 228행)는 **그대로 유효**합니다.
이번 세션은 DB에 읽기조차 하지 않았습니다(트랙 B의 psql 블록이 미실행 상태로 남음 — §7).

> `last_used_at` 뺄셈 함정(50차 §0)도 유효합니다. `now() AT TIME ZONE 'UTC' - last_used_at`.

---

## 1. 이번 세션의 성격 — 코드 0줄, 원인 1건

50차 §11-C(NAS hosts + 부팅 자가복구)를 착수해 **NAS 측 설정은 전부 완료**했으나,
막상 실연동을 검증하자 **tailnet 경유 TCP가 전혀 성립하지 않았습니다.**

세션 시간의 대부분이 그 원인 규명에 들어갔고, 결과적으로 얻은 것은 기능이 아니라 **사실 3개**입니다.

1. NAS Tailscale이 `--tun=userspace-networking` 으로 떠 있어 **`tailscale0` 인터페이스가 존재하지 않음**
2. **50차 검증표 ⑦⑨는 tailnet 경유를 검증하지 못했음** — 자기 자신에게 건 호출이었음
3. `tailscale ping` 성공은 **터널 정상을 뜻하지 않음** — 오늘 오판 6회가 전부 이 오독에서 파생

트랙 B(`GET /api/v1/orders`)는 스키마 실측까지 진행하고 구현 전에 멈췄습니다(§7).

---

## 2. 완료 사항

### 2-1. NAS tailnet 합류 — 태그 방식

| 항목 | 값 |
|---|---|
| 기기명 | `synjuseung` |
| tailnet IP | `100.93.152.51` (Nginx `allow 100.64.0.0/10` 범위 안 ✅) |
| 태그 | `tag:hub` |
| 키 만료 | **Expiry disabled** (수동 조작 아님 — 태그 인증의 자동 결과) |
| DSM | 직접 설치(Docker 아님) / SSH 가능 |
| 실행 주체 | 우승문 대표 |

**설계 판단: 사용자 초대가 아니라 인증 키 + 태그를 택했습니다.**
Tailscale 노드 키는 기본 180일 뒤 만료되는데, 우리 구성에서는 만료 시 hosts가
**닿지 않는 IP로 고정된 채** 남아 폴백조차 없습니다. 태그를 붙여 인증한 기기는 키 만료가
기본 비활성화되므로, "6개월 뒤 잊지 않고 버튼을 누른다"는 사람 의존이 구조적으로 사라집니다.
나중에 태그만 갈아 끼우는 것으로는 만료 설정이 따라오지 않으므로 **최초 인증이 유일한 기회**였습니다.

부수 효과: 기기가 개인 계정에 묶이지 않습니다(소유자 열이 이메일이 아니라 태그).

### 2-2. Tailscale 정책 파일 (additive)

```json
"tagOwners": { "tag:hub": ["autogroup:admin"] }
```

`grants` / `ssh` 블록 **무수정**. 기본 전체 허용(`{"src":["*"],"dst":["*"],"ip":["*"]}`) 유지.

- 편집 전 전문을 `outputs/tailscale-policy-pre-51차.json` 에 보존(되돌리기 수단은 이것뿐)
- 이 tailnet의 **첫 정책 변경**이었습니다 — 그 전까지 기본 예시 그대로
- 🟡 VS Code가 이 백업 파일에 JSON 오류 53건을 표시합니다. **정상입니다** —
  Tailscale 정책은 주석·후행 쉼표를 허용하는 HuJSON이고 확장자만 `.json`입니다

> **🔴 접근 규칙(`acls`/`grants`)은 손대지 않는 것을 원칙으로 삼았습니다.** 좁히려다 실수하면
> Remote 접속 경로가 그 순간 끊기고 복구가 tailnet 밖으로 밀려납니다.
> 단 이 원칙에는 예외 조건이 있습니다 — §4-2 참조.

### 2-3. NAS hosts + 자가복구

```
/volume1/scripts/mysado-hosts-fix.sh      grep -qxF 정확일치 → 없으면 append
작업 스케줄러 ① 트리거된 작업(부팅 완료), root
작업 스케줄러 ② 예약된 작업(매일), root
```

**50차 §5-1 ⑵의 한 줄 명령을 그대로 쓰지 않은 이유 셋:**

- `grep -q 'mysado.net'` 은 **표기가 다른 줄이 이미 있어도 통과**합니다. 정확 일치(`-qxF`)로 바꿈
- 사람이 손으로 넣은 표기와 스크립트 표기가 어긋나면 **매 실행마다 중복 줄이 쌓입니다** →
  최초 삽입도 같은 스크립트가 수행(34차 원칙 2 "규칙보다 구조")
- 충돌 줄 발견 시 **자동 보정하지 않고 로그만 남기고 exit 1**
  (정본 규약: 가드는 자동 보정하지 않는다)

**부팅 트리거만으로 부족하다고 본 근거**: DSM 업데이트가 `/etc` 커스터마이징을 되돌리는 것은
시놀로지 공식 입장이나, 호스트명·네트워크 설정 변경 시 운영 중 재생성될 가능성을 배제할
근거가 없었습니다. **배제를 증명하는 비용보다 일간 트리거 하나가 싸므로** 둘을 뒀습니다.

스크립트를 `/usr/local` 이 아니라 `/volume1` 에 둔 것도 같은 이유(DSM 업데이트 영향권 회피).

**결과: hosts 해석은 정상 동작합니다.** `ping -c1 mysado.net` → `100.121.175.2`.
그러나 §3 때문에 실제 통신은 되지 않습니다.

---

## 3. 🔴 원인 확정 — NAS가 userspace-networking 모드

### 3-1. 확정 증거 (추론 아님, 프로세스 인자 실측)

```
tailsca+ 13518 1 Aug02 /volume1/@appstore/Tailscale/bin/tailscaled
  --state=/volume1/@appdata/Tailscale/tailscaled.state
  --socket=/volume1/@appdata/Tailscale/tailscaled.sock
  --port=41641  --tun=userspace-networking      ← 이것
```

```
ip route get 100.121.175.2  →  via 192.168.35.1 dev ovs_eth0   ← 기본 게이트웨이로 나감
ip -brief addr show tailscale0  →  Device "tailscale0" does not exist
tailscale status --json  →  "TUN": false
tailscale debug prefs    →  "NetfilterMode": 0
/dev/net/tun             →  존재함 (crw------- root root 10,200)
```

### 3-2. 무슨 일이 일어나고 있었나

userspace 모드의 tailscaled는 **자체 네트워크 스택**을 들고 tailnet과 통신합니다.
OS 커널에는 tun 장치가 만들어지지 않으므로, **NAS의 다른 프로그램은 tailnet에 접근할 수 없습니다.**

커널은 `100.121.175.2` 를 평범한 인터넷 주소로 보고 공유기(`192.168.35.1`)로 내보냈고,
그 패킷은 CGNAT 대역이라 인터넷 어디에도 갈 곳이 없어 소멸했습니다.
**미니PC의 `tailscale0` 캡처가 완전히 침묵한 이유가 이것입니다 — 패킷은 터널에 들어가지도 않았습니다.**

`curl` 뿐 아니라 **통합관리 프로그램도 같은 제약을 받습니다.** hosts를 아무리 고쳐도 통하지 않습니다.

### 3-3. 부수 사실

- **`Aug02` 기동** — 11일째 이 상태. 우승문 대표의 이번 설정 실수가 아니라 **패키지 설치 시점 기본값**
- **`tailsca+` 사용자로 실행** — root가 아님. tun 장치를 열려면 권한이 필요하므로
  **인자만 바꿔서는 안 될 가능성**이 있습니다. 시놀로지가 userspace를 기본으로 두는 이유일 수 있음
- 설정 정본은 `/var/packages/Tailscale/scripts/start-stop-status` — **패키지 업데이트 시 덮어써짐**.
  hosts와 같은 성질이라 조치 시 자가복구가 또 필요

---

## 4. 🔴 진단 여정 — 가설 6회 폐기

이 표가 이번 세션의 실질 산출물입니다. **각 가설이 왜 그럴듯했고 무엇이 배제했는지**를 남깁니다.

| # | 가설 | 배제 근거 |
|---|---|---|
| ⑴ | shields-up | `tailscale debug prefs` → `"ShieldsUp": false` |
| ⑵ | UFW 인터페이스 한정 규칙 | `ufw: command not found` (설치조차 안 됨) |
| ⑶ | Nginx `listen` 바인딩 | `ss -lntp` → `0.0.0.0:443` |
| ⑷ | **WSL2 인바운드 불가** | 노트북(같은 tailnet)에서 `https://100.121.175.2/` 접속 시 **`ERR_CERT_COMMON_NAME_INVALID`** = TLS까지 성립 |
| ⑸ | **MTU 블랙홀** | NAS에서 `tailscale ping --size 1200` 직결 6ms 성공 |
| ⑹ | **Tailscale 패킷 필터(ACL)가 태그 기기 차단** | `PacketFilterRules.SrcIPs` = `100.64.0.0-100.115.91.255` + `100.115.94.0-100.127.255.255` → NAS 주소 **포함** |
| ⑺ | DSM 방화벽 | 제어판 화면 — **방화벽 활성화 꺼짐** |

### 4-1. ⑷가 특히 위험했던 이유

WSL2 확정 시 조치는 `.wslconfig` `networkingMode=mirrored` + **WSL 전체 재시작**이며,
pm2·PostgreSQL·터미널이 전부 끊깁니다. **토스 심사 3일 전에 운영 서버 네트워크를 흔들 뻔했습니다.**

노트북 브라우저 한 번이 이를 막았습니다. **Machines 목록에 이미 있던 기기를 진단에 쓸 생각을
늦게 했습니다** — 우승문 대표와 왕복 조율하느라 관측 창을 여러 번 놓쳤고, 자체 피어를 썼다면
훨씬 일찍 갈렸을 것입니다.

### 4-2. ⑹은 반은 맞았습니다 (다음에 쓸 지식)

`grants` 의 `"src": ["*"]` 에서 **`*` 는 tailnet 사용자들의 기기를 뜻하며 태그 기기를 포함하지 않습니다.**
이번엔 기본 정책의 `SrcIPs` 가 CGNAT 대역 전체를 덮고 있어 결과적으로 문제가 없었으나,
**접근 규칙을 좁히는 순간 `tag:hub` 는 규칙 밖으로 떨어집니다.**

> **규약**: 태그 기기를 쓰는 tailnet에서 `grants` 를 좁힐 때는 `{"src": ["tag:hub"], ...}` 규칙을
> **반드시 함께** 넣습니다. 좁히기 전에는 `tailscale debug netmap` 의 `PacketFilterRules` 로
> 실제 적용값을 확인합니다(정책 파일의 문언과 적용 결과는 다릅니다).

### 4-3. 관측 실패 3건

| 증상 | 원인 | 규약 |
|---|---|---|
| `ss -tan state syn-recv` 0건 | 우승문 대표 실행 시점과 폴링 창이 겹쳤는지 **미확인** | 원격 조율이 필요한 관측은 창을 넉넉히(300초) 잡고 상대 출력으로 시각을 대조 |
| `ps w` 빈 출력 | tailscaled가 **root 소유** — `ps w` 는 자기 프로세스만 | **0건 원인 목록에 "권한 범위" 추가** (50차 §10-⑵ 심볼릭 링크에 이어) |
| `curl -v` 에서 `* Trying` 줄 소실 | 진행률 표시기가 `\r` 로 verbose 줄을 덮어씀 | verbose 진단 시 **`-s` 를 함께** 준다 |

`nslookup mysado.net` 이 공인 IP를 반환한 것도 기록해 둡니다 — **`nslookup` 은 `/etc/hosts` 를
읽지 않습니다.** hosts 검증은 `getent hosts` 또는 `ping` 으로 합니다.

---

## 5. 🔴 50차 검증표 정정

50차 §6-1은 "미검증 0건"으로 마감됐으나 **사실이 아니었습니다.**

| 50차 기록 | 실제 |
|---|---|
| ⑦ tailnet 경유(prod) 401 ✅ | 미니PC가 **자기 자신의** tailnet 주소로 건 호출. 패킷이 로컬에서 끝남 |
| ⑨ 유효 키(prod, tailnet+TLS) 200 ✅ | 동일. "허브가 실제로 밟을 전 경로"라고 적었으나 **원격 피어 구간이 빠져 있었음** |

**원격 피어로부터의 인바운드 TCP는 51차가 처음이었고, 그것이 실패했습니다.**

50차 §6-1의 다른 항목(①~⑥, ⑧, ⑩)은 유효합니다. Nginx `allow`/`deny` 판정(⑧ 403)도
헤어핀 NAT 경유라 유효합니다. **정정 대상은 ⑦⑨ 둘뿐**이며, 앱·인증·봉투·rate limit 구현에는
문제가 없습니다.

---

## 6. 새로 확립된 원칙

**⑴ `tailscale ping` 성공은 터널 정상을 뜻하지 않는다.**
tailscaled 프로세스끼리 주고받는 진단 프로토콜이라 **커널 라우팅도 tun 장치도 타지 않습니다.**
오늘 오판 6회가 전부 이 하나의 오독에서 파생됐습니다. 애플리케이션 TCP의 정상 여부는
**실제 TCP로만** 확인합니다.

**⑵ 원격 피어가 있어야 성립하는 검증은 자기 호출로 대체할 수 없다.**
50차 ⑦⑨가 그랬습니다. 검증표에 항목을 적을 때 **"이 경로의 어느 구간이 실제로 지나갔는가"** 를
함께 적어야 합니다. 43차 §8-⑵(검증 한계 명시)을 검증표 자체에 적용하는 것입니다.

**⑶ 양 끝에서 각각 관측한다.**
NAS 쪽 `ip route get` 한 줄이면 30분 안에 끝났을 문제를, 미니PC만 뒤지며 하루를 썼습니다.
한쪽 끝의 관측은 "도착하지 않았다"까지만 말하고 **"출발했는가"는 말하지 않습니다.**

**⑷ 0건의 원인에 "권한 범위"를 추가한다.**
`ps w` 가 root 프로세스를 못 봤습니다. 패턴·대상·도구에 이어 네 번째 종류입니다(§4-3).

**⑸ 잘린 출력으로 결론을 내지 않는다.**
⑹에서 `head -40` 으로 잘린 `Srcs` 목록을 보고 "NAS 주소 없음"으로 단정했다가, 전체를 보니
`PacketFilterRules` 가 포함하고 있었습니다. **0건 함정을 경계한다면서 같은 형태로 밟았습니다.**

---

## 7. 트랙 B 진행분 — `GET /api/v1/orders` (구현 전 중단)

### 7-1. 스키마 실측 결과 (34차 §5-3 설계문 정정)

| 34차가 응답 필드로 적은 것 | 실제 | 조치 |
|---|---|---|
| 배송비·할인 | **컬럼 없음** (`totalAmount` 단일) | 응답에서 제외 |
| 택배사·송장 | **컬럼 없음** (34차 §5-5 "선행 확인" 항목의 답) | 제외 — 52차 송장 API 때 additive |
| 취소·반품 여부 | 별도 필드 없음. `status` 로만 표현, `canceledAt` 도 없음 | 취소 시각은 `updatedAt` 근사. OpenAPI에 명기 |

**없는 값을 `null` 로 내보내면 허브가 그 키를 계약으로 받아들이고, 실제 컬럼이 생겼을 때
의미가 조용히 바뀝니다.** 그래서 키 자체를 넣지 않기로 했습니다.

### 7-2. 확정된 설계 판단

- **`OrderStatus` 는 Prisma enum** (7종: PENDING/PAID/PREPARING/SHIPPING/DONE/FAILED/CANCELED).
  `product.status` 가 제약 없는 `text` 인 것과 정반대라 **그대로 노출해도 안전**합니다.
  API 전용 상태 어휘를 새로 만들지 않습니다 — admin과 규칙이 갈라지는 것을 피합니다(34차 §5-5).
  정본은 `lib/order-status.ts` 의 `Record<OrderStatus, …>` — 상태가 늘면 tsc가 누락을 잡습니다.
- **`orderNumber` 가 `String?`** (backfill 전 null 허용). 경로 파라미터를 주문번호로 받으면
  일부 주문이 조회 불가가 됩니다. **null 건수 실측 후 결정** (미실행).
- **인덱스는 `[userId, createdAt]` 하나뿐** — `(updatedAt, id)` 커서 정렬용 없음.
  현재 주문 규모에서 불필요하고, 넣으면 마이그레이션 세션이 되어 원칙 2에 걸립니다. **이월.**
- `order_item.productId` 는 `SetNull` — 상품 삭제 시 null. 허브 재고 대조 가능 여부에 영향.

### 7-3. 🔴 신규 발견 — `@updatedAt` 은 psql UPDATE에서 갱신되지 않는다

`Order.updatedAt` 은 Prisma `@updatedAt` 이라 **Prisma 경유 변경에서만** 자동 갱신됩니다.
psql로 직접 UPDATE하면 값이 그대로 남고, **허브의 증분 조회가 그 주문을 영영 놓칩니다.**

47차처럼 운영 데이터를 psql로 손대는 일이 있는 프로젝트이므로, 코드가 아니라 **운영 규약**으로
남깁니다: `orders` 를 psql로 수정할 때는 `updated_at = now()` 를 함께 씁니다.

### 7-4. 미실행 — 다음 세션 첫 명령

```bash
psql -h localhost -U mysado -d mysado_db -P pager=off -c '\d orders' -c "SELECT status, count(*) FROM orders GROUP BY status ORDER BY 1;" -c "SELECT count(*) AS orders_total, count(order_number) AS with_number FROM orders;" -c "SELECT count(*) AS items_total, count(product_id) AS with_product FROM order_item;"
```

**`orders` 가 0건일 가능성이 있습니다**(47차에 테스트 주문 45건 삭제). 0건이면 커서·페이지네이션·
`updatedAt` 동률 처리를 검증할 데이터가 없어, 구현은 되지만 "빈 배열 200"만 확인하고 끝납니다.
**그 경우 세션 형태를 다시 정해야 합니다** — 계좌이체로 테스트 주문을 만들지, 검증 한계를
명시하고 넘길지(43차 §8-⑵).

---

## 8. 산출물

| 경로 | 내용 |
|---|---|
| `outputs/51차-NAS-hosts-설정안내-주승시스템.md` | 우승문 대표 전달용 지시서 (SSH+인증키 확정판) |
| `outputs/tailscale-policy-pre-51차.json` | 정책 편집 전 전문 (되돌리기 수단) |
| NAS `/volume1/scripts/mysado-hosts-fix.sh` | 자가복구 스크립트 |
| NAS 작업 스케줄러 ①② | 부팅 트리거 + 일간 트리거 |
| Tailscale 정책 | `tagOwners: tag:hub` (additive) |

**repo 코드 변경 0건.** 빌드·재시작·백업·마이그레이션 없음.

---

## 9. 이월 항목

### 9-1. 신규 (51차 발생)

| # | 항목 | 비고 |
|---|---|---|
| 1 | 🔴 **NAS tun 전환** | `--tun=userspace-networking` → `tailscale0`. 지시서 필요. §10-B |
| 2 | 🔴 **tun 전환 불가 시 대안 검토** | 미니PC Nginx `allow 100.64.0.0/10` → 공인 IP allow 전환. **50차 보안 설계를 되돌리는 결정**이라 별도 검토 |
| 3 | `start-stop-status` 패키지 업데이트 시 덮어써짐 | tun 전환 시 자가복구가 또 필요(hosts와 같은 성질) |
| 4 | `grants` 축소 시 `tag:hub` 규칙 필수 | §4-2 |
| 5 | `(updated_at, id)` 인덱스 | 주문 규모 증가 시 |
| 6 | `orders` psql 수정 시 `updated_at = now()` 병기 | §7-3 |
| 7 | API 키 전달 미완 | NAS 검증 성공 후 |
| 8 | Tailscale health check | `/etc/resolv.conf overwritten` (WSL 특성, 현재 무해) |

### 9-2. 기존 이월 (50차에서 승계)

- `touchLastUsedAt` 실패 무로그 / dry-run 난수 소비 / `ApiRequest` 멱등성 테이블(52차) / `error.details`
- **허브 API 나머지** — ⑤ orders 읽기(진행 중) → 동기화 로그 → 재고 SET(52차)
- 미등록 허브 SKU 10건 / Admin CSV 일괄 재고 수정
- `admin_audit_log` 47차 정리 미포함 확인
- 웹훅 두 경로 미검증 / Prisma 트랜잭션 타임아웃 5초
- 테스트 주문 정리 / **기존 `PAID` 미차감분 `cancel` 호출 금지**(43차 §5-⑶)
- `product.status` DEFAULT `'SALE'` / `layer3b-write.js` V6
- `prod-066` 투명 / 42차 절단 18건 / `라이트블루` 3건 / prod-011 오타 / prod-154 `model_name`
- Layer 3b 잔여 219건 / mysado.co.kr 301 / 소셜로그인 / `admin-guard.ts` 타입 캐스트

### 9-3. 🔴 토스 라이브 (기한 2026-08-16 — **3일 남음**)

| 항목 | 상태 |
|---|---|
| 라이브 계약 | **심사 중 (결과 미결)** |
| 8-2 조건부 재고 차감 / footer / 정책 | ✅ 완료 |
| 라이브 웹훅 실발신 수신 확인 | ⚠️ 심사 통과 전 불가 |
| 키 교체 → prod 재빌드 (`NEXT_PUBLIC_*` 빌드타임) | 계약 승인 직후 |
| 폴백 cuid 제거 / `customerMobilePhone` 010 가드 / 채번 동시성 재시도 | 계약 승인 직후 |

**심사 통과 시 8-3 묶음이 무엇보다 우선입니다.**

---

## 10. 52차 착수 후보

**A. 8-3 토스 라이브 전환 묶음** — 심사 통과 시 **최우선**. 기한 3일.
`prisma generate` 별도 선행 필수(50차 §6-4).

**B. NAS tun 전환 지시서** — 담을 것: 스크립트 백업 → 인자 교체 → **권한 문제 시 대안**
(`tailsca+` 사용자가 tun을 못 열 가능성) → 재시작 → `TUN: true` + `ip route get` 검증 →
패키지 업데이트 대비 자가복구 → 실패 시 롤백. **남의 운영 장비이므로 롤백 경로를 먼저 확정합니다.**
전환 불가 판명 시 9-1-2로 넘어갑니다.

**C. `GET /api/v1/orders`** — §7-4 psql 실측이 첫 명령. 0건이면 세션 형태 재협의.
NAS 불통과 **독립**이므로 dev 자체 검증까지는 가능하며, 허브 실연동만 B에 의존합니다.

> 권장: **A(심사 통과 시) > C > B**.
> B를 뒤로 두는 이유는 우승문 대표 일정 조율이 필요한 비동기 작업이고, C가 그동안 독립적으로
> 진행 가능하기 때문입니다. B의 지시서 작성 자체는 C와 같은 세션에서 병행할 수 있습니다.
