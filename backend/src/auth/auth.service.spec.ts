import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    userToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    userRefreshToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  describe('signup', () => {
    it('should successfully sign up a new user and return tokens', async () => {
      const dto = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };

      // Mock user not existing
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // Mock user creation
      const createdUser = {
        id: 'user-uuid',
        name: dto.name,
        email: dto.email,
        password: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.user.create.mockResolvedValue(createdUser);

      const result = await service.signup(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email.toLowerCase().trim() },
      });
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.user.email).toBe(dto.email.toLowerCase().trim());
      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
    });

    it('should throw ConflictException if email already exists', async () => {
      const dto = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };

      // Mock user already existing
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.signup(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should successfully log in and return tokens for valid credentials', async () => {
      const dto = {
        email: 'john@example.com',
        password: 'password123',
      };

      const hashedPassword = await bcrypt.hash(dto.password, 10);
      const user = {
        id: 'user-uuid',
        name: 'John Doe',
        email: dto.email,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.login(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email.toLowerCase().trim() },
      });
      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(result.user.email).toBe(dto.email);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const dto = {
        email: 'john@example.com',
        password: 'wrongpassword',
      };

      const hashedPassword = await bcrypt.hash('password123', 10);
      const user = {
        id: 'user-uuid',
        name: 'John Doe',
        email: dto.email,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });
});
