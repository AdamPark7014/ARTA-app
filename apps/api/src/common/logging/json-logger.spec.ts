import { JsonLogger } from './json-logger';

describe('JsonLogger', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    jest.restoreAllMocks();
  });

  it('emits JSON lines when LOG_FORMAT=json', () => {
    process.env.LOG_FORMAT = 'json';
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new JsonLogger('Test');
    logger.log('hello');
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(String(spy.mock.calls[0][0]));
    expect(payload).toMatchObject({
      level: 'info',
      service: 'arta-api',
      context: 'Test',
      msg: 'hello',
    });
    expect(payload.ts).toBeTruthy();
  });
});
