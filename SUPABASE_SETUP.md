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

주의: `service_role` key는 절대 GitHub나 앱 코드에 넣으면 안 됩니다.

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

## 6. GitHub Pages에 다시 배포하기

`config.js`를 수정한 뒤 GitHub에 배포하면 여러 기기에서 같은 동기화 기능을 쓸 수 있습니다.

## 7. 처음 사용하는 순서

저장 목록이 이미 있는 기기에서 먼저 합니다.

1. 개골튜브를 엽니다.
2. 이메일과 비밀번호로 회원가입 또는 로그인합니다.
3. `현재 기기 데이터 업로드`를 누릅니다.

다른 기기에서는 이렇게 합니다.

1. 같은 개골튜브 주소를 엽니다.
2. 같은 이메일과 비밀번호로 로그인합니다.
3. `클라우드 데이터 불러오기`를 누릅니다.

## 확인해야 할 것

- `config.js`에 Project URL이 들어갔는지 확인합니다.
- `config.js`에 anon public key가 들어갔는지 확인합니다.
- `service_role` key를 넣지 않았는지 확인합니다.
- Supabase SQL Editor에서 `supabase/schema.sql`을 실행했는지 확인합니다.
