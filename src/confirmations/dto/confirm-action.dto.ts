import { IsString, Length } from 'class-validator';

export class ConfirmActionDto {
  @IsString()
  @Length(4, 16)
  code!: string;
}
