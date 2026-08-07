/** 로그인과 신규 가입에서 공통으로 사용하는 최소 자격 증명이다. */
export type AuthCredentials = {
  id: string;
  password: string;
};

/** 클라이언트에 노출해도 되는 현재 인증 세션 요약이다. */
export type AuthSessionInfo = {
  id: string;
  expiresAt: string;
};

/** 인증 성공 API가 반환하는 공통 응답이다. */
export type AuthSessionResponse = {
  session: AuthSessionInfo;
};

/** 클라이언트가 분기 가능한 인증 실패 코드다. */
export type AuthErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CREDENTIALS'
  | 'ID_TAKEN'
  | 'ACTIVE_ID_LIMIT'
  | 'NO_SESSION'
  | 'SESSION_EXPIRED';

/** 인증 실패 API가 반환하는 공통 오류 응답이다. */
export type AuthErrorResponse = {
  error: {
    code: AuthErrorCode;
    message: string;
  };
};
