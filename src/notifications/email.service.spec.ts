import { Logger } from '@nestjs/common';
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

  it('logs the Brevo message id and the masked recipient, never the full address', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messageId: '<202609181733.7@smtp-relay.brevo.com>' }), { status: 201 }),
    );
    const logged: string[] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m) => void logged.push(String(m)));

    await new EmailService(config).send({ to: ['director@gmail.com'], subject: 'Код для входа в CRM', text: 't' });

    expect(logged[0]).toContain('<202609181733.7@smtp-relay.brevo.com>');
    expect(logged[0]).toContain('di***@gmail.com');
    expect(logged[0]).not.toContain('director@gmail.com');
  });

  it('sends even when Brevo answers without a usable body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('accepted', { status: 201 }));
    await expect(new EmailService(config).send({ to: ['a@b.kg'], subject: 's', text: 't' })).resolves.toBeUndefined();
  });

  it('still fails clearly when the error body is not JSON', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('bad gateway', { status: 502 }));
    await expect(new EmailService(config).send({ to: ['a@b.kg'], subject: 's', text: 't' })).rejects.toThrow('Brevo API responded with HTTP 502');
  });
});
