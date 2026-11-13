import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNotificationDto,
  NotificationType,
} from './dto/create-notification.dto';

// Mock PrismaService — không cần kết nối DB thật khi chạy unit test
const mockPrismaService = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a notification', async () => {
      const dto: CreateNotificationDto = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        type: NotificationType.LOW_STOCK,
        title: 'Tồn kho thấp',
        body: 'Sản phẩm X chỉ còn 5 đơn vị',
      };

      mockPrismaService.notification.create.mockResolvedValue({
        id: 1n,
        ...dto,
        isRead: false,
        createdAt: new Date(),
      });

      const result = await service.create(dto);
      expect(result.id).toBe(1n);
      expect(mockPrismaService.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('countUnread', () => {
    it('should return unread count', async () => {
      mockPrismaService.notification.count.mockResolvedValue(5);

      const count = await service.countUnread('some-user-id');
      expect(count).toBe(5);
    });
  });

  describe('markAllAsRead', () => {
    it('should update all unread notifications', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead('some-user-id');
      expect(result.count).toBe(3);
    });
  });
});
