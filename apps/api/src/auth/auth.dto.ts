import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Correo no válido' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contraseña debe incluir mayúsculas, minúsculas y números',
  })
  password: string;

  @IsString()
  @Length(1, 80)
  firstName: string;

  @IsString()
  @Length(1, 120)
  lastName: string;

  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'País en formato ISO de 2 letras' })
  country: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsBoolean()
  acceptTerms: boolean;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(200)
  refreshToken: string;
}

export class VerifyEmailDto {
  @IsString()
  @MaxLength(200)
  token: string;
}

export class MfaCodeDto {
  @IsString()
  @Length(6, 6)
  code: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contraseña debe incluir mayúsculas, minúsculas y números',
  })
  newPassword: string;
}
