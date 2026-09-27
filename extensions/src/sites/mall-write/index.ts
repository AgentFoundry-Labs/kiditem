import { registerSite } from '../registry';
import {
  availabilityContext,
  mallAvailabilityFor,
  readAvailabilityOrThrow,
  sendPriceOrThrow,
  runAvailability,
  type AvailabilityObserved,
  type AvailabilityRunInput,
  type AvailabilitySendAnswer,
  type PriceSendAnswer,
} from './availability';
import {
  fillRegistration,
  mallThumbnailFor,
  mallWriteContext,
  mallWriterFor,
  type MallFillInput,
  type MallFillSession,
  type MallThumbnailInput,
  type MallThumbnailSession,
} from './writer';

/**
 * 몰 쓰기 라우터(KID-256). 수집기 `channels.registration`은 사이트를 하나만 선언하므로 이 사이트가 plan의 몰 키로 그 몰의
 * 쓰기 정의(`sites/<mall>/registration.ts` 등록 폼 · `availability.ts` 품절·재개·가격·읽기가 몰 키로 등록)를 찾아 준다 — 쓰기
 * 모듈이 있는 몰만(같은 등록표의 다른 사이트를 plan 값으로 부르지 못하게). 몰마다 탭을 스스로 연다(`opensOwnTabs`) — `account:`
 * 잠금이라도 브라우저 자원이 탭을 잡지 않는다.
 */
export const MALL_WRITE_SITE = 'mall-write';

export interface MallWriterHandle {
  fill?(input: MallFillInput): Promise<MallFillSession>;
  availability?(input: AvailabilityRunInput): Promise<{
    answer: AvailabilitySendAnswer;
    observed: AvailabilityObserved[];
    providerAccountId: string | null;
    observedUrl: string | null;
  }>;
  price?(input: { externalListingId: string; price: number }): Promise<PriceSendAnswer>;
  thumbnail?(input: MallThumbnailInput): Promise<MallThumbnailSession>;
}

registerSite({
  name: MALL_WRITE_SITE,
  opensOwnTabs: true,
  create: (deps, lease) => ({
    writer(mallKey: string): MallWriterHandle | null {
      const definition = mallWriterFor(mallKey);
      const availability = mallAvailabilityFor(mallKey);
      if (!definition && !availability) return null;
      const handle: MallWriterHandle = {};
      if (definition) {
        const context = mallWriteContext(definition, deps, lease);
        handle.fill = (input) => fillRegistration(definition, context, input);
        const thumbnail = mallThumbnailFor(mallKey);
        if (thumbnail) handle.thumbnail = (input) => thumbnail(context, input);
      }
      if (availability) {
        const context = availabilityContext(availability, deps, lease);
        handle.availability = (input) => runAvailability(availability, context, input);
        if (availability.sendPrice) handle.price = (input) => sendPriceOrThrow(availability, context, input);
      }
      return handle;
    },
    /** 판매 상태 읽기(`channels.mall_availability_read`) — 읽기가 있는 몰만. */
    reader(mallKey: string) {
      const availability = mallAvailabilityFor(mallKey);
      if (!availability?.read) return null;
      const context = availabilityContext(availability, deps, lease);
      return { read: (codes: string[]) => readAvailabilityOrThrow(availability, context, codes) };
    },
  }),
});
