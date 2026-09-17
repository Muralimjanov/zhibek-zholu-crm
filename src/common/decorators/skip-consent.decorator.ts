import { SetMetadata } from '@nestjs/common';

export const SKIP_CONSENT_KEY = 'skipConsent';

/**
 * Route stays usable before the user has accepted the required legal
 * documents (login/session, reading/accepting the documents, own profile).
 */
export const SkipConsent = () => SetMetadata(SKIP_CONSENT_KEY, true);
