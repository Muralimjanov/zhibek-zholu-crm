import { AppConfigService } from '../config/app-config.service';
import { EmailService } from './email.service';

describe('EmailService (Brevo transport)', () => {
  const config = { emailTransport: 'brevo', brevoApiKey: 'k', smtpFrom: 'CRM <no-reply@uzz.kg>' } as unknown as AppConfigService;
  afterEach(() => jest.restoreAllMocks());

  it('reports the Brevo error code and message, masking email addresses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'unauthorized', message: 'Sender someone@gmail.com is not valid' }), { status: 400 }),
    );
    await expect(new EmailService(config).send({ to: ['a@b.kg'], subject: 's', text: 't' })).rejects.toThrow(
      'Brevo API responded with HTTP 400: unauthorized - Sender <email> is not valid',
    );
  });

  it('still fails clearly when the error body is not JSON', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('bad gateway', { status: 502 }));
    await expect(new EmailService(config).send({ to: ['a@b.kg'], subject: 's', text: 't' })).rejects.toThrow('Brevo API responded with HTTP 502');
  });
});
