import { ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { ChannelAccountException } from '../../../application/exception/channel-account.exception';
import { RegistrationTargetException } from '../../../application/exception/registration-target.exception';
import { ListingException } from '../../../application/exception/listing.exception';
import { GlobalExceptionFilter } from '../../../../common/filters/global-exception.filter';
import { ChannelBusinessError } from '../../../domain/exception/channel-business-error';

@Catch(ChannelAccountException, RegistrationTargetException, ListingException, ChannelBusinessError)
export class ChannelBusinessExceptionFilter implements ExceptionFilter {
  catch(error: ChannelAccountException | RegistrationTargetException | ListingException | ChannelBusinessError, host: ArgumentsHost) {
    if (error instanceof ChannelBusinessError) {
      const statuses = { invalid: 400, not_found: 404, conflict: 409, unsupported: 501, unavailable: 503, forbidden: 403 } as const;
      const body = Object.keys(error.details).length ? error.details : error.message;
      new GlobalExceptionFilter().catch(new HttpException(body, statuses[error.kind]), host);
      return;
    }
    const status = error.code === 'not_found' ? 404 : error.code === 'conflict' ? 409 : 400;
    new GlobalExceptionFilter().catch(new HttpException(error.message, status), host);
  }
}
