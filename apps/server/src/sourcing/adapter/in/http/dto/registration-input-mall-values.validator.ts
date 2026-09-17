import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * 몰 등록 값은 후보 기본정보(`PATCH /candidates/:id/basic-info` → `rawData.manualBasics`)에만
 * 저장한다. 송신 전 점검과 폼 채우기가 그 문서를 읽으므로 준비 `registrationInput` 에 들어간
 * 사본은 아무도 읽지 않는 옛 값이 된다.
 */
export const CANDIDATE_ONLY_REGISTRATION_KEYS = ['mallRegisterValues', 'mallRegisterShared'] as const;

@ValidatorConstraint({ name: 'registrationInputWithoutMallRegisterValues', async: false })
export class RegistrationInputWithoutMallRegisterValues implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
    return CANDIDATE_ONLY_REGISTRATION_KEYS.every(
      (key) => !Object.prototype.hasOwnProperty.call(value, key),
    );
  }

  defaultMessage(): string {
    return 'registrationInput must not carry mallRegisterValues or mallRegisterShared; save them on the candidate basic info.';
  }
}
