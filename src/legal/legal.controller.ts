import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_TYPES, LegalDocumentType } from './legal-documents';

/** Public: legal texts must be readable before login (e.g. on the login form). */
@ApiTags('legal')
@Public()
@Controller('legal/documents')
export class LegalController {
  @Get()
  list() {
    return LEGAL_DOCUMENT_TYPES.map((type) => {
      const { content: _content, ...meta } = LEGAL_DOCUMENTS[type];
      return meta;
    });
  }

  @Get(':type')
  get(@Param('type') type: string) {
    if (!(LEGAL_DOCUMENT_TYPES as readonly string[]).includes(type)) {
      throw new NotFoundException('LEGAL_DOCUMENT_NOT_FOUND');
    }
    return LEGAL_DOCUMENTS[type as LegalDocumentType];
  }
}
