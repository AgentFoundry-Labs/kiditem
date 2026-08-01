import { CronExpressionParser } from 'cron-parser';

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new Error('invalid_timezone');
  }
}

function assertFiveFieldCron(expression: string): void {
  if (expression.trim().split(/\s+/).length !== 5) {
    throw new Error('invalid_cron_expression');
  }
}

export function nextOccurrence(
  cronExpression: string,
  timeZone: string,
  currentDate: Date,
): Date {
  assertTimeZone(timeZone);
  assertFiveFieldCron(cronExpression);
  try {
    return CronExpressionParser.parse(cronExpression, {
      currentDate,
      tz: timeZone,
      // cron-parser v5 strict mode requires six fields. Operations exposes
      // conventional five-field cron and enforces that count above.
      strict: false,
    })
      .next()
      .toDate();
  } catch {
    throw new Error('invalid_cron_expression');
  }
}
