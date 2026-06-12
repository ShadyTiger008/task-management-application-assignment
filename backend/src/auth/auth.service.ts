import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto, LoginDto } from './auth.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async signup(dto: SignupDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        password: hashedPassword,
      },
    });

    const tokens = await this.generateTokens(user.id);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      ...tokens,
    };
  }

  async logout(userId: string, accessToken: string, refreshToken?: string) {
    // Delete the specific access token session
    await this.prisma.userToken.deleteMany({
      where: {
        userId,
        token: accessToken,
      },
    });

    // Delete specific refresh token if provided
    if (refreshToken) {
      await this.prisma.userRefreshToken.deleteMany({
        where: {
          userId,
          token: refreshToken,
        },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    // Delete all tokens for this user
    await this.prisma.userToken.deleteMany({
      where: { userId },
    });
    await this.prisma.userRefreshToken.deleteMany({
      where: { userId },
    });

    return { message: 'Logged out from all devices successfully' };
  }

  async refreshToken(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = payload.sub;

    const dbRefreshToken = await this.prisma.userRefreshToken.findFirst({
      where: {
        userId,
        token: refreshToken,
      },
    });

    if (!dbRefreshToken) {
      throw new UnauthorizedException('Refresh token not found or already revoked');
    }

    if (new Date() > new Date(dbRefreshToken.expiresAt)) {
      // Clean up expired refresh token
      await this.prisma.userRefreshToken.delete({
        where: { id: dbRefreshToken.id },
      });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Generate new access token ONLY (Mitigate concurrent request race condition)
    const accessToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    // Clean up expired access tokens (older than 1 hour) before saving new one
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await this.prisma.userToken.deleteMany({
      where: {
        userId,
        createdAt: { lt: oneHourAgo },
      },
    });

    // Save new access token
    await this.prisma.userToken.create({
      data: {
        userId,
        token: accessToken,
      },
    });

    return {
      accessToken,
      refreshToken, // return the same refresh token
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, name: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }

  async generateAvatar(userId: string) {
    const accessKey = this.configService.get<string>('UNSPLASH_ACCESS_KEY');
    let avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}-${Date.now()}`;

    if (accessKey) {
      try {
        const response = await fetch(
          'https://api.unsplash.com/photos/random?query=portrait,face,avatar&orientation=squarish',
          {
            headers: {
              Authorization: `Client-ID ${accessKey}`,
            },
          },
        );

        if (response.ok) {
          const data = (await response.json()) as any;
          const imageUrl = data?.urls?.small || data?.urls?.regular;
          if (imageUrl) {
            avatarUrl = imageUrl;
          }
        } else {
          console.error(
            'Unsplash API error:',
            response.status,
            await response.text(),
          );
        }
      } catch (err) {
        console.error('Failed to fetch from Unsplash:', err);
      }
    } else {
      console.warn('UNSPLASH_ACCESS_KEY is not configured, using fallback');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { avatarUrl: user.avatarUrl };
  }

  private async generateTokens(userId: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    // Clean up expired access tokens (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await this.prisma.userToken.deleteMany({
      where: {
        userId,
        createdAt: { lt: oneHourAgo },
      },
    });

    // Save tokens in database
    await this.prisma.userToken.create({
      data: {
        userId,
        token: accessToken,
      },
    });

    await this.prisma.userRefreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
