import { COOKIE_POLICY_RU } from './documents/cookie-policy';
import { BUYER_PD_CONSENT_RU, EMPLOYEE_PD_CONSENT_RU } from './documents/personal-data-consent';
import { PRIVACY_POLICY_RU } from './documents/privacy-policy';
import { TERMS_OF_USE_RU } from './documents/terms-of-use';

export const LEGAL_DOCUMENT_TYPES = [
  'privacy_policy',
  'terms_of_use',
  'cookie_policy',
  'personal_data_processing',
  'buyer_personal_data_consent',
] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export interface LegalDocument {
  type: LegalDocumentType;
  /** Bump on every content change; consents are tied to an exact version. */
  version: string;
  title: string;
  /** Who accepts it: users in-app, or buyers on paper via the manager. */
  audience: 'user' | 'buyer' | 'informational';
  draft: boolean;
  content: string;
}

/**
 * Versioned legal texts. DRAFTS with [ЗАПОЛНИТЬ: ...] placeholders - legal
 * owner/controller details, jurisdiction, storage location, retention and
 * legal bases are open questions (#14-26) that must not be invented.
 */
export const LEGAL_DOCUMENTS: Record<LegalDocumentType, LegalDocument> = {
  privacy_policy: {
    type: 'privacy_policy',
    version: '2026-09-17-draft1',
    title: 'Политика конфиденциальности',
    audience: 'user',
    draft: true,
    content: PRIVACY_POLICY_RU,
  },
  terms_of_use: {
    type: 'terms_of_use',
    version: '2026-09-17-draft1',
    title: 'Условия использования',
    audience: 'user',
    draft: true,
    content: TERMS_OF_USE_RU,
  },
  cookie_policy: {
    type: 'cookie_policy',
    version: '2026-09-17-draft1',
    title: 'Политика использования cookie',
    audience: 'informational',
    draft: true,
    content: COOKIE_POLICY_RU,
  },
  personal_data_processing: {
    type: 'personal_data_processing',
    version: '2026-09-17-draft1',
    title: 'Согласие сотрудника на обработку персональных данных',
    audience: 'user',
    draft: true,
    content: EMPLOYEE_PD_CONSENT_RU,
  },
  buyer_personal_data_consent: {
    type: 'buyer_personal_data_consent',
    version: '2026-09-17-draft1',
    title: 'Согласие покупателя на обработку персональных данных (форма)',
    audience: 'buyer',
    draft: true,
    content: BUYER_PD_CONSENT_RU,
  },
};

export function currentVersion(type: LegalDocumentType): string {
  return LEGAL_DOCUMENTS[type].version;
}
