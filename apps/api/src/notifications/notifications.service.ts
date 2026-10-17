import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(n: NewNotification) {
    return this.prisma.notification.create({ data: n });
  }

  createMany(items: NewNotification[]) {
    if (items.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.notification.createMany({ data: items });
  }

  async list(userId: string, onlyUnread = false) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(onlyUnread ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notificación no encontrada');
    return this.prisma.notification.update({ where: { id }, data: { readAt: n.readAt ?? new Date() } });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}
