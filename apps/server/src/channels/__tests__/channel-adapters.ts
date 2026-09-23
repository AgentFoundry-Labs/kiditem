import { ChannelAdapterRegistryAdapter } from '../adapter/out/channel/channel-adapter-registry.adapter';
import { CoupangChannelAdapter } from '../adapter/out/channel/coupang/coupang-channel.adapter';
import type { ChannelRegistrationPort } from '../application/port/in/registration/channel-registration.port';
import type { RepresentativeImageRunnerPort } from '../application/port/out/automation/representative-image-runner.port';

/** 대표이미지 runner 는 개발 서버 Playwriter — 테스트에서 부르면 실패한다. */
const UNUSED_RUNNER: RepresentativeImageRunnerPort = {
  isBlocked: () => true,
  upload: () => Promise.reject(new Error('representative image runner is not part of this test')),
};

/**
 * 실제 채널 어댑터 registry(KID-321). 셀피아 사전검사는 쿠팡 등록 준비만 부른다 — 그 경로를 쓰지 않는 테스트는
 * 넘기지 않고, 부르면 실패한다.
 */
export function channelAdapters(input: {
  registration?: Pick<ChannelRegistrationPort, 'preflightExternalProductRegistration'>;
  runner?: RepresentativeImageRunnerPort;
} = {}): ChannelAdapterRegistryAdapter {
  const registration = input.registration ?? {
    preflightExternalProductRegistration: () => Promise.reject(new Error('Sellpia preflight is not part of this test')),
  };
  return new ChannelAdapterRegistryAdapter(new CoupangChannelAdapter(registration, input.runner ?? UNUSED_RUNNER));
}
