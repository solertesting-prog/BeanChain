import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { AppConfig } from '../config/app-config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;
  /** Últimos correos enviados en modo consola (útil en tests). */
  readonly outbox: MailMessage[] = [];

  constructor(private readonly config: AppConfig) {
    if (config.mail.driver === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: config.mail.smtpHost,
        port: config.mail.smtpPort,
        secure: config.mail.smtpPort === 465,
        auth: config.mail.smtpUser ? { user: config.mail.smtpUser, pass: config.mail.smtpPass } : undefined,
      });
    }
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.outbox.push(message);
      if (this.outbox.length > 50) this.outbox.shift();
      if (!this.config.isTest) this.logger.log(`[correo] → ${message.to} · ${message.subject}\n${message.text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.config.mail.from, ...message });
  }

  async sendEmailVerification(to: string, name: string, token: string) {
    const link = `${this.config.appUrl}/verificar-email?token=${encodeURIComponent(token)}`;
    await this.send({
      to,
      subject: 'Confirma tu correo en BeanChain',
      text: `Hola ${name},\n\nConfirma tu correo abriendo este enlace:\n${link}\n\nSi no has creado una cuenta, ignora este mensaje.`,
    });
  }

  async sendInvestmentInstructions(to: string, details: { title: string; amount: string; reference: string; iban: string; beneficiary: string; expiresAt: Date }) {
    await this.send({
      to,
      subject: `Instrucciones de pago · ${details.title}`,
      text:
        `Has reservado una inversión en "${details.title}".\n\n` +
        `Importe: ${details.amount}\nBeneficiario: ${details.beneficiary}\nIBAN: ${details.iban}\n` +
        `Concepto (obligatorio): ${details.reference}\n\n` +
        `La reserva caduca el ${details.expiresAt.toLocaleString('es-ES')}.`,
    });
  }
}
