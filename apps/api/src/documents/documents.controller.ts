import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentType, DocumentVisibility } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { DocumentsService, MAX_UPLOAD_BYTES } from './documents.service';

class UploadDocumentDto {
  @IsEnum(DocumentType) type: DocumentType;
  @IsString() @Length(2, 160) title: string;
  @IsOptional() @IsEnum(DocumentVisibility) visibility?: DocumentVisibility;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() farmId?: string;
  @IsOptional() @IsString() harvestUpdateId?: string;
}

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Roles('ADMIN', 'OPERATOR')
  @Post('admin/documents')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documents.upload(user.id, file, dto);
  }

  @Roles('ADMIN')
  @Delete('admin/documents/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.remove(user.id, id);
  }

  @Public()
  @Get('documents/:id/download')
  async download(@Param('id') id: string, @Res() res: Response, @CurrentUser() user?: AuthUser) {
    const { doc, body } = await this.documents.download(id, user);
    const safeName = doc.fileName.replace(/[^\w.\- ]/g, '_');
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Length', body.length);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('X-Content-SHA256', doc.sha256);
    res.setHeader('Cache-Control', doc.visibility === 'PUBLIC' ? 'public, max-age=3600' : 'private, no-store');
    res.end(body);
  }

  /** Verificación pública: cualquiera puede comprobar si un fichero es auténtico. */
  @Public()
  @Get('documents/verify/:sha256')
  verify(@Param('sha256') sha256: string) {
    return this.documents.verify(sha256);
  }
}
