export const CHANNELS_DELETION_PASSWORD_PORT = Symbol('CHANNELS_DELETION_PASSWORD_PORT');

/**
 * 조직 스코프 삭제 전용 비밀번호 검증에 대한 anti-corruption seam.
 *
 * 채널은 비밀번호를 저장하지도, 해시를 보지도 않는다. "이 조직에서 이 비밀번호가
 * 유효한가"만 묻고, 불일치/미설정은 예외로 돌아온다.
 */
export interface ChannelsDeletionPasswordPort {
  assertPassword(organizationId: string, password: string): Promise<void>;
}
