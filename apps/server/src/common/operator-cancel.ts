/**
 * An operator stopping a running collection from a screen (KID-147).
 *
 * The stop carries no attempt token: the browser that opened the attempt may be
 * gone. Each source owner ends the attempt inside its own lock and terminal
 * path with this failure, so its side effects match an extension-reported
 * cancellation. `SourceFailureAlerts` records nothing for a `*_CANCELLED` code,
 * and the owner's RUNNING check admits the next begin at once.
 */
export const OPERATOR_CANCEL_CODE = 'USER_CANCELLED';
export const OPERATOR_CANCEL_MESSAGE = '운영자가 수집을 중단했습니다.';
