# Supabase 동기화 연결 방법

이 앱은 Supabase 동기화 코드가 이미 들어있습니다.
지금 필요한 것은 Supabase에서 만든 프로젝트의 연결값을 `config.js`에 넣는 것입니다.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에 들어갑니다.
2. 로그인합니다.
3. `New project`를 누릅니다.
4. 프로젝트 이름은 예를 들어 `gaegol-tube`로 만듭니다.
5. Database Password는 따로 저장해 둡니다.
6. Region은 가능한 가까운 지역을 고릅니다.

## 2. 이메일 로그인 켜기

Supabase 왼쪽 메뉴에서 다음으로 이동합니다.

```text
Authentication > Providers > Email
```

Email 로그인이 켜져 있으면 됩니다.

처음 테스트할 때는 앱의 `allowSignup`을 `true`로 두면 앱 화면에서 바로 회원가입할 수 있습니다.
혼자만 쓸 계정을 만든 뒤에는 `allowSignup`을 `false`로 바꾸는 것이 좋습니다.

중요: `allowSignup: false`는 개골튜브 화면에서 회원가입 버튼을 숨기는 앱 UI 설정일 뿐입니다.
실제로 새 사용자의 공개 회원가입을 막으려면 Supabase의 `Authentication` 설정에서 신규 가입을 꺼야 합니다.

## 3. 저장 테이블 만들기

Supabase 왼쪽 메뉴에서 다음으로 이동합니다.

```text
SQL Editor
```

그리고 이 저장소의 아래 파일 내용을 전부 복사해서 실행합니다.

```text
supabase/schema.sql
```

이 SQL은 `tube_vault_states`라는 저장 공간을 만들고, 로그인한 본인 데이터만 읽고 쓰게 보호합니다.
RLS가 꺼져 있으면 anon/public key로도 데이터가 위험해질 수 있으므로 이 단계는 반드시 해야 합니다.
최신 SQL은 RLS를 강제로 적용하고, 로그인하지 않은 `anon` 역할의 테이블 권한을 회수하며, 저장 데이터가 JSON 객체인지도 검사합니다. 예전에 한 번 실행했더라도 이 저장소의 최신 `schema.sql`을 다시 실행해 주세요.

## 4. Project URL과 anon public key 복사하기

Supabase 왼쪽 메뉴에서 다음으로 이동합니다.

```text
Project Settings > API
```

아래 두 값을 복사합니다.

```text
Project URL
anon public key
```

`anon public key`는 브라우저 앱에 들어갈 수 있는 공개 키입니다.
하지만 공개 키라고 해서 RLS 없이 안전한 것은 아닙니다.

주의: `service_role` key 또는 secret key는 절대 GitHub, `config.js`, 브라우저 코드에 넣으면 안 됩니다.

## 5. config.js 수정하기

`config.js`를 아래처럼 바꿉니다.

```js
window.TUBE_VAULT_CONFIG = {
  syncEnabled: true,
  supabaseUrl: "여기에 Project URL",
  supabaseAnonKey: "여기에 anon public key",
  allowSignup: true
};
```

처음 연결 테스트가 끝나고 계정을 만들었다면, 원하면 나중에 이렇게 바꿀 수 있습니다.

```js
allowSignup: false
```

이 저장소의 CSP는 현재 Supabase 프로젝트 주소만 연결하도록 제한되어 있습니다. 나중에 다른 Supabase 프로젝트로 바꾸면 `index.html`의 `Content-Security-Policy` 안 `connect-src`에 있는 HTTPS 주소와 WSS 주소도 새 Project URL에 맞춰 함께 바꿔야 합니다.

## 6. GitHub Pages에 다시 배포하기

`config.js`를 수정한 뒤 GitHub에 배포하면 여러 기기에서 같은 동기화 기능을 쓸 수 있습니다.

## 7. 처음 사용하는 순서

저장 목록이 이미 있는 기기에서 먼저 합니다.

1. 개골튜브를 엽니다.
2. 이메일과 비밀번호로 회원가입 또는 로그인합니다.
3. `지금 동기화`를 누릅니다. 이 기기 목록과 클라우드를 비교해 필요한 방향을 자동 선택합니다.

다른 기기에서는 이렇게 합니다.

1. 같은 개골튜브 주소를 엽니다.
2. 같은 이메일과 비밀번호로 로그인합니다.
3. `지금 동기화`를 누릅니다.

`지금 동기화`는 한쪽만 바뀌었으면 그 변경을 적용하고, 양쪽이 모두 바뀌었으면 항목을 합칩니다. 같은 영상은 더 최근 수정본을 사용합니다. 첫 동기화 뒤 이 기기에서 저장한 변경은 잠시 후 클라우드에 자동 저장되지만, 이미 열려 있는 다른 기기에 새 변경을 표시하려면 그 기기에서 `지금 동기화`를 누르세요. 상시 웹소켓 방식의 실시간 동기화는 아닙니다. 검색어와 필터 같은 화면 상태는 기기별로 유지되고, 목록·카테고리·분류 칸만 클라우드에 동기화됩니다.

방향을 직접 지정해야 할 때만 `고급 동기화 도구`를 펼쳐 수동 불러오기, 업로드 또는 병합을 사용하세요.

## 확인해야 할 것

- `config.js`에 Project URL이 들어갔는지 확인합니다.
- `config.js`에 anon public key가 들어갔는지 확인합니다.
- `service_role` key 또는 secret key를 넣지 않았는지 확인합니다.
- Supabase SQL Editor에서 `supabase/schema.sql`을 실행했는지 확인합니다.
- Supabase Authentication 설정에서 공개 회원가입을 원하는 상태로 껐는지 확인합니다.

## RLS 설정 확인 SQL

Supabase SQL Editor에서 아래 쿼리를 실행해 RLS가 켜져 있고 정책이 만들어졌는지 확인할 수 있습니다.

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'tube_vault_states';

select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'tube_vault_states';
```

## localStorage 주의사항

localStorage는 이 기기의 브라우저 저장공간입니다. 공용 PC, 다른 사람이 접근할 수 있는 기기, 업무상 민감한 메모 저장에는 주의하세요.
비밀번호, 개인 토큰, 주민번호, 내부자료 링크는 저장하지 마세요.
